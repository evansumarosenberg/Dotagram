# Dotagram implementation plan

Status: original runtime deployed with qualified native acceptance; owner-authenticated setup revision implemented and locally verified, not deployed. See [verification record](../docs/verification.md).

Last updated: 2026-11-08

Source of truth: [Dotagram specification](specification.md).

## 1. Objective and approach

Implement the reviewed specification by adapting the current SlackDot application at `D:\Projects\Vibe\SlackDot`. Preserve its Sites deployment integration, MCP transport, subscription lifecycle, minimal persistence, and bounded event delivery. Replace its Slack adapter and catalog with the owner-only Telegram behavior described in the specification.

SlackDot already demonstrates MCP Events delivery through ChatGPT Sites. Build the intended Dotagram application directly. There is no separate compatibility prototype or feasibility phase; platform checks are ordinary verification of the resulting application.

This plan was written before implementation. The implementation task has completed the local application and validation work described below. The existing installation has passed messaging acceptance; outstanding checks are recorded separately. The 2026-11-08 setup revision is implemented locally; its deployment and hosted acceptance remain pending.

## 2. Constraints that apply to every task

- One bot, one explicitly configured Telegram human owner, and one controlling Dot per deployment. Multiple subscriptions from that Dot remain supported.
- Only ordinary owner DMs and text messages. Expose five tools and two message events, with no arbitrary destinations or history tools.
- Store only subscriptions and the specified five-column opaque deduplication table. No message payloads, write results, feedback history, or additional lifecycle state.
- Keep the fixed 25-hour deduplication window, 45-second claims, shared 20-second callback deadline, and 25-second final feedback deadline.
- Use one-shot typing after confirmed new-message delivery. Do not add persistent status, automatic eyes delivery receipts, or repeated typing refreshes. An explicitly requested eyes reaction remains available through the reaction tool.
- Use signed references for bot message edits/deletes. Do not replace them with stored write records or unrestricted message IDs.
- Keep Telegram blocking separate from MCP subscription cancellation. Do not register `my_chat_member` or delete subscriptions on blocked-message write failures.
- Tolerate and discard unknown Telegram fields while keeping MCP tool and subscription arguments strict.
- Preserve canonical unsubscribe across installation bindings and immutable binding on subscription refresh.
- Do not add a queue, scheduler, polling loop, external service, environment editor, or diagnostic dashboard. The only setup controls permitted are the three owner-authenticated installation actions specified in section 11; they do not address delivery recovery.
- Keep the SlackDot reference checkout unchanged. Do not copy its credentials, deployment identity, runtime data, historical acceptance status, or superseded operational schema.

If implementation exposes a conflict with these constraints, record the concrete conflict and resolve it against the specification. Do not silently change product scope or infrastructure.

## 3. Task sequence

Tasks describe a dependency order, not separate releases. Add focused tests alongside each runtime change. Complete the full application before hosted acceptance; a reduced catalog is not an interim product or prototype requirement.

| Task | Deliverable | Depends on | Status |
| --- | --- | --- | --- |
| 1 | Sites application foundation and dependency cleanup | Existing specification | Complete locally |
| 2 | Configuration, owner authorization, crypto, and fresh D1 schema | 1 | Complete locally |
| 3 | grammY client, Telegram contracts, tools service, and signed references | 2 | Complete locally |
| 4 | Subscription lifecycle, callback transport, and opaque deduplication | 2, event schemas from 3 | Complete locally |
| 5 | Authenticated ingress, bounded delivery, and feedback | 3, 4 | Complete locally |
| 6 | Complete MCP catalog and minimal setup experience | 2–5 | Complete locally |
| 7 | Installation instructions and plugin reference | 6 | Complete locally |
| 8 | Integrated local tests, Worker build, and privacy verification | 6, 7 | Complete locally |
| 9 | Original Sites installation and native acceptance | 8 | Messaging passed; remaining checks recorded |
| 10 | Setup authorization and bootstrap API client | Revised specification section 11 | Complete locally |
| 11 | Fixed setup actions and browser flow | 10 | Implemented; browser visual QA unavailable |
| 12 | Retire Python workflow and reconcile documentation | 11 | Complete locally |
| 13 | Replacement-flow validation and existing-Site upgrade | 10-12 | Local checks passed; deployment/hosted acceptance pending |

