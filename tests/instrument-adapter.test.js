import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveInstrumentAdapter, PreviewInstrumentAdapter } from '../src/instrument-adapter.js';
import { MAX_BEATS, TEMPO } from '../src/midi-file.js';

function fixture() {
  const created = [], calls = [];
  const failures = { sampleOnce: false, clipOnce: false, reverbOnce: false, parameterOnce: null, clipNameOnce: false };
  const parameter = (name, min, max, value) => ({ name, min, max, value,
    async setValue(next) {
      if (failures.parameterOnce === name) { failures.parameterOnce = null; throw new Error('parameter failed'); }
      assert.ok(Number.isFinite(next) && next >= this.min && next <= this.max, `${name} received an invalid SDK value`);
      this.value = next;
      calls.push(['parameter', name, next]);
    } });
  const unrelated = { name: 'Fly Instrument', arm: true, mute: false };
  let tempo = 120;
  const song = {
    get tracks() { throw new Error('Do not inspect unrelated tracks.'); },
    get tempo() { return tempo; },
    set tempo(value) { tempo = value; calls.push(['tempo', value]); },
    async createMidiTrack() {
      const track = {
        name: 'New track', arm: true, mute: false, devices: [], clips: [],
        mixer: { volume: parameter('Volume', 0, 1, 1), panning: parameter('Pan', 0, 1, .5) },
        async insertDevice(name, index) {
          if (name === 'Reverb' && failures.reverbOnce) { failures.reverbOnce = false; throw new Error('Reverb failed'); }
          const device = { name, index, loads: 0, async replaceSample(path) {
            this.loads++;
            if (failures.sampleOnce) { failures.sampleOnce = false; throw new Error('sample failed'); }
            this.samplePath = path;
          } };
          // Live's extension SDK exposes normalized parameter values, even
          // when the interface displays Hz, milliseconds, or percentages.
          device.parameters = name === 'Simpler'
            ? [parameter('Filter Freq', 0, 1, 1), parameter('Ve Attack', 0, 1, 0), parameter('Ve Release', 0, 1, .1)]
            : [parameter('Device On', 0, 1, 1), parameter('Dry/Wet', 0, 1, 0), parameter('Decay Time', 0, 1, .5)];
          this.devices.push(device); this.arm = true;
          return device;
        },
        async createMidiClip(startTime, duration) {
          if (failures.clipOnce) { failures.clipOnce = false; throw new Error('clip failed'); }
          const clip = { startTime, duration, notes: [] };
          let clipName;
          Object.defineProperty(clip, 'name', { get() { return clipName; }, set(value) {
            if (failures.clipNameOnce) { failures.clipNameOnce = false; throw new Error('clip name failed'); }
            clipName = value;
          } });
          this.clips.push(clip);
          return clip;
        },
      };
      created.push(track);
      return track;
    },
  };
  const midi = {
    connected: true,
    panic() { calls.push(['panic']); },
    note(note) { calls.push(['note', { ...note }]); return this.connected; },
    async close() { calls.push(['close']); this.connected = false; },
  };
  const context = { application: { song } };
  const adapter = new LiveInstrumentAdapter(context, { midi, samplePath: '/local/instrument.wav', ambientSamplePath: '/local/ambient.wav' });
  return { adapter, midi, context, song, created, calls, failures, unrelated };
}

test('instrument setup creates one owned sample instrument and clip at 96 BPM', async () => {
  const f = fixture();
  await Promise.all([f.adapter.prepare(), f.adapter.prepare()]);
  assert.equal(f.created.length, 1);
  const track = f.created[0];
  assert.equal(track.name, 'Fly Instrument');
  assert.equal(track.arm, false);
  assert.equal(track.mute, false);
  assert.equal(track.mixer.volume.value, .62);
  assert.equal(track.devices.length, 1);
  assert.equal(track.devices[0].name, 'Simpler');
  assert.equal(track.devices[0].samplePath, '/local/instrument.wav');
  assert.equal(track.clips.length, 1);
  assert.equal(track.clips[0].startTime, 0);
  assert.equal(track.clips[0].duration, MAX_BEATS);
  assert.equal(f.song.tempo, TEMPO);
  assert.equal(f.adapter.prepared, true);
  assert.equal(f.adapter.snapshot().muted, false);
  assert.deepEqual(f.unrelated, { name: 'Fly Instrument', arm: true, mute: false });
  assert.ok(!JSON.stringify(f.adapter.snapshot()).includes('/local/'));
});

