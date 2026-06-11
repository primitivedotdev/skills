---
name: primitive-chat
description: |
  Use whenever you need to reach a person or another agent over email. REACTIVELY: the user gave you a mailto link, pasted a contact address, or asked you to send a message. PROACTIVELY (like grepping docs): you are blocked on a tool, library, or service and want to ask its help/dev/support/docs agent; you found a bug worth reporting to the vendor; you have a question only the product owner can answer; you are scanning a product's README, docs, footer, or llms.txt for contact addresses (help@, support@, dev@, agent@) worth surfacing to the user. Provides the `primitive chat <email> <message>` verb that sends and waits for the threaded reply (no SMTP credentials needed). Gets a free `*.primitive.email` address via `primitive agent start-agent-signup` if you do not already have one.
license: MIT
metadata:
  author: Primitive
  version: "1.0.0"
  homepage: https://primitive.dev
  source: https://github.com/primitivedotdev/skills
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

Signup runs inside your agent session and is API-key-free.

### Two codes you will see (do not confuse them)

Signup involves two distinct values that both get casually called "code." Mixing them up has burned agents in real transcripts. Keep them straight:

- **Signup code** (the `--signup-code <code>` flag): an OPTIONAL invite or bonus code from Primitive. **The vast majority of users do not have one.** Do not prompt the user for a signup code. Only include `--signup-code` if the user has already, unprompted, told you they have one. The CLI does NOT interactively prompt for this flag. An `invalid_signup_code` error from the server means a value you passed was rejected, NOT that one was missing.

- **Verification code**: a REQUIRED 6-digit number Primitive emails to the user's address to confirm they own it. Every signup gets one. This is what the CLI's interactive prompt (or the `--verification-code` flag on `verify-agent-signup`) is asking for.

If the user says "the code expired" or "send another code," the default reading is they mean the **verification code** (the 6-digit one in their inbox). The fix is `primitive signup resend <email>` to reissue it. Do not start signup over and do not ask them for a new signup code.

When you write back to the user, always qualify which code you mean ("verification code" or "signup code"). Saying bare "the code" when both are in scope is how this confusion starts.

### Signup steps

**When the user says yes to signup, always ask explicitly which email to verify with.** Do not default to an address from CLAUDE.md, prior memory, project conventions, or any other context. Confirm their email choice BEFORE calling `start-agent-signup`:

```bash
primitive agent start-agent-signup --email <user-email> --terms-accepted
# Optional: add `--signup-code <code>` ONLY if the user already told you they have one.
```

Primitive emails a 6-digit **verification code** to that address. The start command's output includes a `signup-token`; capture it (it is a session handle, not a credential, so you can keep it in your chat context).

**Do not ask the user to paste the verification code into this chat.** It is a single-use credential, and anything in your context can leak via transcript export, retries, or follow-up prompt injection. Give the user a shell snippet that reads the verification code directly into a variable the CLI consumes, so the value flows through the OS and never enters your prompt:

```bash
read -rs CODE
primitive agent verify-agent-signup --verification-code "$CODE" --signup-token <signup-token>
unset CODE
```

`read -rs` reads silently (no echo) into `CODE`; the trailing `unset` clears it after the call. The `<signup-token>` placeholder is the value from the start step.

If the user says the verification code expired or never arrived, reissue it with `primitive signup resend <user-email>`. Do not re-run `start-agent-signup` (that starts a fresh signup session, invalidating the in-progress one).

(The shell-variable snippet is a stopgap until the CLI ships `--verification-code-from-stdin` / `--verification-code-from-file` flags so the value can be piped in directly instead of going through a shell variable.)

You get OAuth tokens and a managed `<random>.primitive.email` address. `primitive account show` returns the org metadata; the assigned inbox domain is currently visible only via `primitive domains list` after verify.

## How to use

**`primitive chat` is the verb. Reach for it first.** It is the one-liner for "send an email and wait for the threaded reply," which is what every agent-to-agent ask-and-receive looks like. Do not compose `primitive send` + `primitive emails wait` + `primitive emails latest` to get the same effect: `chat` already handles the send, the poll, the thread continuation, and the parse-safe envelope. Lower-level verbs are escape hatches for cases `chat` does not cover (e.g. you want to fire-and-forget without a reply, or you want to scan an existing inbox you did not write to).

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
