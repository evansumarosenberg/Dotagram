# Dotagram

A lightweight bridge from your private Telegram bot conversation to your ChatGPT Dot. Built with grammY, MCP 2.0, and the Sites Worker/D1 foundation adapted from SlackDot.

Dotagram receives new and edited **text messages from one explicitly configured owner**. Your Dot can send text, reply, edit/delete its own messages using signed references, and set or clear reactions. Groups, media, history lookup, and arbitrary destinations are outside scope.

Only subscriptions and opaque deduplication records persist. Message content, write results, references, feedback, and conversation history are not stored. Your Dot maintains its own context. Delivery runs in bounded request background work: no queue, polling service, scheduler, or replay. An interrupted acknowledged update can be lost; duplicates and out-of-order events remain possible. A brief typing action follows confirmed callback receipt, not Dot completion.

- [Installation](docs/install.md): staged Sites deployment, explicit owner verification, webhook registration, and intended-Dot handoff.
- [Tool and event reference](plugin/skills/use-dotagram/SKILL.md).
- [Specification](plans/specification.md) and [implementation plan](plans/implementation-plan.md).
- [Verification record](docs/verification.md): local results and pending hosted acceptance.

## Development

Requires Node 22.13+ and the installed Sites workflow. Use its `install-dependencies.mjs` and `build-site.mjs` helpers. The committed lockfile pins the tested dependency tree. For ordinary standalone development, `npm run install:ci` and `npm run build` use the retained Sites scripts.

```sh
npm test
npm run typecheck
npm run build
node tests/compatibility/worker-smoke.mjs
```

Worker scenarios also accept `--scenario=retry`, `exhaustion`, `permanent`, `rate-limit`, `timeout`, `interrupt`, `fanout`, `duplicate`, and `notice-failure`. They exercise the built application using synthetic outbound services; no live Telegram account is contacted.

The manifest starts with MCP publication disabled and no Site ID. Do not enable it until owner configuration and identity-boundary checks are complete. Environment key names are documented in [.env.example](.env.example); never commit populated credentials.

After the first build, apply the initial migration to an empty local preview database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_pretty_killmonger.sql
```

Run that migration once per database. Sites applies hosted migrations during publication. Later schema changes require new migrations; requests never create or alter tables.

MIT licensed. The retained Sites build plugin has its own notice in `scripts/vite/sites-vite-plugin.LICENSE`.
