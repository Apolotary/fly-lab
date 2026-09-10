const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const SCALE = Object.freeze([48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72]);
export const TEMPO = 96;
export const MAX_BEATS = 512;
export const MAX_NOTES = 2048;

// A movement-to-MIDI instrument, analogous to tracking a performer's gestures.
// The scale, quantization, thresholds and gestures are designed musical rules.
export class GestureComposer {
  constructor() { this.reset(); }
  reset() {
    this.notes = [];
    this.lastSlot = -1;
    this.lastPitch = null;
    this.lastLanding = 0;
    this.lastGesture = 'Waiting for movement';
    this.complete = false;
  }
  step(world) {
    const slot = Math.floor(clamp(world.time, 0, 1e7) * TEMPO / 60 * 2 + 1e-7);
    if (slot <= this.lastSlot || this.complete) return [];
    this.lastSlot = slot;
    const beat = slot / 2;
    if (beat >= MAX_BEATS || this.notes.length >= MAX_NOTES - 3) {
      this.complete = true;
      this.lastGesture = 'Piece complete';
      return [];
    }
    const moving = world.speed > .003;
    const landing = Number(world.landingCount || 0) > this.lastLanding;
    this.lastLanding = Number(world.landingCount || 0);
    if (!moving && !landing) { this.lastGesture = world.behavior === 'feeding' ? 'Feeding · a rest' : 'Stillness · a rest'; return []; }
    const index = Math.round(clamp(world.x, 0, 1) * (SCALE.length - 1));
    const pitch = SCALE[index] + (world.height > .5 ? 12 : 0);
    const speed = clamp(world.speed / .13, 0, 1);
    const turning = Math.abs(world.turnRate || 0) > .8;
    // Slow travel leaves space. Faster flight fills the eighth-note grid.
    if (!landing && slot % 2 === 1 && speed < .45 && !turning) return [];
    if (!landing && pitch === this.lastPitch && slot % 4 !== 0 && !turning) return [];
    const velocity = Math.round(clamp(40 + speed * 47 + (landing ? 8 : 0), 38, 96));
    const duration = landing ? 1.1 : turning ? .22 : .35 + (1 - speed) * .45;
    const reason = landing ? 'Landing chord' : turning ? 'Turn' : world.height > .15 ? 'Flight' : 'Walking';
    const pitches = landing ? [48, 55, 64].map(p => p + (world.y > .5 ? 12 : 0)) : [pitch];
    const created = pitches.map((p, i) => ({
      id: this.notes.length + i + 1,
      pitch: p, velocity: Math.max(35, velocity - i * 5), duration, beat, reason,
    }));
    // A re-strike releases the previous key, just like the live MIDI bridge.
    for (const note of created) {
      const previous = this.notes.findLast(n => n.pitch === note.pitch);
      const gap = previous ? (note.beat - previous.beat) * 60 / TEMPO : 0;
      if (previous && previous.duration > gap) previous.duration = Math.max(.001, gap);
    }
    this.notes.push(...created);
    this.lastPitch = pitch;
    this.lastGesture = reason;
    return created;
  }
  snapshot() {
    return { tempo: TEMPO, noteCount: this.notes.length, recentNotes: this.notes.slice(-24).map(n => ({ ...n })), lastGesture: this.lastGesture, complete: this.complete };
  }
  midiFile() { return encodeMidi(this.notes, TEMPO); }
}

function variableLength(value) {
  let n = Math.max(0, Math.round(value));
  const bytes = [n & 127];
  while ((n = Math.floor(n / 128))) bytes.unshift((n & 127) | 128);
  return bytes;
}
export function encodeMidi(notes, tempo = TEMPO) {
  const ticks = 480, micros = Math.round(60000000 / tempo);
  const events = [];
  for (const note of notes) {
    const start = Math.round(note.beat * ticks);
    const end = start + Math.max(1, Math.round(note.duration * tempo / 60 * ticks));
    events.push({ tick: start, order: 1, bytes: [0x90, note.pitch, note.velocity] });
    events.push({ tick: end, order: 0, bytes: [0x80, note.pitch, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body = [0, 0xff, 0x51, 3, (micros >> 16) & 255, (micros >> 8) & 255, micros & 255,
    0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xc0, 0];
  let previousTick = 0;
  for (const event of events) {
    body.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const header = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0]);
  const track = Buffer.alloc(8); track.write('MTrk'); track.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, track, Buffer.from(body)]);
}
