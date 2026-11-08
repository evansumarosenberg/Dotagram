# Dotagram verification record

Local implementation verified on 2026-11-07 (America/Chicago). Initial Sites deployment subsequently succeeded; see [installation progress](installation-progress.md) for the exact source/deployment and hosted checks. Telegram configuration, webhook registration, generated plugin installation, and intended-Dot new/edited message round trips are confirmed. Remaining acceptance is listed below.

Historical initial local-test baseline: working-tree implementation over repository revision `22df60b37a1d65c85fa29197045d0584daaae36e`. That baseline preceded publication; current deployed source is recorded in installation-progress.md. The checked-in lockfile identifies the dependency tree. Runtime/build/test-source SHA-256: `44eb0efd1fc5b1ae358c774f58fb33af9397acb4faaea7e24058c11defa167f6` (sorted path + NUL + file bytes + NUL over app/lib/worker/db/drizzle/scripts/tests/.openai and root package/build/type configuration).

## Environment and dependencies

Windows PowerShell; Node 26.13.0; npm 12.2.1. Retained Sites portable workflow with Vinext and Cloudflare `nodejs_compat`, compatibility date `2026-05-15`.

| Package | Tested version |
| --- | --- |
| grammY | 1.46.0 |
| MCP server SDK | 2.4.0 |
| Zod | 4.6.7 |
| Standard Webhooks | 1.1.1 |
| Drizzle ORM / Kit | 0.45.2 / 0.31.10 |
| Vinext / Vite | 1.0.0-beta.5 / 8.0.13 |
| Cloudflare Vite plugin / Wrangler | 1.37.1 / 4.92.0 |
| React / Next | 19.2.6 / 16.3.4 |
| TypeScript / Vitest | 5.9.3 / 5.1.0 |

The first Sites installer attempt required a lockfile. Generated it with npm's package-lock-only mode; npm required `--allow-remote=all` to resolve the official registry's Tailwind WASM tarball dependency. Then the supported Sites installer succeeded. npm reported blocked optional install scripts for esbuild/workerd; their packaged platform binaries nevertheless passed the build and Worker checks. Deprecation warnings from retained tooling did not fail validation. No Slack packages remain in the dependency graph.

## Passed local checks

- `npm test`: **56 tests across six suites**.
- `npm run typecheck`: passed.
- Installed Sites `build-site.mjs`: passed, emitting `dist/server/index.js` and client assets.
- Fresh migration generated from exactly two application tables and applied through local Wrangler D1. `event_dedup` has exactly five columns and its expiry index; `subscriptions` has 15 lifecycle/binding columns. No historical SlackDot migrations were copied.
- Built application exercised with Miniflare, using synthetic Telegram and signed callback services. Both events, all five tools, native-shaped MCP envelopes, subscription challenge/refresh/unsubscribe, owner/non-owner setup views, and schema/privacy assertions passed.
- Source, dependency and bundle inspection found no Slack runtime imports/packages, real credentials, raw update logging, public recovery endpoints, or test transport injection. Application writes are limited to subscriptions and opaque dedup state. Outbound fetches explicitly disable caching.

| Built-Worker scenario | Observed result |
| --- | --- |
| Success | New and edited events accepted; one typing action for new message only |
| Retry | One transient callback failure followed by receipt; one typing action |
| Exhaustion | Three callback attempts; one uncertain-delivery failure reply |
| Permanent failure | One attempt on HTTP 410; one failure reply |
| Long rate limit | One callback attempt with Retry-After 60; no out-of-budget retry |
| Timeout | Stalled callbacks bounded by request caps; at most three attempts, one failure reply |
| Interruption | Worker disposal/restart does not replay the acknowledged event; subscription survives |
| Fanout | Six subscriptions delivered independently; maximum four concurrent callbacks, one typing action |
| Duplicate | Repeated ingress after success suppressed; no second typing action |
| Notice failure | Three failed callbacks; one rejected notice, no notice retry |

Synthetic ingress acknowledgment was approximately 5–7 ms in the observed runs. This is local timing evidence, not a production latency promise. Callback/feedback work stayed within the asserted overall bound. The mock external service may continue its own work after a request is aborted; Dotagram cancels its network request and does not wait past the deadline.

Unit tests separately cover fixed 25-hour deduplication, 45-second claims, concurrent claim winners, stale-token fencing, fixed expiry on reclaim, boundary cleanup, encrypted key rotation/expiry, canonical unsubscribe across bindings without Telegram credentials, authorization, invalid IDs/keys, full Unicode text, unknown Telegram fields, excluded contexts, signed reference tampering/binding, blocked writes, ambiguous writes, missing replies, claim/finalization failures, cancellation, and transport/body aborts.

Two integration corrections were made during validation: bridge grammY's abort-signal polyfill into a native controller, and reject Telegram redirects using `redirect: "manual"` plus a status check because Workers does not implement `redirect: "error"`. Sensitive logging remains disabled. Temporary synthetic diagnostics were removed before the final build.

## Pending checks and limitations

