# Dotagram

> The ’grams must flow.

A lightweight bridge from your private Telegram bot conversation to your Dot, deployed on ChatGPT Sites. No external infrastructure needed!

Dotagram receives new and edited **text messages from one explicitly configured owner**. Your Dot can send text, reply, edit/delete its own messages, and set or clear reactions. Messages from groups or arbitrary contacts are intentionally outside scope.

MCP 2.0 event subscriptions are supported, so the Dot can create event-triggered automations for replying to messages.

Support for attached media and files are not yet supported, but may be added in the future.

To further expand your Dot's messaging capabilities, check out [SlackDot](https://github.com/evansumarosenberg/SlackDot), a companion project that provides a similar bridge for multiple Slack workspaces.

## Install with Codex or ChatGPT Work

Use **Codex or a ChatGPT Work cloud session** with the Sites plugin and plugin connection tools available to build, deploy and configure Dotagram. You need a Telegram account and a bot created through BotFather. Once installation is ready, your intended **Dot in ChatGPT** will connect the plugin and create the event-triggered automation.

Give your installation agent this prompt:

```text
Read https://github.com/evansumarosenberg/Dotagram/blob/master/README.md and follow its installation instructions to set up Dotagram for me.
```

**Installation agent: read [AGENTS.md](AGENTS.md), then follow [docs/install.md](docs/install.md) in order.** The installation guide is the canonical procedure, including manual handoffs, configuration, verification and the prompt to give the Dot.

You (the human) will create or select the Telegram bot in BotFather and enter only this Site environment value when prompted:

```dotenv
TELEGRAM_BOT_TOKEN=
```

The installation agent configures the remaining values. You may also need to sign in, approve the plugin connection, send the setup page's verification nonce to your bot, explicitly confirm your Telegram owner account, and send a test DM. Some authenticated steps may need your browser. Enter the bot token directly in Sites settings; keep secrets out of chat.

Each installation connects one Telegram bot, one verified human owner, and one controlling Dot. A repurposed bot's existing webhook can be replaced through setup after your explicit confirmation. When continuing an existing Dotagram installation, keep its bot, Site, plugin, and automation and skip owner enrollment.

## Privacy and Data Retention

Each Dotagram installation stores event subscriptions and privacy-preserving records in the database attached to the owner's ChatGPT Site. These opaque records suppress repeat event delivery for three hours. Expired records are removed on subsequent activity; no message content or delivery history is retained.
