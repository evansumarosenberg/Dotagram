# Dotagram specification

Status: design specification; implementation has not begun. All Dotagram compatibility checks below are pending.

Last updated: 2026-11-07

## 1. Purpose and baseline

Dotagram is a lightweight TypeScript bridge that lets a ChatGPT Dot receive messages from, and send messages to, its owner's Telegram bot DM. It uses grammY and runs entirely on ChatGPT Sites, with integrated D1 storage and request-scoped Cloudflare Worker background execution.

The Dot maintains its own persistent context and performs reasoning in ChatGPT. Dotagram transports individual messages and tool operations. It does not maintain a conversation, retrieve message history, accumulate context, or run a separate model.

The architectural baseline is the current SlackDot source reviewed at `D:\Projects\Vibe\SlackDot`, particularly its specification, installation guide, MCP server, event delivery, subscription lifecycle, deduplication, and tests. Preserve material decisions that are independent of Slack. Earlier SlackDot prototypes with stored events, outboxes, delivery histories, and write ledgers are superseded designs and must not be copied.

This document defines target behavior, not evidence that the Telegram integration works. SlackDot's acceptance results do not establish Dotagram compatibility. Writing this specification does not authorize starting implementation or deployment.

## 2. Accepted decisions

1. Use TypeScript and grammY for Telegram integration.
2. Use one Telegram bot and one explicitly configured, verified numeric Telegram human-owner ID per deployment.
3. Exactly one Dot controls the bot at a time. This is an operating constraint, not a distributed ownership or agent-routing system. Multiple subscriptions from that Dot are permitted.
4. Support only the owner's ordinary private bot conversation. Reject other users, groups, supergroups, channels, and business-account messaging. Do not enable private-chat forum topic mode for this version.
5. Support text messages only, including events for new and edited owner messages; bot message sending, editing, and deletion; and setting or clearing bot reactions.
6. Host the entire application on Sites. Use public HTTP reachability for Telegram ingress and server-side owner authorization for protected operations. Do not add external schedulers, separate delivery infrastructure, or a durable payload queue.
7. Preserve MCP 2.0 HTTP, protocol revision `2026-07-28`, with OpenAI's webhook Events profile and the SDK-owned core protocol.
8. D1 stores current subscriptions and minimal opaque event/subscription deduplication metadata only. Message payloads, delivery attempts, feedback outcomes, and tool-write results remain invocation-local.
9. Deduplication expires at a fixed 25 hours after the first claim, without sliding expiry. Preserve 45-second processing claims and bounded request-driven cleanup.
10. Deliver in the originating request's `waitUntil()` window, with bounded retries and best-effort failure feedback. There is no guaranteed delivery, recovery, or exactly-once behavior.
11. Return `cursor: null`; do not implement protocol replay or history reconstruction.
12. After confirmed ChatGPT receipt of a new message, attempt one typing indicator. Do not refresh it throughout the Dot's work or automatically add an eyes reaction.
13. Preserve the bot-authored-only restriction on message edits/deletes using signed message references returned by confirmed sends, without storing write results.
14. Configure through Sites environment settings. Keep only a minimal landing page, authenticated setup view, and public health response. Do not add a configuration GUI, operational dashboard, audit history, or speculative maintenance system.
15. Establish feasibility with the narrow compatibility gate in section 14 before completing the full catalog.

Sections below resolve routine implementation details within these decisions. A prototype may refine provisional timeouts, but must not silently expand scope, retention, access, or infrastructure.

## 3. Scope and user experience

### Owner-to-Dot messages

1. The owner has started a private conversation with the bot, and the intended Dot has an active native event subscription.
2. Telegram sends an update to `POST /telegram/webhook`.
3. Dotagram authenticates the webhook, validates the update, verifies its private-chat and human-owner identity, and normalizes the supported text event in memory.
4. Dotagram registers bounded background work and promptly acknowledges Telegram. It does not wait for ChatGPT or a Telegram API call before acknowledging.
5. Background work selects eligible subscriptions, claims each event/subscription pair, and delivers signed callbacks.
6. A successful callback acknowledges receipt. The Dot decides how to act using its existing context and the user's automation instructions.
7. For a newly created message, the first confirmed callback acceptance permits one best-effort typing action. A later tool call sends the actual response.

Installation alone does not instruct the Dot to answer messages. The native automation and response instructions belong to the intended Dot's ChatGPT context.

### Dot-to-owner messages

