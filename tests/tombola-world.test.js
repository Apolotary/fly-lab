import test from 'node:test';
import assert from 'node:assert/strict';
import { FlyGarden } from '../src/garden.js';
import { FlyWorld } from '../src/world.js';
import { FlyTombola } from '../src/tombola-world.js';

function cheapGarden({ motor = 0.2, count = 12, seed = 17 } = {}) {
  return new FlyGarden({ seed, worlds: Array.from({ length: count }, (_, index) =>
    new FlyWorld({ seed: seed + index, brain: {
      timeMs: 0, activity: Array(6).fill(motor),
      reset() { this.timeMs = 0; },
      setStimulus() {},
      step(ms) { this.timeMs += ms; },
      snapshot() { return { time: this.timeMs / 1000, activity: [...this.activity], nodes: [motor] }; },
    } })) });
}

function advance(world, ms, frame = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += frame) world.step(Math.min(frame, ms - elapsed));
  return world.snapshot();
}

function assertContained(state) {
  const apothem = state.tombola.radius * Math.cos(Math.PI / 6);
  for (const fly of state.flies) {
    assert.ok([fly.x, fly.y, fly.heading, fly.speed].every(Number.isFinite));
    assert.ok(fly.x >= 0 && fly.x <= 1 && fly.y >= 0 && fly.y <= 1);
    for (let wall = 0; wall < 6; wall++) {
      const angle = state.tombola.angle + (wall + 0.5) * Math.PI / 3;
      const distance = (fly.x - 0.5) * Math.cos(angle) + (fly.y - 0.5) * Math.sin(angle);
      assert.ok(distance <= apothem - 0.0079, `fly escaped wall ${wall}: ${distance}`);
    }
  }
}

test('Tombola preserves existing circuit identities and clocks when entering and forwarding controls', () => {
  const garden = new FlyGarden({ count: 2 });
  advance(garden, 250);
  const brains = garden.worlds.map(world => world.brain);
  const graphs = brains.map(brain => brain.sim);
  const neural = brains.map(brain => brain.snapshot());
  const world = new FlyTombola({ garden });
  assert.equal(world.garden, garden);
  assert.equal(world.worlds, garden.worlds);
  assert.deepEqual(brains.map(brain => brain.snapshot()), neural);
  world.setEnergy('wild');
  world.setStimulus({ drive: 0.4 });
  world.clearFruit();
  world.addFruit({ x: 0.5, y: 0.5, kind: 'apple' });
  world.refreshFruit();
  assert.deepEqual(world.worlds.map(body => body.brain), brains);
  assert.deepEqual(brains.map(brain => brain.sim), graphs);
  assert.deepEqual(brains.map(brain => brain.snapshot()), neural);
  const state = advance(world, 300);
  assert.equal(state.time, 0.55);
  assert.ok(state.flies.every(fly => fly.time === 0.55 && fly.energy === 'wild'));
  state.flies.forEach((fly, index) => {
    assert.equal(garden.worlds[index].x, fly.x);
    assert.equal(garden.worlds[index].y, fly.y);
  });
  assert.equal(garden.snapshot().time, 0.55, 'the same garden is ready when the wrapper is left');
});

test('fixed neural rounds and physics microsteps are independent of caller frame batches', () => {
  const a = new FlyTombola({ garden: cheapGarden() });
  const b = new FlyTombola({ garden: cheapGarden() });
  a.configure({ speed: -1.3, bounce: 0.93, gravity: 0.7 });
  b.configure({ speed: -1.3, bounce: 0.93, gravity: 0.7 });
  const first = advance(a, 6000, 50);
  assert.deepEqual(first, advance(b, 6000, 17));
  assert.ok(first.tombola.totalHits > 20);
  assert.equal(first.flyCount, 12);
  assert.deepEqual(first.flies.map(fly => fly.id), Array.from({ length: 12 }, (_, i) => `fly-${i + 1}`));
});

test('controls reject invalid values atomically and frame validation never changes the world', () => {
  assert.throws(() => new FlyTombola(), /existing FlyGarden/);
  const world = new FlyTombola({ garden: cheapGarden() });
  const original = world.snapshot();
  for (const controls of [null, [], { speed: 3 }, { speed: -3 }, { speed: NaN }, { bounce: -1 },
    { bounce: Infinity }, { gravity: 1.1 }, { gravity: '0.5' }, { speed: 1, bounce: -1 }, { radius: 10 }]) {
    assert.throws(() => world.configure(controls));
    assert.deepEqual(world.snapshot(), original);
  }
  for (const dt of [-1, 1001, NaN, Infinity]) {
    assert.throws(() => world.step(dt), RangeError);
    assert.deepEqual(world.snapshot(), original);
  }
  assert.deepEqual(world.configure({}).tombola, original.tombola);
  assert.equal(world.configure({ speed: 0 }).tombola.speed, 0);
});

