// Shows the "Listen" button only if this browser has a voice for the page's language, and
// loads the player (src/scripts/listen.ts) on demand. Arriving with #listen (listen mode
// carrying on from the previous section) opens the player straight away.
import { webSpeech } from './listen-engine';

const btn = document.querySelector<HTMLButtonElement>('[data-listen]');
const lang = document.documentElement.lang === 'bg' ? 'bg' : 'en';
if (btn && 'speechSynthesis' in window) {
  webSpeech.voices(lang).then((voices) => {
    if (!voices.length) return;
    btn.hidden = false;
    const open = (autoplay: boolean) => import('./listen').then((m) => m.openPlayer(autoplay));
    btn.addEventListener('click', () => open(true));
    if (location.hash === '#listen') {
      history.replaceState(history.state, '', location.pathname + location.search);
      open(true);
    }
  });
}
