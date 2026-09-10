import test from 'node:test';
import assert from 'node:assert/strict';
import { FlyGarden } from '../src/garden.js';
import { StringComposer } from '../src/string-instrument.js';

function perform({ x, y, seed = 1337, silence = false }) {
  const world = new FlyGarden({ seed }), composer = new StringComposer();
  world.clearFruit();
  world.addFruit({ x, y, kind: 'banana' });
  if (silence) for (const fly of world.worlds) fly.brain.sim.synapsesEnabled = false;
  for (let elapsed = 0; elapsed < 20000; elapsed += 50) {
    world.step(50);
    composer.step(world.snapshot());
  }
  return { world: world.snapshot(), notes: composer.notes, midi: composer.midiFile() };
}

test('same motor circuit, fruit and seed reproduce the same string performance and MIDI file', () => {
  const first = perform({ x: .18, y: .25 }), replay = perform({ x: .18, y: .25 });
  assert.ok(first.notes.length > 0);
  assert.ok(first.world.flies.some(fly => fly.visits >= 1));
  assert.ok(first.notes.every(note => note.stringId && note.flyId));
  assert.deepEqual(first.world, replay.world);
  assert.deepEqual(first.notes, replay.notes);
  assert.deepEqual(first.midi, replay.midi);
});

test('moving fruit changes the circuit-driven trajectory and resulting string notes', () => {
  const left = perform({ x: .18, y: .25 }), right = perform({ x: .82, y: .75 });
  assert.notDeepEqual([left.world.x, left.world.y], [right.world.x, right.world.y]);
  assert.notDeepEqual(left.notes.map(({ pitch, beat }) => [pitch, beat]), right.notes.map(({ pitch, beat }) => [pitch, beat]));
  assert.notDeepEqual(left.midi, right.midi);
});

test('disconnecting measured synapses produces no movement or notes despite fruit being present', () => {
  const result = perform({ x: .18, y: .25, silence: true });
  assert.ok(result.world.flies.every(fly => fly.distanceTravelled === 0));
  assert.equal(result.world.visits, 0);
  assert.deepEqual(result.notes, []);
  assert.equal(result.midi.toString('ascii', 0, 4), 'MThd');
});
