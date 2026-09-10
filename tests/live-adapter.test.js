import test from "node:test";
import assert from "node:assert/strict";
import { LiveAdapter, DemoAdapter } from "../src/live-adapter.js";

function fakeLive() {
  const controls = { failInsertOnce: false, failVolume: false, failRestore: false, failMuteIndex: null };
  const existing = { name: "Private unreleased song", mute: false, devices: [{ name: "Private plug-in" }] };
  const created = [];
  let tempo = 120;
  const song = {
    get tracks() { throw new Error("Adapter must not inspect unrelated tracks."); },
    get tempo() { return tempo; },
    set tempo(value) {
      if (controls.failRestore && value === 120) throw new Error("restore unavailable");
      tempo = value;
    },
    async createMidiTrack() {
      const index = created.length;
      let muted = false;
      const parameter = (min, max, volume) => ({
        min, max, value: volume ? 0.8 : 0,
        async setValue(value) {
          if (volume && controls.failVolume) throw new Error("volume unavailable");
          assert.ok(value >= min && value <= max);
          this.value = value;
        },
      });
      const track = {
        name: "New MIDI Track", arm: true, clips: [], devices: [],
        get mute() { return muted; },
        set mute(value) {
          if (controls.failMuteIndex === index) throw new Error("mute unavailable");
          muted = value;
        },
        mixer: { volume: parameter(0, 1, true), panning: parameter(-1, 1, false) },
        async insertDevice(name, slot) {
          if (controls.failInsertOnce && index === 2) {
            controls.failInsertOnce = false;
            throw new Error("device insertion unavailable");
          }
          const device = { name, slot };
          this.devices.push(device);
          this.arm = true; // Live can auto-arm when an instrument is inserted.
          return device;
        },
        async createMidiClip(start, duration) {
          const clip = { start, duration, notes: [] };
          this.clips.push(clip);
          return clip;
        },
      };
      created.push(track);
      return track;
    },
  };
  const context = { application: { song }, withinTransaction: (callback) => callback() };
  return { context, song, controls, existing, created };
}

function update(tempo = 132) {
  return {
    tempo,
    voices: Array.from({ length: 6 }, (_, index) => ({
      name: "Private unreleased song", active: index !== 1, pan: (index - 2) / 4, level: 0.4,
    })),
  };
}

test("Prepare creates only owned tracks and a complete beat-aligned arrangement", async () => {
  const live = fakeLive();
  const before = structuredClone(live.existing);
  const adapter = new LiveAdapter(live.context);
  const [first, second] = await Promise.all([adapter.prepare(), adapter.prepare()]);
  assert.deepEqual(first, second);
  assert.equal(adapter.prepared, true);
  assert.equal(live.created.length, 6);
  assert.equal(live.song.tempo, 120);
  for (const track of live.created) {
    assert.equal(track.arm, false);
    assert.equal(track.devices.length, 1);
    assert.equal(track.devices[0].name, "Operator");
    assert.equal(track.clips.length, 1);
    assert.equal(track.clips[0].start, 0);
    assert.equal(track.clips[0].duration, 512);
    assert.ok(track.clips[0].notes.length > 90);
    for (const note of track.clips[0].notes) {
      assert.ok(note.startTime >= 0 && note.startTime + note.duration <= 512);
      assert.ok(note.velocity > 0 && note.velocity < 128);
      assert.ok(Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch < 128);
    }
    assert.ok(track.mixer.volume.value < 0.5);
  }
  assert.deepEqual(live.existing, before);
  assert.ok(!JSON.stringify(adapter.snapshot()).includes(live.existing.name));
});

test("Prepare resumes partial work after failure without duplicate tracks or clips", async () => {
  const live = fakeLive();
  live.controls.failInsertOnce = true;
  const adapter = new LiveAdapter(live.context);
  await assert.rejects(adapter.prepare(), /device insertion unavailable/);
  assert.equal(adapter.prepared, false);
  assert.equal(live.created.length, 3);
  assert.ok(live.created.every((track) => track.mute));
  assert.ok(live.created.every((track) => !track.arm));
  await adapter.prepare();
  assert.equal(live.created.length, 6);
  assert.ok(live.created.every((track) => track.clips.length === 1 && track.devices.length === 1));
});

