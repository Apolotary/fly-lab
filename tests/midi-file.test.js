import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeMidi } from '../src/midi-file.js';

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
