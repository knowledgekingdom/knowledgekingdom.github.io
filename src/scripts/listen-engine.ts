// The voice behind listen mode. Today: the browser's own speech (Web Speech API: free, often
// offline). Later, pre-recorded audio files (for example from Semir's Bulgarian text-to-speech
// project) can be added as another engine with the same shape, without touching the player.
export type Voice = { id: string; name: string; local: boolean };

export interface ListenEngine {
  /** Voices for a language ('en' | 'bg'); empty means listen mode is hidden. */
  voices(lang: string): Promise<Voice[]>;
  /** Speak one piece of text; resolves when it ends, rejects with 'not-allowed' or another error. */
  speak(text: string, opts: { voice?: string; rate: number; lang: string }): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
}

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

function allVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  // Some browsers load voices a moment after the page.
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

// English is read by two British voices only: the UK English Male and Female voices (Google's, in
// Chrome), or the nearest British pair the browser has (Edge: Ryan and Sonia; Apple: Daniel and Kate).
const isGB = (v: SpeechSynthesisVoice) => /^en[-_]GB$/i.test(v.lang);
const MALE = [/Google UK English Male/i, /\bRyan\b/i, /\bThomas\b/i, /\bGeorge\b/i, /\bDaniel\b/i, /\bArthur\b/i, /\bOliver\b/i, /\bMale\b/i];
const FEMALE = [/Google UK English Female/i, /\bSonia\b/i, /\bLibby\b/i, /\bHazel\b/i, /\bKate\b/i, /\bSerena\b/i, /\bStephanie\b/i, /\bMartha\b/i, /\bFemale\b/i];
const first = (list: SpeechSynthesisVoice[], pats: RegExp[]) => {
  for (const p of pats) { const v = list.find((x) => p.test(x.name)); if (v) return v; }
  return undefined;
};
/** The British male and female voices this browser has (either may be missing). */
export async function britishPair(): Promise<{ male?: SpeechSynthesisVoice; female?: SpeechSynthesisVoice }> {
  const gb = (await allVoices()).filter(isGB);
  const male = first(gb, MALE), female = first(gb.filter((v) => v !== male), FEMALE);
  return { male, female };
}
/** The voice that narrates the chapter trailers: UK English Male, else the nearest British voice. */
export async function narrator(lang: 'en' | 'bg'): Promise<SpeechSynthesisVoice | undefined> {
  if (lang === 'bg') return (await allVoices()).find((v) => /^bg/i.test(v.lang));
  const { male, female } = await britishPair();
  return male ?? female ?? (await allVoices()).find(isGB);
}

export const webSpeech: ListenEngine = {
  async voices(lang) {
    if (lang === 'en') {
      const { male, female } = await britishPair();
      const pair = [male && { id: male.voiceURI, name: 'UK English Male', local: male.localService }, female && { id: female.voiceURI, name: 'UK English Female', local: female.localService }]
        .filter((v): v is Voice => Boolean(v));
      if (pair.length) return pair;
      // No British voice at all (rare): one English voice, so listening still works.
      const any = (await allVoices()).find((v) => /^en/i.test(v.lang));
      return any ? [{ id: any.voiceURI, name: any.name.replace(/^Microsoft |^Google /, ''), local: any.localService }] : [];
    }
    const list = (await allVoices()).filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
    // Local voices first (they work offline), then the browser's default.
    list.sort((a, b) => Number(b.localService) - Number(a.localService) || Number(b.default) - Number(a.default));
    return list.map((v) => ({ id: v.voiceURI, name: v.name.replace(/^Microsoft |^Google /, ''), local: v.localService }));
  },
  speak(text, { voice, rate, lang }) {
    return new Promise((resolve, reject) => {
      if (!synth) { reject(new Error('unsupported')); return; }
      const u = new SpeechSynthesisUtterance(text);
      const v = synth.getVoices().find((x) => x.voiceURI === voice);
      if (v) u.voice = v;
      u.lang = v?.lang ?? (lang === 'bg' ? 'bg-BG' : 'en-GB');
      u.rate = rate;
      u.onend = () => resolve();
      u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)));
      synth.speak(u);
    });
  },
  pause: () => synth?.pause(),
  resume: () => synth?.resume(),
  stop: () => synth?.cancel(),
};
