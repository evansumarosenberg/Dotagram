import { z } from 'zod';
import { Failure, requireConfig, type Env } from '../runtime/config';

export const numericId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const decimalId = z.string().regex(/^[1-9][0-9]{0,15}$/).refine(v => Number.isSafeInteger(Number(v)));
export const botInfoSchema = z.object({id:numericId,is_bot:z.literal(true),first_name:z.string(),username:z.string().min(1),
  can_join_groups:z.boolean(),can_read_all_group_messages:z.boolean(),supports_inline_queries:z.boolean(),
  can_connect_to_business:z.boolean().default(false),has_main_web_app:z.boolean().default(false),
  has_topics_enabled:z.boolean().default(false),allows_users_to_create_topics:z.boolean().default(false),
  can_manage_bots:z.boolean().default(false),supports_join_request_queries:z.boolean().default(false)});
export function binding(env:Env) {
  try {
    const ownerId=decimalId.parse(env.TELEGRAM_OWNER_USER_ID);
    const botInfo=botInfoSchema.parse(JSON.parse(env.TELEGRAM_BOT_INFO));
    if(String(botInfo.id)===ownerId) throw new Error();
    return {ownerId,botId:String(botInfo.id),botInfo};
  } catch { throw new Failure('invalid_telegram_configuration'); }
}
export function telegramConfig(env:Env) {
  requireConfig(env,['TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_INFO','TELEGRAM_OWNER_USER_ID']);
  const config=binding(env);
  if(!/^[1-9][0-9]*:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN) || env.TELEGRAM_BOT_TOKEN.split(':')[0]!==config.botId)
    throw new Failure('installation_mismatch');
  return config;
}
export function encryptionKey(env:Env) {
  const value=env.SUBSCRIPTION_ENCRYPTION_KEY;
  if(!value || Buffer.from(value,'base64').length!==32 || Buffer.from(value,'base64').toString('base64')!==value)
    throw new Failure('invalid_encryption_key');
  return Buffer.from(value,'base64');
}
