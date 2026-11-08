# Dotagram repository instructions

Read `plans/specification.md` and `plans/implementation-plan.md` before changing behavior. Use `docs/install.md` for installation and the current installed Sites skill for build/publication mechanics. This is reusable public source, with no configured installation. Start a fresh installation unless the user explicitly identifies an existing Site to resume; verify that Site before reusing it.

- Keep Site/project/deployment/plugin identifiers, owner and bot identities, environment values, installation progress and hosted acceptance records out of this public repository. Keep deployment-specific manifest changes in the installation's separate deployment checkout/private Sites source repository. Report installation progress in the private installation conversation, not public documentation.

- One bot, one explicitly verified numeric Telegram human owner, one Site principal, and one controlling Dot. Do not widen destinations or support groups, media, history, pairing, or other bot features without a new user decision.
- Only subscriptions and five-column opaque deduplication records persist. Do not retain raw requests, text, write results, message references, delivery attempts, feedback, or context in databases, caches, logs, or artifacts.
- Preserve fixed 25-hour deduplication, 45-second claims, 20-second delivery and 25-second feedback deadlines. No queue, scheduler, recovery endpoint, or automatic write retry.
- Edit/delete require signed bot-message provenance; reactions accept raw owner-DM message IDs. One-shot typing follows new-message callback acceptance; no automatic eyes receipt or typing refresh.
- Unknown upstream Telegram fields are stripped; MCP arguments are strict. Blocking never cancels subscriptions. Canonical unsubscribe works across old bindings without Telegram credentials.
- Keep framework/Sites integration and applicable licenses. Do not modify the SlackDot reference checkout or copy its installation state.
- Run focused tests, full `npm test`, `npm run typecheck`, and the supported Sites build for runtime changes. Run affected synthetic built-Worker scenarios. Keep test transports and controls out of production bundles.
- Use synthetic content only. Do not log raw grammY exceptions, Telegram URLs, callback secrets/URLs, or message content. Pass installation secrets only through supported secure input/execution, never chat or command arguments.
- Keep installation-specific native hosted acceptance in the private installation conversation. SlackDot establishes architectural feasibility; there is no separate compatibility prototype or feasibility gate.

- Keep only the owner-authenticated actions in specification section 11; do not add Python/local credential handoffs, environment editors, stored enrollment state, or installation MCP tools. Preserve the approved automation wording verbatim.
