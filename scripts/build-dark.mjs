import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Original, deterministic C4 / MIDI 60 source, matching the ambient sample's
// tuning. Beating partials and quiet band-limited noise form an evolving drone.
// This is an authored sound, not audio recorded from the simulated neurons.
export async function buildDark(root) {
  const rate = 44100, seconds = 12, frames = rate * seconds;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  const frequency = 440 * 2 ** ((60 - 69) / 12);
  const lowAlpha = 1 - Math.exp(-2 * Math.PI * 45 / rate);
  const highAlpha = 1 - Math.exp(-2 * Math.PI * 900 / rate);
  let seed = 0x6461726b, low = 0, high = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / rate, phase = 2 * Math.PI * frequency * t;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 0x100000000 * 2 - 1;
    low += lowAlpha * (noise - low); high += highAlpha * (noise - high);
    const envelope = Math.min(1, t / .12) * Math.min(1, (seconds - t) / .8);
    const drift = .82 + .18 * Math.sin(2 * Math.PI * .073 * t + .4);
    const bed = .60 * Math.sin(phase) + .28 * Math.sin(phase * 1.003)
      + .13 * Math.sin(phase * 2 + .3 * Math.sin(t * .4))
      + .045 * Math.sin(phase * 2.998) + .016 * Math.sin(phase * 5.01);
    const texture = (high - low) * (.12 + .08 * Math.sin(t * .9) ** 2);
    const sample = (bed * drift + texture) * .30 * envelope;
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  const destination = resolve(root, '.local/audio/dark-lab.wav');
  await mkdir(resolve(root, '.local/audio'), { recursive: true });
  await writeFile(destination, wav);
  return destination;
}