### Task 1 — Prepare the application foundation

**Files:** package manifest/lockfile, TypeScript and test configuration, Sites/Vite integration, Worker entry point, framework files, `.openai/hosting.json`, `.gitignore`, and required licensing notices.

1. Inspect the reference checkout and identify the current production source and supporting build files. Retain the reviewed specification and this plan in Dotagram.
2. Copy the reusable application/build foundation selectively. Exclude `.git`, environment files, `node_modules`, generated builds, local runtime databases, caches, deployment state, work/output directories, and real-message fixtures.
3. Preserve the Sites/Vinext build integration and Worker output contract. Declare `d1: "DB"` and `r2: null`; leave Site identity unassigned until an actual installation creates it. Keep MCP publication disabled for the initial installation stage.
4. Replace the application name and package identity with Dotagram. Preserve applicable source licenses and third-party notices.
5. Remove `@slack/bolt` and Slack-specific dependencies. Add a pinned compatible `grammy` version while retaining the known MCP, Zod, Standard Webhooks, Drizzle, and build/test baseline.
6. Remove unused component packages only after checking their imports. Preserve dependencies used by Sites build/preview helpers, including `raw-body` and `json-rpc-2.0` where required.
7. Use the supported dependency installation workflow and generate the lockfile. Do not create a Site or copy the reference Site's project ID as part of preparing source.

**Validation:** inspect the dependency/import graph for Slack remnants; verify the package scripts and Sites build paths resolve. Record the selected versions. Do not copy historical test counts or deployment results into Dotagram's status.

**Complete when:** the new checkout has the intended reusable foundation and dependency set, with no reference installation state or Slack runtime dependency.

### Task 2 — Implement configuration, authorization, crypto, and storage

**Files:** `lib/runtime/config.ts`, `lib/runtime/crypto.ts`, `app/chatgpt-auth.ts`, `db/schema.ts`, `db/index.ts`, `lib/storage.ts`, fresh `drizzle/` migrations, `.env.example`, and test database helpers.

1. Define the specification's runtime settings and validate IDs, bot information, key encoding, and required settings at the appropriate operation boundary. Bootstrap health/setup identity must remain usable before the full bot configuration exists.
2. Port the Site owner check and fail-closed identity guard. Keep Site principal, bot identity, and Telegram human-owner identity distinct.
3. Port canonical JSON, constant-time comparison, and AES-GCM helpers. Define separate cryptographic domains for event identity, deduplication, and signed message references. Keep the root key stable across normal redeployments.
4. Define `subscriptions` with the necessary identity, installation binding, canonical arguments, callback, encrypted signing material, verification, activity, and expiry fields.
5. Define `event_dedup` with exactly `key`, `state`, `claim_token`, `claim_expires_at`, and `expires_at`, plus its expiry index.
6. Generate a fresh initial migration from the new schema. Do not copy SlackDot's migrations that create and later remove operational tables. Apply migrations through the supported local D1 workflow, never during request handling.
7. Port bounded cleanup for expired subscriptions, old signing secrets, and deduplication rows. Enforce expiry independently of whether cleanup has physically removed a row.
8. Document environment key names only in `.env.example`. Do not include usable credentials or populated owner IDs.

**Validation:** anonymous/non-owner/unverified-identity rejection; ID/key validation; encryption binding and wrong-key rejection; migration application to an empty database; exact application-table/column inventory; bounded expiry cleanup with synthetic time.

**Complete when:** shared runtime services enforce the owner boundary and the database can contain only the permitted application records.

### Task 3 — Implement the Telegram adapter and tool operations

**Files:** `lib/telegram/normalize.ts`, `lib/telegram/service.ts`, `lib/telegram/message-reference.ts`, an internal client factory if needed, and focused Telegram contract/write tests.

