import { webhookCallback } from 'grammy';
import { boundedText, Failure, requireConfig, type Env } from '../runtime/config';
import { equal } from '../runtime/crypto';
import { createBot } from './client';
import { encryptionKey } from './config';
import { normalize, type TelegramEvent } from './normalize';

export async function receiveTelegram(request:Request,env:Env,acceptedAt=Date.now(),schedule?:(event:TelegramEvent,at:number)=>void) {
  if(request.method!=='POST') return new Response(null,{status:405,headers:{Allow:'POST'}});
  requireConfig(env,['TELEGRAM_WEBHOOK_SECRET']);
  if(!/^[A-Za-z0-9_-]{1,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET)) throw new Failure('invalid_webhook_configuration');
  if(!equal(request.headers.get('X-Telegram-Bot-Api-Secret-Token')??'',env.TELEGRAM_WEBHOOK_SECRET))
    return Response.json({error:'unauthorized'},{status:403});
  let raw:string,value:unknown;
  try {raw=await boundedText(request,262144);value=JSON.parse(raw);}
  catch(e) {return Response.json({error:'invalid_update'},{status:e instanceof Failure && e.category==='body_too_large'?413:400});}
  // Construct with configured bot info: neither this nor normalization calls getMe.
  const bot=createBot(env);
  let event:TelegramEvent|null;
  try {event=normalize(value,env);}
  catch {return Response.json({error:'invalid_update'},{status:400});}
  if(!event) return new Response('OK');
  requireConfig(env,['DB','OWNER_USER_ID','SUBSCRIPTION_ENCRYPTION_KEY','CALLBACK_ALLOWED_ORIGINS']);
  encryptionKey(env);
  if(env.SITES_IDENTITY_VERIFIED!=='true' || !schedule) throw new Failure('background_unavailable');
  bot.use(()=>{ schedule(event!,acceptedAt); });
  // The Worker adapter owns the acknowledgment. Timeout is disabled because the
  // only middleware schedules tracked work synchronously, and must finish first.
  const handler=webhookCallback(bot,'cloudflare-mod',{timeoutMilliseconds:Infinity});
  return handler(new Request(request.url,{method:'POST',headers:request.headers,body:raw}));
}
