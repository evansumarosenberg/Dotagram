import { z } from 'zod';
import { filterSchema } from '../telegram/normalize';
import { binding, encryptionKey } from '../telegram/config';
import { Failure, requireConfig, type Env } from '../runtime/config';
import { canonical, encrypt, hash } from '../runtime/crypto';
import { cleanup, type Subscription } from '../storage';
import { CallbackClient, validateSecret } from './callback';
import { TelegramService } from '../telegram/service';

const SUBSCRIPTION_LIFETIME_MS = 72 * 60 * 60 * 1000;

const subscribeFields={
  delivery:z.object({mode:z.literal('webhook'),url:z.string().url().max(2048),secret:z.string().max(100)}).strict(),
  cursor:z.null().optional(), ttlMs:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  _meta:z.record(z.string(),z.unknown()).optional()};
export const subscribeSchema=z.discriminatedUnion('name',[
  z.object({...subscribeFields,name:z.literal('telegram.message.created'),arguments:filterSchema}).strict(),
  z.object({...subscribeFields,name:z.literal('telegram.message.updated'),arguments:filterSchema}).strict(),
]);
const unsubscribeFields={delivery:z.object({mode:z.literal('webhook'),url:z.string().url().max(2048)}).strict(),
  _meta:z.record(z.string(),z.unknown()).optional()};
const unsubscribeSchema=z.union([
  z.object({...unsubscribeFields,name:z.literal('telegram.message.created'),arguments:filterSchema}).strict(),
  z.object({...unsubscribeFields,name:z.literal('telegram.message.updated'),arguments:filterSchema}).strict(),
  // Owner-scoped ID convenience alongside canonical unsubscribe.
  z.object({id:z.string().max(100),_meta:z.record(z.string(),z.unknown()).optional()}).strict(),
]);
function subscriptionId(principal:string,url:string,name:string,args:unknown,botId:string,telegramOwner:string) {
  return `sub_${hash(canonical({principal,url,name,arguments:args,botId,telegramOwner}))}`;
}
export async function subscribe(env: Env, principal: string, value: unknown, callback=new CallbackClient(env.CALLBACK_ALLOWED_ORIGINS), now=Date.now(), identity:()=>Promise<unknown>=()=>new TelegramService(env).identity()) {
  requireConfig(env,['DB','SUBSCRIPTION_ENCRYPTION_KEY']);
  const input=subscribeSchema.parse(value);
  if(principal!==env.OWNER_USER_ID || env.SITES_IDENTITY_VERIFIED!=='true') throw new Failure('unauthorized');
  encryptionKey(env);
  const {botId,ownerId}=binding(env);
  await identity();
  validateSecret(input.delivery.secret);
  const url=callback.validate(input.delivery.url), args=canonical(input.arguments);
  const id=subscriptionId(principal,url,input.name,input.arguments,botId,ownerId);
  const secretHash=hash(input.delivery.secret);
  await cleanup(env,now);
  const existing=await env.DB.prepare('SELECT * FROM subscriptions WHERE id=? AND owner=?').bind(id,principal).first<Subscription>();
  // Secret rotation and reactivation always reverify; successful refreshes cache for five minutes.
  if (!existing?.active || existing.expires_at<=now || existing.secret_hash!==secretHash || existing.verified_at<now-300000) {
    try { await callback.verify(url,input.delivery.secret,id); }
    catch(e) { throw new Failure(e instanceof Failure ? e.category : 'challenge_failed'); }
  }
  // A null/no-expiration request still receives our finite maximum lifetime.
  const expires=now+Math.min(input.ttlMs ?? SUBSCRIPTION_LIFETIME_MS,SUBSCRIPTION_LIFETIME_MS);
  const secret=await encrypt(input.delivery.secret,env.SUBSCRIPTION_ENCRYPTION_KEY,id);
  await env.DB.prepare(`INSERT INTO subscriptions(id,owner,name,args,bot_id,telegram_owner,callback,secret,secret_hash,verified_at,created_at,expires_at,active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,secret_hash=excluded.secret_hash,
    previous_secret=CASE WHEN subscriptions.active=1 AND subscriptions.expires_at>? AND subscriptions.secret_hash!=excluded.secret_hash THEN subscriptions.secret
      WHEN subscriptions.active=1 AND subscriptions.expires_at>? AND subscriptions.previous_secret_expires_at>? THEN subscriptions.previous_secret ELSE NULL END,
    previous_secret_expires_at=CASE WHEN subscriptions.active=1 AND subscriptions.expires_at>? AND subscriptions.secret_hash!=excluded.secret_hash THEN min(?,excluded.expires_at)
      WHEN subscriptions.active=1 AND subscriptions.expires_at>? AND subscriptions.previous_secret_expires_at>? THEN min(subscriptions.previous_secret_expires_at,excluded.expires_at) ELSE NULL END,
    verified_at=excluded.verified_at,expires_at=excluded.expires_at,active=1,
    created_at=CASE WHEN subscriptions.active=0 OR subscriptions.expires_at<=? THEN excluded.created_at ELSE subscriptions.created_at END`)
    .bind(id,principal,input.name,args,botId,ownerId,url,secret,secretHash,
      existing?.active && existing.expires_at>now && existing.secret_hash===secretHash && existing.verified_at>=now-300000 ? existing.verified_at : now,now,expires,
      now,now,now,now,now+60000,now,now,now).run();
  return {id,refreshBefore:new Date(expires).toISOString(),cursor:null,truncated:false};
}
export async function unsubscribe(env: Env, principal: string, value: unknown, now=Date.now()) {
  const input=unsubscribeSchema.parse(value);
  // Query the stored canonical tuple across all installation bindings. No bot
  // credentials or callback policy are needed to remove an old subscription.
  if('id' in input) await env.DB.prepare('DELETE FROM subscriptions WHERE id=? AND owner=?').bind(input.id,principal).run();
  else await env.DB.prepare('DELETE FROM subscriptions WHERE owner=? AND name=? AND args=? AND callback=?')
    .bind(principal,input.name,canonical(input.arguments),new URL(input.delivery.url).href).run();
  await cleanup(env,now);
  return {};
}