1. Define the two event schemas and shared identifier/text types. Use decimal strings for bot/chat/user IDs at the MCP boundary and safe integers for message/update IDs. Validate conversion to grammY without loss.
2. Normalize eligible owner `message` and `edited_message` updates into the specified envelope. Keep complete text, required occurrence metadata, and a nullable reply ID; discard nested reply content, profiles, and unrelated fields.
3. Derive stable event IDs from bot/update identity. Preserve distinct edits and out-of-order updates without a high-water mark, history cache, or content comparison.
4. Build the grammY client with validated bot information, native Worker fetch, redirect rejection, abort support, sanitized errors, and explicit timeouts. Disable webhook-reply optimization and avoid automatic retry/session plugins.
5. Implement bounded `getMe` identity verification and fixed-owner send, edit, delete, and reaction operations. A network check must not become an implicit prerequisite on the ingress acknowledgment path.
6. Implement plain-text size validation, optional same-chat replies, and one ordinary reaction or clear. Missing reply targets fail rather than falling back to an unrelated message.
7. After a valid confirmed send response, issue a signed message reference containing only the specified provenance. Require it for edit/delete and validate its signature, version, owner/bot/chat binding, and exact target. Editing preserves original send provenance.
8. Map definite API errors, rate-limit delays, and ambiguous write outcomes into the error contract. Each mutation makes at most one write attempt. A blocked-chat write error leaves subscriptions untouched.

**Validation:** private-owner normalization versus every excluded context; future Telegram metadata discarded; full-text and Unicode boundaries; forwarded text authorization; bot identity mismatch; fixed destinations; tampered/cross-owner/cross-bot references; owner-message deletion rejection; reply failures; setting and clearing a reaction on an owner-authored message using its raw message ID; ambiguous results without resend or result persistence.

**Complete when:** the service implements all five tool operations' underlying behavior, with synthetic transport tests and no stored message or write state.

### Task 4 — Adapt subscription lifecycle and deduplication

**Files:** `lib/events/subscriptions.ts`, `lib/events/callback.ts`, `lib/events/dedup.ts`, relevant storage queries, and subscription/deduplication tests.

1. Port the current SlackDot lifecycle and callback code, replacing Slack-specific schemas and access checks. Accept only the two Telegram events and required empty subscription arguments.
2. Implement deterministic subscription IDs with principal, canonical destination, event, arguments, and installation binding. Refresh must not overwrite bot/Telegram-owner binding or reset creation time for an active subscription.
3. Preserve the 72-hour default/maximum lifetime, shorter requested grants, finite handling of `ttlMs: null`, five-minute verification cache, and one-minute signing-key overlap.
4. Preserve encrypted secrets, signed callback challenges, exact-origin policy, redirect rejection, payload limits, and bounded/cancellable requests. Keep challenge and event signing behavior consistent.
5. Implement canonical unsubscribe as a query over stored principal/event/arguments/callback identity across bindings. It must work with missing or invalid Telegram credentials and after bot/owner configuration changes. Scope any ID-form convenience to the authenticated owner as well.
6. Port atomic deduplication claims with Dotagram-specific key derivation, fixed 25-hour expiry, 45-second leases, stale-token fencing, and remaining-lifetime checks. Do not extend retention on duplicate ingress or reclaim.
7. Preserve fail-closed behavior on claim/storage errors and the distinction between callback success and success-record persistence.

**Validation:** canonical identity independent of JSON key order; idempotent refresh/unsubscribe; expiry and rotation; owner isolation; binding immutability; unsubscribe across bindings without Telegram access; destination/challenge failures; concurrent claims; abandoned/failed reclaims; boundary cleanup; stale completion; stable fixed expiry; failed completion writes; root-key changes.

**Complete when:** lifecycle and deduplication operate on the new schema with the specification's privacy and concurrency properties.

### Task 5 — Connect authenticated ingress to bounded delivery

**Files:** `lib/telegram/receiver.ts`, `lib/telegram/feedback.ts`, `lib/events/delivery.ts`, `lib/events/budget.ts`, `lib/runtime/router.ts`, `worker/index.ts`, and ingress/delivery tests.

