---
name: primitive-send
description: |
  Use whenever you need to send an outbound email you will not wait on: a notification, alert, report, receipt, digest, or other transactional message, with HTML or attachments, now or scheduled. PROACTIVELY: a job finished and the user asked to be emailed the result; a file you generated should be delivered; a workflow must notify someone; you need to prove outbound mail works. REACTIVELY: the user says "email this to", "send them the report", "schedule this email", "did my email go out?", or "why did it bounce?". Provides `primitive send` with outcome exit codes (never resend after `sent` or `already_sent`), `primitive sending get-outbound-status` to pick a valid From, `primitive sending permissions` for allowed recipients, `primitive sent list|get` to audit sends, and scheduled sends. To send and wait for the reply, use primitive-chat; to answer received mail, use primitive-inbox. Part of the Primitive CLI (primitivedotdev, primitive.dev; the `primitive` or `prim` command).
license: MIT
metadata:
  author: Primitive
  version: "1.0.0"
  homepage: https://primitive.dev
  source: https://github.com/primitivedotdev/skills
  topics:
    - email
    - transactional-email
    - outbound-email
    - email-infrastructure
---

# primitive-send

`primitive send` sends one outbound email through Primitive's relay and tells you, with an exit code, exactly what happened. No SMTP credentials, no relay to configure.

## When to reach for this

**Use freely (no user confirmation needed):**

- The user asked you to email them (or a named recipient) a result, file, or summary.
- A self-test: sending to your own `*.primitive.email` address to prove outbound and inbound both work.
- Checking what was sent, whether it was delivered, or why it bounced.

**Ask the user first:**

- Sending to anyone the user did not name, or to a list of recipients.
- Anything that commits the user to something (a quote, an agreement, an apology on their behalf).
- Scheduling a send more than a few minutes out: confirm the time and time zone.

**Use a different skill instead:**

- You need the recipient's answer back: use **primitive-chat** (`primitive chat <email> <message>` sends and waits for the threaded reply).
- You are answering an email you received: use **primitive-inbox** (`primitive reply --id <inbound-id>` keeps the thread).

## Setup

```bash
npm install -g @primitivedotdev/cli
primitive whoami        # confirms the saved login or PRIMITIVE_API_KEY works
```

If `whoami` reports you are signed out, follow the signup steps in the **primitive-inbox** skill (one emailed 6-digit code, no form). `PRIMITIVE_API_KEY` in the environment, or `--api-key`, overrides the saved login.

## Before the first send: From and To

**Pick a From you are allowed to use.** Omit `--from` and Primitive uses `agent@<your-first-verified-outbound-domain>`. To choose explicitly, ask which domains can send right now:

```bash
primitive sending get-outbound-status
```

It returns `sendable_domains` plus a per-domain `status` (`sendable`, `pending_ownership`, `pending_outbound_dns`, `inactive`) and `next_actions`. A domain that is not `sendable` needs DNS work first: see the **primitive-domains** skill.

**Check who you may send to.** New accounts cannot send to arbitrary external addresses yet:

```bash
primitive sending permissions
```

Rules are listed broadest first: `any_recipient` (send anywhere), `managed_zone` (any `*.primitive.email` address, always allowed), `your_domain` (your verified domains), and `address` (addresses that have sent authenticated mail to you). A send outside these rules is rejected with `recipient_not_allowed` and nothing goes out. Do not retry it; tell the user.

## Send

```bash
# Plain text; subject defaults to the first line of the body when omitted.
primitive send --to alice@example.com --subject 'Nightly build' --body 'All 412 tests passed.'

# Long bodies: read from a file or stdin so text stays out of argv and shell history.
primitive send --to alice@example.com --subject 'Weekly report' --body-file ./report.txt
./make-report | primitive send --to alice@example.com --subject 'Weekly report' --body-stdin

# HTML (send a text part too so every client can render it).
primitive send --to alice@example.com --subject 'Invoice' --body-file ./invoice.txt --html-file ./invoice.html

# Attachments (repeatable), cc and bcc (repeatable).
primitive send --to alice@example.com --cc bob@example.com --bcc audit@example.com \
  --subject 'Q3 numbers' --body 'Attached.' --attachment ./q3.pdf --attachment ./q3.csv

# Explicit sender on a verified domain.
primitive send --to alice@example.com --from 'Acme Alerts <alerts@acme.com>' --subject 'Disk at 91%' --body-file ./alert.txt
```

