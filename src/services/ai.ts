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
 * The server handles provider selection and fallback (Gemini → OpenRouter
 * → NVIDIA). Pass `provider` to pin a specific provider; omit it to use
 * auto-fallback.
 */
export async function sendMessage(
  message: string,
  history: ChatMessage[],
  provider?: string
): Promise<ChatResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, provider }),
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
}
