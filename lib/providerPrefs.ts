/**
 * providerPrefs.ts — Store provider enabled/disabled state, priority order,
 * and per-provider selected model.
 */

import * as SecureStore from 'expo-secure-store';
import { ROUTING_ORDER, PROVIDERS, ProviderKey } from './providers';

const ORDER_KEY   = 'manyai_provider_order';
const ENABLED_KEY = 'manyai_provider_enabled';
const MODELS_KEY  = 'manyai_provider_models';

export async function saveProviderOrder(order: ProviderKey[]): Promise<void> {
  await SecureStore.setItemAsync(ORDER_KEY, JSON.stringify(order));
}

export async function loadProviderOrder(): Promise<ProviderKey[]> {
  const raw = await SecureStore.getItemAsync(ORDER_KEY);
  if (!raw) return [...ROUTING_ORDER];
  try {
    const parsed = JSON.parse(raw) as ProviderKey[];
    // Merge in case new providers were added since last save
    const extras = ROUTING_ORDER.filter(k => !parsed.includes(k));
    return [...parsed, ...extras];
  } catch {
    return [...ROUTING_ORDER];
  }
}

export async function saveEnabledProviders(enabled: Record<ProviderKey, boolean>): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, JSON.stringify(enabled));
}

export async function loadEnabledProviders(): Promise<Record<ProviderKey, boolean>> {
  const raw = await SecureStore.getItemAsync(ENABLED_KEY);
  const defaults = Object.fromEntries(ROUTING_ORDER.map(k => [k, true])) as Record<ProviderKey, boolean>;
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

/**
 * Save the user's selected model ID for each provider.
 * Only stores overrides — providers using their default model are omitted.
 */
export async function saveSelectedModels(models: Partial<Record<ProviderKey, string>>): Promise<void> {
  await SecureStore.setItemAsync(MODELS_KEY, JSON.stringify(models));
}

/**
 * Load the user's selected model per provider.
 * Falls back to each provider's default model if no override is stored.
 */
export async function loadSelectedModels(): Promise<Record<ProviderKey, string>> {
  const defaults = Object.fromEntries(
    ROUTING_ORDER.map(k => [k, PROVIDERS[k].model])
  ) as Record<ProviderKey, string>;
  const raw = await SecureStore.getItemAsync(MODELS_KEY);
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}
