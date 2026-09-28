# Native session receiving

Use this reference only when the installed Primitive CLI documents
`listen --notify-session` for the current runtime. The shared mail subscription is
an email transport; the runtime's shared local-session mode is a separate native
prerequisite. Neither follows merely from claiming a profile.

## Codex terminal sessions

Check the installed CLI and running server versions when configuring this adapter:

```sh
codex --version
codex app-server daemon version
```

`codex app-server daemon version` is a read-only check that reports local CLI and
running server versions. Check the actual shared-server connection as well as the
flag: compatible CLI/server versions are required. Inspect `codex features list`
or the relevant local help if shared mode or a resume command needs clarification.
Native adapter preflight does not establish email delivery or idle wake.

If the launch reports fallback to standalone, a version mismatch, or an unavailable
shared server, do not claim native receiving is ready. Use the runtime's standard
upgrade/reopen path to get compatible versions and reopen the same exact session.
Explain any required owner action before an upgrade that could interrupt other
work; do not restart a shared server or add a custom connector merely to bypass
the mismatch.

This notification adapter requires the exact session to be loaded in the native
shared local server. An ordinary terminal session without that support is not
sufficient. If the current session was started without shared mode, tell the owner
that they need to reopen that same session once using its exact UUID:

```sh
codex --enable daemon_auto_start resume <exact-current-session-uuid>
```

For a new session the equivalent start is `codex --enable daemon_auto_start`, but
do not create a replacement session for an existing conversation. Do not use
`--last`, guess a UUID, or change global configuration. This invocation flag
applies to that launch; future launches must retain the required mode. Reuse the
runtime's documented session identity. If it is unavailable, stop and report the
missing identity rather than guessing or inspecting unrelated sessions.

Once that exact session is loaded, use the profile already verified as belonging
to this connection and saved in this session's context. Replace the example name;
do not adopt a generic existing profile based only on configured status. Use the
already inspected `primitive listen --help` to choose the installed capability.
When it documents `--background`, let the CLI supervise the receiver:

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive listen --background --contacts --contact-requests --notify-session <exact-current-session-uuid>
```

Use `--contact-requests` when onboarding enabled request intake; omit it when
the owner disabled that feature. A local flag cannot override saved owner policy.

If installed help lacks `--background`, omit that flag and use the runtime's
documented process supervision for the foreground command. Report that this
older receiving path depends on that supervisor's lifetime. A shell tool handle
does not establish persistence across a runtime restart. If no supported
supervisor is available, state the limitation and continue work through available
exact-parent reply waits. Do not invent restart support or install a wrapper.

The CLI connects to an existing private native socket. It does not start or resume
sessions. Do not manually manufacture socket paths or add a proxy/plugin when the
connection fails. Report the native prerequisite and resume the same listener
only after it is satisfied. The normal listener shares one saved address
subscription with exact-parent reply waits; do not create a subscription per send.

## Report current receiving

Check current status with the same selected profile, especially after resuming a
session or a receiving gap:

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive listen --status --notify-session <exact-current-session-uuid>
```

For a CLI that documents background receiving, current receiving requires
`listener.phase` to be `receiving` and `listener.healthy` to be true. A healthy
worker in `reconnecting` is waiting for its receiving prerequisites; it is not
currently receiving. Report `starting`, `stopped`, `failed`, stale or missing
health precisely. A successful start alone does not prove current receiving.

Older versions may return only receipts from this command. That does not verify
listener liveness; check the runtime's documented supervision instead. Neither
status form receives a message or proves that the model read or answered one.
`accepted` means the native input queue accepted delivery, not that a model read
or answered it. An unknown submission is held to avoid duplicate dispatch; inspect
the exact session before any manual resend. Do not delete receipts to force a
retry. If the listener exits, native socket changes, connection is revoked, or
supervision stops, report that ongoing receiving is no longer established. Resume
the same authorized listener after restoring its prerequisites; preserve its
profile, subscription, and receipts. Where installed help supports `--stop`, use
it with this profile and exact session when asked to stop the receiver; preserve
its subscription and receipts. A failed listener does not require another
account or invitation unless the credential itself is no longer authorized.

## Optional delivery checks

Use normal authorized correspondence as delivery evidence when available. Answer
the actual request without appending a setup checklist. A historical exchange
shows what worked then; it does not establish current listener health.

When the owner requests testing or a specific failure needs diagnosis, use fresh
ordinary mail from an authorized contact. Active-session delivery, idle wake,
thread isolation, and restart recovery are separate observations. Check the modes
relevant to that request and leave the others unverified. Starting a process,
printing an event, or writing a queue receipt does not prove the model read or
answered the message. Do not make multiple manual test messages a prerequisite
for routine communication.

Other runtimes need their own documented native input support. A successful Codex
terminal test does not establish support for a desktop app, another agent harness,
or a future version. Keep these conditional details out of the generic setup claim.
