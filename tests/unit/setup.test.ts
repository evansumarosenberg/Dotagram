import { afterEach, expect, it, vi } from 'vitest';
import { runSetupAction } from '../../lib/setup/service';
import { currentWebhookUrl, withSetupRequest } from '../../lib/setup/request-context';
import { botInfo, env, update } from '../support/fixtures';
import type { TelegramFetch } from '../../lib/telegram/client';

const nonce=`dotagram-verify-${'a'.repeat(32)}`,destination='https://synthetic.chatgpt.site/telegram/webhook';
const absent={url:'',has_custom_certificate:false};
const matching={...absent,url:destination,max_connections:1,allowed_updates:['edited_message','message']};
function fixture(fresh=true) {
  const e=env(new Proxy({} as D1Database,{get(){throw new Error('Setup must not access storage');}}));
  if(fresh) {e.TELEGRAM_BOT_INFO='';e.TELEGRAM_OWNER_USER_ID='';}
  const calls:{method:string;body:any}[]=[];
  const answers:Record<string,unknown>={getMe:{...botInfo,unknown:'must-strip'},getWebhookInfo:absent,getUpdates:[],setWebhook:true};
  const transport:TelegramFetch=async(url,init)=>{
    expect(init.cache).toBe('no-store');expect(init.redirect).toBe('manual');
    const method=url.split('/').at(-1)!;
    calls.push({method,body:JSON.parse(init.body as string)});
    return Response.json({ok:true,result:answers[method]});
  };
  const run=(op:'inspect'|'prepare'|'verify'|'register',args:unknown=op==='verify'?{nonce}:op==='prepare'?{confirm_replacement:true}:{},principal:string|null='owner',fetch=transport)=>
    runSetupAction(op,args,e,principal,()=>destination,fetch);
  return {e,calls,answers,transport,run};
}
function message(text=nonce,extra={}) {const value=update();return {...value,message:{...value.message,text,...extra}};}
afterEach(()=>vi.useRealTimers());

