import test from 'node:test';
import assert from 'node:assert/strict';
import { DARK_ACTIONS, DarkLearner, scoreDarkPhrase } from '../src/dark-learner.js';

const activity = [.04, .12, .3, .25, .15, .05];
const preference = (learner, index) => learner.snapshot().actionProbabilities[index].probability;
const note = (pitch, time, duration = 2.9, velocity = 44) => ({ pitch, time, duration, velocity });

test('positive and negative rewards move the sampled preference in opposite directions', () => {
  const positive = new DarkLearner({ seed: 42, entropy: 0 });
  const negative = new DarkLearner({ seed: 42, entropy: 0 });
  const decision = positive.choose(activity), other = negative.choose(activity);
  assert.deepEqual(decision, other);
  const before = preference(positive, decision.actionIndex);
  positive.learn(decision, 1); negative.learn(other, -1);
  assert.ok(preference(positive, decision.actionIndex) > before);
  assert.ok(preference(negative, decision.actionIndex) < before);
  assert.equal(positive.snapshot().updates, 1);
  assert.equal(positive.snapshot().lastReward, 1);
  assert.notDeepEqual(positive.exportState().weights, negative.exportState().weights);
});

test('a frozen policy samples but learning cannot change weights, statistics or RNG', () => {
  const learner = new DarkLearner({ seed: 22 });
  const decision = learner.choose(activity);
  learner.setLearning(false);
  const before = learner.exportState();
  learner.learn(decision, 1);
  assert.deepEqual(learner.exportState(), before);
  learner.choose(activity);
  assert.deepEqual(learner.exportState().weights, before.weights);
  assert.equal(learner.snapshot().decisions, before.decisions + 1);
  assert.throws(() => learner.setLearning('false'), /boolean/);
});

test('resetting the random stream supports paired evaluation without resetting training', () => {
  const learner = new DarkLearner({ seed: 66 });
  learner.learn(learner.choose(activity), .8);
  const before = learner.exportState();
  learner.resetRandom(909);
  assert.deepEqual(learner.exportState(), { ...before, randomState: 909 });
  const first = learner.choose(activity);
  learner.resetRandom(909);
  assert.deepEqual(learner.choose(activity), first);
  const unchanged = learner.exportState();
  assert.throws(() => learner.resetRandom(Infinity), TypeError);
  assert.deepEqual(learner.exportState(), unchanged);
  assert.equal(learner.snapshot().enabled, true);
  assert.ok(learner.snapshot().weightChange > 0);
});

test('seeded initialization and continuation through a serialized state are reproducible', () => {
  const original = new DarkLearner({ seed: 987 });
  const twin = new DarkLearner({ seed: 987 });
  assert.deepEqual(original.exportState(), twin.exportState());
  for (let index = 0; index < 20; index++) original.learn(original.choose(activity), Math.sin(index));
  const state = JSON.parse(JSON.stringify(original.exportState()));
  const restored = new DarkLearner({ state });
  assert.deepEqual(original.snapshot(), restored.snapshot());
  for (let index = 0; index < 30; index++) {
    const first = original.choose(activity), second = restored.choose(activity);
    assert.deepEqual(first, second);
    original.learn(first, .25); restored.learn(second, .25);
  }
  assert.deepEqual(original.exportState(), restored.exportState());
  state.weights[0][0] = 999;
  assert.ok(Math.abs(restored.exportState().weights[0][0]) <= 8);
});

