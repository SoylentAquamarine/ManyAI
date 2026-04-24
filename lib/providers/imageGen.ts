/**
 * imageGen.ts — Image generation via free/freemium AI APIs.
 *
 * Providers (tried in order):
 *   1. Pollinations — completely free, no key, generates via a URL endpoint
 *   2. Fireworks    — reuses the user's existing Fireworks API key,
 *                     runs FLUX.1-schnell for higher quality results
 *
 * Detection:
 *   isImageGenRequest(prompt) returns true when the prompt is clearly asking
 *   for an image to be created rather than a text answer.
 *
 * Flow in the chat screen:
 *   detect → try providers in order → on success display base64 image
 *          → on failure try next → if all fail show error
 */

/** Maximum ms to wait for an image to generate (images are slow) */
const IMAGE_TIMEOUT_MS = 60_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Keys for image-generation providers — separate from the text ProviderKey type */
export type ImageProviderKey = 'pollinations_img' | 'fireworks_img';

export interface ImageGenResult {
  base64?: string;      // Raw base64 image data — no "data:" prefix
  mime: string;         // e.g. "image/jpeg"
  providerName: string; // Human-readable name for display
  latencyMs: number;
  error?: string;       // Set on failure
}

// ─── Provider metadata ────────────────────────────────────────────────────────

/**
 * Order in which to try image providers.
 * Pollinations first — always free; Fireworks second if key is available.
 */
export const IMAGE_PROVIDERS: ImageProviderKey[] = ['pollinations_img', 'fireworks_img'];

/** Human-readable name for display in the chat bubble footer */
export function imageProviderName(key: ImageProviderKey): string {
  return key === 'pollinations_img' ? 'Pollinations' : 'Fireworks';
}

/** Returns true if this provider requires an API key to work */
export function imageProviderNeedsKey(key: ImageProviderKey): boolean {
  return key === 'fireworks_img';
}

// ─── Intent detection ────────────────────────────────────────────────────────

/**
 * Returns true when the prompt is clearly requesting image generation.
 *
 * Designed to catch natural requests ("draw me a cat", "generate an image of
 * a sunset") while avoiding false positives on text tasks ("show me how to
 * generate a report", "draw a conclusion").
 */
export function isImageGenRequest(prompt: string): boolean {
  const p = prompt.toLowerCase();

  // "draw [me] a cat", "paint a landscape", "sketch a robot"
  // These verbs almost always mean image generation in this context.
  if (/\b(draw|paint|sketch)\b/.test(p)) return true;

  // "generate / create / make / render / design" + image noun
  if (
    /\b(generate|create|make|produce|render|design)\b/.test(p) &&
    /\b(image|picture|photo|illustration|artwork|painting|wallpaper|logo|portrait|thumbnail|meme|gif)\b/.test(p)
  ) return true;

  // "show me a picture/image of..."
  if (/show\s+me\s+an?\s+(image|picture|photo)\b/.test(p)) return true;

  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wraps fetch with an AbortController timeout */
function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Converts a fetch Response body to a raw base64 string.
 * Uses ArrayBuffer + Uint8Array + btoa — all available in React Native/Hermes.
 */
async function responseToBase64(res: Response): Promise<string> {
  const arrayBuffer = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Provider calls ───────────────────────────────────────────────────────────

/**
 * Calls one image generation provider and returns the result.
 *
 * @param providerKey  - Which image provider to use
 * @param prompt       - The image description from the user
 * @param apiKey       - API key (not needed for Pollinations)
 */
export async function callImageProvider(
  providerKey: ImageProviderKey,
  prompt: string,
  apiKey?: string,
): Promise<ImageGenResult> {
  const start = Date.now();
  const elapsed = () => Date.now() - start;

  try {
    // ──────────────────────────────────────────────────────────────────────
    // Pollinations — free image generation endpoint.
    // The URL is the full request; we fetch it to validate and get the bytes.
    // ──────────────────────────────────────────────────────────────────────
    if (providerKey === 'pollinations_img') {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) throw new Error('Unexpected non-image response');

      const base64 = await responseToBase64(res);
      const mime = contentType.split(';')[0].trim();
      return { base64, mime, providerName: 'Pollinations', latencyMs: elapsed() };
    }

    // ──────────────────────────────────────────────────────────────────────
    // Fireworks — FLUX.1-schnell image generation.
    // Reuses the user's existing Fireworks API key from the text providers.
    // ──────────────────────────────────────────────────────────────────────
    if (providerKey === 'fireworks_img') {
      if (!apiKey) throw new Error('No Fireworks API key configured');

      const res = await fetchWithTimeout(
        'https://api.fireworks.ai/inference/v1/image_generation/accounts/fireworks/models/flux-1-schnell-fp8',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            prompt,
            samples: 1,
            height: 1024,
            width: 1024,
          }),
        },
      );

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { errMsg = (await res.json())?.error?.message ?? errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const json = await res.json();
      const base64: string = json?.images?.[0]?.base64;
      if (!base64) throw new Error('No image in Fireworks response');

      return { base64, mime: 'image/jpeg', providerName: 'Fireworks (FLUX)', latencyMs: elapsed() };
    }

    throw new Error(`Unknown image provider: ${providerKey}`);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      mime: 'image/jpeg',
      providerName: imageProviderName(providerKey),
      latencyMs: elapsed(),
      error: message,
    };
  }
}
