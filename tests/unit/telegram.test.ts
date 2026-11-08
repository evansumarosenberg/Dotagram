import {it,expect,vi,afterEach} from 'vitest';
import {env,update,botInfo} from '../support/fixtures';
import {normalize} from '../../lib/telegram/normalize';
import {receiveTelegram} from '../../lib/telegram/receiver';
import {TelegramService,textSchema} from '../../lib/telegram/service';
import {readReference} from '../../lib/telegram/message-reference';
import type {TelegramFetch} from '../../lib/telegram/client';
import {z} from 'zod';
const e=env({} as D1Database);
afterEach(()=>vi.restoreAllMocks());
it('projects only full text and reply ID; stable IDs distinguish edits without ordering state',()=>{
  const raw={...update(),message:{...update().message,text:'😀'.repeat(4096),reply_to_message:{message_id:12,text:'private nested text'},future_field:'discard',forward_origin:{sender_user:{id:999}}}};
  const event=normalize(raw,e)!;
  expect(event.data.text).toBe(raw.message.text);expect(event.data.reply_to_message_id).toBe(12);
  expect(JSON.stringify(event)).not.toContain('private nested');expect(JSON.stringify(event)).not.toContain('future_field');
  expect(normalize(raw,e)).toEqual(event);
  const edited={update_id:11,edited_message:{...raw.message,edit_date:1794000100}};
  expect(normalize(edited,e)!.name).toBe('telegram.message.updated');
  expect(normalize(edited,e)!.eventId).not.toBe(event.eventId);
  expect(normalize({...raw,update_id:9},e)).not.toBeNull();
});
it.each([{chat:{id:456,type:'group'}},{chat:{id:456,type:'supergroup'}},{chat:{id:456,type:'channel'}},
  {chat:{id:999,type:'private'}},{from:{id:999,is_bot:false}},{from:{id:456,is_bot:true}},
  {business_connection_id:'business'},{sender_business_bot:{id:123}},{sender_chat:{id:456}},
  {message_thread_id:1},{is_topic_message:true},{direct_messages_topic:{topic_id:1}},{text:undefined}])('ignores excluded context %j',patch=>{
  expect(normalize({...update(),message:{...update().message,...patch}},e)).toBeNull();
});
it('ignores unknown variants and rejects malformed recognized fields',()=>{
  expect(normalize({update_id:2,unknown_variant:{private:'discard'}},e)).toBeNull();
  expect(()=>normalize({...update(),update_id:Number.MAX_SAFE_INTEGER+1},e)).toThrow();
  expect(()=>normalize({update_id:2,edited_message:update().message},e)).toThrow();
  expect(()=>normalize({...update(),message:{...update().message,is_topic_message:'no'}},e)).toThrow();
});
it('authenticates and bounds ingress; schedules without foreground API calls',async()=>{
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('must not fetch'));
  const req=(body=JSON.stringify(update()),secret=e.TELEGRAM_WEBHOOK_SECRET)=>new Request('https://site.example/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body});
  expect((await receiveTelegram(req(undefined,'wrong'),e)).status).toBe(403);
  expect((await receiveTelegram(req('{'),e)).status).toBe(400);
  expect((await receiveTelegram(req('x'.repeat(262145)),e)).status).toBe(413);
  await expect(receiveTelegram(req(),e)).rejects.toThrow('background_unavailable');
  const schedule=vi.fn();expect((await receiveTelegram(req(),e,1000,schedule)).status).toBe(200);
  expect(schedule).toHaveBeenCalledOnce();expect(network).not.toHaveBeenCalled();
  schedule.mockClear();expect((await receiveTelegram(req(JSON.stringify({update_id:5,my_chat_member:{}})),e,1000,schedule)).status).toBe(200);
  expect(schedule).not.toHaveBeenCalled();
});
it('validates Unicode text and publishes the same character limit',()=>{
  expect(textSchema.safeParse('😀'.repeat(4096)).success).toBe(true);
  for(const text of ['', 'a'.repeat(4097),'😀'.repeat(4097),'\ud800']) expect(textSchema.safeParse(text).success).toBe(false);
  expect(z.toJSONSchema(textSchema).maxLength).toBe(4096);
});
function transport(write:(method:string,body:any)=>unknown):TelegramFetch {
  return async(url,init)=>{expect(init.redirect).toBe('manual');expect(init.signal).toBeDefined();
    const method=url.split('/').at(-1)!;
    return Response.json({ok:true,result:method==='getMe'?botInfo:write(method,JSON.parse(init.body as string))});};
}
const sent=(text='hello')=>({message_id:99,date:1794000000,from:{id:123,is_bot:true},chat:{id:456,type:'private'},text});
it('issues bound provenance only for confirmed sends, then edits/deletes the exact target',async()=>{
  const calls:string[]=[];
  const service=new TelegramService(e,Infinity,transport((method,body)=>{calls.push(method);expect(body.chat_id).toBe(456);
    if(method==='sendMessage') return sent();
    expect(body.message_id).toBe(99);return method==='editMessageText'?sent('edited'):true;}));
  const result=await service.send({text:'hello'},'owner');
  expect(readReference(e,'owner',result.message_reference).message_id).toBe(99);
  await service.edit({message_reference:result.message_reference,text:'edited'},'owner');
  await service.delete({message_reference:result.message_reference},'owner');
  expect(calls).toEqual(['sendMessage','editMessageText','deleteMessage']);
  for(const changed of [{...e,TELEGRAM_OWNER_USER_ID:'999'},{...e,OWNER_USER_ID:'other'},{...e,TELEGRAM_BOT_INFO:JSON.stringify({...botInfo,id:789})},
    {...e,SUBSCRIPTION_ENCRYPTION_KEY:Buffer.alloc(32,8).toString('base64')}]) expect(()=>readReference(changed,'owner',result.message_reference)).toThrow('invalid_message_reference');
  expect(()=>readReference(e,'owner',result.message_reference+'x')).toThrow();
  await expect(service.delete({message_id:20},'owner')).rejects.toThrow();
  await expect(service.send({text:'hello',chat_id:999},'owner')).rejects.toThrow();
});
it('sets and clears reactions on an owner message using a raw message ID',async()=>{
  const seen:any[]=[];const service=new TelegramService(e,Infinity,transport((method,body)=>{expect(method).toBe('setMessageReaction');seen.push(body);return true;}));
  expect(await service.reaction({message_id:20,emoji:'👀'})).toMatchObject({confirmed:true,emoji:'👀'});
  await service.reaction({message_id:20,emoji:null});
  expect(seen.map(b=>b.reaction)).toEqual([[{type:'emoji',emoji:'👀'}],[]]);
  expect(seen.every(b=>b.chat_id===456)).toBe(true);
});
it('does not retry uncertain writes and rejects invalid send provenance',async()=>{
  let writes=0;
  const service=new TelegramService(e,Infinity,async(url)=>{
    if(url.endsWith('/getMe')) return Response.json({ok:true,result:botInfo});
    writes++;throw new Error('sensitive token and text');});
  await expect(service.send({text:'hello'},'owner')).rejects.toThrow('ambiguous_write');expect(writes).toBe(1);
  const bad=new TelegramService(e,Infinity,transport(()=>({...sent(),from:{id:456,is_bot:false}})));
  await expect(bad.send({text:'hello'},'owner')).rejects.toThrow('ambiguous_write');
});
it('reports rate limits and definite reply/blocked failures without retrying',async()=>{
  for(const code of [400,403,429]) {
    let count=0;
    const service=new TelegramService(e,Infinity,async(url,init)=>{
      if(url.endsWith('/getMe')) return Response.json({ok:true,result:botInfo});
      count++;expect(JSON.parse(init.body as string).reply_parameters).toEqual({message_id:12,allow_sending_without_reply:false});
      return Response.json({ok:false,error_code:code,description:'sensitive',parameters:{retry_after:60}});});
    await expect(service.send({text:'hello',reply_to_message_id:12},'owner')).rejects.toMatchObject({category:code===429?'rate_limited':code===403?'telegram_forbidden':'telegram_rejected'});
    expect(count).toBe(1);
  }
});
it('fails closed on wrong bot credentials and live identity mismatch before any mutation',async()=>{
  expect(()=>new TelegramService({...e,TELEGRAM_BOT_TOKEN:'999:synthetic'})).toThrow('installation_mismatch');
  let writes=0;
  const service=new TelegramService(e,Infinity,async(url)=>{
    if(!url.endsWith('/getMe')) writes++;
    return Response.json({ok:true,result:{...botInfo,id:999}});
  });
  await expect(service.send({text:'hello'},'owner')).rejects.toThrow('installation_mismatch');expect(writes).toBe(0);
  await expect(new TelegramService({...e,SUBSCRIPTION_ENCRYPTION_KEY:'invalid'},Infinity,transport(()=>sent())).send({text:'hello'},'owner')).rejects.toThrow('invalid_encryption_key');
});
