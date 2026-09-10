import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { FlyController } from '../src/controller.js';
import { FlyWorld } from '../src/world.js';
import { FlyGarden } from '../src/garden.js';
import { FlyTombola } from '../src/tombola-world.js';

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

test('Fly Tombola preserves neural identity and notes across live controls and mode changes', async () => {
  const { adapter } = fixture();
  const garden = new FlyGarden({ count: 3 });
  const brains = garden.worlds.map(world => world.brain);
  const controller = new FlyController(adapter, { world: garden, instrumentMode: 'tombola' });
  assert.ok(controller.world instanceof FlyTombola);
  await controller.action({ action: 'start' });
  const start = controller.lastTick;
  for (let i = 1; i <= 80; i++) {
    controller.tick(start + i * 50);
    await controller.pending;
  }
  const notes = controller.composer.notes;
  assert.ok(notes.length > 0, 'wall hits reach the instrument');
  const recorded = structuredClone(notes), time = controller.performanceTime;
  await controller.action({ action: 'tombola', speed: -1.2, bounce: .9, gravity: .4 });
  await controller.action({ action: 'scale', scale: 'minor' });
  assert.equal(controller.running, true);
  assert.equal(controller.snapshot().brain.tombola.speed, -1.2);
  assert.equal(controller.snapshot().music.scale, 'minor');
  assert.deepEqual(notes, recorded);
  await assert.rejects(controller.action({ action: 'tombola', speed: 1, bounce: 2 }));
  assert.equal(controller.snapshot().brain.tombola.speed, -1.2, 'invalid edits are atomic');
  await assert.rejects(controller.action({ action: 'scale', scale: '__proto__' }));
  await assert.rejects(controller.action({ action: 'mode', mode: 'ambient' }), /Pause/);
  await controller.action({ action: 'stop' });
  await controller.action({ action: 'mode', mode: 'ambient' });
  assert.equal(controller.world, garden);
  await controller.action({ action: 'mode', mode: 'tombola' });
  assert.equal(controller.performanceTime, time);
  assert.equal(controller.composer.notes, notes);
  assert.equal(controller.snapshot().brain.tombola.totalHits, 0);
  assert.equal(controller.snapshot().brain.tombola.speed, -1.2);
  assert.equal(controller.snapshot().music.scale, 'minor');
  assert.deepEqual(garden.worlds.map(world => world.brain), brains);
  assert.deepEqual(notes, recorded);
});

test('failed Fly Tombola instrument switch leaves the active garden and recording intact', async context => {
  silenceErrors(context);
  const { adapter } = fixture();
  const garden = new FlyGarden({ count: 1 });
  const controller = new FlyController(adapter, { world: garden, instrumentMode: 'fruit' });
  const original = garden.snapshot(), notes = controller.composer.notes;
  adapter.setMode = async () => { throw new Error('private SDK failure'); };
  await assert.rejects(controller.action({ action: 'mode', mode: 'tombola' }), /Instrument change failed/);
  assert.equal(controller.world, garden);
  assert.equal(controller.instrumentMode, 'fruit');
  assert.equal(controller.composer.notes, notes);
  assert.deepEqual(garden.snapshot(), original);
});

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

