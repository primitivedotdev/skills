import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseInteractionEnvelope } from '@primitivedotdev/sdk/interactions';
import { commands, createMailer, help } from './mail.mjs';

const identity = { address: 'agent@example.test', org_id: 'example-org' };
const parent = { id: 'received-id', from_email: 'owner@example.test', recipient: identity.address,
  message_id: '<original@example.test>', subject: 'Research', references: ['<root@example.test>'], parsed: { attachments: [] } };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'primitive-mail-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  let time = 1000, posted, loseResponse = false, lookup = [];
  const request = async (method, path, body, key) => {
    calls.push({ method, path, body, key });
    if (path.startsWith('/emails/')) return { data: parent };
    if (method === 'GET') return { data: lookup };
    posted = body;
    if (loseResponse) throw new Error('Lost network response');
    return { data: { id: 'sent-id', status: 'queued' } };
  };
  const options = { identity, directory, request, now: () => time };
  return { directory, calls, options, mail: createMailer(options),
    tick: ms => { time += ms; }, lose: () => { loseResponse = true; },
    reconcile: () => { lookup = [{ id: 'sent-id', from_address: identity.address, to_address: posted.to, status: 'delivered' }]; } };
}
test('replies preserve wire ancestry and new messages start a separate thread', async t => {
  const f = await fixture(t);
  await f.mail.reply('reply-op', parent.id, 'The answer');
  const reply = f.calls.at(-1);
  assert.equal(reply.path, '/send-mail');
  assert.equal(reply.body.in_reply_to, parent.message_id);
  assert.deepEqual(reply.body.references, [...parent.references, parent.message_id]);
  assert.equal(reply.body.to, parent.from_email);
  assert.equal(reply.body.from, identity.address);
  await f.mail.send('new-op', { to: parent.from_email, subject: 'Different topic', text: 'A new question' });
  assert.equal(f.calls.at(-1).body.in_reply_to, undefined);
  assert.equal(f.calls.at(-1).body.references, undefined);
});
test('all progress kinds use the published SDK format and ordinary send-mail', async t => {
  const f = await fixture(t);
  for (const input of [{ kind: 'ack', status: 'will_process' }, { kind: 'read' }, { kind: 'working' }]) {
    await f.mail.signal(input.kind, parent.id, input);
    const call = f.calls.at(-1);
    assert.equal(call.path, '/send-mail');
    assert.equal(call.body.in_reply_to, parent.message_id);
    assert.equal(call.body.attachments.length, 1);
    assert.equal(call.body.attachments[0].filename, 'interaction.json');
    assert.equal(parseInteractionEnvelope(Buffer.from(call.body.attachments[0].content_base64, 'base64')).status, 'valid');
  }
  const files = await readdir(f.directory);
  const records = await Promise.all(files.map(async name => JSON.parse(await readFile(join(f.directory, name), 'utf8'))));
  const working = records.find(r => r.intent.input.kind === 'working');
  assert.equal(working.prepared.expiresAtMs, 61000);
  for (const name of files) assert.equal((await stat(join(f.directory, name))).mode & 0o777, 0o600);
  assert.equal((await stat(f.directory)).mode & 0o777, 0o700);
});
test('restarts reuse the persisted receipt and refuse changed content', async t => {
  const f = await fixture(t);
  const first = await f.mail.reply('operation', parent.id, 'Hello');
  const restarted = createMailer(f.options);
  assert.deepEqual(await restarted.reply('operation', parent.id, 'Hello'), first);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  await assert.rejects(restarted.reply('operation', parent.id, 'Different'), /different message/);
});
test('lost send responses reconcile without reissuing the email or expiring an accepted working receipt', async t => {
  const f = await fixture(t);
  f.lose();
  await assert.rejects(f.mail.signal('work', parent.id, { kind: 'working' }));
  const restarted = createMailer(f.options);
  await assert.rejects(restarted.signal('work', parent.id, { kind: 'working' }), /still unknown/);
  f.tick(120000); f.reconcile();
  assert.equal((await restarted.signal('work', parent.id, { kind: 'working' })).status, 'delivered');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});
