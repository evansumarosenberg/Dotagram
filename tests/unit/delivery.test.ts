import {it,expect,vi} from 'vitest';
import {database} from '../support/database';
import {env,subscription,update} from '../support/fixtures';
import {subscribe,unsubscribe} from '../../lib/events/subscriptions';
import {CallbackClient} from '../../lib/events/callback';
import {deliverEvent} from '../../lib/events/delivery';
import {normalize} from '../../lib/telegram/normalize';
import {Failure} from '../../lib/runtime/config';
async function fixture(count=1,eventName='telegram.message.created') {
  const {db,sqlite}=database(),e=env(db),cb=new CallbackClient(e.CALLBACK_ALLOWED_ORIGINS);
  vi.spyOn(cb,'verify').mockResolvedValue();const ids:string[]=[];
  for(let i=0;i<count;i++) ids.push((await subscribe(e,'owner',{...subscription(),name:eventName,delivery:{...subscription().delivery,url:`https://receiver.example.com/${i}`}},cb,1000,async()=>{})).id);
  let now=2000;const processing=vi.fn(async()=>{}),notice=vi.fn(async()=>{}),access=vi.fn(async()=>{});
  const deps={callbacks:cb,processing,notice,access,clock:()=>now,sleep:async(ms:number)=>{now+=ms;}};
  return {e,sqlite,cb,ids,deps,event:normalize(update(),e)!,advance:(ms:number)=>{now+=ms;}};
}
it('delivers once per subscription, fans out at most four, types once and suppresses duplicates',async()=>{
  const f=await fixture(7);let inflight=0,max=0;
  const post=vi.spyOn(f.cb,'post').mockImplementation(async()=>{inflight++;max=Math.max(max,inflight);await new Promise(r=>setTimeout(r,5));inflight--;return new Response(null,{status:204});});
  await deliverEvent(f.e,f.event,2000,f.deps);
  expect(post).toHaveBeenCalledTimes(7);expect(max).toBe(4);expect(f.deps.processing).toHaveBeenCalledOnce();
  await deliverEvent(f.e,f.event,2000,f.deps);expect(post).toHaveBeenCalledTimes(7);expect(f.deps.notice).not.toHaveBeenCalled();
  const dump=JSON.stringify(f.sqlite.prepare('SELECT * FROM event_dedup').all());expect(dump).not.toContain(f.event.data.text);expect(dump).not.toContain(f.event.eventId);
});
it.each([410,413,400,302])('does not retry terminal callback %i',async status=>{
  const f=await fixture();const post=vi.spyOn(f.cb,'post').mockImplementation(async()=>{
    if(status===302) throw new Failure('callback_redirect_blocked');return new Response(null,{status});});
  await deliverEvent(f.e,f.event,2000,f.deps);expect(post).toHaveBeenCalledOnce();expect(f.deps.notice).toHaveBeenCalledOnce();expect(f.deps.processing).not.toHaveBeenCalled();
});
it.each([408,429,500])('retries transient %i within three attempts then sends uncertain failure notice',async status=>{
  const f=await fixture();const post=vi.spyOn(f.cb,'post').mockResolvedValue(new Response(null,{status}));
  await deliverEvent(f.e,f.event,2000,f.deps);expect(post).toHaveBeenCalledTimes(3);expect(f.deps.notice).toHaveBeenCalledOnce();
  expect(f.deps.notice.mock.calls[0]).toEqual(expect.arrayContaining([expect.stringContaining("couldn't confirm")]));
});
it('recovers after a transient failure and ignores typing errors',async()=>{
  const f=await fixture();const post=vi.spyOn(f.cb,'post').mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValue(new Response(null,{status:204}));
  f.deps.processing.mockRejectedValue(new Error());await deliverEvent(f.e,f.event,2000,f.deps);
  expect(post).toHaveBeenCalledTimes(2);expect(f.deps.notice).not.toHaveBeenCalled();
});
it('honors long server retry delays and one shared deadline',async()=>{
  const f=await fixture(6);const post=vi.spyOn(f.cb,'post').mockImplementation(async()=>{
    f.advance(4000);return new Response(null,{status:429,headers:{'retry-after':'60'}});});
  await deliverEvent(f.e,f.event,2000,f.deps);expect(post.mock.calls.length).toBeLessThanOrEqual(5);
  expect(post.mock.calls.every(call=>call[6]===22000)).toBe(true);
});
it('rechecks cancellation after access and never sends cancellation feedback',async()=>{
  const f=await fixture();vi.spyOn(f.cb,'post').mockResolvedValue(new Response());
  f.deps.access.mockImplementation(async()=>{await unsubscribe(f.e,'owner',{id:f.ids[0]},2000);});
  await deliverEvent(f.e,f.event,2000,f.deps);expect(f.cb.post).not.toHaveBeenCalled();expect(f.deps.notice).not.toHaveBeenCalled();
});
it('does not type for edits or when no subscribers exist',async()=>{
  const f=await fixture(1,'telegram.message.updated');vi.spyOn(f.cb,'post').mockResolvedValue(new Response(null,{status:204}));
  const event=normalize({update_id:11,edited_message:{...update().message,edit_date:1794000100}},f.e)!;
  await deliverEvent(f.e,event,2000,f.deps);expect(f.cb.post).toHaveBeenCalledOnce();expect(f.deps.processing).not.toHaveBeenCalled();
  await deliverEvent(f.e,f.event,2000,f.deps);expect(f.deps.notice).not.toHaveBeenCalled();
});
it('preserves accepted delivery when finalization fails; fails closed on claim errors',async()=>{
  const f=await fixture();const post=vi.spyOn(f.cb,'post').mockResolvedValue(new Response(null,{status:204}));
  const prepare=f.e.DB.prepare.bind(f.e.DB);f.e.DB.prepare=((sql:string)=>{
    if(sql.startsWith('UPDATE event_dedup SET state=')) throw new Error('storage failure');return prepare(sql);
  }) as typeof f.e.DB.prepare;
  await deliverEvent(f.e,f.event,2000,f.deps);expect(post).toHaveBeenCalledOnce();expect(f.deps.notice).not.toHaveBeenCalled();
  f.e.DB.prepare=((sql:string)=>{if(sql.startsWith('INSERT INTO event_dedup')) throw new Error('claim failure');return prepare(sql);}) as typeof f.e.DB.prepare;
  await expect(deliverEvent(f.e,{...f.event,eventId:'other'},2000,f.deps)).rejects.toThrow('delivery_storage_failed');expect(post).toHaveBeenCalledOnce();
});
it('keeps blocked-chat errors separate from subscription cancellation',async()=>{
  const f=await fixture();vi.spyOn(f.cb,'post').mockResolvedValue(new Response(null,{status:503}));
  f.deps.notice.mockRejectedValue(new Failure('telegram_forbidden'));
  await deliverEvent(f.e,f.event,2000,f.deps);
  expect(f.sqlite.prepare('SELECT count(*) n FROM subscriptions').get()!.n).toBe(1);
});
it('removes revoked installation bindings and suppresses feedback',async()=>{
  const f=await fixture();const post=vi.spyOn(f.cb,'post');f.deps.access.mockRejectedValue(new Failure('installation_revoked'));
  await deliverEvent(f.e,f.event,2000,f.deps);expect(post).not.toHaveBeenCalled();expect(f.deps.notice).not.toHaveBeenCalled();
  expect(f.sqlite.prepare('SELECT count(*) n FROM subscriptions').get()!.n).toBe(0);
});
it('does not deliver or send failure feedback for expired subscriptions',async()=>{
  const f=await fixture();const post=vi.spyOn(f.cb,'post');
  f.sqlite.prepare('UPDATE subscriptions SET expires_at=2000').run();
  await deliverEvent(f.e,f.event,2000,f.deps);expect(post).not.toHaveBeenCalled();expect(f.deps.notice).not.toHaveBeenCalled();
});
