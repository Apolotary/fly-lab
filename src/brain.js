import { LocomotorSim } from './vendor/desktop-fly/locomotor.js';
import CIRCUIT from '../data/locomotor_circuit.json' with { type: 'json' };

export const VOICES = Object.freeze(['LF', 'LM', 'LH', 'RF', 'RM', 'RH']);
const LEG_INDICES = VOICES.map((voice) => CIRCUIT.legOrder.indexOf(voice));
const MOTOR_GROUPS = LEG_INDICES.map((leg) => CIRCUIT.neurons.flatMap((neuron, index) =>
  neuron.role === 'motor' && neuron.leg === leg ? [index] : []));
// Display samples actual selected neurons; their display positions are illustrative.
const DISPLAY_NODES = Array.from({ length: 64 }, (_, i) => Math.floor(i * CIRCUIT.neurons.length / 64));
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const normalizedRate = (rate) => rate / (rate + 22);

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A bounded MaleCNS subgraph drives six musical channels.
 * Measured anatomy and contact counts come from MaleCNS via DesktopFly.
 * Neuron dynamics, seeded stimulation, musical mapping and arena motion are
 * modeling choices. This is not a whole brain or a calibrated animal model.
 */
export class FlyBrain {
  constructor({ seed = 1337 } = {}) {
    if (!Number.isFinite(seed)) throw new TypeError('seed must be a finite number');
    this.seed = seed;
    this.reset();
  }

  reset() {
    this.random = seededRandom(this.seed);
    this.sim = new LocomotorSim(CIRCUIT);
    this.stimulus = { drive: 0.7, turn: 0 };
    this.activity = Array(6).fill(0);
    this.nodes = Array(64).fill(0);
    this.timeMs = 0;
    this.pendingMs = 0;
    this.nextInputMs = 0;
    this.input = { left: 0, right: 0, turn: 0 };
    this.targetInput = { left: 0, right: 0, turn: 0 };
    this.x = 0.5;
    this.y = 0.5;
    this.heading = this.random() * Math.PI * 2;
    return this.snapshot();
  }

  setStimulus(update = {}) {
    if (update == null || typeof update !== 'object') throw new TypeError('stimulus must be an object');
    for (const name of ['drive', 'turn']) {
      if (update[name] === undefined) continue;
      if (!Number.isFinite(update[name])) throw new TypeError(`${name} must be finite`);
      this.stimulus[name] = clamp(update[name], name === 'turn' ? -1 : 0, 1);
    }
    return this.snapshot();
  }

  step(dtMs = 50) {
    if (!Number.isFinite(dtMs) || dtMs < 0 || dtMs > 1000) {
      throw new RangeError('dtMs must be between 0 and 1000 milliseconds');
    }
    this.pendingMs += dtMs;
    // Fixed 10 ms ticks keep neural results independent of dashboard refresh.
    while (this.pendingMs + 1e-8 >= 10) {
      this.pendingMs -= 10;
      this.tick();
    }
    return this.snapshot();
  }

  tick() {
    if (this.timeMs >= this.nextInputMs) {
      this.targetInput = {
        left: this.random() * 0.7 + 0.65,
        right: this.random() * 0.7 + 0.65,
        turn: (this.random() * 2 - 1) * 0.55,
      };
      this.nextInputMs = this.timeMs + 800 + Math.floor(this.random() * 1400);
    }
    for (const key of ['left', 'right', 'turn']) {
      this.input[key] += (this.targetInput[key] - this.input[key]) * (1 - Math.exp(-10 / 550));
    }
    // This is artificial stimulation of identified descending neuron types.
    // Randomness changes the inputs; every motor output comes through the graph.
    const { drive, turn } = this.stimulus;
    const turnInput = clamp(turn + this.input.turn * drive, -1, 1);
    for (const side of ['left', 'right']) {
      this.sim.setDescending('DNp09', side, drive * 72 * this.input[side]);
      const steering = side === 'left' ? Math.max(0, turnInput) : Math.max(0, -turnInput);
      this.sim.setDescending('DNa02', side, steering * drive * 65);
      this.sim.setDescending('DNa01', side, steering * drive * 24);
    }
    this.sim.step(10);
    this.timeMs += 10;
    // Smoothing produces playable control values without erasing neural bursts.
    const smoothing = 1 - Math.exp(-10 / 320);
    for (let i = 0; i < MOTOR_GROUPS.length; i++) {
      const rate = mean(MOTOR_GROUPS[i].map((index) => this.sim.rates[index]));
      this.activity[i] += (normalizedRate(rate) - this.activity[i]) * smoothing;
    }
    for (let i = 0; i < DISPLAY_NODES.length; i++) {
      this.nodes[i] += (normalizedRate(this.sim.rates[DISPLAY_NODES[i]]) - this.nodes[i]) * 0.12;
    }
    const left = mean(this.activity.slice(0, 3));
    const right = mean(this.activity.slice(3));
    this.heading += (left - right) * 0.075;
    const distance = mean(this.activity) * 0.0018;
    this.x += Math.cos(this.heading) * distance;
    this.y += Math.sin(this.heading) * distance;
    // Arena walls are a visual rule, not a sensory claim about these neurons.
    if (this.x < 0.06 || this.x > 0.94) {
      this.x = clamp(this.x, 0.06, 0.94);
      this.heading = Math.PI - this.heading;
    }
    if (this.y < 0.06 || this.y > 0.94) {
      this.y = clamp(this.y, 0.06, 0.94);
      this.heading = -this.heading;
    }
    this.heading = ((this.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  snapshot() {
    return {
      neurons: CIRCUIT.summary.neurons,
      edges: CIRCUIT.summary.edges,
      contacts: CIRCUIT.summary.contacts,
      time: this.timeMs / 1000,
      activity: [...this.activity],
      spikes: this.sim.totalSpikes,
      drive: this.stimulus.drive,
      turn: this.stimulus.turn,
      x: this.x,
      y: this.y,
      heading: this.heading,
      nodes: [...this.nodes],
    };
  }
}