1. Add `POST /telegram/webhook` with bounded body reading and constant-time secret validation. Validate required fields and recognized excluded contexts; tolerate unknown Telegram fields and ignore unsupported update variants.
2. Initialize grammY without a foreground API request. Complete normalization and register work with `ctx.waitUntil()` before acknowledging an eligible update. If required configuration/background execution is unavailable, fail rather than claim work was scheduled.
3. Use only `message` and `edited_message`. Other users, groups, media, business/topic contexts, and lifecycle updates receive no delivery, persisted data, or automatic bot reply.
4. Adapt subscription selection, current-state rechecks, bot-identity checks, claim acquisition, and signed callback fanout. All work shares the original invocation deadline; do not restart a budget per subscription or attempt.
5. Preserve the specification's retry classification and timings: 20 seconds for callbacks, at most three attempts, four-second callback caps, one/two-second backoff, longer server delays only when they fit, and at most four concurrent subscription deliveries.
6. Clip Telegram requests to the provisional five-second cap and remaining deadline. Cancel transport work at the deadline; do not merely stop awaiting a still-running network operation.
7. On the first confirmed new-message callback acceptance, attempt one typing action per invocation. No typing for edits, suppressed duplicates, or ingress alone; feedback failure cannot cause callback redelivery.
8. Attempt one failure reply only under the specification's active-subscription/no-success/no-suppression conditions. Keep the final deadline at acceptance plus 25 seconds, preserve uncertainty wording, and do not retry or persist the notice.

**Validation:** a deferred callback cannot hold Telegram acknowledgment; missing `waitUntil` fails closed; duplicate ingress/fanout; unsubscribe/expiry during attempts; success, retry recovery, exhaustion, terminal client errors, long retry delays, aborts, and interruption; one-shot typing; feedback suppression and ambiguity; no subscription changes on blocked-write errors.

**Complete when:** real application routes use the bounded in-memory path and the Worker entry point supplies the execution context. No manual delivery route, timer service, or payload queue exists.

### Task 6 — Expose MCP tools/events and the minimal setup view

**Files:** `lib/mcp/server.ts`, `app/page.tsx`, `app/setup/page.tsx`, `app/layout.tsx`, minimal styles/assets, and MCP/authentication tests.

1. Preserve the SDK-owned MCP 2.0 transport and Worker schema validator. Enforce owner authorization before discovery, tool calls, and event methods.
2. Register exactly `telegram_get_connection_info`, `telegram_send_message`, `telegram_edit_message`, `telegram_delete_message`, and `telegram_set_reaction` with strict input/output contracts and truthful annotations.
3. Advertise the two events, `capabilities.events`, webhook delivery, empty subscription argument schemas, and the actual payload schemas. Wire subscribe/unsubscribe to task 4 and keep `cursor: null`.
4. Verify advertised JSON Schema agrees with runtime validation, including rejection of arbitrary destination fields, unknown MCP arguments, unsigned edit/delete targets, and unsupported event/filter names. Reactions retain raw `message_id` inputs scoped to the owner DM; they do not require signed bot-message references.
5. Adapt the public landing page, `/health`, and authenticated setup page. Bootstrap may show only the visitor's own Site identity; only the configured owner can inspect configuration presence and connection details.
6. Remove Slack language, history promises, stored-result replay claims, and unsupported tools/events. Explain brief typing, ambiguous writes, and delivery limits accurately in tool/reference text.

**Validation:** SDK discovery and request envelopes; exact five-tool/two-event catalog; successful synthetic full-flow calls; invalid arguments; sanitized errors; anonymous, forged-header, signed-in non-owner, and unverified-boundary rejection; bootstrap access without configuration disclosure.

**Complete when:** the complete intended catalog and setup experience are integrated with the actual services and storage, without placeholder tool handlers.

### Task 7 — Write installation and usage documentation

**Files:** `README.md`, `AGENTS.md`, `docs/install.md`, `plugin/skills/use-dotagram/SKILL.md`, and configuration examples.

1. Write a concise human-facing README describing owner DMs, supported operations, privacy, and installation entry points.
2. Adapt SlackDot's ordered installation procedure to BotFather, a securely stored bot token, explicit verified numeric human-owner ID, derived bot information, and agent-generated secrets.
3. Make the owner-ID verification procedure concrete and compatible with available secure installation tools. Do not use first-message-wins enrollment, a public debug endpoint, or a runtime pairing feature. If a secure human handoff is necessary, state the exact non-secret result needed and how the installer verifies it.
4. Document initial public deployment without MCP publication, genuine Site-owner sign-in, applied runtime configuration, identity-boundary checks, webhook registration, MCP enablement, and intended-Dot handoff in dependency order.
5. Specify the webhook URL, secret handling, update allowlist, and initial connection limit of one. Routine redeployment must preserve pending updates, Site identity, subscriptions, and keys.
6. Document the distinction between saved settings and deployed settings; preserve installation IDs and progress on resume. Keep masked secrets out of execution paths and credentials out of chat, arguments, URLs exposed to users, and logs.
7. Write the plugin skill as a reference for the actual five tools, two events, signed references, empty subscription arguments, and limitations. The intended Dot owns its response instructions and native automation.
8. Keep repository instructions focused on installation, scope preservation, supported validation, and privacy. Do not import Slack-specific requirements or prescribe a prototype-first workflow.

