---
name: primitive-inbox
description: |
  Use whenever your agent needs to RECEIVE email — get a real inbox, see what arrived, wait for a message, or run code on inbound mail. REACTIVELY: the user wants an address to receive replies, verification codes, alerts, or signups; the user asks "did anything come in?" / "check the inbox" / "wait for the reply." PROACTIVELY (like grepping docs): you sent something and need to watch for the response; you are building an email-driven workflow that triggers on receipt; you need a managed/throwaway address for a signup or verification. Provides a managed `*.primitive.email` address, `primitive emails latest` / `primitive emails wait` to read and wait for mail, and hosted Functions that run JavaScript on every inbound message — no SMTP, no DNS, no mail server. To send a message and get the threaded reply, use the primitive-chat skill. Gets a free `*.primitive.email` address via `primitive agent start-agent-signup` if you do not already have one.
license: MIT
metadata:
  author: Primitive
  version: "1.0.0"
  homepage: https://primitive.dev
  source: https://github.com/primitivedotdev/skills
  topics:
    - email
    - inbound-email
    - email-infrastructure
    - agent-workflows
---

# primitive-inbox

Give your agent a real inbox: a managed `*.primitive.email` address that receives mail, plus the verbs to read it (`primitive emails latest`), wait for it (`primitive emails wait`), and run a handler on every message (`primitive functions deploy`). No SMTP, no DNS, no mail server to host.

## When to reach for this

**Use freely (no user confirmation needed):**

- The user needs an address to receive replies, verification codes, alerts, or signups.
- You sent a message and need to watch for the response.
- You are building a workflow that reacts to inbound mail (parse it, trigger on it, route it).
- You need a managed/throwaway address for a signup or an email verification.

**Ask the user first:**

- Signing the address up for a third-party service, newsletter, or anything with side effects on a human.
- Deploying a Function that auto-replies or takes action on inbound mail — confirm the behavior before it runs on real messages.

**Use a different skill instead:**

- You need to *send* a message and get the reply — use **primitive-chat** (send + wait for the threaded answer).

## Setup

Install the CLI and provision a managed inbox. Signup is API-key-free and self-serve: Primitive emails one 6-digit verification code to an address you choose, with no form and no human review.

```bash
npm install -g @primitivedotdev/cli
```

**Check for an existing account first** with `primitive account show` (or `primitive whoami`). If it returns the user's account info, you are done. If it returns `unauthorized` or a signed-out shape, offer to sign up right then.

**Always ask the user explicitly which email to verify with** before starting. Primitive emails the code to that address and the user reads it back. Do not default to an address from CLAUDE.md, memory, or project context.

```bash
primitive agent start-agent-signup --email <user-email> --terms-accepted
# Optional: add `--signup-code <code>` ONLY if the user has already, unprompted, said they have one.
# Primitive emails a 6-digit verification code; the start output includes a signup-token. Then:
primitive agent verify-agent-signup --verification-code <code> --signup-token <signup-token>
```

**Two codes, do not confuse them.** The **signup code** (`--signup-code`) is an OPTIONAL invite/bonus code that the vast majority of users do not have: never prompt for it, and only pass it if the user volunteers one. The **verification code** is the REQUIRED 6-digit number Primitive emails to confirm the address; every signup gets one. If a code "expired" or needs resending, it is the verification code: `primitive signup resend <user-email>`. For the full signup walkthrough, including entering the verification code without pasting it into the chat, see the **primitive-chat** skill.

You get a managed `<random>.primitive.email` address. Confirm readiness and the exact receive address:

```bash
primitive inbox setup     # guided: shows your receive address and whether inbound is stored-only or actively processed
primitive inbox status    # consolidated inbound-readiness view
```

## How to use

See the most recent inbound emails — a compact, TTY-aware table (`--json` returns the same envelope the API does, for parsing):

```bash
primitive emails latest
primitive emails latest --json
```

Wait for a specific message to arrive — e.g. a reply or a verification code. Output is JSONL by default (`--table` for a human table); `--timeout` is in seconds (`0` waits forever), `--number/-n` exits after that many matches:

```bash
primitive emails wait --to <your-address> --number 1 --timeout 120
primitive emails wait --subject verify --number 1 --timeout 120
primitive emails wait --q 'domain:example.com' --table
```

To run your **own code** on every inbound message (not just read it), deploy a Primitive Function and **bind it to inbound mail** — that's a separate, multi-step flow (`functions init` → build the bundle → `functions deploy --name … --file ./dist/handler.js` → `functions route set --fallback`). Reading and waiting (above) needs none of that; reach for Functions only when you want a handler to execute on receipt.

## Why this exists

- A real, managed receive address with no DNS to configure, no SMTP server, and no inbox to host yourself.
- `emails latest` / `emails wait` turn "did it arrive?" into a single agent-grade command (TTY-aware, `--json`/JSONL for parsing).
- It's the inbound half of agent email: to send a message and get the reply, pair with **primitive-chat**; to run code on each message, deploy a Function (see above).