test('ambient performance time follows a delayed timer, freezes on pause, and survives mode changes', async context => {
  let now = 10_000;
  context.mock.method(Date, 'now', () => now);
  const { adapter, world } = fixture();
  const controller = new FlyController(adapter, { world, instrumentMode: 'ambient', mode: 'live', energy: 'calm' });
  await controller.action({ action: 'start' });

  now += 2500;
  controller.tick();
  await controller.pending;
  assert.deepEqual(world.elapsed, Array(5).fill(50), 'a late timer performs at most 250 ms of neural work');
  assert.equal(controller.snapshot().brain.time, .25);
  assert.equal(controller.snapshot().music.performanceTime, 2.5);
  assert.equal(controller.composer.notes.findLast(note => note.voice === 'pad').beat, 4,
    'at 96 BPM the latest pad belongs at beat four, despite the slower body simulation');

  await controller.action({ action: 'stop' });
  const piece = controller.composer.notes, pausedNotes = structuredClone(piece);
  now += 60_000;
  controller.tick();
  assert.equal(controller.snapshot().music.performanceTime, 2.5, 'paused wall time is not musical time');
  assert.equal(world.steps, 5);
  assert.deepEqual(piece, pausedNotes);

  await controller.action({ action: 'mode', mode: 'fruit' });
  assert.equal(controller.snapshot().music.performanceTime, 2.5);
  await controller.action({ action: 'mode', mode: 'ambient' });
  assert.equal(controller.snapshot().music.performanceTime, 2.5);
  assert.equal(controller.composer.notes, piece, 'mode changes retain the same recorded piece');

  await controller.action({ action: 'start' });
  now += 2500;
  controller.tick();
  await controller.pending;
  assert.equal(controller.snapshot().music.performanceTime, 5, 'resume excludes the minute spent paused');
  assert.equal(controller.snapshot().brain.time, .5);
  const resumedNotes = controller.composer.notes.slice(pausedNotes.length);
  assert.ok(resumedNotes.length > 0);
  assert.ok(resumedNotes.every(note => note.voice === 'pad' && note.beat === 8),
    'returning to Ambient continues at the next pulse instead of replaying earlier beats');
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

test('an ambient mode switch waits for Live configuration, preserves the piece and passes the selected mode to prepare', async () => {
  const { controller, adapter, composer, calls } = fixture();
  composer.notes.push({ id: 1, pitch: 60, velocity: 64, duration: 1, beat: 0 });
  const notes = composer.notes, configuring = deferred();
  adapter.prepared = false;
  adapter.setMode = async mode => { calls.push(['setMode:start', mode]); await configuring.promise; calls.push(['setMode:end', mode]); };
  adapter.prepare = async options => { calls.push(['prepare', options.mode]); adapter.prepared = true; };
  const changing = controller.action({ action: 'mode', mode: 'ambient' });
  await setImmediate();
  assert.equal(controller.busy, true);
  assert.equal(controller.composer, composer, 'the UI cannot claim the new instrument before Live finishes');
  assert.equal(controller.instrumentMode, 'fruit');
  assert.equal(controller.modeRevision, 0);
  await assert.rejects(controller.action({ action: 'start' }), /previous action/);
  configuring.resolve();
  await changing;
  assert.equal(controller.busy, false);
  assert.equal(controller.instrumentMode, 'ambient');
  assert.equal(controller.modeRevision, 1);
  assert.equal(controller.composer.notes, notes);
  assert.equal(controller.snapshot().music.authored, true);
  await controller.action({ action: 'prepare' });
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'prepare' && call[1] === 'ambient'));
  assert.equal(controller.composer.notes, notes);
  assert.equal(controller.snapshot().prepared, true);
});

test('a failed SDK mode switch retains composer, recording and revision while reporting a sanitized recoverable error', async context => {
  silenceErrors(context);
  const { controller, adapter, composer } = fixture();
  const notes = composer.notes;
  notes.push({ id: 1, pitch: 60, velocity: 64, duration: 1, beat: 0 });
  adapter.setMode = async () => { adapter.prepared = false; throw new Error('private-local-path SDK diagnostic payload'); };
  let rejected;
  await assert.rejects(controller.action({ action: 'mode', mode: 'ambient' }), error => { rejected = error; return true; });
  assert.equal(controller.composer, composer);
  assert.equal(controller.composer.notes, notes);
  assert.equal(controller.instrumentMode, 'fruit');
  assert.equal(controller.modeRevision, 0);
  assert.equal(controller.busy, false);
  assert.equal(controller.running, false);
  assert.equal(controller.snapshot().prepared, false);
  assert.equal(controller.snapshot().connection, false);
  assert.doesNotMatch(rejected.message, /private-local-path|diagnostic payload/);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private-local-path|diagnostic payload/);
  adapter.setMode = async () => {};
  adapter.prepare = async () => { adapter.prepared = true; };
  await controller.action({ action: 'mode', mode: 'ambient' });
  await controller.action({ action: 'prepare' });
  assert.equal(controller.instrumentMode, 'ambient');
  assert.equal(controller.modeRevision, 1);
  assert.equal(controller.composer.notes, notes);
  assert.equal(controller.snapshot().connection, true);
  assert.equal(controller.snapshot().prepared, true);
});