- The live connection reports the expected five tools and two event types. Exact negotiated MCP version 2026-07-28 remains unverified because the native client did not expose negotiation metadata; local protocol tests passed.
- Native refresh, expiry verification, and isolated canonical unsubscribe could not be exercised through the exposed controls. These have synthetic coverage. Production subscriptions and automation were left unchanged. Subscription records and subsequent messaging survived unchanged-version redeployment.
- Signed-in non-owner rejection still needs hosted acceptance; local negative tests passed. Published MCP anonymous/forged-header rejection and genuine owner setup access passed.
- Disabling group joining in BotFather still needs owner confirmation; runtime group rejection applies.
- Local visual preview QA was unavailable. Hosted authenticated setup was observed successfully.

Keep the accepted reliability limits: no payload replay, no exactly-once writes, possible duplicates/out-of-order events and loss after early acknowledgment, brief best-effort typing, and request-driven metadata deletion rather than an exact erasure schedule. A successful live exchange does not establish latency guarantees or every lifecycle case.

## Hosted installation evidence (2026-11-07)

Same Site deployed with environment revision 5. Genuine owner setup access and bounded live Telegram connection check passed. Anonymous forged setup identity redirects to sign-in; wrong webhook secret returns 403. Hosted D1 contains only subscriptions and event_dedup. Owner explicitly confirmed Telegram ID after nonce verification. Owner-reported registration helper success verifies exact webhook URL, message/edited_message allowlist, maximum connections one, and preservation of pending updates. Native ingress and the intended-Dot round trip were subsequently confirmed by the owner, as recorded below. See installation-progress.md for exact installation identifiers. These results supersede the corresponding pre-installation pending items above.

MCP publication version 2 succeeded on the same Site with environment revision 5 preserved. Full 56-test suite, typecheck, supported Sites build, and rebuilt-Worker success scenario passed. The owner subsequently confirmed the actual owner-to-Dot round trip.

## Native round-trip acceptance — owner reported

The owner confirmed that the intended Dot received a test message sent to the Telegram bot and replied in Telegram. This is live end-to-end evidence for owner-message ingress, native event receipt, and an outbound Telegram response. It is user-observed evidence, not an installer-captured trace. No message text, message references, callback details, or write results were collected or retained. The active intended automation and subscriptions must be preserved. The remaining native checks above are not implied by this successful exchange.

## Edited-message acceptance — owner reported

The owner confirmed that the intended Dot received an edited-message event and attempted a response. The owner subsequently identified the block as ChatGPT automatic approval review enforcing an unintended automation rule: one response per Telegram source message. The automation treated the already-answered source message as ineligible for a response to its edit. This was not a Dotagram duplicate rejection. The owner subsequently confirmed that both new-message and edited-message replies work under the corrected automation instructions. Native receipt and response are confirmed for both event types.

Dotagram derives event IDs from bot ID and Telegram update ID and deduplicates event/subscription delivery, not outgoing writes. Any automation duplicate handling should distinguish repeated delivery of the same event from a new edit event for the same source message. The owner corrected the automation authorization, including explicit permission for multiple distinct outbound messages per incoming event, before confirming successful tests. Do not bypass review rejections or automatically resend uncertain writes. No source-message identifiers, conversation text, or signed references were retained here.

## Additional hosted checks

The owner visually confirmed the one-shot typing indicator. Anonymous and forged-owner-header POST /mcp tools/list requests both returned 401 with no catalog; the control GET /health returned 200. Python's default User-Agent initially received Cloudflare error 1010 even on health; that edge response was not counted as application authorization evidence. The successful control/probes used a browser-style User-Agent.

Hosted schema inspection reconfirmed only subscriptions and event_dedup. The latter has exactly key, state, claim_token, claim_expires_at, expires_at. Two subscription records were inspected privately for before/after redeployment comparison; no callback values or secrets were printed or persisted. Native Dot tools remain unavailable in the installer chat. See [remaining acceptance instructions](remaining-acceptance.md) for the tests requiring the controlling Dot or owner.

Unchanged saved version 2 was redeployed successfully as appgdep_6aeff9d265d48191b79d696472211344 with applied environment revision 5. Both complete subscription records compared equal before/after deployment (including encrypted signing material and lifecycle/binding fields). Saved environment metadata and values compared equal; secret values remain masked, and their unchanged revision establishes that no settings update occurred. No Telegram webhook registration or pending-update deletion was performed. After redeployment: health 200, anonymous MCP 401, forged-owner MCP 401, incorrect webhook secret 403, forged setup 307. The subsequent owner-supplied Dot acceptance report confirms successful messaging after this redeployment.

## Native messaging acceptance - controlling Dot report supplied by owner

Passed: two distinct outbound responses to one incoming event, both explicitly linked to the source message; bot-message edit and deletion; reaction addition and removal; invalid and tampered signed-reference rejection without a reported mutation. The owner visually confirmed the edit and reaction. Four rapid new/edit/reply events arrived with distinct event/update IDs and the correct reply relationship. Out-of-order arrival was observed and is permitted. No bot-authored event or response loop was observed among the delivered test events; this is not proof about unseen events. The live connection reported the expected five tools and two event types, not negotiated protocol metadata.

This completes the observable messaging acceptance, including post-redeployment delivery. Protocol negotiation and native subscription lifecycle remain explicitly unverified as detailed above. No message content, raw IDs, signed references, or callback secrets were copied into this record.

## Setup revision status (2026-11-08)

Owner-authenticated setup replaces the unapproved Python/custom credential workflow in the revised specification and plan. This is a documentation-only design change: no replacement route is implemented or deployed, no helper has yet been removed, and no acceptance result above establishes the new flow. Tasks 10-13 remain pending.
