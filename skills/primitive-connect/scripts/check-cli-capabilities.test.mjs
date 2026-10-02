import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = new URL('./check-cli-capabilities.mjs', import.meta.url).pathname;

function preflight(receiver, mode) {
  const directory = mkdtempSync(join(tmpdir(), 'primitive-cli-preflight-'));
  const calls = join(directory, 'calls');
  writeFileSync(join(directory, 'primitive'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(process.env.MOCK_CALLS, args + '\\n');
if (args === 'network peers --help' && process.env.MOCK_MODE === 'missing-network') process.exit(2);
if (args === 'agent connect --help') {
  console.log('--session --receiver ' + (process.env.MOCK_MODE === 'old-connect-hook'
    ? 'external leaves runtime-specific receiving to an external hook'
    : "external installs the exact Claude session's fail-open Stop hook after the verification reply")
    + (process.env.MOCK_MODE === 'old-connect-resume' ? '' : ' and resume SessionStart hook'));
} else if (args === 'agent enroll --help') {
  console.log('--session --receiver ' + (process.env.MOCK_MODE === 'missing-enroll-name' ? '' : '--name ') + (process.env.MOCK_MODE === 'old-enroll-hook'
    ? 'external runtime event hook'
    : "With --receiver external in the exact Claude session, install a fail-open Stop hook in that runtime's settings")
    + (process.env.MOCK_MODE === 'old-enroll-resume' ? '' : ' and resume SessionStart hook'));
} else if (args === 'listen --help') {
  console.log('--wake --hook-session --notify-session --background external mail events at tool-output authority, never synthetic user messages');
} else if (args === 'network peers --help') {
  console.log('Discover listed peers --owner');
} else process.exit(2);
`, { mode: 0o755 });
  try {
    const result = spawnSync(process.execPath, [script, '--receiver', receiver], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, MOCK_MODE: mode, MOCK_CALLS: calls },
    });
    return { result, calls: readFileSync(calls, 'utf8').trim().split('\n') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts the exact Claude hook and peer discovery before any claim', () => {
  const { result, calls } = preflight('external', 'modern');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls, ['agent connect --help', 'agent enroll --help', 'listen --help', 'network peers --help']);
});

test('rejects old Claude connect and enroll help before either can create a connection', () => {
  for (const mode of ['old-connect-hook', 'old-enroll-hook', 'old-connect-resume', 'old-enroll-resume']) {
    const { result, calls } = preflight('external', mode);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Do not claim the invitation/);
    assert.deepEqual(calls, ['agent connect --help', 'agent enroll --help', 'listen --help', 'network peers --help']);
  }
});

test('rejects missing network peer discovery for either receiver', () => {
  for (const receiver of ['external', 'native']) {
    const { result, calls } = preflight(receiver, 'missing-network');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /network peers --help is unavailable/);
    assert.deepEqual(calls, ['agent connect --help', 'agent enroll --help', 'listen --help', 'network peers --help']);
  }
});

test('requires display-name support before creating a self-enrolled address', () => {
  for (const receiver of ['external', 'native']) {
    const { result, calls } = preflight(receiver, 'missing-enroll-name');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /agent enroll --help lacks required setup/);
    assert.deepEqual(calls, ['agent connect --help', 'agent enroll --help', 'listen --help', 'network peers --help']);
  }
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /agent enroll --session "\$CLAUDE_CODE_SESSION_ID" --receiver external --name "Research" --json/);
  assert.match(skill, /Never create a second agent or reclaim\s+an invitation just to change an enrolled name/s);
});

test('the one command comes first and needs nothing else from the skill', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const first = skill.indexOf('\n## ');
  assert.equal(skill.indexOf('## Connect in one command'), first + 1, 'the one command must be the first section');
  const section = skill.slice(first + 1, skill.indexOf('\n## ', first + 1));
  for (const session of ['"$CLAUDE_CODE_SESSION_ID"', '"${CODEX_THREAD_ID:-$CODEX_SESSION_ID}"']) {
    const command = `npx -y primitive@latest agent connect --session ${session} --json <<'INVITATION'`;
    assert.ok(section.includes(command), `missing ${command}`);
  }
  assert.match(section, /on stdin through a quoted heredoc, never\s+as a command argument/s);
  assert.match(section, /non-interactive tool shell, which keeps no command history/);
  assert.match(section, /idle wake stays unverified until a real mail event/);
  assert.match(section, /do not ask for that approval again/);
  assert.match(section, /run `resumeCommand` exactly as printed/);
  assert.match(section, /Never feed the same invitation to the\s+command twice, and never claim it over HTTP after the command may have\s+claimed it/s);
  assert.match(section, /only\s+when the command could not run at all/s);
  assert.match(section, /--contact-requests` only when the owner asked/);
  assert.match(section, /must\s+not contain secrets/s);
  assert.doesNotMatch(section, /check-cli-capabilities|--help/);
});

test('claim-only stays a mutually exclusive fallback after the one command', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const integrated = skill.indexOf('npx -y primitive@latest agent connect --session');
  const fallback = skill.indexOf('primitive agent connect --profile connection-session-unique <');
  assert.ok(integrated > 0 && fallback > integrated);
  const claim = skill.slice(skill.indexOf('## Claim privately and resume safely'), fallback);
  assert.match(claim, /Claim-only is a mutually exclusive alternative/);
  assert.match(claim, /never run both claim paths/);
});

