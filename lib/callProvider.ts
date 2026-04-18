/**
 * callProvider.ts — Calls a provider's API and returns the text response.
 */

import { Provider } from './providers';

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  error?: string;
}

/** Quick key validation — sends "What is 2+2?" and checks for a response. */
export async function testProvider(
  provider: Provider,
  apiKey?: string
): Promise<{ ok: boolean; message: string }> {
  const result = await callProvider(provider, 'What is 2+2? Reply with only the number.', apiKey);
  if (result.error) {
    return { ok: false, message: result.error };
  }
  if (!result.content) {
    return { ok: false, message: 'Empty response' };
  }
  return { ok: true, message: `OK — replied in ${result.latencyMs}ms` };
}

export async function callProvider(
  provider: Provider,
  prompt: string,
  apiKey?: string
): Promise<AIResponse> {
  const start = Date.now();

  try {
    // Pollinations — no key, simple GET
    if (provider.key === 'pollinations') {
      const url = `${provider.baseUrl}/${encodeURIComponent(prompt)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      return { content, provider: provider.key, model: provider.model, latencyMs: Date.now() - start };
    }

    // Gemini — different API format
    if (provider.key === 'gemini') {
      const url = `${provider.baseUrl}/models/${provider.model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err}`);
      }
      const json = await res.json();
      const content = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { content, provider: provider.key, model: provider.model, latencyMs: Date.now() - start };
    }

    // OpenAI-compatible (all other providers)
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    const model = json?.model ?? provider.model;
    return { content, provider: provider.key, model, latencyMs: Date.now() - start };

  } catch (err: any) {
    return {
      content: '',
      provider: provider.key,
      model: provider.model,
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}
