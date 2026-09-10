import { FlyGarden } from './garden.js';

const ROUND_MS = 50;
const PHYSICS_MS = 5;
const TAU = Math.PI * 2;
const RADIUS = 0.43;
const BODY_RADIUS = 0.008;
const APOTHEM = RADIUS * Math.cos(Math.PI / 6) - BODY_RADIUS;
const FRUIT_RADIUS = 0.33;
const MAX_SPEED = 1.6;
const HIT_COOLDOWN = 0.15;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrap = angle => ((angle % TAU) + TAU) % TAU;
const CONTROL_LIMITS = { speed: [-2, 2], bounce: [0, 1], gravity: [0, 1] };

/**
 * An authored, rotating toy enclosure around the garden's existing motor graphs.
 * The garden still advances every brain by the original 50 ms neural rounds.
 * Motor output gates self propulsion and idealized fruit attraction; launch
 * momentum, gravity and moving-wall impulses are external physics and can move
 * even a silenced fly. None of these forces invent or accelerate neural firing.
 * This is a musical particle toy, not a validated fly aerodynamics model.
 */
export class FlyTombola {
  constructor({ garden } = {}) {
    if (!(garden instanceof FlyGarden)) throw new TypeError('Tombola needs an existing FlyGarden.');
    this.garden = garden;
    this.worlds = garden.worlds;
    this.pendingMs = 0;
    this.angle = 0;
    this.speed = 0.65;
    this.bounce = 0.8;
    this.gravity = 0.15;
    this.time = garden.snapshot().time;
    this.totalHits = 0;
    this.collisions = [];
    this.containFruit();
    this.particles = this.worlds.map((world, index) => {
      const heading = wrap(world.heading + index * 0.73);
      const launch = 0.2 + (index % 4) * 0.025;
      return {
        id: `fly-${index + 1}`, x: world.x, y: world.y,
        vx: Math.cos(heading) * launch, vy: Math.sin(heading) * launch,
        heading, lastHits: Array(6).fill(-Infinity),
      };
    });
    // Existing garden positions can be outside the hexagon. Bringing them into
    // the enclosure on entry is placement, not a collision or a musical event.
    for (let index = 0; index < this.particles.length; index++) {
      this.contain(this.particles[index], false);
      this.syncBody(index);
    }
  }

