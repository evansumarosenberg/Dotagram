import { Failure, type Env } from '../runtime/config';
import { decrypt } from '../runtime/crypto';
import { cleanup, type Subscription } from '../storage';
import { TelegramService } from '../telegram/service';
import { binding } from '../telegram/config';
import { typing, failureReply } from '../telegram/feedback';
import { matchesEvent, type TelegramEvent } from '../telegram/normalize';
import { CallbackClient } from './callback';
import { claimDelivery, finishDelivery, ownsClaim, type Claim } from './dedup';
import { DELIVERY_MS, NOTICE_MS, MAX_ATTEMPTS, MIN_ATTEMPT_MS, TELEGRAM_CALL_MS, retryDelay } from './budget';

export interface DeliveryDependencies {
  access?: (deadline:number)=>Promise<void>;
  callbacks?: CallbackClient;
  notice?: (event:TelegramEvent,text:string,deadline:number)=>Promise<unknown>;
  processing?: (deadline:number)=>Promise<void>;
  clock?: ()=>number;
  sleep?: (ms:number)=>Promise<void>;
}
interface Outcome { id:string; state:'delivered'|'failed'|'cancelled'|'suppressed'; attempts:number }
const installationRevoked = ['installation_revoked','installation_mismatch'];
const category = (e:unknown) => e instanceof Failure ? e.category : 'delivery_failed';

