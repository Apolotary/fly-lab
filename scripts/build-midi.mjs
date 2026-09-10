import { mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function buildMidi(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  if (process.platform !== 'darwin') throw new Error('The MIDI bridge requires macOS.');
  const source = path.join(root, 'native', 'midi-bridge.swift');
  const binary = path.join(root, '.local', 'bin', 'fly-lab-midi');
  const cache = path.join(root, '.local', 'swift-module-cache');
  const [input, output] = await Promise.all([stat(source), stat(binary).catch(() => null)]);
  if (output?.isFile() && output.mtimeMs >= input.mtimeMs) return binary;
  await Promise.all([mkdir(path.dirname(binary), { recursive: true }), mkdir(cache, { recursive: true })]);
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/swiftc', ['-O', '-framework', 'CoreMIDI', '-module-cache-path', cache, source, '-o', binary], {
      cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: cache, SWIFT_MODULECACHE_PATH: cache },
    });
    child.once('error', () => reject(new Error('Swift compiler could not start. Install the Xcode Command Line Tools.')));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('The local MIDI bridge did not compile.')));
  });
  return binary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildMidi().then(() => console.log('Fly Lab MIDI bridge is ready.')).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
