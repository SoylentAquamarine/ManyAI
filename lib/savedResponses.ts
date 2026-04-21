/**
 * savedResponses.ts — Save, categorise, title, and retrieve AI responses.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedResponse {
  id: string;
  title: string;      // User-editable title, defaults to first line of response
  prompt: string;
  response: string;
  provider: string;
  category: string;
  savedAt: string;    // ISO timestamp
  imageUri?: string;  // data URI for AI-generated images (optional)
}

const RESPONSES_KEY = 'manyai_saved_responses';
const CATEGORIES_KEY = 'manyai_categories';

export const DEFAULT_CATEGORIES = ['General', 'Recipes', 'Code', 'Research', 'Ideas', 'Writing', 'Images'];

/**
 * Generate a default title from the response text — first 50 chars of first line.
 * For image responses (empty text), falls back to the prompt instead.
 */
export function defaultTitle(response: string, prompt?: string): string {
  const source = response.trim() || prompt?.trim() || '';
  const firstLine = source.split('\n')[0].trim();
  return firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine || 'Untitled';
}

// --- Categories ---

export async function loadCategories(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(CATEGORIES_KEY);
  if (!raw) return [...DEFAULT_CATEGORIES];
  try { return JSON.parse(raw); } catch { return [...DEFAULT_CATEGORIES]; }
}

export async function saveCategories(cats: string[]): Promise<void> {
  await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

export async function addCategory(name: string): Promise<string[]> {
  const cats = await loadCategories();
  if (cats.includes(name)) return cats;
  const next = [...cats, name];
  await saveCategories(next);
  return next;
}

export async function deleteCategory(name: string): Promise<string[]> {
  const cats = await loadCategories();
  const next = cats.filter(c => c !== name);
  await saveCategories(next);
  const all = await loadAllResponses();
  const updated = all.map(r => r.category === name ? { ...r, category: 'General' } : r);
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(updated));
  return next;
}

// --- Responses ---

export async function loadAllResponses(): Promise<SavedResponse[]> {
  const raw = await AsyncStorage.getItem(RESPONSES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function saveResponse(
  prompt: string,
  response: string,
  provider: string,
  category: string = 'General',
  title?: string,
  imageUri?: string,  // Pass the data URI for AI-generated images
): Promise<SavedResponse> {
  const all = await loadAllResponses();
  const item: SavedResponse = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title ?? defaultTitle(response, prompt),
    prompt,
    response,
    provider,
    category,
    savedAt: new Date().toISOString(),
    ...(imageUri ? { imageUri } : {}),
  };
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify([item, ...all]));
  return item;
}

export async function updateResponse(id: string, changes: Partial<SavedResponse>): Promise<void> {
  const all = await loadAllResponses();
  const updated = all.map(r => r.id === id ? { ...r, ...changes } : r);
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(updated));
}

export async function deleteResponse(id: string): Promise<void> {
  const all = await loadAllResponses();
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(all.filter(r => r.id !== id)));
}
