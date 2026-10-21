// ─── AI proxy — serverless endpoint that calls LLM providers ──────────────
//
// Holds API keys server-side only (no VITE_ prefix). Clients POST to this
// endpoint; the function forwards the request to the provider and returns
// the response. Keys are read from process.env at runtime via Vercel
// serverless/function-edge-env injection — they never appear in the client
// bundle.
//
// Supported providers (fallback in order):
//   GEMINI_API_KEY     → Gemini 2.0 Flash (Google)
//   OPENROUTER_API_KEY → google/gemini-2.0-flash-001 (OpenRouter)
//   NVIDIA_API_KEY     → meta/llama-3.1-8b-instruct (NVIDIA NIM)

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResult {
  response: string;
  provider: string;
}

interface ProviderConfig {
  name: string;
  endpoint: string;
  headers: (key: string) => Record<string, string>;
  buildBody: (message: string, history: ChatMessage[]) => object;
  parseResponse: (json: any) => string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    headers: (key) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    }),
    buildBody: (message, history) => ({
      contents: [
        ...history.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        { role: 'user', parts: [{ text: message }] },
      ],
    }),
    parseResponse: (json) =>
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
  },
  {
    name: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    headers: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://nohomework.com',
      'X-Title': 'NohomeWork',
    }),
    buildBody: (message, history) => ({
      model: 'google/gemini-2.0-flash-001',
      messages: [...history, { role: 'user', content: message }],
    }),
    parseResponse: (json) => json?.choices?.[0]?.message?.content ?? '',
  },
  {
    name: 'nvidia',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    headers: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    }),
    buildBody: (message, history) => ({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [...history, { role: 'user', content: message }],
    }),
    parseResponse: (json) => json?.choices?.[0]?.message?.content ?? '',
  },
];

const KEYS: Record<string, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
  nvidia: process.env.NVIDIA_API_KEY,
};

async function sendMessage(
  message: string,
  history: ChatMessage[],
  preferredProvider?: string
): Promise<ChatResult> {
  const providers = preferredProvider
    ? PROVIDERS.filter((p) => p.name === preferredProvider)
    : PROVIDERS;

  const errors: string[] = [];
  for (const provider of providers) {
    const key = KEYS[provider.name];
    if (!key) {
      errors.push(`${provider.name}: no API key configured`);
      continue;
    }

    try {
      const res = await fetch(provider.endpoint, {
        method: 'POST',
        headers: provider.headers(key),
        body: JSON.stringify(provider.buildBody(message, history)),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `${provider.name}: HTTP ${res.status} ${text.slice(0, 200)}`
        );
      }

      const json = await res.json();
      const content = provider.parseResponse(json);
      if (!content) throw new Error(`${provider.name}: empty response`);

      return { response: content, provider: provider.name };
    } catch (err: any) {
      errors.push(err.message || String(err));
    }
  }

  throw new Error('All AI providers failed: ' + errors.join(' | '));
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { message, history, provider } = await req.json();

    if (typeof message !== 'string' || !message.trim()) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await sendMessage(message, history || [], provider);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
