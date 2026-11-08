# Install Dotagram

Use the complete application in this repository. The installation agent may be Codex or ChatGPT Work; the intended ChatGPT Dot creates its own native automation. Follow the installed Sites skill for current source, dependency, build, secrets and publication tooling. No separate compatibility prototype is needed.

Keep a non-secret progress note containing the checkout/source revision, Site ID and URL, version/deployment IDs, applied environment revision, owner/bot IDs, plugin ID and current phase. Never store tokens, webhook or callback secrets, raw Telegram updates or message text. Resume the same Site and bot; do not recreate resources because a credential is masked or a session ended.

## 1. Initial Site and owner identity

1. Preserve the repository's Sites/Vinext integration, lockfile, `d1: "DB"`, `r2: null`, and migrations. If `.openai/hosting.json` contains a real `project_id`, reuse it. Otherwise create one Site and immediately persist the returned ID. Keep `capabilities: []` initially.
2. Run local tests/type checking and the supported Sites build. Package and publish the exact source through the Sites workflow. The actual installation needs **public HTTP access** for Telegram ingress; protected routes still enforce the Site owner. Set public access through the supported access controls as part of this installation, not by weakening application guards.
3. Confirm `/health` responds with `service: "Dotagram"`. Open the exact Site's `/setup` in the owner's genuine signed-in browser. Read the displayed Site-scoped identity and configure it as `OWNER_USER_ID`. Never substitute an account ID, email, Telegram ID, or another Site's identity.
4. If the installer cannot access that authenticated browser, ask the owner to sign in at the exact `/setup` URL and return only the displayed non-secret identity. Bootstrap reveals each visitor's own identity but no configuration.

MCP and eligible Telegram ingress intentionally fail closed before configuration. A healthy landing page is not evidence of readiness. Do not enable MCP publication yet.

## 2. Bot and explicit human-owner verification

