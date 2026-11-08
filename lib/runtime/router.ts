import { handleMcp } from '../mcp/server';
import { receiveTelegram } from '../telegram/receiver';
import { deliverEvent } from '../events/delivery';
import type { Env } from './config';
export async function route(request:Request,env:Env,ctx?:Pick<ExecutionContext,'waitUntil'>):Promise<Response|null> {
  const path=new URL(request.url).pathname;
  if(path==='/health') return Response.json({service:'Dotagram',status:'ok'});
  if(!['/mcp','/telegram/webhook'].includes(path)) return null;
  if(request.method!=='POST') return new Response(null,{status:405,headers:{Allow:'POST'}});
  try {
    if(path==='/mcp') return await handleMcp(request,env);
    return await receiveTelegram(request,env,Date.now(),ctx?(event,at)=>{
      ctx.waitUntil(deliverEvent(env,event,at).catch(()=>{console.error('delivery_unavailable');}));
    }:undefined);
  } catch {return Response.json({error:'service_unavailable'},{status:503});}
}
