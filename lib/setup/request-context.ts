import { AsyncLocalStorage } from 'node:async_hooks';
import { Failure } from '../runtime/config';

// The original Worker Request URL, before framework routing. Request-local only;
// never derive the destination from action arguments or forwarded headers.
const requestUrls = new AsyncLocalStorage<string>();
export function withSetupRequest<T>(request: Request, run: () => T): T {
  return requestUrls.run(request.url, run);
}
export function currentWebhookUrl(): string {
  const raw = requestUrls.getStore();
  if (!raw) throw new Failure('site_url_unavailable');
  const url = new URL('/telegram/webhook', raw);
  if (url.protocol !== 'https:') throw new Failure('site_url_unavailable');
  return url.href;
}
