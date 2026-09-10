import { TEMPO } from './midi-file.js';

// These are deliberately authored musical building blocks. Learning changes
// their readout probabilities, never the pitches or the measured neural graph.
export const DARK_ACTIONS = Object.freeze([
  { id: 'rest', label: 'Leave space', pitches: [], velocity: 1, duration: 2.8, brightness: .16, space: .9 },
  { id: 'root', label: 'Low C drone', pitches: [48], velocity: 48, duration: 2.9, brightness: .17, space: .86 },
  { id: 'minor', label: 'C minor shadow', pitches: [48, 51], velocity: 43, duration: 2.8, brightness: .23, space: .85 },
  { id: 'fifth', label: 'Open fifth', pitches: [48, 55], velocity: 45, duration: 2.9, brightness: .2, space: .9 },
  { id: 'fall', label: 'Low B-flat', pitches: [58], velocity: 40, duration: 2.7, brightness: .25, space: .9 },
  { id: 'tension', label: 'D-flat tension', pitches: [49], velocity: 39, duration: 2.5, brightness: .29, space: .93 },
  { id: 'tritone', label: 'Distant tritone', pitches: [54, 60], velocity: 41, duration: 2.6, brightness: .35, space: .92 },
  { id: 'spark', label: 'High pale spark', pitches: [79], velocity: 56, duration: .45, brightness: .7, space: .76 },
  { id: 'cluster', label: 'Dense cluster', pitches: [60, 61, 66, 72], velocity: 76, duration: .8, brightness: .8, space: .62 },
  { id: 'veil', label: 'Minor veil', pitches: [55, 63], velocity: 38, duration: 2.9, brightness: .27, space: .96 },
].map(action => Object.freeze({ ...action, pitches: Object.freeze(action.pitches) })));

const FEATURE_COUNT = 7;
const WEIGHT_LIMIT = 8;
const STATE_VERSION = 1;
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const copyWeights = weights => weights.map(row => [...row]);
const arrayOf = (values, length, check) => Array.isArray(values) && values.length === length && [...values].every(check);

function numberIn(value, low, high, name) {
  if (!Number.isFinite(value) || value < low || value > high) throw new TypeError(`${name} must be between ${low} and ${high}.`);
  return value;
}

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer.`);
  return value;
}

function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean.`);
  return value;
}

function featuresFrom(activity) {
  const values = Array.isArray(activity) ? activity : activity?.activity;
  if (!arrayOf(values, 6, Number.isFinite)) {
    throw new TypeError('Supply six finite motor activity values.');
  }
  // Centered motor-rate features and an explicit bias. Copying prevents a
  // later neural tick from changing an already sampled training decision.
  return [...values.map(value => clamp(value) * 2 - 1), 1];
}

function probabilitiesFor(weights, features) {
  const logits = weights.map(row => row.reduce((sum, weight, index) => sum + weight * features[index], 0));
  const maximum = Math.max(...logits);
  const exponentials = logits.map(value => Math.exp(value - maximum));
  const sum = exponentials.reduce((total, value) => total + value, 0);
  return exponentials.map(value => value / sum);
}

/** A small contextual policy attached after the six neural motor outputs. */
export class DarkLearner {
  constructor({ seed = 1337, learning = true, learningRate = .08, entropy = .01, state } = {}) {
    if (state !== undefined) { this.importState(state); return; }
    if (!Number.isFinite(seed)) throw new TypeError('seed must be a finite number.');
    this.seed = seed >>> 0;
    this.randomState = this.seed;
    this.learning = boolean(learning, 'learning');
    this.learningRate = numberIn(learningRate, .00001, 1, 'learningRate');
    this.entropy = numberIn(entropy, 0, .2, 'entropy');
    this.weights = DARK_ACTIONS.map(() => Array.from({ length: FEATURE_COUNT }, () => (this.random() - .5) * .08));
    this.updates = 0;
    this.weightChange = 0;
    this.decisions = 0;
    this.baseline = 0;
    this.meanReward = 0;
    this.lastReward = null;
    this.lastFeatures = [0, 0, 0, 0, 0, 0, 1];
    this.lastActionIndex = null;
  }

