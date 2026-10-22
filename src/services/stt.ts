// ─── Speech-to-text service — dictation for the editor ────────────────────
//
// Two tiers, tried in order:
//
//  1. Web Speech API (`window.SpeechRecognition` / `webkitSpeechRecognition`)
//     — free, zero-latency, runs entirely in the browser, streams recognized
//     text back as the user speaks. Works on desktop Chrome/Edge and on
//     mobile Safari (which exposes `webkitSpeechRecognition`).
//
//  2. Serverless Whisper proxy (`/api/stt`) — used as a fallback when the
//     browser has no SpeechRecognition support, or when the live transcript
//     is disabled. Audio is POSTed to the serverless function (which holds
//     the Whisper API key) and the returned text is appended.
//
// No API keys live in the client bundle.

export interface SttResult {
  text: string;
  isFinal: boolean;
  provider: 'web-speech' | 'whisper';
}

export interface SttHooks {
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onError: (message: string) => void;
}

// ─── Feature detection ─────────────────────────────────────────────────────

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
}

// ─── Live Web Speech dictation ─────────────────────────────────────────────

export class SpeechRecognitionSession {
  private recognition: any = null;
  private hooks: SttHooks | null = null;
  private provider: 'web-speech' | 'whisper' = 'web-speech';
  private finalText = '';
  private interimText = '';
  private stopped = false;

  constructor() {
    const win = window as any;
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) return;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = navigator.language || 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (e: any) => {
      // Rebuild the full transcript from the event's result set so we don't
      // lose text when `isFinal` flips between chunks.
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript ?? '';
        if (res.isFinal) final += t;
        else interim += t;
      }
      this.finalText += final;
      this.interimText = interim;
      if (interim && this.hooks) this.hooks.onInterim(this.finalText + interim);
    };

    this.recognition.onend = () => {
      // Auto-restart unless we explicitly stopped. The API can end on its
      // own (silence timeout, network hiccup) — keep dictating until told
      // otherwise so the user never has to tap twice mid-sentence.
      if (!this.stopped && this.recognition) {
        try { this.recognition.start(); } catch { /* ignore */ }
      }
    };

    this.recognition.onerror = (e: any) => {
      const msg = this.humanizeError(e?.error);
      if (this.hooks) this.hooks.onError(msg);
      // 'no-speech' / 'aborted' are transient — the onend handler restarts.
    };
  }

  private humanizeError(code: string): string {
    switch (code) {
      case 'no-speech': return 'No speech detected — try speaking closer to the mic.';
      case 'network': return 'Network error during recognition.';
      case 'not-allowed':
      case 'service-not-allowed': return 'Microphone access denied. Allow mic in your browser settings.';
      case 'audio-capture': return 'No microphone detected or it is in use by another app.';
      case 'aborted': return 'Recognition was aborted.';
      default: return `Speech recognition error (${code}).`;
    }
  }

  start(hooks: SttHooks): boolean {
    if (!this.recognition) return false;
    this.hooks = hooks;
    this.finalText = '';
    this.interimText = '';
    this.stopped = false;
    try {
      this.recognition.start();
      return true;
    } catch {
      return false;
    }
  }

  stop(): string {
    this.stopped = true;
    const transcript = (this.finalText + this.interimText).trim();
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }
    return transcript;
  }

  getProvider(): 'web-speech' | 'whisper' { return this.provider; }
}

// ─── Serverless Whisper fallback ───────────────────────────────────────────

/**
 * Send a blob of audio to the serverless Whisper proxy and get back the
 * transcribed text. Used when live Web Speech isn't available or as an
 * explicit "re-dictate" path.
 */
export async function transcribeWithWhisper(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, 'dictation.webm');

  const res = await fetch('/api/stt', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return (data.text ?? '').trim();
}