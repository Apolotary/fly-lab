import test from 'node:test';
import assert from 'node:assert/strict';
import { AmbientComposer, AMBIENT_CHORDS } from '../src/ambient-instrument.js';
import { FlyGarden } from '../src/garden.js';
import { MAX_BEATS, MAX_NOTES, TEMPO } from '../src/midi-file.js';

const fly = (changes = {}) => ({ id: 'fly-1', x: 0.5, y: 0.5, height: 0, speed: 0,
  activity: Array(6).fill(0), hunger: 0.5, behavior: 'exploring', feedingId: null, ...changes });
const fruit = (changes = {}) => ({ id: 'fruit-1', kind: 'banana', x: 0.5, y: 0.5, amount: 1, ...changes });
const frame = (time, flies = [fly()], fruits = [fruit()]) => ({ time, flies, fruits });
const feeding = (changes = {}) => fly({ behavior: 'feeding', feedingId: 'fruit-1', ...changes });
const run = (composer, seconds, flies = [fly()], start = 0) => {
  for (let tick = 1; tick <= seconds * 20; tick++) composer.step(frame(start + tick / 20, flies));
  return composer.snapshot();
};

test('an explicitly authored gentle bed continues with still or absent flies', () => {
  for (const flies of [[fly()], []]) {
    const composer = new AmbientComposer();
    composer.prime(frame(0, flies));
    run(composer, 9.95, flies);
    assert.equal(composer.notes.length, 12);
    assert.deepEqual([...new Set(composer.notes.map(note => note.beat))], [0, 4, 8, 12]);
    assert.ok(composer.notes.every(note => note.voice === 'pad' && note.authored === true));
    assert.ok(composer.notes.every(note => note.reason === 'Authored pad' && note.instrumentMode === 'ambient'));
    assert.ok(composer.notes.every(note => note.velocity < 50));
    assert.equal(composer.snapshot().authored, true);
    assert.deepEqual(composer.contacts, []);
  }
});

test('the fixed harmonic progression changes every sixteen beats and repeats without random notes', () => {
  const composer = new AmbientComposer();
  composer.prime(frame(0));
  run(composer, 40.05);
  const changes = [0, 16, 32, 48, 64].map(beat => composer.notes.filter(note => note.beat === beat));
  assert.deepEqual(changes.map(notes => notes[0].chord), ['Cmaj9', 'Am9', 'Fmaj9', 'G6/9', 'Cmaj9']);
  for (let index = 0; index < changes.length; index++) {
    assert.deepEqual(changes[index].map(note => note.pitch), AMBIENT_CHORDS[index % 4].pitches.slice(0, 3));
  }
  assert.equal(composer.snapshot().chord, 'Cmaj9');
});

test('observed movement changes density, strength, register and bounded smooth effect controls', () => {
  const still = new AmbientComposer(), active = new AmbientComposer();
  still.prime(frame(0)); active.prime(frame(0));
  const soaring = [fly({ x: 1, height: 0.4, speed: 0.1, hunger: 0, activity: Array(6).fill(0.3) })];
  const initial = active.snapshot().ambience;
  active.step(frame(0.05, soaring));
  const first = active.snapshot().ambience;
  assert.ok(first.pan > 0 && first.pan < 0.1, 'modulation slews rather than jumping to the target');
  assert.ok(first.brightness > initial.brightness && first.brightness < 0.4);
  run(active, 7.45, soaring, 0.05); run(still, 7.5);
  const movingNotes = active.notes.filter(note => note.beat === 12);
  const stillNotes = still.notes.filter(note => note.beat === 12);
  assert.equal(movingNotes.length, 5);
  assert.equal(stillNotes.length, 3);
  assert.equal(movingNotes[0].pitch, stillNotes[0].pitch + 12);
  assert.ok(movingNotes[0].velocity > stillNotes[0].velocity);
  for (const [key, value] of Object.entries(active.snapshot().ambience)) {
    assert.ok(Number.isFinite(value) && value >= (key === 'pan' ? -1 : 0) && value <= 1);
  }
  const detached = active.snapshot();
  detached.ambience.pan = -100;
  detached.recentNotes[0].pitch = 1;
  assert.ok(active.snapshot().ambience.pan > 0);
  assert.ok(active.notes.every(note => note.pitch >= 48));
});

test('only new feeding entries add high bells and holding an existing touch remains quiet', () => {
  const composer = new AmbientComposer();
  composer.prime(frame(0));
  assert.ok(composer.step(frame(0.05)).every(note => note.voice === 'pad'));
  assert.deepEqual(composer.step(frame(0.1, [fly({ height: 0.3 })])), []);
  assert.deepEqual(composer.step(frame(0.15)), []);
  const bells = composer.step(frame(0.2, [feeding()]));
  assert.equal(bells.length, 1);
  assert.equal(bells[0].voice, 'bell');
  assert.equal(bells[0].pitch, 72);
  assert.equal(bells[0].authored, false);
  assert.equal(bells[0].reason, 'Fruit bell');
  assert.equal(bells[0].id, 4, 'recording IDs are global across pad and fruit source notes');
  assert.equal(bells[0].channel, 0);
  assert.equal(composer.snapshot().contacts[0].fruitId, 'fruit-1');
  assert.equal(composer.snapshot().contacts[0].instrumentMode, 'ambient');
  assert.deepEqual(composer.step(frame(0.25, [feeding()])), []);
  assert.deepEqual(composer.step(frame(0.3, [feeding()])), []);
  assert.equal(composer.snapshot().fruitNotes.banana.pitch, 72);
  assert.equal(composer.snapshot().fruitNotes.banana.label, 'C5');
});

