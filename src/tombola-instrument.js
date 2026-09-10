import { encodeMidi, TEMPO, MAX_BEATS, MAX_NOTES } from './midi-file.js';

export const TOMBOLA_SCALES = Object.freeze({
  pentatonic: Object.freeze([60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 72]),
  minor: Object.freeze([60, 62, 63, 67, 70, 72, 74, 75, 79, 82, 84, 72]),
  major: Object.freeze([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 79, 84]),
});

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = pitch => `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const validId = id => Number.isSafeInteger(id) && id > 0;
const collisionList = world => Array.isArray(world?.tombola?.collisions) ? world.tombola.collisions : [];

/**
 * An authored toy physics instrument: each fly carries a scale note, and a new
 * wall collision strikes that note. No timer generates music, and neither the
 * pitches nor the collision dynamics represent learned musical behaviour.
 */
export class TombolaComposer {
  constructor({ scale = 'pentatonic' } = {}) {
    this.setScale(scale);
    this.reset();
  }

  reset() {
    this.notes = [];
    this.contacts = [];
    this.flySlots = new Map();
    this.lastBuckets = new Map();
    this.lastCollisionId = 0;
    this.lastTime = null;
    this.lastGesture = 'Waiting for a fly to hit the chamber';
    this.complete = false;
  }

  setScale(scale) {
    if (typeof scale !== 'string' || !Object.hasOwn(TOMBOLA_SCALES, scale)) {
      throw new RangeError('Scale must be pentatonic, minor or major.');
    }
    this.scale = scale;
    return this.scale;
  }

  slotFor(flyId) {
    if (!this.flySlots.has(flyId)) {
      const ordinal = /^fly-([1-9]\d*)$/.exec(flyId);
      const index = ordinal && Number.isSafeInteger(Number(ordinal[1]))
        ? Number(ordinal[1]) - 1 : this.flySlots.size;
      this.flySlots.set(flyId, index % TOMBOLA_SCALES[this.scale].length);
    }
    return this.flySlots.get(flyId);
  }

  // Mode changes and pause/resume establish a quiet collision baseline without
  // clearing the recording, fly assignments, or same-frame contact latches.
  prime(world) {
    for (const fly of Array.isArray(world?.flies) ? world.flies : []) {
      if (typeof fly?.id === 'string' && fly.id) this.slotFor(fly.id);
    }
    for (const collision of collisionList(world)) {
      if (validId(collision?.id)) this.lastCollisionId = Math.max(this.lastCollisionId, collision.id);
    }
    if (Number.isFinite(world?.time) && world.time >= 0) this.lastTime = world.time;
    return this.snapshot();
  }

  step(world) {
    const time = world?.time;
    if (!Number.isFinite(time) || time < 0 || this.complete
      || (this.lastTime !== null && time < this.lastTime)) return [];
    const beat = time * TEMPO / 60;
    if (beat >= MAX_BEATS || this.notes.length >= MAX_NOTES) {
      this.complete = true;
      this.lastGesture = 'Piece complete';
      return [];
    }
    this.lastTime = time;
    const bucket = Math.floor(beat * 16 + 1e-9);
    const created = [];
    const collisions = collisionList(world).filter(collision => validId(collision?.id))
      .sort((a, b) => a.id - b.id);

    for (const collision of collisions) {
      if (collision.id <= this.lastCollisionId) continue;
      // Consume even malformed and debounced events, so later snapshots cannot
      // turn the same observed collision into another attack.
      this.lastCollisionId = collision.id;
      const { flyId, wall, x, y, impact } = collision;
      if (typeof flyId !== 'string' || !flyId
        || !((typeof wall === 'string' && wall) || Number.isSafeInteger(wall))
        || ![x, y, impact].every(Number.isFinite) || impact <= 0) continue;
      if (this.lastBuckets.get(flyId) === bucket) continue;
      this.lastBuckets.set(flyId, bucket);
      const pitch = TOMBOLA_SCALES[this.scale][this.slotFor(flyId)];
      const strength = clamp(impact, 0, 1);
      const velocity = Math.round(22 + strength * 73);
      const duration = 0.3 + strength * 0.5;
      const touch = {
        collisionId: collision.id, flyId, wall, x, y, impact: strength,
        time, sourceTime: Number.isFinite(collision.time) ? collision.time : null,
        beat, pitch, pitchName: noteName(pitch), velocity, duration, channel: 0,
        instrumentMode: 'tombola', voice: 'collision', reason: 'Fly wall collision', authored: false,
      };
      this.contacts.push({ id: collision.id, ...touch });
      this.lastGesture = `${flyId} · ${touch.pitchName} · wall collision`;
      const previous = this.notes.findLast(note => note.pitch === pitch);
      // Distinct fly contacts remain visible, but one key/channel has only one
      // gate at this onset. Update the same note returned in created so the
      // realtime attack and exported gate both retain the strongest collision.
      if (previous && previous.beat === beat) {
        previous.velocity = Math.max(previous.velocity, velocity);
        previous.duration = Math.max(previous.duration, duration);
        continue;
      }
      // The channel has one gate per key. Trim its older gate on re-strike,
      // preserving collision attacks while keeping the exported MIDI playable.
      if (previous && beat > previous.beat) {
        const gap = (beat - previous.beat) * 60 / TEMPO;
        previous.duration = Math.min(previous.duration, Math.max(0.001, gap));
      }
      const note = { id: this.notes.length + 1, ...touch };
      this.notes.push(note);
      created.push(note);
      if (this.notes.length >= MAX_NOTES) break;
    }
    this.contacts = this.contacts.slice(-24);
    if (this.notes.length >= MAX_NOTES) this.complete = true;
    return created;
  }

  snapshot() {
    const pitches = [...TOMBOLA_SCALES[this.scale]];
    return {
      tempo: TEMPO, instrumentMode: 'tombola', scale: this.scale,
      layout: { scale: this.scale, pitches, noteNames: pitches.map(noteName) },
      contacts: this.contacts.map(contact => ({ ...contact })),
      noteCount: this.notes.length,
      recentNotes: this.notes.slice(-24).map(note => ({ ...note })),
      lastGesture: this.lastGesture, complete: this.complete,
      authored: false,
    };
  }

  midiFile() { return encodeMidi(this.notes, TEMPO); }
}