// Payloads and attempts remain invocation-local. Only opaque deduplication keys,
// delivery state and bounded claims survive a request; there is no replay queue.
export async function deliverEvent(env:Env,event:TelegramEvent,acceptedAt:number,deps:DeliveryDependencies={}) {
  if(env.SITES_IDENTITY_VERIFIED!=='true' || !env.OWNER_USER_ID) throw new Failure('identity_boundary_unverified');
  const clock=deps.clock??Date.now, sleep=deps.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const access=deps.access??(async deadline=>{await new TelegramService(env,deadline).identity();});
  const {botId,ownerId}=binding(env);
  if(event.data.bot_id!==botId || event.data.chat_id!==ownerId || event.data.sender_user_id!==ownerId) throw new Failure('installation_mismatch');
  const callbacks=deps.callbacks??new CallbackClient(env.CALLBACK_ALLOWED_ORIGINS);
  const deadline=acceptedAt+DELIVERY_MS, noticeDeadline=deadline+NOTICE_MS;
  await cleanup(env,clock());
  if(clock()>=deadline) return {processed:0};
  // Retire obsolete bindings rather than redirecting them to a new owner/bot.
  await env.DB.prepare('DELETE FROM subscriptions WHERE id IN (SELECT id FROM subscriptions WHERE owner!=? OR bot_id!=? OR telegram_owner!=? LIMIT 100)')
    .bind(env.OWNER_USER_ID,botId,ownerId).run();
  const rows=await env.DB.prepare(`SELECT id FROM subscriptions WHERE owner=? AND active=1 AND expires_at>?
    AND created_at<=? AND name=? AND bot_id=? AND telegram_owner=? ORDER BY id`)
    .bind(env.OWNER_USER_ID,clock(),acceptedAt,event.name,botId,ownerId).all<{id:string}>();
  const payload=JSON.stringify(event);
  const current=(id:string)=>env.DB.prepare('SELECT * FROM subscriptions WHERE id=?').bind(id).first<Subscription>();
  const active=(sub:Subscription|null)=>{
    if(!sub?.active || sub.bot_id!==botId || sub.telegram_owner!==ownerId || sub.owner!==env.OWNER_USER_ID || sub.created_at>acceptedAt || sub.expires_at<=clock() || !sub.secret) return false;
    try { return matchesEvent(event,sub.name,JSON.parse(sub.args)); }
    catch { return false; }
  };
  let index=0;
  const outcomes:Outcome[]=[];
  let processing:Promise<void>|undefined;

  async function run(id:string,claim:Claim):Promise<Outcome> {
    let attempts=0;
    const result=(state:Outcome['state']):Outcome=>({id,state,attempts});
    while(true) {
      let sub=await current(id);
      if(!active(sub)) return result('cancelled');
      if(clock()+MIN_ATTEMPT_MS>=deadline || attempts>=MAX_ATTEMPTS) return result('failed');
      if(!await ownsClaim(env,claim,clock())) return result('suppressed');
      attempts++;
      let requestedDelay=0;
      try {
        try { await access(deadline); }
        catch(e) {
          const reason=category(e);
          if(installationRevoked.includes(reason)) {
            await env.DB.prepare('DELETE FROM subscriptions WHERE id=? AND owner=?').bind(id,env.OWNER_USER_ID).run();
            return result('cancelled');
          }
          throw e;
        }
        sub=await current(id);
        if(!active(sub)) return result('cancelled');
        const secret=await decrypt(sub!.secret!,env.SUBSCRIPTION_ENCRYPTION_KEY,sub!.id);
        const previousSecret=sub!.previous_secret && (sub!.previous_secret_expires_at??0)>clock()
          ? await decrypt(sub!.previous_secret,env.SUBSCRIPTION_ENCRYPTION_KEY,sub!.id) : undefined;
        if(clock()>=deadline) throw new Failure('execution_deadline');
        if(!await ownsClaim(env,claim,clock())) return result('suppressed');
        const response=await callbacks.post(sub!.callback,secret,sub!.id,event.eventId,payload,clock(),deadline,
          (sub!.previous_secret_expires_at??0)>clock()?previousSecret:undefined);
        requestedDelay=retryDelay(response.headers.get('retry-after'),clock());
        const status=response.status;
        // A body cleanup failure must not turn confirmed acceptance into a retry.
        try { void response.body?.cancel().catch(()=>{}); } catch { /* Status is already known. */ }
        if(response.ok) {
          if(!processing && event.name==='telegram.message.created' && clock()<noticeDeadline) {
            const update=deps.processing??(end=>typing(env,end));
            processing=(async()=>{
              try {await update(Math.min(noticeDeadline,clock()+TELEGRAM_CALL_MS));}
              catch { /* Typing failure never causes callback redelivery. */ }
            })();
          }
          return result('delivered');
        }
        if(status>=400&&status<500&&status!==429&&status!==408) return result('failed');
      } catch(e) {
        const reason=category(e);
        if(reason.startsWith('callback_destination')||['callback_policy_unconfigured','callback_redirect_blocked','payload_too_large'].includes(reason)) return result('failed');
        if(e instanceof Failure) requestedDelay=(e.retryAfter??0)*1000;
      }
      if(attempts>=MAX_ATTEMPTS) return result('failed');
      const delay=Math.max(1000*2**(attempts-1),requestedDelay);
      if(clock()+delay+MIN_ATTEMPT_MS>=deadline) return result('failed');
      await sleep(delay);
    }
  }
  async function worker() {
    while(index<rows.results.length) {
      const id=rows.results[index++].id;
      if(!active(await current(id))) {outcomes.push({id,state:'cancelled',attempts:0});continue;}
      if(clock()+MIN_ATTEMPT_MS>=deadline) {outcomes.push({id,state:'failed',attempts:0});continue;}
      // Fail closed on claim/storage errors: do not send an uncoordinated callback.
      const claim=await claimDelivery(env,event.eventId,id,clock());
      if(!claim) {outcomes.push({id,state:'suppressed',attempts:0});continue;}
      const outcome=await run(id,claim);
      outcomes.push(outcome);
      // Keep this outside the callback retry loop. A failed success-record write
      // leaves an expiring claim, never an immediate duplicate callback.
      try {await finishDelivery(env,claim,outcome.state==='delivered'?'delivered':'failed',clock());}
      catch { /* A later ingress may reclaim; callback acceptance remains true. */ }
    }
  }
  // All callbacks share one deadline and at most four run concurrently. A storage
  // failure loses this invocation; there is deliberately no later recovery job.
  const workers=await Promise.allSettled(Array.from({length:Math.min(4,rows.results.length)},worker));
  await processing;
  if(workers.some(result=>result.status==='rejected')) throw new Failure('delivery_storage_failed');
  const processed=outcomes.length;
  if(clock()>=noticeDeadline || outcomes.some(result=>result.state==='delivered'||result.state==='suppressed')) return {processed};
  const failed=outcomes.filter(result=>result.state==='failed' && result.attempts>0);
  if(!failed.length) return {processed};
  // An unsubscribe/expiry observed after fanout is an intentional cancellation.
  let eligible=false;
  for(const result of failed) if(active(await current(result.id))) {eligible=true;break;}
  if(!eligible || clock()>=noticeDeadline) return {processed};
  const attempts=Math.max(...failed.map(result=>result.attempts));
  const text=`Dotagram couldn't confirm delivery to ChatGPT${attempts>1?' after several attempts':''}. No further automatic attempts will be made by this delivery run.`;
  const send=deps.notice??((message,body,end)=>failureReply(env,message,body,end));
  try {
    await send(event,text,Math.min(noticeDeadline,clock()+NOTICE_MS));
  } catch { /* One best-effort notice; never retry an uncertain Telegram write. */ }
  return {processed};
}
