import test from 'node:test';
import assert from 'node:assert/strict';
import { TombolaComposer, TOMBOLA_SCALES } from '../src/tombola-instrument.js';
import { TEMPO, MAX_BEATS, MAX_NOTES } from '../src/midi-file.js';

const hit = (id, changes = {}) => ({ id, flyId: 'fly-1', wall: 0, x: 0.85, y: 0.5,
  impact: 0.5, time: 0.15, ...changes });
const frame = (time, collisions = []) => ({ time,
  flies: Array.from({ length: 12 }, (_, index) => ({ id: `fly-${index + 1}` })),
  tombola: { collisions } });

test('stationary or free-flying frames are silent; only a new positive-impact hit makes music', () => {
  const composer = new TombolaComposer();
  composer.prime(frame(0));
  for (let time = 0; time <= 20; time += 0.1) assert.deepEqual(composer.step(frame(time)), []);
  assert.deepEqual(composer.step(frame(21, [hit(1, { impact: 0 })])), []);
  const notes = composer.step(frame(21.25, [hit(2)]));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].instrumentMode, 'tombola');
  assert.equal(notes[0].voice, 'collision');
  assert.equal(notes[0].authored, false);
  assert.equal(notes[0].flyId, 'fly-1');
  assert.equal(notes[0].collisionId, 2);
  assert.equal(notes[0].wall, 0);
  assert.equal(notes[0].pitchName, 'C4');
  assert.equal(notes[0].channel, 0);
  assert.deepEqual(composer.step(frame(22)), []);
});

test('collision IDs are consumed exactly once, including prime, reordered snapshots and discarded duplicates', () => {
  const composer = new TombolaComposer();
  composer.prime(frame(0, [hit(3)]));
  assert.deepEqual(composer.step(frame(0.1, [hit(1), hit(2), hit(3)])), []);
  assert.equal(composer.step(frame(0.2, [hit(5), hit(4, { flyId: 'fly-2' })])).length, 2);
  assert.deepEqual(composer.step(frame(0.3, [hit(4), hit(5), hit(5)])), []);
  const notes = composer.notes;
  composer.prime(frame(0.4, [hit(6)]));
  assert.equal(composer.notes, notes);
  assert.deepEqual(composer.step(frame(0.5, [hit(6)])), []);
  assert.equal(composer.step(frame(0.6, [hit(7)])).length, 1);
});

test('flies retain assigned scale notes through reordering, disappearance and scale edits', () => {
  const composer = new TombolaComposer();
  composer.prime(frame(0));
  const first = composer.step(frame(0.3, [hit(1, { flyId: 'fly-3' })]))[0];
  assert.equal(first.pitch, 64);
  const notes = composer.notes;
  assert.equal(composer.setScale('minor'), 'minor');
  assert.equal(composer.notes, notes);
  assert.equal(first.pitch, 64, 'changing scales cannot rewrite the recording');
  assert.deepEqual(composer.step(frame(0.4, [hit(1)])), []);
  const later = composer.step({ ...frame(0.9, [hit(2, { flyId: 'fly-3' })]), flies: [] })[0];
  assert.equal(later.pitch, 63);
  assert.equal(later.pitchName, 'E♭4');
  composer.setScale('major');
  const all = composer.step(frame(2, Array.from({ length: 12 }, (_, index) =>
    hit(index + 3, { flyId: `fly-${12 - index}` }))));
  assert.deepEqual(all.map(note => note.pitch), [...TOMBOLA_SCALES.major].reverse());
  assert.ok(Object.values(TOMBOLA_SCALES).flat().every(pitch => Number.isInteger(pitch) && pitch >= 48 && pitch <= 84));
});

test('invalid scales fail atomically and detached snapshots cannot change layout or contacts', () => {
  const composer = new TombolaComposer({ scale: 'minor' });
  composer.step(frame(1, [hit(1)]));
  const before = composer.snapshot();
  for (const value of [undefined, null, '', 'constructor', '__proto__', 3, {}, 'dorian']) {
    assert.throws(() => composer.setScale(value), RangeError);
    assert.deepEqual(composer.snapshot(), before);
  }
  assert.throws(() => new TombolaComposer({ scale: 'dorian' }), RangeError);
  const detached = composer.snapshot();
  detached.layout.pitches[0] = 0;
  detached.layout.noteNames[0] = 'wrong';
  detached.contacts[0].flyId = 'wrong';
  detached.recentNotes[0].pitch = 0;
  assert.deepEqual(composer.snapshot(), before);
});

test('impact maps monotonically to bounded velocity and gate length', () => {
  const composer = new TombolaComposer();
  const notes = [0.001, 0.1, 0.3, 0.6, 1, 20].map((impact, index) =>
    composer.step(frame(index + 1, [hit(index + 1, { impact })]))[0]);
  assert.ok(notes.every(note => Number.isInteger(note.velocity) && note.velocity >= 22 && note.velocity <= 95));
  assert.ok(notes.every(note => note.duration >= 0.3 && note.duration <= 0.8));
  assert.ok(notes.every((note, index) => index === 0 || note.velocity >= notes[index - 1].velocity));
  assert.equal(notes.at(-1).velocity, 95);
  assert.equal(notes.at(-1).duration, 0.8);
});

