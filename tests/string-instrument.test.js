import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_HEIGHT, CONTACT_RADIUS, STRINGS, StringComposer } from '../src/string-instrument.js';
import { TEMPO, MAX_BEATS, MAX_NOTES } from '../src/midi-file.js';

const fly = (changes = {}) => ({ id: 'fly-1', x: 0.5, y: 0.27, height: 0, speed: 0.065, ...changes });
const frame = (time, ...flies) => ({ time, flies });
const sweep = (start, end, time = 0.217) => {
  const composer = new StringComposer();
  composer.step(frame(0, fly(start)));
  return { composer, notes: composer.step(frame(time, fly(end))) };
};

test('six finite strings have fixed pitches and defensively copied presentation data', () => {
  assert.deepEqual(STRINGS.map(string => string.pitch), [48, 55, 60, 64, 67, 72]);
  assert.deepEqual(STRINGS.map(string => string.label), ['C3', 'G3', 'C4', 'E4', 'G4', 'C5']);
  assert.ok(STRINGS.every(string => string.x1 === 0.12 && string.x2 === 0.88));
  assert.equal(CONTACT_HEIGHT, 0.08);
  assert.equal(CONTACT_RADIUS, 0.016);
  const composer = new StringComposer();
  composer.snapshot().strings[0].pitch = 1;
  assert.equal(composer.snapshot().strings[0].pitch, 48);
});

test('stationary flies and spawning on strings remain silent, then leaving and crossing rearms', () => {
  const composer = new StringComposer();
  for (let time = 0; time < 1; time += 0.05) {
    assert.deepEqual(composer.step(frame(time, fly({ y: 0.30, speed: 0 }))), []);
  }
  assert.deepEqual(composer.step(frame(1.2, fly({ y: 0.34 }))), []);
  assert.equal(composer.step(frame(1.4, fly({ y: 0.27 })))[0].pitch, 48);
  const offStrings = new StringComposer();
  for (let time = 0; time < 2; time += 0.1) assert.deepEqual(offStrings.step(frame(time, fly({ y: 0.2, speed: 0 }))), []);
});

test('airborne sweeps are silent and height is checked at the crossing, not only the endpoint', () => {
  assert.equal(sweep({ y: 0.2, height: 0.2 }, { y: 0.8, height: 0.2 }).notes.length, 0);
  // The crossing is still airborne, and the later descent misses the radius.
  assert.equal(sweep({ y: 0.2, height: 0.3 }, { y: 0.36, height: 0 }).notes.length, 0);
  assert.equal(sweep({ y: 0.26, height: 0.1 }, { y: 0.34, height: 0 }).notes.length, 1);
});

test('swept low crossings cannot jump over strings and remain inside finite endpoints', () => {
  const { notes } = sweep({ y: 0.2 }, { y: 0.8 });
  assert.deepEqual(notes.map(note => note.pitch), STRINGS.map(string => string.pitch));
  assert.ok(notes.every(note => note.reason === 'String crossing'));
  assert.ok(notes.every(note => note.beat === 0.217 * TEMPO / 60));
  assert.notEqual(notes[0].beat * 2, Math.round(notes[0].beat * 2), 'contact timing must not snap to eighth notes');
  assert.equal(sweep({ x: 0.1, y: 0.2 }, { x: 0.1, y: 0.8 }).notes.length, 0);
  assert.equal(sweep({ x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }).notes.length, 0);
  assert.equal(sweep({ x: 0.12, y: 0.27 }, { x: 0.12, y: 0.33 }).notes.length, 1);
  assert.equal(sweep({ x: 0.88, y: 0.27 }, { x: 0.88, y: 0.33 }).notes.length, 1);
});

test('landing near a string plucks once; landing far away or merely approaching it does not', () => {
  const composer = new StringComposer();
  composer.step(frame(0, fly({ y: 0.31, height: 0.2 })));
  const notes = composer.step(frame(0.3, fly({ y: 0.31, height: 0, speed: 0 })));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].reason, 'Landing on string');
  assert.equal(notes[0].y, 0.30);
  for (let time = 0.4; time < 1; time += 0.1) assert.deepEqual(composer.step(frame(time, fly({ y: 0.31, height: 0, speed: 0 }))), []);
  assert.equal(sweep({ y: 0.33, height: 0.2 }, { y: 0.33, height: 0 }).notes.length, 0);
  assert.equal(sweep({ y: 0.27 }, { y: 0.29 }).notes.length, 0);
  // The finite segment endpoint participates in the landing-distance test.
  assert.equal(sweep({ x: 0.11, y: 0.30, height: 0.2 }, { x: 0.11, y: 0.30, height: 0 }).notes.length, 1);
  assert.equal(sweep({ x: 0.10, y: 0.30, height: 0.2 }, { x: 0.10, y: 0.30, height: 0 }).notes.length, 0);
});