test('instrument setup resumes failed sample loading and clip creation without duplicates', async () => {
  for (const failure of ['sampleOnce', 'clipOnce']) {
    const f = fixture();
    f.failures[failure] = true;
    await assert.rejects(f.adapter.prepare(), /failed/);
    assert.equal(f.adapter.prepared, false);
    assert.equal(f.created[0].mute, true);
    assert.equal(f.created[0].arm, false);
    await f.adapter.prepare();
    assert.equal(f.created.length, 1);
    assert.equal(f.created[0].devices.length, 1);
    assert.equal(f.created[0].clips.length, 1);
  }
});

test('retry after Simpler conversion failure reuses the inserted instrument', async () => {
  const f = fixture();
  let conversions = 0;
  f.adapter.resolveSimpler = device => {
    if (++conversions === 1) throw new Error('Simpler conversion failed');
    return device;
  };
  await assert.rejects(f.adapter.prepare(), /Simpler conversion failed/);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].devices.length, 1);
  assert.equal(f.created[0].mute, true);
  assert.equal(f.created[0].arm, false);
  await f.adapter.prepare();
  assert.equal(conversions, 2);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].devices.length, 1);
  assert.equal(f.created[0].devices[0].loads, 1);
  assert.equal(f.created[0].clips.length, 1);
  assert.equal(f.adapter.prepared, true);
});

