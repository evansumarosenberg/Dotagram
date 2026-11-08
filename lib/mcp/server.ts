import { createMcpHandler, McpServer, ProtocolError } from '@modelcontextprotocol/server';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker';
import { z } from 'zod';
import { owner, Failure, type Env } from '../runtime/config';
import { TelegramService, sendSchema, editSchema, targetSchema, reactionSchema, sentSchema, targetResultSchema,
  reactionResultSchema, connectionSchema } from '../telegram/service';
import { eventDefinitions } from '../telegram/normalize';
import { subscribe, unsubscribe } from '../events/subscriptions';

const objectResult=z.record(z.string(),z.unknown());
async function tool(operation:()=>Promise<Record<string,unknown>>) {
  try {const output=await operation();return {content:[{type:'text' as const,text:JSON.stringify(output)}],structuredContent:output};}
  catch(e) {return {isError:true,content:[{type:'text' as const,text:JSON.stringify({error:e instanceof Failure?e.category:e instanceof z.ZodError?'invalid_arguments':'operation_failed',retry_after:e instanceof Failure?e.retryAfter:undefined})}]};}
}
export function server(env:Env,principal:string) {
  const capabilities={tools:{},events:{}};
  const mcp=new McpServer({name:'Dotagram',version:'0.1.0'},{capabilities,jsonSchemaValidator:new CfWorkerJsonSchemaValidator()});
  const telegram=()=>new TelegramService(env);
  const write={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true};
  mcp.registerTool('telegram_get_connection_info',{description:'Verify this bot identity and report the fixed owner DM capabilities. Does not check whether the owner blocked the bot.',
    inputSchema:z.object({}).strict(),outputSchema:connectionSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},()=>tool(()=>telegram().connection()));
  mcp.registerTool('telegram_send_message',{description:'Send plain text once to the owner DM, optionally replying to an exact message. Save the returned signed message_reference for future edits/deletes. ambiguous_write can mean the send succeeded; no history lookup or automatic resend is available.',
    inputSchema:sendSchema,outputSchema:sentSchema,annotations:write},input=>tool(()=>telegram().send(input,principal)));
  mcp.registerTool('telegram_edit_message',{description:'Replace bot-message text using its signed reference. Preserves original provenance. One write attempt; ambiguous_write cannot be resolved by history lookup.',
    inputSchema:editSchema,outputSchema:targetResultSchema,annotations:{...write,destructiveHint:true}},input=>tool(()=>telegram().edit(input,principal)));
  mcp.registerTool('telegram_delete_message',{description:'Delete a bot message using its signed reference. Cannot authorize deletion of owner messages. Telegram age and permission limits still apply. No stored-result replay.',
    inputSchema:targetSchema,outputSchema:targetResultSchema,annotations:{...write,destructiveHint:true}},input=>tool(()=>telegram().delete(input,principal)));
  mcp.registerTool('telegram_set_reaction',{description:'Set one ordinary bot emoji reaction on a message in the owner DM, or null to clear. Accepts raw message IDs, including owner messages. Confirms requested state without claiming a historical comparison.',
    inputSchema:reactionSchema,outputSchema:reactionResultSchema,annotations:{...write,idempotentHint:true}},input=>tool(()=>telegram().reaction(input)));
  mcp.server.setRequestHandler('events/list',{params:objectResult,result:objectResult},async()=>({events:eventDefinitions()}));
  mcp.server.setRequestHandler('events/subscribe',{params:objectResult,result:objectResult},async params=>{
    try {return await subscribe(env,principal,params);}
    catch(e) {
      const reason=e instanceof z.ZodError?'invalid_subscription_arguments':e instanceof Failure?e.category:'subscription_failed';
      throw new ProtocolError(reason.startsWith('callback_')||reason==='challenge_failed'?-32015:-32602,'Subscription rejected',{reason});
    }
  });
  mcp.server.setRequestHandler('events/unsubscribe',{params:objectResult,result:objectResult},async params=>{
    try {return await unsubscribe(env,principal,params);}
    catch(e) {throw new ProtocolError(e instanceof z.ZodError?-32602:-32603,'Unsubscribe failed');}
  });
  mcp.server.registerCapabilities({tools:{listChanged:false}});
  return mcp;
}
export async function handleMcp(request:Request,env:Env) {
  let principal:string;
  try {principal=owner(request,env);}
  catch(e) {return Response.json({error:e instanceof Failure?e.category:'unauthorized'},{status:e instanceof Failure&&e.category==='unauthorized'?403:503,headers:{'Cache-Control':'private, no-store'}});}
  const handler=createMcpHandler(()=>server(env,principal),{legacy:'reject',responseMode:'auto',maxRequestBodySize:65536,maxSubscriptions:0,keepAliveMs:0});
  const response=await handler.fetch(request);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
