import test from 'node:test';
import assert from 'node:assert/strict';
import { FlyGarden } from '../src/garden.js';
import { FlyWorld } from '../src/world.js';

function run(garden, ms, dt = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += dt) garden.step(dt);
  return garden.snapshot();
}

function mockBrain(motor = 0.2) {
  return {
    reset() { this.time = 0; },
    setStimulus() {},
    step(ms) { this.time += ms / 1000; },
    snapshot() { return { time: this.time, activity: Array(6).fill(motor), nodes: [motor] }; },
  };
}

function cheapGarden(motor = 0.2) {
  return new FlyGarden({ worlds: [1, 2, 3].map((seed) =>
    new FlyWorld({ seed, brain: mockBrain(motor), walkingIntervals: true })) });
}

test('three measured circuits independently move bounded flies; neural view selects only fly one', () => {
  const garden = new FlyGarden();
  assert.equal(new Set(garden.worlds.map((world) => world.brain.sim)).size, 3);
  const state = run(garden, 2000);
  assert.deepEqual(state.flies.map((fly) => fly.id), ['fly-1', 'fly-2', 'fly-3']);
  assert.equal(state.selectedFlyId, 'fly-1');
  assert.equal(state.nodes.length, 1045);
  for (const fly of state.flies) {
    assert.ok(fly.activity.some((value) => value > 0));
    assert.ok(fly.distanceTravelled > 0);
    assert.equal(fly.time, 2);
    assert.equal(fly.nodes, undefined, 'large neural arrays are not repeated');
    for (const value of [fly.x, fly.y, fly.height, fly.hunger]) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
  }
  assert.notDeepEqual(state.flies[0].activity, state.flies[1].activity);
});

test('garden reset and different frame batches reproduce all three worlds and shared food', () => {
  const a = new FlyGarden({ seed: 19 }), b = new FlyGarden({ seed: 19 });
  const first = run(a, 3000);
  assert.deepEqual(first, run(b, 3000, 20));
  a.reset();
  assert.deepEqual(first, run(a, 3000));
});

test('feeding consumes one shared canonical supply without copies or negative fruit', () => {
  const garden = cheapGarden();
  garden.clearFruit();
  const fruit = garden.addFruit({ x: 0.5, y: 0.5, kind: 'grape' });
  for (const world of garden.worlds) {
    assert.equal(world.fruits, garden.fruits);
    world.x = world.y = 0.5;
    world.behavior = 'feeding';
    world.feedingId = fruit.id;
  }
  garden.step();
  assert.ok(Math.abs(garden.snapshot().fruits[0].amount - (1 - 3 * 0.05 * 0.32)) < 1e-12);
  run(garden, 1200);
  assert.deepEqual(garden.snapshot().fruits, []);
  assert.ok(garden.worlds.every((world) => world.fruits === garden.fruits));
  assert.ok(garden.worlds.every((world) => world.behavior !== 'feeding'));
});

test('adding and clearing fruit propagates, remains detached and shares the six-fruit cap', () => {
  const garden = cheapGarden();
  garden.clearFruit();
  for (let index = 0; index < 6; index++) garden.addFruit({ x: index / 6, y: 0.5 });
  assert.throws(() => garden.addFruit({ x: 0.5, y: 0.5 }), /six fruits/);
  const snapshot = garden.snapshot();
  snapshot.fruits[0].amount = -100;
  assert.equal(garden.snapshot().fruits[0].amount, 1);
  garden.clearFruit();
  assert.ok(garden.worlds.every((world) => world.fruits.length === 0));
  assert.ok(garden.snapshot().flies.every((fly) => fly.behavior === 'exploring'));
});

test('silencing all three measured graphs prevents all body motion', () => {
  const garden = new FlyGarden();
  for (const world of garden.worlds) world.brain.sim.synapsesEnabled = false;
  const before = garden.snapshot().flies;
  const after = run(garden, 2000).flies;
  after.forEach((fly, index) => {
    for (const field of ['x', 'y', 'heading', 'height', 'distanceTravelled']) {
      assert.equal(fly[field], before[index][field]);
    }
    assert.equal(fly.speed, 0);
    assert.ok(fly.activity.every((value) => value === 0));
  });
});

