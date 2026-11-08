import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { canonical, equal } from '../runtime/crypto';
import { Failure, type Env } from '../runtime/config';
import { binding, decimalId, encryptionKey } from './config';
import { messageId } from './normalize';

const provenance=z.object({v:z.literal(1),principal:z.string().min(1),bot_id:decimalId,chat_id:decimalId,
  message_id:messageId,sent_at:z.iso.datetime()}).strict();
function signature(env:Env,payload:string) {
  const key=createHmac('sha256',encryptionKey(env)).update('dotagram-message-reference-key-v1').digest();
  return createHmac('sha256',key).update(payload).digest('base64url');
}
export function issueReference(env:Env,principal:string,id:number,sentAt:string) {
  const {botId,ownerId}=binding(env);
  const data=provenance.parse({v:1,principal,bot_id:botId,chat_id:ownerId,message_id:id,sent_at:sentAt});
  const payload=Buffer.from(canonical(data)).toString('base64url');
  return `${payload}.${signature(env,payload)}`;
}
export function readReference(env:Env,principal:string,value:string) {
  try {
    if(value.length>2048) throw new Error();
    const [payload,sig,...extra]=value.split('.');
    if(extra.length || !payload || !sig || !equal(signature(env,payload),sig)) throw new Error();
    const data=provenance.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')));
    const {botId,ownerId}=binding(env);
    if(data.principal!==principal || principal!==env.OWNER_USER_ID || data.bot_id!==botId || data.chat_id!==ownerId) throw new Error();
    return data;
  } catch { throw new Failure('invalid_message_reference'); }
}
