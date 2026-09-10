import test from 'node:test';
import assert from 'node:assert/strict';
import { FruitComposer, FRUIT_NOTES } from '../src/fruit-instrument.js';
import { FlyGarden } from '../src/garden.js';
import { TEMPO, MAX_BEATS, MAX_NOTES } from '../src/midi-file.js';

const fruit = (changes = {}) => ({ id: 'fruit-1', kind: 'banana', x: 0.5, y: 0.5, amount: 1, ...changes });
const fly = (changes = {}) => ({ id: 'fly-1', x: 0.5, y: 0.5, height: 0, speed: 0.05,
  behavior: 'seeking', feedingId: null, ...changes });
const feeding = (changes = {}) => fly({ behavior: 'feeding', feedingId: 'fruit-1', speed: 0, ...changes });
const frame = (time, flies = [fly()], fruits = [fruit()]) => ({ time, flies, fruits });

test('each fruit kind has a fixed note and snapshots cannot mutate the mapping', () => {
  assert.deepEqual(Object.values(FRUIT_NOTES).map(note => note.pitch), [60, 64, 67, 71, 72, 62]);
  assert.deepEqual(Object.values(FRUIT_NOTES).map(note => note.label), ['C4', 'E4', 'G4', 'B4', 'C5', 'D4']);
  for (const [kind, { pitch }] of Object.entries(FRUIT_NOTES)) {
    const composer = new FruitComposer();
    composer.prime(frame(0));
    const notes = composer.step(frame(0.217, [feeding()], [fruit({ kind })]));
    assert.equal(notes.length, 1);
    assert.equal(notes[0].pitch, pitch);
    assert.equal(notes[0].fruitKind, kind);
    assert.equal(notes[0].instrumentMode, 'fruit');
    assert.equal(notes[0].reason, 'Fruit touch');
    assert.equal(notes[0].beat, 0.217 * TEMPO / 60);
    assert.notEqual(notes[0].beat * 2, Math.round(notes[0].beat * 2), 'touch timing is not quantized');
    assert.ok(notes[0].velocity >= 65 && notes[0].velocity <= 85);
    assert.ok(notes[0].duration >= 0.8 && notes[0].duration <= 1.2);
    const snapshot = composer.snapshot();
    snapshot.fruitNotes[kind].pitch = 1;
    snapshot.contacts[0].fruitKind = 'unknown';
    snapshot.recentNotes[0].pitch = 1;
    assert.equal(composer.snapshot().fruitNotes[kind].pitch, pitch);
    assert.equal(composer.snapshot().contacts[0].fruitKind, kind);
    assert.equal(composer.notes[0].pitch, pitch);
  }
});

test('touch triggers once on feeding entry; proximity, flying and holding remain silent', () => {
  const composer = new FruitComposer();
  composer.step(frame(0));
  assert.deepEqual(composer.step(frame(0.1, [fly({ height: 0.4 })])), []);
  assert.deepEqual(composer.step(frame(0.2)), [], 'standing close to fruit is not an accepted feeding contact');
  const notes = composer.step(frame(0.3, [feeding()]));
  assert.equal(notes.length, 1);
  assert.deepEqual(composer.step(frame(0.4, [feeding()])), []);
  assert.deepEqual(composer.step(frame(0.5, [feeding()])), []);
  assert.deepEqual(composer.step(frame(0.6, [fly({ behavior: 'resting' })])), []);
  assert.equal(composer.step(frame(1.7, [feeding()])).length, 1, 'leaving then visiting again rearms the fruit');
  assert.equal(composer.snapshot().contacts.length, 2);
});

test('initial feeding and switching instruments establish a quiet baseline without clearing the piece', () => {
  const composer = new FruitComposer();
  assert.deepEqual(composer.step(frame(0, [feeding()])), []);
  assert.deepEqual(composer.step(frame(0.2, [feeding()])), []);
  composer.step(frame(0.4));
  composer.step(frame(0.6, [feeding()]));
  const notes = composer.notes, note = notes[0];
  composer.prime(frame(1, [feeding()]));
  assert.equal(composer.notes, notes);
  assert.equal(composer.notes[0], note);
  assert.deepEqual(composer.step(frame(1.2, [feeding()])), []);
  composer.step(frame(1.4));
  assert.equal(composer.step(frame(1.6, [feeding()])).length, 1);
  const tickOne = new FruitComposer();
  tickOne.prime(frame(0));
  assert.equal(tickOne.step(frame(0.05, [feeding()])).length, 1);
});

test('only valid, low, nearby feeding contacts with existing recognized fruit emit notes', () => {
  for (const [flies, fruits] of [
    [[feeding({ height: 0.2 })], [fruit()]],
    [[feeding({ x: 0.6 })], [fruit()]],
    [[feeding({ feedingId: 'missing' })], [fruit()]],
    [[feeding()], []],
    [[feeding()], [fruit({ amount: 0 })]],
    [[feeding()], [fruit({ kind: 'unknown' })]],
    [[feeding()], [fruit({ kind: 'constructor' })]],
    [[feeding({ x: NaN })], [fruit()]],
  ]) {
    const composer = new FruitComposer();
    composer.prime(frame(0));
    assert.deepEqual(composer.step(frame(0.2, flies, fruits)), []);
  }
});

