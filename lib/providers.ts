/**
 * providers.ts — Provider registry and routing logic for ManyAI.
 *
 * Adding a new provider:
 *   1. Add its key to ProviderKey
 *   2. Add its config to PROVIDERS
 *   3. Add it to ROUTING_ORDER at the appropriate priority
 *   4. Add an adapter call in callProvider.ts if its API differs from OpenAI format
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Unique identifier for each provider — used as storage keys and route params */
export type ProviderKey =
  | 'cerebras'
  | 'groq'
  | 'gemini'
  | 'mistral'
  | 'sambanova'
  | 'fireworks'
  | 'openai'
  | 'pollinations';

/** Task categories used to match prompts to the most suitable provider */
export type TaskType =
  | 'coding'
  | 'summarization'
  | 'creative'
  | 'reasoning'
  | 'translation'
  | 'general';

/** Full provider configuration */
export interface Provider {
  key: ProviderKey;
  name: string;          // Display name
  model: string;         // Default model identifier sent to the API
  baseUrl: string;       // API base URL (no trailing slash)
  needsKey: boolean;     // Whether an API key is required
  color: string;         // Hex colour for UI indicators
  bestFor: TaskType[];   // Task types this provider excels at
  goodAt: string;        // Human-readable strengths (shown in Settings)
  notGreatAt: string;    // Human-readable weaknesses (shown in Settings)
  supportsVision: boolean; // Whether this provider accepts image input
}

// ─── Provider registry ────────────────────────────────────────────────────────

export const PROVIDERS: Record<ProviderKey, Provider> = {
  cerebras: {
    key: 'cerebras',
    name: 'Cerebras',
    model: 'llama3.1-8b',
    baseUrl: 'https://api.cerebras.ai/v1',
    needsKey: true,
    color: '#FF6B6B',
    bestFor: ['general'],
    goodAt: 'Fastest responses of any provider — great for quick questions and classifications',
    notGreatAt: 'Deep reasoning or long-form writing — smaller model',
    supportsVision: false,
  },
  groq: {
    key: 'groq',
    name: 'Groq',
    model: 'llama-3.1-8b-instant',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    color: '#4ECDC4',
    bestFor: ['general', 'summarization'],
    goodAt: 'Fast, reliable general Q&A and summarisation. Very consistent.',
    notGreatAt: 'Complex coding tasks or nuanced creative writing',
    supportsVision: false,
  },
  gemini: {
    key: 'gemini',
    name: 'Gemini',
    model: 'gemini-2.5-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    color: '#45B7D1',
    bestFor: ['summarization', 'translation'],
    goodAt: 'Long documents, translation, and image understanding (vision)',
    notGreatAt: 'Can be slower than Groq/Cerebras for simple questions',
    supportsVision: true,
  },
  mistral: {
    key: 'mistral',
    name: 'Mistral',
    model: 'mistral-small-latest',
    baseUrl: 'https://api.mistral.ai/v1',
    needsKey: true,
    color: '#96CEB4',
    bestFor: ['coding', 'creative'],
    goodAt: 'Code generation, creative writing, and following detailed instructions',
    notGreatAt: 'Real-time or very fast responses — slightly slower than Groq',
    supportsVision: false,
  },
  sambanova: {
    key: 'sambanova',
    name: 'SambaNova',
    model: 'Meta-Llama-3.3-70B-Instruct',
    baseUrl: 'https://api.sambanova.ai/v1',
    needsKey: true,
    color: '#FFEAA7',
    bestFor: ['reasoning'],
    goodAt: 'Deep reasoning, analysis, and nuanced answers — 70B model, highest quality free tier',
    notGreatAt: 'Speed — larger model means slower responses',
    supportsVision: false,
  },
  fireworks: {
    key: 'fireworks',
    name: 'Fireworks',
    model: 'accounts/fireworks/models/deepseek-v3p1',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    needsKey: true,
    color: '#DDA0DD',
    bestFor: ['coding', 'general'],
    goodAt: 'Strong coding with DeepSeek V3 — good fallback when others are down',
    notGreatAt: 'Can return verbose responses; less consistent on simple questions',
    supportsVision: false,
  },
  openai: {
    key: 'openai',
    name: 'OpenAI',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    color: '#74B9FF',
    bestFor: ['coding', 'reasoning', 'general'],
    goodAt: 'Well-rounded — coding, image understanding (vision), instruction following',
    notGreatAt: 'Free tier has rate limits; not as fast as Groq/Cerebras',
    supportsVision: true,
  },
  pollinations: {
    key: 'pollinations',
    name: 'Pollinations',
    model: 'openai',
    baseUrl: 'https://text.pollinations.ai',
    needsKey: false,
    color: '#FD79A8',
    bestFor: ['general', 'creative'],
    goodAt: 'No API key needed — always available as a fallback',
    notGreatAt: 'Less reliable, no conversation context, variable quality',
    supportsVision: false,
  },
};

/**
 * Default routing order — highest priority first.
 * Cerebras/Groq are fastest, SambaNova is highest quality,
 * Pollinations is always last (keyless fallback).
 */
export const ROUTING_ORDER: ProviderKey[] = [
  'cerebras',
  'groq',
  'gemini',
  'mistral',
  'sambanova',
  'fireworks',
  'openai',
  'pollinations',
];

// ─── Routing logic ────────────────────────────────────────────────────────────

/**
 * Selects the best available provider for a given task.
 *
 * Selection algorithm:
 *   Pass 1 — find a provider in `order` that:
 *     - is not in `exclude` (already tried / failed)
 *     - is enabled
 *     - has an available key (or needs no key)
 *     - lists `taskType` in its bestFor array
 *   Pass 2 — same criteria but without the bestFor requirement
 *   Pass 3 — fall back to Pollinations if not excluded
 *
 * Returns null if every provider has been exhausted.
 *
 * @param availableKeys - Set of provider keys that have a stored API key
 * @param taskType      - Detected or default task category
 * @param exclude       - Providers to skip (failed this request)
 * @param order         - Custom priority order from user preferences
 * @param enabled       - Per-provider enabled/disabled flags
 */
export function pickProvider(
  availableKeys: Set<ProviderKey>,
  taskType: TaskType = 'general',
  exclude: Set<ProviderKey> = new Set(),
  order: ProviderKey[] = ROUTING_ORDER,
  enabled: Partial<Record<ProviderKey, boolean>> = {}
): ProviderKey | null {
  /** Returns true if the provider should be considered */
  const isCandidate = (k: ProviderKey): boolean => {
    if (exclude.has(k)) return false;           // Already tried this request
    if (enabled[k] === false) return false;      // User disabled it
    if (k === 'pollinations') return true;        // Always available
    return availableKeys.has(k);                 // Has a stored key
  };

  // Pass 1: best-fit provider for this task type
  for (const key of order) {
    if (key === 'pollinations') continue; // Reserve Pollinations for last resort
    if (!isCandidate(key)) continue;
    if (PROVIDERS[key].bestFor.includes(taskType)) return key;
  }

  // Pass 2: any available keyed provider in priority order
  for (const key of order) {
    if (key === 'pollinations') continue;
    if (isCandidate(key)) return key;
  }

  // Pass 3: Pollinations — no key needed, always works
  if (isCandidate('pollinations')) return 'pollinations';

  // All providers exhausted
  return null;
}