**Validation:** all links and examples match implemented names, schemas, settings, and routes; every setup phase has a concrete completion condition; the guide works without assuming another session's local files, sign-in, or credentials. No secret values or stale Slack setup instructions remain.

**Complete when:** an installer and the intended Dot have an accurate, ordered procedure and reference for the finished application.

### Task 8 — Complete integrated local verification

**Files:** focused unit/protocol suites, `tests/support/`, synthetic Worker acceptance fixtures, build/check scripts as needed, and this plan's verification record.

1. Run the relevant focused tests during tasks 2–6. Once integrated, run the full test suite and TypeScript check for the exact source being evaluated, using the retained `npm test` and `npm run typecheck` scripts.
2. Build with the supported Sites build helper and the actual deployment configuration. Validate the generated Worker, not only Node-based unit tests.
3. Adapt the SlackDot synthetic Worker harness for ingress, all five tools, both events, callback lifecycle, and bounded delivery. Keep injected transports/test controls outside production routes and production bundles.
4. Verify D1 migrations on a fresh database and inspect the resulting tables/columns. Test cleanup and retention using synthetic time; do not wait 25 or 72 hours for boundary tests.
5. Inspect production imports, bundles, fixtures, and logging behavior for Slack runtime dependencies, sensitive values, raw update logging, prohibited persistence, and accidental recovery/debug endpoints.
6. Check documentation/configuration examples and `git diff --check`. Record source revision when available, dependency versions, checks run, outcomes, and unresolved limitations without retaining live message payloads.
7. Repeat affected checks only when changes or failures justify it. A successful local build does not count as hosted or native-client acceptance.

**Complete when:** the complete application passes local tests, type checking, the supported Sites build, and synthetic Worker verification. Any remaining hosted checks stay explicitly pending.

### Task 9 — Install and perform normal hosted acceptance

**Environment:** the actual Dotagram Site, its integrated D1 database, the owner's Telegram bot, the generated Site plugin, and the intended Dot's native ChatGPT context.

This task is the eventual installation/acceptance work, not authorization to deploy during the current planning task. Follow the finished installation guide and supported Sites/plugin workflows when installation is requested or included in the implementation task.

1. Deploy the complete application through the staged configuration procedure. Reuse the same Site/plugin/database when resuming; do not create a separate compatibility service or prototype deployment.
2. Verify public authenticated Telegram ingress alongside genuine owner MCP access and anonymous, forged-header, and signed-in non-owner rejection. Establish actual readiness, not merely rejection by an unconfigured endpoint.
3. Verify the native plugin advertises the five tools and two events, accepts subscriptions, completes signed callback verification, and supports canonical unsubscribe. Confirm lifecycle state survives redeployment without changing the key.
4. In the intended Dot, create the requested native automation and verify a real owner text message produces a native event and a Telegram reply. Verify an owner edit produces the updated event, with correct text, identity, timestamps, and reply relationship.
5. On isolated test messages, verify send, reply, edit, delete, set reaction, and clear reaction through the native tools. Respect the bot-authored deletion boundary and use human observation where Telegram offers no read-back API.
6. Verify the typing API result and, where observable, its brief visual effect after callback acceptance. Do not equate successful delivery or typing with completion of the Dot's work.
7. Verify excluded senders/contexts, bot-loop prevention, duplicate suppression, and blocked-write error behavior without changing subscriptions. Use synthetic transport tests for cases that would otherwise require unsafe account changes or a real outage; label the evidence accurately.
8. Inspect permitted schema/state without exporting real message content. Preserve pending Telegram updates on normal redeployment. Clean up only test messages and subscriptions created for acceptance; retain the owner's intended automation.
9. Record which specification acceptance checks passed, which were synthetic versus native/hosted, and any unavailable verification. Fix observed implementation defects and rerun the affected checks. Do not introduce infrastructure or storage outside the specification as a workaround.

