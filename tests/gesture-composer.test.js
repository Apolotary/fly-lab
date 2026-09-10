import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureComposer, encodeMidi, MAX_BEATS } from '../src/gesture-composer.js';
const world = (overrides = {}) => ({ time: 1.25, x: .3, y: .3, height: .4, speed: .08, turnRate: 0, landingCount: 0, behavior: 'seeking', ...overrides });

test('movement changes pitch and velocity; stillness produces rests', () => {
  const low = new GestureComposer().step(world({ x: .1, speed: .02 }));
  const high = new GestureComposer().step(world({ x: .8, speed: .11 }));
  assert.ok(high[0].pitch > low[0].pitch);
  assert.ok(high[0].velocity > low[0].velocity);
  assert.deepEqual(new GestureComposer().step(world({ speed: 0 })), []);
});
test('gestures produce bounded quantized notes once per time slot and a chord on landing', () => {
  const composer = new GestureComposer();
  composer.step(world());
  assert.deepEqual(composer.step(world()), []);
  const chord = composer.step(world({ time: 2, speed: 0, landingCount: 1, behavior: 'feeding' }));
  assert.equal(chord.length, 3);
  assert.ok(chord.every(n => n.reason === 'Landing chord' && n.pitch >= 48 && n.pitch <= 84));
  assert.ok(chord.every(n => n.beat * 2 === Math.floor(n.beat * 2)));
  composer.step(world({ time: MAX_BEATS * 60 / 96 }));
  assert.equal(composer.complete, true);
});
test('MIDI export is a standard file with tempo, note-on, note-off and track ending', () => {
  const bytes = encodeMidi([{ beat: 0, pitch: 60, velocity: 70, duration: .5 }]);
  assert.equal(bytes.toString('ascii', 0, 4), 'MThd');
  assert.equal(bytes.readUInt16BE(12), 480);
  assert.equal(bytes.toString('ascii', 14, 18), 'MTrk');
  assert.equal(bytes.readUInt32BE(18), bytes.length - 22);
  assert.ok(bytes.includes(Buffer.from([0x90, 60, 70])));
  assert.ok(bytes.includes(Buffer.from([0x80, 60, 0])));
  assert.deepEqual(bytes.subarray(-4), Buffer.from([0, 0xff, 0x2f, 0]));
});
