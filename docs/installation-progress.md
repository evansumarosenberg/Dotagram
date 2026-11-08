# Dotagram installation progress

Updated 2026-11-07 (America/Chicago).

- Site: `appgprj_6aefec6e4ddc819193700f248526d147`
- URL: https://dotagram.paryllax.chatgpt.site
- Audience: public, as required for Telegram webhook ingress; protected operations retain owner authorization.
- Version: 1, `appgprj_6aefec6e4ddc819193700f248526d147~appgver_f5482d6cb728819190495669c78e2773`
- Deployment: `appgdep_6aeff04c308c81919ad190b178354be1`, succeeded (configuration deployment).
- Deployed source: `4c72e8db4f3f313cdc938957f2ec7cb78ab7d0c7`
- Applied environment revision: 5, all required settings configured; stable encryption/webhook secrets generated and saved as secrets.
- MCP capability: disabled; no generated plugin or native automation yet.

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

Next: verify ingress, publish MCP, and hand off native subscriptions to the intended Dot. Follow `docs/install.md`; preserve this Site and saved keys. The callback origin matches the reviewed SlackDot installation policy: `https://connectors.api.openai.com`. Real read-only Telegram identity checks have succeeded; no bot messages have been sent. Group joining is still enabled in BotFather and should be disabled; runtime group rejection already applies.
