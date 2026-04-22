/**
 * ManyAI — © 2026 Steve Pleasants. All rights reserved.
 *
 * index.tsx — Main chat screen for ManyAI.
 *
 * Handles:
 *   - User input (text + image)
 *   - Provider selection via pickProvider()
 *   - Automatic fallback when a provider fails
 *   - Save-to-category for any AI response
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { loadAllKeys } from '@/lib/keyStore';
import { pickProvider, PROVIDERS, ROUTING_ORDER, ProviderKey } from '@/lib/providers';
import { callProvider } from '@/lib/callProvider';
import { loadProviderOrder, loadEnabledProviders, loadSelectedModels } from '@/lib/providerPrefs';
import { saveResponse, loadCategories } from '@/lib/savedResponses';
import { shareText, shareImage, saveImageToDevice } from '@/lib/shareUtils';
import { HistoryMessage } from '@/lib/callProvider';
import { consumeRefineSeed } from '@/lib/refineSeed';
import {
  isImageGenRequest, callImageProvider, IMAGE_PROVIDERS,
  imageProviderName, imageProviderNeedsKey,
} from '@/lib/imageGen';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single message in the conversation */
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;          // User-attached image URI (input, user messages)
  generatedImageUri?: string; // AI-generated image data URI (output, assistant messages)
  provider?: string;          // Provider display name (AI messages only)
  model?: string;             // Model used (AI messages only)
  latencyMs?: number;         // Response time (AI messages only)
  error?: boolean;            // True if this is an error message
};