test('extreme rotation, gravity and elastic bounces keep all flies inside the rotating hexagon', () => {
  for (const speed of [-2, 0, 2]) {
    const world = new FlyTombola({ garden: cheapGarden() });
    world.setEnergy('wild');
    world.configure({ speed, bounce: 1, gravity: 1 });
    for (let elapsed = 0; elapsed < 20000; elapsed += 50) {
      const state = world.step(50);
      assertContained(state);
      assert.ok(state.tombola.collisions.length <= 64);
      assert.ok(state.flies.every(fly => fly.speed <= 1.60000001));
    }
    assert.ok(world.snapshot().tombola.totalHits > 30);
  }
});

test('only incoming wall impulses emit hits; IDs and per-face cooldown remain stable', () => {
  const world = new FlyTombola({ garden: cheapGarden({ motor: 0, count: 1 }) });
  world.configure({ speed: 0, gravity: 0, bounce: 1 });
  const particle = world.particles[0];
  particle.x = particle.y = 0.5;
  particle.vx = particle.vy = 0;
  assert.equal(advance(world, 1000).tombola.totalHits, 0, 'no clock-driven synthetic hits');
  particle.vx = 0.7;
  const seen = new Map();
  for (let elapsed = 0; elapsed < 10000; elapsed += 50) {
    for (const collision of world.step(50).tombola.collisions) seen.set(collision.id, collision);
  }
  const collisions = [...seen.values()];
  assert.ok(collisions.length > 3);
  assert.deepEqual(collisions.map(hit => hit.id), collisions.map((_, index) => index + 1));
  const lastWall = new Map();
  for (const hit of collisions) {
    assert.ok(hit.impact > 0 && hit.impact <= 1);
    assert.equal(hit.flyId, 'fly-1');
    assert.ok(Number.isInteger(hit.wall) && hit.wall >= 0 && hit.wall < 6);
    assert.ok(hit.time > (lastWall.get(hit.wall) ?? -Infinity) + 0.149);
    lastWall.set(hit.wall, hit.time);
  }
  const snapshot = world.snapshot();
  if (snapshot.tombola.collisions.length) {
    snapshot.tombola.collisions[0].impact = -100;
    assert.ok(world.snapshot().tombola.collisions.every(hit => hit.impact > 0));
  }
});

test('external launch and gravity move silenced particles without faking motor activity', () => {
  const garden = cheapGarden({ motor: 0, count: 1 });
  const world = new FlyTombola({ garden });
  const before = world.snapshot().flies[0];
  const state = advance(world, 1500);
  const after = state.flies[0];
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.05);
  assert.deepEqual(after.activity, Array(6).fill(0));
  assert.equal(after.time, 1.5);
  assert.ok(after.distanceTravelled > 0);
  assert.equal(state.x, after.x);
  assert.equal(state.y, after.y);
});

test('initial, added and refreshed fruit remain reachable inside every chamber rotation', () => {
  const garden = cheapGarden({ count: 2 });
  advance(garden, 200);
  const brains = garden.worlds.map(world => world.brain);
  const neural = brains.map(brain => brain.snapshot());
  const initialFruit = [...garden.fruits];
  const initialIds = initialFruit.map(fruit => fruit.id);
  const world = new FlyTombola({ garden });
  const assertFruitSafe = () => {
    for (const fruit of world.snapshot().fruits) {
      assert.ok(Math.hypot(fruit.x - 0.5, fruit.y - 0.5) <= 0.330000000001);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 36) {
        const distance = (fruit.x - 0.5) * Math.cos(angle) + (fruit.y - 0.5) * Math.sin(angle);
        assert.ok(distance + 0.04 < 0.43 * Math.cos(Math.PI / 6), 'fruit retains a margin from every rotating wall');
      }
    }
    assert.deepEqual(garden.worlds.map(body => body.brain), brains);
    assert.deepEqual(brains.map(brain => brain.snapshot()), neural);
    assert.ok(garden.worlds.every(body => body.fruits === garden.fruits));
  };
  assertFruitSafe();
  assert.deepEqual(garden.fruits.map(fruit => fruit.id), initialIds);
  assert.ok(garden.fruits.every((fruit, index) => fruit === initialFruit[index]));
  world.clearFruit();
  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const added = world.addFruit({ x, y, kind: 'apple' });
    assert.deepEqual(added, garden.fruits.at(-1));
    assert.notEqual(added, garden.fruits.at(-1), 'callers receive a detached corrected position');
    assertFruitSafe();
  }
  const valid = world.snapshot();
  for (const fruit of [{ x: -1, y: 0.5 }, { x: NaN, y: 0 }, { x: 0.5, y: 0.5, kind: 'plastic' }]) {
    assert.throws(() => world.addFruit(fruit));
    assert.deepEqual(world.snapshot(), valid);
  }
  for (let index = 0; index < 3; index++) {
    world.refreshFruit();
    assertFruitSafe();
    assert.ok(world.snapshot().fruits.every(fruit => fruit.amount === 1));
  }
});