**Complete when:** the specified native tool/event workflow has acceptance evidence, privacy and owner boundaries are verified, and any remaining limitations are explicitly reported. Lack of hosting credentials or a required human action must be reported as pending acceptance, not as failure of the already-established Sites/MCP architecture.

### Task 10 - Setup authorization and bootstrap client

**Ownership/files:** `lib/setup/`, `lib/runtime/config.ts`, `lib/telegram/client.ts`, focused authorization/transport tests; no schema migration.

Implement the section 11 Sites identity/owner checks and strict decoded-argument validation before network access. Use framework server actions with their existing transport, request limits and protections; add no custom origin checks, origin environment setting, CSRF machinery, or JSON endpoint parser. Inspection/verification require the Site owner, verified boundary and token, but not Telegram owner/bot-info settings. Registration requires full messaging configuration. Reuse a bounded, sanitized transport in a grammY Api bootstrap client with the four-method allowlist and shared foreground deadline. Keep the current runtime client contract and five-tool catalog unchanged.

**Validation:** unauthenticated/non-owner action invocation and invalid or unknown arguments cause zero upstream calls; hosted Sites dispatch rejects forged identities. Test the retained framework request limits/protections through its action path without imposing new Origin-header rules. Missing Telegram configuration does not create a circular bootstrap dependency. Verify cancellation, sanitized errors, no redirect following or credential projection, and no messaging regression.

### Task 11 - Fixed actions and owner setup page

**Ownership/files:** `lib/setup/`, a server-only `app/setup/actions.ts` module, `app/setup/` UI, and tests for setup services/framework action invocation. Do not add setup routes to `lib/runtime/router.ts`.

Implement `inspectTelegramSetup`, `verifyTelegramOwner`, and `registerTelegramWebhook` as framework server actions exactly as section 11. Read the authenticated identity inside each action rather than trusting page authorization or client-supplied identity. Resolve the current Site URL from the supported server-side Sites/framework request context for webhook construction; verify the actual integration before introducing any alternative. Use browser-memory nonce state, explicit action buttons and explicit human confirmation. Display only allowlisted non-secret results for the installer to save through Sites; the application does not update environment settings. Do not trigger calls on page load/prefetch or create stored enrollment state. Implement the existing-installation skip/conflict paths before registration. Show uncertainty after a submitted write times out; never automatically retry it.

**Validation:** no/unique/multiple nonce matches, full page, configured owner, existing webhook, token/bot mismatch, excluded sender/context, getUpdates parameters without offset/filter changes, shared deadline, single setWebhook, current-Site webhook target and fixed options, rejection of client-supplied destination arguments, matching/conflicting existing hook, sanitized inspection, and no secret readback. Verify no storage writes from any setup action.

### Task 12 - Retire workaround and reconcile documentation

**Ownership/files:** `scripts/telegram-bootstrap.py`, `scripts/telegram-register.py`, `tests/bootstrap/`, `docs/install.md`, `README.md`, `.env.example`, `AGENTS.md`, verification/progress documents and plugin reference as needed.

Remove the Python helpers and their exclusive tests after the replacement works; translate meaningful checks into the TypeScript setup suite. Remove Python prerequisites, subprocess/environment handoff instructions and bootstrap artifact production. Do not delete existing local installation artifacts as an implicit cleanup step; they are not needed by the new flow and any cleanup must be explicit. Document the ordered installation phases and their deployment/configuration dependencies, exact owner handoffs, preserved existing settings and framework server-action invocation. Keep the revised installation guide aligned with the implemented framework actions; do not restore superseded custom-origin/configuration instructions or add an origin key to `.env.example`. Keep the user's deterministic automation text verbatim. Correct stale statuses, overstated compliance claims and damaged document encoding without rewriting historical acceptance as new evidence.

### Task 13 - Validate and upgrade the existing Site

**Ownership/files:** setup unit/protocol/Worker tests and verification documentation; use supported Sites tooling for any later publication.

Run focused setup tests, full npm test, typecheck, supported Sites build, affected synthetic built-Worker messaging/setup scenarios, and production-bundle/privacy inspection. Use synthetic services for clean-install and conflict/timeout cases; never delete the live webhook or re-enroll the live owner to simulate a fresh installation. Verify the browser invokes the real framework server-action path with Sites authentication and per-action owner authorization. Preserve built-in framework protections and request limits; do not add custom origin validation. Confirm webhook construction produces the exact current Site URL.

