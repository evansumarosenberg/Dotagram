// Exercise the built application with synthetic outbound services only. No test
// routes, transport overrides, fixtures or credentials enter the production bundle.
import {Miniflare} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {Webhook} from 'standardwebhooks';
const scenario=process.argv.find(v=>v.startsWith('--scenario='))?.split('=')[1]??'success';
assert.ok(['success','retry','exhaustion','permanent','rate-limit','timeout','interrupt','fanout','duplicate','notice-failure'].includes(scenario));
const root=resolve('dist/server'),secret=`whsec_${Buffer.alloc(32,7).toString('base64')}`;
const bot={id:123,is_bot:true,first_name:'Synthetic',username:'synthetic_bot',can_join_groups:false,can_read_all_group_messages:false,supports_inline_queries:false};
const bindings={OWNER_USER_ID:'owner',SITES_IDENTITY_VERIFIED:'true',TELEGRAM_BOT_TOKEN:'123:synthetic',TELEGRAM_BOT_INFO:JSON.stringify(bot),
  TELEGRAM_OWNER_USER_ID:'456',TELEGRAM_WEBHOOK_SECRET:'synthetic_secret',SUBSCRIPTION_ENCRYPTION_KEY:Buffer.alloc(32,5).toString('base64'),CALLBACK_ALLOWED_ORIGINS:'https://receiver.example.com'};
const modules=readdirSync(root,{recursive:true}).filter(f=>String(f).endsWith('.js')).map(String).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
let callbacks=0,typing=0,notices=0,verified=0,ack=false,inflight=0,maxInflight=0;
let release;const gate=new Promise(r=>{release=r;});const pause=ms=>new Promise(r=>setTimeout(r,ms));
const sent=(text,id=99)=>({message_id:id,date:1794000000,from:{id:123,is_bot:true},chat:{id:456,type:'private'},text});
const options={modules:modules.map(file=>({type:'ESModule',path:resolve(root,file)})),modulesRoot:root,
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],d1Persist:resolve('.wrangler/smoke',crypto.randomUUID()),
  assets:{directory:resolve('dist/client'),routerConfig:{has_user_worker:true}},bindings,
  outboundService:async request=>{
    const url=new URL(request.url);
    if(url.origin==='https://receiver.example.com') {
      const raw=await request.text(),headers=Object.fromEntries(request.headers),payload=new Webhook(secret).verify(raw,headers);
      if(payload.type==='verification') {verified++;return Response.json({challenge:payload.challenge});}
      callbacks++;assert.equal(payload.data.text,'Synthetic owner text');assert.equal(payload.eventId,headers['webhook-id']);
      assert.equal(payload.data.chat_id,'456');assert.equal(payload.cursor,null);
      await gate;assert.ok(ack);
      if(scenario==='timeout'||scenario==='interrupt') {await pause(8000);return new Response(null,{status:503});}
      if(scenario==='fanout') {inflight++;maxInflight=Math.max(maxInflight,inflight);await pause(100);inflight--;}
      const status=scenario==='permanent'?410:scenario==='rate-limit'?429:['exhaustion','notice-failure'].includes(scenario)?503:scenario==='retry'&&callbacks===1?503:204;
      return new Response(null,{status,headers:scenario==='rate-limit'?{'retry-after':'60'}:{}});
    }
    assert.equal(url.origin,'https://api.telegram.org');const method=url.pathname.split('/').at(-1),body=await request.json();
    if(method==='getMe') return Response.json({ok:true,result:bot});
    assert.equal(body.chat_id,456);
    if(method==='sendChatAction') {assert.ok(callbacks>0);assert.equal(body.action,'typing');typing++;return Response.json({ok:true,result:true});}
    if(method==='sendMessage') {
      if(body.text.includes("couldn't confirm")) {notices++;assert.equal(body.reply_parameters.message_id,20);
        if(scenario==='notice-failure') return Response.json({ok:false,error_code:403,description:'blocked'});}
      return Response.json({ok:true,result:{...sent(body.text),...(body.reply_parameters?{reply_to_message:{message_id:body.reply_parameters.message_id}}:{})}});
    }
    if(method==='editMessageText') return Response.json({ok:true,result:sent(body.text,body.message_id)});
    assert.ok(['deleteMessage','setMessageReaction'].includes(method));return Response.json({ok:true,result:true});
  }};
