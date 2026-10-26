// ─── AI proxy — serverless endpoint that calls LLM providers ──────────────
//
// Holds API keys server-side only (no VITE_ prefix). Clients POST to this
// endpoint; the function forwards the request to the provider and returns
// the response. Keys are read from process.env at runtime via Vercel
// serverless/function-edge-env injection — they never appear in the client
// bundle.
//
// Per-model timeout: 15s. Overall provider budget: 50s (hard deadline).
// The timer stays armed until the response body has been fully read, so a
// provider that returns 200 but stalls the body can't hang the function
// until Vercel's own timeout kills it. This bounds the chain so a dead or
// stalled provider can't exhaust Vercel's function timeout.
//
// Supported providers (fallback in order). Each provider tries its models
// in order until one succeeds, then falls back to the next provider.
//   GEMINI_API_KEY     → Gemini 2.5 Flash / 3.5-flash-lite (Google)
//   OPENROUTER_API_KEY → llama-3.1-8b / dots-3-note-preview (OpenRouter)
//
// KILO_API_KEY and NVIDIA_API_KEY are no longer usable for CHAT: every
// Kilo model requires credits (account balance 0) and every Nvidia model
// was retired on 2026-08-26. Keep KILO_API_KEY set if STT uses it —
// api/stt.ts still calls Kilo's audio endpoint. Drop NVIDIA_API_KEY.
// Re-add the providers below if you add credits or rotate models.

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
      // Gemini 2.5 Flash thinks by default, and thinking tokens count
      // toward maxOutputTokens — a 512 cap left only ~18 tokens for the
      // answer and truncated it (finishReason: MAX_TOKENS). Reserve the
      // budget for the actual answer.
      generationConfig: {
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    parseResponse: (json) =>
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    // gemini-2.0-flash and gemini-1.5-flash are both retired. 3.5-flash-lite
    // is the current free-tier fallback (Google's own recommendation).
    models: ['gemini-2.5-flash', 'gemini-3.5-flash-lite'],
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
      max_tokens: 512,
    }),
    parseResponse: (json) => json?.choices?.[0]?.message?.content ?? '',
    // gemini-2.0-flash-001 was retired on OpenRouter. Both are free:
    // llama-3.1-8b is ~$0.00005/M tokens, dots3 is fully $0.
    models: [
      'meta-llama/llama-3.1-8b-instruct',
      'dots-studio/dots-3-note-preview:free',
    ],
  },
];

const KEYS: Record<string, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
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

  // Hard cap on total time spent trying providers. Without this, one dead
  // provider with many models can exhaust Vercel's function timeout.
  const deadline = Date.now() + 50_000;

  for (const provider of providers) {
    const key = KEYS[provider.name];
    if (!key) {
      errors.push(`${provider.name}: no API key configured`);
      continue;
    }

    // Try each model for this provider until one succeeds.
    for (const model of provider.models) {
      // Stop early if we're past the overall deadline.
      if (Date.now() > deadline) {
        errors.push('overall: deadline exceeded');
        throw new Error('All AI providers failed: ' + errors.join(' | '));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      try {
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
      } finally {
        // Cleared only after the body has been fully read, so a stalled
        // response can't hang the function past the 15s per-model limit.
        clearTimeout(timeout);
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

    // Hard cap: the per-model timers bound the provider calls, but this is
    // the last line of defense. If anything ever escapes those bounds, the
    // request still returns a clean error instead of hanging until Vercel's
    // own function timeout (which surfaces as a 504 with no message).
    //
    // The timer is hoisted so it can be cleared in finally — otherwise every
    // settled request would leave a 65s timer scheduled.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hardCap = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('AI request timed out — the service may be busy. Please try again.')),
        65_000
      );
    });

    try {
      const result = await Promise.race<ChatResult>([
        sendMessage(message, history || [], provider),
        hardCap,
      ]);

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
    } finally {
      if (timer) clearTimeout(timer);
    }
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