test('ambient controls update twice per second without rewriting the clip at that rate', async () => {
  const { controller, adapter, composer, calls } = fixture();
  const ambience = { brightness: .2, density: .3, space: .4, pan: -.1, activity: .2 };
  controller.instrumentMode = 'ambient';
  composer.snapshot = () => ({ noteCount: composer.notes.length, ambience });
  adapter.modulate = async values => { calls.push(['modulate', { ...values }]); };
  await controller.action({ action: 'start' });
  const start = controller.lastTick;
  controller.tick(start + 50); await controller.pending;
  controller.tick(start + 300); await controller.pending;
  controller.tick(start + 550); await controller.pending;
  const controls = calls.filter(call => Array.isArray(call) && call[0] === 'modulate');
  assert.deepEqual(controls, [['modulate', ambience], ['modulate', ambience]]);
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'record').length, 1);
  controller.tick(start + 2050); await controller.pending;
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'record').length, 2);
  await controller.action({ action: 'stop' });
});

test('energy and fresh fruit work during performance while preserving the recorded timeline', async () => {
  const { adapter } = fixture();
  const { FlyGarden } = await import('../src/garden.js');
  const world = new FlyGarden({ count: 3 });
  const controller = new FlyController(adapter, { world, instrumentMode: 'ambient' });
  await controller.action({ action: 'start' });
  controller.tick(controller.lastTick + 100);
  await controller.pending;
  const piece = controller.composer.notes, saved = structuredClone(piece), time = controller.performanceTime;
  await controller.action({ action: 'energy', energy: 'wild' });
  assert.equal(controller.running, true);
  assert.equal(controller.snapshot().music.energy, 'wild');
  assert.equal(controller.snapshot().brain.motionGain, 2.25);
  assert.equal(controller.composer.notes, piece);
  assert.deepEqual(piece, saved);
  await controller.action({ action: 'refreshFruit' });
  assert.equal(controller.world.fruits.length, 3);
  assert.equal(controller.performanceTime, time);
  assert.deepEqual(piece, saved);
  await assert.rejects(controller.action({ action: 'energy', energy: 'turbo' }), /Choose/);
  assert.equal(controller.energy, 'wild');
  await controller.action({ action: 'stop' });
  await controller.action({ action: 'mode', mode: 'fruit' });
  await controller.action({ action: 'mode', mode: 'ambient' });
  assert.equal(controller.composer.snapshot().energy, 'wild');
  assert.equal(controller.composer.notes, piece);
});

test('failed ambient modulation stops MIDI before recording and hides SDK effect diagnostics', async context => {
  silenceErrors(context);
  const { controller, adapter, composer, calls } = fixture();
  controller.instrumentMode = 'ambient';
  composer.snapshot = () => ({ noteCount: composer.notes.length, ambience: { brightness: .5, space: .5, pan: 0 } });
  adapter.modulate = async () => { throw new Error('private-effect-parameter error'); };
  await controller.action({ action: 'start' });
  controller.tick(controller.lastTick + 50);
  await controller.pending;
  assert.equal(controller.running, false);
  assert.equal(controller.saving, false);
  assert.ok(calls.includes('midi:panic'));
  assert.ok(calls.includes('panic'));
  assert.ok(!calls.some(call => Array.isArray(call) && call[0] === 'record'));
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private-effect-parameter/);
});
