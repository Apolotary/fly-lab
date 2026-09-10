import { execFileSync } from 'node:child_process';

// Audit exactly the staged or committed tree, including binaries and generated bundles.
const staged = process.argv.includes('--staged');
const paths = execFileSync('git', staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const blocked = /^vendor\//i;
const privateFiles = /(^|\/)(node_modules|\.local|dist|output|\.env(?:\..*)?)(\/|$)|\.(?:tgz|zip|ablx|als|alc|adg|amxd|wav|aiff?|midi?|flac|mp3|mp4|mov|log)$/i;
const patterns = [
  /gh[pousr]_[A-Za-z0-9_]{25,}/,
  /github_pat_[A-Za-z0-9_]{25,}/,
  /sk-[A-Za-z0-9_-]{25,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?:\/Users\/|\/Volumes\/)[A-Za-z0-9_-]+\//,
  /[A-Z0-9._%+-]+@(?:gmail|icloud|outlook|yahoo)\.com/i,
];
const failures = [];
for (const path of paths) {
  if (blocked.test(path) || privateFiles.test(path)) { failures.push(`${path}: private/generated file`); continue; }
  const content = execFileSync('git', ['show', `${staged ? ':' : 'HEAD:'}${path}`], { maxBuffer: 5 * 1024 * 1024 });
  if (content.includes(0)) failures.push(`${path}: unexpected binary`);
  if (patterns.some(pattern => pattern.test(content.toString('utf8')))) failures.push(`${path}: possible credential or private path/contact`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Privacy check passed for ${paths.length} ${staged ? 'staged' : 'committed'} files. SDK, local config, media, and credentials are excluded.`);
