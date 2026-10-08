# Primitive skills

Skills for agents using [Primitive](https://primitive.dev) email. Connect an agent to its owner's app, communicate in email threads, and receive mail in its existing runtime. The guidance works across agent frameworks, models, and hosts.

## Install

```bash
npx skills add primitivedotdev/skills
```

This registers the skills with every supported agent it finds on your system. To install just one, pass `--skill`:

```bash
npx skills add primitivedotdev/skills --skill primitive-connect
npx skills add primitivedotdev/skills --skill primitive-network
npx skills add primitivedotdev/skills --skill primitive-chat
npx skills add primitivedotdev/skills --skill primitive-inbox
npx skills add primitivedotdev/skills --skill primitive-send
npx skills add primitivedotdev/skills --skill primitive-functions
npx skills add primitivedotdev/skills --skill primitive-webhooks
npx skills add primitivedotdev/skills --skill primitive-domains
```

### As a Claude Code plugin

In Claude Code, install the skills and Primitive's hosted MCP servers together as one plugin:

```bash
claude plugin marketplace add primitivedotdev/skills
claude plugin install primitive@primitive
```

Or, from inside a session, `/plugin marketplace add primitivedotdev/skills` then `/plugin install primitive@primitive`. Run `/mcp` and pick `primitive` to sign in with your Primitive account over OAuth; the docs server needs no sign-in. The plugin carries the same skills as `npx skills add`, namespaced as `primitive:<skill>`, so install one or the other, not both.

### As a Codex plugin

In Codex, this repository is its own plugin marketplace:

```bash
codex plugin marketplace add primitivedotdev/skills
codex plugin add primitive@primitive
codex mcp login primitive
```

That installs every skill plus the hosted MCP servers. `.agents/plugins/marketplace.json` is the marketplace manifest, and Codex reads the plugin's name, icon and descriptions from `extensions["com.openai"].interface` in `plugin.json`. The older `primitivedotdev/codex-plugin` marketplace installs the same plugin from this repository.

### As an Agent Plugin

This repository is also an [Agent Plugin](https://agent-plugins.org/specification). `plugin.json` at the root is the manifest, the skills live under `skills/`, and `mcp.json` bundles Primitive's hosted MCP servers (`https://www.primitive.dev/mcp` for mail, authenticated with OAuth or a Primitive API key by your client, and `https://www.primitive.dev/mcp/docs` for public docs search, no auth). Point any Agent Plugins client at this repository to install everything at once. The Claude Code manifest lives in `.claude-plugin/` and declares the same servers.

## Skills

### primitive-connect

Connects an agent to its owner's existing Primitive account from the app's copied
setup instruction. Agents with a terminal run one command
(`npx -y primitive@latest agent connect`), which claims the invitation, verifies
the connection, starts receiving and installs this skill from the CLI package.
Agents without a terminal connect over the HTTP API with nothing installed. The skill privately claims its assigned email
credential, connects receiving to the agent runtime, and verifies the connection through an
ordinary email reply. Teaches separate conversations, threaded replies,
ACK/Read/Working emails, and collaboration between agents: answering a
thread's latest state, quiet acknowledgements, thread mutes, work claims and
peer receiver health. Includes an optional Node.js helper for connecting and
a published-SDK-based mail helper with durable send state.

### primitive-network

Find listed agents in the same organization by their owner's name, read their
`AGENT_INFO` notes, and email the right peer from a connected agent profile.
Explains network visibility and how to keep receiving replies in the current
session.

### primitive-chat

Teaches the `primitive chat <email> <message>` verb: send an email and wait for the threaded reply, no SMTP credentials needed. Reach for it to ask a person or another agent something over email, for example a vendor's `help@`, `dev@`, `support@`, or `docs@` agent, the same way you would grep their docs. The skill body distinguishes addresses the agent can act on freely from ones with human side effects (`sales@`, `billing@`, `account@`) that should be surfaced to the user before sending.

### primitive-inbox

Gives your agent a real, managed `*.primitive.email` address that receives mail, plus the verbs to read it (`primitive emails latest`), wait for it (`primitive emails wait`), answer it in its thread (`primitive reply`), and run a hosted Function on every inbound message. Reach for it whenever the agent needs to receive or answer email: a reply, a verification code, an alert, or a throwaway address for a signup. It also teaches when not to reply: check the conversation for your own earlier replies first, and never answer bounces, no-reply senders, auto-replies, or list mail.

### primitive-send

Sends outbound email that you do not wait on: notifications, alerts, reports, receipts, and scheduled messages, with HTML and attachments. Teaches `primitive send` and its outcome exit codes so an agent never double-sends, how to pick a valid From (`primitive sending get-outbound-status`) and check allowed recipients (`primitive sending permissions`), and how to audit what went out and why it bounced (`primitive sent list`, `primitive sent get`).

### primitive-functions

Runs your JavaScript on every inbound email with no server to host: scaffold from a template (`primitive functions init`), deploy a bundle or let Primitive build from source (`primitive functions deploy`), bind inbound mail (`primitive functions route-set`), prove it end to end (`primitive functions test --show-sends`), follow logs, and manage secrets without leaking them into shell history. Includes the loop-safety rules every auto-responder needs.

### primitive-webhooks

Delivers inbound email to your own server as signed `email.received` events. Covers creating endpoints, verifying the `Primitive-Signature` header with the SDK, routing specific addresses to specific handlers (`primitive routes add`, `primitive routes test`), receiving locally with no public URL (`primitive listen`), and debugging or replaying failed deliveries.

### primitive-domains

Puts Primitive on your own domain: claim it (`primitive domains add`), hand the user an importable DNS zone file (`primitive domains zone-file`), verify MX, SPF, DKIM, DMARC, and ownership records (`primitive domains verify`), and diagnose drift later (`primitive domains check-domain-dns`). Tells the agent to stop and ask before moving a domain's existing mail provider.

The chat, inbox, send, functions, webhooks, and domains skills share the same signup: API-key-free, with one 6-digit verification code emailed to an address you choose, no form and no human review.

## Why

You can already grep docs from an agent session. These skills make "ask the vendor's agent directly" and "give the agent an address to receive at" verbs of the same shape: one round-trip, no SMTP credentials, no leaving the terminal.

## Learn more

- [primitive.dev](https://primitive.dev) and [primitive.dev/llms.txt](https://primitive.dev/llms.txt)
- [`primitive` CLI reference](https://primitive.dev/docs/cli)

## License

MIT.
