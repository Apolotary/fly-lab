import test from 'node:test';
import assert from 'node:assert/strict';
import { FlyWorld } from '../src/world.js';

function run(world, ms, step = 50) {
  for (let time = 0; time < ms; time += step) world.step(step);
  return world.snapshot();
}

function mockBrain(motor = 0) {
  return {
    reset() { this.time = 0; this.stimulus = { drive: 0, turn: 0 }; },
    setStimulus(update) { this.stimulus = { ...this.stimulus, ...update }; },
    step(ms) { this.time += ms / 1000; },
    snapshot() {
      return { time: this.time, activity: Array(6).fill(motor), nodes: [0.2],
        x: 0.99, y: 0.01, heading: 999, ...this.stimulus };
    },
  };
}

test('world seed, reset and fixed steps reproduce identical body and neural state', () => {
  const a = new FlyWorld({ seed: 81 });
  const b = new FlyWorld({ seed: 81 });
  const first = run(a, 6000);
  assert.deepEqual(first, run(b, 6000, 20));
  a.reset();
  assert.deepEqual(first, run(a, 6000));
  assert.notEqual(first.heading, run(new FlyWorld({ seed: 82 }), 6000).heading);
});

test('food placement changes movement and the fly reaches, lands and consumes food', () => {
  const left = new FlyWorld(), right = new FlyWorld();
  left.clearFruit(); right.clearFruit();
  left.addFruit({ x: 0.18, y: 0.25 });
  right.addFruit({ x: 0.82, y: 0.75 });
  const leftFirst = run(left, 7000), rightFirst = run(right, 7000);
  assert.ok(leftFirst.x < 0.4 && rightFirst.x > 0.6, 'sensing changes direction toward the chosen fruit');
  assert.notDeepEqual(leftFirst.activity, rightFirst.activity, 'heading perception also changes descending neural input');
  const states = [run(left, 13000), run(right, 13000)];
  for (const state of states) {
    assert.ok(state.visits >= 1, 'reaches food within twenty seconds');
    assert.ok(state.landingCount >= 1, 'landed before feeding');
    assert.ok(state.fruits[0].amount < 1, 'consumed the fruit');
    assert.ok(state.hunger < 0.4, 'feeding reduces toy hunger');
    assert.ok(state.distanceTravelled > 0.2);
  }
});

test('six different measured-circuit seeds find food within forty seconds', () => {
  for (const seed of [1337, 1, 2, 3, 42, 99]) {
    const world = new FlyWorld({ seed });
    let state;
    for (let elapsed = 0; elapsed < 40000; elapsed += 50) {
      state = world.step();
      if (state.visits) break;
    }
    assert.ok(state.visits >= 1, `seed ${seed} reaches a fruit`);
  }
});

test('zero motor output and disconnected measured synapses cannot move the body', () => {
  for (const world of [new FlyWorld({ brain: mockBrain(0) }), new FlyWorld()]) {
    if (world.brain.sim) world.brain.sim.synapsesEnabled = false;
    const initial = world.snapshot();
    const state = run(world, 10000);
    assert.equal(state.x, initial.x);
    assert.equal(state.y, initial.y);
    assert.equal(state.heading, initial.heading);
    assert.equal(state.height, 0);
    assert.equal(state.speed, 0);
    assert.equal(state.turnRate, 0);
    assert.equal(state.distanceTravelled, 0);
    assert.equal(state.visits, 0);
    assert.ok(state.activity.every((value) => value === 0));
  }
});

test('reported position integrates motor velocity and replaces the brain cosmetic coordinates', () => {
  const world = new FlyWorld({ brain: mockBrain(0.2) });
  const before = world.snapshot();
  const after = world.step();
  assert.ok(Math.abs(after.speed - 0.2 * 0.34) < 1e-12);
  assert.ok(Math.abs(after.x - (before.x + Math.cos(after.heading) * after.speed * 0.05)) < 1e-12);
  assert.ok(Math.abs(after.y - (before.y + Math.sin(after.heading) * after.speed * 0.05)) < 1e-12);
  assert.equal(after.x, world.x);
  assert.equal(after.y, world.y);
  assert.notEqual(after.x, world.brain.snapshot().x);
  assert.deepEqual(after.nodes, [0.2]);
  assert.ok(after.height > 0);
});

