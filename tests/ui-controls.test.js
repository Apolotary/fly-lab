import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/g).at(-1).slice(8, -9);

async function dashboard({ recording = false, delayEnergy = false, delayLearning = false, mode = 'ambient', connectionMode = 'live', notes = [], training = {} } = {}) {
  class Element {
    constructor(dataset = {}) {
      this.dataset = dataset; this.style = {}; this.attributes = {}; this.handlers = {};
      const classes = new Set();
      this.classList = {
        toggle(name, enabled = !classes.has(name)) { if (enabled) classes.add(name); else classes.delete(name); return enabled; },
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); },
      }; this.parentElement = this;
    }
    addEventListener(name, callback) { this.handlers[name] = callback; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append() {}
    getBoundingClientRect() { return { width: 400, height: 280 }; }
    querySelector() { return null; }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const energy = ['calm', 'lively', 'wild'].map(value => new Element({ energy: value }));
  const modes = ['dark', 'tombola', 'ambient', 'fruit', 'strings'].map(instrumentMode => new Element({ instrumentMode }));
  const fruits = ['banana', 'apple', 'grape'].map(fruit => new Element({ fruit }));
  const requests = [], recordings = [];
  let releaseEnergy;
  const energyGate = new Promise(resolve => { releaseEnergy = resolve; });
  let releaseLearning;
  const learningGate = new Promise(resolve => { releaseLearning = resolve; });
  let state = {
    mode: connectionMode, connection: true, prepared: true, running: true,
    brain: { flyCount: mode === 'dark' ? 1 : 12, fruits: [{ id: 'fruit-1' }], flies: [], tombola: { speed: .65, bounce: .8, gravity: .15, totalHits: 0 } },
    music: { instrumentMode: mode, scale: 'pentatonic', energy: 'calm', modeRevision: 0, noteCount: notes.length, recentNotes: notes,
      training: { enabled: true, updates: 0, history: [], ...training }, decisionLabel: 'Low drone · minor color', ambience: { activity: .35, brightness: .2, space: .82, pan: -.3 } },
  };
  const scene = () => ({ resize() {}, update() {}, dispose() {}, setFruitKind() {} });
  const sandbox = {
    console, AbortController, AbortSignal, URL, Blob, Uint8Array,
    document: {
      getElementById(id) { assert.ok(elements.has(id), `Missing dashboard element: ${id}`); return elements.get(id); },
      createElement: () => new Element(), body: new Element(), hidden: false, addEventListener() {},
      querySelectorAll: selector => selector === '[data-energy]' ? energy : selector === '[data-instrument-mode]' ? modes : selector === '[data-fruit]' ? fruits : [],
    },
    window: {
      AudioContext() { throw new Error('Live controls must not start preview audio.'); },
      createBrainScene: scene, createFlyScene: scene,
      createDemoRecorder: () => ({ active: recording, stopping: false, start(options) { recordings.push(options); this.active = true; } }), addEventListener() {},
    },
    navigator: {}, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {},
    async fetch(url, options) {
      if (url === '/api/action') {
        const payload = JSON.parse(options.body); requests.push(payload);
        if (payload.action === 'energy') {
          if (delayEnergy) await energyGate;
          state = { ...state, music: { ...state.music, energy: payload.energy } };
        }
        if (payload.action === 'tombola') { const { action, ...fields } = payload; state = { ...state, brain: { ...state.brain, tombola: { ...state.brain.tombola, ...fields } } }; }
        if (payload.action === 'scale') state = { ...state, music: { ...state.music, scale: payload.scale } };
        if (payload.action === 'learning') {
          if (delayLearning) await learningGate;
          state = { ...state, music: { ...state.music, training: { ...state.music.training, enabled: payload.enabled } } };
        }
        if (payload.action === 'reward') state = { ...state, music: { ...state.music, training: { ...state.music.training, lastReward: payload.value } } };
      }
      return { ok: true, json: async () => structuredClone(state) };
    },
  };
  vm.runInNewContext(script, sandbox);
  await setImmediate();
  return { elements, energy, modes, requests, releaseEnergy, releaseLearning, recordings, body: sandbox.document.body };
}

test('energy changes wait for the server before selecting a button and use the energy action', async () => {
  const f = await dashboard({ delayEnergy: true });
  assert.equal(f.energy[0].attributes['aria-pressed'], 'true');
  const changing = f.energy[2].handlers.click();
  assert.deepEqual(f.requests, [{ action: 'energy', energy: 'wild' }]);
  assert.equal(f.energy[0].attributes['aria-pressed'], 'true', 'the current server state remains selected while saving');
  assert.equal(f.energy[2].attributes['aria-pressed'], 'false');
  assert.ok(f.energy.every(button => button.disabled));
  f.releaseEnergy(); await changing;
  assert.equal(f.energy[2].attributes['aria-pressed'], 'true');
  assert.ok(f.energy.every(button => !button.disabled));
  assert.match(f.elements.get('world-caption').textContent, /Fast movement.*busy ripples/);
});

