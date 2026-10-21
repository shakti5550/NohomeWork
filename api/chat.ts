// ─── AI proxy — serverless endpoint that calls LLM providers ──────────────
//
// Holds API keys server-side only (no VITE_ prefix). Clients POST to this
// endpoint; the function forwards the request to the provider and returns
// the response. Keys are read from process.env at runtime via Vercel
// serverless/function-edge-env injection — they never appear in the client
// bundle.
//
// Each provider call has a 15s timeout so a stalled or slow provider fails
// fast and the fallback chain can move to the next one, instead of hitting
// Vercel's 30s hard limit and returning a 504.
//
// Supported providers (fallback in order). Each provider tries its models
// in order until one succeeds, then falls back to the next provider.
//   KILO_API_KEY       → Kilo Gateway (many models, auto-rotate)
//   GEMINI_API_KEY     → Gemini 2.0 Flash (Google)
//   OPENROUTER_API_KEY → google/gemini-2.0-flash-001 (OpenRouter)
//   NVIDIA_API_KEY     → meta/llama-3.1-8b-instruct (NVIDIA NIM)

// Node.js globals — this file runs server-side on Vercel, not in the browser.
// The project has no tsconfig/@types/node, so declare the ones we use.
declare const process: {
  env: Record<string, string | undefined>;
};

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
  // Gemini bakes the model into the URL path; others use a fixed endpoint.
  endpoint: string | ((model: string) => string);
  headers: (key: string) => Record<string, string>;
  buildBody: (message: string, history: ChatMessage[], model: string) => object;
  parseResponse: (json: any) => string;
  // Models tried in order until one succeeds.
  models: string[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'kilo',
    // Kilo Gateway — OpenAI-compatible. xKiro tier gives 5M free tokens/day.
    endpoint: 'https://gateway.kilo.ai/v1/chat/completions',
    headers: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    }),
    buildBody: (message, history, model) => ({
      model,
      messages: [...history, { role: 'user', content: message }],
    }),
    parseResponse: (json) => json?.choices?.[0]?.message?.content ?? '',
    // Auto-rotate: try each in order until one responds.
    // IDs confirmed from Kilo Gateway docs (kilo/ prefix required).
    models: [
      'kilo/google/gemini-2.0-flash-001',
      'kilo/nvidia/nemotron-3-super-120b-a12b',
      'kilo/cohere/north-mini-code:free',
      'kilo/dots-studio/dots-3-note-preview:free',
      'kilo/kilo-auto/free',
      'kilo/liquid/lfm-2.5-2.6b:free',
      'kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'kilo/nvidia/nemotron-3-ultra-550b-a55b',
      'kilo/nvidia/nemotron-3.5-content-safety',
      'kilo/nvidia/nemotron-3.5-lightning',
      'kilo/openrouter/free',
      'kilo/poolside/laguna-s-2.1:free',
      'kilo/poolside/laguna-xs-2.1:free',
    ],
  },
  {
    name: 'gemini',
    // Model goes in the URL path for Gemini.
    endpoint: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
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
    buildBody: (message, history, model) => ({
      model,
      messages: [...history, { role: 'user', content: message }],
    }),
    parseResponse: (json) => json?.choices?.[0]?.message?.content ?? '',
    models: ['google/gemini-2.0-flash-001', 'google/gemini-2.0-flash-lite-001'],
  },
  {
    name: 'nvidia',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    headers: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    }),
    buildBody: (message, history, model) => ({
      model,
      messages: [...history, { role: 'user', content: message }],
    }),
    parseResponse: (json) => json?.choices?.[0]?.message?.content ?? '',
    models: ['meta/llama-3.1-8b-instruct', 'meta/llama-3.1-70b-instruct'],
  },
];

const KEYS: Record<string, string | undefined> = {
  kilo: process.env.KILO_API_KEY,
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

    // Try each model for this provider until one succeeds.
    for (const model of provider.models) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        const url =
          typeof provider.endpoint === 'function'
            ? provider.endpoint(model)
            : provider.endpoint;

        const res = await fetch(url, {
          method: 'POST',
          headers: provider.headers(key),
          body: JSON.stringify(provider.buildBody(message, history, model)),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(
            `${provider.name} (${model}): HTTP ${res.status} ${text.slice(0, 200)}`
          );
        }

        const json = await res.json();
        const content = provider.parseResponse(json);
        if (!content) throw new Error(`${provider.name} (${model}): empty response`);

        return { response: content, provider: `${provider.name}:${model}` };
      } catch (err: any) {
        errors.push(err.message || String(err));
      }
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
