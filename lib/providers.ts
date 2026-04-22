/**
 * providers.ts — Provider registry and routing logic for ManyAI.
 *
 * paidOnly: true  = credit card required to sign up
 * paidOnly: false = free tier available, no credit card needed
 *
 * Model list is also patched at runtime by remoteConfig.ts —
 * edit stevepleasants.com/manyai/config.json to add/remove models without a build.
 */

export type ProviderKey =
  | 'cerebras'
  | 'groq'
  | 'gemini'
  | 'mistral'
  | 'sambanova'
  | 'fireworks'
  | 'openai'
  | 'openrouter'
  | 'cloudflare'
  | 'huggingface'
  | 'anthropic'
  | 'cohere'
  | 'pollinations';

export type TaskType =
  | 'coding'
  | 'summarization'
  | 'creative'
  | 'reasoning'
  | 'translation'
  | 'general';

export interface ProviderModel {
  id: string;
  name: string;
}

export interface Provider {
  key: ProviderKey;
  name: string;
  model: string;
  models: ProviderModel[];
  baseUrl: string;
  needsKey: boolean;
  paidOnly: boolean;           // true = credit card required to sign up
  color: string;
  bestFor: TaskType[];
  goodAt: string;
  notGreatAt: string;
  supportsVision: boolean;
  instructionsUrl: string;     // URL shown in "How to Get Keys" screen
  extraHeaders?: Record<string, string>; // Extra headers sent with every request
  keyHint?: string;            // Shown in API Keys screen to explain key format
}

