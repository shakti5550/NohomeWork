// ─── STT proxy — serverless endpoint that transcribes audio to text ───────
//
// Holds API keys server-side only (no VITE_ prefix). The client POSTs an
// audio blob (multipart/form-data) to this endpoint; the function forwards
// it to a Whisper-compatible transcription provider and returns the text.
//
// Keys are read from process.env at runtime via Vercel env injection — they
// never appear in the client bundle.
//
// Provider order (first configured one wins):
//   OPENROUTER_API_KEY → openai/whisper-large-v3  (OpenAI-compatible)
//   OPENAI_API_KEY   → whisper-1                  (OpenAI Whisper)
//   KILO_API_KEY     → whisper-large-v3           (Kilo Gateway, OpenAI-compatible)
//
// All three expose the same OpenAI /audio/transcriptions contract, so the
// request body is identical — only the endpoint + auth header differ.

// Node.js globals — this file runs server-side on Vercel, not in the browser.
declare const process: {
  env: Record<string, string | undefined>;
};

interface SttProvider {
  name: string;
  endpoint: string;
  auth: (key: string) => Record<string, string>;
  model: string;
}

const PROVIDERS: SttProvider[] = [
  {
    name: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/audio/transcriptions',
    auth: (key) => ({
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://nohomework.com',
      'X-Title': 'NohomeWork',
    }),
    model: 'openai/whisper-large-v3',
  },
  {
    name: 'openai',
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    auth: (key) => ({ Authorization: `Bearer ${key}` }),
    model: 'whisper-1',
  },
  {
    name: 'kilo',
    endpoint: 'https://api.kilo.ai/api/gateway/audio/transcriptions',
    auth: (key) => ({ Authorization: `Bearer ${key}` }),
    model: 'whisper-large-v3',
  },
];

function pickProvider(): SttProvider | null {
  const keys: Record<string, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    kilo: process.env.KILO_API_KEY,
  };
  for (const p of PROVIDERS) {
    if (keys[p.name]) return p;
  }
  return null;
}

// Vercel modern fetch-style API — named exports for each HTTP method.
// Using `export default` with the legacy (req, res) signature causes the
// returned Response to be silently ignored, which is why the function
// hung for 300s instead of returning a 500. Named exports fix that.

export async function OPTIONS(req: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, multipart/form-data',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const provider = pickProvider();
    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'No STT provider configured (set OPENAI_API_KEY, OPENROUTER_API_KEY, or KILO_API_KEY)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const key = process.env[provider.name.toUpperCase() + '_API_KEY']!;
    const formData = await req.formData();
    const audio = formData.get('audio');
    if (!audio || !(audio instanceof Blob)) {
      return new Response(
        JSON.stringify({ error: 'Audio file is required (multipart "audio" field)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const outbound = new FormData();
    outbound.append('file', audio, 'dictation.webm');
    outbound.append('model', provider.model);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(provider.endpoint, {
        method: 'POST',
        headers: provider.auth(key),
        body: outbound,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${provider.name}: HTTP ${res.status} ${text.slice(0, 200)}`);
      }

      const json = await res.json() as { text?: string; error?: string };
      if (json.error) throw new Error(`${provider.name}: ${json.error}`);

      const text = (json.text ?? '').trim();
      if (!text) throw new Error(`${provider.name}: empty transcription`);

      return new Response(
        JSON.stringify({ text, provider: provider.name }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    } finally {
      // Cleared only after the body has been fully read, so a stalled
      // response can't hang the function past the 30s limit.
      clearTimeout(timeout);
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}