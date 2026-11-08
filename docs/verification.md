# Dotagram verification record

Local implementation verified on 2026-11-07 (America/Chicago). Initial Sites deployment subsequently succeeded; see [installation progress](installation-progress.md) for the exact source/deployment and hosted checks. Telegram configuration and native ChatGPT/Telegram acceptance remain pending. No live Telegram webhook, generated plugin, or native automation has been created.

Source: working-tree implementation over repository revision `22df60b37a1d65c85fa29197045d0584daaae36e`. Changes are uncommitted; this is not a claim that the base revision contains the implementation. The checked-in lockfile identifies the dependency tree. Runtime/build/test-source SHA-256: `44eb0efd1fc5b1ae358c774f58fb33af9397acb4faaea7e24058c11defa167f6` (sorted path + NUL + file bytes + NUL over app/lib/worker/db/drizzle/scripts/tests/.openai and root package/build/type configuration).

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

- A local dev server announced its URL, but both browser access and a loopback HTTP probe timed out in this session. Visual browser QA remains unverified. Built-Worker HTTP/setup checks passed; those are not screenshots or browser acceptance.
- Public Sites ingress, actual Sites dispatch rejection of forged headers, genuine signed-in owner success and signed-in non-owner rejection require the deployed Site. Local tests trust synthetic header injection and cannot prove the platform boundary.
- Actual Telegram bot credentials, explicitly verified human-owner ID, live webhook registration, real send/edit/delete/reactions and typing observation have not been exercised.
- Native plugin discovery, actual OpenAI callback challenge/renewal, and the intended Dot's message/reply automation have not been exercised. Synthetic callbacks are not evidence of a native subscription.
- Hosted redeployment persistence and hosted database inspection remain pending. Local Worker restart persistence passed.

Follow [installation](install.md) on the same future Site and record native/hosted evidence separately. Keep the accepted reliability limits: no payload replay, no exactly-once writes, possible duplicates/out-of-order events and loss after early acknowledgment, brief best-effort typing, and request-driven metadata deletion rather than an exact erasure schedule. Five-second Telegram request caps remain provisional until live measurements are available.

## Hosted installation evidence (2026-11-07)

Same Site deployed with environment revision 5. Genuine owner setup access and bounded live Telegram connection check passed. Anonymous forged setup identity redirects to sign-in; wrong webhook secret returns 403. Hosted D1 contains only subscriptions and event_dedup. Owner explicitly confirmed Telegram ID after nonce verification. Owner-reported registration helper success verifies exact webhook URL, message/edited_message allowlist, maximum connections one, and preservation of pending updates. Native ingress and intended-Dot round trip remain pending. See installation-progress.md for exact installation identifiers. These results supersede the corresponding pre-installation pending items above.