test('walking and flying bouts occur with no fruit or musical feedback', () => {
  const garden = cheapGarden();
  garden.clearFruit();
  const gaits = garden.worlds.map(() => new Set());
  let lowMotion = 0, highMotion = 0;
  for (let elapsed = 0; elapsed < 20000; elapsed += 50) {
    const state = garden.step();
    state.flies.forEach((fly, index) => {
      gaits[index].add(fly.gait);
      if (fly.height <= 0.08 && fly.speed > 0) lowMotion++;
      if (fly.height > 0.12 && fly.speed > 0) highMotion++;
    });
  }
  for (const gait of gaits) assert.deepEqual(gait, new Set(['walking', 'flying']));
  assert.ok(lowMotion > 100 && highMotion > 100);
});

test('garden validates frame times, seeds and independent injected worlds', () => {
  assert.throws(() => new FlyGarden({ seed: NaN }), /finite/);
  assert.throws(() => new FlyGarden({ worlds: [] }), /one to twelve/);
  const world = new FlyWorld({ brain: mockBrain() });
  assert.throws(() => new FlyGarden({ worlds: [world, world, world] }), /independent/);
  const garden = cheapGarden();
  for (const dt of [NaN, -1, 1001, Infinity]) assert.throws(() => garden.step(dt), RangeError);
  assert.throws(() => garden.setStimulus({ drive: NaN }), /finite/);
  garden.setStimulus({ drive: 0.15 });
  assert.ok(garden.worlds.every((world) => world.driveOverride === 0.15));
});

test('one to twelve flies have independent measured graphs and compact detached snapshots', () => {
  const garden = new FlyGarden({ count: 12, seed: 19 });
  assert.equal(new Set(garden.worlds.map(world => world.brain.sim)).size, 12);
  const original = new FlyGarden({ seed: 19 });
  assert.deepEqual(garden.snapshot().flies.slice(0, 3), original.snapshot().flies);
  const state = run(garden, 1000);
  assert.equal(state.flyCount, 12);
  assert.equal(state.flies.length, 12);
  assert.equal(state.nodes.length, 1045);
  assert.ok(state.flies.every(fly => fly.distanceTravelled > 0 && fly.nodes === undefined));
  assert.equal(new Set(state.flies.map(fly => JSON.stringify(fly.activity))).size, 12);
  const expectedFlies = structuredClone(state.flies);
  state.flies[4].activity.fill(-100);
  assert.ok(garden.snapshot().flies[4].activity.every(value => value >= 0));
  garden.reset();
  assert.deepEqual(run(garden, 1000).flies, expectedFlies);
  assert.equal(new FlyGarden({ count: 1 }).snapshot().flyCount, 1);
});

test('garden rejects invalid counts and separately wrapped worlds sharing one brain', () => {
  for (const count of [0, 13, 1.5, NaN, Infinity, null, '3']) assert.throws(() => new FlyGarden({ count }), /integer between 1 and 12/);
  const brain = mockBrain();
  const worlds = [1, 2].map(seed => new FlyWorld({ seed, brain }));
  assert.throws(() => new FlyGarden({ worlds }), /independent world and motor circuit/);
  assert.throws(() => new FlyGarden({ worlds: [worlds[0]], count: 2 }), /match/);
});