  configure(update = {}) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new TypeError('Tombola controls must be an object.');
    }
    // Validate every supplied value before mutating any control.
    for (const [key, value] of Object.entries(update)) {
      const limits = CONTROL_LIMITS[key];
      if (!limits) throw new TypeError(`Unknown Tombola control: ${key}.`);
      if (!Number.isFinite(value) || value < limits[0] || value > limits[1]) {
        throw new RangeError(`${key} must be between ${limits[0]} and ${limits[1]}.`);
      }
    }
    for (const [key, value] of Object.entries(update)) this[key] = value;
    return this.snapshot();
  }

  setEnergy(energy) {
    this.garden.setEnergy(energy);
    return this.snapshot();
  }

  setStimulus(update) {
    this.garden.setStimulus(update);
    return this.snapshot();
  }

  addFruit(fruit) {
    // Use the garden's validation and ID allocation before placing the canonical
    // shared fruit inside the circle that is safe at every chamber rotation.
    const added = this.garden.addFruit(fruit);
    this.containFruit();
    return { ...this.garden.fruits.find(item => item.id === added.id) };
  }

  containFruit() {
    for (const fruit of this.garden.fruits) {
      const dx = fruit.x - 0.5, dy = fruit.y - 0.5;
      const distance = Math.hypot(dx, dy);
      if (distance > FRUIT_RADIUS) {
        fruit.x = 0.5 + dx / distance * FRUIT_RADIUS;
        fruit.y = 0.5 + dy / distance * FRUIT_RADIUS;
      }
    }
  }

  clearFruit() {
    this.garden.clearFruit();
    return this.snapshot();
  }

  refreshFruit() {
    this.garden.refreshFruit();
    this.containFruit();
    return this.snapshot();
  }

  step(dtMs = ROUND_MS) {
    if (!Number.isFinite(dtMs) || dtMs < 0 || dtMs > 1000) {
      throw new RangeError('dtMs must be between 0 and 1000 milliseconds.');
    }
    this.pendingMs += dtMs;
    while (this.pendingMs + 1e-8 >= ROUND_MS) {
      this.pendingMs -= ROUND_MS;
      this.tick();
    }
    return this.snapshot();
  }

  tick() {
    const distances = this.worlds.map(world => world.distanceTravelled);
    // Body positions from the preceding physics round are already synchronized,
    // so the actual circuit receives fruit sensing from its own particle pose.
    this.garden.step(ROUND_MS);
    const motors = this.worlds.map(world => {
      const activity = world.brain.activity ?? world.brain.snapshot().activity;
      const mean = activity.reduce((sum, value) => sum + clamp(Number.isFinite(value) ? value : 0, 0, 1), 0) / activity.length;
      return { drive: mean * world.motionGain, heading: world.heading };
    });

    for (let elapsed = 0; elapsed < ROUND_MS; elapsed += PHYSICS_MS) {
      const dt = PHYSICS_MS / 1000;
      this.time += dt;
      this.angle = wrap(this.angle + this.speed * dt);
      for (const [index, particle] of this.particles.entries()) {
        const motor = motors[index];
        const food = this.garden.fruits.reduce((nearest, fruit) => {
          const distance = Math.hypot(fruit.x - particle.x, fruit.y - particle.y);
          return !nearest || distance < nearest.distance ? { fruit, distance } : nearest;
        }, null);
        let ax = Math.cos(motor.heading) * motor.drive * 0.36;
        let ay = Math.sin(motor.heading) * motor.drive * 0.36;
        if (food && food.distance > 0.01) {
          const attraction = motor.drive * 0.24 * this.worlds[index].hunger;
          ax += (food.fruit.x - particle.x) / food.distance * attraction;
          ay += (food.fruit.y - particle.y) / food.distance * attraction;
        }
        ay += this.gravity * 0.85;
        const damping = Math.exp(-0.14 * dt);
        particle.vx = (particle.vx + ax * dt) * damping;
        particle.vy = (particle.vy + ay * dt) * damping;
        this.limitSpeed(particle);
        const previousX = particle.x, previousY = particle.y;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        this.contain(particle, true);
        distances[index] += Math.hypot(particle.x - previousX, particle.y - previousY);
      }
    }

    for (let index = 0; index < this.particles.length; index++) {
      this.worlds[index].distanceTravelled = distances[index];
      this.syncBody(index);
    }
    this.collisions = this.collisions.filter(collision => this.time - collision.time <= 3);
  }

  limitSpeed(particle) {
    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > MAX_SPEED) {
      particle.vx *= MAX_SPEED / speed;
      particle.vy *= MAX_SPEED / speed;
    }
  }

  contain(particle, emitHits) {
    // A convex polygon is the intersection of six inward half-planes. Repeated
    // projection also resolves two simultaneous faces at a corner. At 5 ms and
    // the capped speed a particle cannot skip through an entire enclosure.
    for (let pass = 0; pass < 12; pass++) {
      let corrected = false;
      for (let wall = 0; wall < 6; wall++) {
        const normalAngle = this.angle + (wall + 0.5) * TAU / 6;
        const nx = Math.cos(normalAngle), ny = Math.sin(normalAngle);
        const penetration = (particle.x - 0.5) * nx + (particle.y - 0.5) * ny - APOTHEM;
        if (penetration <= 0) continue;
        corrected = true;
        particle.x -= (penetration + 1e-10) * nx;
        particle.y -= (penetration + 1e-10) * ny;
        if (!emitHits) continue;
        // Bounce in the local moving wall's frame, then return to world space.
        const wallVx = -this.speed * (particle.y - 0.5);
        const wallVy = this.speed * (particle.x - 0.5);
        const incoming = (particle.vx - wallVx) * nx + (particle.vy - wallVy) * ny;
        if (incoming <= 0) continue;
        particle.vx -= (1 + this.bounce) * incoming * nx;
        particle.vy -= (1 + this.bounce) * incoming * ny;
        this.limitSpeed(particle);
        if (incoming > 0.025 && this.time - particle.lastHits[wall] >= HIT_COOLDOWN) {
          particle.lastHits[wall] = this.time;
          this.collisions.push({
            id: ++this.totalHits, flyId: particle.id, wall,
            x: particle.x, y: particle.y,
            impact: clamp(incoming / 0.8, 0, 1), time: this.time,
          });
          if (this.collisions.length > 64) this.collisions.shift();
        }
      }
      if (!corrected) break;
    }
  }

  syncBody(index) {
    const particle = this.particles[index], world = this.worlds[index];
    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > 1e-7) particle.heading = wrap(Math.atan2(particle.vy, particle.vx));
    world.x = particle.x;
    world.y = particle.y;
    world.heading = particle.heading;
    world.speed = speed;
    world.height = 0.1;
    // External momentum can carry a feeding fly away. Do not let it continue to
    // consume fruit remotely just because the garden had entered a feeding bout.
    if (world.behavior === 'feeding') {
      const food = this.garden.fruits.find(fruit => fruit.id === world.feedingId);
      if (!food || Math.hypot(food.x - world.x, food.y - world.y) > 0.06) {
        world.behavior = 'seeking';
        world.feedingId = null;
        world.feedTime = 0;
      }
    }
  }

  snapshot() {
    const garden = this.garden.snapshot();
    const flies = garden.flies.map((fly, index) => {
      const particle = this.particles[index];
      return {
        ...fly, x: particle.x, y: particle.y, heading: particle.heading,
        speed: Math.hypot(particle.vx, particle.vy), height: 0.1,
        behavior: fly.behavior === 'feeding' ? 'feeding' : 'flying', gait: 'flying',
      };
    });
    const primary = flies[0];
    return {
      ...garden, x: primary.x, y: primary.y, heading: primary.heading,
      height: primary.height, speed: primary.speed,
      behavior: primary.behavior, gait: primary.gait, flies,
      tombola: {
        angle: this.angle, speed: this.speed, bounce: this.bounce,
        gravity: this.gravity, radius: RADIUS,
        collisions: this.collisions.map(collision => ({ ...collision })),
        totalHits: this.totalHits,
      },
    };
  }
}
