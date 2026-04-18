/**
 * providers.ts — All free AI providers and routing logic for ManyAI.
 *
 * Providers are tried in priority order. Pollinations needs no key.
 * All others need an API key stored via SecureStore.
 */

export type ProviderKey =
  | 'cerebras'
  | 'groq'
  | 'gemini'
  | 'mistral'
  | 'sambanova'
  | 'fireworks'
  | 'openai'
  | 'pollinations';

export type TaskType =
  | 'coding'
  | 'summarization'
  | 'creative'
  | 'reasoning'
  | 'translation'
  | 'general';

export interface Provider {
  key: ProviderKey;
  name: string;
  model: string;
  baseUrl: string;
  needsKey: boolean;
  color: string;
  bestFor: TaskType[];
}

export const PROVIDERS: Record<ProviderKey, Provider> = {
  cerebras: {
    key: 'cerebras',
    name: 'Cerebras',
    model: 'llama3.1-8b',
    baseUrl: 'https://api.cerebras.ai/v1',
    needsKey: true,
    color: '#FF6B6B',
    bestFor: ['general'],
  },
  groq: {
    key: 'groq',
    name: 'Groq',
    model: 'llama-3.1-8b-instant',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    color: '#4ECDC4',
    bestFor: ['general', 'summarization'],
  },
  gemini: {
    key: 'gemini',
    name: 'Gemini',
    model: 'gemini-2.5-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    color: '#45B7D1',
    bestFor: ['summarization', 'translation'],
  },
  mistral: {
    key: 'mistral',
    name: 'Mistral',
    model: 'mistral-small-latest',
    baseUrl: 'https://api.mistral.ai/v1',
    needsKey: true,
    color: '#96CEB4',
    bestFor: ['coding', 'creative'],
  },
  sambanova: {
    key: 'sambanova',
    name: 'SambaNova',
    model: 'Meta-Llama-3.3-70B-Instruct',
    baseUrl: 'https://api.sambanova.ai/v1',
    needsKey: true,
    color: '#FFEAA7',
    bestFor: ['reasoning'],
  },
  fireworks: {
    key: 'fireworks',
    name: 'Fireworks',
    model: 'accounts/fireworks/models/deepseek-v3p1',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    needsKey: true,
    color: '#DDA0DD',
    bestFor: ['coding', 'general'],
  },
  openai: {
    key: 'openai',
    name: 'OpenAI',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    color: '#74B9FF',
    bestFor: ['coding', 'reasoning', 'general'],
  },
  pollinations: {
    key: 'pollinations',
    name: 'Pollinations',
    model: 'openai',
    baseUrl: 'https://text.pollinations.ai',
    needsKey: false,
    color: '#FD79A8',
    bestFor: ['general', 'creative'],
  },
};

/** Priority order — fastest / most capable first, pollinations last (no key fallback) */
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

/** Pick best provider given available keys, skipping any in the excluded set */
export function pickProvider(
  availableKeys: Set<ProviderKey>,
  taskType: TaskType = 'general',
  exclude: Set<ProviderKey> = new Set()
): ProviderKey | null {
  // First try: keyed provider best for this task (never prefer pollinations over a real key)
  for (const key of ROUTING_ORDER) {
    if (key === 'pollinations') continue;
    if (exclude.has(key)) continue;
    const p = PROVIDERS[key];
    if (p.bestFor.includes(taskType) && availableKeys.has(key)) {
      return key;
    }
  }
  // Second try: any keyed provider in priority order
  for (const key of ROUTING_ORDER) {
    if (key === 'pollinations') continue;
    if (exclude.has(key)) continue;
    if (availableKeys.has(key)) {
      return key;
    }
  }
  // Last resort: pollinations (no key needed)
  if (!exclude.has('pollinations')) return 'pollinations';
  return null; // all providers exhausted
}
