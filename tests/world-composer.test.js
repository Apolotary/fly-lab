import test from 'node:test';
import assert from 'node:assert/strict';
import { FlyWorld } from '../src/world.js';
import { GestureComposer } from '../src/gesture-composer.js';

function perform({ x, y, seed = 1337, silence = false }) {
  const world = new FlyWorld({ seed }), composer = new GestureComposer();
  world.clearFruit();
  world.addFruit({ x, y, kind: 'banana' });
  if (silence) world.brain.sim.synapsesEnabled = false;
  for (let elapsed = 0; elapsed < 20000; elapsed += 50) {
    world.step(50);
    composer.step(world.snapshot());
  }
  return { world: world.snapshot(), notes: composer.notes, midi: composer.midiFile() };
}

test('same motor circuit, fruit and seed reproduce the same piano performance and MIDI file', () => {
  const first = perform({ x: .18, y: .25 }), replay = perform({ x: .18, y: .25 });
  assert.ok(first.notes.length > 5);
  assert.ok(first.world.visits >= 1);
  assert.ok(first.notes.some(note => note.reason === 'Landing chord'));
  assert.deepEqual(first.world, replay.world);
  assert.deepEqual(first.notes, replay.notes);
  assert.deepEqual(first.midi, replay.midi);
});

test('moving fruit changes the circuit-driven trajectory and resulting piano notes', () => {
  const left = perform({ x: .18, y: .25 }), right = perform({ x: .82, y: .75 });
  assert.notDeepEqual([left.world.x, left.world.y], [right.world.x, right.world.y]);
  assert.notDeepEqual(left.notes.map(({ pitch, beat }) => [pitch, beat]), right.notes.map(({ pitch, beat }) => [pitch, beat]));
  assert.notDeepEqual(left.midi, right.midi);
});

test('disconnecting measured synapses produces no movement or notes despite fruit being present', () => {
  const result = perform({ x: .18, y: .25, silence: true });
  assert.equal(result.world.distanceTravelled, 0);
  assert.equal(result.world.visits, 0);
  assert.deepEqual(result.notes, []);
  assert.equal(result.midi.toString('ascii', 0, 4), 'MThd');
});
