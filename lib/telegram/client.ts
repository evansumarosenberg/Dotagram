import { Bot } from 'grammy';
import { boundedText, Failure, type Env } from '../runtime/config';
import { telegramConfig } from './config';
import { TELEGRAM_CALL_MS } from '../events/budget';

export type TelegramFetch=(url:string,init:RequestInit)=>Promise<Response>;
export function telegramClientOptions(deadline=Infinity,transport:TelegramFetch=(url,init)=>globalThis.fetch(url,init)) {
  return {timeoutSeconds:5,canUseWebhookReply:()=>false,sensitiveLogs:false,
    fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{
      const remaining=Math.min(TELEGRAM_CALL_MS,deadline-Date.now());
      if(remaining<=0) throw new Failure('execution_deadline');
      // grammY's Node entry uses an AbortSignal polyfill. Bridge its events to
      // a native controller; AbortSignal.any rejects that polyfill in Node.
      const controller=new AbortController();
      const abort=()=>controller.abort();
      if(init?.signal?.aborted) abort();
      init?.signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(abort,Math.max(1,Math.floor(remaining)));
      // Buffer a bounded response while the abort signal remains active. Raw
      // grammY errors and token-bearing URLs must never reach logs or callers.
      try {
        const response=await transport(String(url),{method:init?.method,headers:init?.headers,body:init?.body,cache:'no-store',redirect:'manual',signal:controller.signal});
        if(response.status>=300 && response.status<400) {void response.body?.cancel().catch(()=>{});throw new Failure('telegram_redirect_blocked');}
        const body=await boundedText(response,262144);
        return new Response(body,{status:response.status,headers:response.headers});
      } finally {clearTimeout(timer);init?.signal?.removeEventListener('abort',abort);}
    }};
}
export function createBot(env:Env,deadline=Infinity,transport?:TelegramFetch) {
  const {botInfo}=telegramConfig(env);
  return new Bot(env.TELEGRAM_BOT_TOKEN,{botInfo,client:telegramClientOptions(deadline,transport)});
}