test('Tombola controls remain playable during recording and send only the changed physics field', async () => {
  const f = await dashboard({ recording: true, mode: 'tombola' });
  assert.equal(f.elements.get('tombola-controls').hidden, false);
  assert.match(f.elements.get('world-caption').textContent, /Toy physics.*motor-driven steering.*wall hits/);
  assert.ok(f.modes.every(button => button.disabled));
  for (const [field, value, label] of [['speed', '-1.25', '-1.25'], ['bounce', '0.4', '40%'], ['gravity', '0.65', '65%']]) {
    const control = f.elements.get('tombola-' + field);
    assert.equal(control.disabled, false);
    control.value = value; control.handlers.input();
    assert.equal(f.elements.get('tombola-' + field + '-value').textContent, label);
    await control.handlers.change();
    assert.deepEqual(f.requests.at(-1), { action: 'tombola', [field]: Number(value) });
    assert.equal(control.value, String(Number(value)));
  }
  const scale = f.elements.get('tombola-scale');
  assert.equal(scale.disabled, false); scale.value = 'minor'; await scale.handlers.change();
  assert.deepEqual(f.requests.at(-1), { action: 'scale', scale: 'minor' });
  assert.match(f.elements.get('route-label').textContent, /MINOR/);
});

test('the chamber controls and credit are hidden in other instruments', async () => {
  const f = await dashboard();
  assert.equal(f.elements.get('tombola-controls').hidden, true);
  assert.equal(f.elements.get('tombola-credit').hidden, true);
  assert.equal(f.elements.get('ambient-credit').hidden, false);
});

test('Tombola readouts and preview instructions describe wall collisions before and after a note', async () => {
  const empty = await dashboard({ mode: 'tombola', connectionMode: 'demo' });
  assert.equal(empty.elements.get('string-value').textContent, 'ONE NOTE PER FLY');
  assert.match(empty.elements.get('instructions').textContent, /Wall hits play notes/);
  assert.match(empty.elements.get('gesture-value').textContent, /PENTATONIC/);
  const hit = await dashboard({ mode: 'tombola', notes: [{ id: 1, instrumentMode: 'tombola', flyId: 'fly-3', wall: 2, pitch: 67, velocity: 80, beat: 1 }] });
  assert.equal(hit.elements.get('string-value').textContent, 'FLY 03 · WALL 3');
  assert.equal(hit.elements.get('pitch-value').textContent, 'G4');
  assert.ok(!/string/i.test(hit.elements.get('instructions').textContent));
});

test('energy and fresh food remain playable during a video take while instrument and share changes stay locked', async () => {
  const f = await dashboard({ recording: true });
  assert.ok(f.energy.every(button => !button.disabled));
  assert.equal(f.elements.get('refresh-fruit').disabled, false);
  assert.equal(f.elements.get('clear-fruit').disabled, false);
  assert.equal(f.elements.get('panic').disabled, false);
  assert.ok(f.modes.every(button => button.disabled));
  assert.equal(f.elements.get('capture').disabled, true);
  await f.energy[1].handlers.click();
  await f.elements.get('refresh-fruit').handlers.click();
  assert.deepEqual(f.requests, [{ action: 'energy', energy: 'lively' }, { action: 'refreshFruit' }]);
  assert.equal(f.energy[1].attributes['aria-pressed'], 'true');
});

test('Dark lab shows one measured circuit, server scores and a separate learned musical readout', async () => {
  const f = await dashboard({ mode: 'dark', training: { updates: 7, episodes: 9, lastScore: .62, baselineScore: .41, trainedScore: .68, weightChange: .12345, history: [{ episode: 1, score: .25 }, { episode: 2, score: .75 }] } });
  assert.equal(f.elements.get('dark-controls').hidden, false);
  assert.equal(f.elements.get('dark-credit').hidden, false);
  assert.equal(f.elements.get('tombola-controls').hidden, true);
  assert.equal(f.elements.get('ambient-credit').hidden, true);
  assert.equal(f.elements.get('route-label').textContent, 'DARK LAB · ONE FLY');
  assert.equal(f.elements.get('start').textContent, '1 fly exploring');
  assert.equal(f.elements.get('string-value').textContent, 'ONE MOTOR CIRCUIT');
  assert.equal(f.elements.get('dark-score').textContent, '62%');
  assert.equal(f.elements.get('dark-updates').textContent, '7 updates');
  assert.equal(f.elements.get('dark-weight-change').textContent, 'Weight movement 0.123');
  assert.equal(f.elements.get('dark-comparison').textContent, 'Held-out score 41% → 68%');
  assert.equal(f.elements.get('dark-history').attributes.points, '2.0,27.0 98.0,11.0');
  assert.equal(f.elements.get('world-caption').textContent, 'One measured motor circuit · trainable musical readout');
  assert.match(f.elements.get('instructions').textContent, /Learning updates musical weights after each phrase/);
});