test("Modulation uses owned objects and Stop restores the tempo captured at Start", async () => {
  const live = fakeLive();
  const adapter = new LiveAdapter(live.context);
  await adapter.prepare();
  live.song.tempo = 127; // A user's change between Prepare and Start is preserved.
  await adapter.apply(update());
  assert.equal(live.song.tempo, 132);
  assert.equal(live.created[1].mute, true);
  assert.equal(live.created[0].mixer.panning.value, -0.5);
  assert.equal(live.existing.mute, false);
  await adapter.apply(update(135));
  const frozen = adapter.snapshot().voices;
  await adapter.restore();
  assert.equal(live.song.tempo, 127);
  assert.deepEqual(adapter.snapshot().voices, frozen);
  live.song.tempo = 123;
  await adapter.restore();
  assert.equal(live.song.tempo, 123); // Restore has already relinquished tempo.
  assert.ok(adapter.snapshot().voices.every((voice) => voice.name.startsWith("Fly ")));
  const detached = adapter.snapshot();
  detached.voices[0].name = "tampered";
  assert.equal(adapter.snapshot().voices[0].name, "Fly Kick");
});

test("Panic mutes owned voices, restores tempo, and preserves existing tracks", async () => {
  const live = fakeLive();
  const adapter = new LiveAdapter(live.context);
  await adapter.prepare();
  await adapter.apply(update());
  await adapter.panic();
  assert.equal(live.song.tempo, 120);
  assert.ok(live.created.every((track) => track.mute));
  assert.ok(adapter.snapshot().voices.every((voice) => !voice.active));
  assert.equal(live.existing.mute, false);
  assert.equal(live.created.length, 6);
});

test("Parameter failure settles all writes, restores tempo, and mutes the fly", async () => {
  const live = fakeLive();
  const adapter = new LiveAdapter(live.context);
  await adapter.prepare();
  live.controls.failVolume = true;
  await assert.rejects(adapter.apply(update()), /volume unavailable/);
  assert.equal(live.song.tempo, 120);
  assert.ok(live.created.every((track) => track.mute));
  live.controls.failVolume = false;
  await adapter.apply(update());
  assert.equal(live.song.tempo, 132);
  await adapter.restore();
  assert.equal(live.song.tempo, 120);
});

test("Cleanup preserves the original failure and Panic attempts every track", async () => {
  const live = fakeLive();
  const adapter = new LiveAdapter(live.context);
  await adapter.prepare();
  live.controls.failVolume = true;
  live.controls.failRestore = true;
  await assert.rejects(adapter.apply(update()), /volume unavailable/);
  live.controls.failVolume = false;
  live.controls.failMuteIndex = 0;
  await assert.rejects(adapter.panic(), /mute unavailable/);
  assert.ok(live.created.slice(1).every((track) => track.mute));
  live.controls.failMuteIndex = null;
  live.controls.failRestore = false;
  await adapter.panic();
  assert.equal(live.song.tempo, 120);
});

test("Unsafe or malformed values cannot escape bounded parameter ranges", async () => {
  const live = fakeLive();
  const adapter = new LiveAdapter(live.context);
  await assert.rejects(adapter.apply(update()), /Prepare/);
  await adapter.prepare();
  const invalid = update();
  invalid.voices[0].pan = NaN;
  await assert.rejects(adapter.apply(invalid), /finite number/);
  assert.equal(live.song.tempo, 120);
  const extreme = update(900);
  extreme.voices.forEach((voice) => { voice.pan = -400; voice.level = 100; });
  await adapter.apply(extreme);
  assert.equal(live.song.tempo, 150);
  assert.ok(live.created.every((track) => track.mixer.volume.value === 0.65 && track.mixer.panning.value === -1));
});

test("A changed Live Set is never controlled through stale prepared state", async () => {
  const live = fakeLive();
  const adapter = new LiveAdapter(live.context);
  await adapter.prepare();
  live.context.application.song = { tempo: 140 };
  await assert.rejects(adapter.apply(update()), /Live Set changed/);
  await assert.rejects(adapter.panic(), /Live Set changed/);
  assert.equal(live.context.application.song.tempo, 140);
  assert.ok(live.created.every((track) => !track.mute));
});

test("Stop is serialized after in-flight writes", async () => {
  const live = fakeLive();
  const adapter = new LiveAdapter(live.context);
  await adapter.prepare();
  const operations = [adapter.apply(update()), adapter.restore()];
  await Promise.all(operations);
  assert.equal(live.song.tempo, 120);
});

test("Demo implements the same lifecycle without a Live context", async () => {
  const adapter = new DemoAdapter();
  await assert.rejects(adapter.apply(update()), /Prepare/);
  await adapter.prepare();
  await adapter.apply(update());
  assert.equal(adapter.snapshot().tempo, 132);
  await adapter.restore();
  assert.equal(adapter.snapshot().tempo, 120);
  await adapter.apply(update(129));
  await adapter.panic();
  assert.equal(adapter.snapshot().tempo, 120);
  assert.ok(adapter.snapshot().voices.every((voice) => !voice.active));
});
