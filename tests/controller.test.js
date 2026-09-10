import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { FlyController, mapMusic } from '../src/controller.js';

function fixture() {
  const calls = [];
  const adapter = {
    prepared: true,
    music: { tempo: 120, voices: ['LF', 'LM', 'LH', 'RF', 'RM', 'RH'].map(name => ({ name, active: false, pan: 0, level: 0.2 })) },
    snapshot() { return structuredClone(this.music); },
    async prepare() { calls.push('prepare'); },
    async apply(music) { calls.push('apply'); this.music = music; },
    async restore() { calls.push('restore'); this.music.tempo = 120; },
    async panic() { calls.push('panic'); this.music.voices.forEach(voice => { voice.active = false; }); },
  };
  const brain = {
    steps: 0,
    step() { this.steps++; },
    snapshot() { return { activity: [0.2, 0.3, 0.4, 0.1, 0.2, 0.3], turn: 0 }; },
    setStimulus() {},
  };
  return { adapter, brain, calls, controller: new FlyController(adapter, { brain, mode: 'live' }) };
}

test('stop waits for the in-flight modulation before restoring tempo', async () => {
  const { controller, adapter, calls, brain } = fixture();
  let finishApply;
  adapter.apply = async music => {
    calls.push('apply:start');
    await new Promise(resolve => { finishApply = resolve; });
    adapter.music = music;
    calls.push('apply:end');
  };
  await controller.action({ action: 'start' });
  controller.tick();
  assert.equal(typeof finishApply, 'function');
  const stopping = controller.action({ action: 'stop' });
  assert.equal(controller.running, false);
  controller.tick();
  assert.equal(brain.steps, 1);
  assert.deepEqual(calls, ['apply:start']);
  finishApply();
  await stopping;
  assert.deepEqual(calls, ['apply:start', 'apply:end', 'restore']);
  assert.equal(adapter.music.tempo, 120);
  assert.equal(controller.busy, false);
});

test('a missing dashboard heartbeat automatically stops modulation', async () => {
  const { controller, calls, brain } = fixture();
  await controller.action({ action: 'start' });
  controller.lastSeen = 1000;
  controller.tick(11001);
  await setImmediate();
  assert.equal(controller.running, false);
  assert.equal(brain.steps, 0);
  assert.deepEqual(calls, ['restore']);
  assert.match(controller.snapshot().events[0].text, /paused|frozen/i);
  controller.tick(22000);
  assert.deepEqual(calls, ['restore']);
});

test('unsupported action objects and invalid stimuli cannot reach the adapter', async () => {
  const { controller, adapter, calls } = fixture();
  for (const input of [null, [], 'start', { action: 'delete' }, { action: 'eval', code: 'process.exit()' }, { action: 'stimulus', drive: NaN }]) {
    await assert.rejects(controller.action(input));
  }
  adapter.prepared = false;
  const originalError = console.error;
  console.error = () => {};
  try { await assert.rejects(controller.action({ action: 'start' }), /Build the demo first/); }
  finally { console.error = originalError; }
  assert.deepEqual(calls, []);
});

test('music mapping limits tempo movement and mixer ranges for extreme neural values', () => {
  const { adapter } = fixture();
  const previous = adapter.snapshot();
  const mapped = mapMusic({ activity: [1, 0, NaN, Infinity, -50, 2], turn: 20 }, previous);
  assert.ok(Math.abs(mapped.tempo - previous.tempo) <= 2);
  assert.ok(mapped.tempo >= 100 && mapped.tempo <= 145);
  for (const voice of mapped.voices) {
    assert.ok(voice.pan >= -0.65 && voice.pan <= 0.65);
    assert.ok(voice.level >= 0.12 && voice.level <= 0.48);
    assert.equal(typeof voice.active, 'boolean');
  }
});

test('a failed modulation stops the fly, restores, mutes, and hides SDK error details', async () => {
  const { controller, adapter, calls } = fixture();
  adapter.apply = async () => { throw new Error('/private/user-session/project-name.als private SDK payload'); };
  await controller.action({ action: 'start' });
  const originalError = console.error;
  console.error = () => {};
  try { controller.tick(); await controller.pending; }
  finally { console.error = originalError; }
  assert.equal(controller.running, false);
  assert.equal(controller.applying, false);
  assert.ok(calls.includes('panic'));
  assert.ok(calls.includes('restore'));
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /user-session|project-name|SDK payload/);
});

test('shutdown drains an in-flight preparation before its final restore', async () => {
  const { controller, adapter, calls } = fixture();
  let finishPrepare;
  adapter.prepare = async () => {
    calls.push('prepare:start');
    await new Promise(resolve => { finishPrepare = resolve; });
    calls.push('prepare:end');
  };
  const preparing = controller.action({ action: 'prepare' });
  await setImmediate();
  const closing = controller.close();
  await setImmediate();
  const beforeFinish = [...calls];
  finishPrepare();
  await Promise.all([preparing, closing]);
  assert.deepEqual(beforeFinish, ['prepare:start'], 'shutdown must not restore while preparation can still write');
  assert.deepEqual(calls, ['prepare:start', 'prepare:end', 'restore']);
});
