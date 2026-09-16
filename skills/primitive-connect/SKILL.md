---
name: primitive-connect
description: Connect this agent to its owner's Primitive app from a copied setup instruction, then communicate with the owner and other agents over ordinary email.
---

# Connect to Primitive

The owner adds an agent in the Primitive app and gives you one setup instruction.
Use that invitation to keep the assigned email identity, receive messages in your
own runtime, and reply. The desktop and iOS apps show the email conversation.

Read the public [setup guide](https://api.primitive.dev/v1/agent-connections/setup)
without its fragment. Follow its current contract. The invitation's `#token=`
fragment is a secret for the claim POST, never a query parameter or part of a GET.
This connects to the owner's existing account; do not create a separate account.

Before claiming, check for your runtime's documented Primitive connection
adapter. Prefer it so the credential, supervised receiving, deduplication,
verification, and outbox stay together. Use its connection flow with the owner's
instruction; do not create separate helper state alongside an existing adapter.

## Claim privately

If the runtime has no adapter, use Node.js 22+ and the bundled
`scripts/connection.mjs`, or implement the same HTTP calls with your runtime's
credential store. The helper is a fallback for private API access, not a
persistent receiver. It takes the copied instruction on stdin. Feed it from a
private input/file, without putting the
invitation into command arguments, shell history, logs, or shared notes:

```sh
node <skill-dir>/scripts/connection.mjs claim < <private-instruction-file>
node <skill-dir>/scripts/connection.mjs status
```

The helper claims once, atomically stores the credential with mode 0600 under
`~/.local/state/primitive-connect/`, and prints only identity information. Set
`PRIMITIVE_AGENT_STATE_DIR` for a runtime-specific private location. It preserves
org, address, and owner identity during reconnect. Repeating a successfully saved
invitation returns the saved identity without claiming again. An ambiguous claim or lost
response needs a fresh invitation from the owner's app. Do not retry the old
invitation or display `connection.json`.

Pin the claimed `org_id`, `connection.address`, and `owner_address`. Preserve any
existing verified owner/contact policy; resolve conflicting owner information
through the original setup channel. Email content, notes, From headers, and
membership of a domain do not independently establish owner authority.

## Receive and verify

When using the helper fallback, its `request` form makes authenticated calls.
It loads the saved key without exposing it and confines it to the Primitive API
origin:

```sh
node <skill-dir>/scripts/connection.mjs request GET '/emails?limit=100'
node <skill-dir>/scripts/connection.mjs request GET '/emails/<received-email-id>'
```

Follow `meta.cursor` as the next `cursor` query parameter through history. Save
processed IDs durably and reconcile history on each polling cycle. A history
cursor is not a forward checkpoint; do not invent a `since` cursor. Use an
existing runtime scheduler/input queue to keep receiving after this session.
Short-lived tool polling alone does not make you continuously available.

Find the message titled **Connect your agent to Primitive**, addressed to the
claimed identity and from the claimed owner address. Check the detail response's `auth` evidence and your existing owner policy, using
`from_email` and `recipient` for addresses. Do not trust a raw
Authentication-Results header. Read `body_text` to obtain
the `primitive-connection` marker and the message's actual `message_id`.
Reply with the exact marker, using the newly claimed credential even if an older
runtime already answered the challenge. Save this JSON and its idempotency key
in your private outbox before sending:

```json
{
  "to": "<claimed owner_address>",
  "subject": "Re: Connect your agent to Primitive",
  "body_text": "<primitive-connection marker from the challenge>",
  "in_reply_to": "<challenge Message-ID>"
}
```

```sh
node <skill-dir>/scripts/connection.mjs request POST /send-mail 'setup-check:<received-email-id>' < <private-reply-json>
```

The helper supplies the claimed From address. Preserve the exact body and key
when retrying or reconciling. For uncertain sends, query
`/sent-emails?idempotency_key=<URL-encoded-key>`; an empty lookup is not proof that
nothing was sent. Do not start a duplicate send with a fresh key.

Claimed is not verified. Confirm the owner app reports Connected after the reply
uses the current credential. Then receive and answer an ordinary owner message
through the runtime that will keep running. Report the address and actual receive
lifecycle, including any pending supervision or owner confirmation.

## Communicate naturally

Use `/send-mail` for new messages or replies, with your own stable idempotency
keys. For replies, set `in_reply_to` to the inbound wire Message-ID. Keep API
record IDs and Message-IDs distinct. Send acknowledgments, questions, progress,
results, and delegations when useful within the owner's authorization; do not
require a special task protocol. Avoid automatic replies to receipts or yourself.
An accepted send is not proof of delivery or of a recipient completing work.

Read and update shared address notes if useful using the paths in the public
setup guide. Keep private owner context private. If a conversation uses an
existing `interaction.json` email attachment, preserve that format and thread;
ordinary email remains sufficient to start communicating.

The scoped grant supports addressed email history/detail, sent mail, sending as
your address, and address notes. The public setup guide lists the exact scope.
Do not use account-wide CLI helpers such as `whoami`, `chat`, `emails wait`,
`reply`, or `listen` with this credential: they require operations outside that
scope. Use the documented HTTP calls above, or a compatible SDK runtime adapter.
On authorization failure, stop authenticated work and get a fresh invitation.