export const PROVIDERS: Record<ProviderKey, Provider> = {

  // ── Free tier (no credit card) ─────────────────────────────────────────────

  cerebras: {
    key: 'cerebras',
    name: 'Cerebras',
    model: 'llama3.1-8b',
    models: [
      { id: 'llama3.1-8b',  name: 'Llama 3.1 8B (fastest)' },
      { id: 'llama3.3-70b', name: 'Llama 3.3 70B (smarter)' },
    ],
    baseUrl: 'https://api.cerebras.ai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#FF6B6B',
    bestFor: ['general'],
    goodAt: 'Fastest responses of any provider',
    notGreatAt: 'Deep reasoning or long-form writing',
    supportsVision: false,
    instructionsUrl: 'cloud.cerebras.ai',
  },

  groq: {
    key: 'groq',
    name: 'Groq',
    model: 'llama-3.1-8b-instant',
    models: [
      { id: 'llama-3.1-8b-instant',   name: 'Llama 3.1 8B (fast)' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
    ],
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#4ECDC4',
    bestFor: ['general', 'summarization'],
    goodAt: 'Fast, reliable general Q&A and summarisation',
    notGreatAt: 'Complex coding or nuanced creative writing',
    supportsVision: false,
    instructionsUrl: 'console.groq.com',
  },

  gemini: {
    key: 'gemini',
    name: 'Gemini',
    model: 'gemini-2.5-flash-lite',
    models: [
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (fast)' },
      { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash (best quality)' },
    ],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    paidOnly: false,
    color: '#45B7D1',
    bestFor: ['summarization', 'translation'],
    goodAt: 'Long documents, translation, and image understanding (vision)',
    notGreatAt: 'Can be slower than Groq/Cerebras for simple questions',
    supportsVision: true,
    instructionsUrl: 'aistudio.google.com',
  },

  mistral: {
    key: 'mistral',
    name: 'Mistral',
    model: 'mistral-small-latest',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'mistral-large-latest', name: 'Mistral Large (best quality)' },
    ],
    baseUrl: 'https://api.mistral.ai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#96CEB4',
    bestFor: ['coding', 'creative'],
    goodAt: 'Code generation, creative writing, detailed instructions',
    notGreatAt: 'Slightly slower than Groq for simple questions',
    supportsVision: false,
    instructionsUrl: 'console.mistral.ai',
  },

  sambanova: {
    key: 'sambanova',
    name: 'SambaNova',
    model: 'Meta-Llama-3.3-70B-Instruct',
    models: [
      { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
    ],
    baseUrl: 'https://api.sambanova.ai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#FFEAA7',
    bestFor: ['reasoning'],
    goodAt: 'Deep reasoning and nuanced answers',
    notGreatAt: 'Speed — larger model means slower responses',
    supportsVision: false,
    instructionsUrl: 'cloud.sambanova.ai',
  },

  openrouter: {
    key: 'openrouter',
    name: 'OpenRouter',
    model: 'openrouter/free',
    models: [
      { id: 'openrouter/free',                    name: 'Auto (best free model)' },
      { id: 'meta-llama/llama-3.3-70b-instruct',  name: 'Llama 3.3 70B (paid)' },
      { id: 'anthropic/claude-3.5-sonnet',        name: 'Claude 3.5 Sonnet (paid)' },
    ],
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    paidOnly: false,
    color: '#A29BFE',
    bestFor: ['general', 'coding'],
    goodAt: 'Access to hundreds of models — free and paid — with one key',
    notGreatAt: 'Free models have rate limits; quality varies by model',
    supportsVision: false,
    instructionsUrl: 'openrouter.ai/keys',
    extraHeaders: {
      'HTTP-Referer': 'https://stevepleasants.com/manyai',
      'X-Title': 'ManyAI',
    },
  },

  cloudflare: {
    key: 'cloudflare',
    name: 'Cloudflare AI',
    model: '@cf/meta/llama-3.1-8b-instruct',
    models: [
      { id: '@cf/meta/llama-3.1-8b-instruct',           name: 'Llama 3.1 8B' },
      { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B (fast)' },
    ],
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts',
    needsKey: true,
    paidOnly: false,
    color: '#F0A500',
    bestFor: ['general'],
    goodAt: 'Runs on Cloudflare edge — fast and free tier available',
    notGreatAt: 'Smaller model selection than other providers',
    supportsVision: false,
    instructionsUrl: 'dash.cloudflare.com',
    keyHint: 'Enter as accountID:apiToken',
  },

  huggingface: {
    key: 'huggingface',
    name: 'Hugging Face',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    models: [
      { id: 'Qwen/Qwen2.5-72B-Instruct',          name: 'Qwen 2.5 72B' },
      { id: 'meta-llama/Llama-3.1-8B-Instruct',   name: 'Llama 3.1 8B' },
      { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B' },
    ],
    baseUrl: 'https://router.huggingface.co/v1',
    needsKey: true,
    paidOnly: false,
    color: '#FFD93D',
    bestFor: ['general', 'coding'],
    goodAt: 'Massive model selection — thousands of open models available',
    notGreatAt: 'Free tier is rate limited; cold starts can be slow',
    supportsVision: false,
    instructionsUrl: 'huggingface.co/settings/tokens',
  },

  cohere: {
    key: 'cohere',
    name: 'Cohere',
    model: 'command-r-08-2024',
    models: [
      { id: 'command-r-08-2024',      name: 'Command R (2024)' },
      { id: 'command-r-plus-08-2024', name: 'Command R+ (2024)' },
      { id: 'command-a-03-2025',      name: 'Command A (newest)' },
    ],
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    needsKey: true,
    paidOnly: false,
    color: '#55EFC4',
    bestFor: ['summarization', 'reasoning'],
    goodAt: 'Strong at summarization, retrieval, and business tasks',
    notGreatAt: 'Less well-known — smaller community than OpenAI/Meta models',
    supportsVision: false,
    instructionsUrl: 'dashboard.cohere.com',
  },

  // ── Paid (credit card required) ────────────────────────────────────────────

  fireworks: {
    key: 'fireworks',
    name: 'Fireworks',
    model: 'accounts/fireworks/models/deepseek-v3p1',
    models: [
      { id: 'accounts/fireworks/models/deepseek-v3p1',           name: 'DeepSeek V3' },
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B' },
    ],
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    needsKey: true,
    paidOnly: false,
    color: '#DDA0DD',
    bestFor: ['coding', 'general'],
    goodAt: 'Strong coding with DeepSeek V3',
    notGreatAt: 'Requires credit card; can return verbose responses',
    supportsVision: false,
    instructionsUrl: 'fireworks.ai',
  },

  openai: {
    key: 'openai',
    name: 'OpenAI',
    model: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (fast)' },
      { id: 'gpt-4o',      name: 'GPT-4o (best quality)' },
    ],
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    paidOnly: false,
    color: '#74B9FF',
    bestFor: ['coding', 'reasoning', 'general'],
    goodAt: 'Well-rounded — coding, vision, instruction following',
    notGreatAt: 'Costs money; rate limits on lower tiers',
    supportsVision: true,
    instructionsUrl: 'platform.openai.com',
  },

  anthropic: {
    key: 'anthropic',
    name: 'Claude (Anthropic)',
    model: 'claude-3-5-haiku-20241022',
    models: [
      { id: 'claude-3-5-haiku-20241022',  name: 'Claude 3.5 Haiku (fast)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (best)' },
      { id: 'claude-3-opus-20240229',     name: 'Claude 3 Opus (most capable)' },
    ],
    baseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
    paidOnly: true,
    color: '#FD79A8',
    bestFor: ['coding', 'reasoning', 'creative'],
    goodAt: 'Exceptional reasoning, coding, and long-form writing',
    notGreatAt: 'Costs money; no free tier',
    supportsVision: true,
    instructionsUrl: 'console.anthropic.com',
  },

  // ── No key required ────────────────────────────────────────────────────────

  pollinations: {
    key: 'pollinations',
    name: 'Pollinations',
    model: 'openai',
    models: [
      { id: 'openai',  name: 'OpenAI (via Pollinations)' },
      { id: 'mistral', name: 'Mistral (via Pollinations)' },
      { id: 'llama',   name: 'Llama (via Pollinations)' },
    ],
    baseUrl: 'https://text.pollinations.ai',
    needsKey: false,
    paidOnly: false,
    color: '#FD79A8',
    bestFor: ['general', 'creative'],
    goodAt: 'No API key needed — always available as a fallback',
    notGreatAt: 'Less reliable, variable quality',
    supportsVision: false,
    instructionsUrl: 'pollinations.ai',
  },
};

export const ROUTING_ORDER: ProviderKey[] = [
  'cerebras',
  'groq',
  'gemini',
  'mistral',
  'sambanova',
  'openrouter',
  'huggingface',
  'cohere',
  'cloudflare',
  'fireworks',
  'openai',
  'anthropic',
  'pollinations',
];

export function pickProvider(
  availableKeys: Set<ProviderKey>,
  taskType: TaskType = 'general',
  exclude: Set<ProviderKey> = new Set(),
  order: ProviderKey[] = ROUTING_ORDER,
  enabled: Partial<Record<ProviderKey, boolean>> = {}
): ProviderKey | null {
  const isCandidate = (k: ProviderKey): boolean => {
    if (exclude.has(k)) return false;
    if (enabled[k] === false) return false;
    if (k === 'pollinations') return true;
    return availableKeys.has(k);
  };

  for (const key of order) {
    if (key === 'pollinations') continue;
    if (!isCandidate(key)) continue;
    if (PROVIDERS[key].bestFor.includes(taskType)) return key;
  }

  for (const key of order) {
    if (key === 'pollinations') continue;
    if (isCandidate(key)) return key;
  }

  if (isCandidate('pollinations')) return 'pollinations';
  return null;
}