test('each fly emits at most once per tiny collision bucket, without quantizing attack timestamps', () => {
  const composer = new TombolaComposer();
  const time = 0.217;
  const created = composer.step(frame(time, [hit(1), hit(2), hit(3, { flyId: 'fly-2' })]));
  assert.equal(created.length, 2);
  assert.equal(created[0].beat, time * TEMPO / 60);
  assert.equal(created[0].time, time);
  assert.equal(created[0].sourceTime, 0.15);
  assert.notEqual(created[0].beat * 16, Math.round(created[0].beat * 16));
  assert.deepEqual(composer.step(frame(time + 0.001, [hit(4)])), []);
  assert.deepEqual(composer.step(frame(time + 0.1, [hit(4)])), [], 'debounced ID was still consumed');
  assert.equal(composer.step(frame(time + 0.2, [hit(5)])).length, 1);
});

test('malformed collisions and invalid or backwards times cannot make ghost notes', () => {
  const composer = new TombolaComposer();
  const bad = [null, hit(0), hit(-1), hit(1.5), hit('1'), hit(1, { x: NaN }),
    hit(2, { impact: Infinity }), hit(3, { impact: -1 }), hit(4, { flyId: '' }),
    hit(5, { wall: null }), hit(6, { y: Infinity })];
  assert.deepEqual(composer.step(frame(1, bad)), []);
  assert.deepEqual(composer.step(frame(2, [hit(1), hit(2), hit(3), hit(4), hit(5), hit(6)])), []);
  for (const time of [NaN, -1, Infinity, 1]) assert.deepEqual(composer.step(frame(time, [hit(7)])), []);
  assert.equal(composer.step(frame(3, [hit(7)])).length, 1);
});

test('same-key re-strikes shorten old MIDI gates and reset preserves the chosen scale', () => {
  const composer = new TombolaComposer({ scale: 'major' });
  const previous = composer.step(frame(0.2, [hit(1)]))[0];
  composer.step(frame(0.4, [hit(2)]));
  assert.ok(Math.abs(previous.duration - 0.2) < 1e-12);
  composer.reset();
  assert.equal(composer.snapshot().scale, 'major');
  assert.equal(composer.snapshot().noteCount, 0);
  assert.equal(composer.step(frame(0.1, [hit(1)])).length, 1);
});

test('simultaneous same-key fly contacts share one strongest MIDI gate while both contacts stay visible', () => {
  for (const impacts of [[0.2, 0.9], [0.9, 0.2]]) {
    const composer = new TombolaComposer();
    const collisions = [
      hit(1, { flyId: 'fly-6', impact: impacts[0] }),
      hit(2, { flyId: 'fly-12', impact: impacts[1] }),
    ];
    const created = composer.step(frame(0.5, collisions));
    assert.equal(created.length, 1);
    assert.equal(composer.notes.length, 1);
    assert.equal(created[0], composer.notes[0], 'the emitted object carries the merged velocity and gate');
    assert.equal(created[0].pitch, 72);
    assert.equal(created[0].velocity, Math.round(22 + 0.9 * 73));
    assert.equal(created[0].duration, 0.3 + 0.9 * 0.5);
    assert.deepEqual(composer.snapshot().contacts.map(contact => contact.flyId), ['fly-6', 'fly-12']);
    assert.deepEqual(composer.snapshot().contacts.map(contact => contact.impact), impacts);
    const midi = composer.midiFile();
    const on = Buffer.from([0x90, 72, created[0].velocity]), off = Buffer.from([0x80, 72, 0]);
    assert.ok(midi.indexOf(on) >= 0);
    assert.equal(midi.indexOf(on, midi.indexOf(on) + 1), -1, 'one attack is exported');
    assert.ok(midi.indexOf(off) >= 0);
    assert.equal(midi.indexOf(off, midi.indexOf(off) + 1), -1, 'one release is exported');
    assert.deepEqual(composer.step(frame(0.6, collisions)), [], 'both collision IDs remain consumed');
  }
});

test('recording limits cap duration and note count; exported MIDI includes real attacks and releases', () => {
  const composer = new TombolaComposer();
  composer.step(frame(0.5, [hit(1)]));
  const midi = composer.midiFile();
  assert.equal(midi.toString('ascii', 0, 4), 'MThd');
  assert.equal(midi.readUInt32BE(18), midi.length - 22);
  assert.ok(midi.includes(Buffer.from([0x90, 60, composer.notes[0].velocity])));
  assert.ok(midi.includes(Buffer.from([0x80, 60, 0])));
  assert.deepEqual(composer.step(frame(MAX_BEATS * 60 / TEMPO, [hit(2)])), []);
  assert.equal(composer.complete, true);
  const full = new TombolaComposer();
  full.notes = Array.from({ length: MAX_NOTES - 1 }, (_, index) => ({ id: index + 1, pitch: 48, beat: 0, duration: 0.3 }));
  assert.equal(full.step(frame(1, [hit(1), hit(2, { flyId: 'fly-2' })])).length, 1);
  assert.equal(full.notes.length, MAX_NOTES);
  assert.equal(full.complete, true);
  assert.deepEqual(full.step(frame(2, [hit(3)])), []);
});
