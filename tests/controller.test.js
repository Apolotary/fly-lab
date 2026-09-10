import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { FlyController } from '../src/controller.js';
import { FlyWorld } from '../src/world.js';

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function fixture() {
  const calls = [];
  const adapter = {
    prepared: true,
    midi: { panic() { calls.push('midi:panic'); } },
    snapshot() { return { tempo: 96, source: 'Fly Instrument', midiConnected: true }; },
    async prepare() { calls.push('prepare'); },
    async start() { calls.push('start'); },
    play(notes) { calls.push(['play', structuredClone(notes)]); },
    async recordNotes(notes) { calls.push(['record', structuredClone(notes)]); },
    async stop() { calls.push('stop'); },
    async panic() { this.midi.panic(); calls.push('panic'); },
    async close() { calls.push('close'); },
  };
  const world = {
    steps: 0, elapsed: [], step(ms) { this.steps++; this.elapsed.push(ms); },
    snapshot() { return { time: this.steps * .05, activity: [.2, .3, .4, .1, .2, .3] }; },
    setStimulus() {},
  };
  const composer = {
    notes: [], complete: false,
    step() {
      const note = { id: this.notes.length + 1, pitch: 60, velocity: 70, duration: .5, beat: this.notes.length / 2 };
      this.notes.push(note);
      return [note];
    },
    snapshot() { return { noteCount: this.notes.length }; },
    midiFile() { return Buffer.from('MThd'); },
  };
  return { adapter, world, composer, calls, controller: new FlyController(adapter, { world, composer, mode: 'live' }) };
}
function silenceErrors(context) { context.mock.method(console, 'error', () => {}); }

test('timer delays advance elapsed simulation time while capping catch-up work', async () => {
  const { controller, world } = fixture();
  await controller.action({ action: 'start' });
  const start = controller.lastTick;
  controller.tick(start + 50);
  await controller.pending;
  controller.tick(start + 200);
  controller.tick(start + 1200);
  controller.tick(start + 1190);
  assert.deepEqual(world.elapsed, [...Array(9).fill(50), 0]);
  await controller.action({ action: 'stop' });
});

test('stop releases MIDI immediately, drains an in-flight clip save, then saves final notes', async () => {
  const { controller, adapter, calls, world, composer } = fixture();
  const write = deferred();
  let first = true;
  adapter.recordNotes = async notes => {
    if (first) {
      first = false; calls.push('record:start');
      await write.promise; calls.push('record:end');
    } else calls.push(['record:final', structuredClone(notes)]);
  };
  await controller.action({ action: 'start' });
  controller.tick();
  const stopping = controller.action({ action: 'stop' });
  assert.equal(controller.running, false);
  assert.equal(calls.at(-1), 'midi:panic', 'note-offs must not wait for the SDK write');
  controller.tick();
  assert.equal(world.steps, 1);
  assert.ok(!calls.includes('stop'));
  write.resolve();
  await stopping;
  assert.deepEqual(calls.slice(-3), ['record:end', ['record:final', composer.notes], 'stop']);
  assert.equal(controller.busy, false);
  assert.equal(controller.saving, false);
});

test('missing heartbeat releases MIDI before a blocked save and stops exactly once', async () => {
  const { controller, adapter, calls, world } = fixture();
  const write = deferred();
  let saves = 0;
  adapter.recordNotes = async () => { if (++saves === 1) await write.promise; };
  await controller.action({ action: 'start' });
  controller.tick();
  controller.lastSeen = 1000;
  controller.tick(11001);
  assert.equal(controller.running, false);
  assert.equal(world.steps, 1, 'the timeout tick cannot emit another gesture');
  assert.equal(calls.at(-1), 'midi:panic');
  write.resolve();
  await controller.actionDone;
  assert.equal(calls.filter(call => call === 'stop').length, 1);
  assert.ok(controller.snapshot().events.some(event => /disconnected.*paused/i.test(event.text)));
  controller.tick(22000);
  assert.equal(calls.filter(call => call === 'stop').length, 1);
});