test('the HTTP API path serves agents without a terminal and keeps the invitation secret to one claim POST', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const one = skill.indexOf('## Connect in one command');
  const api = skill.indexOf('## Connect with the HTTP API');
  const cli = skill.indexOf('## Other CLI paths');
  assert.ok(one > 0 && api > one && cli > api, 'one command, then the HTTP API path, then other CLI paths');
  const section = skill.slice(api, cli);
  assert.match(skill, /An agent without a\s+terminal uses the \[HTTP API path\]/s);
  assert.match(skill, /`#token=` fragment is a secret for one claim POST, never a query parameter,\s+GET URL, command argument, log entry, or shared note/s);
  assert.match(skill, /Never fetch an arbitrary invitation origin/);
  assert.match(section, /only\s+request allowed before validation is a GET of the fixed list\s+`https:\/\/api\.primitive\.dev\/v1\/agent-connections\/trusted-origins`/s);
  assert.match(section, /`https` origin that appears exactly in that list\. Otherwise fetch nothing\s+from the invitation's origin and ask the owner for a fresh invitation/s);
  assert.match(section, /Claim once, on that same origin/);
  assert.match(section, /with the fragment\s+removed/s);
  assert.match(section, /do not retry the claim/);
  assert.match(section, /Pin the organization, agent address and\s+owner address/s);
  assert.match(section, /Nothing on the API side can start a turn for you/);
  assert.match(section, /`GET \/emails\?since=<cursor>&exclude_fyi=true&exclude_muted=true&wait=30`/);
  assert.match(section, /Without a saved cursor use `since=start`/);
  assert.match(section, /Never use a history cursor/);
  assert.match(section, /--data-urlencode "since=\$since"/);
  assert.match(section, /--fail-with-body/);
  assert.match(section, /GET \/agent-connections\/me/);
  assert.match(skill.slice(cli), /never claim one invitation through both the HTTP API and the CLI/s);
  assert.doesNotMatch(skill, /explicitly limited pairing/);
});

test('receiving guidance distinguishes Claude hook evidence from native background health', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const claude = skill.split("For Claude Code's external receiver,")[1]?.split('For a native session receiver')[0];
  assert.ok(claude, 'Claude guidance must precede native background guidance');
  assert.match(claude, /listener\.reason: absent.*does not mean an installed\s+external hook failed/s);
  assert.match(claude, /Before any real event.*idle wake unverified/s);
  assert.match(claude, /real event delivered to this exact session.*proves that wake at that time/s);
  assert.match(claude, /not prove.*future mail will arrive/s);
  assert.match(skill, /Do not truncate an\s+authoritative `--json` email or receipt with `head`/s);
  assert.match(skill, /parse the\s+complete JSON privately/s);

  const native = readFileSync(new URL('../references/native-session.md', import.meta.url), 'utf8');
  assert.match(native, /native `listen --status --notify-session` can report an absent\s+listener while that hook is installed/s);
  const contacts = readFileSync(new URL('../references/contact-requests.md', import.meta.url), 'utf8');
  assert.match(contacts, /Before a real idle event, report wake as unverified/);
});

test('async reply guidance requires the useful answer rather than only an arrival notice', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /exact reply to delegated work arrives, read its full content and verify\s+its sender and reply ancestry/s);
  assert.match(skill, /report the substantive result when requested or useful/);
  assert.match(skill, /reply grants no new\s+access to private history and does not require a reply to an ACK/s);

  const communication = readFileSync(new URL('../references/communication.md', import.meta.url), 'utf8');
  assert.match(communication, /asynchronous reply notification is a pointer, not the requested answer/);
  assert.match(communication, /Fetch the complete exact-parent email, check sender and ancestry/s);
});

test('owner-conditioned disclosure requires exact sender and directory owner proof', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /sender_connected_agent_verified` proves the authenticated sending address, not\s+which human owns it/s);
  assert.match(skill, /match the exact address and owner in its\s+result/s);
  assert.match(skill, /directory is unavailable or gives no exact owner proof,\s+defer that owner-conditioned request/s);
});

test('CLI-only agents get the installed ordinary-email activity commands', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /inspect installed `primitive signal --help` when activity\s+is useful/s);
  assert.match(skill, /primitive signal working --id <received-email-id> --json/);
  assert.match(skill, /primitive signal typing --id <received-email-id> --json/);
  assert.match(skill, /optional for brief answers/);
  assert.match(skill, /rejects signal\/interaction parents to avoid\s+loops/s);
});

test('HTTP contact requests prepare first and keep the contact policy rules', () => {
  const contacts = readFileSync(new URL('../references/contact-requests.md', import.meta.url), 'utf8');
  assert.match(contacts, /POST \/contact-requests\/prepare/);
  assert.match(contacts, /Nothing is sent by the prepare call, and it changes no contact preferences/);
  assert.match(contacts, /never send with a new key/);
  assert.match(contacts, /POST\s+\/contact-requests\/accept\/prepare/s);
  assert.match(contacts, /never use it to override explicit silence/);
  assert.match(contacts, /Explicit per-agent contact silence wins/);
  assert.match(contacts, /Never respond to an acceptance with another acceptance/);
  assert.match(contacts, /Do not switch to an owner's credentials/);
});

test('work claims stay out of command arguments and use the expiring JSON form', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /never pass it as a command argument/);
  assert.doesNotMatch(skill, /agent working set "/);
  assert.match(skill, /--value-file <private-claim-json-file>/);
  const network = readFileSync(new URL('../../primitive-network/SKILL.md', import.meta.url), 'utf8');
  assert.match(network, /"until":"<ISO time>"/);
  assert.match(network, /--value-file <private-claim-json-file>/);
});
