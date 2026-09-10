import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FlyController } from '../src/controller.js';
import { StringComposer } from '../src/string-instrument.js';
import { startServer } from '../src/server.js';

function request(url, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(path, url), { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => { chunks.push(chunk); });
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({ status: response.statusCode, headers: response.headers, bytes, text: bytes.toString('utf8') });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function fixture(context) {
  const calls = [];
  const adapter = {
    prepared: true,
    snapshot: () => ({ tempo: 96, source: 'Fly Lab' }),
    async prepare() { calls.push('prepare'); },
    async start() { calls.push('start'); },
    async recordNotes() { calls.push('record'); },
    async stop() { calls.push('stop'); },
    async panic() { calls.push('panic'); },
    async close() { calls.push('close'); },
  };
  const world = { snapshot: () => ({ activity: [0, 0, 0, 0, 0, 0] }), setStimulus() {} };
  const composer = new StringComposer();
  composer.notes = [{ id: 1, beat: 0, pitch: 64, velocity: 72, duration: .5, reason: 'String crossing' }];
  const controller = new FlyController(adapter, { world, composer, mode: 'live' });
  controller.startTimer = () => {};
  let heartbeats = 0;
  controller.heartbeat = () => { heartbeats++; };
  const app = await startServer(controller, '<html>__FLY_TOKEN__</html>', { port: 0 });
  context.after(() => app.close());
  const home = await request(app.url);
  assert.equal(home.status, 200);
  const token = home.text.match(/[a-f0-9]{64}/)[0];
  const headers = { 'Content-Type': 'application/json', 'X-Fly-Token': token };
  return { app, controller, composer, calls, token, headers, home, heartbeats: () => heartbeats };
}

test('dashboard binds to loopback and rejects foreign Host/Origin headers', async context => {
  const { app, headers, home, calls } = await fixture(context);
  assert.equal(app.server.address().address, '127.0.0.1');
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.equal(home.headers['x-frame-options'], 'DENY');
  assert.equal(home.headers['referrer-policy'], 'no-referrer');
  assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal((await request(app.url, { headers: { Host: 'attacker.example' } })).status, 403);
  const foreign = await request(app.url, { method: 'POST', path: '/api/action', headers: { ...headers, Origin: 'https://attacker.example' }, body: '{"action":"prepare"}' });
  assert.equal(foreign.status, 403);
  assert.deepEqual(calls, []);
});

test('actions require the session token, JSON, a supported action and a small body', async context => {
  const { app, headers, calls } = await fixture(context);
  const post = options => request(app.url, { method: 'POST', path: '/api/action', body: '{"action":"prepare"}', ...options });
  assert.equal((await post({ headers: { 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await post({ headers: { ...headers, 'X-Fly-Token': 'a'.repeat(64) } })).status, 403);
  assert.equal((await post({ headers: { ...headers, 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await post({ headers, body: '{' })).status, 400);
  assert.equal((await post({ headers, body: JSON.stringify({ action: 'delete-all-tracks' }) })).status, 400);
  assert.equal((await post({ headers, body: JSON.stringify({ action: 'prepare', padding: 'x'.repeat(2100) }) })).status, 413);
  assert.deepEqual(calls, []);
  assert.equal((await post({ headers })).status, 200);
  assert.deepEqual(calls, ['prepare']);
  assert.equal((await request(app.url, { path: '/api/action' })).status, 404);
  assert.equal((await request(app.url, { method: 'DELETE', path: '/api/action', headers })).status, 404);
  assert.equal((await request(app.url, { path: '/anything-else' })).status, 404);
});

test('only an authenticated state poll keeps the fly alive', async context => {
  const { app, token, heartbeats } = await fixture(context);
  assert.equal((await request(app.url, { path: '/api/state' })).status, 200);
  assert.equal(heartbeats(), 0, 'Origin-less image requests cannot count as dashboard presence');
  const foreign = await request(app.url, { path: '/api/state', headers: { Origin: 'https://attacker.example', 'X-Fly-Token': token } });
  assert.equal(foreign.status, 403);
  assert.equal(heartbeats(), 0);
  const authenticated = await request(app.url, { path: '/api/state', headers: { 'X-Fly-Token': token } });
  assert.equal(authenticated.status, 200);
  assert.equal(heartbeats(), 1);
  assert.doesNotMatch(authenticated.text, new RegExp(token));
});

test('MIDI export requires the local token and returns the exact generated binary', async context => {
  const { app, token, composer, heartbeats } = await fixture(context);
  const download = headers => request(app.url, { path: '/api/midi', headers });
  assert.equal((await download({})).status, 403);
  assert.equal((await download({ 'X-Fly-Token': 'wrong' })).status, 403);
  assert.equal((await download({ 'X-Fly-Token': token, Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await download({ 'X-Fly-Token': token, Host: 'attacker.example' })).status, 403);
  const midi = await download({ 'X-Fly-Token': token });
  assert.equal(midi.status, 200);
  assert.equal(midi.headers['content-type'], 'audio/midi');
  assert.equal(midi.headers['content-disposition'], 'attachment; filename=fly-lab.mid');
  assert.equal(midi.headers['cache-control'], 'no-store');
  assert.deepEqual(midi.bytes, composer.midiFile());
  assert.equal(midi.bytes.toString('ascii', 0, 4), 'MThd');
  assert.ok(midi.bytes.includes(Buffer.from([0x90, 64, 72])));
  assert.equal(heartbeats(), 0, 'MIDI download is not a state heartbeat');
});

test('one server session token cannot authorize another server', async context => {
  const first = await fixture(context), second = await fixture(context);
  assert.notEqual(first.token, second.token);
  const wrongSession = await request(second.app.url, { path: '/api/midi', headers: { 'X-Fly-Token': first.token } });
  assert.equal(wrongSession.status, 403);
  const action = await request(second.app.url, { method: 'POST', path: '/api/action', headers: first.headers, body: '{"action":"prepare"}' });
  assert.equal(action.status, 403);
  assert.deepEqual(second.calls, []);
});
