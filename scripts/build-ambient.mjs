import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Original, deterministic tonal source. No samples or licensed media are used.
// Low notes become a warm bed; higher notes reveal the decaying chime partials.
export async function buildAmbient(root) {
  const rate = 44100, seconds = 8, frames = rate * seconds;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  const frequency = 440 * 2 ** ((60 - 69) / 12);
  for (let i = 0; i < frames; i++) {
    const t = i / rate, phase = 2 * Math.PI * frequency * t;
    const attack = Math.min(1, t / .018), release = Math.min(1, (seconds - t) / .3);
    const drift = .92 + .08 * Math.sin(2 * Math.PI * .19 * t);
    const bed = Math.sin(phase) + .24 * Math.sin(phase * 2 + .18 * Math.sin(t))
      + .10 * Math.sin(phase * 3) + .045 * Math.sin(phase * 4);
    const chime = Math.exp(-t / .8) * (.18 * Math.sin(phase * 5) + .08 * Math.sin(phase * 7));
    const sample = (bed * drift + chime) * .32 * attack * release;
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  const destination = resolve(root, '.local/audio/ambient-garden.wav');
  await mkdir(resolve(root, '.local/audio'), { recursive: true });
  await writeFile(destination, wav);
  return destination;
}
