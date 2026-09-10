import { encodeMidi, TEMPO, MAX_BEATS, MAX_NOTES } from './midi-file.js';

export const FRUIT_NOTES = Object.freeze(Object.fromEntries([
  ['banana', 60, 'C4'], ['apple', 64, 'E4'], ['grape', 67, 'G4'],
  ['berry', 71, 'B4'], ['strawberry', 72, 'C5'], ['orange', 62, 'D4'],
].map(([kind, pitch, label]) => [kind, Object.freeze({ pitch, label })])));

const sourceFlies = world => Array.isArray(world?.flies) ? world.flies : [world];
const validFly = fly => fly && [fly.x, fly.y, fly.height].every(Number.isFinite);
const feedingId = fly => fly.behavior === 'feeding' && typeof fly.feedingId === 'string'
  ? fly.feedingId : null;

/**
 * Virtual fruit touch pads: an actual transition into the world's feeding
 * state closes the contact once. Holding, proximity, and free flight are silent.
 * This observes the animal model; it never feeds music back into its behavior.
 */
export class FruitComposer {
  constructor() { this.reset(); }

  reset() {
    this.notes = [];
    this.contacts = [];
    this.flies = new Map();
    this.lastTime = null;
    this.nextContactId = 1;
    this.lastGesture = 'Waiting for a fruit touch';
    this.complete = false;
  }

  // Switching instruments while a fly is already feeding must not manufacture
  // a new attack. Preserve the recording and establish only a contact baseline.
  prime(world) {
    this.flies.clear();
    for (const [index, fly] of sourceFlies(world).entries()) {
      if (!validFly(fly)) continue;
      const id = String(fly.id ?? `fly-${index + 1}`);
      if (!this.flies.has(id)) this.flies.set(id, feedingId(fly));
    }
    this.lastTime = Number.isFinite(world?.time) && world.time >= 0 ? world.time : null;
    return this.snapshot();
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
    const fruits = new Map((Array.isArray(world.fruits) ? world.fruits : [])
      .filter(fruit => fruit && typeof fruit.id === 'string')
      .map(fruit => [fruit.id, fruit]));
    const active = new Set(), touches = [];
    let feeding = 0;

    for (const [index, fly] of sourceFlies(world).entries()) {
      if (!validFly(fly)) continue;
      const flyId = String(fly.id ?? `fly-${index + 1}`);
      if (active.has(flyId)) continue;
      active.add(flyId);
      const current = feedingId(fly);
      if (current) feeding++;
      const known = this.flies.has(flyId), previous = this.flies.get(flyId);
      this.flies.set(flyId, current);
      // Every new/reintroduced fly first establishes a quiet baseline.
      if (!known || !current || current === previous) continue;
      const fruit = fruits.get(current);
      if (!fruit || !Object.hasOwn(FRUIT_NOTES, fruit.kind)
        || ![fruit.x, fruit.y, fruit.amount].every(Number.isFinite) || fruit.amount <= 0
        || fly.height < 0 || fly.height >= 0.05
        || Math.hypot(fly.x - fruit.x, fly.y - fruit.y) >= 0.045) continue;
      touches.push({ fruit, flyId });
    }
    for (const flyId of this.flies.keys()) if (!active.has(flyId)) this.flies.delete(flyId);
    this.lastGesture = feeding ? 'Feeding · holding the fruit contact' : 'Exploring · fruit untouched';
    touches.sort((a, b) => a.fruit.id.localeCompare(b.fruit.id) || a.flyId.localeCompare(b.flyId));

    const created = [];
    for (const { fruit, flyId } of touches) {
      if (this.notes.length >= MAX_NOTES) break;
      const { pitch, label } = FRUIT_NOTES[fruit.kind];
      const velocity = 78, duration = 1;
      const touch = { fruitId: fruit.id, fruitKind: fruit.kind, flyId,
        x: fruit.x, y: fruit.y, time, beat, velocity, reason: 'Fruit touch', instrumentMode: 'fruit' };
      this.contacts.push({ id: this.nextContactId++, ...touch });
      this.lastGesture = `${fruit.kind} · ${label} · fruit touch`;
      const previous = this.notes.findLast(note => note.pitch === pitch);
      // MIDI cannot independently sustain two attacks of the same key/channel.
      // Both touches remain visible while the shared onset is emitted once.
      if (previous && previous.beat === beat) {
        previous.velocity = Math.max(previous.velocity, velocity);
        previous.duration = Math.max(previous.duration, duration);
        continue;
      }
      if (previous) {
        const gap = (beat - previous.beat) * 60 / TEMPO;
        if (gap > 0 && previous.duration > gap) previous.duration = Math.max(0.001, gap);
      }
      const note = { id: this.notes.length + 1, ...touch, pitch, duration };
      this.notes.push(note);
      created.push(note);
    }
    this.contacts = this.contacts.slice(-24);
    if (this.notes.length >= MAX_NOTES) this.complete = true;
    return created;
  }

  snapshot() {
    return {
      tempo: TEMPO,
      instrumentMode: 'fruit',
      fruitNotes: Object.fromEntries(Object.entries(FRUIT_NOTES).map(([kind, note]) => [kind, { ...note }])),
      contacts: this.contacts.map(contact => ({ ...contact })),
      noteCount: this.notes.length,
      recentNotes: this.notes.slice(-24).map(note => ({ ...note })),
      lastGesture: this.lastGesture,
      complete: this.complete,
    };
  }

  midiFile() { return encodeMidi(this.notes, TEMPO); }
}
