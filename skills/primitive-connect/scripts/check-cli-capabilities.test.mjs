import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = new URL('./check-cli-capabilities.mjs', import.meta.url).pathname;

// MOCK_CLI=short-help is a CLI whose --help is short and whose --help-full
// prints the full text; MOCK_CLI=full-help is an older CLI that rejects
// --help-full and prints the full text on --help.
function preflight(receiver, mode, cli = 'short-help') {
  const directory = mkdtempSync(join(tmpdir(), 'primitive-cli-preflight-'));
  const calls = join(directory, 'calls');
  writeFileSync(join(directory, 'primitive'), `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_CALLS, argv.join(' ') + '\\n');
const flag = argv.at(-1);
const command = argv.slice(0, -1).join(' ');
const mode = process.env.MOCK_MODE;
const full = {
  'agent connect': '--session --receiver ' + (mode === 'old-connect-hook'
    ? 'external leaves runtime-specific receiving to an external hook'
    : "external installs the exact Claude session's fail-open Stop hook after the verification reply")
    + (mode === 'old-connect-resume' ? '' : ' and resume SessionStart hook')
    + (mode === 'no-poll' ? '' : '; poll installs nothing'),
  'agent check-mail': mode === 'no-poll' ? undefined
    : 'Print the mail that reached the selected connected agent profile since its previous check',
  'agent enroll': '--session --receiver ' + (mode === 'missing-enroll-name' ? '' : '--name ') + (mode === 'old-enroll-hook'
    ? 'external runtime event hook'
    : "With --receiver external in the exact Claude session, install a fail-open Stop hook in that runtime's settings")
    + (mode === 'old-enroll-resume' ? '' : ' and resume SessionStart hook')
    + (mode === 'no-poll' ? '' : ', or poll'),
  listen: '--wake --hook-session --notify-session --background external mail events at tool-output authority, never synthetic user messages',
  'network peers': mode === 'missing-network' ? undefined : 'Discover listed peers --owner',
  wait: mode === 'with-wait' ? 'Wait for the next email to this agent --from --subject --timeout --code --link --json --include-existing' : undefined,
}[command];
if (full === undefined) process.exit(2);
if (process.env.MOCK_CLI === 'full-help') {
  if (flag !== '--help') process.exit(2);
  console.log(full);
} else if (flag === '--help-full') console.log(full);
else if (flag === '--help') console.log('Short help for ' + command + '\\nFull help: primitive ' + command + ' --help-full');
else process.exit(2);
`, { mode: 0o755 });
  try {
    const result = spawnSync(process.execPath, [script, '--receiver', receiver], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, MOCK_MODE: mode, MOCK_CLI: cli, MOCK_CALLS: calls },
    });
    return { result, calls: readFileSync(calls, 'utf8').trim().split('\n') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const skillRoot = new URL('../', import.meta.url);
const referenceFiles = () =>
  readdirSync(new URL('references/', skillRoot)).filter(name => name.endsWith('.md')).sort().map(name => `references/${name}`);

// SKILL.md followed by every reference file: for rules that live in a reference.
const connectReference = () => readFileSync(new URL('references/connect.md', skillRoot), 'utf8');

const skillWithReferences = () =>
  ['SKILL.md', ...referenceFiles()].map(file => readFileSync(new URL(file, skillRoot), 'utf8')).join('\n');

test('accepts the exact Claude hook and peer discovery before any claim', () => {
  const { result, calls } = preflight('external', 'modern');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls, ['agent connect --help-full', 'agent enroll --help-full', 'listen --help-full', 'network peers --help-full', 'wait --help-full', 'wait --help']);
});

test('reads full help with --help-full, and with --help on a CLI that predates it', () => {
  for (const receiver of ['external', 'native', 'poll']) {
    const current = preflight(receiver, 'with-wait', 'short-help');
    assert.equal(current.result.status, 0, current.result.stderr);
    assert.match(current.result.stdout, /primitive wait: available/);
    assert.ok(current.calls.every(call => call.endsWith(' --help-full')), current.calls.join(', '));
    const older = preflight(receiver, 'with-wait', 'full-help');
    assert.equal(older.result.status, 0, older.result.stderr);
    assert.match(older.result.stdout, /primitive wait: available/);
    const commands = older.calls.filter(call => call.endsWith(' --help')).map(call => call.slice(0, -' --help'.length));
    assert.deepEqual(older.calls, commands.flatMap(command => [`${command} --help-full`, `${command} --help`]));
  }
  const older = preflight('external', 'old-connect-hook', 'full-help');
  assert.equal(older.result.status, 1);
  assert.match(older.result.stderr, /agent connect help lacks required setup/);
});