test('invalid actions and world inputs never reach the instrument adapter', async () => {
  const { adapter, calls } = fixture();
  const controller = new FlyController(adapter, { world: new FlyWorld(), mode: 'live' });
  for (const input of [null, [], 'start', { action: 'delete' }, { action: 'eval' }, { action: 'stimulus', drive: NaN },
    { action: 'fruit', x: Infinity, y: .5 }, { action: 'fruit', x: .5, y: .5, kind: 'unknown' }]) {
    await assert.rejects(controller.action(input));
  }
  assert.deepEqual(calls, []);
  await controller.action({ action: 'clearFruit' });
  await controller.action({ action: 'fruit', x: .2, y: .3, kind: 'banana' });
  assert.equal(controller.snapshot().brain.fruits.length, 1);
  assert.deepEqual(calls, []);
});

test('an unprepared instrument start fails safely and hides private setup diagnostics', async context => {
  silenceErrors(context);
  const { controller, adapter, calls } = fixture();
  adapter.prepared = false;
  adapter.start = async () => { throw new Error('private project-name.als payload'); };
  await assert.rejects(controller.action({ action: 'start' }), /Prepare the instrument first/);
  assert.equal(controller.running, false);
  assert.equal(controller.busy, false);
  assert.deepEqual(calls, ['midi:panic']);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /project-name|payload/);
});

test('a synchronous MIDI play error stops the fly, panics, and hides source details', async context => {
  silenceErrors(context);
  const { controller, adapter, calls, world } = fixture();
  adapter.play = () => { throw new Error('private session path and SDK payload'); };
  await controller.action({ action: 'start' });
  controller.tick();
  await controller.pending;
  assert.equal(controller.running, false);
  assert.ok(calls.includes('midi:panic'));
  assert.ok(calls.includes('panic'));
  assert.ok(!calls.some(call => Array.isArray(call) && call[0] === 'record'));
  controller.tick();
  assert.equal(world.steps, 1);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /session path|SDK payload/);
});

test('an asynchronous clip save failure also stops and panics the instrument', async context => {
  silenceErrors(context);
  const { controller, adapter, calls } = fixture();
  adapter.recordNotes = async () => { throw new Error('private recording failure'); };
  await controller.action({ action: 'start' });
  controller.tick();
  await controller.pending;
  assert.equal(controller.running, false);
  assert.equal(controller.saving, false);
  assert.ok(calls.includes('panic'));
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private recording failure/);
});

test('Panic still disarms and mutes the track when the final clip save fails', async context => {
  silenceErrors(context);
  const { controller, adapter, calls } = fixture();
  adapter.recordNotes = async () => { calls.push('record:failed'); throw new Error('clip is unavailable'); };
  await controller.action({ action: 'start' });
  await assert.rejects(controller.action({ action: 'panic' }));
  assert.equal(controller.running, false);
  assert.equal(calls[1], 'midi:panic', 'note-off must precede the final save');
  assert.ok(calls.includes('panic'), 'native note-off must be followed by adapter disarm/mute cleanup');
});

test('overlapping actions are rejected while preparation is pending', async () => {
  const { controller, adapter, calls } = fixture();
  const prepare = deferred();
  adapter.prepare = async () => { calls.push('prepare:start'); await prepare.promise; calls.push('prepare:end'); };
  const preparing = controller.action({ action: 'prepare' });
  await setImmediate();
  await assert.rejects(controller.action({ action: 'start' }), /previous action/);
  await assert.rejects(controller.action({ action: 'fruit', x: .2, y: .2 }), /previous action/);
  prepare.resolve();
  await preparing;
  assert.equal(controller.busy, false);
  assert.deepEqual(calls, ['prepare:start', 'prepare:end']);
});

test('shutdown waits for preparation before saving and closing the MIDI bridge', async () => {
  const { controller, adapter, calls } = fixture();
  const prepare = deferred();
  adapter.prepare = async () => { calls.push('prepare:start'); await prepare.promise; calls.push('prepare:end'); };
  const preparing = controller.action({ action: 'prepare' });
  await setImmediate();
  const closing = controller.close();
  await setImmediate();
  assert.deepEqual(calls, ['prepare:start', 'midi:panic']);
  await assert.rejects(controller.action({ action: 'start' }), /shutting down/);
  prepare.resolve();
  await Promise.all([preparing, closing]);
  assert.deepEqual(calls, ['prepare:start', 'midi:panic', 'prepare:end', ['record', []], 'close']);
  assert.equal(controller.running, false);
});

