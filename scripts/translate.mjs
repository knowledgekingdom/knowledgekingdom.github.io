// `npm run translate` — sets up the local translation environment on first use
// (a Python venv with ctranslate2 + sentencepiece), then runs importer/translate.py.
// Free and offline: no account or API key is involved.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const venv = path.join(root, '.venv-translate');
const win = process.platform === 'win32';
const py = path.join(venv, win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(py)) {
  console.log('First run: creating the translation environment (.venv-translate)…');
  run(win ? 'python' : 'python3', ['-m', 'venv', venv]);
  run(py, ['-m', 'pip', 'install', '--quiet', '-r', path.join(root, 'importer', 'requirements-translate.txt')]);
}
run(py, ['-I', '-X', 'utf8', path.join(root, 'importer', 'translate.py'), ...process.argv.slice(2)]);
