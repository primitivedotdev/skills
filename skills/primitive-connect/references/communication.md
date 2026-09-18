# Threaded conversations and activity

The stable contract is email. Use the runtime's existing receiver, credential
store, authenticated-sender policy, job queue, and durable outbox. The examples
below are optional conveniences, not a required agent framework or hosting model.

## Simple helpers

If using the connection helper's private state, install its pinned SDK dependency:

```sh
npm ci --prefix <skill-dir> --ignore-scripts
```

Then use the following commands. Bodies are on stdin, so private message content
does not appear in process arguments. Replace the placeholders; a received email
record ID is not a wire Message-ID.

```sh
node <skill-dir>/scripts/mail.mjs send <operation-id> < <message-json-file>
node <skill-dir>/scripts/mail.mjs reply <received-email-id> <operation-id> < <reply-text-file>
node <skill-dir>/scripts/mail.mjs signal <received-email-id> <operation-id> < <signal-json-file>
```

A new message file contains:

```json
{"to":"colleague@example.com","subject":"A separate research question","text":"Compare these options."}
```

A signal file contains one of:

```json
{"kind":"working"}
{"kind":"ack","status":"will_process"}
{"kind":"read"}
```

These are three separate examples, not one JSON document. ACK also accepts
`received` and `will_not_process`, with an optional `note`. Working lasts 60 seconds.
The helper returns the send record ID and status, or `{ "status": "deleted" }`
for a confirmed deleted send, never the key or message.
An accepted/queued send does not establish delivery, reading, or completion.

Choose a stable operation ID per event, such as a stored job ID plus `reply`,
`ack`, or a work-renewal sequence. Repeating that operation returns its stored
receipt or reconciles an uncertain send; it never silently issues a duplicate.
Changing the content under the same ID is rejected. Each intentional Working
renewal is a new event with its own ID. Never generate a new ID merely because a
send timed out. An empty reconciliation is still unknown; check later.

The helper stores prepared bodies and receipts privately under the connection's
`outbox/`. A crash may leave an operation lock: confirm its process stopped before
removing that lock, then invoke the same operation. Keep its JSON record.
Authorization or other send errors require inspection; the helper does not
automatically retry an uncertain mutation. An expired unsent Working event is
not sent. Report current work through a new event only if work is still active.

## Existing runtime adapters

Do not copy a credential into the helper's connection store or claim again.
Adapters using Node.js may import `createMailer` and supply their own authenticated
request function and a private durable outbox directory:

```js
import { createMailer } from '<skill-dir>/scripts/mail.mjs';

const mail = createMailer({
  identity: { address: connection.address, org_id: connection.org_id },
  directory: runtime.privateOutboxDirectory,
  // Return the public API JSON envelope. Keep authentication in the runtime.
  request: (method, path, body, idempotencyKey) =>
    runtime.primitiveRequest(method, path, body, idempotencyKey),
});

try {
  await mail.signal(`${job.id}:started`, receivedEmail.id, { kind: 'working' });
} catch {
  // Record unavailable progress without preventing the actual work.
}
// Run the work, then reply to its original request.
await mail.reply(`${job.id}:reply`, receivedEmail.id, answer);
await mail.send(`${job.id}:new-topic`, { to: colleague, subject, text });
```

For HTTP errors, adapters may throw `PrimitiveApiError(status, code)` exported by
`scripts/connection.mjs`. Only HTTP 410 with code `sent_email_deleted` from the
send call becomes a saved deleted result. Pass the response status and error code,
not its message or body. Other errors remain unresolved and are never resent.

Verify the sender and authorize the action before invoking these methods. Reading
through an authenticated API does not by itself authenticate a message's sender.
The helper checks recipient/identity and refuses progress signals on interaction
attachments to avoid receipt loops; it does not establish owner authority. Use
protocol-specific handling for an actual structured request.

If the runtime already owns durable sends, use the released
`@primitivedotdev/sdk/interactions` functions directly: `prepareSignalEmail` accepts
an authenticated parent (`accountScope`, `from`, `to`, `messageId`, `subject`,
`references`) plus ACK/Read/Working fields. Persist the entire `prepared` result
before passing it to `sendPreparedSignal` with the runtime's normal send function.
Working takes `expiresAtMs`, at most 60 seconds ahead. These functions create the
human-readable body, `interaction.json` attachment, reply headers, and stable send
key. They only call the ordinary send function you provide.

For other languages, retain the same email contract and lifecycle in the native
adapter. Use the published SDK protocol as the reference; don't invent an
alternative JSON shape or require a model to reconstruct MIME attachments.

## Threads

- Reply with `in_reply_to` equal to the parent email's actual `message_id`.
  Preserve its References chain and append that Message-ID. The helper does this.
- A new topic gets a fresh send without `in_reply_to` or inherited `references`.
  A changed subject alone does not start a new conversation.
- Keep the original received record and reply target with each job. Do not pick
  whichever email from that agent happens to be newest when the job finishes.
- Correlate wire Message-IDs and explicit reply ancestry, never subject similarity
  or a single mutable "current conversation" per address. Shared memories may be
  useful across conversations; task state and replies remain scoped to their job.
- The connection grant does not include a thread-list API. Build the local view
  from your accessible email records and headers. API record IDs fetch mail;
  wire Message-IDs link mail.

## Runtime behavior

| Event | Email behavior |
| --- | --- |
| Message durably queued | Optional ACK `received` or `will_process` if a wait needs explaining. |
| Agent begins processing | Send Working, then run the model/tools. Renew roughly every 30 seconds only while that job is active. |
| Content actually read | Optional Read assertion. Downloading an inbox page is insufficient. |
| Work completes or needs input | Stop renewing Working; send the result or question in the same thread. |
| Work fails or is declined | Stop renewing. Give a truthful threaded explanation; use `will_not_process` only if applicable. |
| ACK/Read/Working received | Update observation state only. No automatic reply, new task, or renewal. |

Progress reporting is best effort. A failed report must not prevent the actual
answer or consume an unbounded retry budget. Background receiving and active-work
renewal belong in supervised runtime code, not a long-running model tool call.
After restart, resume actual queued work and reconcile the outbox; do not replay
stale activity events. Do not emit Working while waiting for the owner or another
agent. Track simultaneous jobs independently and stop each job's renewal on its
own terminal state. A received signal carries no new authority.

Dogfood with an ordinary request, a longer task, two simultaneous conversations,
and a restart during an uncertain send. Check actual emails and the visible app
state. Keep improvements in this shared skill and helper tests rather than adding
agent-specific forks or a compulsory task format.
