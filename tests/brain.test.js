import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FlyBrain, VOICES } from '../src/brain.js';
import { LocomotorSim, validateLocomotorCircuit } from '../src/vendor/desktop-fly/locomotor.js';

const dataBytes = readFileSync(new URL('../data/locomotor_circuit.json', import.meta.url));
const circuit = JSON.parse(dataBytes);
const run = (brain, ms = 5000, tick = 50) => {
  for (let i = 0; i < ms / tick; i++) brain.step(tick);
  return brain.snapshot();
};

test('bundled measured graph retains the pinned upstream data and valid anatomy', () => {
  assert.equal(createHash('sha256').update(dataBytes).digest('hex'),
    '8f76d94034dcf802453e3a0a8ed5342d122e57d37e2bb5ea28da66de0856f5d6');
  assert.equal(validateLocomotorCircuit(circuit), true);
  assert.equal(circuit.neurons.length, 1045);
  assert.equal(circuit.edges.length, 17224);
  assert.equal(circuit.rawSynapseCounts.reduce((a, b) => a + b, 0), 708689);
  assert.deepEqual(VOICES, ['LF', 'LM', 'LH', 'RF', 'RM', 'RH']);
});

test('seed, fixed neural steps and reset reproduce the same motor trajectory', () => {
  const a = new FlyBrain({ seed: 14 });
  const b = new FlyBrain({ seed: 14 });
  const first = run(a, 5000, 50);
  assert.deepEqual(first, run(b, 5000, 20));
  a.reset();
  assert.deepEqual(first, run(a));
  assert.notDeepEqual(first.activity, run(new FlyBrain({ seed: 15 })).activity);
});

test('motor activity depends on measured synaptic propagation', () => {
  const intact = new LocomotorSim(circuit);
  const disconnected = new LocomotorSim(circuit);
  disconnected.synapsesEnabled = false;
  for (const sim of [intact, disconnected]) {
    for (const side of ['left', 'right']) sim.setDescending('DNp09', side, 40);
    sim.step(3000);
  }
  assert.ok(intact.motorSpikes > 1000, 'intact measured paths should drive motor cells');
  assert.equal(disconnected.motorSpikes, 0, 'without synapses the same DN input cannot drive motor cells');
});

test('default stimulation creates changing motor outputs; controls change the circuit response', () => {
  const active = new FlyBrain();
  const quiet = new FlyBrain();
  const turning = new FlyBrain();
  quiet.setStimulus({ drive: 0 });
  turning.setStimulus({ turn: 1 });
  const before = run(active, 3000);
  const after = run(active, 3000);
  const silent = run(quiet, 6000);
  const turned = run(turning, 6000);
  assert.ok(after.spikes > 1000);
  assert.ok(after.activity.every((value) => value > 0));
  assert.notDeepEqual(before.activity, after.activity);
  assert.notDeepEqual(after.activity, turned.activity);
  assert.equal(silent.spikes, 0);
  assert.ok(silent.activity.every((value) => value === 0));
});

test('long-running controls, display signals and arena positions stay finite and bounded', () => {
  const brain = new FlyBrain();
  brain.setStimulus({ drive: 99, turn: -99 });
  assert.equal(brain.snapshot().drive, 1);
  assert.equal(brain.snapshot().turn, -1);
  for (let tick = 0; tick < 1200; tick++) {
    const state = brain.step(50);
    assert.equal(state.activity.length, 6);
    assert.equal(state.nodes.length, 64);
    for (const value of [...state.activity, ...state.nodes, state.x, state.y]) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    assert.ok(state.heading >= 0 && state.heading < Math.PI * 2);
  }
  const state = brain.snapshot();
  state.activity.fill(NaN);
  assert.ok(brain.snapshot().activity.every(Number.isFinite));
  assert.throws(() => brain.step(Infinity), RangeError);
  assert.throws(() => brain.step(-1), RangeError);
  assert.throws(() => brain.step(1001), RangeError);
  assert.throws(() => brain.setStimulus({ turn: NaN }), TypeError);
});