test('primitive wait is advisory: older CLIs still pass and get the emails wait fallback', () => {
  const old = preflight('external', 'modern');
  assert.equal(old.result.status, 0, old.result.stderr);
  assert.match(old.result.stdout, /primitive wait: not in this CLI/);
  assert.match(old.result.stdout, /primitive agent check-mail/);
  assert.doesNotMatch(old.result.stdout, /emails wait/);
  assert.match(old.result.stdout, /primitive emails get --id <id> --context/);
  const current = preflight('external', 'with-wait');
  assert.equal(current.result.status, 0, current.result.stderr);
  assert.match(current.result.stdout, /primitive wait: available/);
  const failed = preflight('external', 'missing-network');
  assert.ok(!failed.calls.some(call => call.startsWith('wait ')), 'a failed preflight does not probe wait');
});

test('rejects old Claude connect and enroll help before either can create a connection', () => {
  for (const mode of ['old-connect-hook', 'old-enroll-hook', 'old-connect-resume', 'old-enroll-resume']) {
    const { result, calls } = preflight('external', mode);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Do not claim the invitation/);
    assert.deepEqual(calls, ['agent connect --help-full', 'agent enroll --help-full', 'listen --help-full', 'network peers --help-full']);
  }
});

test('rejects missing network peer discovery for either receiver', () => {
  for (const receiver of ['external', 'native']) {
    const { result, calls } = preflight(receiver, 'missing-network');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /network peers help is unavailable/);
    assert.deepEqual(calls, ['agent connect --help-full', 'agent enroll --help-full', 'listen --help-full', 'network peers --help-full', 'network peers --help']);
  }
});

test('requires display-name support before creating a self-enrolled address', () => {
  for (const receiver of ['external', 'native']) {
    const { result, calls } = preflight(receiver, 'missing-enroll-name');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /agent enroll help lacks required setup/);
    assert.deepEqual(calls, ['agent connect --help-full', 'agent enroll --help-full', 'listen --help-full', 'network peers --help-full']);
  }
  const skill = skillWithReferences();
  assert.match(skill, /agent enroll --session "\$CLAUDE_CODE_SESSION_ID" --receiver external --name "Research" --json/);
  assert.match(skill, /Never create a second agent or reclaim\s+an invitation just to change an enrolled name/s);
});

