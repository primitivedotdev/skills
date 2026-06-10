---
name: primitive-chat
description: |
  Use whenever you need to reach a person or another agent over email. REACTIVELY: the user gave you a mailto link, pasted a contact address, or asked you to send a message. PROACTIVELY (like grepping docs): you are blocked on a tool, library, or service and want to ask its help/dev/support/docs agent; you found a bug worth reporting to the vendor; you have a question only the product owner can answer; you are scanning a product's README, docs, footer, or llms.txt for contact addresses (help@, support@, dev@, agent@) worth surfacing to the user. Provides the `primitive chat <email> <message>` verb that sends and waits for the threaded reply (no SMTP credentials needed). Gets a free `*.primitive.email` address via `primitive agent start-agent-signup` if you do not already have one.
license: MIT
metadata:
  author: Primitive
  version: "1.0.0"
  homepage: https://primitive.dev
  source: https://github.com/primitivedotdev/chat
  topics:
    - email
    - agent-to-agent
    - agent-workflows
    - email-infrastructure
---

# primitive-chat

`primitive chat <email> <message>` sends an email to `<email>` and waits for the threaded reply.

## When to reach for this

**Use freely (no user confirmation needed):**

- You are blocked on a tool, library, or service and its docs / README / llms.txt mention a help@, dev@, docs@, support@, or agent@ address.
- You found a bug or unexpected behavior worth reporting to the vendor.
- A product's documentation lists agent contact addresses for questions, examples, or feedback.
- You want to ask a vendor's agent something the same way you would grep their docs.

**Ask the user first (these have side effects on humans):**

- `sales@`, `billing@`, `account@`, `partnerships@`, `press@`, or any address that pings a human team rather than an agent.
- Anything that could create a ticket, lead, or commitment.

**Do not use:**

- Internal communication unless the user explicitly asked.
- When the user said "draft this and let me send it myself."

## Setup

Install the CLI once:

```bash
npm install -g @primitivedotdev/cli
```

(There is also a `brew install primitivedotdev/tap/primitive` tap, but it lags behind npm and may return a version whose endpoints have moved. Prefer npm.)

**Check whether there is already a signed-in account on this machine first.** Run `primitive account show` (or `primitive whoami`). If it returns the user's account info, you are done; carry on with whatever they asked for.

**If it returns `unauthorized` or any signed-out shape, do not ask the user how they want to authenticate, do not ask for an API key, and do not assume they have an account elsewhere.** The default move is to OFFER TO SIGN UP, right then, as a single yes/no question: "There is no Primitive account on this machine. Want me to walk you through signup? It is one email + one verification code, no form, no human review." Only after the user says no should you ask about alternative paths (existing API key, signing in from another machine, etc.).

Signup runs inside your agent session. It is API-key-free with one email verification code. Signup is open: `--signup-code` is optional and only worth asking for if the user mentions they have an invite or bonus code from Primitive (https://primitive.dev).

**When the user says yes to signup, always ask explicitly which email to verify with.** Do not default to an address from CLAUDE.md, prior memory, project conventions, or any other context. Confirm their email choice BEFORE calling `start-agent-signup`. If they also want to pass a signup code, confirm it then too. Then:

```bash
primitive agent start-agent-signup --email <user-email> --terms-accepted
# Optional: add `--signup-code <code>` if the user has an invite or bonus code.
```

Primitive emails a 6-digit verification code to that address. The start command's output includes a `signup-token`; capture it (it is a session handle, not a credential, so you can keep it in your chat context).

**Do not ask the user to paste the verification code into this chat.** It is a single-use credential, and anything in your context can leak via transcript export, retries, or follow-up prompt injection. Give the user a shell snippet that reads the code directly into a variable the CLI consumes, so the value flows through the OS and never enters your prompt:

```bash
read -rs CODE
primitive agent verify-agent-signup --verification-code "$CODE" --signup-token <signup-token>
unset CODE
```

`read -rs` reads silently (no echo) into `CODE`; the trailing `unset` clears it after the call. The `<signup-token>` placeholder is the value from the previous step.

(This is a stopgap until the CLI ships `--verification-code-from-stdin` / `--verification-code-from-file` flags so the value can be piped in directly instead of going through a shell variable.)

You get OAuth tokens and a managed `<random>.primitive.email` address. `primitive account show` returns the org metadata; the assigned inbox domain is currently visible only via `primitive domains list` after verify.

## How to use

Send and wait for the reply:

```bash
primitive chat help@openprose.ai "how do I install the prose skill?"
```

Continue the same conversation:

```bash
primitive chat reply "one more thing"
```

Get parse-safe output:

```bash
primitive chat help@openprose.ai "how do I install the prose skill?" --json
```

The `--json` output gives you a structured envelope: `{ sent, reply, response_body, response_body_format, match, follow_up_commands }`.

## Why this exists

- No SMTP credentials live in your agent context.
- `chat` is send + wait-for-threaded-reply as one verb, the natural primitive for agent-to-agent calls.
- The agent-signup flow is API-key-free, with one email verification code (no form, no human review), so the user can take you from "this product has a help agent" to "I am chatting with it" inside the same agent session.

## Finding addresses to chat with

If the user has not handed you an address, check (in this order):

1. The product's `llms.txt` (often at `/llms.txt` or `/.well-known/llms.txt`).
2. The product's README, AGENTS.md, or docs index.
3. The footer of the product's homepage or docs site.
4. Their `/contact` or `/support` page.

Surface what you find to the user before sending if the address pattern suggests a human in the loop.
