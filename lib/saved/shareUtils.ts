/**
 * ManyAI — © 2026 Steve Pleasants. All rights reserved.
 *
 * shareUtils.ts — Sharing and local storage helpers.
 *
 * shareText(text)              → system share sheet (messages, email, copy, etc.)
 * shareImage(dataUri)          → write temp file → system share sheet
 * saveImageToDevice(dataUri)   → write temp file → phone photo library
 *
 * All image operations strip the "data:image/...;base64," prefix before
 * writing so expo-file-system receives raw base64.
 */

import { Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Splits a data URI into its raw base64 payload and file extension.
 * Avoids regex dotall (s flag) which isn't supported in Hermes.
 * e.g. "data:image/jpeg;base64,/9j/..." → { base64: "/9j/...", ext: "jpg" }
 */
function parseDataUri(dataUri: string): { base64: string; ext: string } {
  // Split on the first comma — everything before is the header, after is data
  const commaIdx = dataUri.indexOf(',');
  if (commaIdx === -1) throw new Error('Invalid data URI: no comma separator');

  const header = dataUri.slice(0, commaIdx);   // e.g. "data:image/jpeg;base64"
  const base64 = dataUri.slice(commaIdx + 1);  // the raw base64 string

  // Parse MIME type from header (no dotall needed — header is short)
  const mimeMatch = header.match(/^data:(image\/(\w+));base64$/);
  if (!mimeMatch) throw new Error('Not a valid image data URI');

  const subtype = mimeMatch[2]; // "jpeg", "png", "webp", etc.
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  return { base64, ext };
}

/**
 * Writes a data URI to the Expo cache directory as a temp file
 * and returns its local URI. Used by both sharing and gallery save.
 */
async function writeTempImageFile(dataUri: string): Promise<string> {
  const { base64, ext } = parseDataUri(dataUri);
  const fileUri = `${FileSystem.cacheDirectory}manyai_${Date.now()}.${ext}`;
  // Use the string literal — FileSystem.EncodingType can be undefined in some
  // Hermes/Expo Go configurations, but the underlying value is always 'base64'.
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: 'base64' as FileSystem.EncodingType,
  });
  return fileUri;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens the system share sheet for plain text.
 * Lets the user send via email, messages, copy to clipboard, etc.
 */
export async function shareText(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    Alert.alert('Share failed', msg);
  }
}

/**
 * Saves an image data URI to the device's photo library.
 * Requests permission if not already granted.
 */
export async function saveImageToDevice(dataUri: string): Promise<void> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to save images.');
      return;
    }
    const fileUri = await writeTempImageFile(dataUri);
    await MediaLibrary.saveToLibraryAsync(fileUri);
    Alert.alert('Saved!', 'Image saved to your photo library.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Expo Go on Android can't access the media library due to permission restrictions.
    // This works correctly in the production build.
    if (msg.includes('AndroidManifest') || msg.includes('rejected') || msg.includes('AUDIO')) {
      Alert.alert(
        'Not available in Expo Go',
        'Saving to your photo library requires the production app build. Use the Share button instead — you can save from the share sheet.',
      );
    } else {
      Alert.alert('Save failed', msg);
    }
  }
}

/**
 * Writes the image to a temp file then opens the system share sheet.
 * Works for both email attachments and sending to other apps.
 */
export async function shareImage(dataUri: string): Promise<void> {
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Sharing not available', 'Your device does not support sharing files.');
      return;
    }
    const fileUri = await writeTempImageFile(dataUri);
    await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg', dialogTitle: 'Share image' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    Alert.alert('Share failed', msg);
  }
}

