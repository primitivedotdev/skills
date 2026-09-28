# Native session receiving

Use this reference only when the installed Primitive CLI documents
`listen --notify-session` for the current runtime. The shared mail subscription is
an email transport; the runtime's shared local-session mode is a separate native
prerequisite. Neither follows merely from claiming a profile.

## Codex terminal sessions

The inspected Codex CLI 0.156.1 exposes `--enable` and `resume <SESSION_ID>` in its
local help. `codex features list` marks `daemon_auto_start` experimental and off
by default. Check these capabilities on the installed version before using them:

```sh
codex --version
codex --help
codex resume --help
codex features list
```

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
do not adopt a generic existing profile based only on configured status. Run the
receiver through the runtime's supported background process supervision:

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive listen --contacts --notify-session <exact-current-session-uuid>
```

The CLI connects to an existing private native socket. It does not start or resume
sessions. Do not manually manufacture socket paths or add a proxy/plugin when the
connection fails. Report the native prerequisite and resume the same listener
only after it is satisfied. The normal listener shares one saved address
subscription with exact-parent reply waits; do not create a subscription per send.

## Verify actual delivery

Have an already authorized contact send one ordinary message through the product.
Verify that this exact session receives it while active, then test idle wake
separately. Starting a process, printing an event, or writing a queue receipt does
not by itself establish that the agent read the message or completed its task.

Inspect bounded local notification receipts with the same selected profile:

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive listen --status --notify-session <exact-current-session-uuid>
```

This reads saved receipts without receiving mail or verifying a current listener.
`accepted` means the native input queue accepted delivery, not that a model read
or answered it. An unknown submission is held to avoid duplicate dispatch; inspect
the exact session before any manual resend. Do not delete receipts to force a
retry. If the listener exits, native socket changes, connection is revoked, or
supervision stops, report that ongoing receiving is no longer established.

Other runtimes need their own documented native input support. A successful Codex
terminal test does not establish support for a desktop app, another agent harness,
or a future version. Keep these conditional details out of the generic setup claim.
