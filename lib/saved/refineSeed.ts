/**
 * refineSeed.ts — Passes a saved response into the chat screen for refinement.
 *
 * When the user taps "Refine" on a saved item, we store it here.
 * The chat screen checks for it on focus, clears history, and seeds
 * the conversation with the saved prompt + response as context.
 *
 * Using a module-level variable (not AsyncStorage) because:
 *   - It only needs to survive a tab switch, not an app restart
 *   - It's instant — no async read needed
 *   - It's automatically cleared after being consumed
 */

export interface RefineSeed {
  prompt: string;    // The original question
  response: string;  // The saved AI response to refine
  provider: string;  // Which provider originally answered
  title: string;     // Title of the saved item (shown in chat header)
}

let seed: RefineSeed | null = null;

/** Set by the Saved screen when the user taps Refine */
export function setRefineSeed(s: RefineSeed): void {
  seed = s;
}

/** Read and immediately clear — consumed once by the chat screen */
export function consumeRefineSeed(): RefineSeed | null {
  const s = seed;
  seed = null;
  return s;
}