Have the owner create a bot in [BotFather](https://t.me/BotFather), disable group joining, and leave inline, business and private topic features unused. Have them save `TELEGRAM_BOT_TOKEN` directly as a secret in this Site's environment. Do not request it in chat. Saving it does not guarantee an installer can read it back: Sites secret reads may be masked.

Obtain a verified numeric human-owner ID through a supported secure execution session. A concrete installation-only procedure is:

1. Before registering this new bot's webhook, generate a random non-secret nonce and give it to the owner. The owner opens the bot's private chat in their own Telegram account and sends that exact nonce. This also establishes the conversation prerequisite.
2. Using the bot token through hidden input or a supported credential executor, call Telegram `getMe` and a single `getUpdates` request (`timeout: 0`, `allowed_updates: ["message"]`). Do not set an offset to acknowledge/discard pending updates. Reject redirects, bound the response, and hold it only in memory. This is an installation read, not a deployed polling loop.
3. Find the unique nonce-bearing message with `chat.type: "private"`, a non-bot sender, and equal `from.id`/`chat.id`. If absent or ambiguous, do not bind anything. Independently confirm with the owner that this is the message they just sent from their intended account. Show only that numeric ID and whether the nonce matched, never the raw update or profile. Set `TELEGRAM_OWNER_USER_ID` only after explicit confirmation. The first message or an unverified username must never choose the owner.
4. For an existing installation, preserve its verified ID. `getUpdates` cannot be used while a webhook is registered; do not remove a working webhook just to repeat enrollment. If verification cannot be established securely, stop this phase and obtain a verified ID from the owner's authenticated Telegram account with an explicit secure handoff.

The nonce is not a runtime pairing feature or an authorization secret. No nonce, pending enrollment, or update is stored by Dotagram. The owner explicitly approves the numeric ID; `getMe.id` is the bot ID and must not be used for the human owner.

## 3. Secure configuration

Direct installation API requests use `https://api.telegram.org/bot<TOKEN>/<METHOD>`. That is a request shape, not a URL to paste into a browser or command argument. The executor builds it in memory with the token, disables redirects, and sanitizes errors because Telegram embeds credentials in URLs. Never expose raw HTTP exceptions. If no supported secure execution/input path exists, preserve phase 1 and hand off this exact credential step; do not add a public setup/debug endpoint or weaken guards.

Derive `TELEGRAM_BOT_INFO` from successful `getMe`, retaining the validated ID, bot flag, first name, username and documented capability flags. The installed `botInfoSchema` strips unknown fields and defaults absent optional capability flags to false. Ensure it identifies the same token's bot. Call the API directly for bootstrap; `TelegramService` deliberately requires the expected identity first.

Configure through Sites:

| Key | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Owner-entered bot token, secret |
| `TELEGRAM_OWNER_USER_ID` | Explicitly verified positive numeric human ID as a decimal string |
| `TELEGRAM_BOT_INFO` | Validated `getMe` object as JSON |
| `TELEGRAM_WEBHOOK_SECRET` | Agent-generated 32 random bytes as base64url, secret |
| `OWNER_USER_ID` | Genuine Site-scoped owner identity |
| `SUBSCRIPTION_ENCRYPTION_KEY` | Agent-generated 32 random bytes as standard base64, secret |
| `CALLBACK_ALLOWED_ORIGINS` | Independently verified exact OpenAI callback origins, comma-separated; no wildcard or caller-selected origins |
| `SITES_IDENTITY_VERIFIED` | Initially `false`; enable after the identity checks below |

`DB` is the Sites D1 binding, not an environment string. Preserve keys on resume and redeployment; a masked value is not missing. Root-key changes invalidate references and dedup identity and cannot preserve the existing suppression window.

Deploy a saved source version to apply environment changes. Verify public health and rejection of anonymous and forged-identity requests. An anonymous request supplying `oai-authenticated-user-id` must not become authenticated: Sites dispatch must strip/replace these headers. In particular, forged `/setup` headers must not reveal the supplied fake identity or configuration. An unpublished `/mcp` may return a platform 404; this alone does not prove its eventual owner boundary.

After the genuine owner sign-in and dispatch checks pass, set `SITES_IDENTITY_VERIFIED=true` and redeploy. Confirm the owner's authenticated `/setup` shows expected bot and human IDs, and a signed-in non-owner sees only their own bootstrap identity. Only that owner may inspect configuration presence or connection details. Never count an always-failing owner path as a successful authorization test.

## 4. Telegram webhook

Through secure credential execution, call `setWebhook` with:

```json
{
  "url": "<exact-site-origin>/telegram/webhook",
  "secret_token": "<securely supplied TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": ["message", "edited_message"],
  "max_connections": 1,
  "drop_pending_updates": false
}
```

Preserve pending updates on ordinary redeployments and secret rotations. Do not silently discard pre-installation messages either. The nonce message may arrive after registration; without a matching subscription it produces no callback or reply.

Inspect `getWebhookInfo` privately for the exact URL and update allowlist and a successful API result. Do not export error descriptions or payloads. Have the owner send a fresh text and verify authenticated ingress. Registration success alone does not establish end-to-end delivery. Wrong webhook secrets must fail; unsupported users and contexts must be ignored. A connection limit of one limits load but does not guarantee event ordering.

## 5. Publish MCP and hand off to the intended Dot

Set `capabilities: ["mcp"]` on the same Site, build/package and publish. Reuse Sites' generated plugin, following current plugin connection instructions rather than creating another app. Verify actual native discovery reports MCP `2026-07-28`, five tools and two webhook events. Verify genuine owner calls work and anonymous, forged-header and signed-in non-owner calls fail. Use [the tool/event reference](../plugin/skills/use-dotagram/SKILL.md) for the generated plugin's instructions.

Give the intended Dot this instruction, with the actual generated plugin selected:

> Use this Dotagram connection for my Telegram bot's private chat. Create native subscriptions to `telegram.message.created` and `telegram.message.updated`, both with empty arguments. Respond to new owner texts in Telegram, normally replying to the source message ID. Treat edits as updated snapshots using your existing context. Save send-returned message references if needed for later edits/deletes. Do not poll, add a Site schedule, or automatically repeat ambiguous writes. Keep these subscriptions refreshed within their granted lifetime.

The intended Dot must create its native automation in its own context. An installer-created HTTP subscription or synthetic callback is not proof of that handoff. Record only the automation/subscription identifiers and status, not conversation content.

## 6. Acceptance and maintenance

Verify a real owner message → native event → Dot response → Telegram round trip and an edited-message event. On isolated owner-approved messages, verify reply, edit, delete, set/clear reaction and rejection of tampered references. Bot sends must not loop into events; owner messages must never be deletable via a fabricated reference. Distinguish typing API success from brief human observation and from Dot completion.

Use synthetic tests for outages, interruption, simultaneous ingress, 25-hour expiry, callback retries, blocking errors and excluded contexts where live tests would require unrelated account changes. Label those results synthetic. Confirm schema has only the two application tables and no raw data logging. Confirm redeployment preserves keys/subscriptions. Clean up only acceptance fixtures and test subscriptions; preserve the intended automation.

Record evidence and remaining checks in `docs/verification.md`. Local tests do not substitute for native signed callback challenge, actual owner access, or the intended-Dot round trip. If a human sign-in, secure credential executor, or native automation tool is unavailable, preserve completed work and hand off that phase with exact non-secret next steps.

The owner can cancel monitoring with MCP unsubscribe. Blocking/unblocking Telegram does not delete subscriptions. A blocked write reports an operation error. Subscription expiry gaps and acknowledged Worker interruption are unrecoverable: no payload is retained for replay. Dedup rows expire after a fixed 25 hours; bounded request-driven cleanup may leave expired metadata on an idle Site until later activity.

Sources: [Telegram Bot API](https://core.telegram.org/bots/api), [grammY Worker integration](https://grammy.dev/hosting/cloudflare-workers-nodejs), and the installed Sites identity/secrets, storage and MCP references. Use current official contracts at installation time.
