import { FlyBrain } from './brain.js';

const KINDS = new Set(['banana', 'apple', 'grape', 'berry', 'strawberry', 'orange']);
const STEP_MS = 50;
const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const angleDifference = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const wrap = (angle) => ((angle % TAU) + TAU) % TAU;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function randomFrom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/**
 * A small, deliberately engineered animal world around the measured motor graph.
 * Fruit sensing, hunger, feeding, heading control and flight height are toy rules;
 * this is neither a validated fly flight model nor olfactory/reward learning.
 * Actual neural motor output gates translation AND turning. No target-position
 * interpolation moves the fly, and silencing the graph stops locomotion.
 */
export class FlyWorld {
  constructor({ seed = 1337, brain = new FlyBrain({ seed }), walkingIntervals = false } = {}) {
    if (!Number.isFinite(seed)) throw new TypeError('World seed must be finite.');
    this.seed = seed;
    this.brain = brain;
    this.walkingIntervals = walkingIntervals;
    this.reset();
  }

  reset() {
    this.brain.reset?.();
    this.random = randomFrom(this.seed);
    this.pendingMs = 0;
    this.time = 0;
    this.x = 0.5;
    this.y = 0.5;
    this.heading = this.random() * TAU;
    this.height = 0;
    this.speed = 0;
    this.turnRate = 0;
    this.behavior = 'seeking';
    this.hunger = 0.72;
    this.visits = 0;
    this.landingCount = 0;
    this.distanceTravelled = 0;
    this.driveOverride = null;
    this.feedTime = 0;
    this.restTime = 0;
    this.feedingId = null;
    this.explorationHeading = this.heading;
    this.nextExplore = 0;
    this.wasAirborne = false;
    this.gait = this.walkingIntervals ? 'walking' : 'flying';
    this.nextGait = this.walkingIntervals ? 3 + this.random() * 3 : Infinity;
    this.nextFruitId = 1;
    this.fruits = [];
    this.addFruit({ x: 0.25, y: 0.32, kind: 'banana' });
    this.addFruit({ x: 0.78, y: 0.68, kind: 'apple' });
    return this.snapshot();
  }

