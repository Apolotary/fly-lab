import { encodeMidi, TEMPO, MAX_BEATS, MAX_NOTES } from './midi-file.js';
import { FruitComposer, FRUIT_NOTES } from './fruit-instrument.js';

export const AMBIENT_CHORDS = Object.freeze([
  ['Cmaj9', [48, 52, 55, 59, 62]],
  ['Am9', [57, 60, 64, 67, 71]],
  ['Fmaj9', [53, 57, 60, 64, 67]],
  ['G6/9', [55, 59, 62, 64, 69]],
].map(([label, pitches]) => Object.freeze({ label, pitches: Object.freeze(pitches) })));

const PULSE_BEATS = 4;
const CHORD_BEATS = 16;
const EPSILON = 1e-9;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function observe(world) {
  const flies = (Array.isArray(world?.flies) ? world.flies : [world]).filter(fly => fly && typeof fly === 'object');
  const motion = average(flies.map(fly => clamp(finite(fly.speed) / 0.1)));
  const lift = average(flies.map(fly => clamp(finite(fly.height) / 0.4)));
  const activity = average(flies.map(fly => clamp(average((Array.isArray(fly.activity) ? fly.activity : [])
    .map(value => clamp(finite(value)))) * 3.5)));
  const hunger = average(flies.map(fly => clamp(finite(fly.hunger, 0.5))));
  const pan = flies.length ? average(flies.map(fly => clamp(finite(fly.x, 0.5)) * 2 - 1)) : 0;
  return { lift, brightness: clamp(0.2 + lift * 0.5 + activity * 0.3),
    density: clamp(0.2 + motion * 0.6 + lift * 0.2),
    space: clamp(0.55 + lift * 0.25 + (1 - hunger) * 0.2), pan, activity };
}

/**
 * An authored ambient score, performed with a simulated swarm. The harmony and
 * pulse are composed here; they continue without moving flies. The observed
 * animals shape voicing, strength, register and live effects. Genuine feeding
 * entries add high bell accents. No musical values are fed into the world.
 */
export class AmbientComposer {
  constructor() { this.reset(); }

  reset() {
    this.notes = [];
    this.contacts = [];
    this.fruit = new FruitComposer();
    this.lastFruitContactId = 0;
    this.lastTime = null;
    this.nextPadBeat = 0;
    this.lift = 0;
    this.ambience = { brightness: 0.2, density: 0.2, space: 0.65, pan: 0, activity: 0 };
    this.chord = AMBIENT_CHORDS[0].label;
    this.lastGesture = 'Authored ambient bed · fly modulation';
    this.complete = false;
  }

  prime(world) {
    this.fruit.prime(world);
    const time = Number.isFinite(world?.time) && world.time >= 0 ? world.time : null;
    this.lastTime = time;
    if (time !== null) {
      const beat = time * TEMPO / 60;
      const previous = this.notes.findLast(note => note.instrumentMode === 'ambient' && note.voice === 'pad');
      this.nextPadBeat = Math.max(Math.ceil((beat - EPSILON) / PULSE_BEATS) * PULSE_BEATS,
        previous && Number.isFinite(previous.beat) ? previous.beat + PULSE_BEATS : 0);
      this.chord = AMBIENT_CHORDS[Math.floor(beat / CHORD_BEATS) % AMBIENT_CHORDS.length].label;
    }
    return this.snapshot();
  }

  append(note, created) {
    if (this.notes.length >= MAX_NOTES) return;
    const remaining = (MAX_BEATS - note.beat) * 60 / TEMPO;
    if (remaining < 0.1 - EPSILON) return;
    note.duration = Math.min(note.duration, remaining);
    const previous = this.notes.findLast(item => item.pitch === note.pitch);
    if (previous) {
      const gap = (note.beat - previous.beat) * 60 / TEMPO;
      if (Math.abs(gap) < EPSILON) {
        // Simultaneous contacts share one MIDI key but retain every visual touch.
        previous.velocity = Math.max(previous.velocity, note.velocity);
        previous.duration = Math.max(previous.duration, note.duration);
        return;
      }
      // Several flies arriving within 100 ms share a bell attack. Do not make
      // an already-emitted key click by immediately stealing its envelope.
      if (gap < 0.1 - EPSILON) return;
      if (previous.duration > gap) previous.duration = Math.max(0.1, gap);
    }
    const entry = { ...note, id: this.notes.length + 1, channel: 0, instrumentMode: 'ambient' };
    this.notes.push(entry);
    created.push(entry);
  }

