import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/g).at(-1).slice(8, -9);

async function dashboard({ recording = false, delayEnergy = false } = {}) {
  class Element {
    constructor(dataset = {}) {
      this.dataset = dataset; this.style = {}; this.attributes = {}; this.handlers = {};
      this.classList = { toggle() {}, add() {}, remove() {} }; this.parentElement = this;
    }
    addEventListener(name, callback) { this.handlers[name] = callback; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append() {}
    getBoundingClientRect() { return { width: 400, height: 280 }; }
    querySelector() { return null; }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const energy = ['calm', 'lively', 'wild'].map(value => new Element({ energy: value }));
  const modes = ['ambient', 'fruit', 'strings'].map(instrumentMode => new Element({ instrumentMode }));
  const fruits = ['banana', 'apple', 'grape'].map(fruit => new Element({ fruit }));
  const requests = [];
  let releaseEnergy;
  const energyGate = new Promise(resolve => { releaseEnergy = resolve; });
  let state = {
    mode: 'live', connection: true, prepared: true, running: true,
    brain: { flyCount: 12, fruits: [{ id: 'fruit-1' }], flies: [] },
    music: { instrumentMode: 'ambient', energy: 'calm', modeRevision: 0, noteCount: 0, recentNotes: [] },
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
      createDemoRecorder: () => ({ active: recording, stopping: false }), addEventListener() {},
    },
    navigator: {}, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {},
    async fetch(url, options) {
      if (url === '/api/action') {
        const payload = JSON.parse(options.body); requests.push(payload);
        if (payload.action === 'energy') {
          if (delayEnergy) await energyGate;
          state = { ...state, music: { ...state.music, energy: payload.energy } };
        }
      }
      return { ok: true, json: async () => structuredClone(state) };
    },
  };
  vm.runInNewContext(script, sandbox);
  await setImmediate();
  return { elements, energy, modes, requests, releaseEnergy };
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
