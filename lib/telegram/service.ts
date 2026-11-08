import { GrammyError } from 'grammy';
import type { ReactionTypeEmoji } from 'grammy/types';
import { z } from 'zod';
import { Failure, type Env } from '../runtime/config';
import { binding, botInfoSchema, decimalId, encryptionKey, numericId } from './config';
import { createBot, type TelegramFetch } from './client';
import { eventNames, messageId } from './normalize';
import { issueReference, readReference } from './message-reference';

// Telegram counts Unicode characters, not UTF-16 code units. Reject unpaired
// surrogates, whose replacement during transport would change supplied text.
export const textSchema=z.string().min(1).max(8192).refine(s=>Array.from(s).length<=4096 && s.isWellFormed(), 'Use 1–4096 Unicode characters').meta({maxLength:4096});
export const sendSchema=z.object({text:textSchema,reply_to_message_id:messageId.optional()}).strict();
export const targetSchema=z.object({message_reference:z.string().min(1).max(2048)}).strict();
export const editSchema=targetSchema.extend({text:textSchema}).strict();
export const reactionEmoji=z.enum(['👍','👎','❤','🔥','🥰','👏','😁','🤔','🤯','😱','🤬','😢','🎉','🤩','🤮','💩','🙏','👌','🕊','🤡','🥱','🥴','😍','🐳','❤‍🔥','🌚','🌭','💯','🤣','⚡','🍌','🏆','💔','🤨','😐','🍓','🍾','💋','🖕','😈','😴','😭','🤓','👻','👨‍💻','👀','🎃','🙈','😇','😨','🤝','✍','🤗','🫡','🎅','🎄','☃','💅','🤪','🗿','🆒','💘','🙉','🦄','😘','💊','🙊','😎','👾','🤷‍♂','🤷','🤷‍♀','😡']);
export const reactionSchema=z.object({message_id:messageId,emoji:reactionEmoji.nullable()}).strict();
export const sentSchema=z.object({message_id:messageId,chat_id:decimalId,sent_at:z.iso.datetime(),reply_to_message_id:messageId.nullable(),message_reference:z.string()}).strict();
export const targetResultSchema=z.object({message_id:messageId,chat_id:decimalId,confirmed:z.literal(true)}).strict();
export const reactionResultSchema=targetResultSchema.extend({emoji:reactionEmoji.nullable()}).strict();
export const connectionSchema=z.object({bot_id:decimalId,bot_username:z.string(),owner_user_id:decimalId,tools:z.array(z.string()),event_types:z.array(z.string()),replay:z.literal(false),history:z.literal(false),delivery:z.string()}).strict();
export const toolNames=['telegram_get_connection_info','telegram_send_message','telegram_edit_message','telegram_delete_message','telegram_set_reaction'] as const;
const confirmedMessage=z.object({message_id:messageId,date:z.number().int().positive().max(253402300799),
  from:z.object({id:numericId,is_bot:z.literal(true)}),chat:z.object({id:numericId,type:z.literal('private')}),text:z.string(),
  reply_to_message:z.object({message_id:messageId}).optional()});

export class TelegramService {
  private bot;
  constructor(private env:Env,deadline=Infinity,transport?:TelegramFetch) { this.bot=createBot(env,deadline,transport); }
  private async call<T>(operation:()=>Promise<T>,write=false):Promise<T> {
    try { return await operation(); }
    catch(e) {
      if(e instanceof GrammyError) {
        const code=e.error_code;
        throw new Failure(code===429?'rate_limited':code===401?'installation_revoked':code===403?'telegram_forbidden':code>=500?(write?'ambiguous_write':'telegram_unavailable'):'telegram_rejected',e.parameters.retry_after);
      }
      throw new Failure(write?'ambiguous_write':'telegram_unavailable');
    }
  }
  async identity() {
    const raw=await this.call(()=>this.bot.api.getMe());
    const checked=botInfoSchema.safeParse(raw), {botId,ownerId}=binding(this.env);
    if(!checked.success || String(checked.data.id)!==botId) throw new Failure('installation_mismatch');
    return {bot_id:botId,bot_username:checked.data.username,owner_user_id:ownerId};
  }
  async connection() { return {...await this.identity(),tools:[...toolNames],event_types:[...eventNames],replay:false as const,history:false as const,
    delivery:'Bounded request waitUntil; no replay. Callback receipt is not Dot completion.'}; }
  private confirmed(raw:unknown,text:string,target?:number) {
    const parsed=confirmedMessage.safeParse(raw), {botId,ownerId}=binding(this.env);
    if(!parsed.success || String(parsed.data.from.id)!==botId || String(parsed.data.chat.id)!==ownerId || parsed.data.text!==text ||
      (target!==undefined && parsed.data.message_id!==target)) throw new Failure('ambiguous_write');
    return parsed.data;
  }
  async send(value:unknown,principal:string) {
    const input=sendSchema.parse(value);
    if(principal!==this.env.OWNER_USER_ID) throw new Failure('unauthorized');
    encryptionKey(this.env); // Detect invalid signing configuration before sending.
    await this.identity();
    const {ownerId}=binding(this.env);
    const raw=await this.call(()=>this.bot.api.sendMessage(Number(ownerId),input.text,
      input.reply_to_message_id?{reply_parameters:{message_id:input.reply_to_message_id,allow_sending_without_reply:false}}:{}),true);
    const message=this.confirmed(raw,input.text);
    if(input.reply_to_message_id!==undefined && message.reply_to_message?.message_id!==input.reply_to_message_id) throw new Failure('ambiguous_write');
    const sentAt=new Date(message.date*1000).toISOString();
    return {message_id:message.message_id,chat_id:ownerId,sent_at:sentAt,reply_to_message_id:message.reply_to_message?.message_id??null,
      message_reference:issueReference(this.env,principal,message.message_id,sentAt)};
  }
  async edit(value:unknown,principal:string) {
    const input=editSchema.parse(value), ref=readReference(this.env,principal,input.message_reference);
    await this.identity();
    const raw=await this.call(()=>this.bot.api.editMessageText(Number(ref.chat_id),ref.message_id,input.text),true);
    this.confirmed(raw,input.text,ref.message_id);
    return {message_id:ref.message_id,chat_id:ref.chat_id,confirmed:true as const};
  }
  async delete(value:unknown,principal:string) {
    const input=targetSchema.parse(value), ref=readReference(this.env,principal,input.message_reference);
    await this.identity();
    const result=await this.call(()=>this.bot.api.deleteMessage(Number(ref.chat_id),ref.message_id),true);
    if(result!==true) throw new Failure('ambiguous_write');
    return {message_id:ref.message_id,chat_id:ref.chat_id,confirmed:true as const};
  }
  async reaction(value:unknown) {
    const input=reactionSchema.parse(value), {ownerId}=binding(this.env);
    await this.identity();
    const result=await this.call(()=>this.bot.api.setMessageReaction(Number(ownerId),input.message_id,
      input.emoji===null?[]:[{type:'emoji',emoji:input.emoji as ReactionTypeEmoji['emoji']}]),true);
    if(result!==true) throw new Failure('ambiguous_write');
    return {message_id:input.message_id,chat_id:ownerId,confirmed:true as const,emoji:input.emoji};
  }
  async typing() {
    await this.identity();
    const {ownerId}=binding(this.env);
    await this.call(()=>this.bot.api.sendChatAction(Number(ownerId),'typing'),true);
  }
}
