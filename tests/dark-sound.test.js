import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDark } from '../scripts/build-dark.mjs';

test('authored dark sound is deterministic PCM with headroom, smooth edges and a C4 foundation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fly-lab-dark-'));
  try {
    const path = await buildDark(root), wav = await readFile(path);
    await buildDark(root);
    assert.deepEqual(await readFile(path), wav, 'rebuilding must not create a different sound');
    assert.equal(path, join(root, '.local/audio/dark-lab.wav'));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt16LE(20), 1, 'PCM');
    assert.equal(wav.readUInt16LE(22), 1, 'mono source');
    assert.equal(wav.readUInt16LE(34), 16);
    const rate = wav.readUInt32LE(24), frames = wav.readUInt32LE(40) / 2;
    assert.equal(wav.length, 44 + frames * 2);
    assert.ok(frames / rate >= 8, 'sufficient material for long transposed drones');
    const samples = Array.from({ length: frames }, (_, i) => wav.readInt16LE(44 + 2 * i) / 32768);
    let peak = 0, sum = 0, squares = 0, maxStep = 0;
    for (let i = 0; i < frames; i++) {
      const value = samples[i];
      peak = Math.max(peak, Math.abs(value)); sum += value; squares += value * value;
      if (i) maxStep = Math.max(maxStep, Math.abs(value - samples[i - 1]));
    }
    assert.ok(peak < .5 && peak > .15, `headroom peak ${peak}`);
    assert.ok(Math.sqrt(squares / frames) > .05, 'the rendered source contains audible sound');
    assert.ok(Math.abs(sum / frames) < .001, 'no material DC offset');
    assert.ok(Math.abs(samples[0]) < .001 && Math.abs(samples.at(-1)) < .001, 'sample edges fade to silence');
    assert.ok(maxStep < .08, `no discontinuities: largest step ${maxStep}`);
    // A one-second spectral projection distinguishes C4 from adjacent notes
    // without depending on the exact partial amplitudes or noise seed.
    const energyAt = pitch => {
      const frequency = 440 * 2 ** ((pitch - 69) / 12);
      let real = 0, imaginary = 0;
      for (let i = 0; i < rate; i++) {
        const value = samples[rate + i], phase = 2 * Math.PI * frequency * i / rate;
        real += value * Math.cos(phase); imaginary += value * Math.sin(phase);
      }
      return real * real + imaginary * imaginary;
    };
    assert.ok(energyAt(60) > 20 * Math.max(energyAt(59), energyAt(61)), 'MIDI 60 plays the intended C4 foundation');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