`--wait` blocks until the receiving mail server answers (default timeout 30000 ms, change with `--wait-timeout-ms`). Use it when the user needs to know the message was actually accepted downstream, not just queued.

Self-test that proves both directions work (any `*.primitive.email` address routes back into the sending account):

```bash
primitive send --to inbox@<your-managed-domain>.primitive.email --body 'self-loop smoke test' --wait
```

## Read the outcome, then stop

Every send prints a one-line summary on stderr and the send record as JSON on stdout. Add `--json` to get an envelope `{ outcome, exit_code, outcome_message, sent, http_status, error, follow_up_commands }` for every outcome, failures included. Act on the exit code:

| Exit | Outcome | What it means | What to do |
|------|---------|---------------|------------|
| 0 | `sent` | Accepted for delivery. `status: "queued"` is success, not a failure. | Stop. Do not send again. |
| 0 | `already_sent` | An identical earlier send exists. Nothing new went out. | Stop. Do not send again. |
| 1 | `not_sent` | Rejected (400/401/402/403/404/413/422/429, or gate denied). Nothing went out. | Read `error`, fix the cause, then send once. |
| 2 | (usage) | Invalid flags. Nothing went out. | Fix the command. |
| 4 | `uncertain` | Transport or server error. It may or may not have gone out. | Check `primitive sent list` before any retry. |

**Treat every run of `primitive send` as a new email.** Never re-run a send "to be sure"; `already_sent` is a safety net, not a plan. On exit 4, look before you retry:

```bash
primitive sent list --limit 10
primitive sent list --q 'Weekly report'        # substring over subject, body, sender, recipients (3+ chars)
primitive sent list --status bounced
primitive sent get --id <sent-email-id>        # full record with bodies and the receiver's SMTP response
```

`sent get` is also how you explain a bounce or a `gate_denied` row to the user.

## Schedule for later

Scheduled sends use the full `sending send` command. `--scheduled-at` is ISO 8601, in the future, and at most 30 days out; it cannot be combined with `--wait` or attachments.

```bash
primitive sending send --from alerts@acme.com --to alice@example.com \
  --subject 'Reminder: review due' --body-text 'The review is due tomorrow.' \
  --scheduled-at 2026-10-01T09:00:00-07:00

primitive sending reschedule-sent-email --id <sent-email-id> --scheduled-at 2026-10-02T09:00:00-07:00
primitive sending cancel-sent-email --id <sent-email-id>
```

A scheduled row has `status: "scheduled"`. Cancel and reschedule only work while it is still scheduled; once it has started sending they return `409 not_scheduled`.

## From code instead of the shell

The same send is one call in the Node SDK (`npm install @primitivedotdev/sdk`). Pass an `idempotencyKey` so a retried network call cannot send twice:

```ts
import primitive from "@primitivedotdev/sdk";

const client = primitive.client({ apiKey: process.env.PRIMITIVE_API_KEY! });
await client.send(
  { from: "alerts@acme.com", to: "alice@example.com", subject: "Disk at 91%", bodyText: "..." },
  { idempotencyKey: "disk-alert-2026-09-28" },
);
```

## Why this exists

- One command per email, with exit codes an agent can branch on instead of parsing prose.
- The outcome table makes duplicate sends a deliberate choice, never an accident of a retry loop.
- `get-outbound-status` and `sending permissions` answer "can I send this?" before you try, and `sent get` answers "what happened?" after.