When implementation/publication is authorized, retain the existing Site, bot, owner IDs, keys, database, plugin, subscriptions and automation. Deploy the revision without adding an origin setting or changing existing environment values for this purpose. Distinguish bootstrap identity/dispatch evidence while the verification guard is false from post-enable action authorization. Pair successful owner inspection with anonymous/forged-header/signed-in-non-owner action rejection after preliminary settings are applied; do not count blanket pre-enable denial as those results. On the existing Site, preserve the enabled guard and verify registration is a no-write already-configured result. Check subscription/environment preservation and an owner-message round trip. Record the replacement flow's clean-install synthetic evidence separately from hosted inspection/resume evidence. A genuine new-bot/new-Site installation is not implied or required as an unapproved test resource.

**Complete when:** the replacement passes applicable checks, the existing installation remains intact, Python/custom handoff is removed, and any unavailable hosted cases are explicitly reported. Do not mark original acceptance as proof of the replacement.

## 4. Acceptance coverage map

| Requirement | Implementation tasks | Evidence |
| --- | --- | --- |
| Reuse Sites/MCP architecture without Slack runtime dependencies | 1, 6 | Dependency/import inspection, protocol tests, Sites build, native discovery |
| Explicit owner-only ingress and fixed-destination tools | 2, 3, 5, 6 | Local negative cases and hosted identity/ingress checks |
| Text-only new/edit events with forward-compatible ingress | 3, 5 | Normalization tests, extra-field stripping, native new/edit receipt |
| Bot-only edits/deletes without stored write results | 3, 6 | Provenance/tampering tests and native fixture operations |
| Current subscriptions, rotation, expiry, and unsubscribe across bindings | 2, 4, 6 | Lifecycle tests, synthetic time, native subscribe/unsubscribe, redeploy persistence |
| Opaque fixed 25-hour deduplication and 45-second claims | 2, 4, 5 | Schema inspection, concurrency/fencing/boundary tests, duplicate ingress |
| Bounded in-memory delivery and honest failure behavior | 5 | Retry/deadline/interruption Worker scenarios and real native round trip |
| One-shot typing and no block-triggered subscription deletion | 3, 5 | Feedback ordering/failure tests and Telegram operation results |
| No payload/history/feedback/write retention | 2–8 | Storage assertions, schema/import/log checks, synthetic fixtures |
| Installation and intended-Dot handoff | 7, 9 | Ordered guide, applied configuration, actual plugin and automation acceptance |

The [specification](specification.md) remains authoritative for detailed schemas, timings, and limitations. This map connects requirements to work; it does not replace or weaken them.

## 5. Completion and evidence tracking

Update the task statuses as work actually completes. Keep local implementation completion and hosted acceptance separate, and do not mark pending checks as passed based on SlackDot's historical results.

- [x] Tasks 1–7: complete application and documentation implemented.
- [x] Task 8: local tests, type checking, Sites build, and synthetic Worker checks passed.
- [ ] Task 9: installation and native hosted acceptance completed, with any limitations stated.
- [x] No additional application tables, Slack dependencies, or background delivery services introduced.
- [x] Retire the unapproved Python installation/custom credential handoff through tasks 10-12.
- [x] Owner-authenticated setup revision implemented and locally verified.
- [ ] Task 13 hosted upgrade and owner-session acceptance (deployment explicitly excluded from this implementation request).
- [x] Local fixtures use synthetic data. Subsequent authorized installation and owner-reported native acceptance are recorded separately.

Local implementation results, dependency versions, test coverage and remaining hosted checks are recorded in [docs/verification.md](../docs/verification.md). No separate prototype was built. Authorized installation subsequently created the Site/webhook/plugin, and the intended Dot established native subscriptions; remaining hosted acceptance is tracked in the verification record.

## 6. Setup design clarification (2026-11-08)

Tasks 10-13 use framework server actions rather than custom setup POST routes. The proposed custom origin checks and additional origin environment requirement are removed. Sites authentication and explicit server-side owner authorization remain required. Tasks 10-12 and task 13's local validation are complete. The installation guide matches the replacement and preserves detailed agent/human handoffs, including locating the intended Dot. Deployment and hosted acceptance remain pending; no installed settings, bindings, subscriptions or automation were changed.