test('long running positions, height, food and behavioral states stay bounded', () => {
  const world = new FlyWorld({ seed: 12 });
  const behaviors = new Set(['exploring', 'seeking', 'feeding', 'resting']);
  let previousDistance = 0;
  for (let step = 0; step < 1600; step++) {
    const state = world.step();
    for (const value of [state.x, state.y, state.height, state.hunger]) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    assert.ok(state.heading >= 0 && state.heading < Math.PI * 2);
    assert.ok(Number.isFinite(state.speed) && state.speed >= 0 && state.speed <= 0.34);
    assert.ok(Number.isFinite(state.turnRate));
    assert.ok(behaviors.has(state.behavior));
    assert.ok(state.distanceTravelled >= previousDistance);
    previousDistance = state.distanceTravelled;
    assert.ok(state.fruits.every((fruit) => fruit.amount > 0 && fruit.amount <= 1));
  }
});

test('all fruit kinds have the same attraction; fruit state is detached and capped', () => {
  const banana = new FlyWorld(), apple = new FlyWorld(), grape = new FlyWorld();
  banana.clearFruit(); apple.clearFruit(); grape.clearFruit();
  banana.addFruit({ x: 0.2, y: 0.25, kind: 'banana' });
  apple.addFruit({ x: 0.2, y: 0.25, kind: 'apple' });
  grape.addFruit({ x: 0.2, y: 0.25, kind: 'grape' });
  const a = run(banana, 6000), b = run(apple, 6000);
  const g = run(grape, 6000);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.deepEqual(a.activity, b.activity);
  assert.equal(a.x, g.x);
  assert.equal(a.y, g.y);
  assert.deepEqual(a.activity, g.activity);
  for (let i = 0; i < 5; i++) banana.addFruit({ x: i / 5, y: i / 5 });
  assert.equal(banana.snapshot().fruits.length, 6);
  assert.throws(() => banana.addFruit({ x: 0.5, y: 0.5 }), /six fruits/);
  const detached = banana.snapshot();
  detached.fruits[0].amount = -100;
  detached.fruits[1].x = NaN;
  assert.ok(banana.snapshot().fruits.every((fruit) => fruit.amount > 0 && Number.isFinite(fruit.x)));
  banana.clearFruit();
  assert.deepEqual(banana.snapshot().fruits, []);
  assert.equal(banana.snapshot().behavior, 'exploring');
});

test('invalid world inputs are rejected and automatic drive can resume after zero drive', () => {
  assert.throws(() => new FlyWorld({ seed: NaN }), /finite/);
  const world = new FlyWorld();
  for (const dt of [-1, Infinity, NaN, 1001]) assert.throws(() => world.step(dt), RangeError);
  for (const fruit of [{ x: NaN, y: 0 }, { x: -1, y: 0.5 }, { x: 0, y: 2 }, { x: 0.5, y: 0.5, kind: 'unknown' }]) {
    assert.throws(() => world.addFruit(fruit));
  }
  assert.throws(() => world.setStimulus({ drive: NaN }), /finite/);
  world.setStimulus({ drive: 0 });
  assert.equal(run(world, 3000).distanceTravelled, 0);
  world.setStimulus({ drive: null });
  assert.ok(run(world, 3000).distanceTravelled > 0.05);
});