test('shutdown stops an in-flight start and closes even when the final save fails', async context => {
  silenceErrors(context);
  const { controller, adapter, calls } = fixture();
  const start = deferred();
  adapter.start = async () => { calls.push('start:begin'); await start.promise; calls.push('start:end'); };
  const starting = controller.action({ action: 'start' });
  await setImmediate();
  adapter.recordNotes = async () => { throw new Error('last save failed'); };
  const closed = assert.rejects(controller.close(), /last save failed/);
  start.resolve();
  await Promise.all([starting, closed]);
  assert.equal(controller.running, false);
  assert.equal(calls.at(-1), 'close');
  assert.equal(controller.busy, false);
});

test('composition completion releases notes and refuses to restart the finished piece', async context => {
  silenceErrors(context);
  const { controller, composer, calls } = fixture();
  composer.step = function () { this.complete = true; return []; };
  await controller.action({ action: 'start' });
  controller.tick();
  await controller.actionDone;
  assert.equal(controller.running, false);
  assert.ok(calls.includes('midi:panic'));
  assert.ok(calls.includes('stop'));
  await assert.rejects(controller.action({ action: 'start' }), /Piece complete/);
});

test('instrument modes change only while paused and preserve notes without phantom fruit touches', async () => {
  const { adapter } = fixture();
  const fruit = { id: 'fruit-1', kind: 'banana', x: .5, y: .5, amount: 1 };
  let time = 0, feeding = false;
  const world = { snapshot: () => ({ time, fruits: [fruit], flies: [{ id: 'fly-1', x: .5, y: .5, height: 0,
    speed: 0, behavior: feeding ? 'feeding' : 'seeking', feedingId: feeding ? fruit.id : null }] }) };
  const controller = new FlyController(adapter, { world });
  assert.equal(controller.snapshot().music.instrumentMode, 'fruit');
  time = 1; feeding = true;
  const [touch] = controller.composer.step(world.snapshot());
  assert.equal(touch.pitch, 60);
  const notes = controller.composer.notes;
  await controller.action({ action: 'mode', mode: 'strings' });
  assert.equal(controller.composer.notes, notes);
  await controller.action({ action: 'mode', mode: 'fruit' });
  assert.equal(controller.snapshot().music.modeRevision, 2);
  time = 2;
  assert.deepEqual(controller.composer.step(world.snapshot()), [], 'a held fruit contact must not sound on mode switch');
  assert.equal(notes.length, 1);
  feeding = false; time = 3; controller.composer.step(world.snapshot());
  feeding = true; time = 4;
  assert.equal(controller.composer.step(world.snapshot()).length, 1);
  assert.equal(notes.length, 2);
  const revision = controller.modeRevision;
  await assert.rejects(controller.action({ action: 'mode', mode: 'unknown' }), /Choose/);
  await controller.action({ action: 'start' });
  await assert.rejects(controller.action({ action: 'mode', mode: 'strings' }), /Pause/);
  assert.equal(controller.modeRevision, revision);
  await controller.action({ action: 'stop' });
});

test('delayed timer samples each world round so intermediate string contacts are retained', async () => {
  const { adapter, calls } = fixture();
  let index = 0;
  const positions = [.28, .31, .33, .28];
  const world = { step() { index++; }, snapshot: () => ({ time: index * .05, x: .5, y: positions[index], height: 0, speed: .08, id: 'fly-1' }) };
  const controller = new FlyController(adapter, { world, instrumentMode: 'strings' });
  await controller.action({ action: 'start' });
  controller.tick(controller.lastTick + 150);
  await controller.pending;
  assert.equal(controller.composer.notes.length, 1, 'the path touched a string despite returning to its starting side');
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'play').length, 1);
  await controller.action({ action: 'stop' });
});