  random() {
    this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
    let value = Math.imul(this.randomState ^ (this.randomState >>> 15), 1 | this.randomState);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  resetRandom(seed) {
    if (!Number.isFinite(seed)) throw new TypeError('seed must be a finite number.');
    this.randomState = seed >>> 0;
    return this.snapshot();
  }

  choose(activity) {
    const features = featuresFrom(activity);
    const probabilities = probabilitiesFor(this.weights, features);
    const sample = this.random();
    let cumulative = 0, actionIndex = probabilities.length - 1;
    for (let index = 0; index < probabilities.length; index++) {
      cumulative += probabilities[index];
      if (sample < cumulative) { actionIndex = index; break; }
    }
    this.decisions++;
    this.lastFeatures = [...features];
    this.lastActionIndex = actionIndex;
    return { action: DARK_ACTIONS[actionIndex], actionIndex, features, probabilities };
  }

  learn(decision, reward) {
    if (!Number.isFinite(reward)) throw new TypeError('reward must be finite.');
    const { features, probabilities, actionIndex } = decision ?? {};
    if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= DARK_ACTIONS.length
      || !arrayOf(features, FEATURE_COUNT, value => Number.isFinite(value) && value >= -1 && value <= 1) || features[6] !== 1
      || !arrayOf(probabilities, DARK_ACTIONS.length, value => Number.isFinite(value) && value > 0 && value <= 1)
      || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) {
      throw new TypeError('The learning decision is malformed.');
    }
    if (!this.learning) return this.snapshot();
    reward = clamp(reward, -1, 1);
    const advantage = reward - this.baseline;
    const policyEntropy = -probabilities.reduce((sum, probability) => sum + probability * Math.log(probability), 0);
    let weightChange = 0;
    this.weights = this.weights.map((row, index) => {
      const policyGradient = advantage * ((index === actionIndex ? 1 : 0) - probabilities[index]);
      // The entropy gradient gently discourages a single permanently selected
      // action, while the external phrase reward remains the training signal.
      const entropyGradient = -probabilities[index] * (Math.log(probabilities[index]) + policyEntropy);
      return row.map((weight, feature) => {
        const updated = clamp(weight + this.learningRate
          * (policyGradient + this.entropy * entropyGradient) * features[feature], -WEIGHT_LIMIT, WEIGHT_LIMIT);
        weightChange += Math.abs(updated - weight);
        return updated;
      });
    });
    this.updates++;
    this.weightChange += weightChange;
    this.baseline += .04 * (reward - this.baseline);
    this.meanReward += (reward - this.meanReward) / this.updates;
    this.lastReward = reward;
    return this.snapshot();
  }

  setLearning(learning) { this.learning = boolean(learning, 'learning'); return this.snapshot(); }

  snapshot() {
    const probabilities = probabilitiesFor(this.weights, this.lastFeatures);
    return {
      kind: 'trained-musical-readout', learning: this.learning, enabled: this.learning, decisions: this.decisions,
      updates: this.updates, baseline: this.baseline, meanReward: this.meanReward, lastReward: this.lastReward,
      weightChange: this.weightChange,
      lastAction: this.lastActionIndex === null ? null : DARK_ACTIONS[this.lastActionIndex].id,
      policyEntropy: -probabilities.reduce((sum, value) => sum + value * Math.log(value), 0),
      actionProbabilities: DARK_ACTIONS.map((action, index) => ({ id: action.id, label: action.label, probability: probabilities[index] })),
      features: [...this.lastFeatures],
    };
  }

  exportState() {
    return {
      version: STATE_VERSION, actionIds: DARK_ACTIONS.map(action => action.id), featureCount: FEATURE_COUNT,
      seed: this.seed, randomState: this.randomState, learning: this.learning,
      learningRate: this.learningRate, entropy: this.entropy, weights: copyWeights(this.weights),
      updates: this.updates, decisions: this.decisions, weightChange: this.weightChange, baseline: this.baseline,
      meanReward: this.meanReward, lastReward: this.lastReward,
      lastFeatures: [...this.lastFeatures], lastActionIndex: this.lastActionIndex,
    };
  }

