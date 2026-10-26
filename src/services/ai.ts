// ─── AI service — client proxy to serverless endpoint ────────────────────
// The actual LLM calls happen in api/chat.ts (serverless function) which
// holds API keys server-side only. The client simply POSTs to /api/chat
// and receives the response.
//
// No API keys live in the client bundle.

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  response: string;
  provider: string;
}

/**
 * Send a message to the AI provider via the serverless proxy.
 *
 * The server handles provider selection and fallback (Gemini → OpenRouter).
 * Pass `provider` to pin a specific provider; omit it to use auto-fallback.
 */
export async function sendMessage(
  message: string,
  history: ChatMessage[],
  provider?: string
): Promise<ChatResult> {
  // Client-side backstop: the server is bounded (~50s), but a hung network
  // or a stalled connection shouldn't spin the UI forever. The timer stays
  // armed until the response body has been fully read, so a provider that
  // sends headers but stalls the body can't hang the UI indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let timedOut = false;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, provider }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { response?: string; provider?: string; error?: string };

    if (data.error) {
      throw new Error(data.error);
    }

    if (!data.response) {
      throw new Error('Empty response from server');
    }

    return { response: data.response, provider: data.provider || 'unknown' };
  } catch (err: any) {
    if (err.name === 'AbortError') timedOut = true;
    throw timedOut
      ? new Error('AI request timed out — the service may be busy. Please try again.')
      : (err.message || 'Network error');
  } finally {
    clearTimeout(timeout);
  }
}