test('malformed imports are rejected atomically and exports are detached', () => {
  const learner = new DarkLearner({ seed: 91 });
  learner.learn(learner.choose(activity), .8);
  const before = learner.exportState();
  const mutations = [
    state => { state.version = 2; }, state => { state.actionIds.reverse(); },
    state => { state.weights[1][1] = NaN; }, state => { state.weights[0].pop(); },
    state => { delete state.weights[0][0]; }, state => { delete state.weights[1]; },
    state => { delete state.actionIds[0]; },
    state => { state.learning = 'yes'; }, state => { state.baseline = Infinity; },
    state => { state.lastFeatures[6] = 0; }, state => { state.lastActionIndex = 10; },
    state => { state.randomState = -1; }, state => { state.meanReward = 2; },
    state => { state.decisions = 1.5; }, state => { delete state.lastReward; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(before); mutate(invalid);
    assert.throws(() => learner.importState(invalid), TypeError);
    assert.deepEqual(learner.exportState(), before);
  }
  const detached = learner.exportState(); detached.weights[0][0] = -8; detached.lastFeatures[0] = 1;
  assert.deepEqual(learner.exportState(), before);
});

test('held-out motor activity and training seeds keep every authored action and probability bounded', () => {
  for (const seed of [7, 331, 8901]) {
    const learner = new DarkLearner({ seed });
    for (let tick = 0; tick < 600; tick++) {
      const motors = Array.from({ length: 6 }, (_, index) => Math.sin(tick * .31 + index * seed) * .7 + .2);
      const unchanged = [...motors];
      const decision = learner.choose(motors);
      assert.deepEqual(motors, unchanged, 'the readout cannot mutate neural features');
      assert.equal(decision.features.length, 7);
      assert.equal(decision.features[6], 1);
      assert.equal(decision.action, DARK_ACTIONS[decision.actionIndex]);
      assert.ok(decision.probabilities.every(value => Number.isFinite(value) && value > 0 && value <= 1));
      assert.ok(Math.abs(decision.probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
      learner.learn(decision, tick % 3 ? 1000 : -1000);
    }
    assert.ok(learner.exportState().weights.flat().every(value => Number.isFinite(value) && Math.abs(value) <= 8));
  }
  for (const action of DARK_ACTIONS) {
    assert.ok(Object.isFrozen(action) && Object.isFrozen(action.pitches));
    assert.ok(action.pitches.every(pitch => Number.isInteger(pitch) && pitch >= 48 && pitch <= 84));
    assert.ok(action.duration >= .1 && action.duration <= 3);
    assert.ok(action.velocity >= 1 && action.velocity <= 90);
    assert.ok(action.brightness >= 0 && action.brightness <= 1 && action.space >= 0 && action.space <= 1);
  }
});

test('invalid neural decisions and rewards cannot poison the readout', () => {
  const learner = new DarkLearner();
  for (const value of [[], Array(6), [1, 2, 3, 4, 5, NaN], null]) assert.throws(() => learner.choose(value), TypeError);
  const decision = learner.choose(activity), before = learner.exportState();
  assert.throws(() => learner.learn(decision, NaN), TypeError);
  assert.throws(() => learner.learn({ ...decision, probabilities: Array(10).fill(0) }, .5), TypeError);
  assert.throws(() => learner.learn({ ...decision, actionIndex: 99 }, .5), TypeError);
  assert.deepEqual(learner.exportState(), before);
});

test('the declared dark heuristic prefers a varied sparse drone over silence, repetition and bright activity', () => {
  const balanced = [note(48, 0), note(51, 0), note(55, 4), note(48, 8), note(49, 12), note(58, 16)];
  const constant = [0, 4, 8, 12, 16].map(time => note(48, time));
  const busy = Array.from({ length: 100 }, (_, index) => note(72 + index % 12, index / 5, .2, 85));
  const score = scoreDarkPhrase(balanced, 20);
  assert.equal(scoreDarkPhrase([], 20).score, 0);
  assert.ok(score.score > scoreDarkPhrase(constant, 20).score);
  assert.ok(score.score > scoreDarkPhrase(busy, 20).score);
  assert.ok(score.score > scoreDarkPhrase([note(48, 0, .1)], 20).score);
  for (const result of [score, scoreDarkPhrase(busy, 20), scoreDarkPhrase(constant, 20)]) {
    assert.ok(result.score >= 0 && result.score <= 1);
    assert.ok(Object.values(result.components).every(value => value >= 0 && value <= 1));
  }
});

test('phrase scoring accepts beat timestamps, clips coverage at the phrase edge and rejects bad duration', () => {
  const seconds = [note(48, 0), note(51, 2.5), note(49, 5)];
  const beats = seconds.map(({ time, ...entry }) => ({ ...entry, beat: time * 96 / 60 }));
  assert.deepEqual(scoreDarkPhrase(seconds, 6), scoreDarkPhrase(beats, 6));
  assert.equal(scoreDarkPhrase([note(48, 99)], 6).score, 0);
  assert.equal(scoreDarkPhrase(seconds, 0).score, 0);
  assert.throws(() => scoreDarkPhrase(seconds, NaN), TypeError);
  assert.throws(() => scoreDarkPhrase(seconds, -1), TypeError);
});
