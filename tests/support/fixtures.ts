import type { Env } from '../../lib/runtime/config';
export const botInfo={id:123,is_bot:true,first_name:'Synthetic',username:'synthetic_bot',can_join_groups:false,can_read_all_group_messages:false,supports_inline_queries:false};
export const secret=`whsec_${Buffer.alloc(32,7).toString('base64')}`;
export function env(DB:D1Database):Env {return {DB,OWNER_USER_ID:'owner',SITES_IDENTITY_VERIFIED:'true',TELEGRAM_BOT_TOKEN:'123:synthetic',
  TELEGRAM_BOT_INFO:JSON.stringify(botInfo),TELEGRAM_OWNER_USER_ID:'456',TELEGRAM_WEBHOOK_SECRET:'synthetic_secret',
  SUBSCRIPTION_ENCRYPTION_KEY:Buffer.alloc(32,5).toString('base64'),CALLBACK_ALLOWED_ORIGINS:'https://receiver.example.com'};}
export function update() {return {update_id:10,message:{message_id:20,date:1794000000,chat:{id:456,type:'private'},from:{id:456,is_bot:false},text:'Synthetic owner text'}};}
export function subscription() {return {name:'telegram.message.created',arguments:{},delivery:{mode:'webhook',url:'https://receiver.example.com/callback',secret}};}
export function rpc(method:string,params:Record<string,unknown>={},principal='owner') {
  return new Request('https://site.example/mcp',{method:'POST',headers:{'content-type':'application/json',Accept:'application/json','Mcp-Method':method,
    ...(typeof params.name==='string'?{'Mcp-Name':params.name}:{}),'MCP-Protocol-Version':'2026-07-28','oai-authenticated-user-id':principal},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28',
      'io.modelcontextprotocol/clientInfo':{name:'synthetic-test',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}})});
}
