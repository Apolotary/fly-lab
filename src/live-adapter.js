// This file contains only original application code. The local extension entry
// supplies the SDK context; this module also runs without the proprietary SDK.

const BARS = 128;
const BEATS = BARS * 4;
const MIN_TEMPO = 90;
const MAX_TEMPO = 150;
const MAX_LEVEL = 0.65;

const VOICES = Object.freeze([
  { name: "Fly Kick", level: 0.48, pan: 0 },
  { name: "Fly Bass", level: 0.43, pan: 0 },
  { name: "Fly Pulse", level: 0.36, pan: -0.2 },
  { name: "Fly Hats", level: 0.25, pan: 0.24 },
  { name: "Fly Chord", level: 0.31, pan: -0.08 },
  { name: "Fly Spark", level: 0.28, pan: 0.34 },
]);

const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const copy = (music) => ({
  tempo: music.tempo,
  voices: music.voices.map((voice) => ({ ...voice })),
});

function baseline(tempo, active = false) {
  return { tempo, voices: VOICES.map((voice) => ({ ...voice, active })) };
}

function finite(number, label) {
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return number;
}

function normalize(music) {
  if (!music || !Array.isArray(music.voices) || music.voices.length !== VOICES.length) {
    throw new TypeError("A music update needs exactly six voices.");
  }
  return {
    tempo: clamp(finite(music.tempo, "Tempo"), MIN_TEMPO, MAX_TEMPO),
    // Index selects an owned voice. Caller-supplied names never identify tracks.
    voices: music.voices.map((voice, index) => {
      if (!voice || typeof voice.active !== "boolean") {
        throw new TypeError(`Voice ${index + 1} needs an active boolean.`);
      }
      return {
        name: VOICES[index].name,
        active: voice.active,
        pan: clamp(finite(voice.pan, "Pan"), -1, 1),
        level: clamp(finite(voice.level, "Level"), 0, MAX_LEVEL),
      };
    }),
  };
}

function parameterValue(parameter, normalized) {
  const min = finite(parameter.min, "Parameter minimum");
  const max = finite(parameter.max, "Parameter maximum");
  if (max < min) throw new RangeError("Parameter range is invalid.");
  return min + clamp(normalized, 0, 1) * (max - min);
}

// Four original bars in A minor. Operator's default sine patch makes a soft
// electronic groove; the short low/high notes are tonal kick/hat approximations.
function pattern(voiceIndex) {
  const notes = [];
  const note = (pitch, startTime, duration, velocity) => {
    notes.push({ pitch, startTime, duration, velocity });
  };
  const roots = [33, 31, 29, 31];
  const chords = [[45, 48, 52], [43, 47, 50], [41, 45, 48], [43, 47, 50]];
  for (let bar = 0; bar < 4; bar += 1) {
    const beat = bar * 4;
    if (voiceIndex === 0) {
      for (let step = 0; step < 4; step += 1) note(24, beat + step, 0.13, step === 0 ? 91 : 76);
      if (bar === 3) note(24, beat + 3.5, 0.09, 57);
    } else if (voiceIndex === 1) {
      for (const [offset, pitch, duration, velocity] of [
        [0, roots[bar], 0.7, 78], [1.5, roots[bar], 0.3, 61],
        [2.5, roots[bar] + 12, 0.32, 67], [3.25, roots[bar] + 7, 0.42, 60],
      ]) note(pitch, beat + offset, duration, velocity);
    } else if (voiceIndex === 2) {
      for (let step = 0; step < 8; step += 1) {
        note(chords[bar][step % 3] + 12, beat + step * 0.5 + (step % 2 ? 0.045 : 0), 0.17, step % 2 ? 45 : 59);
      }
    } else if (voiceIndex === 3) {
      for (let step = 0; step < 8; step += 1) note(step % 2 ? 106 : 101, beat + step * 0.5, 0.026, step % 2 ? 42 : 32);
      if (bar === 3) note(111, beat + 3.75, 0.018, 30);
    } else if (voiceIndex === 4) {
      for (const offset of [0.5, 2.5]) {
        for (const pitch of chords[bar]) note(pitch, beat + offset, 1.05, offset === 0.5 ? 48 : 40);
      }
    } else {
      const melody = [[76, 72, 69], [74, 71, 67], [72, 69, 64], [71, 74, 79]][bar];
      melody.forEach((pitch, index) => note(pitch, beat + [0.75, 2.25, 3.5][index], 0.25, [45, 37, 41][index]));
    }
  }
  return notes;
}

function arrangement(voiceIndex) {
  const phrase = pattern(voiceIndex);
  const notes = [];
  for (let offset = 0; offset < BEATS; offset += 16) {
    for (const note of phrase) notes.push({ ...note, startTime: note.startTime + offset });
  }
  return notes;
}

class SerializedAdapter {
  constructor() {
    this.prepared = false;
    this._tail = Promise.resolve();
  }

  _enqueue(task) {
    const result = this._tail.then(task);
    // A failed operation must not poison later Stop/Panic/Retry operations.
    this._tail = result.catch(() => {});
    return result;
  }

  snapshot() {
    return copy(this._music);
  }
}

export class LiveAdapter extends SerializedAdapter {
  constructor(context) {
    super();
    this.context = context;
    this._songRef = null;
    this._originalTempo = null;
    this._owned = [];
    this._music = baseline(context.application.song.tempo);
  }

  _song() {
    const song = this.context.application.song;
    if (this._songRef && song !== this._songRef) {
      throw new Error("The Live Set changed. Restart Ableton Fly for this Set.");
    }
    return song;
  }