test('flies touch independently while simultaneous same-pitch attacks coalesce and retain contacts', () => {
  const composer = new FruitComposer();
  const fruits = [fruit(), fruit({ id: 'fruit-2', kind: 'apple' }), fruit({ id: 'fruit-3' })];
  const flies = ['a', 'b', 'c'].map(id => fly({ id }));
  composer.prime(frame(0, flies, fruits));
  const notes = composer.step(frame(0.2, [
    feeding({ id: 'a' }), feeding({ id: 'b', feedingId: 'fruit-2' }),
    feeding({ id: 'c', feedingId: 'fruit-3' }),
  ], fruits));
  assert.deepEqual(notes.map(note => note.pitch), [60, 64]);
  assert.equal(composer.snapshot().contacts.length, 3);
  assert.deepEqual(composer.snapshot().contacts.map(contact => contact.flyId), ['a', 'b', 'c']);
});

test('re-strikes truncate earlier notes, including inherited notes from another instrument', () => {
  const composer = new FruitComposer();
  const previous = { id: 1, pitch: 60, velocity: 64, duration: 2, beat: 0, instrumentMode: 'strings' };
  const recording = [previous];
  composer.notes = recording;
  composer.prime(frame(0));
  const created = composer.step(frame(0.2, [feeding()]));
  assert.equal(composer.notes, recording);
  assert.equal(created[0].id, 2);
  assert.ok(Math.abs(previous.duration - 0.2) < 1e-12);
});

test('duplicate frames, disappearing flies and reset remain deterministic and cannot create ghost touches', () => {
  const composer = new FruitComposer();
  const perform = () => {
    composer.step({ ...fly(), time: 0, fruits: [fruit()] });
    composer.step({ ...feeding(), time: 0.2, fruits: [fruit()] });
    assert.deepEqual(composer.step(frame(0.2)), []);
    assert.deepEqual(composer.step(frame(0.1)), []);
    composer.step(frame(0.4, []));
    assert.deepEqual(composer.step(frame(0.6, [feeding()])), []);
    return composer.snapshot();
  };
  const first = perform();
  composer.reset();
  assert.deepEqual(perform(), first);
  for (const time of [NaN, -1, Infinity]) assert.deepEqual(composer.step(frame(time)), []);
});

test('recording limits are bounded and exported MIDI retains attacks and releases', () => {
  const composer = new FruitComposer();
  composer.prime(frame(0));
  composer.step(frame(0.2, [feeding()]));
  const midi = composer.midiFile();
  assert.equal(midi.toString('ascii', 0, 4), 'MThd');
  assert.equal(midi.readUInt32BE(18), midi.length - 22);
  assert.ok(midi.includes(Buffer.from([0x90, 60, 78])));
  assert.ok(midi.includes(Buffer.from([0x80, 60, 0])));
  assert.deepEqual(composer.step(frame(MAX_BEATS * 60 / TEMPO)), []);
  assert.equal(composer.complete, true);
  const full = new FruitComposer();
  full.notes = Array.from({ length: MAX_NOTES }, (_, id) => ({ id }));
  assert.deepEqual(full.step(frame(0)), []);
  assert.equal(full.complete, true);
});

test('real three-fly garden feeds and makes fruit notes reproducibly with no musical feedback', () => {
  const a = new FlyGarden({ seed: 1337 }), b = new FlyGarden({ seed: 1337 });
  const composer = new FruitComposer(), replay = new FruitComposer();
  const fruitKinds = new Set(a.snapshot().fruits.map(item => item.kind));
  composer.prime(a.snapshot());
  replay.prime(b.snapshot());
  let fed = false, hungerReduced = false;
  for (let elapsed = 0; elapsed < 20000; elapsed += 50) {
    const state = a.step(50), unobserved = b.step(50);
    composer.step(state);
    assert.deepEqual(state, unobserved, 'observing touches cannot change the animal or food');
    replay.step(unobserved);
    fed ||= state.fruits.some(item => item.amount < 1);
    hungerReduced ||= state.flies.some(item => item.hunger < 0.4);
    for (const item of state.flies) {
      assert.equal(item.feedingId !== null, item.behavior === 'feeding');
    }
  }
  assert.ok(a.snapshot().flies.every(item => item.visits >= 1));
  assert.ok(fed && hungerReduced);
  assert.ok(composer.notes.length >= 3);
  assert.ok(composer.notes.every(note => fruitKinds.has(note.fruitKind)));
  assert.deepEqual(composer.notes, replay.notes);
  assert.deepEqual(composer.midiFile(), replay.midiFile());
});

test('silenced measured motor graphs cannot feed or trigger nearby fruit pads', () => {
  const garden = new FlyGarden(), composer = new FruitComposer();
  for (const world of garden.worlds) world.brain.sim.synapsesEnabled = false;
  garden.clearFruit();
  for (const { x, y } of garden.snapshot().flies) garden.addFruit({ x, y, kind: 'grape' });
  composer.prime(garden.snapshot());
  for (let elapsed = 0; elapsed < 2000; elapsed += 50) composer.step(garden.step(50));
  assert.ok(garden.snapshot().flies.every(item => item.visits === 0 && item.feedingId === null));
  assert.deepEqual(composer.notes, []);
});