/** Pending image data captured before sending */
type PendingImage = {
  uri: string;      // Local file URI for preview
  base64: string;   // Base64-encoded data sent to the API
  mime: string;     // MIME type e.g. "image/jpeg"
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Providers that accept image input — derived from supportsVision in providers.ts */
const VISION_PROVIDERS = new Set<ProviderKey>(
  ROUTING_ORDER.filter(k => PROVIDERS[k].supportsVision)
);

/** Maximum number of providers to try before giving up */
const MAX_RETRIES = 8;

/** Generate a unique message ID — uses timestamp + random suffix to avoid collisions */
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();

  // Conversation state
  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    role: 'assistant',
    content: 'Hi! I am ManyAI. Ask me anything and I will route it to the best available free AI provider.',
    provider: 'system',
  }]);

  // Input state
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);

  // Loading state
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Routing to best provider...');

  // Provider configuration — reloaded on tab focus
  const [keys, setKeys] = useState<Partial<Record<ProviderKey, string>>>({});
  const [providerOrder, setProviderOrder] = useState<ProviderKey[]>([]);
  const [enabledProviders, setEnabledProviders] = useState<Partial<Record<ProviderKey, boolean>>>({});
  const [selectedModels, setSelectedModels] = useState<Partial<Record<ProviderKey, string>>>({});

  // Save modal state
  const [saveTarget, setSaveTarget] = useState<Message | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  /**
   * When a saved response is being refined, we show its title in the header
   * so the user knows what context the conversation is seeded with.
   */
  const [refineTitle, setRefineTitle] = useState<string | null>(null);

  /** Help modal — shown on first launch and when user types /help */
  const [showHelp, setShowHelp] = useState(false);

  /**
   * Providers that have failed during this session.
   * Stored in a ref (not state) so it doesn't trigger re-renders,
   * and so the value is always current inside async callbacks.
   */
  const failedProviders = useRef<Set<ProviderKey>>(new Set());

  const listRef = useRef<FlatList>(null);

  // ─── First-launch onboarding ───────────────────────────────────────────────

  /** Show the help modal automatically the very first time the app is opened */
  useEffect(() => {
    AsyncStorage.getItem('manyai_onboarded').then(val => {
      if (!val) {
        setShowHelp(true);
        AsyncStorage.setItem('manyai_onboarded', '1');
      }
    });
  }, []);

  // ─── Data loading ──────────────────────────────────────────────────────────

  /**
   * Reload keys, ordering, and categories whenever this tab gains focus.
   * This ensures changes made in Settings take effect immediately.
   * Also clears the failed-providers list so fresh sessions start clean.
   */
  useFocusEffect(useCallback(() => {
    Promise.all([
      loadAllKeys(),
      loadProviderOrder(),
      loadEnabledProviders(),
      loadCategories(),
      loadSelectedModels(),
    ]).then(([k, order, enabled, cats, models]) => {
      setKeys(k);
      setProviderOrder(order);
      setEnabledProviders(enabled);
      setCategories(cats);
      setSelectedModels(models);
      failedProviders.current = new Set(); // Reset on each focus

      // Check if the Saved screen sent us a response to refine.
      // consumeRefineSeed() reads the module-level variable and clears it.
      const seed = consumeRefineSeed();
      if (seed) {
        // Seed the conversation with the saved prompt + response as context,
        // then let the user continue from there.
        setRefineTitle(seed.title);
        setMessages([
          {
            id: '0',
            role: 'assistant',
            content: 'Hi! I am ManyAI. Ask me anything and I will route it to the best available free AI provider.',
            provider: 'system',
          },
          {
            id: makeId(),
            role: 'user',
            content: seed.prompt,
          },
          {
            id: makeId(),
            role: 'assistant',
            content: seed.response,
            provider: seed.provider,
          },
        ]);
      }
    });
  }, []));

  // ─── Image handling ────────────────────────────────────────────────────────

  /** Open the device photo library and select an image */
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,       // We need base64 to send to the API
      quality: 0.5,       // Reduce size for faster API transfer
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingImage({
        uri: asset.uri,
        base64: asset.base64 ?? '',
        mime: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  /** Open the camera and take a new photo */
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission required', 'Please allow camera access to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingImage({
        uri: asset.uri,
        base64: asset.base64 ?? '',
        mime: asset.mimeType ?? 'image/jpeg',
      });
    }
  };

  // ─── Clear chat ────────────────────────────────────────────────────────────

  /**
   * Reset the conversation to the initial greeting and clear all history.
   * Also resets the failed-providers list so every provider is tried fresh.
   */
  const clearChat = () => {
    Alert.alert('Clear chat', 'Start a new conversation? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        setMessages([{
          id: '0',
          role: 'assistant',
          content: 'Hi! I am ManyAI. Ask me anything and I will route it to the best available free AI provider.',
          provider: 'system',
        }]);
        setRefineTitle(null);
        failedProviders.current = new Set();
      }},
    ]);
  };

  // ─── Send logic ────────────────────────────────────────────────────────────

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;

    // ── /help command ────────────────────────────────────────────────────────
    if (text.toLowerCase() === '/help') {
      setInput('');
      setShowHelp(true);
      return;
    }

    // Capture pendingImage NOW before clearing state.
    // React state updates are async — if we clear pendingImage then reference
    // it later in the async loop, we'd get null.
    const imageSnapshot = pendingImage;

    // Add the user's message to the conversation
    const userMsg: Message = {
      id: makeId(),
      role: 'user',
      content: text || '(image)',
      imageUri: imageSnapshot?.uri,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setPendingImage(null);
    setLoading(true);

    // ── Image generation path ────────────────────────────────────────────────
    // If the prompt looks like an image request (and no image is attached for
    // vision analysis), route to image generation providers instead of LLMs.
    if (text && !imageSnapshot && isImageGenRequest(text)) {
      let imgLastError = 'No image providers available';

      for (const imgKey of IMAGE_PROVIDERS) {
        // Skip if this provider needs a key we don't have
        if (imageProviderNeedsKey(imgKey) && !keys['fireworks']) continue;

        setLoadingLabel(`Generating image with ${imageProviderName(imgKey)}...`);

        const apiKey = imgKey === 'fireworks_img' ? keys['fireworks'] : undefined;
        const result = await callImageProvider(imgKey, text, apiKey);

        if (!result.error && result.base64) {
          // Build a data URI so React Native's Image component can display it
          const dataUri = `data:${result.mime};base64,${result.base64}`;
          setMessages(prev => [...prev, {
            id: makeId(),
            role: 'assistant',
            content: '',  // Visual only — the image IS the content
            generatedImageUri: dataUri,
            provider: result.providerName,
            latencyMs: result.latencyMs,
          }]);
          setLoading(false);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
          return;
        }

        imgLastError = result.error ?? 'No image returned';
        // Continue to next image provider
      }

      // All image providers failed
      setMessages(prev => [...prev, {
        id: makeId(),
        role: 'assistant',
        content: `Image generation failed: ${imgLastError}`,
        error: true,
      }]);
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    // ── Text generation path (default) ───────────────────────────────────────

    // Build the set of providers that have keys configured
    const available = new Set<ProviderKey>([
      ...Object.keys(keys) as ProviderKey[],
      'pollinations', // Always available — no key needed
    ]);

    // If an image is attached, restrict to vision-capable providers only.
    // Non-vision providers would just return errors, wasting time.
    const pool = imageSnapshot
      ? new Set([...available].filter(k => VISION_PROVIDERS.has(k)))
      : available;

    // Build conversation history from previous messages for context.
    // Exclude error messages and the system greeting — only real exchanges.
    const history: HistoryMessage[] = messages
      .filter(m => m.provider !== 'system' && !m.error && m.content !== '(image)')
      .map(m => ({ role: m.role, content: m.content }));

    // Try providers in order, skipping known failures
    let lastError = 'No providers available';
    const tried = new Set(failedProviders.current); // Start from session failures
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      attempts++;
      const providerKey = pickProvider(pool, 'general', tried, providerOrder, enabledProviders);

      // All providers exhausted
      if (!providerKey) break;

      // Inject the user's chosen model (may differ from provider default)
      const providerWithModel = {
        ...PROVIDERS[providerKey],
        model: selectedModels[providerKey] ?? PROVIDERS[providerKey].model,
      };
      setLoadingLabel(`Trying ${providerWithModel.name} · ${providerWithModel.model.split('/').pop()}...`);

      const result = await callProvider(
        providerWithModel,
        text,
        keys[providerKey] ?? undefined,
        imageSnapshot?.base64,
        imageSnapshot?.mime,
        history,
      );

      if (!result.error && result.content) {
        // Success — add AI response to conversation
        setMessages(prev => [...prev, {
          id: makeId(),
          role: 'assistant',
          content: result.content,
          provider: PROVIDERS[providerKey].name,
          model: result.model,
          latencyMs: result.latencyMs,
        }]);
        setLoading(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        return;
      }

      // Failed — record it so we skip this provider next time too
      lastError = result.error ?? 'Empty response';
      tried.add(providerKey);
      failedProviders.current.add(providerKey);
    }

    // All providers failed — show helpful error message
    const freeProviderNames = ROUTING_ORDER
      .filter(k => k !== 'pollinations' && !PROVIDERS[k].paidOnly && PROVIDERS[k].needsKey)
      .map(k => PROVIDERS[k].name)
      .join(', ');
    const noProvidersMsg = lastError === 'No providers available'
      ? `No providers are enabled or have API keys. Go to Settings → API Keys to add free keys from ${freeProviderNames}. Pollinations requires no key and is always available.`
      : `All providers failed. Last error: ${lastError}\n\nTip: Go to Settings → Providers & Models to check which providers are enabled.`;
    setMessages(prev => [...prev, {
      id: makeId(),
      role: 'assistant',
      content: noProvidersMsg,
      error: true,
    }]);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  /**
   * Memoized renderItem prevents the entire list from re-rendering
   * every time the input field changes.
   */
  const renderItem = useCallback(({ item }: { item: Message }) => (
    <View style={[
      styles.bubble,
      item.role === 'user' ? styles.userBubble : styles.aiBubble,
      // Give generated-image bubbles more width so the image isn't tiny
      item.generatedImageUri ? styles.imageBubble : null,
    ]}>
      {/* User-attached image preview (sent TO the AI) */}
      {item.imageUri && (
        <Image source={{ uri: item.imageUri }} style={styles.msgImage} />
      )}

      {/* AI-generated image (returned FROM the AI) */}
      {item.generatedImageUri && (
        <Image
          source={{ uri: item.generatedImageUri }}
          style={styles.generatedImage}
          resizeMode="contain"
        />
      )}

      {/* Message text — skip empty content and the "(image)" placeholder */}
      {item.content !== '(image)' && item.content !== '' && (
        <Text style={[styles.bubbleText, item.error && styles.errorText]}>
          {item.content}
        </Text>
      )}

      {/* Footer: provider info + action buttons (AI messages only) */}
      {item.provider && item.provider !== 'system' && (
        <View style={styles.bubbleFooter}>
          <Text style={styles.providerLabel}>
            {item.provider}
            {item.model ? ` · ${item.model}` : ''}
            {item.latencyMs ? ` · ${item.latencyMs}ms` : ''}
          </Text>
          {!item.error && (
            <View style={styles.bubbleActions}>
              {/* Share button — image or text */}
              {item.generatedImageUri ? (
                <TouchableOpacity onPress={() => shareImage(item.generatedImageUri!)}>
                  <Text style={styles.saveBtnText}>Share</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => shareText(item.content)}>
                  <Text style={styles.saveBtnText}>Share</Text>
                </TouchableOpacity>
              )}
              {/* Save to app — always available */}
              <TouchableOpacity
                onPress={() => {
                  loadCategories().then(setCategories);
                  setSaveTarget(item);
                }}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  ), []); // No deps — item content never changes after creation

  /** Key extractor for FlatList */
  const keyExtractor = useCallback((item: Message) => item.id, []);

  // ─── Derived state ─────────────────────────────────────────────────────────

  const keyCount = Object.keys(keys).length;

  /**
   * True active provider count: providers in the current order that are
   * enabled AND either have a key or require no key (Pollinations).
   */
  const activeProviderCount = providerOrder.filter(pk =>
    enabledProviders[pk] !== false &&
    (pk === 'pollinations' || !!keys[pk as ProviderKey])
  ).length;

  // ─── Save handler ──────────────────────────────────────────────────────────

  /**
   * Save the targeted message to the chosen category.
   * We look up the preceding user message to store as the prompt context.
   */
  const handleSave = useCallback(async (cat: string) => {
    if (!saveTarget) return;
    setMessages(currentMessages => {
      const idx = currentMessages.findIndex(m => m.id === saveTarget.id);
      const prompt = idx > 0 ? currentMessages[idx - 1].content : '';
      // Pass generatedImageUri so image responses are saved with their image,
      // not just the empty content string.
      saveResponse(
        prompt,
        saveTarget.content,
        saveTarget.provider ?? '',
        cat,
        undefined,                       // title — let defaultTitle derive it from prompt
        saveTarget.generatedImageUri,    // data URI for generated images
      ).then(() => Alert.alert('Saved!', `Saved to "${cat}"`));
      return currentMessages;
    });
    setSaveTarget(null);
  }, [saveTarget]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'android' ? 30 : 90}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              ManyAI <Text style={styles.version}>v{Constants.expoConfig?.version ?? '1.0'}</Text>
            </Text>
            {refineTitle ? (
              <Text style={styles.refineLabel} numberOfLines={1}>✎ Refining: {refineTitle}</Text>
            ) : (
              <Text style={styles.headerSub}>
                {activeProviderCount > 1
                  ? `${activeProviderCount} providers ready`
                  : activeProviderCount === 1
                  ? '1 provider ready'
                  : 'Using Pollinations (free) — add keys in Settings for more'}
              </Text>
            )}
          </View>
          {/* Help button */}
          <TouchableOpacity style={styles.helpBtn} onPress={() => setShowHelp(true)}>
            <Text style={styles.helpBtnText}>?</Text>
          </TouchableOpacity>
          {/* Clear chat button — always visible in header */}
          <TouchableOpacity style={styles.clearBtn} onPress={clearChat}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        // Suppress the VirtualizedList perf warning for short lists
        removeClippedSubviews={false}
      />

      {/* Typing / routing indicator */}
      {loading && (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color="#4ECDC4" />
          <Text style={styles.typingText}>{loadingLabel}</Text>
        </View>
      )}

      {/* Pending image preview strip */}
      {pendingImage && (
        <View style={styles.pendingImageRow}>
          <Image source={{ uri: pendingImage.uri }} style={styles.pendingThumb} />
          <Text style={styles.pendingLabel}>Image attached</Text>
          <TouchableOpacity onPress={() => setPendingImage(null)}>
            <Text style={styles.removeImage}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.cameraBtn} onPress={pickImage} disabled={loading}>
          <Text style={styles.cameraBtnText}>🖼</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto} disabled={loading}>
          <Text style={styles.cameraBtnText}>📷</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask anything..."
          placeholderTextColor="#666"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={send}
          disabled={loading}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Save to Category modal — slides up from bottom */}
      <Modal
        visible={!!saveTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setSaveTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Save to Category</Text>
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={styles.categoryBtn}
                  onPress={() => handleSave(cat)}
                >
                  <Text style={styles.categoryBtnText}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setSaveTarget(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Help / Onboarding Modal ── */}
      <Modal
        visible={showHelp}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHelp(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.helpBox, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.helpHeader}>
              <Text style={styles.helpTitle}>ManyAI Help</Text>
              <TouchableOpacity onPress={() => setShowHelp(false)}>
                <Text style={styles.helpClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.helpScroll} showsVerticalScrollIndicator={false}>

              <Text style={styles.helpSection}>What is ManyAI?</Text>
              <Text style={styles.helpBody}>
                ManyAI routes your questions to the best available free AI provider automatically. If one fails or hits a rate limit, it tries the next — so you always get an answer.
              </Text>

              <Text style={styles.helpSection}>🤖 Asking questions</Text>
              <Text style={styles.helpBody}>
                Type anything and tap Send. ManyAI picks the fastest available provider for you. The provider name and response time appear below each reply.
              </Text>

              <Text style={styles.helpSection}>🎨 Generating images</Text>
              <Text style={styles.helpBody}>
                Ask naturally:{'\n'}
                • "Draw me a cat in a tree"{'\n'}
                • "Create an image of a sunset"{'\n'}
                • "Paint a watercolor landscape"{'\n\n'}
                ManyAI detects image requests and routes them to Pollinations (free, no key needed).
              </Text>

              <Text style={styles.helpSection}>🔑 Adding API keys</Text>
              <Text style={styles.helpBody}>
                {`Go to Settings → API Keys to add free keys from ${
                  ROUTING_ORDER
                    .filter(k => k !== 'pollinations' && !PROVIDERS[k].paidOnly && PROVIDERS[k].needsKey)
                    .map(k => PROVIDERS[k].name)
                    .join(', ')
                }. Pollinations requires no key at all. The more keys you add, the more fallbacks you have.\n\nTip: tap the QR button to scan your key from a QR code on your laptop — visit qr.io, paste the key, and scan.`}
              </Text>

              <Text style={styles.helpSection}>📷 Sending images</Text>
              <Text style={styles.helpBody}>
                {`Tap 🖼 to attach from your gallery or 📷 to take a photo. Only vision-capable providers (${
                  ROUTING_ORDER
                    .filter(k => PROVIDERS[k].supportsVision)
                    .map(k => PROVIDERS[k].name)
                    .join(', ')
                }) can analyze images — make sure you have one of those keys added.`}
              </Text>

              <Text style={styles.helpSection}>💾 Saving responses</Text>
              <Text style={styles.helpBody}>
                Tap Save below any AI response to save it to a category. You can rename, move, edit, share, and delete saved items from the Saved tab.
              </Text>

              <Text style={styles.helpSection}>✎ Refining saved text</Text>
              <Text style={styles.helpBody}>
                On the Saved tab, expand a text response and tap Refine. ManyAI loads that conversation as context so you can continue or improve it.
              </Text>

              <Text style={styles.helpSection}>⚙️ Providers & Models</Text>
              <Text style={styles.helpBody}>
                Go to Settings → Providers & Models to reorder providers, enable or disable them, and pick which model each one uses.
              </Text>

              <Text style={styles.helpSection}>💡 Commands</Text>
              <Text style={styles.helpBody}>
                <Text style={styles.helpCmd}>/help</Text>{'  '}— show this screen
              </Text>

              <Text style={[styles.helpBody, { textAlign: 'center', marginTop: 20, color: '#444' }]}>
                ManyAI is shareware — free to use, supported by donations.{'\n'}
                If it saves you money on AI subscriptions, please consider supporting development via the Donate section in Settings.{'\n\n'}
                Built by Steve Pleasants · Code by Claude{'\n'}
                © 2026 Steve Pleasants. All rights reserved.
              </Text>

            </ScrollView>
            <TouchableOpacity style={styles.helpDoneBtn} onPress={() => setShowHelp(false)}>
              <Text style={styles.helpDoneBtnText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },

  header: {
    paddingTop: 54, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 34, fontWeight: 'bold', color: '#ffffff' },
  version: { fontSize: 12, fontWeight: 'normal', color: '#444' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  refineLabel: { fontSize: 12, color: '#4ECDC4', marginTop: 2, opacity: 0.8 },
  helpBtn: {
    backgroundColor: '#0f3460', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#4ECDC4', marginLeft: 8,
  },
  helpBtnText: { color: '#4ECDC4', fontSize: 14, fontWeight: 'bold' },
  clearBtn: {
    backgroundColor: '#0f3460', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#555', marginLeft: 8,
  },
  clearBtnText: { color: '#888', fontSize: 12 },

  messageList: { padding: 12, paddingBottom: 8 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#0f3460' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#16213e', borderWidth: 1, borderColor: '#0f3460' },
  // Generated image bubbles get wider so the image has room to breathe
  imageBubble: { maxWidth: '95%', width: '95%' },
  bubbleText: { color: '#eeeeee', fontSize: 15, lineHeight: 22 },
  errorText: { color: '#FF6B6B' },
  msgImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 6 },
  // AI-generated output image — fills the bubble width
  generatedImage: { width: '100%', aspectRatio: 1, borderRadius: 10, marginBottom: 6 },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  providerLabel: { color: '#4ECDC4', fontSize: 10, opacity: 0.7, flex: 1 },
  bubbleActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionBtnText: { color: '#888', fontSize: 14, fontWeight: '600', paddingHorizontal: 4, paddingVertical: 4 },
  saveBtnText: { color: '#4ECDC4', fontSize: 14, fontWeight: '600', paddingHorizontal: 4, paddingVertical: 4 },

  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  typingText: { color: '#888', fontSize: 13 },

  pendingImageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#16213e', borderTopWidth: 1, borderTopColor: '#0f3460',
  },
  pendingThumb: { width: 40, height: 40, borderRadius: 6 },
  pendingLabel: { color: '#aaa', fontSize: 13, flex: 1 },
  removeImage: { color: '#FF6B6B', fontSize: 16, paddingHorizontal: 6 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10,
    backgroundColor: '#16213e', borderTopWidth: 1, borderTopColor: '#0f3460', gap: 8,
  },
  cameraBtn: {
    backgroundColor: '#0f3460', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#4ECDC4',
  },
  cameraBtnText: { fontSize: 16 },
  input: {
    flex: 1, backgroundColor: '#0f3460', color: '#ffffff',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 120,
  },
  sendBtn: { backgroundColor: '#4ECDC4', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 15 },

  // Save modal
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#16213e', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 24, paddingBottom: 40,
  },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  categoryBtn: { backgroundColor: '#0f3460', borderRadius: 10, padding: 14, marginBottom: 8 },
  categoryBtnText: { color: '#eeeeee', fontSize: 15 },
  modalCancelBtn: { marginTop: 8, padding: 14, alignItems: 'center' },
  modalCancelText: { color: '#888', fontSize: 15 },

  // Help modal
  helpBox: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 0,
    maxHeight: '92%',
  },
  helpHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  helpTitle: { color: '#4ECDC4', fontSize: 20, fontWeight: 'bold' },
  helpClose: { color: '#555', fontSize: 22, paddingLeft: 16 },
  helpScroll: { marginBottom: 12 },
  helpSection: {
    color: '#ffffff', fontSize: 15, fontWeight: '700',
    marginTop: 18, marginBottom: 6,
  },
  helpBody: { color: '#aaa', fontSize: 14, lineHeight: 22 },
  helpCmd: { color: '#4ECDC4', fontFamily: 'monospace', fontWeight: '600' },
  helpDoneBtn: {
    backgroundColor: '#4ECDC4', borderRadius: 14,
    padding: 16, alignItems: 'center',
    marginTop: 8,
  },
  helpDoneBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 16 },
});
