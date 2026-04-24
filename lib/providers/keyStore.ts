/**
 * keyStore.ts — Secure storage for API keys using expo-secure-store.
 */

import * as SecureStore from 'expo-secure-store';
import { ROUTING_ORDER, ProviderKey } from './providers';

const PREFIX = 'manyai_key_';

export async function saveKey(provider: ProviderKey, key: string): Promise<void> {
  await SecureStore.setItemAsync(`${PREFIX}${provider}`, key);
}

export async function loadKey(provider: ProviderKey): Promise<string | null> {
  return await SecureStore.getItemAsync(`${PREFIX}${provider}`);
}

export async function deleteKey(provider: ProviderKey): Promise<void> {
  await SecureStore.deleteItemAsync(`${PREFIX}${provider}`);
}

export async function loadAllKeys(): Promise<Partial<Record<ProviderKey, string>>> {
  // Load keys for every provider that needs one — derived from ROUTING_ORDER
  // so adding a new provider to providers.ts automatically picks it up here.
  const result: Partial<Record<ProviderKey, string>> = {};
  for (const p of ROUTING_ORDER.filter(k => k !== 'pollinations')) {
    const key = await loadKey(p);
    if (key) result[p] = key;
  }
  return result;
}
