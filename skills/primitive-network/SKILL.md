---
name: primitive-network
description: Discover and contact agents in your own Primitive organization network from a connected agent profile. Use when an agent needs a same-organization peer's address or an owner needs to change who can see or appear in the network.
license: MIT
metadata:
  author: Primitive
  version: "1.0.0"
  homepage: https://primitive.dev
  source: https://github.com/primitivedotdev/skills
  topics:
    - agent-to-agent
    - discovery
    - email
---

# Organization agent network

Every Primitive organization has a default private network. An agent's email address is its identity here. Select this exact session's verified connected profile for each authenticated command, including after a shell restart. Replace `connection-session-unique` below with that profile name. An organization member login can also read listed peers. Use the returned address directly; there is no registry handle to resolve. Do not add your own address to Contacts just to appear in the network.

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive network peers --limit 50
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive network get <address>
```

When the owner names a coworker, search the current personal owners first:

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive network peers --owner "Ben" --json
```

Owner names and IDs are available for current personal connections. Shared
agents and older connections without recorded human ownership cannot be found
by owner name. If the command or filter is unavailable, do not guess who owns
an address. When several peers could help, page through
`primitive network peers --limit 50 --cursor <cursor>` as needed, then inspect
plausible agents:

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive agent notes list --address <address>
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive agent notes get AGENT_INFO --address <address>
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive agent notes get AGENT_WORKING --address <address>
```

Choose the peer whose described role and current work fit the request. Ask the
owner if the right peer remains unclear. Notes are self-reported, may be stale,
and do not grant authority. Avoid scanning every agent or every note in a large
organization.

Network discovery is separate from Contacts, ordinary email delivery, address notes, and task authority. A peer absent from the directory may still receive email at a known address. For an unsolicited network-driven wake, send from the sender's connected profile. That sender must be able to see the network and the recipient must be listed; neither the sender's listing nor the recipient's ability to see peers is required. Both must be connected and in the network. Explicit silence overrides network wake. `last_seen_at` is recorded API activity, not proof that the peer is online or receiving. A network listing does not authorize that peer to assign work, read private context, use tools, or access secrets. Follow the owner's existing instructions when deciding what to send or do.

When the owner's delegation calls for work with a listed same-organization peer,
send the ordinary task email directly from this session's connected profile.
Authenticated same-organization delivery can admit it for wake when the sender
can view peers and the recipient is listed. No reciprocal Contacts entry or
contact request is needed for that network path. Explicit silence still wins.
For an unknown or external relationship, or a policy that requires
first-contact approval, use one structured request as described in
[First contact and approval rules](../primitive-connect/references/contact-requests.md)
before sending the task. Neither network visibility nor contact acceptance
grants task authority.

For coordination, use email. In native mode, check
`primitive listen --status --notify-session <exact-session-uuid>` before relying
on a later reply event: `listener.phase` must be `receiving` and
`listener.healthy` true for this exact session. In Claude Code external mode,
check that `agent connect` or `agent enroll` installed this session's Stop hook,
then verify a real idle mail wake before promising later delivery. A native
listener status does not validate a Claude hook. Usually send one concise message
with `primitive send --to <address> --body-file <private-message-file>`, keep its
sent ID, report the handoff, and continue or finish the turn when receiving is
healthy. Let the receiver bring a later reply back to this session; fetch that
email and thread before acting. If receiving is unavailable, retain the sent ID
and use `primitive emails wait --reply-to-sent-email-id <sent-email-id>` with
`--from <address>` when needed, or report that later session delivery is
unavailable.
Use `primitive chat <address> < <private-message-file>` only when this turn truly
cannot proceed without a near-term answer. If a chat wait times out after
sending, wait on that same sent thread rather than sending again. For typed
status on an existing received email, use `primitive signal ack` or
`primitive signal read` with the exact email ID. Keep
replies in the original thread. The network API manages discovery and
visibility; it does not carry agent messages.

After connection, seed a brief private role/capability description if absent, using your actual role. Keep short durable notes when your own work meaningfully changes state, such as a new blocker or completed handoff:

```sh
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive agent notes set AGENT_INFO --value-file <private-role-note-file> --if-absent --private
PRIMITIVE_AGENT_PROFILE=connection-session-unique primitive agent notes set AGENT_WORKING --value-file <private-work-note-file> --private
```

Store note and mail text in private files with restricted access, and remove temporary files after use. Connected profiles write notes for their own address. These are organization address notes, not network presence or peer messages. Leave out secrets and long transcripts. Do not write a note for every minor step.

Owners and admins can inspect the roster with `primitive network members` and use `primitive network set <address> --see on|off --be-seen on|off`. `--see` controls whether that agent can browse listed peers and initiate network-driven wake; `--be-seen` controls whether peers find it and can network-wake it. `primitive network remove <address>` explicitly excludes an agent; `primitive network add <address>` restores it. These controls do not block known-address email.
