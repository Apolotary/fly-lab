import { build } from 'esbuild';
import { readFile, access } from 'node:fs/promises';
import { buildMidi } from './build-midi.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHtml } from './ui.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(resolve(root, '.local/config.json'), 'utf8'));
const midiPath = await buildMidi(root);
const pianoPath = resolve(config.livePath, 'Contents/App-Resources/Core Library/Samples/One Shots/Instrument/Piano & Keys/Grand Piano C3 f.aif');
await access(pianoPath);
const html = await buildHtml();
await build({ absWorkingDir: root, entryPoints: ['src/extension.js'], outfile: 'dist/extension.cjs',
  bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  define: { __FLY_MIDI_PATH__: JSON.stringify(midiPath), __FLY_PIANO_PATH__: JSON.stringify(pianoPath) },
  nodePaths: [resolve(root, '.local/sdk/node_modules')], loader: { '.html': 'text' },
  sourcemap: false, logLevel: 'info', plugins: [{ name: 'inline-dashboard', setup(plugin) {
    plugin.onLoad({ filter: /ui\/index\.html$/ }, () => ({ contents: html, loader: 'text' }));
  } }] });
