/**
 * callProvider.ts — Sends a prompt (and optional image) to an AI provider's API.
 *
 * Supports three API shapes:
 *   - Pollinations: simple HTTP GET, no key required
 *   - Gemini: Google's generateContent REST API (different from OpenAI format)
 *   - OpenAI-compatible: all other providers use the same /chat/completions format
 *
 * Vision (image) support:
 *   - Gemini: inline_data with base64
 *   - OpenAI: content array with image_url (data URI)
 *   - All others: text only (image is silently ignored)
 */

import { Provider } from './providers';

/** Maximum ms to wait for any provider before giving up */
const FETCH_TIMEOUT_MS = 30_000;

export interface AIResponse {
  content: string;    // The text response from the AI
  provider: string;   // Provider key (e.g. "groq")
  model: string;      // Actual model name returned by the API
  latencyMs: number;  // Round-trip time in milliseconds
  error?: string;     // Set if the call failed
}

/** Gemini API request part — text or inline image */
type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

/** OpenAI content item — text or image URL */
type OpenAIContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * Creates a fetch request that rejects after FETCH_TIMEOUT_MS.
 * Prevents hung providers from blocking the fallback chain indefinitely.
 */
function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Quick key validation — asks "What is 2+2?" and checks for any response.
 * Used by the Settings screen Test button.
 */
export async function testProvider(
  provider: Provider,
  apiKey?: string
): Promise<{ ok: boolean; message: string }> {
  const result = await callProvider(
    provider,
    'What is 2+2? Reply with only the number.',
    apiKey
  );
  if (result.error) return { ok: false, message: result.error };
  if (!result.content) return { ok: false, message: 'Empty response' };
  return { ok: true, message: `OK — replied in ${result.latencyMs}ms` };
}

/**
 * Calls a provider and returns its response.
 *
 * @param provider   - Provider config from providers.ts
 * @param prompt     - The user's text prompt
 * @param apiKey     - API key (not needed for Pollinations)
 * @param imageBase64 - Base64 image data without the data: prefix
 * @param imageMime  - MIME type, e.g. "image/jpeg"
 */
export async function callProvider(
  provider: Provider,
  prompt: string,
  apiKey?: string,
  imageBase64?: string,
  imageMime?: string,
): Promise<AIResponse> {
  const start = Date.now();
  const elapsed = () => Date.now() - start;

  try {
    // ----------------------------------------------------------------
    // Pollinations — keyless GET request, text only
    // ----------------------------------------------------------------
    if (provider.key === 'pollinations') {
      const url = `${provider.baseUrl}/${encodeURIComponent(prompt)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ----------------------------------------------------------------
    // Gemini — Google's own REST format, supports vision
    // ----------------------------------------------------------------
    if (provider.key === 'gemini') {
      const url = `${provider.baseUrl}/models/${provider.model}:generateContent?key=${apiKey}`;

      // Build parts array — image first (if provided), then text
      const parts: GeminiPart[] = [];
      if (imageBase64 && imageMime) {
        parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
      }
      parts.push({ text: prompt });

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      });

      if (!res.ok) {
        // Try to parse a meaningful error from Google's response body
        let errMsg = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          errMsg = errJson?.error?.message ?? errMsg;
        } catch { /* ignore parse errors, use status code */ }
        throw new Error(errMsg);
      }

      const json = await res.json();
      const content: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ----------------------------------------------------------------
    // OpenAI-compatible API — used by Groq, Cerebras, Mistral, etc.
    // Supports vision via content array (OpenAI and Gemini only have
    // supportsVision:true, but we build the array anyway — non-vision
    // providers will simply return an error and be skipped.)
    // ----------------------------------------------------------------
    let messageContent: string | OpenAIContentItem[];
    if (imageBase64 && imageMime) {
      // Vision request: image first, then the text prompt
      messageContent = [
        { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
        { type: 'text', text: prompt },
      ];
    } else {
      // Plain text request — cheaper, faster, more compatible
      messageContent = prompt;
    }

    const res = await fetchWithTimeout(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        // OpenAI-compatible APIs put the message at error.message
        errMsg = errJson?.error?.message ?? errMsg;
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    // Use the model name from the response — it may differ from what we sent
    const model: string = json?.model ?? provider.model;
    return { content, provider: provider.key, model, latencyMs: elapsed() };

  } catch (err: unknown) {
    // Catch everything — network errors, timeouts, JSON parse failures
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: '',
      provider: provider.key,
      model: provider.model,
      latencyMs: elapsed(),
      error: message,
    };
  }
}
