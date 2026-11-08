import {it,expect,vi,afterEach} from 'vitest';
import {handleMcp} from '../../lib/mcp/server';
import {route} from '../../lib/runtime/router';
import {TelegramService,toolNames} from '../../lib/telegram/service';
import {eventNames} from '../../lib/telegram/normalize';
import {database} from '../support/database';
import {env,rpc,subscription} from '../support/fixtures';
afterEach(()=>vi.restoreAllMocks());
it('advertises modern discovery, exactly five tools and two strict webhook events',async()=>{
  const e=env(database().db);
  const discover=await (await handleMcp(rpc('server/discover'),e)).json() as any;
  expect(discover.error).toBeUndefined();expect(discover.result.supportedVersions).toContain('2026-07-28');
  expect(discover.result.capabilities).toEqual({tools:{listChanged:false},events:{}});
  const catalog=await (await handleMcp(rpc('tools/list'),e)).json() as any;
  expect(catalog.result.tools.map((t:any)=>t.name).sort()).toEqual([...toolNames].sort());
  for(const tool of catalog.result.tools) expect(tool.inputSchema.additionalProperties).toBe(false);
  expect(catalog.result.tools.find((t:any)=>t.name==='telegram_send_message').inputSchema.properties.text.maxLength).toBe(4096);
  const events=await (await handleMcp(rpc('events/list'),e)).json() as any;
  expect(events.result.events.map((v:any)=>v.name)).toEqual(eventNames);
  expect(events.result.events[0].inputSchema.additionalProperties).toBe(false);
  expect(events.result.events[0].delivery).toEqual(['webhook']);
});
it('rejects unauthorized discovery and operations before reading storage',async()=>{
  const e=env({} as D1Database);
  for(const who of ['', 'stranger']) for(const method of ['server/discover','tools/list','tools/call','events/list','events/subscribe','events/unsubscribe'])
    expect((await handleMcp(rpc(method,{},who),e)).status).toBe(403);
  expect((await handleMcp(rpc('tools/list'),{...e,SITES_IDENTITY_VERIFIED:''})).status).toBe(503);
  // Header authenticity belongs to Sites dispatch and requires hosted probes.
  expect(await route(new Request('https://site.example/internal/deliver',{method:'POST'}),e)).toBeNull();
});
it('rejects unknown fields, unsigned edits and subscription filters without logging payloads',async()=>{
  const e=env(database().db),info=vi.spyOn(console,'info').mockImplementation(()=>{});
  for(const [name,args] of [['telegram_send_message',{text:'sensitive',chat_id:123}],['telegram_edit_message',{message_id:20,text:'sensitive'}],['telegram_get_connection_info',{unknown:'sensitive'}]]) {
    const body=await (await handleMcp(rpc('tools/call',{name,arguments:args}),e)).json() as any;
    expect(body.error||body.result?.isError).toBeTruthy();
  }
  const body=await (await handleMcp(rpc('events/subscribe',{...subscription(),arguments:{unknown:'sensitive'}}),e)).json() as any;
  expect(body.error.data.reason).toBe('invalid_subscription_arguments');expect(JSON.stringify(body)).not.toContain('sensitive');
  expect(info).not.toHaveBeenCalled();
});
it('accepts native lifetime envelopes; callback failures are sanitized and unsubscribe stays available',async()=>{
  const e={...env(database().db),CALLBACK_ALLOWED_ORIGINS:''};
  vi.spyOn(TelegramService.prototype,'identity').mockResolvedValue({bot_id:'123',bot_username:'synthetic_bot',owner_user_id:'456'});
  const input={...subscription(),ttlMs:null};
  const body=await (await handleMcp(rpc('events/subscribe',input),e)).json() as any;
  expect(body.error.code).toBe(-32015);expect(body.error.data.reason).toBe('callback_policy_unconfigured');
  const stopped=await (await handleMcp(rpc('events/unsubscribe',{name:input.name,arguments:{},delivery:{mode:'webhook',url:input.delivery.url}}),{...e,TELEGRAM_BOT_INFO:''})).json() as any;
  expect(stopped.error).toBeUndefined();
});
