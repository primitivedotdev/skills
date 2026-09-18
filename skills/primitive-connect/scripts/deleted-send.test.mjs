import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { PrimitiveApiError, run as connection } from './connection.mjs';
import { createMailer, run } from './mail.mjs';

const identity = { address: 'agent@example.test', org_id: 'example-org' };
const parent = { id: 'received-id', from_email: 'owner@example.test', recipient: identity.address,
  message_id: '<original@example.test>', subject: 'Research', references: [], parsed: { attachments: [] } };
const secret = ['private', 'fixture', 'value'].join('-');
const message = { to: parent.from_email, subject: 'Topic', text: 'Hello' };
const cases = [
  { args: ['send', 'operation'], input: JSON.stringify(message) },
  { args: ['reply', parent.id, 'operation'], input: 'Answer' },
  ...[{ kind: 'working' }, { kind: 'read' }, { kind: 'ack', status: 'received' }].map(input =>
    ({ args: ['signal', parent.id, 'operation'], input: JSON.stringify(input) })),
];
const refusal = (status = 410, code = 'sent_email_deleted') => new Response(JSON.stringify({
  success: false, error: { code, message: secret, details: { url: `https://example.test/${secret}` } },
}), { status });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'primitive-deleted-send-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  await writeFile(join(directory, 'connection.json'), JSON.stringify({ api_key: secret,
    ...identity, owner_address: parent.from_email, api_base_url: 'https://api.primitive.dev/v1',
    connection: { address: identity.address } }), { mode: 0o600 });
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return init.method === 'POST' ? refusal() : new Response(JSON.stringify({ success: true, data: parent }));
  };
  return { directory, fetcher, calls };
}
async function record(directory) {
  const path = join(directory, 'outbox', (await readdir(join(directory, 'outbox'))).find(name => name.endsWith('.json')));
  return { path, value: JSON.parse(await readFile(path, 'utf8')) };
}
for (const c of cases) test(`typed deleted ${c.args[0]} ${c.input} is durable across helper invocations`, async t => {
  const f = await fixture(t);
  assert.deepEqual(await run(c.args, { ...f, input: c.input }), { status: 'deleted' });
  const saved = await record(f.directory);
  assert.equal(saved.value.attempted, true);
  assert.deepEqual(saved.value.receipt, { status: 'deleted' });
  assert.equal(JSON.stringify(saved.value).includes(secret), false);
  assert.equal(f.calls.filter(c => c.init.method === 'POST').length, 1);
  assert.deepEqual(await run(c.args, { directory: f.directory, input: c.input,
    fetcher: async () => assert.fail('A saved deletion must not perform any network request') }), { status: 'deleted' });
  const fresh = createMailer({ identity, directory: join(f.directory, 'outbox'),
    now: () => Date.now() + 120000,
    uuid: () => assert.fail('A saved operation must not create another key'),
    request: async () => assert.fail('No network request after deletion') });
  const result = c.args[0] === 'send' ? fresh.send('operation', message)
    : c.args[0] === 'reply' ? fresh.reply('operation', parent.id, c.input)
    : fresh.signal('operation', parent.id, JSON.parse(c.input));
  assert.deepEqual(await result, { status: 'deleted' });
  const changed = c.args[0] === 'reply' ? 'Different' : JSON.stringify(c.args[0] === 'send' ? { ...message, text: 'Different' } : { kind: 'ack', status: 'will_process' });
  await assert.rejects(run(c.args, { directory: f.directory, input: changed, fetcher: async () => assert.fail('Intent check must precede network') }), /different message/);
});

test('saved deleted receipts cannot cross organization or address scope', async t => {
  const f = await fixture(t);
  await run(cases[0].args, { ...f, input: cases[0].input });
  const saved = await record(f.directory);
  for (const scope of [{ ...identity, org_id: 'different-org' }, { ...identity, address: 'other@example.test' }]) {
    const hash = createHash('sha256').update(JSON.stringify([scope, 'operation'])).digest('hex');
    const path = join(f.directory, 'outbox', `${hash}.json`);
    await writeFile(path, JSON.stringify(saved.value));
    const mail = createMailer({ identity: scope, directory: join(f.directory, 'outbox'), request: async () => assert.fail('Scope check precedes network') });
    await assert.rejects(mail.send('operation', message), /different message/);
  }
});

for (const [status, code] of [[410, 'different_code'], [404, 'sent_email_deleted'], [500, 'sent_email_deleted'], [410, null]])
  test(`HTTP ${status} ${code} does not establish deletion or trigger a resend`, async t => {
    const f = await fixture(t);
    await assert.rejects(run(cases[0].args, { ...f, input: cases[0].input, fetcher: async () => refusal(status, code) }), PrimitiveApiError);
    assert.equal((await record(f.directory)).value.receipt, null);
    await assert.rejects(run(cases[0].args, { directory: f.directory, input: cases[0].input, fetcher: async (url, init) => {
      assert.equal(init.method, 'GET'); assert.match(url, /sent-emails\?idempotency_key=/);
      return new Response(JSON.stringify({ success: true, data: [] }));
    } }), /still unknown/);
  });

for (const kind of ['network', 'unreadable']) test(`${kind} outcome remains unknown and does not resend`, async t => {
  const f = await fixture(t);
  await assert.rejects(run(cases[0].args, { ...f, input: cases[0].input, fetcher: async () => {
    if (kind === 'network') throw new Error(secret);
    return new Response(secret, { status: 410 });
  } }), error => !error.message.includes(secret));
  await assert.rejects(run(cases[0].args, { directory: f.directory, input: cases[0].input, fetcher: async (url, init) => {
    assert.equal(init.method, 'GET'); return new Response(JSON.stringify({ success: true, data: [] }));
  } }), /still unknown/);
  assert.equal((await record(f.directory)).value.receipt, null);
});

