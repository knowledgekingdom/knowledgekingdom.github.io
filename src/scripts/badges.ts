// Watches the reader's progress on every page and records newly earned seals (v2 Phase 2.4),
// with a quiet notice that links to the journey page. Rules: src/lib/badges.ts.
import { store } from './reader';
import { earned, type BookMeta } from '../lib/badges';

const el = document.getElementById('kk-book');
if (el) {
  const meta: BookMeta = JSON.parse(el.textContent || '{"chapters":[]}');
  const S: { toast: string; journey: string; names: Record<string, string> } = JSON.parse(el.dataset.strings || '{}');
  let busy = false;
  const check = () => {
    if (busy) return;
    const now = earned(store.state, meta).filter((id) => !store.state.badges[id]);
    if (!now.length) return;
    busy = true;
    store.update((s) => { for (const id of now) s.badges[id] ??= Math.floor(Date.now() / 1000); });
    busy = false;
    // Only announce what was earned during this visit, not a backlog after an import or update.
    if (now.length <= 2) for (const id of now) toast(S.toast.replace('{name}', S.names[id] ?? id));
  };
  const toast = (text: string) => {
    const a = document.createElement('a');
    a.className = 'badge-toast';
    a.href = S.journey;
    a.setAttribute('role', 'status');
    a.textContent = `✦ ${text}`;
    document.body.append(a);
    requestAnimationFrame(() => a.classList.add('is-on'));
    setTimeout(() => { a.classList.remove('is-on'); setTimeout(() => a.remove(), 400); }, 5000);
  };
  store.subscribe(check);
  check();
}
