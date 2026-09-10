import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveInstrumentAdapter, PreviewInstrumentAdapter } from '../src/instrument-adapter.js';
import { MAX_BEATS, TEMPO } from '../src/midi-file.js';

function fixture() {
  const created = [], calls = [];
  const failures = { sampleOnce: false, clipOnce: false };
  const unrelated = { name: 'Fly Strings', arm: true, mute: false };
  let tempo = 120;
  const song = {
    get tracks() { throw new Error('Do not inspect unrelated tracks.'); },
    get tempo() { return tempo; },
    set tempo(value) { tempo = value; calls.push(['tempo', value]); },
    async createMidiTrack() {
      const track = {
        name: 'New track', arm: true, mute: false, devices: [], clips: [],
        mixer: { volume: { min: 0, max: 1, value: 1, async setValue(value) { this.value = value; } } },
        async insertDevice(name, index) {
          const device = { name, index, loads: 0, async replaceSample(path) {
            this.loads++;
            if (failures.sampleOnce) { failures.sampleOnce = false; throw new Error('sample failed'); }
            this.samplePath = path;
          } };
          this.devices.push(device); this.arm = true;
          return device;
        },
        async createMidiClip(startTime, duration) {
          if (failures.clipOnce) { failures.clipOnce = false; throw new Error('clip failed'); }
          const clip = { startTime, duration, notes: [] };
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
  const adapter = new LiveInstrumentAdapter(context, { midi, samplePath: '/local/instrument.wav' });
  return { adapter, midi, context, song, created, calls, failures, unrelated };
}

test('instrument setup creates one owned sample instrument and clip at 96 BPM', async () => {
  const f = fixture();
  await Promise.all([f.adapter.prepare(), f.adapter.prepare()]);
  assert.equal(f.created.length, 1);
  const track = f.created[0];
  assert.equal(track.name, 'Fly Strings');
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
  assert.deepEqual(f.unrelated, { name: 'Fly Strings', arm: true, mute: false });
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