for (const status of [404, 410]) test(`parent GET ${status} is not a deleted send`, async t => {
  const f = await fixture(t);
  await assert.rejects(run(cases[1].args, { ...f, input: cases[1].input, fetcher: async (url, init) => {
    assert.equal(init.method, 'GET'); return refusal(status);
  } }), PrimitiveApiError);
  assert.deepEqual(await readdir(join(f.directory, 'outbox')), []);
});

test('reconciliation GET 410 does not become a saved deletion', async t => {
  const f = await fixture(t);
  await assert.rejects(run(cases[0].args, { ...f, input: cases[0].input, fetcher: async () => { throw new Error('lost'); } }));
  await assert.rejects(run(cases[0].args, { directory: f.directory, input: cases[0].input, fetcher: async (url, init) => {
    assert.equal(init.method, 'GET'); return refusal();
  } }), PrimitiveApiError);
  assert.equal((await record(f.directory)).value.receipt, null);
});

test('failed deletion receipt persistence returns no terminal result and never auto-resends', async t => {
  const f = await fixture(t);
  let saved;
  await assert.rejects(run(cases[0].args, { ...f, input: cases[0].input, fetcher: async () => {
    saved = await record(f.directory);
    await rename(saved.path, `${saved.path}.backup`);
    await mkdir(saved.path); // Force atomic rename to fail after the HTTP refusal.
    return refusal();
  } }));
  assert.equal(saved.value.attempted, true);
  assert.equal(saved.value.receipt, null);
  await rm(saved.path, { recursive: true });
  await rename(`${saved.path}.backup`, saved.path);
  await assert.rejects(run(cases[0].args, { directory: f.directory, input: cases[0].input, fetcher: async (url, init) => {
    assert.equal(init.method, 'GET'); return new Response(JSON.stringify({ success: true, data: [] }));
  } }), /still unknown/);
});

test('transport errors retain only safe status and code, never response details or URLs', async t => {
  const f = await fixture(t);
  for (const code of ['sent_email_deleted', `invalid ${secret}`]) {
    await assert.rejects(connection(['request', 'POST', '/send-mail', 'operation'], {
      directory: f.directory, input: JSON.stringify(message), fetcher: async () => refusal(410, code),
    }), error => {
      assert.ok(error instanceof PrimitiveApiError);
      assert.equal(error.status, 410);
      assert.equal(error.code, code === 'sent_email_deleted' ? code : undefined);
      assert.equal(`${error.stack}${JSON.stringify(error)}`.includes(secret), false);
      assert.equal(error.cause, undefined);
      assert.equal(error.response, undefined);
      return true;
    });
  }
});

test('actual CLI send/reply/signal prints deleted and a restarted process never calls the network', async t => {
  const f = await fixture(t);
  const preload = join(f.directory, 'transport.mjs');
  const offline = join(f.directory, 'offline.mjs');
  await writeFile(preload, `globalThis.fetch = async (url, init) => init.method === 'GET'
    ? new Response(JSON.stringify({success:true,data:${JSON.stringify(parent)}}))
    : new Response(JSON.stringify({success:false,error:{code:'sent_email_deleted',message:${JSON.stringify(secret)}}}), {status:410});`);
  await writeFile(offline, `globalThis.fetch = async () => { throw new Error('Unexpected network request'); };`);
  for (const [index, c] of cases.entries()) {
    const args = [...c.args]; args[args.length - 1] = `operation-${index}`;
    for (const transport of [preload, offline]) {
      const result = spawnSync(process.execPath, ['--import', transport, new URL('./mail.mjs', import.meta.url).pathname, ...args], {
        input: c.input, encoding: 'utf8', timeout: 5000,
        env: { ...process.env, PRIMITIVE_AGENT_STATE_DIR: f.directory },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { status: 'deleted' });
      assert.equal((result.stdout + result.stderr).includes(secret), false);
    }
  }
});


test('untyped exceptions cannot establish deletion through their message text', async t => {
  const f = await fixture(t);
  const mail = createMailer({ identity, directory: join(f.directory, 'outbox'), request: async () => {
    throw new Error('Primitive returned HTTP 410 (sent_email_deleted).');
  } });
  await assert.rejects(mail.send('operation', message));
  assert.equal((await record(f.directory)).value.receipt, null);
});

test('connection CLI preserves safe error status without exposing response content', async t => {
  const f = await fixture(t);
  const preload = join(f.directory, 'transport.mjs');
  await writeFile(preload, `globalThis.fetch = async () => new Response(JSON.stringify({success:false,
    error:{code:'sent_email_deleted',message:${JSON.stringify(secret)}}}),{status:410});`);
  const result = spawnSync(process.execPath, ['--import', preload, new URL('./connection.mjs', import.meta.url).pathname,
    'request', 'POST', '/send-mail', 'operation'], {
    input: JSON.stringify(message), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PRIMITIVE_AGENT_STATE_DIR: f.directory },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'Primitive returned HTTP 410 (sent_email_deleted).');
  assert.equal(result.stderr.includes(secret), false);
  assert.equal(new PrimitiveApiError(secret, secret).message.includes(secret), false);
});
