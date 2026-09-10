import { FlyWorld } from './world.js';

const STEP_MS = 50;
const STARTS = Object.freeze([
  { x: 0.42, y: 0.22 },
  { x: 0.15, y: 0.50 },
  { x: 0.82, y: 0.75 },
]);

/**
 * Three independently simulated motor circuits in one small animal garden.
 * Fruit objects are shared; feeding consumes the same supply once. Music never
 * enters this world: attraction and walking/flight bouts are toy animal rules.
 */
export class FlyGarden {
  constructor({ seed = 1337, worlds } = {}) {
    if (!Number.isFinite(seed)) throw new TypeError('Garden seed must be finite.');
    if (worlds !== undefined && (!Array.isArray(worlds) || worlds.length !== 3)) {
      throw new TypeError('The garden needs three independent FlyWorld instances.');
    }
    this.worlds = worlds ?? [0, 104729, 209759].map((offset) =>
      new FlyWorld({ seed: (seed + offset) >>> 0, walkingIntervals: true }));
    if (new Set(this.worlds).size !== 3) throw new TypeError('Every fly needs an independent world.');
    this.reset();
  }

  reset() {
    this.pendingMs = 0;
    this.fruits = [];
    for (const [index, world] of this.worlds.entries()) {
      world.reset();
      world.clearFruit();
      world.x = STARTS[index].x;
      world.y = STARTS[index].y;
      world.nextFruitId = 1;
    }
    this.syncFruit();
    this.addFruit({ x: 0.68, y: 0.46, kind: 'banana' });
    this.addFruit({ x: 0.25, y: 0.62, kind: 'apple' });
    return this.snapshot();
  }

  syncFruit() {
    for (const world of this.worlds) world.fruits = this.fruits;
  }

  addFruit(fruit) {
    this.syncFruit();
    const added = this.worlds[0].addFruit(fruit);
    // addFruit mutates the shared array; all flies immediately sense the fruit.
    return added;
  }

  clearFruit() {
    for (const world of this.worlds) world.clearFruit();
    this.fruits = [];
    this.syncFruit();
    return this.snapshot();
  }

  setStimulus(update) {
    for (const world of this.worlds) world.setStimulus(update);
    return this.snapshot();
  }

  step(dtMs = STEP_MS) {
    if (!Number.isFinite(dtMs) || dtMs < 0 || dtMs > 1000) {
      throw new RangeError('dtMs must be between 0 and 1000 milliseconds.');
    }
    this.pendingMs += dtMs;
    // Advance everyone in the same fixed rounds, including batched frame time.
    while (this.pendingMs + 1e-8 >= STEP_MS) {
      this.pendingMs -= STEP_MS;
      for (const world of this.worlds) {
        world.fruits = this.fruits;
        world.step(STEP_MS);
        // FlyWorld removes consumed items with filter; retain canonical objects
        // and remove exhausted food before the next fly gets a turn to feed.
        this.fruits = this.fruits.filter((fruit) => fruit.amount > 0);
      }
      this.syncFruit();
    }
    return this.snapshot();
  }

  snapshot() {
    const states = this.worlds.map((world) => world.snapshot());
    const flies = states.map((state, index) => ({
      id: `fly-${index + 1}`,
      x: state.x, y: state.y, heading: state.heading,
      height: state.height, speed: state.speed, turnRate: state.turnRate,
      behavior: state.behavior, gait: state.gait, hunger: state.hunger,
      time: state.time, activity: state.activity,
      landingCount: state.landingCount, visits: state.visits,
      distanceTravelled: state.distanceTravelled,
    }));
    return {
      ...states[0],
      selectedFlyId: 'fly-1',
      flies,
      fruits: this.fruits.map((fruit) => ({ ...fruit })),
    };
  }
}