test('energy propagates to every independent fly and remains a reversible body setting', () => {
  const garden = cheapGarden();
  const original = garden.snapshot();
  assert.equal(original.energy, 'calm');
  const brains = garden.worlds.map(world => world.brain);
  for (const [energy, gain] of [['lively', 1.65], ['wild', 2.25], ['calm', 1]]) {
    const state = garden.setEnergy(energy);
    assert.equal(state.energy, energy);
    assert.equal(state.motionGain, gain);
    assert.ok(state.flies.every(fly => fly.energy === energy && fly.motionGain === gain));
    assert.deepEqual(garden.worlds.map(world => world.brain), brains);
    assert.equal(state.time, original.time);
  }
  const unchanged = garden.snapshot();
  for (const energy of ['fast', '', null, 2, {}, ['wild']]) {
    assert.throws(() => garden.setEnergy(energy), /calm, lively or wild/);
    assert.throws(() => new FlyGarden({ energy }), /calm, lively or wild/);
    assert.deepEqual(garden.snapshot(), unchanged);
  }
  garden.setEnergy('wild');
  garden.reset();
  assert.ok(garden.snapshot().flies.every(fly => fly.energy === 'wild'));
  const stopped = cheapGarden(0);
  stopped.setEnergy('wild');
  assert.ok(run(stopped, 3000).flies.every(fly => fly.speed === 0 && fly.distanceTravelled === 0));
});

test('fruit refresh replaces the shared supply without resetting brains, travel or visits', () => {
  const garden = new FlyGarden({ count: 3, energy: 'lively' });
  run(garden, 1500);
  const before = garden.snapshot();
  const neural = garden.worlds.map(world => world.brain.snapshot());
  const circuits = garden.worlds.map(world => world.brain.sim);
  for (let index = 0; index < 3; index++) garden.addFruit({ x: 0.3 + index * 0.2, y: 0.4 });
  garden.fruits[0].amount = 0.01;
  const previousIds = new Set(garden.fruits.map(fruit => fruit.id));
  const refreshed = garden.refreshFruit();
  assert.deepEqual(refreshed.fruits.map(fruit => fruit.kind), ['banana', 'apple', 'grape']);
  assert.ok(refreshed.fruits.every(fruit => fruit.amount === 1 && !previousIds.has(fruit.id)));
  assert.ok(garden.worlds.every(world => world.fruits === garden.fruits));
  assert.deepEqual(garden.worlds.map(world => world.brain.sim), circuits);
  assert.deepEqual(garden.worlds.map(world => world.brain.snapshot()), neural);
  refreshed.flies.forEach((fly, index) => {
    for (const key of ['x', 'y', 'heading', 'time', 'distanceTravelled', 'visits']) assert.equal(fly[key], before.flies[index][key]);
  });
  for (let index = 0; index < 3; index++) garden.addFruit({ x: 0.2 + index * 0.2, y: 0.8 });
  assert.throws(() => garden.addFruit({ x: 0.5, y: 0.5 }), /six fruits/);
});

test('refresh layouts vary, remain spread out and replay deterministically from the garden seed', () => {
  const a = cheapGarden(), b = cheapGarden();
  const layouts = new Set();
  for (let index = 0; index < 3; index++) {
    const fruits = a.refreshFruit().fruits;
    assert.deepEqual(fruits, b.refreshFruit().fruits);
    layouts.add(JSON.stringify(fruits.map(({ x, y }) => [x, y])));
    for (const fruit of fruits) assert.ok(fruit.x >= 0.06 && fruit.x <= 0.94 && fruit.y >= 0.06 && fruit.y <= 0.94);
    for (let left = 0; left < fruits.length; left++) {
      for (let right = left + 1; right < fruits.length; right++) {
        assert.ok(Math.hypot(fruits[left].x - fruits[right].x, fruits[left].y - fruits[right].y) > 0.3);
      }
    }
  }
  assert.equal(layouts.size, 3);
  a.reset(); b.reset();
  assert.deepEqual(a.refreshFruit().fruits, b.refreshFruit().fruits);
  const otherSeed = new FlyGarden({ seed: 1338, worlds: [new FlyWorld({ brain: mockBrain() })] });
  assert.notDeepEqual(a.snapshot().fruits.map(({ x, y }) => [x, y]), otherSeed.refreshFruit().fruits.map(({ x, y }) => [x, y]));
});
