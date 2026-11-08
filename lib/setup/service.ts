import { Api, GrammyError } from 'grammy';
import { z } from 'zod';
import { Failure, owner, requireConfig, type Env } from '../runtime/config';
import { botInfoSchema, encryptionKey, numericId, telegramConfig } from '../telegram/config';
import { telegramClientOptions, type TelegramFetch } from '../telegram/client';
import { callbackUrl } from '../events/callback';

export const emptySetupArgs = z.object({}).strict();
export const nonceArgs = z.object({nonce:z.string().regex(/^dotagram-verify-[0-9a-f]{32}$/)}).strict();
export type BotInfo = z.infer<typeof botInfoSchema>;
export type WebhookState = 'absent' | 'matching' | 'settings_conflict' | 'another_destination';
export type SetupResult =
  | {status:'inspected';bot_info:BotInfo;webhook:WebhookState}
  | {status:'candidate';bot_info:BotInfo;candidate_user_id:string}
  | {status:'no_match'|'ambiguous'|'incomplete'|'owner_configured'|'webhook_exists'}
  | {status:'registered'|'already_configured'|'conflict'|'uncertain'}
  | {status:'error';error:string};

const webhookSchema = z.object({url:z.string(),max_connections:z.number().int().optional(),allowed_updates:z.array(z.string()).optional(),has_custom_certificate:z.boolean()});
const nonceMessage = z.object({message:z.object({
  text:z.string(), from:z.object({id:numericId,is_bot:z.literal(false)}),
  chat:z.object({id:numericId,type:z.literal('private')}),
  business_connection_id:z.never().optional(),sender_business_bot:z.never().optional(),sender_chat:z.never().optional(),
  message_thread_id:z.never().optional(),is_topic_message:z.literal(false).optional(),direct_messages_topic:z.never().optional(),is_paid_post:z.literal(false).optional(),
})});

export function authorizeSetup(env:Env, principal:string|null) {
  return owner(new Request('https://dotagram.invalid/setup',{headers:principal?{'oai-authenticated-user-id':principal}:{}}),env);
}

// A narrow facade: no caller can select an arbitrary Telegram API method.
class BootstrapApi {
  private api:Api;
  constructor(token:string,private deadline:number,transport?:TelegramFetch) {
    this.api=new Api(token,telegramClientOptions(deadline,transport));
  }
  private async call<T>(operation:()=>Promise<T>,write=false):Promise<T> {
    if(Date.now()>=this.deadline) throw new Failure('execution_deadline');
    try {return await operation();}
    catch(error) {
      if(error instanceof GrammyError && error.error_code<500) {
        throw new Failure(error.error_code===401?'installation_revoked':error.error_code===429?'rate_limited':'telegram_rejected');
      }
      throw new Failure(write?'uncertain':'telegram_unavailable');
    }
  }
  getMe(){return this.call(()=>this.api.getMe());}
  getWebhookInfo(){return this.call(()=>this.api.getWebhookInfo());}
  getUpdates(){return this.call(()=>this.api.getUpdates({timeout:0,limit:100}));}
  setWebhook(url:string,secret:string){return this.call(()=>this.api.setWebhook(url,{
    secret_token:secret,allowed_updates:['message','edited_message'],max_connections:1,drop_pending_updates:false,
  }),true);}
}