test('energy increases travel and steering response without accelerating the neural clock', () => {
  const distances = [];
  for (const [energy, gain] of [['calm', 1], ['lively', 1.65], ['wild', 2.25]]) {
    const world = new FlyWorld({ energy });
    world.clearFruit();
    const first = world.step();
    const neuralClock = world.brain.timeMs;
    const sim = world.brain.sim;
    world.setEnergy(energy);
    assert.equal(world.brain.sim, sim);
    assert.equal(world.brain.timeMs, neuralClock);
    const state = run(world, 5950);
    assert.equal(state.energy, energy);
    assert.equal(state.motionGain, gain);
    assert.equal(world.brain.timeMs, 6000);
    assert.equal(state.time, 6);
    assert.ok(Number.isFinite(first.turnRate));
    distances.push(state.distanceTravelled);
  }
  assert.ok(distances[1] > distances[0] * 1.4, 'lively travels materially farther in equal neural time');
  assert.ok(distances[2] > distances[1] * 1.2, 'wild adds visible travel without a faster simulation clock');

  const calm = new FlyWorld({ brain: mockBrain(0.2) });
  const lively = new FlyWorld({ brain: mockBrain(0.2), energy: 'lively' });
  const a = calm.step(), b = lively.step();
  assert.ok(Math.abs(b.speed / a.speed - 1.65) < 1e-12);
  assert.ok(Math.abs(b.turnRate / a.turnRate - 1.65) < 1e-12);
});

test('lively and wild measured circuits still reach fruit at feeding height', () => {
  for (const energy of ['lively', 'wild']) {
    for (const seed of [1337, 1, 42]) {
      const world = new FlyWorld({ seed, energy, walkingIntervals: true });
      while (world.time < 12 && !world.visits) {
        const state = world.step();
        for (const value of [state.x, state.y, state.height, state.hunger]) {
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
        }
      }
      assert.ok(world.visits > 0, `${energy} seed ${seed} reaches fruit`);
      assert.equal(world.behavior, 'feeding');
      assert.ok(world.height < 0.05);
    }
  }
});

test('energy changes remain silent with zero motor output or disconnected measured synapses', () => {
  for (const world of [new FlyWorld({ brain: mockBrain(0) }), new FlyWorld()]) {
    if (world.brain.sim) world.brain.sim.synapsesEnabled = false;
    const initial = world.snapshot();
    for (const energy of ['lively', 'wild', 'calm']) {
      world.setEnergy(energy);
      const state = run(world, 1000);
      for (const key of ['x', 'y', 'heading', 'height', 'distanceTravelled']) assert.equal(state[key], initial[key]);
      assert.equal(state.speed, 0);
      assert.equal(state.turnRate, 0);
      assert.equal(state.visits, 0);
    }
  }
});

test('energy is validated, persists through reset, and bounds meal and rest pacing', () => {
  const world = new FlyWorld({ brain: mockBrain(0.2), walkingIntervals: true });
  assert.equal(world.snapshot().energy, 'calm');
  for (const energy of ['fast', '', null, 2, {}, ['wild']]) {
    assert.throws(() => world.setEnergy(energy), /calm, lively or wild/);
    assert.throws(() => new FlyWorld({ brain: mockBrain(), energy }), /calm, lively or wild/);
  }
  const meals = [];
  for (const energy of ['calm', 'wild']) {
    world.setEnergy(energy);
    world.reset();
    const first = run(world, 700);
    world.reset();
    assert.deepEqual(first, run(world, 700, 20));
    world.x = world.fruits[0].x;
    world.y = world.fruits[0].y;
    world.height = 0;
    world.behavior = 'feeding';
    world.feedingId = world.fruits[0].id;
    const start = world.time;
    while (world.behavior === 'feeding') world.step();
    meals.push(world.time - start);
    assert.ok(world.restTime >= 1.8 / 1.4 && world.restTime <= 3.2);
    assert.ok(world.hunger >= 0 && world.hunger < 0.2);
    assert.ok(world.fruits[0].amount > 0 && world.fruits[0].amount <= 1);
  }
  assert.ok(meals[1] < meals[0]);
  assert.ok(meals[1] >= meals[0] / 1.4 - 0.05, 'behavior pacing remains capped at 1.4');
});
