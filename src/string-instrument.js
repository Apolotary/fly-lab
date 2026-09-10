import { encodeMidi, TEMPO, MAX_BEATS, MAX_NOTES } from './midi-file.js';

export const CONTACT_HEIGHT = 0.08;
export const CONTACT_RADIUS = 0.016;
const RELEASE_RADIUS = 0.025;
const CONTACT_COOLDOWN = 0.15;
const EPSILON = 1e-9;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const STRINGS = Object.freeze([
  [0.30, 48, 'C3'], [0.38, 55, 'G3'], [0.46, 60, 'C4'],
  [0.54, 64, 'E4'], [0.62, 67, 'G4'], [0.70, 72, 'C5'],
].map(([y, pitch, label], index) => Object.freeze({
  id: `string-${index + 1}`, x1: 0.12, x2: 0.88, y, pitch, label,
})));

function distanceToString(point, string) {
  return Math.hypot(point.x - clamp(point.x, string.x1, string.x2), point.y - string.y);
}

function at(previous, current, fraction) {
  return {
    x: previous.x + (current.x - previous.x) * fraction,
    y: previous.y + (current.y - previous.y) * fraction,
    height: previous.height + (current.height - previous.height) * fraction,
  };
}

// These geometric contact proxies are an authored instrument, not a model of
// insect feet or string forces. Sweeps prevent a long frame from skipping a
// string; height is interpolated at contact rather than checked only at the end.
function findContact(previous, current, string) {
  const candidates = [];
  const dy = current.y - previous.y;
  if (Math.abs(dy) > EPSILON) {
    const fraction = (string.y - previous.y) / dy;
    if (fraction > EPSILON && fraction <= 1 + EPSILON) {
      const point = at(previous, current, clamp(fraction, 0, 1));
      if (point.x >= string.x1 - EPSILON && point.x <= string.x2 + EPSILON
        && point.height <= CONTACT_HEIGHT + EPSILON) {
        candidates.push({ fraction, x: point.x, y: string.y, reason: 'String crossing' });
      }
    }
  }
  if (previous.height > CONTACT_HEIGHT && current.height <= CONTACT_HEIGHT) {
    const fraction = (previous.height - CONTACT_HEIGHT) / (previous.height - current.height);
    const point = at(previous, current, fraction);
    if (distanceToString(point, string) <= CONTACT_RADIUS + EPSILON) {
      candidates.push({ fraction, x: clamp(point.x, string.x1, string.x2), y: string.y, reason: 'Landing on string' });
    }
  }
  candidates.sort((a, b) => a.fraction - b.fraction);
  return candidates[0];
}

/**
 * A small animal installation: motion is silent until a fly crosses or lands
 * on one of six virtual strings. Each fly/string contact has its own latch.
 * Pitch comes from the touched string, and speed controls the MIDI velocity.
 */
export class StringComposer {
  constructor() { this.reset(); }

  reset() {
    this.notes = [];
    this.contacts = [];
    this.flies = new Map();
    this.lastTime = null;
    this.nextContactId = 1;
    this.lastGesture = 'Waiting for a string contact';
    this.complete = false;
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
    this.lastTime = time;
    const source = Array.isArray(world.flies) ? world.flies : [world];
    const active = new Set(), collisions = [];
    let airborne = 0, moving = 0;

    for (const [index, fly] of source.entries()) {
      if (!fly || ![fly.x, fly.y, fly.height].every(Number.isFinite)) continue;
      const flyId = String(fly.id ?? `fly-${index + 1}`);
      if (active.has(flyId)) continue;
      active.add(flyId);
      if (fly.height > CONTACT_HEIGHT) airborne++;
      if (fly.speed > 0.003) moving++;
      const point = { x: fly.x, y: fly.y, height: fly.height };
      const previous = this.flies.get(flyId);
      if (!previous) {
        // Spawning on an instrument is not a strike. Lift or leave it first.
        this.flies.set(flyId, {
          point,
          strings: new Map(STRINGS.map(string => [string.id, {
            armed: point.height > CONTACT_HEIGHT || distanceToString(point, string) > CONTACT_RADIUS,
            lastTriggered: -Infinity,
          }])),
        });
        continue;
      }

      for (const [stringIndex, string] of STRINGS.entries()) {
        const state = previous.strings.get(string.id);
        const contact = findContact(previous.point, point, string);
        if (contact && state.armed) {
          state.armed = false;
          if (time - state.lastTriggered >= CONTACT_COOLDOWN - EPSILON) {
            state.lastTriggered = time;
            collisions.push({ ...contact, string, stringIndex, flyId, speed: fly.speed });
          }
        }
        if (distanceToString(point, string) > RELEASE_RADIUS
          || point.height > CONTACT_HEIGHT + RELEASE_RADIUS) state.armed = true;
      }
      previous.point = point;
    }
    // A disappearing/reintroduced fly establishes a fresh position baseline.
    for (const flyId of this.flies.keys()) if (!active.has(flyId)) this.flies.delete(flyId);
    this.lastGesture = active.size > 0 && airborne === active.size ? 'Airborne · strings untouched'
      : moving > 0 ? 'Moving between strings' : 'Stillness · strings untouched';
    collisions.sort((a, b) => (Math.abs(a.fraction - b.fraction) > EPSILON ? a.fraction - b.fraction : 0)
      || a.stringIndex - b.stringIndex || a.flyId.localeCompare(b.flyId));

    const created = [];
    for (const contact of collisions) {
      if (this.notes.length >= MAX_NOTES) break;
      const { string, stringIndex, flyId, x, y, reason } = contact;
      const speed = Number.isFinite(contact.speed) ? clamp(contact.speed / 0.13, 0, 1) : 0;
      const velocity = Math.round(38 + speed * 52);
      const duration = 1.6 - stringIndex * 0.18;
      this.contacts.push({ id: this.nextContactId++, stringId: string.id, flyId, x, y, time, beat, velocity, reason });
      const previous = this.notes.findLast(note => note.pitch === string.pitch);
      // One MIDI key cannot independently sustain two simultaneous attacks.
      // Keep both visible contacts, but coalesce the identical pitch/onset.
      if (previous && previous.beat === beat) {
        previous.velocity = Math.max(previous.velocity, velocity);
        previous.duration = Math.max(previous.duration, duration);
        continue;
      }
      if (previous) {
        const gap = (beat - previous.beat) * 60 / TEMPO;
        if (previous.duration > gap) previous.duration = Math.max(0.001, gap);
      }
      const note = { id: this.notes.length + 1, stringId: string.id, flyId, x, y,
        pitch: string.pitch, velocity, duration, beat, reason };
      this.notes.push(note);
      created.push(note);
      this.lastGesture = `${string.label} · ${reason.toLowerCase()}`;
    }
    this.contacts = this.contacts.slice(-24);
    if (this.notes.length >= MAX_NOTES) this.complete = true;
    return created;
  }

  snapshot() {
    return {
      tempo: TEMPO,
      strings: STRINGS.map(string => ({ ...string })),
      contacts: this.contacts.map(contact => ({ ...contact })),
      noteCount: this.notes.length,
      recentNotes: this.notes.slice(-24).map(note => ({ ...note })),
      lastGesture: this.lastGesture,
      complete: this.complete,
    };
  }

  midiFile() { return encodeMidi(this.notes, TEMPO); }
}
