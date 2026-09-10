import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRecorder } from '../ui/recorder.js';

// Browser boundaries are faked here; the real recorder owns its lifecycle and
// chooses formats, source tracks, completion messages, and download contents.
function fixture(context, { format = 'video/webm' } = {}) {
  const instances = [], downloads = [], blobs = [], changes = [], labels = [];
  const timers = new Map();
  let clock = 0, nextTimer = 0;
  class Track {
    constructor(kind = 'audio') { this.kind = kind; this.readyState = 'live'; this.stopCalls = 0; this.listeners = new Map(); }
    clone() { return new Track(this.kind); }
    stop() { this.stopCalls++; this.readyState = 'ended'; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    end() { this.readyState = 'ended'; this.listeners.get('ended')?.(); }
  }
  class Stream {
    constructor(tracks = []) { this.tracks = tracks; }
    addTrack(track) { this.tracks.push(track); }
    getTracks() { return this.tracks; }
  }
  const drawing = { fillRect() {}, strokeRect() {}, drawImage() {}, fillText(value) { labels.push(value); } };
  class Canvas {
    constructor() { this.width = 1280; this.height = 720; this.hidden = false; this.style = {}; }
    getContext() { return drawing; }
    captureStream() { return new Stream([new Track('video')]); }
  }
  class Recorder {
    static isTypeSupported(type) { return type.startsWith(format); }
    constructor(stream, options) {
      this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; this.listeners = new Map(); instances.push(this);
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    start() { this.state = 'recording'; }
    stop() {
      assert.equal(this.state, 'recording', 'the recording should stop only once');
      this.state = 'inactive';
      queueMicrotask(() => {
        this.listeners.get('dataavailable')({ data: new Blob(['captured media'], { type: this.mimeType }) });
        this.listeners.get('stop')();
      });
    }
  }
  const replacements = {
    document: { createElement: type => type === 'canvas' ? new Canvas() : {
      click() { downloads.push({ filename: this.download, href: this.href }); }, remove() {},
    }, body: { append() {} } },
    HTMLCanvasElement: Canvas,
    MediaRecorder: Recorder,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, due: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const descriptors = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, replacements);
  context.mock.method(URL, 'createObjectURL', blob => { blobs.push(blob); return `blob:recording-${blobs.length}`; });
  context.mock.method(URL, 'revokeObjectURL', () => {});
  context.after(async () => {
    instances.filter(item => item.state === 'recording').forEach(item => item.stop());
    await Promise.resolve();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const create = options => createDemoRecorder({
    getState: () => ({ mode: 'live', running: true, music: { instrumentMode: 'fruit', noteCount: 17, tempo: 96 } }),
    brainCanvas: new Canvas(), flyCanvas: new Canvas(), onChange: state => changes.push(state), ...options,
  });
  function advance(milliseconds) {
    clock += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.due <= clock) { timers.delete(id); timer.callback(); }
  }
  return { Track, Canvas, create, advance, instances, downloads, blobs, changes, labels };
}

test('stopping a recording releases its cloned tracks without stopping the shared source', async context => {
  const f = fixture(context), originalAudio = new f.Track(), originalVideo = new f.Track('video');
  const recorder = f.create();
  recorder.start({ audioTracks: [originalAudio, originalVideo], source: 'shared' });
  const recordedTracks = f.instances[0].stream.getTracks();
  assert.equal(recordedTracks.length, 2, 'one canvas video and one audio track');
  assert.notEqual(recordedTracks[1], originalAudio);
  recorder.stop(); recorder.stop();
  await Promise.resolve();
  assert.equal(recorder.active, false);
  assert.ok(recordedTracks.every(track => track.stopCalls === 1));
  assert.equal(originalAudio.stopCalls, 0);
  assert.equal(originalVideo.stopCalls, 0);
  assert.equal(f.downloads.length, 1);
});

test('lost shared audio stops and saves the completed recording with an explicit reason', async context => {
  const f = fixture(context), originalAudio = new f.Track(), recorder = f.create();
  recorder.start({ audioTracks: [originalAudio], source: 'shared' });
  f.instances[0].stream.getTracks().find(track => track.kind === 'audio').end();
  await Promise.resolve();
  assert.equal(recorder.active, false);
  assert.equal(f.changes.at(-1).saved, true);
  assert.match(f.changes.at(-1).message, /Shared audio ended/);
  assert.equal(originalAudio.stopCalls, 0);
  assert.equal(f.downloads.length, 1);
});

test('missing, hidden, or empty 3D canvases cannot start a blank recording', context => {
  const f = fixture(context);
  for (const brainCanvas of [null, Object.assign(new f.Canvas(), { hidden: true }), Object.assign(new f.Canvas(), { width: 0 }), Object.assign(new f.Canvas(), { style: { display: 'none' } })]) {
    assert.throws(() => f.create({ brainCanvas }).start(), /Both 3D views must be available/);
  }
  assert.equal(f.instances.length, 0);
  assert.equal(f.downloads.length, 0);
});

test('recording downloads contain the emitted media and use the supported container extension', async context => {
  for (const [format, extension] of [['video/webm', 'webm'], ['video/mp4', 'mp4']]) await context.test(format, async child => {
    const f = fixture(child, { format }), recorder = f.create();
    recorder.start(); recorder.stop();
    await Promise.resolve();
    assert.match(f.downloads[0].filename, new RegExp(`^fly-lab-.*\\.${extension}$`));
    assert.equal(f.downloads[0].href, 'blob:recording-1');
    assert.ok(f.blobs[0].type.startsWith(format));
    assert.equal(await f.blobs[0].text(), 'captured media');
    assert.equal(f.changes.at(-1).audioSource, 'none');
    assert.ok(f.labels.some(label => label.startsWith('VIDEO ONLY · NO AUDIO CAPTURED')));
  });
});

test('the two-minute limit finalizes one recording and clears its active state', async context => {
  const f = fixture(context), recorder = f.create();
  recorder.start();
  f.advance(119_999); assert.equal(recorder.active, true);
  f.advance(1);
  await Promise.resolve();
  assert.equal(recorder.active, false);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.changes.at(-1).message, 'Two-minute recording saved.');
  f.advance(120_000);
  assert.equal(f.downloads.length, 1);
});

test('a Tombola take records its current physics and scale without ambient or fruit-note claims', async context => {
  const f = fixture(context), recorder = f.create({
    getState: () => ({ mode: 'live', running: true, brain: { flyCount: 12, tombola: { speed: -1.25, bounce: .8, gravity: .15 } }, music: { instrumentMode: 'tombola', scale: 'minor', noteCount: 17, tempo: 96 } }),
    video: { srcObject: {}, readyState: 2, videoWidth: 1200, videoHeight: 800 },
  });
  recorder.start();
  assert.ok(f.labels.includes('FLY TOMBOLA'));
  assert.ok(f.labels.some(label => label.includes('12 FLIES · THE CHAMBER')));
  assert.ok(f.labels.some(label => label.includes('C MINOR') && label.includes('SPIN -1.25') && label.includes('BOUNCE 80%') && label.includes('GRAVITY 15%')));
  assert.ok(f.labels.some(label => label.includes('TOY PHYSICS') && label.includes('EXTERNAL SPIN / GRAVITY')));
  assert.ok(!f.labels.some(label => /AUTHORED|BANANA C4|SIX STRINGS/.test(label)));
  recorder.stop(); await Promise.resolve();
});

test('a Dark lab take exposes learned-readout scores without claiming biological musical learning', async context => {
  const f = fixture(context);
  let enabled = true;
  const recorder = f.create({
    getState: () => ({ mode: 'live', running: true, brain: { flyCount: 1 }, music: { instrumentMode: 'dark', noteCount: 12, tempo: 60,
      training: { enabled, updates: 4, lastScore: .72, weightChange: .125 } } }),
    video: { srcObject: {}, readyState: 2, videoWidth: 1200, videoHeight: 800 },
  });
  recorder.start();
  assert.ok(f.labels.includes('FLY LAB'));
  assert.ok(f.labels.includes('for Ableton Live'));
  assert.ok(f.labels.some(label => label.includes('Independent project') && label.includes('not affiliated')));
  assert.ok(f.labels.includes('DARK LAB · ONE FLY'));
  assert.ok(f.labels.some(label => label.includes('1 FLY · NIGHT GARDEN')));
  assert.ok(f.labels.some(label => label.includes('PHRASE SCORE 72%') && label.includes('4 UPDATES') && label.includes('WEIGHT MOVEMENT 0.125')));
  assert.ok(f.labels.includes('TRAINING MUSICAL READOUT'));
  assert.ok(f.labels.some(label => label.includes('AUTHORED PREFERENCES, NOT AUDIO LISTENING')));
  assert.ok(!f.labels.some(label => /BANANA C4|SIX STRINGS|FLY TOMBOLA|AMBIENT SWARM/.test(label)));
  enabled = false; recorder.draw();
  assert.ok(f.labels.includes('FROZEN MUSICAL READOUT'));
  recorder.stop(); await Promise.resolve();
});