The Dot sends text to the fixed owner destination, optionally as a reply to a particular message. A confirmed send returns the actual message identifier and a signed reference for subsequent edits/deletes. Repeated sends can produce duplicates. A timeout does not prove that Telegram rejected a write.

The owner must initiate the bot conversation before the bot can message them. Installation must verify this prerequisite. [Telegram bot introduction](https://core.telegram.org/bots#how-are-bots-different-from-users)

### Explicit exclusions

- Media, attachments, voice, transcription, stickers, location, contacts, polls, and media-album assembly. Captions alone do not make media messages supported text messages.
- Message history, exact-message lookup, search, user discovery, arbitrary DM creation, and thread reconstruction.
- Incoming reaction events and ordinary DM deletion events. Do not advertise events that the supported Telegram integration cannot supply.
- Inline bots, callback buttons, games, payments, business connections, topic management, and streaming drafts.
- Multi-owner/multi-bot tenancy, agent attribution, routing, or ownership leases.
- OpenAI API keys or a model runtime inside Dotagram.
- Persistent retry queues, write-result replay, inspection of lost invocations, and guaranteed failure notifications.

Unsupported updates are not forwarded as fabricated text. For this version, acknowledge authenticated unsupported updates without sending an explanatory bot message. This avoids introducing an additional automatic-write path.

## 4. Architecture and dependencies

### Retain from SlackDot

- Sites deployment, Vinext integration, Worker entry point, public landing page, authenticated setup page, and identity boundary.
- `@modelcontextprotocol/server` and its Cloudflare-compatible JSON Schema validator. Keep Events extension methods separate from the SDK's core transport.
- Zod schemas, `standardwebhooks`, cryptographic helpers, and sanitized error handling.
- D1, `drizzle-orm`, `drizzle-kit`, and migration-driven schema management.
- Deterministic subscriptions, encrypted signing secrets, callback challenges, key rotation overlap, expiry, unsubscribe, and exact-origin callback restrictions.
- Atomic deduplication claims, fencing, deadline-aware delivery, independent subscription fanout, and request-driven cleanup.
- TypeScript, Vitest, Worker build checks, and relevant protocol/lifecycle/privacy test patterns.

Use SlackDot's known dependency versions as the initial compatibility baseline; select and pin a compatible grammY version and record the tested versions in prototype results. Do not claim untested dependency combinations are equivalent.

### Replace or remove

- Replace `@slack/bolt` and Slack-specific transitive dependencies with `grammy`.
- Remove Slack app manifests, OAuth scopes, signing verification, workspace/channel access logic, Slack timestamps, history reads, mention filters, wildcards, and session-status code.
- Remove obsolete Slack test fixtures and documentation from the new project rather than retaining misleading contracts.
- Remove unused UI components and their dependencies after checking actual imports. Preserve Sites build/preview dependencies that remain in use; `raw-body` and `json-rpc-2.0` in SlackDot are also used by its preview integration and are not inherently Slack dependencies.

Do not add grammY sessions, conversations, runner/long-polling infrastructure, or automatic retry plugins. grammY's documented Worker adapter is the starting integration point, subject to the Sites build test. [grammY Cloudflare Workers integration](https://grammy.dev/hosting/cloudflare-workers-nodejs)

### Intended source boundaries

```text
worker/index.ts                 Sites Worker entry and waitUntil access
lib/runtime/                    Configuration, authorization, routing, crypto
lib/telegram/receiver.ts         Authenticated webhook ingress and grammY adapter
lib/telegram/normalize.ts        Owner-text event schemas and normalization
lib/telegram/service.ts         Fixed-destination Telegram API operations
lib/telegram/message-reference.ts  Stateless bot-message provenance
lib/telegram/feedback.ts         One-shot typing and failure replies
lib/events/                     Subscriptions, callbacks, deduplication, budgets
lib/mcp/server.ts               Five tools and Events extension methods
lib/storage.ts                  Subscription access and bounded cleanup
db/schema.ts                    Current subscription/deduplication schema
drizzle/                        Fresh initial migration and later migrations
app/                            Minimal landing/setup views and Sites sign-in
tests/                          Unit, protocol, Worker, and hosted checks
docs/install.md                 Ordered installation procedure
plugin/skills/use-dotagram/     Tool/event reference for the connected Dot
```

These paths describe future implementation. This specification does not create those files.

## 5. Configuration and authorization

### Runtime settings

| Setting | Purpose | Secret |
| --- | --- | --- |
| `DB` | Sites-provisioned D1 binding | Binding |
| `TELEGRAM_BOT_TOKEN` | Bot API credential, entered securely by the owner | Yes |
| `TELEGRAM_OWNER_USER_ID` | Explicitly verified numeric human-owner ID | No |
| `TELEGRAM_BOT_INFO` | Validated `getMe` identity/configuration for grammY initialization and expected-bot checks | No |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret registered with Telegram and checked on ingress | Yes |
| `OWNER_USER_ID` | Authenticated Site-scoped owner identity | No |
| `SUBSCRIPTION_ENCRYPTION_KEY` | Stable 32-byte base64 key for subscription encryption and domain-separated derivations | Yes |
| `CALLBACK_ALLOWED_ORIGINS` | Independently verified exact OpenAI callback origins | No |
| `SITES_IDENTITY_VERIFIED` | Fail-closed guard enabled after identity-boundary verification | No |

The installation agent derives bot information and generates secrets. It keeps the Site owner, human Telegram owner, and bot identity distinct. A username, display name, or bot-token identity is not proof of the human owner's numeric ID. Do not implement first-message-wins enrollment or an application pairing flow.

### MCP and setup access

Authorize the Site-scoped principal before exposing tools, events, subscription data, or configuration. Only the configured Site owner may use these operations. Preserve Sites authentication integration and anonymous/forged-header/non-owner rejection tests.

The setup view may display the signed-in visitor's own Site identity for bootstrap. Configuration and connection details are visible only after owner authorization. Public health and landing responses contain no owner IDs, secrets, Telegram messages, or subscription details.

### Telegram ingress and egress

Authenticate ingress using constant-time comparison of `X-Telegram-Bot-Api-Secret-Token` against the registered secret. This replaces Slack's body signature and timestamp scheme; do not claim Telegram provides the same signed-timestamp replay protection. [Telegram webhook registration](https://core.telegram.org/bots/api#setwebhook)

For message events, require all of the following before scheduling delivery:

- The update has a valid supported structure and safe numeric identifiers.
- `chat.type` is `private`, the chat is the configured owner's private destination, and `from.id` equals the configured human-owner ID.
- The sender is not a bot and the message contains supported text.
- Business, channel, topic-mode, and other out-of-scope contexts are excluded.

Forwarded text sent by the owner is still owner-supplied content. A forward's original author must never determine authorization. Do not fetch or relay embedded source histories or quoted-message bodies.

Every tool supplies the destination from validated server configuration. Do not accept arbitrary chat IDs, cross-chat reply destinations, business connection IDs, or inline message targets. Check current bot identity through bounded live verification at protected connection/operation boundaries and before callback delivery; cache no message or access history.

Bind subscriptions and signed references to the configured bot and human owner as well as the Site principal. Changing configuration must not silently redirect existing subscriptions or references to another owner or bot.

Treat owner block/unblock updates (`my_chat_member`) as internal lifecycle signals, not MCP events: a validated block deletes affected subscriptions, and an unblock does not recreate them. Re-read subscription state before callbacks. Do not promise instantaneous knowledge of revocation when Telegram updates are missing. [Telegram update contract](https://core.telegram.org/bots/api#update)

## 6. Telegram adapter and ingress behavior

Use HTTPS webhooks, not `bot.start()` or polling in the deployed application. Register `message`, `edited_message`, and `my_chat_member` explicitly. Still validate every received update because the webhook filter is not an authorization boundary.

Supply validated bot information during grammY initialization so ingress does not depend on an implicit `getMe` network round trip. The middleware must finish its short normalization/scheduling work; do not use a grammY timeout that returns success while untracked middleware continues. [grammY webhook lifecycle](https://grammy.dev/guide/deployment-types)

Disable webhook-reply optimization explicitly. Telegram writes must be separate API calls with observable results. Configure native Worker fetch, redirect rejection, cancellation, bounded timeouts, and sanitized errors. Keep sensitive logging disabled; Telegram API URLs contain the bot token. [grammY API client configuration](https://grammy.dev/ref/core/apiclientoptions)

Apply a bounded request-body reader, initially 256 KiB. Reject wrong methods, missing/incorrect secrets, malformed JSON, oversized bodies, and invalid supported-update structures using appropriate HTTP errors. Authenticated updates from other users or unsupported contexts receive a successful acknowledgment and no delivery, storage, or bot response.

For an eligible update, record the invocation acceptance time, normalize in memory, register the delivery promise with `ctx.waitUntil()`, then return success. If required configuration or background execution is unavailable, fail rather than pretending eligible work was scheduled. Do not await callbacks or Telegram writes on this acknowledgment path.

Use a low webhook connection limit, initially one, to limit ingress load. This does not guarantee callback ordering because acknowledged requests can have overlapping background work. Preserve independent event delivery and accept out-of-order arrival; do not introduce a reorder buffer or high-water-mark suppression.

Do not drop pending updates on ordinary redeployment or secret rotation. Initial installation may explicitly discard pre-installation test updates as part of its documented setup sequence; never do so silently during upgrades.

## 7. MCP tools

Expose exactly these initial tools, with strict input/output schemas and accurate annotations. Reject unknown fields. Report sanitized, categorized errors and a retry delay when available.

| Tool | Input | Confirmed result |
| --- | --- | --- |
| `telegram_get_connection_info` | Empty object | Verified bot identity, configured human-owner ID, supported tools/events, no replay/history, and bounded-delivery description |
| `telegram_send_message` | `text`, optional `reply_to_message_id` | Actual `message_id`, destination ID, sent timestamp, optional reply ID, and signed `message_reference` |
| `telegram_edit_message` | `message_reference`, replacement `text` | Exact message target and confirmed edit result |
| `telegram_delete_message` | `message_reference` | Exact message target and confirmed deletion result |
| `telegram_set_reaction` | `message_id`, `emoji` or explicit `null` to clear | Exact target and confirmed requested reaction state |

Message text is plain text in this version. Do not expose parse modes, arbitrary entities, reply markup, or HTML/Markdown rendering. Validate nonempty text against Telegram's 4,096-character limit, reject oversized writes, and do not silently truncate or automatically split one tool call into several sends. Verify Unicode boundary handling in tests. [Telegram text sending](https://core.telegram.org/bots/api#sendmessage)

Reply IDs are scoped to the configured private chat. If a reply target is unavailable, return the API failure rather than silently converting an explicit reply into an unrelated message. Reply relationships do not create threads or persistent context.

Reactions use one supported ordinary emoji or clear the bot's reaction. No paid/custom emoji feature or reaction-read tool is included. A setter confirms the requested state; it cannot claim to have compared historical state or report a reliable `changed` flag without a read. [Telegram reaction method](https://core.telegram.org/bots/api#setmessagereaction)

### Signed message references

After validating a successful send response, including its bot authorship and destination, return a versioned, tamper-evident reference carrying only message provenance: Site principal, bot ID, owner/private-chat ID, message ID, and sent time. Authenticate it using a domain-separated key derived from the stable application key. Do not embed message content or credentials, or store the reference in D1. Editing does not change the original send time or issue provenance for a different target.

Edit/delete require this reference rather than a raw message ID. Validate its signature, shape, version, and current installation/owner binding. It supplements authenticated MCP access and never grants access on its own. A key change invalidates previous references; losing a reference makes the message unavailable to these tools. No lookup or persisted fallback is provided.

This restriction is necessary because Telegram can delete incoming owner messages as well as bot messages. Telegram's own age and permission limits still apply. A reference proves a confirmed bot send, not that the message still exists. [Telegram deletion method](https://core.telegram.org/bots/api#deletemessage)

### Write outcomes

Perform one API write per requested mutation. Do not automatically retry ambiguous writes or add a request-ID/result ledger. Distinguish a definite API rejection from an uncertain timeout, transport failure, or invalid response after submission.

Send is non-idempotent. Do not advertise edit/delete as stored-result replay operations. A reaction setter can be described as setting a desired state, but still has no automatic retry or stored comparison. On ambiguity, report `ambiguous_write`; the Dot cannot inspect Telegram history through Dotagram to resolve it. A retry requires a new deliberate decision and can duplicate a send.

## 8. Events and subscriptions

### Event catalog

| Event | Source | Meaning |
| --- | --- | --- |
| `telegram.message.created` | Eligible owner text `message` update | A new text message was received from the owner |
| `telegram.message.updated` | Eligible owner text `edited_message` update | Telegram supplied an updated message snapshot |

Subscription `arguments` is a required empty object. No sender, conversation, mention, wildcard, or thread filters are needed for the fixed owner DM. Preserve independent delivery to each subscription; overlap can intentionally notify the Dot more than once.

An edited event carries the current text, not a diff or previous version. Without retained content, Dotagram cannot determine whether text actually changed relative to a prior update. It must not fabricate old text or suppress distinct updates merely because their current text happens to match.

### Payload contract

Use the MCP envelope `eventId`, `name`, `timestamp`, `data`, and `cursor: null`. `data` contains:

- `bot_id`, `chat_id`, `sender_user_id`, `message_id`, and `update_id`.
- Full supported `text`, without Slack-style preview truncation and a nonexistent history-tool fallback.
- `message_date`, plus `edit_date` for updated messages.
- Nullable `reply_to_message_id`, without copying the replied-to message body or traversing reply chains.

Represent Telegram user/chat/bot identifiers as validated decimal strings at the MCP boundary. Message/update IDs must be validated safe integers. Convert to the grammY types without truncation or lossy coercion. Use ISO 8601 timestamps; the event occurrence is the message date for creation and edit date for an edit. Invalid required timing metadata must not become an invented occurrence time.

Derive a stable event ID from the bot identity and Telegram update identity, with a Dotagram-specific domain. Preserve it across callback retries and duplicate ingress. Do not use a maximum-seen update ID as deduplication or ordering state. Distinct edits must remain distinct events.

Normalize only the allowlisted fields. User text is data, not injected automation instructions. Serialize a callback body once, enforce the 256 KiB complete-body limit, and sign/send those exact bytes.

### Subscription lifecycle

Preserve `events/list`, `events/subscribe`, and `events/unsubscribe` on the authenticated MCP endpoint. Advertise `capabilities.events`, `delivery: ["webhook"]`, and strict argument and payload schemas for both event definitions. Use deterministic identity from the authenticated principal, callback URL, event name, canonical arguments, and installation binding. Repeated subscriptions upsert rather than duplicate; renewed subscriptions preserve their original creation time unless reactivated after expiry.

Retain a 72-hour default/maximum lifetime, honor shorter positive requested lifetimes, and grant a finite lifetime for `ttlMs: null`. Enforce expiry on reads. Refresh is driven by the native client; Dotagram needs no renewal scheduler.

Validate signing secrets and exact HTTPS callback origins. Verify callbacks with signed, fresh challenges before activation. Cache successful verification for at most five minutes within the authorized subscription identity; expiry, reactivation, or secret changes require reverification. Encrypt stored secrets with AES-GCM and bind encryption to the subscription ID. During rotation, preserve the prior secret for at most one minute and send the appropriate overlapping signatures.

Preserve SlackDot's operator-verified exact-origin callback policy, redirect rejection, and public-destination restrictions. Do not expand it to arbitrary callback destinations or claim general DNS pinning that Worker fetch cannot establish. Verify the actual native callback origin during the prototype.

Unsubscribe is owner-scoped and idempotent, and works without a live Telegram lookup. Support canonical event/arguments/destination removal; an ID form may be retained as a small compatibility convenience. Remove subscriptions when authorization is revoked or the installation binding is no longer valid. Return `cursor: null` and no replay claims throughout.

OpenAI's supported webhook profile governs discovery, challenge signing, renewal, and callback receipt; it takes precedence over incompatible experimental Events drafts. [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)

## 9. Delivery, retries, and feedback

### Shared invocation budget

| Parameter | Target | Rationale |
| --- | --- | --- |
| Callback delivery deadline | Acceptance time + 20 seconds | Preserve bounded in-memory delivery |
| Final feedback deadline | Acceptance time + 25 seconds | Five-second feedback allowance with platform margin |
| Callback attempts | At most three per subscription per invocation | Preserve bounded retries |
| Callback request cap | Four seconds, clipped to remaining time | Prevent one stalled request consuming the budget |
| Backoff | One second, then two seconds; respect longer server delay only if it fits | No retry beyond the deadline |
| Minimum remaining attempt allowance | 250 ms | Avoid starting work at the boundary |
| Telegram API request cap | Provisionally five seconds, clipped to the applicable deadline | Reconsider Slack's two-second cap; validate empirically |
| Concurrent subscription deliveries | At most four under one shared deadline | Preserve independent bounded fanout |
| Processing claim | 45 seconds | Exceed the invocation's work budget with margin |
| Deduplication lifetime | Fixed 25 hours | Approved Telegram-specific policy |

Cloudflare allows up to 30 seconds of `waitUntil()` execution after the response or disconnect, shared across the request's background tasks. It is not a promise of a dedicated 30-second worker for each subscription, nor a limit on the total duration of an open HTTP request. [Cloudflare execution context](https://developers.cloudflare.com/workers/runtime-apis/context/)

Telegram retains pending updates for up to 24 hours and does not publish an exact retry timetable. The 25-hour policy is conservative duplicate suppression, not a guarantee covering every possible delayed/replayed request. [Telegram updates](https://core.telegram.org/bots/api#getting-updates)

### Delivery algorithm

1. Run bounded cleanup and select subscriptions for the current owner, bot, event, active lifetime, and creation time no later than this invocation's acceptance time.
2. Revalidate stored arguments and installation binding. Acquire an atomic event/subscription claim before sending.
3. Before each attempt, re-read subscription state, verify current authorization/bot identity within the shared budget, and check claim ownership and time remaining. Unsubscribe, expiry, or revocation cancels eligible work.
4. Decrypt current signing material and send one signed callback. Preserve the event ID but refresh signing time/signature on retries.
5. Treat `2xx` as confirmed receipt. Response-body cleanup failure must not turn that acceptance into another attempt.
6. Retry transient transport errors, timeouts, `408`, `429`, and server failures within the attempt/time bounds. Other client errors, redirects, prohibited destinations, and oversized payloads are terminal for the invocation. Never retry `410` or `413`.
7. Finalize deduplication state using the matching unexpired claim token. A failed success-record write must not trigger an immediate callback resend.
8. Complete feedback under the same overall invocation deadline. No timers, jobs, or work survive as a scheduled recovery mechanism.

Honor callback `Retry-After` and Telegram API retry-delay information without sleeping beyond the remaining budget. Telegram writes remain single-attempt even when rate-limited; report the delay rather than silently retrying the write.

### Typing and failure replies

Attempt one `typing` action on the first confirmed delivery of a new-message event, shared across that invocation's subscription fanout. Do not send it for an edit event, a suppressed duplicate, or merely receiving Telegram ingress. Indicator failure never changes callback success or triggers redelivery.

The indicator is a brief hint only; Telegram clears it after a short interval. Do not keep a worker alive to refresh it, use it as a session state, or promise it remains until the Dot replies. [Telegram chat actions](https://core.telegram.org/bots/api#sendchataction)

If all relevant attempted deliveries fail and at least one failed subscription remains active, attempt one plain-text failure reply to the source message. Do not send failure feedback for no subscriptions, deliberate cancellation, a confirmed success, or a deduplication-suppressed outcome. If the target is missing, let the feedback attempt fail rather than sending an unrelated message.

Suggested wording: "Dotagram couldn't confirm delivery to ChatGPT. No further automatic attempts will be made by this delivery run." Add "after several attempts" only when applicable. This must not imply certain nonreceipt or rule out a separate Telegram redelivery.

Do not store feedback results or automatically retry an uncertain feedback write. An interruption can prevent both callback delivery and feedback. Duplicate notices across separate invocations remain possible.

## 10. Persistence and privacy

### Application data

Only two application tables are permitted:

1. `subscriptions`: deterministic ID, authenticated owner and bot/Telegram-owner binding, event and canonical arguments, callback URL, encrypted current/previous signing secrets, verification metadata, creation/expiry times, and necessary active state.
2. `event_dedup`: exactly `key`, `state`, `claim_token`, `claim_expires_at`, and `expires_at`, plus the necessary expiry index.

Migration bookkeeping is separate from application data. Start a fresh migration history with this schema; do not import SlackDot migrations that temporarily create events, deliveries, receipts, notices, or write-result tables.

### Deduplication semantics

Use a Dotagram-domain-separated HMAC-SHA-256 over the stable event/subscription pair with a key derived from the stable application key. Store neither raw identifier separately in the deduplication table. States are `processing`, `delivered`, and `failed`; claim tokens are random and fence stale workers.

Atomic insert/reclaim admits one worker for a pair. A claim lasts 45 seconds. Failed work retains its original claim cooldown; a fresh ingress can reclaim after expiry, but the row itself never starts work. Reclaiming preserves the original 25-hour expiry and requires enough remaining lifetime for a full claim. Completion requires an unexpired matching token. Confirmed delivery suppresses repeats until fixed expiry; a later ingress can begin a new window afterward.

Claim/storage failure prevents uncoordinated callback delivery. A failed completion write may leave an expiring claim and later duplicates; do not convert accepted callbacks into immediate retries. Encryption-key rotation changes deduplication identity and invalidates message references; it must not be presented as preserving the existing suppression window.

Cleanup removes at most 100 expired deduplication rows per ordinary subscription/event operation, using the expiry index. Bound subscription expiry and old-secret cleanup similarly. Expiry is enforced even if deletion has not occurred. An idle Site can retain expired metadata until later activity; no exact-time physical erasure or cleanup scheduler is promised.

### Prohibited retention

Do not persist message text, raw update bodies, raw ingress receipts, reply snapshots, user profiles, delivery attempts, feedback outcomes, tool-write hashes/results, signed message references, or conversation state. Do not move these records to R2, KV, logs, analytics, global caches, external storage, or real-message test artifacts.

Only current configuration, necessary subscription records, and the specified opaque deduplication records persist. Request-local payload processing and protocol responses are allowed. This policy governs Dotagram's own storage; it does not claim to erase Telegram or ChatGPT's independent data or platform-managed backups.

## 11. Installation and deployment contract

Preserve SlackDot's phased installation and human handoffs. Codex or ChatGPT Work may install the bridge; the intended Dot creates its own native automation.

1. Prepare the application through the supported Sites workflow. Deploy a public Site with `d1: "DB"`, `r2: null`, and MCP publication initially disabled. Establish the genuine signed-in Site owner identity through the setup view.
2. Have the owner create the bot through BotFather and enter its token directly into Site secrets. Obtain and explicitly verify the human owner's numeric Telegram ID. Disable group joining and leave business/inline/topic features unused; runtime guards remain mandatory.
3. Use secure credential execution to call `getMe`, derive validated bot information, generate stable encryption/webhook secrets, set owner identities and callback policy, and apply the environment revision. Never request tokens in chat or browser URLs/history. Preserve credentials and Site identity when resuming.
4. Verify the identity boundary and owner connection. The owner's initial private message establishes Telegram's conversation prerequisite; confirm it belongs to the explicitly configured owner. Do not enroll whoever messages first.
5. Register the exact webhook URL, secret, update allowlist, and connection limit. Inspect webhook configuration and verify a real authenticated update. A successful registration call alone does not prove end-to-end delivery.
6. Enable MCP publication on the same Site and use its generated plugin. Verify native owner discovery/tools/events and anonymous, forged-header, and signed-in non-owner rejection.
7. Hand off to the intended Dot to create the native automation, then verify a real owner-message-to-Dot-to-Telegram round trip.

Keep setup secrets out of source, command arguments, logs, and handoff notes. Configure and deploy through Sites rather than exposing temporary public setup endpoints. If secure credential access or a human sign-in is unavailable, preserve completed installation work and hand off that exact phase; do not weaken guards or create duplicate Sites/plugins.

There is no deployment in the current documentation task. Future installation follows the then-current Sites and plugin workflows. An environment change requires the corresponding deployment to apply; never treat a saved setting as proof it is live.

## 12. Error and reliability contract

- Distinguish HTTP ingress acceptance, callback acceptance, and the Dot's eventual response. None implies the next completed successfully.
- Acknowledgment followed by Worker termination can lose the message permanently. Telegram need not redeliver an acknowledged update, and D1 has no payload to recover.
- Duplicates and out-of-order events remain possible. Do not reconstruct ordering, coalesce messages, or rely on local process memory for correctness.
- A subscription expiry gap cannot be replayed. Refresh resumes future eligible ingress, not missed messages.
- Normalized errors must not expose API URLs, tokens, webhook secrets, callback URLs/signatures, or message content. Avoid logging raw grammY errors or update objects.
- No write tool promises exactly-once execution, stored-result replay, or an ability to inspect history after an ambiguous result.
- In-flight revocation/unsubscribe can race with an already transmitted callback; rechecks minimize exposure but cannot retract accepted requests.

## 13. Local validation requirements

Use synthetic fixtures. Before deployment, test and type-check the changed implementation and build through the supported Sites tooling. Tests should verify behavior and security properties rather than mirror implementation details.

- Ingress authentication, malformed/oversized input, unknown fields, Unicode text boundaries, and rejection of every unsupported sender/chat/context.
- No foreground callback/API wait; background registration is required before success. No work escapes its shared deadline.
- New/edit payloads, full-text preservation, reply-ID-only projection, stable event IDs, duplicate updates, distinct edits, and out-of-order updates.
- Strict agreement between advertised schemas and runtime validation, SDK protocol handling, five tools, two events, and absence of Slack catalog entries.
- Subscription idempotency, independent fanout, refresh, expiry, canonical unsubscribe, secret rotation, binding changes, owner isolation, and callback policy/challenge failures.
- Simultaneous claims, abandoned/failed claims, stale-token fencing, fixed 25-hour expiry, reclaim boundaries, bounded cleanup, storage failures, and key changes.
- Success, transient recovery, retry exhaustion, permanent failure, long retry delays, cancellation, interruption, and success-record failures.
- One-shot typing after confirmed new-message delivery only; indicator failure cannot cause redelivery. Failure replies obey success/cancellation/suppression rules.
- Fixed-destination writes, tampered/cross-owner/cross-bot references, incoming-message deletion attempts, missing targets, and ambiguous write outcomes without automatic resend.
- D1 schema and stored values contain only permitted data. Logs, responses, fixtures, and build artifacts contain no real secrets or message content.

## 14. Compatibility gate and hosted acceptance

All rows are pending. Record exact dependency versions, tested source revision, environment, observed results, and limitations when these checks are performed. Do not copy SlackDot's pass status.

### Narrow prototype gate

Use only the minimum implementation needed to verify the platform path: authenticated owner-text ingress, subscription lifecycle, bounded callback delivery, connection information, one confirmed send, and typing feedback. Any isolated test fixture must use synthetic content and be removed before a production-ready result is claimed.

| Check | Required evidence |
| --- | --- |
| grammY + Sites Worker | Supported Sites build succeeds; deployed Worker uses the selected adapter, native fetch, configured bot information, and bounded cancellation without an incompatible Node server dependency. |
| Public ingress + protected operations | Telegram reaches the public webhook; wrong secrets and wrong owners cannot deliver; genuine Site owner succeeds while anonymous, forged-header, and signed-in non-owner MCP/setup probes fail. |
| Native MCP 2.0 | Actual plugin discovery advertises the intended protocol, tools, and events; Events custom methods work with native client request envelopes. |
| Callback lifecycle | Actual native subscribe challenge/signature succeeds; D1 state survives redeployment; refresh and unsubscribe preserve identity and enforce expiry. Local tests cover time travel and rotation; documented automatic renewal need not be proved by waiting 72 hours. |
| Background delivery | A real owner message reaches the intended Dot after prompt Telegram acknowledgment; no polling, public delivery trigger, or external scheduler participates. |
| Telegram reply and typing | A real send is confirmed in the owner DM; typing is attempted only after callback acceptance. Separate API success from human observation of an ephemeral indicator. |
| Deadline/failure behavior | Built-Worker synthetic checks demonstrate retry caps, aborts, long retry delays, failure replies, and interruption loss. Any hosted failure fixture is explicitly controlled and is not evidence of a real outage. |
| Privacy | Inspect fresh D1 schema and synthetic rows; verify absence of payload/history/write tables and sensitive logs. No export of real operational content is required. |

A failure must identify the unsupported capability and its practical effect. Do not resolve it by adding payload storage, a scheduler, broader Telegram access, or unauthenticated endpoints. Revisit a material design decision with the owner if the selected platform cannot meet it.

### Full catalog acceptance after the gate

- Confirm actual new and edited owner text events arrive with correct identities, text, occurrence times, and reply relationship. Test rapid messages and edits without promising ordering or automatic context assembly.
- Verify the Dot can send, reply, edit, delete, set a reaction, and clear a reaction on an isolated owner-approved fixture. Verify signed references reject tampering and cannot authorize deletion of an owner-authored message.
- Verify non-owner private messages and group/supergroup/channel updates never produce callbacks, tools cannot redirect writes, and bot output does not produce a response loop.
- Verify owner block handling and bot credential/configuration mismatch fail closed, without inventing a replay or automatic subscription restoration path.
- Verify duplicate successful ingress is suppressed per subscription, simultaneous ingress has one claim winner, and separate subscriptions retain independent behavior. Use synthetic time control for 25-hour expiry rather than waiting in production.
- Confirm redeployment preserves valid subscriptions and the stable key; routine redeployment does not discard pending Telegram updates.
- Verify user-visible failures are accurate about uncertainty and that no success indicator or failure reply is mistaken for the Dot's completion.
- Complete installation documentation and the plugin tool/event reference using actual observed behavior. Retain explicit limitations and identify any remaining unverified capability.

## 15. References and research status

The design review used the current SlackDot repository, official Telegram and grammY documentation, OpenAI MCP Events documentation, Cloudflare execution-context documentation, and installed Sites guidance. Recheck evolving SDK/protocol/platform contracts during the compatibility prototype.

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram bot introduction](https://core.telegram.org/bots)
- [grammY Cloudflare Workers integration](https://grammy.dev/hosting/cloudflare-workers-nodejs)
- [grammY webhook lifecycle](https://grammy.dev/guide/deployment-types)
- [grammY API client configuration](https://grammy.dev/ref/core/apiclientoptions)
- [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- [Cloudflare execution context](https://developers.cloudflare.com/workers/runtime-apis/context/)
- Installed Sites skill and its Site MCP server, identity/secrets, and storage references. These establish the inspected deployment contract; they do not prove a live Dotagram deployment or provide a queue/cron facility for this design.
