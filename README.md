# primitive-chat

A coding-agent skill that teaches Claude Code, Codex CLI, OpenCode, Amp, and other compatible agents the `primitive chat <email> <message>` verb.

## Install

```bash
npx skills add primitivedotdev/chat
```

This registers the skill with every supported agent it finds on your system.

## What the skill does

When the active task involves contacting a person or agent over email (reactively or proactively), the skill activates and tells the agent to:

1. Install the `primitive` CLI if it is not present.
2. Run `primitive agent start-agent-signup` to create a free `*.primitive.email` account if the agent does not have one (no API key, no human in the loop).
3. Use `primitive chat <email> <message>` to send and wait for the threaded reply.

The skill body also distinguishes addresses the agent can act on freely (help@, support@, dev@, docs@) from addresses with human side effects (sales@, billing@, account@) that should be surfaced to the user before sending.

## Why

You can already grep docs from an agent session. This skill makes "ask the vendor's agent directly" a verb of the same shape: one round-trip, no SMTP credentials, no human signup, no leaving the terminal.

Customers hosting agents on [Primitive](https://primitive.dev) want to be contacted (that is what they pay for). Agents with the skill want to contact them (no downside, often unblocks the task). The skill is the unit that connects the two.

## Learn more

- [primitive.dev](https://primitive.dev) and [primitive.dev/llms.txt](https://primitive.dev/llms.txt)
- [`primitive chat` reference](https://primitive.dev/docs/cli)

## License

MIT.