test('contact hysteresis and cooldown stop boundary chatter without blocking a later re-strike', () => {
  const composer = new StringComposer();
  composer.step(frame(0, fly({ y: 0.27 })));
  assert.equal(composer.step(frame(0.2, fly({ y: 0.305 }))).length, 1);
  for (const [time, y] of [[0.4, 0.295], [0.6, 0.305], [0.8, 0.295]]) {
    assert.equal(composer.step(frame(time, fly({ y }))).length, 0);
  }
  assert.equal(composer.step(frame(1, fly({ y: 0.27 }))).length, 0);
  assert.equal(composer.step(frame(1.2, fly({ y: 0.33 }))).length, 1);
  assert.equal(composer.step(frame(1.25, fly({ y: 0.27 }))).length, 0, 'rapid full recrossing still respects cooldown');
  assert.equal(composer.step(frame(1.4, fly({ y: 0.33 }))).length, 1);
});

test('each fly has independent contacts, with simultaneous identical MIDI pitches coalesced', () => {
  const composer = new StringComposer();
  composer.step(frame(0, fly({ id: 'a', y: 0.27 }), fly({ id: 'b', y: 0.43 }), fly({ id: 'c', y: 0.67 })));
  const notes = composer.step(frame(0.2, fly({ id: 'a', y: 0.33 }), fly({ id: 'b', y: 0.49 }), fly({ id: 'c', y: 0.73 })));
  assert.deepEqual(notes.map(note => note.flyId), ['a', 'b', 'c']);
  assert.deepEqual(notes.map(note => note.pitch), [48, 60, 72]);
  const together = new StringComposer();
  together.step(frame(0, fly({ id: 'a', speed: 0.01 }), fly({ id: 'b', speed: 0.13 })));
  const shared = together.step(frame(0.2, fly({ id: 'a', y: 0.33, speed: 0.01 }), fly({ id: 'b', y: 0.33, speed: 0.13 })));
  assert.equal(shared.length, 1);
  assert.equal(shared[0].velocity, 90);
  assert.equal(together.snapshot().contacts.length, 2);
});

test('speed affects strength, all MIDI values remain bounded, and re-strikes release prior notes', () => {
  const slow = sweep({}, { y: 0.33, speed: 0.01 }).notes[0];
  const fast = sweep({}, { y: 0.33, speed: 100 }).notes[0];
  assert.ok(slow.velocity < fast.velocity);
  assert.equal(fast.velocity, 90);
  const composer = new StringComposer();
  composer.step(frame(0, fly()));
  composer.step(frame(0.2, fly({ y: 0.33 })));
  composer.step(frame(0.4, fly({ y: 0.27 })));
  assert.ok(Math.abs(composer.notes[0].duration - 0.2) < 1e-12);
  assert.ok(composer.notes.at(-1).duration >= 0.7 && composer.notes.at(-1).duration <= 1.6);
});

test('reset and replay are deterministic, single-fly snapshots work, and duplicate frames stay silent', () => {
  const composer = new StringComposer();
  const replay = () => {
    composer.step({ ...fly(), time: 0 });
    composer.step({ ...fly({ y: 0.33 }), time: 0.2 });
    assert.deepEqual(composer.step({ ...fly({ y: 0.27 }), time: 0.2 }), []);
    composer.step({ ...fly({ y: 0.27 }), time: 0.4 });
    return composer.snapshot();
  };
  const first = replay();
  composer.reset();
  assert.equal(composer.snapshot().noteCount, 0);
  assert.deepEqual(replay(), first);
  composer.step(frame(0.5));
  assert.deepEqual(composer.step(frame(0.6, fly({ y: 0.33 }))), [], 'reintroduced flies establish a fresh baseline');
});

test('recording limits end the piece and exported SMF retains note attacks and releases', () => {
  const { composer } = sweep({ y: 0.2 }, { y: 0.8 });
  const midi = composer.midiFile();
  assert.equal(midi.toString('ascii', 0, 4), 'MThd');
  assert.equal(midi.toString('ascii', 14, 18), 'MTrk');
  assert.equal(midi.readUInt32BE(18), midi.length - 22);
  for (const string of STRINGS) {
    assert.ok(midi.includes(Buffer.from([0x90, string.pitch, 64])));
    assert.ok(midi.includes(Buffer.from([0x80, string.pitch, 0])));
  }
  assert.deepEqual([...midi.subarray(-4)], [0, 255, 47, 0]);
  assert.deepEqual(composer.step(frame(MAX_BEATS * 60 / TEMPO, fly({ y: 0.2 }))), []);
  assert.equal(composer.snapshot().complete, true);
  const full = new StringComposer();
  full.notes = Array.from({ length: MAX_NOTES }, (_, id) => ({ id }));
  assert.deepEqual(full.step(frame(0, fly())), []);
  assert.equal(full.snapshot().complete, true);
});
