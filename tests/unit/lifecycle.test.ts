import {it,expect,vi} from 'vitest';
import {database} from '../support/database';
import {env,subscription,secret} from '../support/fixtures';
import {subscribe,unsubscribe} from '../../lib/events/subscriptions';
import {CallbackClient} from '../../lib/events/callback';
import {decrypt,encrypt,canonical} from '../../lib/runtime/crypto';
import {cleanup} from '../../lib/storage';
const identity=async()=>({});
function callback() {const client=new CallbackClient('https://receiver.example.com');vi.spyOn(client,'verify').mockResolvedValue();return client;}
it('refreshes without moving creation time or binding; rotates encrypted keys with overlap',async()=>{
  const {db,sqlite}=database(),e=env(db),cb=callback(),input=subscription();
  const first=await subscribe(e,'owner',input,cb,1000,identity);
  expect(await subscribe(e,'owner',{...input,ttlMs:null},cb,2000,identity)).toMatchObject({id:first.id});
  expect(cb.verify).toHaveBeenCalledOnce();
  let row=sqlite.prepare('SELECT * FROM subscriptions').get()!;
  expect(row.created_at).toBe(1000);expect(row.expires_at).toBe(2000+72*3600000);
  expect(row.bot_id).toBe('123');expect(row.telegram_owner).toBe('456');expect(row.secret).not.toContain(secret);
  expect(await decrypt(row.secret as string,e.SUBSCRIPTION_ENCRYPTION_KEY,first.id)).toBe(secret);
  const next=`whsec_${Buffer.alloc(32,8).toString('base64')}`;
  await subscribe(e,'owner',{...input,ttlMs:120000,delivery:{...input.delivery,secret:next}},cb,3000,identity);
  row=sqlite.prepare('SELECT * FROM subscriptions').get()!;
  expect(row.previous_secret_expires_at).toBe(63000);expect(row.expires_at).toBe(123000);
  expect(await decrypt(row.previous_secret as string,e.SUBSCRIPTION_ENCRYPTION_KEY,first.id)).toBe(secret);
  await cleanup(e,63000);expect(sqlite.prepare('SELECT previous_secret FROM subscriptions').get()!.previous_secret).toBeNull();
  await cleanup(e,123000);expect(sqlite.prepare('SELECT * FROM subscriptions').all()).toHaveLength(0);
});
it('canonical unsubscribe removes all bindings without Telegram credentials or callback policy',async()=>{
  const {db,sqlite}=database(),e=env(db),cb=callback(),input=subscription();
  const one=await subscribe(e,'owner',input,cb,1000,identity);
  const two=await subscribe({...e,TELEGRAM_OWNER_USER_ID:'789'},'owner',input,cb,1000,identity);
  expect(one.id).not.toBe(two.id);expect(sqlite.prepare('SELECT * FROM subscriptions').all()).toHaveLength(2);
  await unsubscribe(e,'other',{id:one.id},1100);expect(sqlite.prepare('SELECT * FROM subscriptions').all()).toHaveLength(2);
  await unsubscribe({...e,TELEGRAM_BOT_TOKEN:'',TELEGRAM_BOT_INFO:'invalid',TELEGRAM_OWNER_USER_ID:'',CALLBACK_ALLOWED_ORIGINS:''},'owner',
    {name:input.name,arguments:{},delivery:{mode:'webhook',url:input.delivery.url}},1200);
  expect(sqlite.prepare('SELECT * FROM subscriptions').all()).toHaveLength(0);
});
it('rejects filters and failed challenges without persisting secrets',async()=>{
  const {db,sqlite}=database(),e=env(db),cb=callback();
  await expect(subscribe(e,'owner',{...subscription(),arguments:{chat_id:'456'}},cb,1000,identity)).rejects.toThrow();
  vi.mocked(cb.verify).mockRejectedValue(new Error('private callback URL'));
  await expect(subscribe(e,'owner',subscription(),cb,1000,identity)).rejects.toThrow('challenge_failed');
  expect(sqlite.prepare('SELECT * FROM subscriptions').all()).toHaveLength(0);
});
it('binds encryption to row and key and canonicalizes JSON',async()=>{
  const e=env(database().db),cipher=await encrypt(secret,e.SUBSCRIPTION_ENCRYPTION_KEY,'row');
  await expect(decrypt(cipher,e.SUBSCRIPTION_ENCRYPTION_KEY,'other')).rejects.toThrow();
  await expect(decrypt(cipher,Buffer.alloc(32,9).toString('base64'),'row')).rejects.toThrow();
  expect(canonical({b:2,a:1})).toBe(canonical({a:1,b:2}));
});