  // Await every parameter write before cleanup. A rejected Promise.all could
  // otherwise leave writes racing a later Stop or Panic operation.
  async _batch(action) {
    const pending = [];
    const failures = [];
    const schedule = (operation) => {
      try { pending.push(Promise.resolve(operation())); }
      catch (error) { failures.push(error); }
    };
    const settled = await this.context.withinTransaction(() => {
      action(schedule);
      return Promise.allSettled(pending);
    });
    for (const result of settled) {
      if (result.status === "rejected") failures.push(result.reason);
    }
    if (failures.length) throw failures[0];
  }

  _mix(schedule, record, voice) {
    schedule(() => { record.track.mute = !voice.active; });
    schedule(() => record.track.mixer.volume.setValue(parameterValue(record.track.mixer.volume, voice.level)));
    schedule(() => record.track.mixer.panning.setValue(parameterValue(record.track.mixer.panning, (voice.pan + 1) / 2)));
  }

  prepare() {
    return this._enqueue(async () => {
      const song = this._song();
      if (this.prepared) return this.snapshot();
      this._songRef = song;
      try {
        for (let index = 0; index < VOICES.length; index += 1) {
          let record = this._owned[index];
          if (!record) {
            const track = await song.createMidiTrack();
            // Keep the actual object immediately, even if a subsequent step
            // fails. Retry resumes this track; names are never used to claim it.
            record = { track, device: null, clip: null, notesWritten: false };
            this._owned[index] = record;
          }
          record.track.mute = true;
          record.track.arm = false;
          record.track.name = VOICES[index].name;
          await this._batch((schedule) => this._mix(schedule, record, { ...VOICES[index], active: false }));
          if (!record.device) record.device = await record.track.insertDevice("Operator", 0);
          // Live can auto-arm a newly inserted instrument track.
          record.track.arm = false;
          if (!record.clip) record.clip = await record.track.createMidiClip(0, BEATS);
          record.clip.name = `${VOICES[index].name} · 128 bars`;
          if (!record.notesWritten) {
            record.clip.notes = arrangement(index);
            record.notesWritten = true;
          }
        }
        const music = baseline(song.tempo, true);
        await this._batch((schedule) => {
          this._owned.forEach((record, index) => {
            schedule(() => { record.track.arm = false; });
            this._mix(schedule, record, music.voices[index]);
          });
        });
        this._music = music;
        this.prepared = true;
        return this.snapshot();
      } catch (error) {
        // Leave partial work tracked and muted so Prepare can safely resume.
        try { await this._muteOwned(); } catch { /* Preserve the build error. */ }
        throw error;
      }
    });
  }

  apply(music) {
    return this._enqueue(async () => {
      if (!this.prepared) throw new Error("Prepare the Fly Set before starting the fly.");
      const next = normalize(music);
      const song = this._song();
      if (this._originalTempo === null) this._originalTempo = finite(song.tempo, "Original tempo");
      try {
        await this._batch((schedule) => {
          schedule(() => { song.tempo = next.tempo; });
          this._owned.forEach((record, index) => this._mix(schedule, record, next.voices[index]));
        });
        this._music = next;
        return this.snapshot();
      } catch (error) {
        try { await this._restoreTempo(); } catch { /* Preserve the write error. */ }
        try { await this._muteOwned(); } catch { /* Preserve the write error. */ }
        throw error;
      }
    });
  }

  async _restoreTempo() {
    if (this._originalTempo === null) return;
    const song = this._song();
    song.tempo = this._originalTempo;
    this._music.tempo = this._originalTempo;
    this._originalTempo = null;
  }

  async _muteOwned() {
    if (this._owned.length) this._song();
    const errors = [];
    // Do not resolve track names or scan the current Set during cleanup.
    this._owned.forEach((record, index) => {
      try {
        record.track.mute = true;
        this._music.voices[index].active = false;
      } catch (error) { errors.push(error); }
    });
    if (errors.length) throw errors[0];
  }

  restore() {
    return this._enqueue(async () => {
      // Stop freezes the fly's mix and restores only its tempo change.
      await this._restoreTempo();
      return this.snapshot();
    });
  }

  panic() {
    return this._enqueue(async () => {
      const errors = [];
      try { await this._muteOwned(); } catch (error) { errors.push(error); }
      try { await this._restoreTempo(); } catch (error) { errors.push(error); }
      if (errors.length) throw errors[0];
      return this.snapshot();
    });
  }
}

// Same state contract for preview mode. It never attempts to connect to Live.
export class DemoAdapter extends SerializedAdapter {
  constructor() {
    super();
    this._music = baseline(120);
    this._originalTempo = null;
  }

  prepare() {
    return this._enqueue(async () => {
      if (!this.prepared) this._music = baseline(this._music.tempo, true);
      this.prepared = true;
      return this.snapshot();
    });
  }

  apply(music) {
    return this._enqueue(async () => {
      if (!this.prepared) throw new Error("Prepare the Fly Set before starting the fly.");
      const next = normalize(music);
      if (this._originalTempo === null) this._originalTempo = this._music.tempo;
      this._music = next;
      return this.snapshot();
    });
  }

  restore() {
    return this._enqueue(async () => {
      if (this._originalTempo !== null) this._music.tempo = this._originalTempo;
      this._originalTempo = null;
      return this.snapshot();
    });
  }

  panic() {
    return this._enqueue(async () => {
      this._music.voices.forEach((voice) => { voice.active = false; });
      if (this._originalTempo !== null) this._music.tempo = this._originalTempo;
      this._originalTempo = null;
      return this.snapshot();
    });
  }
}
