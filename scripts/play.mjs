import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmbientComposer } from '../src/ambient-instrument.js';
import { DarkComposer } from '../src/dark-instrument.js';
import { FruitComposer } from '../src/fruit-instrument.js';
import { FlyGarden } from '../src/garden.js';
import { loadDarkCheckpoint } from '../src/dark-checkpoint.js';
import { encodeMidi, TEMPO } from '../src/midi-file.js';
import { StringComposer } from '../src/string-instrument.js';
import { TombolaComposer } from '../src/tombola-instrument.js';
import { FlyTombola } from '../src/tombola-world.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODES = new Set(['dark', 'tombola', 'ambient', 'fruit', 'strings']);
const ENERGIES = new Set(['calm', 'lively', 'wild']);

function flag(name, fallback) {
  const prefix = `--${name}`;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === prefix) {
      const next = process.argv[i + 1];
      if (!next || next.startsWith('--')) return true;
      return next;
    }
    if (arg.startsWith(`${prefix}=`)) return arg.slice(prefix.length + 1);
  }
  return fallback;
}

if (flag('help') || flag('h')) {
  console.log(`Headless Fly Lab. No browser, no Ableton.

  npm run play -- [--mode dark] [--seconds 32] [--seed 404] [--energy lively] [--learn]

Writes MIDI and a simple WAV under .local/play/.

Modes: dark (default), tombola, ambient, fruit, strings
Dark lab freezes the readout unless you pass --learn.
Optional offline training first: npm run train:dark`);
  process.exit(0);
}

const mode = String(flag('mode', 'dark'));
if (!MODES.has(mode)) throw new Error('Mode must be dark, tombola, ambient, fruit or strings.');
const energy = String(flag('energy', 'lively'));
if (!ENERGIES.has(energy)) throw new Error('Energy must be calm, lively or wild.');
const seconds = Number(flag('seconds', 32));
if (!Number.isFinite(seconds) || seconds < 2 || seconds > 128) throw new Error('Use 2–128 seconds.');
const seed = Number(flag('seed', 404));
if (!Number.isFinite(seed)) throw new Error('seed must be a finite number.');
const learn = flag('learn', false) === true || flag('learn', false) === 'true';

const checkpointPath = resolve(root, '.local/dark-lab/model.json');
let darkCheckpoint;
try { darkCheckpoint = await loadDarkCheckpoint(checkpointPath); }
catch (error) { console.error('Dark lab checkpoint could not load; starting untrained.', error); }

const garden = new FlyGarden({ count: mode === 'dark' ? 1 : 12, seed, energy });
const world = mode === 'tombola' ? new FlyTombola({ garden }) : garden;
world.setEnergy?.(energy);

const composer = mode === 'dark' ? new DarkComposer({ learnerState: darkCheckpoint?.learner, report: darkCheckpoint?.report })
  : mode === 'tombola' ? new TombolaComposer()
  : mode === 'ambient' ? new AmbientComposer({ energy })
  : mode === 'fruit' ? new FruitComposer()
  : new StringComposer();
if (mode === 'dark' && !learn) composer.setLearning(false);

const stepMs = 50;
let time = 0;
composer.prime({ ...world.snapshot(), time });
let lastLabel = '';
const ticks = Math.round(seconds * 1000 / stepMs);
for (let i = 1; i <= ticks; i++) {
  world.step(stepMs);
  time = i * stepMs / 1000;
  composer.step({ ...world.snapshot(), time });
  const music = composer.snapshot();
  const label = music.decisionLabel || music.lastGesture;
  if (label && label !== lastLabel) {
    lastLabel = label;
    console.log(`${time.toFixed(1).padStart(5)}s  notes=${String(music.noteCount).padStart(3)}  ${label}`);
  }
}

const notes = composer.notes;
const outDir = resolve(root, '.local/play');
await mkdir(outDir, { recursive: true });
const midiPath = resolve(outDir, 'fly-lab.mid');
const wavPath = resolve(outDir, 'fly-lab.wav');
await writeFile(midiPath, encodeMidi(notes, TEMPO));
await writeFile(wavPath, renderWav(notes, seconds));

const score = composer.snapshot().training?.lastScore;
console.log(`\n${mode}  ${seconds}s  ${notes.length} notes  ${TEMPO} BPM${Number.isFinite(score) ? `  last phrase score ${score.toFixed(3)}` : ''}`);
console.log(midiPath);
console.log(wavPath);

function renderWav(events, duration) {
  const rate = 44100;
  const frames = Math.ceil((duration + 2.5) * rate);
  const mix = new Float64Array(frames);
  for (const note of events) {
    const start = Number(note.beat) * 60 / TEMPO;
    const hold = Math.max(0.08, Number(note.duration) || 0.2);
    const pitch = Number(note.pitch);
    const velocity = Number(note.velocity);
    if (!Number.isFinite(start) || !Number.isFinite(pitch)) continue;
    const freq = 440 * 2 ** ((Math.min(127, Math.max(0, pitch)) - 69) / 12);
    const strength = Math.min(1, Math.max(0.01, velocity > 1 ? velocity / 127 : velocity || 0.4));
    const dark = note.instrumentMode === 'dark' || note.voice === 'dark';
    const peak = (dark ? 0.07 : 0.11) * strength;
    const release = dark ? 1.6 : 0.28;
    const n0 = Math.max(0, Math.floor(start * rate));
    const n1 = Math.min(frames, n0 + Math.floor((hold + release) * rate));
    for (let i = n0; i < n1; i++) {
      const t = (i - n0) / rate;
      const attack = dark ? Math.min(0.9, hold * 0.35) : 0.008;
      let env = t < attack ? t / attack : 1;
      if (t > hold) env *= Math.exp(-(t - hold) / (dark ? 0.38 : 0.06));
      else if (dark) env *= 0.8 + 0.2 * Math.exp(-t / hold);
      const phase = 2 * Math.PI * freq * t;
      mix[i] += peak * env * (Math.sin(phase) + 0.28 * Math.sin(phase * 2.001) + 0.1 * Math.sin(phase * 3));
    }
  }
  let peak = 0;
  for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? 0.45 / peak : 1;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[i] * gain)) * 32767), 44 + i * 2);
  return wav;
}
