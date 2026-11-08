import { requireChatGPTUser } from '../chatgpt-auth';
import { env } from 'cloudflare:workers';
import type { Env } from '../../lib/runtime/config';
import { authorizeSetup } from '../../lib/setup/service';
import SetupControls from './controls';
export const dynamic='force-dynamic';
export default async function Setup() {
  const user=await requireChatGPTUser('/setup'),runtime=env as Env;
  let authorized=false;
  try {authorizeSetup(runtime,user.userId);authorized=true;} catch {}
  return <main><h1>Dotagram setup</h1><p>Your signed-in Site identity:</p><code>{user.userId}</code>
    <p>The owner uses their own identity when configuring Dotagram. Signing in does not grant Telegram access.</p>
    {authorized && <><h2>Configuration</h2><ul>{(['DB','TELEGRAM_BOT_TOKEN','TELEGRAM_OWNER_USER_ID','TELEGRAM_BOT_INFO','TELEGRAM_WEBHOOK_SECRET','SUBSCRIPTION_ENCRYPTION_KEY','CALLBACK_ALLOWED_ORIGINS'] as const)
      .map(key=><li key={key}>{key}: {runtime[key]?'configured':'missing'}</li>)}</ul>
      <p>Change settings through the Site environment. Deploy the revision to apply changes. Keep the encryption key stable across redeployments.</p>
      <SetupControls ownerConfigured={!!runtime.TELEGRAM_OWNER_USER_ID}/></>}
  </main>;
}
