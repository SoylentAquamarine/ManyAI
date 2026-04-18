/**
 * savedResponses.ts — Save, categorise, and retrieve AI responses.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedResponse {
  id: string;
  prompt: string;
  response: string;
  provider: string;
  category: string;
  savedAt: string; // ISO timestamp
}

const RESPONSES_KEY = 'manyai_saved_responses';
const CATEGORIES_KEY = 'manyai_categories';

export const DEFAULT_CATEGORIES = ['General', 'Recipes', 'Code', 'Research', 'Ideas', 'Writing'];

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
  // Move responses in deleted category to General
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

export async function loadByCategory(category: string): Promise<SavedResponse[]> {
  const all = await loadAllResponses();
  return all.filter(r => r.category === category);
}

export async function saveResponse(
  prompt: string,
  response: string,
  provider: string,
  category: string = 'General'
): Promise<SavedResponse> {
  const all = await loadAllResponses();
  const item: SavedResponse = {
    id: Date.now().toString(),
    prompt,
    response,
    provider,
    category,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify([item, ...all]));
  return item;
}

export async function updateCategory(id: string, category: string): Promise<void> {
  const all = await loadAllResponses();
  const updated = all.map(r => r.id === id ? { ...r, category } : r);
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(updated));
}

export async function deleteResponse(id: string): Promise<void> {
  const all = await loadAllResponses();
  await AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(all.filter(r => r.id !== id)));
}