test('prime preserves recordings and prevents phantom accents or pad replays when switching or resuming', () => {
  const composer = new AmbientComposer();
  composer.prime(frame(0, [feeding()]));
  assert.ok(composer.step(frame(0.05, [feeding()])).every(note => note.voice === 'pad'));
  composer.step(frame(0.1)); composer.step(frame(0.2, [feeding()]));
  const recording = composer.notes, count = recording.length;
  composer.prime(frame(0.2, [feeding()]));
  assert.equal(composer.notes, recording);
  assert.deepEqual(composer.step(frame(0.25, [feeding()])), []);
  assert.equal(composer.notes.length, count);
  const replacement = new AmbientComposer();
  replacement.notes = recording;
  replacement.prime(frame(1.25, [feeding()]));
  assert.deepEqual(replacement.step(frame(1.3, [feeding()])), []);
  assert.equal(replacement.notes, recording);
  assert.ok(replacement.step(frame(2.5, [feeding()])).every(note => note.voice === 'pad'));
});

test('same-key pad re-strikes truncate history and simultaneous bell contacts share one channel-zero attack', () => {
  const composer = new AmbientComposer();
  composer.prime(frame(0));
  composer.step(frame(0.05));
  composer.step(frame(2.5));
  assert.ok(composer.notes.slice(0, 3).every(note => note.duration === 2.5));
  const flies = [fly({ id: 'a' }), fly({ id: 'b' })];
  composer.prime(frame(2.6, flies));
  const notes = composer.step(frame(2.8, [feeding({ id: 'a' }), feeding({ id: 'b' })]));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].voice, 'bell');
  assert.equal(composer.contacts.length, 2);
  assert.ok(composer.notes.every(note => note.channel === 0));
});

test('delayed clocks skip missed authored pulses, while duplicate and invalid frames emit nothing', () => {
  const composer = new AmbientComposer();
  composer.prime(frame(0));
  const notes = composer.step(frame(20.1));
  assert.equal(notes.length, 3);
  assert.ok(notes.every(note => note.beat === 32 && note.chord === 'Fmaj9'));
  for (const time of [20.1, 20, -1, NaN, Infinity]) assert.deepEqual(composer.step(frame(time)), []);
});

test('all note values and recording bounds remain valid across a full performance and MIDI export', () => {
  const composer = new AmbientComposer();
  composer.prime(frame(0));
  const flies = [fly({ x: 100, y: -100, height: 100, speed: Infinity, activity: [NaN, 200], hunger: -100 })];
  run(composer, MAX_BEATS * 60 / TEMPO, flies);
  assert.equal(composer.complete, true);
  for (const note of composer.notes) {
    assert.ok(Number.isInteger(note.pitch) && note.pitch >= 48 && note.pitch <= 71);
    assert.ok(Number.isInteger(note.velocity) && note.velocity >= 1 && note.velocity <= 100);
    assert.ok(note.duration >= 0.1 && note.duration <= 3);
    assert.ok(note.beat + note.duration * TEMPO / 60 <= MAX_BEATS + 1e-9);
  }
  assert.ok(composer.notes.length < MAX_NOTES);
  const midi = composer.midiFile();
  assert.equal(midi.toString('ascii', 0, 4), 'MThd');
  assert.equal(midi.readUInt32BE(18), midi.length - 22);
  assert.ok(midi.includes(Buffer.from([0x90, composer.notes[0].pitch, composer.notes[0].velocity])));
  assert.deepEqual([...midi.subarray(-4)], [0, 255, 47, 0]);
  const full = new AmbientComposer();
  full.notes = Array.from({ length: MAX_NOTES }, (_, id) => ({ id }));
  assert.deepEqual(full.step(frame(0)), []);
  assert.equal(full.complete, true);
});

test('deterministic swarm observation produces pad and fruit voices without changing animal state', () => {
  const garden = new FlyGarden(), control = new FlyGarden(), composer = new AmbientComposer();
  composer.prime(garden.snapshot());
  for (let tick = 0; tick < 200; tick++) {
    const state = garden.step(50), untouched = control.step(50);
    composer.step(state);
    assert.deepEqual(state, untouched);
  }
  assert.ok(composer.notes.some(note => note.voice === 'pad'));
  assert.ok(composer.notes.some(note => note.voice === 'bell'));
  assert.ok(composer.notes.filter(note => note.voice === 'bell').every(note => note.pitch >= 72 && note.pitch <= 84));
  const first = composer.snapshot(), midi = composer.midiFile();
  garden.reset(); composer.reset(); composer.prime(garden.snapshot());
  for (let tick = 0; tick < 200; tick++) composer.step(garden.step(50));
  assert.deepEqual(composer.snapshot(), first);
  assert.deepEqual(composer.midiFile(), midi);
});
