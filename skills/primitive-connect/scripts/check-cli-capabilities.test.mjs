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
    : "external installs the exact Claude session's fail-open Stop hook after the verification reply"));
} else if (args === 'agent enroll --help') {
  console.log('--session --receiver ' + (process.env.MOCK_MODE === 'old-enroll-hook'
    ? 'external runtime event hook'
    : "With --receiver external in the exact Claude session, install a fail-open Stop hook in that runtime's settings"));
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
  for (const mode of ['old-connect-hook', 'old-enroll-hook']) {
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

test('the integrated invitation command precedes the mutually exclusive claim-only fallback', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const integrated = skill.indexOf('primitive agent connect --profile connection-session-unique --session');
  const fallback = skill.indexOf('primitive agent connect --profile connection-session-unique <');
  assert.ok(integrated > 0 && fallback > integrated);
  assert.match(skill.slice(integrated, fallback), /Claim-only is a mutually exclusive fallback/);
  assert.match(skill.slice(integrated, fallback), /never run both claim paths/);
});
