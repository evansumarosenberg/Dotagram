import {it,expect} from 'vitest';
import {Webhook} from 'standardwebhooks';
import {CallbackClient,callbackUrl} from '../../lib/events/callback';
import {env,secret,botInfo} from '../support/fixtures';
import {TelegramService} from '../../lib/telegram/service';
it('signs challenges and payloads and enforces exact origins/redirect policy',async()=>{
  const cb=new CallbackClient('https://receiver.example.com',async(url,init)=>{
    expect(init.redirect).toBe('manual');const headers=init.headers as Record<string,string>;
    const payload=new Webhook(secret).verify(init.body as string,headers) as any;
    return Response.json({challenge:payload.challenge});});
  await cb.verify('https://receiver.example.com/callback',secret,'sub_1');
  for(const url of ['http://receiver.example.com/','https://receiver.example.com.evil.com/','https://receiver.example.com/#x','https://127.0.0.1/','https://user@receiver.example.com/']) expect(()=>callbackUrl(url,'https://receiver.example.com')).toThrow();
  const redirect=new CallbackClient('https://receiver.example.com',async()=>new Response(null,{status:302}));
  await expect(redirect.post('https://receiver.example.com/',secret,'sub','event','{}')).rejects.toThrow('callback_redirect_blocked');
});
it('cancels callback transport at the remaining deadline',async()=>{
  let aborted=false;
  const cb=new CallbackClient('https://receiver.example.com',async(_url,init)=>new Promise((_resolve,reject)=>{
    init.signal!.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true});}));
  await expect(cb.post('https://receiver.example.com/',secret,'sub','event','{}',Date.now(),Date.now()+30)).rejects.toThrow('callback_transport_failed');
  expect(aborted).toBe(true);
});
it('cancels Telegram fetch and body work and never retries a timed out write',async()=>{
  const e=env({} as D1Database);let aborted=false,writes=0;
  const service=new TelegramService(e,Date.now()+100,async(url,init)=>{
    if(url.endsWith('/getMe')) return Response.json({ok:true,result:botInfo});
    writes++;
    return new Response(new ReadableStream({start(controller){init.signal!.addEventListener('abort',()=>{aborted=true;controller.error(new Error('aborted'));},{once:true});}}));});
  await expect(service.send({text:'Synthetic'},'owner')).rejects.toThrow('ambiguous_write');
  expect(aborted).toBe(true);expect(writes).toBe(1);
});