export class SetupService {
  private api:BootstrapApi;
  constructor(private env:Env,private webhookUrl:string,deadline:number,transport?:TelegramFetch) {
    requireConfig(env,['TELEGRAM_BOT_TOKEN']);
    if(!/^[1-9][0-9]*:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN)) throw new Failure('invalid_telegram_configuration');
    this.api=new BootstrapApi(env.TELEGRAM_BOT_TOKEN,deadline,transport);
  }
  private async identity() {
    const parsed=botInfoSchema.safeParse(await this.api.getMe());
    if(!parsed.success || String(parsed.data.id)!==this.env.TELEGRAM_BOT_TOKEN.split(':')[0]) throw new Failure('installation_mismatch');
    if(this.env.TELEGRAM_BOT_INFO) {
      let configured:BotInfo;
      try {configured=botInfoSchema.parse(JSON.parse(this.env.TELEGRAM_BOT_INFO));} catch {throw new Failure('invalid_telegram_configuration');}
      if(configured.id!==parsed.data.id) throw new Failure('installation_mismatch');
    }
    return parsed.data;
  }
  private async webhook():Promise<WebhookState> {
    const parsed=webhookSchema.safeParse(await this.api.getWebhookInfo());
    if(!parsed.success) throw new Failure('telegram_response_invalid');
    const info=parsed.data;
    if(!info.url) return 'absent';
    if(info.url!==this.webhookUrl) return 'another_destination';
    return !info.has_custom_certificate && info.max_connections===1 && info.allowed_updates?.length===2 &&
      info.allowed_updates.includes('message') && info.allowed_updates.includes('edited_message')?'matching':'settings_conflict';
  }
  async inspect():Promise<SetupResult> {
    const bot_info=await this.identity();
    return {status:'inspected',bot_info,webhook:await this.webhook()};
  }
  async verify(nonce:string):Promise<SetupResult> {
    if(this.env.TELEGRAM_OWNER_USER_ID) return {status:'owner_configured'};
    const bot_info=await this.identity();
    if(await this.webhook()!=='absent') return {status:'webhook_exists'};
    const updates=await this.api.getUpdates();
    if(!Array.isArray(updates)) throw new Failure('telegram_response_invalid');
    if(updates.length>=100) return {status:'incomplete'};
    const matches=updates.flatMap(update=>{
      const parsed=nonceMessage.safeParse(update);
      if(!parsed.success) return [];
      const m=parsed.data.message;
      return m.text===nonce && m.from.id===m.chat.id?[String(m.from.id)]:[];
    });
    if(!matches.length) return {status:'no_match'};
    if(matches.length!==1) return {status:'ambiguous'};
    return {status:'candidate',bot_info,candidate_user_id:matches[0]};
  }
  async register():Promise<SetupResult> {
    requireConfig(this.env,['DB','TELEGRAM_WEBHOOK_SECRET','CALLBACK_ALLOWED_ORIGINS']);
    telegramConfig(this.env);encryptionKey(this.env);
    if(!/^[A-Za-z0-9_-]{1,256}$/.test(this.env.TELEGRAM_WEBHOOK_SECRET)) throw new Failure('invalid_webhook_secret');
    const origins=this.env.CALLBACK_ALLOWED_ORIGINS.split(',').map(s=>s.trim());
    for(const origin of origins) {
      try {if(new URL(origin).origin!==origin) throw new Error();callbackUrl(origin,origin);} catch {throw new Failure('callback_policy_unconfigured');}
    }
    const bot=await this.identity(),state=await this.webhook();
    if(state==='matching') return {status:'already_configured'};
    if(state!=='absent') return {status:'conflict'};
    if(bot.can_join_groups || bot.supports_inline_queries || bot.can_connect_to_business ||
      bot.has_topics_enabled || bot.allows_users_to_create_topics)
      throw new Failure('bot_features_incompatible');
    try {
      if(await this.api.setWebhook(this.webhookUrl,this.env.TELEGRAM_WEBHOOK_SECRET)!==true) return {status:'uncertain'};
    } catch(error) {
      if(error instanceof Failure && error.category==='uncertain') return {status:'uncertain'};
      throw error;
    }
    try {return {status:await this.webhook()==='matching'?'registered':'uncertain'};}
    catch {return {status:'uncertain'};}
  }
}

export async function runSetupAction(operation:'inspect'|'verify'|'register',args:unknown,env:Env,principal:string|null,
  webhookUrl:()=>string,transport?:TelegramFetch):Promise<SetupResult> {
  const deadline=Date.now()+25_000;
  try {
    authorizeSetup(env,principal);
    const input=operation==='verify'?nonceArgs.safeParse(args):emptySetupArgs.safeParse(args);
    if(!input.success) return {status:'error',error:'invalid_arguments'};
    const service=new SetupService(env,webhookUrl(),deadline,transport);
    return await (operation==='inspect'?service.inspect():operation==='register'?service.register():service.verify((input.data as {nonce:string}).nonce));
  } catch(error) {
    // Only our own fixed categories cross the action boundary. Never serialize
    // an upstream exception, request, URL, payload, or error description.
    return {status:'error',error:error instanceof Failure?error.category:'setup_failed'};
  }
}
