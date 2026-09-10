import { mkdir, readdir, writeFile, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { buildMidi } from './build-midi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const exists = p => access(p).then(() => true, () => false);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 16)) throw new Error('Install Node.js 24.16 or newer first.');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, npm_config_cache: join(root, '.local/npm-cache') }, ...options });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} failed.`);
};
const ask = async question => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(question)).trim().replace(/^['"]|['"]$/g, '').replace(/\\(.)/g, '$1'); }
  finally { rl.close(); }
};

let zip = process.argv[2];
if (!zip) zip = await ask('Drag the Ableton Extensions SDK zip here, then press Return: ');
zip = resolve(zip);
if (!await exists(zip)) throw new Error('SDK zip not found. Run npm run setup -- /path/to/sdk.zip');
const listing = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
if (listing.status !== 0) throw new Error('Cannot read SDK zip.');
const packages = [
  ['sdk', 'ableton-extensions-sdk-1.0.0-beta.1.tgz'],
  ['cli', 'ableton-extensions-cli-1.0.0-beta.1.tgz'],
];
await mkdir(join(root, 'vendor'), { recursive: true });
await mkdir(join(root, '.local/sdk'), { recursive: true });
const dependencies = {};
for (const [name, filename] of packages) {
  const matches = listing.stdout.split('\n').filter(p => p.split('/').at(-1) === filename && !p.startsWith('__MACOSX/'));
  if (matches.length !== 1) throw new Error(`Expected one ${filename} in the SDK zip.`);
  // Extract only the two named archives; never unpack arbitrary ZIP paths into the repo.
  const archive = spawnSync('unzip', ['-p', zip, matches[0]], { maxBuffer: 4 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error('SDK package extraction failed.');
  await writeFile(join(root, 'vendor', filename), archive.stdout);
  dependencies[`@ableton-extensions/${name}`] = `file:../../vendor/${filename}`;
}
let livePath = process.argv[3];
if (!livePath) {
  const folders = ['/Applications'];
  for (const volume of await readdir('/Volumes').catch(() => [])) folders.push(join('/Volumes', volume, 'Applications2'), join('/Volumes', volume, 'Applications'));
  const candidates = [];
  for (const folder of folders) for (const name of await readdir(folder).catch(() => [])) {
    if (/^Ableton Live.*Beta\.app$/.test(name)) {
      const candidate = join(folder, name);
      if (await exists(join(candidate, 'Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node'))) candidates.push(candidate);
    }
  }
  if (candidates.length === 1) livePath = candidates[0];
  else livePath = await ask('Drag your Ableton Live Beta app here, then press Return: ');
}
livePath = resolve(livePath);
if (!await exists(join(livePath, 'Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node'))) throw new Error('This Live app does not contain the Extensions host.');
await writeFile(join(root, '.local/sdk/package.json'), JSON.stringify({ private: true, dependencies }, null, 2));
run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--prefix', '.local/sdk']);
run('npm', ['install', '--no-audit', '--no-fund']);
await writeFile(join(root, '.local/config.json'), JSON.stringify({ livePath }, null, 2), { mode: 0o600 });
await buildMidi(root);
console.log('\nReady. Open an empty Live Set, enable Extensions in Live Settings, then double-click Start Fly.command.');
