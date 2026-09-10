import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export async function buildHtml() {
  const html = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');
  const license = await readFile(new URL('../ui/licenses/three.txt', import.meta.url), 'utf8');
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../ui/fly-scene.js', import.meta.url))],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022',
    minify: true, write: false, legalComments: 'inline', banner: { js: `/*\n${license}\n*/` },
  });
  // Script strings must not accidentally close the containing HTML script.
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return html.replace('__FLY_SCENE_SCRIPT__', () => script);
}