  step(world) {
    const time = world?.time;
    if (!Number.isFinite(time) || time < 0 || this.complete) return [];
    if (this.lastTime !== null && time <= this.lastTime) return [];
    const beat = time * TEMPO / 60;
    if (beat >= MAX_BEATS || this.notes.length >= MAX_NOTES) {
      this.complete = true;
      this.lastGesture = 'Piece complete';
      return [];
    }
    const dt = this.lastTime === null ? 0 : time - this.lastTime;
    this.lastTime = time;
    const target = observe(world), blend = 1 - Math.exp(-dt / 1.8);
    for (const key of Object.keys(this.ambience)) this.ambience[key] += (target[key] - this.ambience[key]) * blend;
    this.lift += (target.lift - this.lift) * blend;
    const created = [];

    if (beat + EPSILON >= this.nextPadBeat) {
      // A delayed caller plays the current pulse once, never a burst of missed
      // chords. Normal controller ticks sample every 50 ms.
      const padBeat = Math.floor((beat + EPSILON) / PULSE_BEATS) * PULSE_BEATS;
      this.nextPadBeat = padBeat + PULSE_BEATS;
      const chord = AMBIENT_CHORDS[Math.floor(padBeat / CHORD_BEATS) % AMBIENT_CHORDS.length];
      this.chord = chord.label;
      const count = Math.min(5, 3 + Math.floor(this.ambience.density * 2.99));
      const velocity = Math.round(34 + this.ambience.activity * 22 + this.ambience.density * 10);
      chord.pitches.slice(0, count).forEach((pitch, index) => {
        // Lift the root by one octave as the swarm rises. It stays below the
        // bell register, so a single MIDI input can play both authored voices.
        if (index === 0 && this.lift >= 0.55) pitch += 12;
        this.append({ pitch, velocity, duration: 2.9, beat: padBeat,
          voice: 'pad', chord: chord.label, reason: 'Authored pad', authored: true }, created);
      });
      this.lastGesture = `${chord.label} · authored pad · fly modulation`;
    }

    const accents = this.fruit.step(world);
    const contacts = this.fruit.contacts.filter(contact => contact.id > this.lastFruitContactId);
    if (contacts.length) {
      this.lastFruitContactId = contacts.at(-1).id;
      this.contacts.push(...contacts.map(contact => ({ ...contact, voice: 'bell',
        instrumentMode: 'ambient', reason: 'Fruit bell' })));
      this.contacts = this.contacts.slice(-24);
    }
    for (const accent of accents) {
      this.append({ ...accent, pitch: clamp(accent.pitch + 12, 72, 84),
        velocity: Math.round(52 + this.ambience.activity * 18 + this.ambience.density * 8),
        duration: 1.6, voice: 'bell', reason: 'Fruit bell', authored: false }, created);
      this.lastGesture = `${accent.fruitKind} visit · bell over ${this.chord}`;
    }
    if (this.notes.length >= MAX_NOTES) {
      this.complete = true;
      this.lastGesture = 'Piece complete';
    }
    return created;
  }

  snapshot() {
    return {
      tempo: TEMPO, instrumentMode: 'ambient', authored: true,
      composition: AMBIENT_CHORDS.map(chord => chord.label).join(' · '), chord: this.chord,
      fruitNotes: Object.fromEntries(Object.entries(FRUIT_NOTES).map(([kind, { pitch, label }]) =>
        [kind, { pitch: clamp(pitch + 12, 72, 84), label: label.replace(/\d+$/, value => String(Number(value) + 1)) }])),
      ambience: { ...this.ambience },
      contacts: this.contacts.map(contact => ({ ...contact })),
      noteCount: this.notes.length,
      recentNotes: this.notes.slice(-24).map(note => ({ ...note })),
      lastGesture: this.lastGesture, complete: this.complete,
    };
  }

  midiFile() { return encodeMidi(this.notes, TEMPO); }
}
