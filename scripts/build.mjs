import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHtml } from './ui.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await buildHtml();
await build({ absWorkingDir: root, entryPoints: ['src/extension.js'], outfile: 'dist/extension.cjs',
  bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  nodePaths: [resolve(root, '.local/sdk/node_modules')], loader: { '.html': 'text' },
  sourcemap: false, logLevel: 'info', plugins: [{ name: 'inline-dashboard', setup(plugin) {
    plugin.onLoad({ filter: /ui\/index\.html$/ }, () => ({ contents: html, loader: 'text' }));
  } }] });