test('does not emit signals to itself, foreign mail, or interaction carriers', async t => {
  const f = await fixture(t);
  for (const message of [
    { ...parent, from_email: identity.address },
    { ...parent, recipient: 'other@example.test' },
    { ...parent, message_id: null },
    { ...parent, parsed: { attachments: [{ filename: 'interaction.json' }] } },
    { ...parent, parsed: {} },
  ]) {
    const mail = createMailer({ ...f.options, request: async (method) => {
      assert.equal(method, 'GET'); return { data: message };
    } });
    await assert.rejects(mail.signal('invalid-parent', parent.id, { kind: 'working' }));
  }
});
test('concurrent retries cannot send twice', async t => {
  const f = await fixture(t);
  let start, release;
  const started = new Promise(resolve => { start = resolve; });
  const mail = createMailer({ ...f.options, request: async (method, ...args) => {
    if (method === 'POST') { start(); await new Promise(resolve => { release = resolve; }); }
    return f.options.request(method, ...args);
  } });
  const first = mail.reply('same-operation', parent.id, 'Hello');
  await started;
  await assert.rejects(mail.reply('same-operation', parent.id, 'Hello'), /running or was interrupted/);
  release(); await first;
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});
test('never transmits an expired prepared working signal', async t => {
  const f = await fixture(t);
  const mail = createMailer({ ...f.options, now: (() => { let calls = 0; return () => ++calls < 3 ? 1000 : 100000; })() });
  assert.equal((await mail.signal('stale', parent.id, { kind: 'working' })).status, 'expired');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});
test('command manifest and actual bare/help/send/reply/signal invocations agree', async t => {
  const f = await fixture(t);
  const script = new URL('./mail.mjs', import.meta.url).pathname;
  assert.deepEqual(Object.keys(commands).sort(), ['reply', 'send', 'signal']);
  for (const args of [[], ['help'], ['--help']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), help.trim());
  }
  for (const args of [['send'], ['reply'], ['signal'], ['unknown']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), help.trim());
  }
  const secret = ['inert', 'credential'].join('-');
  await writeFile(join(f.directory, 'connection.json'), JSON.stringify({ api_key: secret,
    org_id: identity.org_id, owner_address: parent.from_email, api_base_url: 'https://api.primitive.dev/v1', connection: { address: identity.address } }), { mode: 0o600 });
  // A preload replaces network I/O in the child, exercising the exact CLI shapes.
  const preload = join(f.directory, 'transport.mjs');
  await writeFile(preload, `globalThis.fetch = async (url, init) => {
    if (!url.startsWith('https://api.primitive.dev/v1/')) throw Error('Unexpected origin');
    const data = init.method === 'GET' ? ${JSON.stringify(parent)} : {id:'sent-test',status:'queued'};
    return new Response(JSON.stringify({success:true,data}));
  };`);
  for (const [args, input] of [
    [['send', 'new'], JSON.stringify({ to: parent.from_email, subject: 'Topic', text: 'Hello' })],
    [['reply', parent.id, 'answer'], 'An answer'],
    [['signal', parent.id, 'working'], '{"kind":"working"}'],
  ]) {
    const result = spawnSync(process.execPath, ['--import', preload, script, ...args], {
      input, encoding: 'utf8', env: { ...process.env, PRIMITIVE_AGENT_STATE_DIR: f.directory },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).id, 'sent-test');
    assert.equal((result.stdout + result.stderr).includes(secret), false);
  }
});

test('keeps replies to simultaneous conversations attached to their own request', async t => {
  const f = await fixture(t);
  const mail = createMailer({ ...f.options, request: async (method, path, body, key) => {
    if (method === 'GET') return { data: { ...parent, message_id: `<${path.split('/').at(-1)}@example.test>` } };
    return f.options.request(method, path, body, key);
  } });
  await Promise.all([
    mail.reply('job-one', 'request-one', 'First answer'),
    mail.reply('job-two', 'request-two', 'Second answer'),
  ]);
  assert.deepEqual(f.calls.filter(c => c.method === 'POST').map(c => [c.body.body_text, c.body.in_reply_to]).sort(), [
    ['First answer', '<request-one@example.test>'], ['Second answer', '<request-two@example.test>'],
  ]);
});
test('refuses CRLF and control characters before sending ordinary mail', async t => {
  const f = await fixture(t);
  for (const subject of ['Topic\r\nBcc: other@example.test', 'Topic\0'])
    await assert.rejects(f.mail.send('unsafe', { to: parent.from_email, subject, text: 'Hello' }));
  assert.equal(f.calls.length, 0);
});
