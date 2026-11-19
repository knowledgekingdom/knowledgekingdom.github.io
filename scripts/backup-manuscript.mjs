// Uploads new or changed .docx files in manuscript/ to the private repository
// github.com/knowledgekingdom/manuscript (manuscript/ is its own git repository,
// ignored by the website repository). Earlier versions stay in its history.
// Never fails the surrounding command: if it can't back up, it says why and exits 0.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'manuscript');
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function main() {
  if (!existsSync(path.join(dir, '.git'))) {
    console.log('backup: manuscript/ is not connected to the backup repository; skipped.');
    console.log('        See "First-time setup" in README.md to restore it from the private backup.');
    return;
  }
  git('add', '-A');
  const changed = git('status', '--porcelain');
  if (!changed) {
    console.log('backup: manuscript already backed up, nothing new.');
  } else {
    const n = changed.split('\n').length;
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    git('commit', '-q', '-m', `Backup ${stamp} (${n} file${n === 1 ? '' : 's'} changed)`);
    console.log(`backup: saved ${n} changed file${n === 1 ? '' : 's'}.`);
  }
  // Push even when nothing is new, in case an earlier push failed (e.g. offline).
  git('push', '-q', 'origin', 'main');
  console.log('backup: uploaded to github.com/knowledgekingdom/manuscript (private).');
}

try {
  main();
} catch (e) {
  console.log(`backup: could not back up the manuscript (${String(e.stderr || e.message).split('\n')[0]}).`);
  console.log('        Nothing is lost locally; run "npm run backup" again when online.');
}