test('feedback works while learning during a recording and freezing waits for the server then disables feedback', async () => {
  const f = await dashboard({ recording: true, mode: 'dark', delayLearning: true, training: { lastAction: 'root' } });
  const learning = f.elements.get('dark-learning'), reward = f.elements.get('dark-reward'), reject = f.elements.get('dark-reject');
  assert.equal(learning.disabled, false);
  assert.equal(reward.disabled, false);
  assert.equal(reject.disabled, false);
  assert.ok(f.modes.every(button => button.disabled));
  await reward.handlers.click(); await reject.handlers.click();
  assert.deepEqual(f.requests, [{ action: 'reward', value: 1 }, { action: 'reward', value: -1 }]);
  assert.match(f.elements.get('dark-decision').textContent, /discouraged/);
  const freezing = learning.handlers.click();
  assert.deepEqual(f.requests.at(-1), { action: 'learning', enabled: false });
  assert.equal(learning.attributes['aria-pressed'], 'true');
  assert.equal(learning.disabled, true);
  assert.equal(reward.disabled, true);
  assert.equal(reject.disabled, true);
  f.releaseLearning(); await freezing;
  assert.equal(learning.attributes['aria-pressed'], 'false');
  assert.equal(learning.textContent, 'Start learning');
  assert.match(f.elements.get('dark-status').textContent, /Frozen.*weights stay fixed/);
  assert.equal(reward.disabled, true, 'frozen musical weights cannot receive preference updates');
  assert.equal(reject.disabled, true);
  await learning.handlers.click();
  assert.deepEqual(f.requests.at(-1), { action: 'learning', enabled: true });
  assert.equal(reward.disabled, false, 'resuming learning restores feedback for the known action');
  assert.equal(reject.disabled, false);
});

test('missing scores are unknown and the learning controls are hidden outside Dark lab', async () => {
  const dark = await dashboard({ mode: 'dark' });
  assert.equal(dark.elements.get('dark-score').textContent, '—');
  assert.equal(dark.elements.get('dark-history').attributes.points, '');
  assert.equal(dark.elements.get('dark-comparison').textContent, 'Authored preferences · no audio listening');
  assert.equal(dark.elements.get('dark-reward').disabled, true, 'there is no musical choice to reward yet');
  assert.equal(dark.elements.get('dark-reject').disabled, true);
  const ambient = await dashboard();
  assert.equal(ambient.elements.get('dark-controls').hidden, true);
  assert.equal(ambient.elements.get('dark-credit').hidden, true);
  assert.equal(ambient.elements.get('dark-learning').disabled, true);
});

test('monochrome defaults on, follows the local toggle and locks the chosen recorder style during a take', async () => {
  const f = await dashboard({ mode: 'dark' }), toggle = f.elements.get('monochrome');
  assert.equal(toggle.attributes['aria-pressed'], 'true');
  assert.equal(toggle.textContent, 'Monochrome');
  assert.equal(f.body.classList.contains('is-monochrome'), true);
  await toggle.handlers.click();
  assert.equal(toggle.attributes['aria-pressed'], 'false');
  assert.equal(toggle.textContent, 'Color');
  assert.equal(f.body.classList.contains('is-monochrome'), false);
  assert.equal(f.requests.length, 0, 'appearance does not change the simulation or send MIDI actions');
  await f.elements.get('record-video').handlers.click();
  assert.equal(f.recordings.length, 1);
  assert.equal(f.recordings[0].monochrome, false);
  assert.equal(f.recordings[0].source, 'shared');
  assert.equal(toggle.disabled, true);
  await toggle.handlers.click();
  assert.equal(toggle.attributes['aria-pressed'], 'false', 'the visible style cannot diverge from an active recording');
  const defaultTake = await dashboard();
  await defaultTake.elements.get('record-video').handlers.click();
  assert.equal(defaultTake.recordings[0].monochrome, true);
});
