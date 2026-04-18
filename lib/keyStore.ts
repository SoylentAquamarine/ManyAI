/**
 * keyStore.ts — Secure storage for API keys using expo-secure-store.
 */

import * as SecureStore from 'expo-secure-store';
import { ProviderKey } from './providers';

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
  const providers: ProviderKey[] = [
    'cerebras', 'groq', 'gemini', 'mistral',
    'sambanova', 'fireworks', 'openai',
  ];
  const result: Partial<Record<ProviderKey, string>> = {};
  for (const p of providers) {
    const key = await loadKey(p);
    if (key) result[p] = key;
  }
  return result;
}
