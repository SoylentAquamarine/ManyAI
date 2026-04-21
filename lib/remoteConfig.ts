/**
 * remoteConfig.ts — Fetches provider/model overrides from stevepleasants.com.
 *
 * Steve can edit config.json on the website to add/remove providers and models
 * without requiring a new app build or EAS update. Changes are picked up the
 * next time the app starts and the fetch succeeds.
 *
 * Falls back to the last cached version if the network request fails.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CONFIG_URL = 'https://stevepleasants.com/manyai/config.json';
const CACHE_KEY  = 'manyai_remote_config_v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemoteModel {
  id:   string;
  name: string;
}

export interface RemoteProviderPatch {
  /** Replace the selectable model list entirely */
  models?: RemoteModel[];
  /** Change the default model */
  model?: string;
  /** Force-disable a provider (user can still re-enable in Settings) */
  disabled?: boolean;
}

export interface RemoteConfig {
  /** Increment this when the schema changes */
  version: number;
  /** Unix ms when the app last successfully fetched */
  fetchedAt?: number;
  /** Keyed by ProviderKey — only included entries are patched */
  providers?: Record<string, RemoteProviderPatch>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a fresh config from the server, cache it, and return it.
 * Returns null on any network / parse error.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  try {
    const res = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: RemoteConfig = await res.json();
    const stamped = { ...data, fetchedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(stamped));
    return stamped;
  } catch {
    return null;
  }
}

/**
 * Return the last successfully cached config, or null if none exists.
 */
export async function getCachedConfig(): Promise<RemoteConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RemoteConfig) : null;
  } catch {
    return null;
  }
}

/**
 * Try to fetch a fresh config; fall back to the cache if the fetch fails.
 * Always resolves — never throws.
 */
export async function getRemoteConfig(): Promise<RemoteConfig | null> {
  const fresh = await fetchRemoteConfig();
  if (fresh) return fresh;
  return getCachedConfig();
}
