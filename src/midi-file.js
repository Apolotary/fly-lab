export const TEMPO = 96;
export const MAX_BEATS = 512;
export const MAX_NOTES = 2048;

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
    0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xc0, 24];
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
