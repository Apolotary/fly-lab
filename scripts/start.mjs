import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
let config;
try { config = JSON.parse(await readFile('.local/config.json', 'utf8')); }
catch { console.error('Run npm run setup first, or double-click Setup Fly.command.'); process.exit(1); }
const url = 'http://127.0.0.1:9321';
function openDashboard() {
  // Chrome supports choosing a single local Live window for the recording layout.
  const browser = spawn('open', ['-a', 'Google Chrome', url], { stdio: 'ignore' });
  const fallback = () => spawn('open', [url], { stdio: 'ignore' });
  browser.once('error', fallback);
  browser.once('exit', code => { if (code !== 0) fallback(); });
}
// Reusing the running local extension avoids creating a second set of tracks.
let existing;
try { existing = await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(500) }).then(r => r.json()); } catch {}
if (existing?.mode === 'live') {
  console.log(`Fly already connected: ${url}`);
  openDashboard();
} else {
  if (existing) { console.error('Close the rehearsal server before starting Live mode.'); process.exit(1); }
  await import('./build.mjs');
  console.log('Connecting to Live. Keep this terminal open during your performance.');
  const child = spawn(process.execPath, [resolve('.local/sdk/node_modules/@ableton-extensions/cli/dist/cli.mjs'), 'run', '--live', config.livePath], { stdio: 'inherit' });
  let opened = false;
  const poll = setInterval(async () => {
    if (opened) return;
    try {
      const state = await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(500) }).then(r => r.json());
      if (state.mode === 'live') { opened = true; clearInterval(poll); openDashboard(); }
    } catch {}
  }, 1000);
  const timeout = setTimeout(() => {
    clearInterval(poll);
    if (!opened) console.log('Still waiting for Live. Check Extensions is enabled and the local terminal error above. If reconnecting fails, switch Extensions off and on in Live Settings.');
  }, 20000);
  child.once('error', error => { clearInterval(poll); clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
  child.once('exit', code => { clearInterval(poll); clearTimeout(timeout); process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
}
