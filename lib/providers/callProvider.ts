/**
 * callProvider.ts — Sends a prompt to an AI provider's API.
 *
 * API shapes supported:
 *   - Pollinations  : simple GET, no key
 *   - Gemini        : Google generateContent REST format
 *   - Anthropic     : Anthropic Messages API (x-api-key auth, different body shape)
 *   - Cloudflare    : Workers AI (account ID embedded in URL, key = "accountId:apiToken")
 *   - OpenAI-compat : all other providers — /chat/completions with Bearer auth
 */

import { Provider } from './providers';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_HISTORY = 10;

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  error?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type OpenAIContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

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

export async function callProvider(
  provider: Provider,
  prompt: string,
  apiKey?: string,
  imageBase64?: string,
  imageMime?: string,
  history: HistoryMessage[] = [],
): Promise<AIResponse> {
  const start = Date.now();
  const elapsed = () => Date.now() - start;

  try {

    // ── Pollinations — keyless GET ────────────────────────────────────────────
    if (provider.key === 'pollinations') {
      const recentHistory = history.slice(-MAX_HISTORY);
      const contextPrefix = recentHistory.length > 0
        ? recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nUser: '
        : '';
      const url = `${provider.baseUrl}/${encodeURIComponent(contextPrefix + prompt)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ── Gemini — Google generateContent format ────────────────────────────────
    if (provider.key === 'gemini') {
      const url = `${provider.baseUrl}/models/${provider.model}:generateContent?key=${apiKey}`;
      const recentHistory = history.slice(-MAX_HISTORY);
      const contents: { role: string; parts: GeminiPart[] }[] = recentHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const currentParts: GeminiPart[] = [];
      if (imageBase64 && imageMime) {
        currentParts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
      }
      currentParts.push({ text: prompt });
      contents.push({ role: 'user', parts: currentParts });

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
      });
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const e = await res.json(); errMsg = e?.error?.message ?? errMsg; } catch {}
        throw new Error(errMsg);
      }
      const json = await res.json();
      const content: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ── Anthropic Claude — Messages API ───────────────────────────────────────
    if (provider.key === 'anthropic') {
      const recentHistory = history.slice(-MAX_HISTORY);
      const messages: { role: string; content: any }[] = recentHistory.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Current message — with optional vision
      if (imageBase64 && imageMime) {
        messages.push({
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMime, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const res = await fetchWithTimeout(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 1024,
          messages,
        }),
      });
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const e = await res.json(); errMsg = e?.error?.message ?? errMsg; } catch {}
        throw new Error(errMsg);
      }
      const json = await res.json();
      const content: string = json?.content?.[0]?.text ?? '';
      return { content, provider: provider.key, model: json?.model ?? provider.model, latencyMs: elapsed() };
    }

    // ── Cloudflare Workers AI — account ID embedded in URL ────────────────────
    if (provider.key === 'cloudflare') {
      // Key format: "accountId:apiToken"
      const [accountId, apiToken] = (apiKey ?? ':').split(':');
      const url = `${provider.baseUrl}/${accountId}/ai/v1/chat/completions`;
      const recentHistory = history.slice(-MAX_HISTORY);
      const messages = [
        ...recentHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt },
      ];

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ model: provider.model, messages }),
      });
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const e = await res.json(); errMsg = e?.errors?.[0]?.message ?? errMsg; } catch {}
        throw new Error(errMsg);
      }
      const json = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? '';
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ── OpenAI-compatible — all other providers ───────────────────────────────
    const recentHistory = history.slice(-MAX_HISTORY);
    const messages: { role: string; content: string | OpenAIContentItem[] }[] = recentHistory.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let messageContent: string | OpenAIContentItem[];
    if (imageBase64 && imageMime) {
      messageContent = [
        { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
        { type: 'text', text: prompt },
      ];
    } else {
      messageContent = prompt;
    }
    messages.push({ role: 'user', content: messageContent });

    const res = await fetchWithTimeout(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(provider.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1024,
        messages,
      }),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const e = await res.json(); errMsg = e?.error?.message ?? errMsg; } catch {}
      throw new Error(errMsg);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const model: string = json?.model ?? provider.model;
    return { content, provider: provider.key, model, latencyMs: elapsed() };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: '', provider: provider.key, model: provider.model, latencyMs: elapsed(), error: message };
  }
}
