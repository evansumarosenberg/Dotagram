// Only synthetic bindings/services. Invoke the built framework action protocol;
// never import this harness into production or contact a Telegram account.
import { Miniflare } from 'miniflare';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const root=resolve('dist/server'),origin='https://synthetic.chatgpt.site',destination=`${origin}/telegram/webhook`;
const bot={id:123,is_bot:true,first_name:'Synthetic',username:'synthetic_bot',can_join_groups:false,can_read_all_group_messages:false,supports_inline_queries:false};
const bindings={OWNER_USER_ID:'owner',SITES_IDENTITY_VERIFIED:'true',TELEGRAM_BOT_TOKEN:'123:synthetic',TELEGRAM_BOT_INFO:'',
  TELEGRAM_OWNER_USER_ID:'',TELEGRAM_WEBHOOK_SECRET:'synthetic_secret',SUBSCRIPTION_ENCRYPTION_KEY:Buffer.alloc(32,5).toString('base64'),CALLBACK_ALLOWED_ORIGINS:'https://receiver.example.com'};
const nonce=`dotagram-verify-${'a'.repeat(32)}`;
const message={update_id:10,message:{message_id:20,date:1794000000,chat:{id:456,type:'private'},from:{id:456,is_bot:false},text:nonce}};
const absent={url:'',has_custom_certificate:false};
let webhook=absent,updates=[message],calls=[],writeTimeout=false;
const modules=readdirSync(root,{recursive:true}).filter(f=>String(f).endsWith('.js')).map(String).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
const options={modules:modules.map(file=>({type:'ESModule',path:resolve(root,file)})),modulesRoot:root,
  routes:['synthetic.chatgpt.site/*','unrelated.example/*'],
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],
  assets:{directory:resolve('dist/client'),routerConfig:{has_user_worker:true}},bindings,
  outboundService:async request=>{
    const url=new URL(request.url);assert.equal(url.origin,'https://api.telegram.org');
    const method=url.pathname.split('/').at(-1),body=await request.json();calls.push({method,body});
    let result;
    if(method==='getMe') result=bot;
    else if(method==='getWebhookInfo') result={...webhook,last_error_message:'PRIVATE upstream description',ip_address:'PRIVATE'};
    else if(method==='getUpdates') {assert.deepEqual(body,{timeout:0,limit:100});result=updates;}
    else if(method==='setWebhook') {
      assert.deepEqual(body,{url:destination,secret_token:'synthetic_secret',allowed_updates:['message','edited_message'],max_connections:1,drop_pending_updates:false});
      webhook={url:destination,has_custom_certificate:false,max_connections:1,allowed_updates:['message','edited_message']};
      if(writeTimeout) return Response.json({ok:false,error_code:503,description:'PRIVATE'});
      result=true;
    } else assert.fail('Unexpected setup API method');
    return Response.json({ok:true,result});
  }};