it('authorizes every action and rejects strict arguments before any upstream call or URL resolution',async()=>{
  const f=fixture();
  for(const op of ['inspect','prepare','verify','register'] as const) {
    for(const principal of [null,'other']) expect(await f.run(op,op==='verify'?{nonce}:{},principal)).toEqual({status:'error',error:'unauthorized'});
    for(const args of [null,[],{destination},{nonce:'wrong'},op==='verify'?{nonce,extra:true}:{extra:true}])
      expect((await f.run(op,args)).status).toBe('error');
    f.e.SITES_IDENTITY_VERIFIED='false';expect((await f.run(op)).status).toBe('error');f.e.SITES_IDENTITY_VERIFIED='true';
  }
  expect(f.calls).toEqual([]);
  const resolve=vi.fn(()=>destination);
  await runSetupAction('inspect',{},f.e,null,resolve,f.transport);expect(resolve).not.toHaveBeenCalled();
});
it('requires explicit replacement confirmation before preparing an unconfigured owner',async()=>{
  const f=fixture();f.answers.getWebhookInfo=matching;
  for(const args of [{},{confirm_replacement:false},{confirm_replacement:'true'},{confirm_replacement:true,url:destination}]) {
    expect(await f.run('prepare',args)).toEqual({status:'error',error:'invalid_arguments'});
  }
  expect(f.calls).toEqual([]);
  const existing=fixture(false);
  expect(await existing.run('prepare')).toEqual({status:'owner_configured'});expect(existing.calls).toEqual([]);
  f.answers.getMe={...botInfo,id:999};
  expect(await f.run('prepare')).toEqual({status:'error',error:'installation_mismatch'});
  expect(f.calls.map(c=>c.method)).toEqual(['getMe']);
});
it('removes a confirmed existing webhook once, sets text update types before nonce delivery, and preserves pending updates',async()=>{
  for(const info of [matching,{...matching,max_connections:4},{...matching,url:'https://other.example/private'}]) {
    const f=fixture();f.answers.getWebhookInfo=info;f.answers.getUpdates=[message()];
    const transport:TelegramFetch=async(url,init)=>{
      const response=await f.transport(url,init);
      if(url.endsWith('/setWebhook')) f.answers.getWebhookInfo=absent;
      return response;
    };
    expect(await f.run('prepare',{confirm_replacement:true},'owner',transport)).toEqual({status:'ready_for_verification'});
    expect(f.calls.map(c=>c.method)).toEqual(['getMe','getWebhookInfo','setWebhook','getWebhookInfo']);
    expect(f.calls[2].body).toEqual({url:'',allowed_updates:['message','edited_message'],drop_pending_updates:false});
    expect(await f.run('verify')).toMatchObject({status:'candidate',candidate_user_id:'456'});
  }
  const f=fixture();expect(await f.run('prepare')).toEqual({status:'ready_for_verification'});
  expect(f.calls.map(c=>c.method)).toEqual(['getMe','getWebhookInfo']);
});
it('reports uncertain removal without retrying or proceeding to nonce inspection',async()=>{
  for(const point of ['write','after','mismatch']) {
    const f=fixture();f.answers.getWebhookInfo=matching;let writes=0;
    const transport:TelegramFetch=async(url,init)=>{
      if(url.endsWith('/setWebhook')) {writes++;if(point==='write') throw new Error('PRIVATE');}
      if(writes && url.endsWith('/getWebhookInfo') && point==='after') throw new Error('PRIVATE');
      return f.transport(url,init);
    };
    expect(await f.run('prepare',{confirm_replacement:true},'owner',transport)).toEqual({status:'uncertain'});
    expect(writes).toBe(1);expect(f.calls.some(c=>c.method==='getUpdates')).toBe(false);
  }
});
it('replaces matching and conflicting webhooks only with explicit confirmation and full configuration',async()=>{
  for(const info of [matching,{...matching,max_connections:4},{...matching,url:'https://other.example/private'}]) {
    const f=fixture(false);f.answers.getWebhookInfo=info;
    const transport:TelegramFetch=async(url,init)=>{
      const response=await f.transport(url,init);
      if(url.endsWith('/setWebhook')) f.answers.getWebhookInfo=matching;
      return response;
    };
    expect(await f.run('register',{confirm_replacement:true},'owner',transport)).toEqual({status:'registered'});
    expect(f.calls.filter(c=>c.method==='setWebhook')).toEqual([{method:'setWebhook',body:{url:destination,secret_token:'synthetic_secret',allowed_updates:['message','edited_message'],max_connections:1,drop_pending_updates:false}}]);
  }
  const fresh=fixture();expect((await fresh.run('register',{confirm_replacement:true})).status).toBe('error');expect(fresh.calls).toEqual([]);
  const f=fixture(false);f.answers.getWebhookInfo=matching;f.answers.getMe={...botInfo,can_join_groups:true};
  expect(await f.run('register',{confirm_replacement:true})).toEqual({status:'error',error:'bot_features_incompatible'});
  expect(f.calls.some(c=>c.method==='setWebhook')).toBe(false);
});
it('inspects with token only, strips unapproved fields, and projects coarse webhook state',async()=>{
  const f=fixture();f.e.SUBSCRIPTION_ENCRYPTION_KEY='';f.e.CALLBACK_ALLOWED_ORIGINS='';
  for(const [info,state] of [[absent,'absent'],[matching,'matching'],[{...matching,max_connections:4},'settings_conflict'],[{...matching,url:'https://hidden.example/secret'},'another_destination']] as const) {
    f.answers.getWebhookInfo={...info,last_error_message:'PRIVATE',ip_address:'PRIVATE'};
    const result=await f.run('inspect');expect(result).toMatchObject({status:'inspected',webhook:state,bot_info:{id:123}});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|hidden.example|unknown|synthetic_secret|123:synthetic/);
  }
});
it('rejects missing or malformed credentials and token/config/live bot mismatches',async()=>{
  for(const changes of [{TELEGRAM_BOT_TOKEN:''},{TELEGRAM_BOT_TOKEN:'bad'},{TELEGRAM_BOT_TOKEN:'999:synthetic'},{TELEGRAM_BOT_INFO:'bad'},
    {TELEGRAM_BOT_INFO:JSON.stringify({...botInfo,id:999})}]) {
    const f=fixture();Object.assign(f.e,changes);expect((await f.run('inspect')).status).toBe('error');
  }
  const f=fixture();f.answers.getMe={...botInfo,id:999};expect(await f.run('inspect')).toEqual({status:'error',error:'installation_mismatch'});
});
it('matches exactly one ordinary nonce message despite /start and unrelated messages, without offsets/filter changes',async()=>{
  const f=fixture();f.answers.getUpdates=[message('/start'),message('unrelated'),message()];
  expect(await f.run('verify')).toMatchObject({status:'candidate',candidate_user_id:'456',bot_info:{id:123}});
  expect(f.calls.map(c=>c.method)).toEqual(['getMe','getWebhookInfo','getUpdates']);
  expect(f.calls.at(-1)?.body).toEqual({timeout:0,limit:100});
});
it('distinguishes no, ambiguous, and full-page matches without pagination',async()=>{
  for(const [updates,status] of [[[],'no_match'],[[message(`${nonce}\n`)],'no_match'],[[message(),message()],'ambiguous'],[Array.from({length:100},()=>message()),'incomplete']] as const) {
    const f=fixture();f.answers.getUpdates=updates;expect(await f.run('verify')).toEqual({status});expect(f.calls.filter(c=>c.method==='getUpdates')).toHaveLength(1);
  }
});
it('excludes nonhuman, nonprivate, mismatched, unsafe IDs, edited and unsupported contexts from nonce verification',async()=>{
  const excluded=[{from:{id:456,is_bot:true}},{chat:{id:456,type:'group'}},{from:{id:457,is_bot:false}},{from:{id:Number.MAX_SAFE_INTEGER+1,is_bot:false}},
    {business_connection_id:'x'},{sender_business_bot:{id:123}},{sender_chat:{id:456}},{message_thread_id:1},{is_topic_message:true},{direct_messages_topic:{topic_id:1}},{is_paid_post:true}];
  const f=fixture();f.answers.getUpdates=[...excluded.map(extra=>message(nonce,extra)),{edited_message:message().message}];
  expect(await f.run('verify')).toEqual({status:'no_match'});
});
it('preserves configured owners and every existing webhook without reading pending updates',async()=>{
  const existing=fixture(false);expect(await existing.run('verify')).toEqual({status:'owner_configured'});expect(existing.calls).toEqual([]);
  for(const webhook of [matching,{...matching,url:'https://other.example/hook'}]) {
    const f=fixture();f.answers.getWebhookInfo=webhook;expect(await f.run('verify')).toEqual({status:'webhook_exists'});
    expect(f.calls.map(c=>c.method)).toEqual(['getMe','getWebhookInfo']);
  }
});
it('requires complete valid configuration before registration network access',async()=>{
  for(const key of ['DB','TELEGRAM_OWNER_USER_ID','TELEGRAM_BOT_INFO','TELEGRAM_WEBHOOK_SECRET','SUBSCRIPTION_ENCRYPTION_KEY','CALLBACK_ALLOWED_ORIGINS'] as const) {
    const f=fixture(false);(f.e as any)[key]='';expect((await f.run('register')).status).toBe('error');expect(f.calls).toEqual([]);
  }
  for(const changes of [{TELEGRAM_WEBHOOK_SECRET:'bad secret'},{CALLBACK_ALLOWED_ORIGINS:'http://invalid.example'},{CALLBACK_ALLOWED_ORIGINS:'https://receiver.example.com/path'},{SUBSCRIPTION_ENCRYPTION_KEY:'bad'}]) {
    const f=fixture(false);Object.assign(f.e,changes);expect((await f.run('register')).status).toBe('error');expect(f.calls).toEqual([]);
  }
});
it('registers once at the fixed Site target and preserves pending updates',async()=>{
  const f=fixture(false);
  const transport:TelegramFetch=async(url,init)=>{
    const response=await f.transport(url,init);
    if(url.endsWith('/setWebhook')) f.answers.getWebhookInfo=matching;
    return response;
  };
  expect(await f.run('register',{},'owner',transport)).toEqual({status:'registered'});
  expect(f.calls.map(c=>c.method)).toEqual(['getMe','getWebhookInfo','setWebhook','getWebhookInfo']);
  expect(f.calls[2].body).toEqual({url:destination,secret_token:'synthetic_secret',allowed_updates:['message','edited_message'],max_connections:1,drop_pending_updates:false});
});
it('matching installations are a no-write resume even if group joining is still enabled; conflicts are preserved',async()=>{
  for(const [info,status] of [[matching,'already_configured'],[{...matching,max_connections:2},'conflict'],[{...matching,url:'https://other.example/private'},'conflict']] as const) {
    const f=fixture(false);f.answers.getMe={...botInfo,can_join_groups:true};f.answers.getWebhookInfo=info;
    expect(await f.run('register')).toEqual({status});expect(f.calls.map(c=>c.method)).toEqual(['getMe','getWebhookInfo']);
  }
});
it('requires disabled group and incompatible bot capabilities for new registration',async()=>{
  for(const flag of ['can_join_groups','supports_inline_queries','can_connect_to_business','has_topics_enabled','allows_users_to_create_topics']) {
    const f=fixture(false);f.answers.getMe={...botInfo,[flag]:true};
    expect(await f.run('register')).toEqual({status:'error',error:'bot_features_incompatible'});expect(f.calls).toHaveLength(2);
  }
});
it('does not retry uncertain submissions or failed post-write inspection and never returns upstream details',async()=>{
  for(const point of ['write','after','mismatch']) {
    const f=fixture(false);let wrote=false;
    const transport:TelegramFetch=async(url,init)=>{
      if(url.endsWith('/setWebhook')) {wrote=true;if(point==='write') {f.calls.push({method:'setWebhook',body:{}});throw new Error('SECRET https://api.telegram.org/bot123:synthetic');}}
      if(wrote && url.endsWith('/getWebhookInfo') && point==='after') throw new Error('PRIVATE');
      return f.transport(url,init);
    };
    expect(await f.run('register',{},'owner',transport)).toEqual({status:'uncertain'});
    expect(f.calls.filter(c=>c.method==='setWebhook')).toHaveLength(1);
  }
});
it('bounds and cancels setup API fetches and response bodies at five seconds',async()=>{
  vi.useFakeTimers();
  for(const body of [false,true]) {
    const f=fixture();let aborted=false;
    const transport:TelegramFetch=async(_url,init)=>{
      if(body) return new Response(new ReadableStream({start(controller){init.signal!.addEventListener('abort',()=>{aborted=true;controller.error(new Error('PRIVATE'));});}}));
      return new Promise((_resolve,reject)=>init.signal!.addEventListener('abort',()=>{aborted=true;reject(new Error('PRIVATE'));}));
    };
    const result=f.run('inspect',{},'owner',transport);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await result).toEqual({status:'error',error:'telegram_unavailable'});expect(aborted).toBe(true);
  }
});
it('uses one foreground deadline across calls',async()=>{
  vi.useFakeTimers();const f=fixture();
  const transport:TelegramFetch=async(url,init)=>{const response=await f.transport(url,init);vi.setSystemTime(Date.now()+26_000);return response;};
  expect(await f.run('inspect',{},'owner',transport)).toEqual({status:'error',error:'execution_deadline'});
  expect(f.calls).toHaveLength(1);
});
it('cancels a stalled registration once and reports uncertainty without post-write retries',async()=>{
  vi.useFakeTimers();const f=fixture(false);let writes=0,aborted=false;
  const transport:TelegramFetch=async(url,init)=>{
    if(!url.endsWith('/setWebhook')) return f.transport(url,init);
    writes++;
    return new Promise((_resolve,reject)=>init.signal!.addEventListener('abort',()=>{aborted=true;reject(new Error('PRIVATE'));}));
  };
  const result=f.run('register',{},'owner',transport);
  await vi.advanceTimersByTimeAsync(5001);
  expect(await result).toEqual({status:'uncertain'});expect(aborted).toBe(true);expect(writes).toBe(1);
  expect(f.calls.map(c=>c.method)).toEqual(['getMe','getWebhookInfo']);
});
it('blocks redirects and oversized upstream bodies with sanitized results',async()=>{
  for(const response of [new Response(null,{status:302,headers:{location:'https://private.example'}}),new Response('x'.repeat(262145))]) {
    const f=fixture();let calls=0;expect(await f.run('inspect',{},'owner',async()=>{calls++;return response;})).toEqual({status:'error',error:'telegram_unavailable'});expect(calls).toBe(1);
  }
});
it('resolves webhook URLs from isolated Worker request context, ignoring forwarded headers',async()=>{
  expect(()=>currentWebhookUrl()).toThrow('site_url_unavailable');
  const values=await Promise.all(['first','second'].map(name=>withSetupRequest(new Request(`https://${name}.chatgpt.site/setup?ignored=yes`,{headers:{'x-forwarded-host':'other.example'}}),async()=>{
    await Promise.resolve();return currentWebhookUrl();
  })));
  expect(values).toEqual(['https://first.chatgpt.site/telegram/webhook','https://second.chatgpt.site/telegram/webhook']);
  expect(()=>withSetupRequest(new Request('http://localhost/setup'),currentWebhookUrl)).toThrow('site_url_unavailable');
});
