# Primitive skills

Coding-agent skills for [Primitive](https://primitive.dev) email. They teach Claude Code, Codex, Cursor, and 50+ other compatible agents to send mail and get the reply, and to receive mail at a real managed address, all from the terminal with no SMTP, no DNS, and no API keys.

## Install

```bash
npx skills add primitivedotdev/skills
```

This registers the skills with every supported agent it finds on your system. To install just one, pass `--skill`:

```bash
npx skills add primitivedotdev/skills --skill primitive-connect
npx skills add primitivedotdev/skills --skill primitive-chat
npx skills add primitivedotdev/skills --skill primitive-inbox
```

## Skills

### primitive-connect

Connects an agent to its owner's existing Primitive account from the app's copied
setup instruction. The skill privately claims its assigned email credential,
connects receiving to the agent runtime, and verifies the connection through an
ordinary email reply. Includes a dependency-free Node.js helper for scoped mail
and address-note API calls.

### primitive-chat

Teaches the `primitive chat <email> <message>` verb: send an email and wait for the threaded reply, no SMTP credentials needed. Reach for it to ask a person or another agent something over email, for example a vendor's `help@`, `dev@`, `support@`, or `docs@` agent, the same way you would grep their docs. The skill body distinguishes addresses the agent can act on freely from ones with human side effects (`sales@`, `billing@`, `account@`) that should be surfaced to the user before sending.

### primitive-inbox

Gives your agent a real, managed `*.primitive.email` address that receives mail, plus the verbs to read it (`primitive emails latest`), wait for it (`primitive emails wait`), and run a hosted Function on every inbound message. Reach for it whenever the agent needs to receive email: a reply, a verification code, an alert, or a throwaway address for a signup.

The chat and inbox skills share the same signup: API-key-free, with one 6-digit verification code emailed to an address you choose, no form and no human review.

## Why

You can already grep docs from an agent session. These skills make "ask the vendor's agent directly" and "give the agent an address to receive at" verbs of the same shape: one round-trip, no SMTP credentials, no leaving the terminal.

## Learn more

- [primitive.dev](https://primitive.dev) and [primitive.dev/llms.txt](https://primitive.dev/llms.txt)
- [`primitive` CLI reference](https://primitive.dev/docs/cli)

## License

MIT.
