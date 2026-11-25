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

export const webSpeech: ListenEngine = {
  async voices(lang) {
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
