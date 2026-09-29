---
name: primitive-domains
description: |
  Use whenever you need to send or receive email on the user's OWN domain (example.com) instead of a managed `*.primitive.email` address: claim the domain, publish the DNS records (MX, ownership TXT, SPF, DKIM, DMARC, TLS-RPT), verify it, and debug it when mail stops flowing. PROACTIVELY: a send failed with `cannot_send_from_domain`, or `primitive sending get-outbound-status` shows `pending_ownership` or `pending_outbound_dns`; inbound mail to a custom address never arrives; the user is launching a product that should email from its own brand. REACTIVELY: the user says "use my domain", "set up email for acme.com", "what DNS records do I need?", "give me a zone file", "why isn't my domain verified?", or "is my DNS healthy?". Provides `primitive domains add`, `primitive domains zone-file` (an importable BIND zone file), `primitive domains verify`, `primitive domains check-domain-dns`, and `primitive inbox status`. Part of the Primitive CLI (primitivedotdev, primitive.dev; the `primitive` or `prim` command).
license: MIT
metadata:
  author: Primitive
  version: "1.0.0"
  homepage: https://primitive.dev
  source: https://github.com/primitivedotdev/skills
  topics:
    - email
    - dns
    - custom-domain
    - email-deliverability
---

# primitive-domains

Put Primitive on the user's own domain: claim it, publish the DNS records Primitive generates, verify, and keep it healthy. Once verified, the domain receives mail into Primitive and can be used as a From address.

You do not need this for a managed `*.primitive.email` address: that works immediately with no DNS (see **primitive-inbox**).

## When to reach for this

**Use freely (no user confirmation needed):**

- Listing domains and their verification state.
- Generating the DNS records or a zone file for the user to publish.
- Running `verify` or `check-domain-dns` to see what is missing.

**Ask the user first:**

- Claiming a domain (`domains add`): confirm the exact domain, and whether it already receives mail elsewhere.
- Anything that changes where the domain's mail goes. Publishing Primitive's MX records moves inbound mail for the whole domain to Primitive. If the domain already uses Google Workspace, Microsoft 365, or another mailbox provider, say so plainly and get an explicit yes. Consider a subdomain (`mail.acme.com`, `agents.acme.com`) instead.
- Deleting a domain or setting `--no-is-active`.

You cannot publish DNS records yourself unless the user has given you access to their DNS provider. Your job is to hand them exactly what to publish and then verify it.

## Setup

```bash
npm install -g @primitivedotdev/cli
primitive whoami
```

If signed out, follow the signup steps in the **primitive-inbox** skill.

## 1. Claim the domain

```bash
primitive domains add --domain acme.com
```

The response has the domain `id` and `dns_records`: the exact records to publish. Nothing is live until they are published and verified.

If the response is an `mx_conflict`, the domain already has MX records pointing at another provider. Stop and tell the user. Only after they explicitly confirm replacing that provider, run:

```bash
primitive domains add --domain acme.com --confirmed
```

## 2. Publish the DNS records

Most DNS providers (Cloudflare, Route 53, and others) can import a BIND zone file. Generate one:

```bash
primitive domains zone-file --id <domain-id> --output acme.com.zone
primitive domains zone-file --domain acme.com --output acme.com.zone     # when you only know the name
primitive domains zone-file --id <domain-id> --outbound-only             # only SPF/DKIM/DMARC, for send-only setups
```

Give the user the file and tell them to import it (or copy each record from `dns_records` by hand). Record values must be copied exactly; a DKIM key with a missing character fails verification.

## 3. Verify

DNS can take minutes to propagate. Then:

```bash
primitive domains verify --id <domain-id>
```

`verify` checks MX, ownership TXT, SPF, DKIM, DMARC, and TLS-RPT. On success the domain becomes verified. On failure it lists which checks passed, which failed, and the exact records still expected. Tell the user which records are missing; do not loop on `verify` every few seconds.

## 4. Confirm mail flows

```bash
primitive domains list                           # verified: true
primitive sending get-outbound-status            # the domain appears in sendable_domains
primitive inbox status --domain acme.com         # inbound readiness and next actions
```

Send yourself a test from the new domain (see **primitive-send**) and, for inbound, mail an address at the domain and watch for it with `primitive emails wait --to <address> --number 1 --timeout 120` (see **primitive-inbox**). Mail that arrives is stored; to run code on it, see **primitive-functions** or **primitive-webhooks**.

## Troubleshooting a domain that was working

```bash
primitive domains check-domain-dns --id <domain-id>
```

Re-checks every record now and reports per scope (`ownership`, `inbound`, `outbound`) with each record's status. Unlike `verify`, it never promotes a domain; it just tells you what drifted (someone edited DNS, a provider migration dropped a TXT record). It is rate limited; on 429 wait for `Retry-After`. It does not apply to managed `*.primitive.email` domains.

Common causes:

- `pending_ownership`: the ownership TXT record is missing or wrong.
- `pending_outbound_dns`: SPF, DKIM, or DMARC is missing, or a second SPF record exists (a domain may have only one `v=spf1` TXT record; merge them).
- Inbound silent: MX still points at the old provider, or the domain is inactive (`primitive domains update --id <domain-id> --is-active`).

## Why this exists

- One command produces every record, and the zone file turns a dozen copy-pastes into one import.
- `verify` and `check-domain-dns` say exactly which record is wrong instead of leaving you to guess from bounces.
- The same verified domain serves inbound routing and authenticated outbound mail.
