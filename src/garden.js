import { ENERGY_LEVELS, FlyWorld } from './world.js';

const STEP_MS = 50;
const STARTS = Object.freeze([
  { x: 0.42, y: 0.22 },
  { x: 0.15, y: 0.50 },
  { x: 0.82, y: 0.75 },
]);
const MAX_FLIES = 12;
const SEED_OFFSETS = [0, 104729, 209759];
const FRESH_LAYOUTS = Object.freeze([
  [[0.24, 0.28], [0.72, 0.65], [0.27, 0.76]],
  [[0.72, 0.24], [0.23, 0.51], [0.68, 0.76]],
  [[0.48, 0.22], [0.25, 0.73], [0.79, 0.55]],
]);
const startFor = index => index < STARTS.length ? STARTS[index] : {
  x: .5 + Math.cos(-Math.PI / 2 + (index - 3) * 2.399963229728653) * .35,
  y: .5 + Math.sin(-Math.PI / 2 + (index - 3) * 2.399963229728653) * .35,
};

/**
 * One to twelve independently simulated motor circuits in one animal garden.
 * Fruit objects are shared; feeding consumes the same supply once. Music never
 * enters this world: attraction and walking/flight bouts are toy animal rules.
 */
export class FlyGarden {
  constructor({ seed = 1337, count, worlds, energy = 'calm' } = {}) {
    if (!Number.isFinite(seed)) throw new TypeError('Garden seed must be finite.');
    if (typeof energy !== 'string' || !Object.hasOwn(ENERGY_LEVELS, energy)) throw new RangeError('Energy must be calm, lively or wild.');
    this.seed = seed;
    this.energy = energy;
    if (worlds !== undefined && (!Array.isArray(worlds) || worlds.length < 1 || worlds.length > MAX_FLIES)) {
      throw new TypeError('The garden needs one to twelve independent FlyWorld instances.');
    }
    this.count = count === undefined ? worlds?.length ?? 3 : count;
    if (!Number.isInteger(this.count) || this.count < 1 || this.count > MAX_FLIES) throw new RangeError('Fly count must be an integer between 1 and 12.');
    if (worlds && worlds.length !== this.count) throw new RangeError('Fly count must match the supplied worlds.');
    this.worlds = worlds ? [...worlds] : Array.from({length: this.count}, (_, index) => {
      const offset = SEED_OFFSETS[index] ?? SEED_OFFSETS[2] + (index - 2) * 104729;
      return new FlyWorld({ seed: (seed + offset) >>> 0, walkingIntervals: true, energy });
    });
    if (this.worlds.some(world => !(world instanceof FlyWorld))) throw new TypeError('The garden needs independent FlyWorld instances.');
    if (new Set(this.worlds).size !== this.count || new Set(this.worlds.map(world => world.brain)).size !== this.count) throw new TypeError('Every fly needs an independent world and motor circuit.');
    this.reset();
  }

  reset() {
    this.pendingMs = 0;
    this.refreshCount = 0;
    this.fruits = [];
    for (const [index, world] of this.worlds.entries()) {
      world.setEnergy(this.energy);
      world.reset();
      world.clearFruit();
      const start = startFor(index);
      world.x = start.x;
      world.y = start.y;
      world.nextFruitId = 1;
    }
    this.syncFruit();
    this.addFruit({ x: 0.68, y: 0.46, kind: 'banana' });
    this.addFruit({ x: 0.25, y: 0.62, kind: 'apple' });
    this.addFruit({ x: 0.78, y: 0.30, kind: 'grape' });
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

  refreshFruit() {
    // Changing the food arrangement leaves brains, clocks and visit counters
    // running. Fresh IDs keep a new visit distinct from a removed food item.
    const layout = FRESH_LAYOUTS[((this.seed >>> 0) + this.refreshCount++) % FRESH_LAYOUTS.length];
    this.clearFruit();
    ['banana', 'apple', 'grape'].forEach((kind, index) => {
      const [x, y] = layout[index];
      this.addFruit({ x, y, kind });
    });
    return this.snapshot();
  }

  setEnergy(energy) {
    if (typeof energy !== 'string' || !Object.hasOwn(ENERGY_LEVELS, energy)) throw new RangeError('Energy must be calm, lively or wild.');
    for (const world of this.worlds) world.setEnergy(energy);
    this.energy = energy;
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
    // Only the selected fly needs a full neural snapshot. Every other fly sends
    // its own six motor outputs and body state, without copying 1,045 node rates.
    const primary = this.worlds[0].snapshot();
    const flies = this.worlds.map((world, index) => ({
      id: `fly-${index + 1}`,
      x: world.x, y: world.y, heading: world.heading,
      height: world.height, speed: world.speed, turnRate: world.turnRate,
      behavior: world.behavior, gait: world.gait, hunger: world.hunger,
      energy: world.energy, motionGain: world.motionGain,
      feedingId: world.behavior === 'feeding' ? world.feedingId : null,
      time: Number.isFinite(world.brain.timeMs) ? world.brain.timeMs / 1000 : world.time,
      activity: [...(world.brain.activity ?? world.brain.snapshot().activity)],
      landingCount: world.landingCount, visits: world.visits,
      distanceTravelled: world.distanceTravelled,
    }));
    return {
      ...primary,
      selectedFlyId: 'fly-1',
      energy: this.energy, motionGain: ENERGY_LEVELS[this.energy],
      flyCount: this.count,
      flies,
      fruits: this.fruits.map((fruit) => ({ ...fruit })),
    };
  }
}
