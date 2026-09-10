import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FlyController } from '../src/controller.js';
import { startServer } from '../src/server.js';

function request(url, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(path, url), { method, headers }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
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
    snapshot: () => ({ tempo: 120, voices: [] }),
    async prepare() { calls.push('prepare'); },
    async restore() { calls.push('restore'); },
    async panic() { calls.push('panic'); },
  };
  const brain = { snapshot: () => ({ activity: [0, 0, 0, 0, 0, 0] }), setStimulus() {} };
  const controller = new FlyController(adapter, { brain });
  controller.startTimer = () => {};
  let heartbeats = 0;
  controller.heartbeat = () => { heartbeats++; };
  const app = await startServer(controller, '<html>__FLY_TOKEN__</html>', { port: 0 });
  context.after(() => app.close());
  const home = await request(app.url);
  assert.equal(home.status, 200);
  const token = home.text.match(/[a-f0-9]{64}/)[0];
  const headers = { 'Content-Type': 'application/json', 'X-Fly-Token': token };
  return { app, controller, calls, token, headers, home, heartbeats: () => heartbeats };
}

test('dashboard is bound to loopback and rejects foreign Host/Origin headers', async context => {
  const { app, headers, home, calls } = await fixture(context);
  assert.equal(app.server.address().address, '127.0.0.1');
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.equal(home.headers['x-frame-options'], 'DENY');
  assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/);
  const wrongHost = await request(app.url, { headers: { Host: 'attacker.example' } });
  assert.equal(wrongHost.status, 403);
  const foreignOrigin = await request(app.url, { method: 'POST', path: '/api/action', headers: { ...headers, Origin: 'https://attacker.example' }, body: '{"action":"prepare"}' });
  assert.equal(foreignOrigin.status, 403);
  assert.deepEqual(calls, []);
});

test('actions require the session token, JSON, supported action and a small body', async context => {
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

test('only an authenticated state poll can keep the fly alive', async context => {
  const { app, token, heartbeats } = await fixture(context);
  const unauthenticated = await request(app.url, { path: '/api/state' });
  assert.equal(unauthenticated.status, 200);
  assert.equal(heartbeats(), 0, 'Origin-less image requests must not count as dashboard presence');
  const foreign = await request(app.url, { path: '/api/state', headers: { Origin: 'https://attacker.example', 'X-Fly-Token': token } });
  assert.equal(foreign.status, 403);
  assert.equal(heartbeats(), 0);
  const authenticated = await request(app.url, { path: '/api/state', headers: { 'X-Fly-Token': token } });
  assert.equal(authenticated.status, 200);
  assert.equal(heartbeats(), 1);
});
