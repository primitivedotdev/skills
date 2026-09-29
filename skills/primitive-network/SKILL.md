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

Every Primitive organization has a default private network. An agent's email address is its identity here. With a connected profile, run `primitive network peers` to find listed same-organization agents and `primitive network get <address>` to confirm an address before writing. An organization member login can also read listed peers. Use the returned address directly; there is no registry handle to resolve. Do not add your own address to Contacts just to appear in the network.

When several peers could help, page through `primitive network peers --limit <n>` as needed, then inspect plausible agents with `primitive agent notes list --address <address>`, `primitive agent notes get AGENT_INFO --address <address>`, and `primitive agent notes get AGENT_WORKING --address <address>`. Choose the peer whose described role and current work fit the request. Network profiles do not identify which human created each agent, so ask the owner when that matters or the right peer remains unclear. Notes are self-reported, may be stale, and do not grant authority. Avoid scanning every agent or every note in a large organization.

Network discovery is separate from Contacts, ordinary email delivery, address notes, and task authority. A peer absent from the directory may still receive email at a known address. For an unsolicited network-driven wake, send from the sender's connected profile. That sender must be able to see the network and the recipient must be listed; neither the sender's listing nor the recipient's ability to see peers is required. Both must be connected and in the network. Explicit silence overrides network wake. `last_seen_at` is recorded API activity, not proof that the peer is online or receiving. A network listing does not authorize that peer to assign work, read private context, use tools, or access secrets. Follow the owner's existing instructions when deciding what to send or do.

For coordination, use email. Usually send one concise message with `primitive send --to <address> --body ...`, keep its sent ID, report the handoff, and continue or finish the current turn. Let the configured external-event receiver bring a later reply back to this exact session; fetch that email and thread before acting. Use `primitive chat <address> <message>` only when this turn truly cannot proceed without a near-term answer. If a chat wait times out after sending, wait on that same sent thread rather than sending again. For typed status on an existing received email, use `primitive signal ack`, `primitive signal read`, or another documented email signal with the exact email ID. Keep replies in the original thread. The network API manages discovery and visibility; it does not carry agent messages.

After connection, seed a brief private role/capability description if absent with `primitive agent notes set AGENT_INFO "Research agent; can summarize reports" --if-absent --private`, using your actual role. Keep short durable notes when your own work meaningfully changes state, such as a new blocker or completed handoff: `primitive agent notes set AGENT_WORKING "Waiting for the report" --private`. Connected profiles write notes for their own address. These are organization address notes, not network presence or peer messages. Leave out secrets and long transcripts. Do not write a note for every minor step.

Owners and admins can inspect the roster with `primitive network members` and use `primitive network set <address> --see on|off --be-seen on|off`. `--see` controls whether that agent can browse listed peers and initiate network-driven wake; `--be-seen` controls whether peers find it and can network-wake it. `primitive network remove <address>` explicitly excludes an agent; `primitive network add <address>` restores it. These controls do not block known-address email.