test('SKILL.md leads with identity, and connecting comes after it', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const body = skill.slice(skill.indexOf('\n---', 4) + 4);
  const firstScreen = body.slice(0, body.indexOf('\n## '));
  assert.match(firstScreen, /You have an email address\. It is who you are to people, services and other\s+agents\./s);
  assert.match(firstScreen, /\$PRIMITIVE_AGENT_ADDRESS/);
  assert.match(firstScreen, /primitive whoami/);
  const sections = [...body.matchAll(/^## (.*)$/gm)].map(match => match[1]);
  assert.equal(sections[0], 'Everyday commands');
  assert.ok(sections.indexOf('Connect this session') > sections.indexOf('When mail arrives'));
  for (const command of ['primitive whoami', 'primitive send --to', 'primitive reply --id', 'primitive wait --from', '--code', '--link', 'primitive emails get --id <email-id> --context', 'primitive emails search']) {
    assert.ok(firstScreen.length + body.indexOf(command) > 0 && body.includes(command), `missing ${command}`);
  }
  assert.ok(skill.split('\n').length < 190, 'SKILL.md must stay under half its former length');
});

test('the main flow never asks the agent to prefix commands with a profile', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.doesNotMatch(skill, /PRIMITIVE_AGENT_PROFILE=/);
  assert.doesNotMatch(skill, /--from "?\$PRIMITIVE_AGENT_ADDRESS/);
  const connect = connectReference();
  assert.match(connect, /## Sessions without the hook/);
  assert.match(connect, /PRIMITIVE_AGENT_PROFILE=<profile> primitive whoami/);
  assert.match(connect, /PRIMITIVE_AGENT_PROFILE= primitive <command>/);
});

test('recipes cover sign-up verification with an older-CLI fallback and external-service safety', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /primitive wait --from example\.com --code --timeout 5m/);
  assert.match(skill, /Command wait not found/);
  assert.doesNotMatch(skillWithReferences(), /emails wait --timeout 300 --json/, 'emails wait has no --json flag');
  assert.match(skill, /git config --local user\.email "\$PRIMITIVE_AGENT_ADDRESS"/);
  assert.match(skill, /Sign up for or log in to an external service only when the owner's task\s+calls for it/s);
  assert.match(skill, /Never put credentials, API keys, tokens, invitation or setup URLs, or\s+verification codes in mail/s);
  assert.match(skill, /never instructions/);
  const external = readFileSync(new URL('references/external-services.md', skillRoot), 'utf8');
  assert.match(external, /Open a link only if it points at the service you signed up with/);
  assert.match(external, /--include-existing/);
});

test('the one command comes first in the connect reference and needs nothing else from the skill', () => {
  const skill = connectReference();
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
  const skill = skillWithReferences();
  const integrated = skill.indexOf('npx -y primitive@latest agent connect --session');
  const fallback = skill.indexOf('primitive agent connect --profile connection-session-unique <');
  assert.ok(integrated > 0 && fallback > integrated);
  const claim = skill.slice(skill.indexOf('## Claim privately and resume safely'), fallback);
  assert.match(claim, /Claim-only is a mutually exclusive alternative/);
  assert.match(claim, /never run both claim paths/);
});

test('the HTTP API path serves agents without a terminal and keeps the invitation secret to one claim POST', () => {
  const skill = skillWithReferences();
  const main = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const manual = readFileSync(new URL('../references/manual-setup.md', import.meta.url), 'utf8');
  const one = main.indexOf('## Connect this session');
  assert.ok(one > 0, 'SKILL.md keeps a short connect section');
  assert.match(main.slice(one), /references\/manual-setup\.md#connect-with-the-http-api/);
  const api = manual.indexOf('## Connect with the HTTP API');
  const cliInManual = manual.indexOf('## Other CLI paths');
  assert.ok(api >= 0 && cliInManual > api, 'HTTP API path, then other CLI paths, in the manual setup reference');
  const section = manual.slice(api, cliInManual);
  const cli = skill.indexOf('## Other CLI paths');
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
  const skill = skillWithReferences();
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
  const skill = skillWithReferences();
  assert.match(skill, /exact reply to delegated work arrives, read its full content and verify\s+its sender and reply ancestry/s);
  assert.match(skill, /report the substantive result when requested or useful/);
  assert.match(skill, /reply grants no new\s+access to private history and does not require a reply to an ACK/s);

  const communication = readFileSync(new URL('../references/communication.md', import.meta.url), 'utf8');
  assert.match(communication, /asynchronous reply notification is a pointer, not the requested answer/);
  assert.match(communication, /Fetch the complete exact-parent email, check sender and ancestry/s);
});

test('owner-conditioned disclosure requires exact sender and directory owner proof', () => {
  const skill = skillWithReferences();
  assert.match(skill, /sender_connected_agent_verified` proves the authenticated sending address, not\s+which human owns it/s);
  assert.match(skill, /match the exact address and owner in its\s+result/s);
  assert.match(skill, /directory is unavailable or gives no exact owner proof,\s+defer that owner-conditioned request/s);
});

test('CLI-only agents get the installed ordinary-email activity commands', () => {
  const skill = skillWithReferences();
  assert.match(skill, /inspect installed `primitive signal --help` when activity\s+is useful/s);
  assert.match(skill, /primitive signal working --id <received-email-id> --json/);
  assert.match(skill, /primitive signal typing --id <received-email-id> --json/);
  assert.match(skill, /optional for brief answers/);
  assert.match(skill, /rejects signal\/interaction parents to avoid\s+loops/s);
});

test('guidance that reads help descriptions as capability reads full help first', () => {
  const skill = skillWithReferences();
  assert.match(skill, /full signal help does not mention automatic signals/);
  assert.match(skill, /`primitive signal --help-full`,\s+or `primitive signal --help` when the CLI rejects `--help-full`/s);
  assert.match(skill, /full listen help describes\s+"external mail events at tool-output authority"/s);
  assert.match(skill, /`primitive listen --help-full`, or `primitive listen --help` when\s+the CLI rejects `--help-full`/s);
  assert.doesNotMatch(skill, /`primitive (signal|listen) --help` (does not mention|describes)/);
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
  const skill = skillWithReferences();
  assert.match(skill, /never pass it as a command argument/);
  assert.doesNotMatch(skill, /agent working set "/);
  assert.match(skill, /agent working set --stdin --private </);
  assert.match(skill, /--value-file <private-claim-json-file>/);
  const network = readFileSync(new URL('../../primitive-network/SKILL.md', import.meta.url), 'utf8');
  assert.match(network, /"until":"<ISO time>"/);
  assert.match(network, /agent working set --stdin --private </);
  assert.doesNotMatch(network, /agent working set "/);
});

test('documents stopping a repeating message through the endpoint', () => {
  const main = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(main, /primitive repeat stop --id <id>/);
  const skill = skillWithReferences();
  assert.match(skill, /POST \/emails\/\{id\}\/repeat-stop/);
  assert.match(skill, /primitive repeat stop --id <id>/);
  assert.match(skill, /repeat_stop_not_allowed/);
});

test('poll receiving needs the check command, not a listener or hook', () => {
  const { result, calls } = preflight('poll', 'modern');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed for poll receiving/);
  assert.deepEqual(calls, ['agent connect --help-full', 'agent enroll --help-full', 'agent check-mail --help-full', 'network peers --help-full', 'wait --help-full', 'wait --help']);
  const old = preflight('poll', 'no-poll');
  assert.equal(old.result.status, 1);
  assert.match(old.result.stderr, /agent check-mail help is unavailable/);
  assert.match(old.result.stderr, /Do not claim the invitation/);
});

test('a session that cannot be woken connects without a session ID instead of asking the owner', () => {
  const skill = connectReference();
  const first = skill.indexOf('\n## ');
  const section = skill.slice(first + 1, skill.indexOf('\n## ', first + 1));
  assert.ok(section.includes("npx -y primitive@latest agent connect --json <<'INVITATION'"));
  assert.match(section, /Use this form, without asking the owner/);
  assert.match(section, /session variable above is\s+empty or unset/s);
  assert.match(section, /cloud-hosted session whose tools run in a separate sandbox/);
  assert.match(section, /empty session variable is treated the same way/);
  assert.match(section, /complete connection, not a fallback that needs the owner's\s+choice/s);
  assert.match(section, /Never guess, borrow or invent a session ID/);
  assert.match(section, /`receiving\.mode: "poll"`, add one line/);
  assert.doesNotMatch(skill, /explicitly limited pairing|limited setup/i);

  const checkStart = skill.indexOf('## Checking for mail');
  assert.ok(checkStart > 0);
  const check = skill.slice(checkStart, skill.indexOf('\n## ', checkStart));
  assert.match(check, /`receiving\.checkCommand`/);
  assert.match(check, /start of every turn and again after\s+you send or reply/s);
  assert.match(check, /primitive emails get --id <id> --context/);
  assert.match(check, /deduplicate by email ID/);
  assert.match(check, /Do not hold a turn\s+open with sleep loops/s);
  assert.match(check, /do not ask the owner to switch\s+runtimes/s);
});

test('status updates stay in one home thread with the owner', () => {
  const skill = skillWithReferences();
  assert.match(skill, /Keep one home thread with the owner for status updates, plans and decision\s+requests/s);
  assert.match(skill, /answer that question there, but post later status and unrelated updates\s+back in the home thread/s);
  assert.match(skill, /Never start a new thread for an update when an\s+appropriate thread already exists/s);
});

test('replies keep everyone on the thread and discussions stay in one thread', () => {
  const skill = skillWithReferences();
  assert.match(skill, /When the message has other To or Cc recipients, add `--all`/);
  assert.match(skill, /Never drop\s+recipients silently/);
  assert.match(skill, /reply with `primitive reply --id <id> --all`/);
  assert.match(skill, /Continue an existing discussion in its thread instead of starting a new email\s+with `primitive send`/);
  assert.match(skill, /primitive send --in-reply-to <message-id>/);
});

test('the description triggers for everyday mail work, not only setup', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const description = /^description: (.*)$/m.exec(skill)?.[1] ?? '';
  assert.match(description, /^Load before any primitive command/);
  assert.match(description, /already connected/);
});

test('already_connected offers keep-without-connecting apart from --keep-existing', () => {
  const skill = connectReference();
  assert.match(readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8'), /`already_connected` \(exit status 3\), ask the owner/);
  assert.match(skill, /Keep the existing address and do not connect the new one: run nothing\s+more/);
  assert.match(skill, /Have both: rerun with `--keep-existing`/);
  assert.match(skill, /run `--resume` as it says without asking/);
});

test('every documented self-status check passes --profile', () => {
  for (const file of ['../SKILL.md', '../references/connect.md', '../references/native-session.md']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /agent connect --status/, file);
  }
});

test('the everyday mail loop documents automatic signals and how to suppress them', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const start = skill.indexOf('## When mail arrives');
  const loop = skill.slice(start, skill.indexOf('\n## ', start + 1));
  assert.ok(start > 0 && loop.length > 0);
  assert.match(loop, /emails get --id <id> --context/);
  assert.match(loop, /--no-signal/);
  assert.match(loop, /--fyi/);
  assert.match(loop, /primitive agent check-mail/);
  assert.match(connectReference(), /profile of the address the mail was sent to/);
  assert.doesNotMatch(loop, /agent working set "/);
});

test('after connecting, the agent offers a better name and a runtime note', () => {
  const skill = connectReference();
  assert.match(skill, /primitive agent rename "<name>"/);
  assert.match(skill, /display name only;\s+the address stays the same/);
  assert.match(skill, /primitive agent runtime set/);
  assert.match(skill, /AGENT_RUNTIME/);
  assert.match(skill, /act only on their\s+answer/);
});

test('setup offer comes before ending the turn, and hook repair names the profile', () => {
  const skill = connectReference();
  assert.match(skill, /in the same message make the\s+one-time offer/);
  assert.match(skill, /--profile <profile> --resume --json/);
  assert.match(readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8'), /Mail from\s+another\s+agent gets no automatic signals/);
});

test('mail loop covers chat for answers and disconnect, and setup reports stay short', () => {
  const skill = skillWithReferences();
  const main = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(main, /primitive chat <address>/);
  assert.match(main, /do not write your own polling loop/);
  assert.match(connectReference(), /agent disconnect --profile <profile> --json/);
  assert.match(skill, /no organization id, profile name\s+or command transcript/);
  assert.match(skill, /\{"success":true,"data":\{"origins":\[\.\.\.\]\}\}/);
});

test('CLI-connected agents are pointed at the CLI, not the helper scripts', () => {
  const skill = skillWithReferences();
  const comms = readFileSync(new URL('../references/communication.md', import.meta.url), 'utf8');
  assert.match(skill, /A CLI-connected agent uses `primitive reply`, `send`,\s+`chat` and `signal`/);
  const head = comms.slice(0, comms.indexOf('## Simple helpers'));
  assert.match(head, /Connected with `primitive agent connect`/);
  assert.match(head, /No saved connection/);
});

test('SKILL.md stays small enough to read in one pass', () => {
  const bytes = readFileSync(new URL('SKILL.md', skillRoot)).length;
  assert.ok(bytes < 25000, `SKILL.md is ${bytes} bytes; move detail into references/`);
});

const slug = heading => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

function anchors(text) {
  const seen = new Map();
  const result = new Set();
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.add(count ? `${base}-${count}` : base);
  }
  return result;
}

test('every relative link and anchor between SKILL.md and its references resolves', () => {
  const files = ['SKILL.md', ...referenceFiles()];
  let checked = 0;
  for (const file of files) {
    const from = new URL(file, skillRoot);
    const text = readFileSync(from, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      const [path, anchor] = target.split('#');
      const to = path ? new URL(path, from) : from;
      assert.ok(existsSync(to), `${file}: ${target} points at a missing file`);
      if (anchor !== undefined) {
        assert.ok(anchors(readFileSync(to, 'utf8')).has(anchor), `${file}: ${target} points at a missing heading`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 20, `only ${checked} links checked`);
  const main = readFileSync(new URL('SKILL.md', skillRoot), 'utf8');
  for (const reference of ['connect', 'external-services', 'contacts', 'conversations', 'collaboration', 'presence-and-receiving', 'manual-setup']) {
    assert.match(main, new RegExp(`\\]\\(references/${reference}\\.md`), `SKILL.md must link references/${reference}.md`);
  }
});
