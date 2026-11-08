# Dotagram installation progress

Updated 2026-11-07 (America/Chicago).

- Site: `appgprj_6aefec6e4ddc819193700f248526d147`
- URL: https://dotagram.paryllax.chatgpt.site
- Audience: public, as required for Telegram webhook ingress; protected operations retain owner authorization.
- Version: 2, `appgprj_6aefec6e4ddc819193700f248526d147~appgver_e9c91d0a869081919bc23c339974852f`
- Deployment: `appgdep_6aeff9d265d48191b79d696472211344`, succeeded (unchanged-version persistence verification).
- Deployed source: `6c43669f79d64231c5aa6e26c7f168d81636c99c`
- Applied environment revision: 5, all required settings configured; stable encryption/webhook secrets generated and saved as secrets.
- MCP capability: enabled; deployment succeeded with has_mcp=true. The owner confirmed the intended Dot received a Telegram test message and replied in Telegram.

The supported Sites helper built, committed, pushed and packaged the source. It needed sandbox escalation to write local Git metadata. No credentials were written into source or command arguments.

## Observed hosted checks

- `/health`: 200, `service: Dotagram`, `status: ok`.
- `/setup` with forged user ID/email headers: 307 to Sites sign-in; no forged identity exposed.
- `/mcp`: 404 while unpublished. This is not evidence of the final MCP owner boundary.
- `/telegram/webhook`: 503 while unconfigured, as expected.
- Hosted D1 `DB`: exactly `event_dedup` and `subscriptions` application tables.

## Current handoff

Owner sign-in and Telegram owner verification are complete. Bot: `9076214254` / `@ParyllaxAssistantBot`. Human Telegram owner: `1599227258`, explicitly confirmed by the user after a nonce match. `SITES_IDENTITY_VERIFIED=true` is deployed. The genuine signed-in setup page was reloaded and successfully verified the live bot connection and complete configuration.

The owner ran the registration helper and reported successful setWebhook and getWebhookInfo verification: exact Site webhook URL, message/edited_message only, max_connections=1, pending updates preserved. Group joining remains enabled. This verifies registration, not real ingress or native end-to-end delivery. Preserve existing keys.

The owner confirmed a successful live Telegram-to-Dot-to-Telegram exchange. Preserve the intended Dot's automation, subscriptions, existing Site, and keys. Remaining acceptance checks are listed in `docs/verification.md`. The callback origin matches the reviewed SlackDot policy: `https://connectors.api.openai.com`. Group joining remains enabled in BotFather; runtime group rejection applies.

Generated Site plugin: plugin_asdk_app_sites_bb6aa4fcadc48191b2d97c8a95ac8e32. MCP endpoint: https://dotagram.paryllax.chatgpt.site/mcp. Plugin Management confirmed installation; the owner subsequently confirmed a working native exchange.
The plugin tools were unavailable to the installer chat; live round-trip evidence comes from the owner's intended Dot. No conversation content was retained.

Owner also confirmed native edited-message receipt. The owner identified the response block as ChatGPT automatic approval review enforcing an unintended one-reply-per-source-message automation rule. Dotagram did not reject the response. Correct the intended automation instructions to distinguish new edit events from repeated delivery of the same event; preserve subscriptions. The owner subsequently confirmed successful replies to both new and edited messages.

The owner confirms that the intended automation now explicitly permits multiple distinct outbound messages from one incoming event. This is an instruction clarification, not authorization to automatically retry ambiguous writes. Local installation and usage instructions reflect it.

Latest owner-reported native acceptance: both new-message and edited-message replies work. This confirms both event-to-response paths; remaining tool and lifecycle checks are listed in docs/verification.md. No test message content was retained.

Owner visually confirmed one-shot typing. Unchanged-version redeployment passed; both subscription records and environment revision 5 were preserved. Post-deployment health/auth probes passed. Remaining human/native tests: docs/remaining-acceptance.md.

The owner supplied the controlling Dot acceptance report: all observable messaging operations passed, including multiple replies, explicit reply linkage, bot edit/delete, reaction set/clear, invalid/tampered reference rejection, rapid new/edit events, and messaging after redeployment. Expected tool/event counts were reported by the live connection. Negotiated protocol version and native refresh/expiry/isolated unsubscribe were unavailable to verify. Preserve production subscriptions. Remaining owner checks: separate-account access and BotFather group-joining confirmation.

The owner supplied the canonical automation text already in use. Installation and plugin reference instructions now require that wording verbatim, with event bindings configured separately and no appended automation restrictions. This documentation update does not modify the live automation.