let runtime=new Miniflare(options);
try {
  assert.equal((await runtime.dispatchFetch('http://localhost/health')).status,200);
  let db=await runtime.getD1Database('DB');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
    for(const sql of readFileSync(`drizzle/${file}`,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await db.prepare(sql).run();
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results.map(r=>r.name).sort();
  assert.deepEqual(tables,['event_dedup','subscriptions']);
  for(const principal of ['owner','other']) {
    const page=await runtime.dispatchFetch('http://localhost/setup',{headers:{'oai-authenticated-user-id':principal,'oai-authenticated-user-email':'synthetic@example.com'}});
    const html=await page.text();assert.equal(page.status,200);assert.equal(html.includes('TELEGRAM_BOT_TOKEN'),principal==='owner');
    assert.ok(!html.includes('123:synthetic')&&!html.includes('synthetic_secret'));
  }
  async function rpc(method,params={},principal='owner') {
    const response=await runtime.dispatchFetch('http://localhost/mcp',{method:'POST',headers:{'content-type':'application/json',Accept:'application/json','Mcp-Method':method,'Mcp-Name':params.name??'','MCP-Protocol-Version':'2026-07-28','oai-authenticated-user-id':principal},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'synthetic-worker',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}})});
    if(principal!=='owner') {assert.equal(response.status,403);return;}
    const json=await response.json();assert.equal(response.status,200);assert.equal(json.error,undefined,JSON.stringify(json));return json.result;
  }
  await rpc('tools/list',{},'other');await rpc('tools/list',{},'');
  assert.ok((await rpc('server/discover')).supportedVersions.includes('2026-07-28'));
  assert.equal((await rpc('tools/list')).tools.length,5);assert.equal((await rpc('events/list')).events.length,2);
  async function tool(name,args={}) {const result=await rpc('tools/call',{name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent;}
  assert.equal((await tool('telegram_get_connection_info')).bot_id,'123');
  const message=await tool('telegram_send_message',{text:'Synthetic outbound'});
  await tool('telegram_edit_message',{message_reference:message.message_reference,text:'Synthetic edited'});
  await tool('telegram_delete_message',{message_reference:message.message_reference});
  await tool('telegram_set_reaction',{message_id:20,emoji:'👀'});await tool('telegram_set_reaction',{message_id:20,emoji:null});
  const params={name:'telegram.message.created',arguments:{},ttlMs:null,delivery:{mode:'webhook',url:'https://receiver.example.com/callback',secret}};
  const sub=await rpc('events/subscribe',params);assert.ok(sub.id.startsWith('sub_'));assert.equal(verified,1);
  if(scenario==='fanout') for(let i=1;i<6;i++) await rpc('events/subscribe',{...params,delivery:{...params.delivery,url:`https://receiver.example.com/callback/${i}`}});
  const update={update_id:10,message:{message_id:20,date:1794000000,chat:{id:456,type:'private'},from:{id:456,is_bot:false},text:'Synthetic owner text'}};
  async function ingress(body=update,token='synthetic_secret') {return runtime.dispatchFetch('http://localhost/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':token},body:JSON.stringify(body)});}
  assert.equal((await ingress(update,'wrong')).status,403);
  assert.equal((await ingress({...update,message:{...update.message,from:{id:999,is_bot:false}}})).status,200);assert.equal(callbacks,0);
  const started=Date.now();assert.equal((await ingress()).status,200);const ackMs=Date.now()-started;assert.ok(ackMs<3000);ack=true;release();
  if(scenario==='interrupt') {
    while(!callbacks) await pause(10);
    await runtime.dispose();runtime=new Miniflare(options);db=await runtime.getD1Database('DB');
    const previous=callbacks;await runtime.dispatchFetch('http://localhost/health');await pause(150);assert.equal(callbacks,previous);
    assert.equal((await db.prepare('SELECT count(*) n FROM subscriptions').first()).n,1);
  } else {
    const success=['success','retry','fanout','duplicate'].includes(scenario);
    const end=started+28000;
    while(Date.now()<end && (success?typing===0:notices===0)) await pause(20);
    assert.equal(typing,success?1:0);assert.equal(notices,success?0:1);
    if(scenario==='duplicate') {await ingress();await pause(150);assert.equal(callbacks,1);assert.equal(typing,1);}
    if(scenario==='fanout') {while(callbacks<6&&Date.now()<end) await pause(20);assert.equal(callbacks,6);assert.ok(maxInflight<=4);}
    if(['permanent','rate-limit'].includes(scenario)) assert.equal(callbacks,1);
    if(['exhaustion','notice-failure'].includes(scenario)) assert.equal(callbacks,3);
    if(scenario==='retry') assert.equal(callbacks,2);
    assert.ok(Date.now()-started<27000);
  }
  const columns=(await db.prepare('PRAGMA table_info(event_dedup)').all()).results.map(r=>r.name);
  assert.deepEqual(columns,['key','state','claim_token','claim_expires_at','expires_at']);
  assert.ok(!JSON.stringify((await db.prepare('SELECT * FROM event_dedup').all()).results).includes('Synthetic owner text'));
  if(scenario==='success') {
    // Exercise the second event through the actual Worker/adapter, with no typing.
    const editParams={...params,name:'telegram.message.updated'};
    await rpc('events/subscribe',editParams);
    const before=callbacks;
    await ingress({update_id:11,edited_message:{...update.message,edit_date:1794000100}});
    const end=Date.now()+2000;
    while(callbacks===before&&Date.now()<end) await pause(10);
    assert.equal(callbacks,before+1);await pause(50);assert.equal(typing,1);
    const refresh=await rpc('events/subscribe',params);assert.equal(refresh.id,sub.id);
    await rpc('events/unsubscribe',{name:editParams.name,arguments:{},delivery:{mode:'webhook',url:params.delivery.url}});
  }
  await rpc('events/unsubscribe',{name:params.name,arguments:{},delivery:{mode:'webhook',url:params.delivery.url}});
  console.log(JSON.stringify({scenario,ackMs,callbacks,typing,notices,maxInflight,result:'pass'}));
} finally {release();await runtime.dispose();}