test('MIDI monitoring arms only the owned track and Stop releases notes immediately', async () => {
  const f = fixture();
  await f.adapter.prepare();
  await f.adapter.start();
  assert.equal(f.created[0].arm, true);
  f.adapter.play([{ pitch: 60, velocity: 70, duration: .25 }]);
  assert.deepEqual(f.calls.at(-1), ['note', { pitch: 60, velocity: 70, duration: .25, channel: 0 }]);
  let finish;
  const inFlight = f.adapter.enqueue(() => new Promise(resolve => { finish = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const stopped = f.adapter.stop();
  assert.deepEqual(f.calls.at(-1), ['panic'], 'note-offs happen before awaiting the SDK queue');
  assert.equal(f.created[0].arm, true);
  finish();
  await Promise.all([inFlight, stopped]);
  assert.equal(f.created[0].arm, false);
  assert.equal(f.unrelated.arm, true);
  assert.equal(f.created[0].mute, false);
});

test('recording captures immutable notes, converts seconds to beats and truncates at clip end', async () => {
  const f = fixture();
  await f.adapter.prepare();
  const notes = [{ pitch: 62, velocity: 77, beat: 2, duration: .5 },
    { pitch: 67, velocity: 63, beat: MAX_BEATS - .1, duration: .5 }];
  const saving = f.adapter.recordNotes(notes);
  notes[0].pitch = 99;
  notes.push({ pitch: 100, velocity: 100, beat: 0, duration: 1 });
  await saving;
  const written = f.created[0].clips[0].notes;
  assert.equal(written.length, 2);
  assert.deepEqual(written[0], { pitch: 62, velocity: 77, startTime: 2, duration: .5 * TEMPO / 60 });
  assert.ok(Math.abs(written[1].duration - .1) < 1e-10);
});

test('Panic mutes and disarms the owned instrument; Start can resume it', async () => {
  const f = fixture();
  await f.adapter.prepare();
  await f.adapter.start();
  await f.adapter.panic();
  assert.equal(f.created[0].arm, false);
  assert.equal(f.created[0].mute, true);
  assert.equal(f.adapter.snapshot().muted, true);
  assert.equal(f.unrelated.mute, false);
  await f.adapter.start();
  assert.equal(f.created[0].arm, true);
  assert.equal(f.created[0].mute, false);
  assert.equal(f.adapter.snapshot().muted, false);
});

test('stale Sets reject track operations while still issuing MIDI note-offs and closing the port', async () => {
  const f = fixture();
  await f.adapter.prepare();
  await f.adapter.start();
  f.context.application.song = { tempo: 140 };
  assert.throws(() => f.adapter.play([{ pitch: 60, velocity: 70, duration: .25 }]), /Live Set changed/);
  await assert.rejects(f.adapter.prepare(), /Live Set changed/);
  await assert.rejects(f.adapter.start(), /Live Set changed/);
  await assert.rejects(f.adapter.recordNotes([]), /Live Set changed/);
  await assert.rejects(f.adapter.panic(), /Live Set changed/);
  assert.deepEqual(f.calls.at(-1), ['panic']);
  assert.equal(f.created[0].arm, true, 'stale objects are not modified');
  await assert.rejects(f.adapter.close(), /Live Set changed/);
  assert.deepEqual(f.calls.at(-1), ['close']);
  assert.equal(f.context.application.song.tempo, 140);
});

test('a missing MIDI port prevents setup or performance and the preview needs preparation', async () => {
  const f = fixture();
  f.midi.connected = false;
  await assert.rejects(f.adapter.prepare(), /not ready/);
  assert.equal(f.created.length, 0);
  f.midi.connected = true;
  await f.adapter.prepare();
  f.midi.connected = false;
  await assert.rejects(f.adapter.start(), /MIDI port/);
  assert.throws(() => f.adapter.play([]), /disconnected/);
  const preview = new PreviewInstrumentAdapter();
  await assert.rejects(preview.start(), /Prepare/);
  await preview.prepare(); await preview.start(); await preview.panic();
  assert.equal(preview.snapshot().muted, true);
  assert.equal(preview.snapshot().midiConnected, false);
});

test('ambient preparation loads the authored sample and exposes only supported effects', async () => {
  const f = fixture();
  await f.adapter.prepare({ mode: 'ambient' });
  const track = f.created[0], [simpler, reverb] = track.devices;
  const value = (device, name) => device.parameters.find(parameter => parameter.name === name).value;
  assert.equal(f.created.length, 1);
  assert.equal(simpler.samplePath, '/local/ambient.wav');
  assert.equal(simpler.loads, 1);
  assert.equal(reverb.name, 'Reverb');
  assert.equal(reverb.index, 1);
  for (const name of ['Ve Attack', 'Ve Release', 'Filter Freq']) {
    assert.ok(value(simpler, name) > 0 && value(simpler, name) < 1, `${name} must not mistake display units for SDK values`);
  }
  assert.equal(value(reverb, 'Dry/Wet'), .42);
  assert.ok(value(reverb, 'Decay Time') > 0 && value(reverb, 'Decay Time') < 1);
  assert.equal(track.mixer.volume.value, .7);
  assert.equal(track.arm, false);
  assert.equal(track.mute, false);
  assert.equal(f.adapter.instrumentMode, 'ambient');
  assert.deepEqual(f.adapter.snapshot().liveControls, { brightness: true, space: true, pan: true });
  assert.match(track.clips[0].name, /ambient/i);
  assert.doesNotMatch(JSON.stringify(f.adapter.snapshot()), /\/local\//);
});

test('mode changes reuse the owned track and recording while restoring contact instrument settings', async () => {
  const f = fixture();
  await f.adapter.prepare();
  const track = f.created[0], clip = track.clips[0], originalNotes = [{ pitch: 60, startTime: 0, duration: 1, velocity: 60 }];
  const contactSettings = track.devices[0].parameters.map(parameter => [parameter.name, parameter.value]);
  clip.notes = originalNotes;
  await f.adapter.setMode('ambient');
  await f.adapter.modulate({ brightness: 1, space: 1, pan: 1 });
  assert.equal(track.devices[0].samplePath, '/local/ambient.wav');
  await f.adapter.setMode('strings');
  const [simpler, reverb] = track.devices;
  const value = (device, name) => device.parameters.find(parameter => parameter.name === name).value;
  assert.equal(f.created.length, 1);
  assert.equal(track.devices.length, 2);
  assert.equal(track.clips[0], clip);
  assert.equal(clip.notes, originalNotes);
  assert.equal(simpler.samplePath, '/local/instrument.wav');
  assert.equal(simpler.loads, 3);
  assert.deepEqual(simpler.parameters.map(parameter => [parameter.name, parameter.value]), contactSettings);
  assert.equal(value(reverb, 'Device On'), 0);
  assert.equal(value(reverb, 'Dry/Wet'), 0);
  assert.equal(track.mixer.panning.value, .5);
  assert.equal(track.mixer.volume.value, .62);
  assert.equal(track.arm, false);
  assert.equal(f.adapter.prepared, true);
  assert.equal(f.adapter.instrumentMode, 'strings');
  assert.deepEqual(f.adapter.snapshot().liveControls, { brightness: false, space: false, pan: false });
  await f.adapter.setMode('fruit');
  assert.equal(simpler.loads, 3, 'two contact modes share the same sample');
  assert.deepEqual(f.unrelated, { name: 'Fly Instrument', arm: true, mute: false });
});

test('ambient effects clamp normalized inputs and SDK bounds and reject nonfinite controls before any writes', async () => {
  const f = fixture();
  await f.adapter.prepare({ mode: 'ambient' });
  const controls = f.adapter.controlParameters;
  await f.adapter.modulate({ brightness: 100, space: -100, pan: 100 });
  const highCutoff = controls.brightness.value;
  assert.ok(highCutoff > 0 && highCutoff < 1);
  assert.ok(Math.abs(controls.space.value - .28) < 1e-10);
  assert.ok(Math.abs(controls.pan.value - .825) < 1e-10);
  await f.adapter.modulate({ brightness: -100, space: 100, pan: -100 });
  const lowCutoff = controls.brightness.value;
  assert.ok(lowCutoff > 0 && lowCutoff < highCutoff);
  assert.ok(Math.abs(controls.space.value - .66) < 1e-10);
  assert.ok(Math.abs(controls.pan.value - .175) < 1e-10);
  // Bounds are stable for a real SDK parameter and are cached. A newly
  // selected parameter object may expose a different interval.
  controls.brightness = { ...controls.brightness, min: .2, max: .8 };
  controls.pan = { ...controls.pan, min: .4, max: .6 };
  await f.adapter.modulate({ brightness: 100, space: .5, pan: 100 });
  assert.ok(Math.abs(controls.brightness.value - (.2 + .6 * highCutoff)) < 1e-10);
  assert.ok(Math.abs(controls.pan.value - (.4 + .2 * .825)) < 1e-10);
  const before = f.calls.length;
  for (const bad of [NaN, Infinity, undefined]) {
    await assert.rejects(f.adapter.modulate({ brightness: .5, space: bad, pan: 0 }), /Invalid ambient/);
  }
  assert.equal(f.calls.length, before, 'validation precedes every SDK parameter write');
  await f.adapter.modulate({ brightness: 0, space: .5, pan: 0 });
  assert.ok(Math.abs(controls.brightness.value - (.2 + .6 * lowCutoff)) < 1e-10, 'a failed modulation cannot poison the SDK queue');
});

test('a failed ambient mode change retains its old identity and requires a safe prepared retry', async () => {
  for (const failure of ['sampleOnce', 'reverbOnce', 'parameterOnce', 'clipNameOnce']) {
    const f = fixture();
    await f.adapter.prepare();
    const track = f.created[0], clip = track.clips[0], originalNotes = [{ pitch: 60, velocity: 70, startTime: 0, duration: 1 }];
    clip.notes = originalNotes;
    f.failures[failure] = failure === 'parameterOnce' ? 'Filter Freq' : true;
    await assert.rejects(f.adapter.setMode('ambient'), /failed/);
    assert.equal(f.adapter.instrumentMode, 'fruit', `${failure}: failed setup must not change the selected mode`);
    assert.equal(f.adapter.prepared, false, `${failure}: partial SDK configuration cannot remain ready`);
    assert.equal(f.adapter.snapshot().muted, true);
    assert.equal(track.mute, true);
    assert.equal(track.arm, false);
    assert.equal(f.adapter.record.sampleReady, false);
    assert.deepEqual(f.adapter.snapshot().liveControls, { brightness: false, space: false, pan: false });
    assert.equal(clip.notes, originalNotes);
    await assert.rejects(f.adapter.start(), /Prepare/);
    await f.adapter.prepare({ mode: 'fruit' });
    assert.equal(f.adapter.prepared, true);
    assert.equal(f.adapter.instrumentMode, 'fruit');
    assert.equal(f.created.length, 1);
    assert.equal(track.clips.length, 1);
    assert.equal(track.devices.filter(device => device.name === 'Simpler').length, 1);
    assert.equal(track.devices[0].samplePath, '/local/instrument.wav');
    assert.equal(clip.notes, originalNotes);
    assert.equal(track.arm, false);
    assert.equal(track.mute, false);
  }
});

test('ambient modulation and mode changes reject stale Sets without touching cached controls', async () => {
  const f = fixture();
  await f.adapter.prepare({ mode: 'ambient' });
  const before = Object.values(f.adapter.controlParameters).map(parameter => parameter.value);
  f.context.application.song = { tempo: 130 };
  await assert.rejects(f.adapter.modulate({ brightness: 1, space: 1, pan: 1 }), /Live Set changed/);
  await assert.rejects(f.adapter.setMode('fruit'), /Live Set changed/);
  assert.deepEqual(Object.values(f.adapter.controlParameters).map(parameter => parameter.value), before);
  assert.equal(f.adapter.instrumentMode, 'ambient');
  assert.equal(f.context.application.song.tempo, 130);
});

test('failed parallel effect writes fully drain before cleanup or a queued prepare can restore the instrument', async () => {
  const f = fixture();
  await f.adapter.prepare();
  const release = f.created[0].devices[0].parameters.find(parameter => parameter.name === 'Ve Release');
  const contactRelease = release.value;
  let finishRelease;
  const blocked = new Promise(resolve => { finishRelease = resolve; });
  release.setValue = async function (value) { if (value !== contactRelease) await blocked; this.value = value; };
  f.failures.parameterOnce = 'Filter Freq';
  let settled = false;
  const changing = f.adapter.setMode('ambient');
  changing.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(changing, /parameter failed/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'an early SDK failure cannot abandon other in-flight writes');
  const restored = f.adapter.prepare({ mode: 'fruit' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(release.value, contactRelease);
  finishRelease();
  await Promise.all([rejected, restored]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.adapter.prepared, true);
  assert.equal(f.adapter.instrumentMode, 'fruit');
  assert.equal(release.value, contactRelease, 'late ambient writes cannot overwrite the restored contact instrument');
  assert.equal(f.created[0].devices[0].samplePath, '/local/instrument.wav');
});

test('missing optional device controls are reported accurately and do not prevent supported modulation', async () => {
  const f = fixture();
  await f.adapter.prepare();
  f.created[0].devices[0].parameters = [];
  f.created[0].mixer.panning = undefined;
  await f.adapter.setMode('ambient');
  assert.deepEqual(f.adapter.snapshot().liveControls, { brightness: false, space: true, pan: false });
  await f.adapter.modulate({ brightness: .5, space: .5, pan: 0 });
  assert.ok(Math.abs(f.adapter.controlParameters.space.value - .47) < 1e-10);
});

test('changing the requested mode after a partial first preparation reloads the matching sample', async () => {
  const f = fixture();
  f.failures.reverbOnce = true;
  await assert.rejects(f.adapter.prepare({ mode: 'ambient' }), /Reverb failed/);
  assert.equal(f.created[0].devices[0].samplePath, '/local/ambient.wav', 'the sample loaded before the effect failed');
  assert.equal(f.adapter.prepared, false);
  await f.adapter.setMode('fruit');
  await f.adapter.prepare({ mode: 'fruit' });
  assert.equal(f.adapter.prepared, true);
  assert.equal(f.adapter.instrumentMode, 'fruit');
  assert.equal(f.created[0].devices[0].samplePath, '/local/instrument.wav');
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].clips.length, 1);
});

test('repeated ambient modulation reads native parameter bounds only once per parameter', async () => {
  const f = fixture();
  await f.adapter.prepare({ mode: 'ambient' });
  const reads = {};
  const controls = Object.fromEntries(['brightness', 'space', 'pan'].map(name => {
    reads[name] = { min: 0, max: 0, writes: 0 };
    return [name, {
      get min() { reads[name].min++; return 0; },
      get max() { reads[name].max++; return 1; },
      async setValue(value) {
        assert.ok(value >= 0 && value <= 1);
        reads[name].writes++;
        this.value = value;
      },
    }];
  }));
  f.adapter.controlParameters = controls;
  for (let index = 0; index < 10; index++) {
    await f.adapter.modulate({ brightness: index / 10, space: 1 - index / 10, pan: index / 10 - .5 });
  }
  for (const count of Object.values(reads)) {
    assert.deepEqual(count, { min: 1, max: 1, writes: 10 }, 'normalized writes must not repeatedly call synchronous min/max getters');
  }
});

test('unchanged MIDI recordings skip native clip writes while note edits still persist', async () => {
  const f = fixture();
  await f.adapter.prepare();
  const clip = f.created[0].clips[0], writes = [];
  let saved = [];
  Object.defineProperty(clip, 'notes', { configurable: true, get() { return saved; }, set(value) {
    saved = structuredClone(value); writes.push(saved);
  } });
  const notes = [{ pitch: 60, velocity: 60, beat: 0, duration: 2.9, voice: 'pad' }];
  await f.adapter.recordNotes(notes);
  await f.adapter.recordNotes(notes);
  await f.adapter.recordNotes(structuredClone(notes));
  assert.equal(writes.length, 1, 'equal contents, including copied arrays, do not rewrite the growing clip');
  notes[0].duration = 2.5;
  await f.adapter.recordNotes(notes);
  assert.equal(writes.length, 2, 'same-length duration edits from retrigger truncation must be saved');
  assert.equal(saved[0].duration, 4);
  notes[0].velocity = 64;
  await f.adapter.recordNotes(notes);
  assert.equal(writes.length, 3);
  assert.equal(saved[0].velocity, 64);
  notes.push({ pitch: 72, velocity: 70, beat: 5, duration: 1.6, voice: 'bell' });
  await f.adapter.recordNotes(notes);
  assert.equal(writes.length, 4);
  assert.equal(saved.length, 2);
  await f.adapter.recordNotes(notes);
  assert.equal(writes.length, 4);
});

test('a failed clip write is retried even when the next recording contents are identical', async () => {
  const f = fixture();
  await f.adapter.prepare();
  const clip = f.created[0].clips[0];
  let attempts = 0, saved;
  Object.defineProperty(clip, 'notes', { configurable: true, get() { return saved; }, set(value) {
    if (++attempts === 1) throw new Error('native clip write failed');
    saved = structuredClone(value);
  } });
  const notes = [{ pitch: 60, velocity: 60, beat: 0, duration: 2.5 }];
  await assert.rejects(f.adapter.recordNotes(notes), /native clip write failed/);
  await f.adapter.recordNotes(notes);
  assert.equal(attempts, 2);
  assert.equal(saved.length, 1);
  await f.adapter.recordNotes(notes);
  assert.equal(attempts, 2);
});

test('ambient effect changes enter one SDK transaction before awaiting completion', async () => {
  const f = fixture();
  await f.adapter.prepare({ mode: 'ambient' });
  let transactions = 0, inside = false, writes = 0;
  f.context.withinTransaction = operation => {
    transactions++; inside = true;
    try { return operation(); } finally { inside = false; }
  };
  for (const control of Object.values(f.adapter.controlParameters)) {
    control.setValue = async () => { assert.equal(inside, true); writes++; };
  }
  await f.adapter.modulate({ brightness: .6, space: .5, pan: -.2 });
  assert.equal(transactions, 1);
  assert.equal(writes, 3);
});
