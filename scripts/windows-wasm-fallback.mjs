// Windows Smart App Control can block unsigned native helpers (Astro's compiler, the
// oxc parser and the Markdown renderer). Both can run as WebAssembly instead, which Windows doesn't block.
// This runs before `npm run dev` and `npm run build`: on Windows, if a native helper is
// blocked and its WebAssembly version isn't installed, it installs it for this computer
// only (package.json and package-lock.json are not changed). Elsewhere it does nothing.
// The packages come from the public npm registry, free.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (process.platform !== 'win32') process.exit(0);

const require = createRequire(import.meta.url);
const pkg = (name) => { try { return require(`${name}/package.json`); } catch { return null; } };

const helpers = [
  {
    native: '@astrojs/compiler-binding-win32-x64-msvc/astro.win32-x64-msvc.node',
    wasm: '@astrojs/compiler-binding-wasm32-wasi',
    version: () => pkg('@astrojs/compiler-binding')?.optionalDependencies?.['@astrojs/compiler-binding-wasm32-wasi'],
  },
  {
    native: '@oxc-parser/binding-win32-x64-msvc/parser.win32-x64-msvc.node',
    wasm: '@oxc-parser/binding-wasm32-wasi',
    version: () => pkg('oxc-parser')?.version,
  },
  {
    // Astro's Markdown renderer (blocked after a Windows update in Nov 2026).
    native: '@bruits/satteri-win32-x64-msvc/satteri_napi.win32-x64-msvc.node',
    wasm: '@bruits/satteri-wasm32-wasi',
    version: () => pkg('satteri')?.version,
  },
];

const missing = [];
for (const h of helpers) {
  try {
    require(h.native);
    continue; // loads fine: nothing to do
  } catch (e) {
    if (!/Application Control|blocked/i.test(String(e.message))) continue; // not the Windows block
  }
  if (pkg(h.wasm)) continue; // fallback already installed
  const v = h.version();
  if (v) missing.push(`${h.wasm}@${v}`);
}

if (missing.length) {
  console.log(`Windows blocks some native helpers; installing their WebAssembly versions: ${missing.join(', ')}`);
  execFileSync(process.env.npm_execpath ? process.execPath : 'npm',
    process.env.npm_execpath
      ? [process.env.npm_execpath, 'install', '--no-save', '--force', '--ignore-scripts', ...missing]
      : ['install', '--no-save', '--force', '--ignore-scripts', ...missing],
    { stdio: 'inherit', shell: !process.env.npm_execpath });
}
