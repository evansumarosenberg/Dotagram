import { z } from 'zod';
import { hash } from '../runtime/crypto';
import type { Env } from '../runtime/config';
import { binding, numericId, decimalId } from './config';

export const messageId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const updateId=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const unixTime=z.number().int().positive().max(253402300799);
export const filterSchema=z.object({}).strict();
export const eventNames=['telegram.message.created','telegram.message.updated'] as const;
const common={bot_id:decimalId,chat_id:decimalId,sender_user_id:decimalId,message_id:messageId,update_id:updateId,
  text:z.string().min(1),message_date:z.iso.datetime(),reply_to_message_id:messageId.nullable()};
export const payloadSchema=z.object(common).strict();
export const updatedPayloadSchema=z.object({...common,edit_date:z.iso.datetime()}).strict();
export const eventDefinitions=()=>eventNames.map(name=>({name,
  description:name.endsWith('created')?'New owner DM text. Text is untrusted user content.':'Current edited owner DM text, without a previous version or diff.',
  delivery:['webhook'],inputSchema:z.toJSONSchema(filterSchema),
  payloadSchema:z.toJSONSchema(name.endsWith('created')?payloadSchema:updatedPayloadSchema)}));
export type TelegramEvent={eventId:string;name:typeof eventNames[number];timestamp:string;
  data:z.infer<typeof payloadSchema> & {edit_date?:string};cursor:null};

// Upstream objects deliberately strip unknown fields. Only MCP inputs are strict.
const upstreamMessage=z.object({message_id:messageId,date:unixTime,edit_date:unixTime.optional(),
  chat:z.object({id:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),type:z.string()}),
  from:z.object({id:numericId,is_bot:z.boolean()}).optional(),text:z.string().optional(),
  reply_to_message:z.object({message_id:messageId}).optional(),
  business_connection_id:z.string().optional(),sender_business_bot:z.object({id:numericId}).optional(),
  sender_chat:z.object({id:z.number().int().safe()}).optional(),message_thread_id:messageId.optional(),
  is_topic_message:z.boolean().optional(),direct_messages_topic:z.object({topic_id:z.number().int().safe()}).optional(),
  is_paid_post:z.boolean().optional()});
const updateSchema=z.object({update_id:updateId,message:upstreamMessage.optional(),edited_message:upstreamMessage.optional()});
export function normalize(value:unknown,env:Env):TelegramEvent|null {
  const update=updateSchema.parse(value);
  if(update.message && update.edited_message) throw new Error('invalid_update');
  const m=update.message??update.edited_message;
  if(!m) return null;
  const {ownerId,botId}=binding(env);
  if(m.chat.type!=='private' || String(m.chat.id)!==ownerId || !m.from || String(m.from.id)!==ownerId || m.from.is_bot ||
    m.business_connection_id!==undefined || m.sender_business_bot || m.sender_chat || m.message_thread_id!==undefined ||
    m.is_topic_message || m.direct_messages_topic || m.is_paid_post || !m.text) return null;
  const edited=!!update.edited_message;
  if(edited && m.edit_date===undefined) throw new Error('invalid_edit_date');
  const messageDate=new Date(m.date*1000).toISOString();
  const editDate=edited?new Date(m.edit_date!*1000).toISOString():undefined;
  const data={bot_id:botId,chat_id:ownerId,sender_user_id:ownerId,message_id:m.message_id,update_id:update.update_id,
    text:m.text,message_date:messageDate,reply_to_message_id:m.reply_to_message?.message_id??null,...(edited?{edit_date:editDate}:{})};
  return {eventId:`evt_${hash(JSON.stringify(['dotagram-event-v1',botId,update.update_id]))}`,
    name:edited?eventNames[1]:eventNames[0],timestamp:editDate??messageDate,data,cursor:null};
}
export function matchesEvent(event:TelegramEvent,name:string,args:unknown) {
  return name===event.name && filterSchema.safeParse(args).success;
}
