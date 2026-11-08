'use server';

import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../chatgpt-auth';
import type { Env } from '../../lib/runtime/config';
import { runSetupAction } from '../../lib/setup/service';
import { currentWebhookUrl } from '../../lib/setup/request-context';

export async function inspectTelegramSetup(args:unknown) {
  const user=await getChatGPTUser();
  return runSetupAction('inspect',args,env as Env,user?.userId??null,currentWebhookUrl);
}
export async function verifyTelegramOwner(args:unknown) {
  const user=await getChatGPTUser();
  return runSetupAction('verify',args,env as Env,user?.userId??null,currentWebhookUrl);
}
export async function registerTelegramWebhook(args:unknown) {
  const user=await getChatGPTUser();
  return runSetupAction('register',args,env as Env,user?.userId??null,currentWebhookUrl);
}