  addFruit({ x, y, kind = 'banana' } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new RangeError('Fruit positions must be finite numbers between 0 and 1.');
    }
    if (!KINDS.has(kind)) throw new TypeError('Choose banana, apple, grape, berry, strawberry, or orange.');
    if (this.fruits.length >= 6) throw new RangeError('The world has room for six fruits.');
    // Leave enough room at the wall for the body to reach and land at a fruit.
    const fruit = { id: `fruit-${this.nextFruitId++}`, x: clamp(x, 0.06, 0.94), y: clamp(y, 0.06, 0.94), kind, amount: 1 };
    this.fruits.push(fruit);
    return { ...fruit };
  }

  clearFruit() {
    this.fruits = [];
    this.feedingId = null;
    this.feedTime = 0;
    this.restTime = 0;
    this.behavior = 'exploring';
    return this.snapshot();
  }

  setStimulus({ drive } = {}) {
    if (drive === undefined) return this.snapshot();
    if (drive === null) this.driveOverride = null;
    else {
      if (!Number.isFinite(drive)) throw new TypeError('Drive must be finite, or null for automatic drive.');
      this.driveOverride = clamp(drive);
    }
    return this.snapshot();
  }

  step(dtMs = STEP_MS) {
    if (!Number.isFinite(dtMs) || dtMs < 0 || dtMs > 1000) {
      throw new RangeError('dtMs must be between 0 and 1000 milliseconds.');
    }
    this.pendingMs += dtMs;
    // Fixed world ticks make a replay independent of browser refresh timing.
    while (this.pendingMs + 1e-8 >= STEP_MS) {
      this.pendingMs -= STEP_MS;
      this.tick();
    }
    return this.snapshot();
  }

  tick() {
    const dt = STEP_MS / 1000;
    this.time += dt;
    this.hunger = clamp(this.hunger + dt * 0.013);
    const food = this.fruits.reduce((closest, fruit) => {
      const distance = Math.hypot(fruit.x - this.x, fruit.y - this.y);
      return !closest || distance < closest.distance ? { fruit, distance } : closest;
    }, null);

    if (this.behavior !== 'feeding' && this.behavior !== 'resting') {
      this.behavior = food && this.hunger >= 0.38 ? 'seeking' : 'exploring';
    }

    if (this.time >= this.nextExplore) {
      this.explorationHeading = wrap(this.heading + (this.random() - 0.5) * 2.7);
      this.nextExplore = this.time + 2.5 + this.random() * 2.5;
    }
    let desiredHeading = this.explorationHeading;
    if (this.behavior === 'seeking' && food) {
      // Idealized direction/distance sensing, identical for every fruit kind.
      desiredHeading = Math.atan2(food.fruit.y - this.y, food.fruit.x - this.x);
    } else if (this.x < 0.1 || this.x > 0.9 || this.y < 0.1 || this.y > 0.9) {
      desiredHeading = Math.atan2(0.5 - this.y, 0.5 - this.x);
      this.explorationHeading = desiredHeading;
    }
    const error = angleDifference(desiredHeading - this.heading);
    const stationary = this.behavior === 'feeding' || this.behavior === 'resting';
    const drive = stationary ? 0.06 : (this.driveOverride ?? (0.55 + this.hunger * 0.4));
    this.brain.setStimulus({ drive, turn: clamp(-error / 1.2, -1, 1) });
    this.brain.step(STEP_MS);
    const neural = this.brain.snapshot();
    const activity = neural.activity.map((value) => clamp(Number.isFinite(value) ? value : 0));
    const motor = mean(activity);
    const energy = clamp(motor * 4);
    const left = mean(activity.slice(0, 3)), right = mean(activity.slice(3, 6));

    if (this.behavior === 'feeding') {
      const fruit = this.fruits.find((item) => item.id === this.feedingId);
      if (fruit) {
        fruit.amount = clamp(fruit.amount - dt * 0.32);
        this.hunger = clamp(this.hunger - dt * 0.38);
        this.feedTime += dt;
      }
      if (!fruit || fruit.amount <= 0 || this.feedTime >= 1.8) {
        this.fruits = this.fruits.filter((item) => item.amount > 0);
        this.behavior = 'resting';
        this.restTime = 1.8 + this.random() * 1.4;
        this.feedingId = null;
      }
    } else if (this.behavior === 'resting') {
      this.restTime -= dt;
      if (this.restTime <= 0) this.behavior = 'exploring';
    }

    const moving = this.behavior !== 'feeding' && this.behavior !== 'resting';
    // Optional installation behavior: seeded walking/flight bouts are an
    // engineered body rule. Neither strings nor musical output influence them.
    if (this.walkingIntervals && moving && this.time >= this.nextGait) {
      this.gait = this.gait === 'walking' ? 'flying' : 'walking';
      this.nextGait = this.time + 3 + this.random() * 4;
    }
    const approach = this.behavior === 'seeking' && food ? clamp(food.distance / 0.12, 0.15, 1) : 1;
    // Heading control compensates the uncalibrated circuit's left/right bias;
    // its strength, neural steering texture and translation all require motors.
    this.turnRate = moving && energy > 0 ? (clamp(error * 2.8, -2.6, 2.6) + (left - right) * 0.7) * energy : 0;
    this.speed = moving ? motor * 0.34 * approach * (this.gait === 'walking' ? 0.72 : 1) : 0;
    if (this.turnRate !== 0) this.heading = wrap(this.heading + this.turnRate * dt);
    const previousX = this.x, previousY = this.y;
    this.x = clamp(this.x + Math.cos(this.heading) * this.speed * dt, 0.035, 0.965);
    this.y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, 0.035, 0.965);
    this.distanceTravelled += Math.hypot(this.x - previousX, this.y - previousY);

    const nearFood = this.behavior === 'seeking' && food && food.distance < 0.13;
    const targetHeight = moving && !nearFood && this.gait === 'flying'
      ? energy * (0.36 + 0.05 * Math.sin(this.time * 2)) : 0;
    this.height += (targetHeight - this.height) * (1 - Math.exp(-dt * 4));
    this.height = clamp(this.height);
    if (this.height > 0.12) this.wasAirborne = true;
    if (this.wasAirborne && this.height < 0.045) {
      this.wasAirborne = false;
      this.landingCount++;
    }
    if (this.behavior === 'seeking' && food && motor > 0.002
      && Math.hypot(food.fruit.x - this.x, food.fruit.y - this.y) < 0.045 && this.height < 0.05) {
      this.behavior = 'feeding';
      this.feedingId = food.fruit.id;
      this.feedTime = 0;
      this.visits++;
      this.speed = 0;
      this.turnRate = 0;
    }
  }

  snapshot() {
    return {
      ...this.brain.snapshot(),
      x: this.x, y: this.y, heading: this.heading,
      height: this.height, speed: this.speed, turnRate: this.turnRate,
      behavior: this.behavior, hunger: this.hunger,
      gait: this.gait,
      fruits: this.fruits.map((fruit) => ({ ...fruit })),
      visits: this.visits, landingCount: this.landingCount,
      distanceTravelled: this.distanceTravelled,
    };
  }
}
