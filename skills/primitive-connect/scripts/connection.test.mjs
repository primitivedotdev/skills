import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run } from './connection.mjs';

const api = 'https://api.primitive.dev/v1';
const token = ['example', 'invitation'].join('-');
const secret = ['test', 'credential'].join('-');
const instruction = `Connect using ${api}/agent-connections/setup#token=${token}`;
const state = { api_key: secret, org_id: 'example-org', owner_address: 'owner@example.com', api_base_url: api,
  connection: { address: 'agent@example.com', status: 'claimed' } };
function response(data) { return new Response(JSON.stringify({ success: true, data })); }
async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), 'primitive-connect-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function claim(directory, value = state, input = instruction) {
  return run(['claim'], { directory, input, fetcher: async () => response(value) });
}

test('claims through POST and stores a private credential without returning it', async t => {
  const directory = await sandbox(t);
  const result = await run(['claim'], { directory, input: instruction, fetcher: async (url, init) => {
    assert.equal(url, `${api}/agent-connections/claim`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { token });
    return response(state);
  } });
  assert.equal(result.address, state.connection.address);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')), {
    ...state, invitation_sha256: createHash('sha256').update(token).digest('hex'),
  });
  assert.equal((await stat(join(directory, 'connection.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
});

test('rejects a lost claim retry without another network request', async t => {
  const directory = await sandbox(t);
  await assert.rejects(run(['claim'], { directory, input: instruction, fetcher: async () => { throw new Error(secret); } }), /outcome is unknown/);
  let called = false;
  await assert.rejects(run(['claim'], { directory, input: instruction, fetcher: async () => { called = true; } }), /already attempted/);
  assert.equal(called, false);
  assert.equal((await readFile(join(directory, 'pending-claim.json'), 'utf8')).includes(token), false);
});

test('reconnect rotates credentials while pinning identity', async t => {
  const directory = await sandbox(t);
  await claim(directory);
  await claim(directory, { ...state, api_key: `${secret}-rotated` }, `${instruction}-reconnect`);
  assert.equal(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')).api_key, `${secret}-rotated`);
  await assert.rejects(claim(directory, { ...state, org_id: 'different-org' }, `${instruction}-different`), /changes the saved identity/);
  assert.equal(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')).org_id, state.org_id);
});

test('refuses malformed or query-token invitations before sending', async t => {
  const directory = await sandbox(t);
  for (const input of [`${api}/agent-connections/setup?token=${token}`, `https://example.com/setup#token=${token}`, `${instruction}&extra=yes`]) {
    await assert.rejects(run(['claim'], { directory, input, fetcher: async () => assert.fail('No network call expected') }));
  }
});

test('prevents two concurrent claims from consuming the invitation', async t => {
  const directory = await sandbox(t);
  let release;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  const first = run(['claim'], { directory, input: instruction, fetcher: async () => {
    started();
    await new Promise(resolve => { release = resolve; });
    return response(state);
  } });
  await waiting;
  await assert.rejects(claim(directory), /claim is running/);
  release();
  await first;
});

test('sends with the stored address, credential, and stable idempotency key', async t => {
  const directory = await sandbox(t);
  await claim(directory);
  await run(['request', 'POST', '/send-mail', 'setup-check:example-email'], { directory,
    input: JSON.stringify({ to: state.owner_address, body_text: 'example marker', in_reply_to: '<example-message>' }),
    fetcher: async (url, init) => {
      assert.equal(url, `${api}/send-mail`);
      assert.equal(init.headers.Authorization, `Bearer ${secret}`);
      assert.equal(init.headers['Idempotency-Key'], 'setup-check:example-email');
      assert.equal(JSON.parse(init.body).from, state.connection.address);
      assert.equal(JSON.parse(init.body).in_reply_to, '<example-message>');
      return response({ id: 'sent-example' });
    },
  });
});

test('rejects unsupported routes, foreign senders, and missing send identity', async t => {
  const directory = await sandbox(t);
  await claim(directory);
  for (const args of [['request', 'GET', '/account'], ['request', 'GET', '//example.com'], ['request', 'POST', '/emails/example/reply'], ['request', 'POST', '/send-mail']]) {
    await assert.rejects(run(args, { directory, input: '{}', fetcher: async () => assert.fail('No request expected') }));
  }
  await assert.rejects(run(['request', 'POST', '/send-mail', 'example-send'], { directory, input: '{"from":"other@example.com"}' }), /sender must match/);
});

test('keeps claim errors and corrupt state from exposing secrets', async t => {
  const directory = await sandbox(t);
  await assert.rejects(run(['claim'], { directory, input: instruction, fetcher: async () => new Response(secret) }), error => {
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});


test('reusing a successfully saved invitation returns identity without another claim', async t => {
  const directory = await sandbox(t);
  const first = await claim(directory);
  const restored = await run(['claim'], { directory, input: instruction,
    fetcher: async () => assert.fail('A completed invitation must not be consumed again'),
  });
  assert.deepEqual(restored, first);
  assert.equal(JSON.stringify(restored).includes(secret), false);
  assert.equal(JSON.stringify(restored).includes(token), false);
});

test('accepts literal and encoded own-address note paths and sends a canonical URL', async t => {
  const directory = await sandbox(t);
  await claim(directory);
  for (const address of [state.connection.address, encodeURIComponent(state.connection.address)]) {
    await run(['request', 'PUT', `/address-notes/${address}/preferences`], { directory,
      input: JSON.stringify({ value: { tone: 'concise' }, if_absent: true }),
      fetcher: async (url, init) => {
        assert.equal(url, `${api}/address-notes/${encodeURIComponent(state.connection.address)}/preferences`);
        assert.equal(init.headers.Authorization, `Bearer ${secret}`);
        return response({ version: 'example-version' });
      },
    });
  }
  await assert.rejects(run(['request', 'PUT', '/address-notes/other@example.com/preferences'], {
    directory, input: '{}', fetcher: async () => assert.fail('No foreign-address mutation expected'),
  }));
});

test('rejects normalized paths outside the v1 base before sending credentials', async t => {
  const directory = await sandbox(t);
  await claim(directory);
  for (const path of ['/../xx/emails', '/%2e%2e/xx/emails', '/../xx/sent-emails']) {
    await assert.rejects(run(['request', 'GET', path], { directory,
      fetcher: async () => assert.fail('No request may escape the API base'),
    }), /documented address-scoped/);
  }
  await assert.rejects(run(['request', 'PUT', `/../xx/address-notes/${state.connection.address}/preferences`], {
    directory, input: '{}', fetcher: async () => assert.fail('Note normalization must not hide an escaped base'),
  }), /documented address-scoped/);
});