const clientRoot=resolve('dist/client');
const clientCode=readdirSync(clientRoot,{recursive:true}).filter(f=>String(f).endsWith('.js')).map(f=>readFileSync(resolve(clientRoot,String(f)),'utf8')).join('\n');
const actionIds=Object.fromEntries(['inspectTelegramSetup','verifyTelegramOwner','registerTelegramWebhook'].map(name=>{
  const match=clientCode.match(new RegExp('([a-f0-9]+#'+name+')'));assert.ok(match);return [name,match[1]];
}));
for(const prohibited of ['123:synthetic','synthetic_secret','BootstrapApi','api.telegram.org','setWebhook','getUpdates']) assert.ok(!clientCode.includes(prohibited));
let runtime=new Miniflare(options);
const identity=principal=>principal?{'oai-authenticated-user-id':principal,'oai-authenticated-user-email':'synthetic@example.com'}:{};
if(process.argv.includes('--preview')) {
  // Optional local UI QA. This isolated harness supplies synthetic identity and
  // services; it is not evidence of hosted OAuth or dispatch authentication.
  const server=createServer(async(request,response)=>{
    try {
      const chunks=[];for await(const chunk of request) chunks.push(chunk);
      const headers=new Headers(request.headers);
      for(const [key,value] of Object.entries(identity('owner'))) headers.set(key,value);
      if(headers.has('origin')) headers.set('origin',(await runtime.ready).origin);
      const result=await runtime.dispatchFetch(new URL(request.url,origin),{method:request.method,headers,
        ...(['GET','HEAD'].includes(request.method)?{}:{body:Buffer.concat(chunks)})});
      response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
    } catch {response.writeHead(500);response.end('Synthetic preview failed');}
  });
  server.listen(0,'127.0.0.1',()=>console.log(`Synthetic setup preview: http://127.0.0.1:${server.address().port}/setup`));
  await new Promise(resolve=>{
    const stop=()=>server.close(resolve);process.once('SIGINT',stop);process.once('SIGTERM',stop);
  });
  await runtime.dispose();process.exit(0);
}
async function action(name,args={},principal='owner',extra={}) {
  // Miniflare preserves Request.url but rewrites Host to its loopback server.
  // Match that transport Host for the unmodified framework protection. The
  // separately asserted webhook target must still use the original Site URL.
  const response=await runtime.dispatchFetch(`${origin}/setup`,{method:'POST',headers:{...identity(principal),'content-type':'text/plain;charset=UTF-8',accept:'text/x-component','next-action':actionIds[name],origin:(await runtime.ready).origin,...extra},body:JSON.stringify([args])});
  const text=await response.text();
  for(const prohibited of ['123:synthetic','synthetic_secret','PRIVATE']) assert.ok(!text.includes(prohibited));
  const row=text.split('\n').find(line=>line.includes('"status":'));
  const envelope=row?JSON.parse(row.slice(row.indexOf(':')+1)):null;
  return {response,text,result:envelope?.returnValue?.data??envelope};
}
async function check(name,args,status,principal='owner') {
  const {response,result,text}=await action(name,args,principal);
  assert.equal(response.status,200,`${name}: ${text.slice(0,300)}`);assert.equal(result?.status,status,JSON.stringify(result));return result;
}
try {
  for(const principal of ['owner','other']) {
    const page=await runtime.dispatchFetch(`${origin}/setup`,{headers:identity(principal)}),text=await page.text();
    assert.equal(page.status,200);assert.ok(page.headers.get('cache-control')?.includes('no-store'));
    assert.equal(text.includes('Inspect bot'),principal==='owner');assert.ok(!text.includes('123:synthetic'));assert.equal(calls.length,0);
  }
  for(const name of Object.keys(actionIds)) {
    for(const principal of ['', 'other']) await check(name,name==='verifyTelegramOwner'?{nonce}:{},'error',principal);
    await check(name,{unexpected:'value'},'error');
  }
  assert.equal(calls.length,0);
  const protectedRequest=await action('inspectTelegramSetup',{},'owner',{origin:'https://unrelated.example'});
  assert.equal(protectedRequest.response.status,403);assert.equal(calls.length,0);
  const oversized=await action('inspectTelegramSetup',{extra:'x'.repeat(1024*1024+1)});
  assert.ok(oversized.response.status>=400);assert.equal(calls.length,0);
  assert.equal((await check('inspectTelegramSetup',{},'inspected')).webhook,'absent');
  assert.equal((await check('verifyTelegramOwner',{nonce},'candidate')).candidate_user_id,'456');
  updates=[];await check('verifyTelegramOwner',{nonce},'no_match');
  updates=[message,message];await check('verifyTelegramOwner',{nonce},'ambiguous');
  updates=Array.from({length:100},()=>message);await check('verifyTelegramOwner',{nonce},'incomplete');
  await check('registerTelegramWebhook',{},'error');assert.ok(!calls.some(c=>c.method==='setWebhook'));
  // Apply synthetic final settings as a new Worker configuration; production
  // settings, keys, subscriptions and Site are never involved.
  await runtime.dispose();bindings.TELEGRAM_BOT_INFO=JSON.stringify(bot);bindings.TELEGRAM_OWNER_USER_ID='456';runtime=new Miniflare(options);
  await check('verifyTelegramOwner',{nonce},'owner_configured');
  await check('registerTelegramWebhook',{},'registered');assert.equal(calls.filter(c=>c.method==='setWebhook').length,1);
  await check('registerTelegramWebhook',{},'already_configured');assert.equal(calls.filter(c=>c.method==='setWebhook').length,1);
  webhook={...webhook,url:'https://other.example/PRIVATE'};
  assert.equal((await check('inspectTelegramSetup',{},'inspected')).webhook,'another_destination');
  await check('registerTelegramWebhook',{},'conflict');assert.equal(calls.filter(c=>c.method==='setWebhook').length,1);
  webhook=absent;writeTimeout=true;await check('registerTelegramWebhook',{},'uncertain');
  assert.equal(calls.filter(c=>c.method==='setWebhook').length,2);
  assert.equal((await check('inspectTelegramSetup',{},'inspected')).webhook,'matching');
  const db=await runtime.getD1Database('DB');
  assert.equal((await db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").first()).n,0);
  console.log(JSON.stringify({scenario:'setup-framework-actions',result:'pass',setupStorageWrites:0,automaticWriteRetries:0}));
} finally {await runtime.dispose();}