  importState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state) || state.version !== STATE_VERSION
      || state.featureCount !== FEATURE_COUNT
      || !arrayOf(state.actionIds, DARK_ACTIONS.length, (id, index) => id === DARK_ACTIONS[index].id)) {
      throw new TypeError('This is not a compatible dark readout state.');
    }
    if (!arrayOf(state.weights, DARK_ACTIONS.length,
      row => arrayOf(row, FEATURE_COUNT, value => Number.isFinite(value) && Math.abs(value) <= WEIGHT_LIMIT))) {
      throw new TypeError('The readout weight matrix is malformed.');
    }
    if (!arrayOf(state.lastFeatures, FEATURE_COUNT, value => Number.isFinite(value) && Math.abs(value) <= 1)
      || state.lastFeatures[6] !== 1
      || (state.lastActionIndex !== null && (!Number.isInteger(state.lastActionIndex)
        || state.lastActionIndex < 0 || state.lastActionIndex >= DARK_ACTIONS.length))) {
      throw new TypeError('The last readout decision is malformed.');
    }
    // Build and validate every value first: a bad import must not partially
    // replace a working performance policy or advance its random stream.
    const validated = {
      seed: numberIn(count(state.seed, 'seed'), 0, 0xffffffff, 'seed'),
      randomState: numberIn(count(state.randomState, 'randomState'), 0, 0xffffffff, 'randomState'),
      learning: boolean(state.learning, 'learning'),
      learningRate: numberIn(state.learningRate, .00001, 1, 'learningRate'),
      entropy: numberIn(state.entropy, 0, .2, 'entropy'), weights: copyWeights(state.weights),
      updates: count(state.updates, 'updates'), decisions: count(state.decisions, 'decisions'),
      weightChange: numberIn(state.weightChange, 0, Number.MAX_SAFE_INTEGER, 'weightChange'),
      baseline: numberIn(state.baseline, -1, 1, 'baseline'), meanReward: numberIn(state.meanReward, -1, 1, 'meanReward'),
      lastReward: state.lastReward === null ? null : numberIn(state.lastReward, -1, 1, 'lastReward'),
      lastFeatures: [...state.lastFeatures], lastActionIndex: state.lastActionIndex,
    };
    Object.assign(this, validated);
    return this.snapshot();
  }
}

/**
 * An explicit aesthetic heuristic, not a listener, genre classifier or measure
 * of objective musical quality. Events are MIDI notes with beat or time (s).
 * A quiet, low, sustained, varied phrase with occasional tension scores well.
 */
export function scoreDarkPhrase(events, durationSeconds) {
  if (!Array.isArray(events)) throw new TypeError('Phrase events must be an array.');
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new TypeError('Phrase duration must be finite and non-negative.');
  const empty = { score: 0, components: { lowRegister: 0, sustain: 0, sparsity: 0, tension: 0, variety: 0, softness: 0, presence: 0 } };
  if (durationSeconds === 0) return empty;
  const notes = events.filter(note => note && Number.isFinite(note.pitch) && note.pitch >= 0 && note.pitch <= 127
    && Number.isFinite(note.duration) && note.duration > 0 && Number.isFinite(note.velocity) && note.velocity > 0)
    .map(note => {
      const start = Number.isFinite(note.time) ? note.time : Number.isFinite(note.beat) ? note.beat * 60 / TEMPO : 0;
      return { ...note, start: Math.max(0, start), end: Math.min(durationSeconds, start + note.duration) };
    }).filter(note => note.start < durationSeconds && note.end > note.start);
  if (!notes.length) return empty;
  const intervals = notes.map(note => [note.start, note.end]).sort((a, b) => a[0] - b[0]);
  let coverage = 0, start = intervals[0][0], end = intervals[0][1];
  for (const interval of intervals.slice(1)) {
    if (interval[0] <= end) end = Math.max(end, interval[1]);
    else { coverage += end - start; [start, end] = interval; }
  }
  coverage += end - start;
  const density = notes.length / durationSeconds;
  const tensionFraction = mean(notes.map(note => [0, 3, 5, 7, 10].includes(Math.round(note.pitch) % 12) ? 0 : 1));
  const components = {
    lowRegister: mean(notes.map(note => clamp((76 - note.pitch) / 28))),
    sustain: mean(notes.map(note => clamp((Math.min(note.duration, 3) - .1) / 2.6))),
    sparsity: Math.exp(-(((density - .45) / .7) ** 2)),
    tension: clamp(1 - Math.abs(tensionFraction - .12) / .3),
    variety: clamp((new Set(notes.map(note => Math.round(note.pitch))).size - 1) / 4),
    softness: mean(notes.map(note => 1 - clamp((note.velocity - 36) / 54))),
    presence: Math.sqrt(clamp(coverage / durationSeconds / .65)),
  };
  const weighted = components.lowRegister * .22 + components.sustain * .2 + components.sparsity * .22
    + components.tension * .1 + components.variety * .14 + components.softness * .12;
  // Coverage makes all-rest and near-silence lose. The variety factor also
  // prevents a permanent lone root from receiving the best possible reward.
  return { score: clamp(weighted * components.presence * (.78 + .22 * components.variety)), components };
}
