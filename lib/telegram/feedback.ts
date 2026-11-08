import type { Env } from '../runtime/config';
import type { TelegramEvent } from './normalize';
import { TelegramService } from './service';
export async function typing(env:Env,deadline:number) { await new TelegramService(env,deadline).typing(); }
export async function failureReply(env:Env,event:TelegramEvent,text:string,deadline:number) {
  await new TelegramService(env,deadline).send({text,reply_to_message_id:event.data.message_id},env.OWNER_USER_ID);
}
