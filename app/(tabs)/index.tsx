/**
 * index.tsx — Main chat screen for ManyAI.
 *
 * Handles:
 *   - User input (text + image)
 *   - Provider selection via pickProvider()
 *   - Automatic fallback when a provider fails
 *   - Save-to-category for any AI response
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Alert, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { loadAllKeys } from '@/lib/keyStore';
import { pickProvider, PROVIDERS, ProviderKey } from '@/lib/providers';
import { callProvider } from '@/lib/callProvider';
import { loadProviderOrder, loadEnabledProviders } from '@/lib/providerPrefs';
import { saveResponse, loadCategories } from '@/lib/savedResponses';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single message in the conversation */
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;   // Local URI for display (user messages only)
  provider?: string;   // Provider display name (AI messages only)
  model?: string;      // Model used (AI messages only)
  latencyMs?: number;  // Response time (AI messages only)
  error?: boolean;     // True if this is an error message
};

/** Pending image data captured before sending */
type PendingImage = {
  uri: string;      // Local file URI for preview
  base64: string;   // Base64-encoded data sent to the API
  mime: string;     // MIME type e.g. "image/jpeg"
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Only these providers accept image input */
const VISION_PROVIDERS = new Set<ProviderKey>(['openai', 'gemini']);

/** Maximum number of providers to try before giving up */
const MAX_RETRIES = 8;

/** Generate a unique message ID — uses timestamp + random suffix to avoid collisions */
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatScreen() {
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

  // Save modal state
  const [saveTarget, setSaveTarget] = useState<Message | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  /**
   * Providers that have failed during this session.
   * Stored in a ref (not state) so it doesn't trigger re-renders,
   * and so the value is always current inside async callbacks.
   */
  const failedProviders = useRef<Set<ProviderKey>>(new Set());

  const listRef = useRef<FlatList>(null);

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
    ]).then(([k, order, enabled, cats]) => {
      setKeys(k);
      setProviderOrder(order);
      setEnabledProviders(enabled);
      setCategories(cats);
      failedProviders.current = new Set(); // Reset on each focus
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

  // ─── Send logic ────────────────────────────────────────────────────────────

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;

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

    // Try providers in order, skipping known failures
    let lastError = 'No providers available';
    const tried = new Set(failedProviders.current); // Start from session failures
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      attempts++;
      const providerKey = pickProvider(pool, 'general', tried, providerOrder, enabledProviders);

      // All providers exhausted
      if (!providerKey) break;

      setLoadingLabel(`Trying ${PROVIDERS[providerKey].name}...`);

      const result = await callProvider(
        PROVIDERS[providerKey],
        text,
        keys[providerKey] ?? undefined,
        imageSnapshot?.base64,
        imageSnapshot?.mime,
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

    // All providers failed — show error message
    setMessages(prev => [...prev, {
      id: makeId(),
      role: 'assistant',
      content: `All providers failed. Last error: ${lastError}`,
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
    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
      {/* Attached image preview (user messages) */}
      {item.imageUri && (
        <Image source={{ uri: item.imageUri }} style={styles.msgImage} />
      )}

      {/* Message text — hidden if the message was image-only */}
      {item.content !== '(image)' && (
        <Text style={[styles.bubbleText, item.error && styles.errorText]}>
          {item.content}
        </Text>
      )}

      {/* Footer: provider info + Save button (AI messages only) */}
      {item.provider && item.provider !== 'system' && (
        <View style={styles.bubbleFooter}>
          <Text style={styles.providerLabel}>
            {item.provider}
            {item.model ? ` · ${item.model}` : ''}
            {item.latencyMs ? ` · ${item.latencyMs}ms` : ''}
          </Text>
          {!item.error && (
            <TouchableOpacity
              onPress={() => {
                // Refresh categories in case user added some in Settings
                loadCategories().then(setCategories);
                setSaveTarget(item);
              }}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  ), []); // No deps — item content never changes after creation

  /** Key extractor for FlatList */
  const keyExtractor = useCallback((item: Message) => item.id, []);

  // ─── Derived state ─────────────────────────────────────────────────────────

  const keyCount = Object.keys(keys).length;

  // ─── Save handler ──────────────────────────────────────────────────────────

  /**
   * Save the targeted message to the chosen category.
   * We look up the preceding user message to store as the prompt context.
   */
  const handleSave = useCallback(async (cat: string) => {
    if (!saveTarget) return;
    // Use functional state access pattern to avoid stale closure on messages
    setMessages(currentMessages => {
      const idx = currentMessages.findIndex(m => m.id === saveTarget.id);
      const prompt = idx > 0 ? currentMessages[idx - 1].content : '';
      // Fire-and-forget the async save (can't await inside setState callback)
      saveResponse(prompt, saveTarget.content, saveTarget.provider ?? '', cat)
        .then(() => Alert.alert('Saved!', `Response saved to "${cat}"`));
      return currentMessages; // No change to messages
    });
    setSaveTarget(null);
  }, [saveTarget]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          ManyAI <Text style={styles.version}>v0.7</Text>
        </Text>
        <Text style={styles.headerSub}>
          {keyCount > 0
            ? `${keyCount + 1} providers ready`
            : 'Using Pollinations (free) — add keys in Settings for more'}
        </Text>
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
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#4ECDC4' },
  version: { fontSize: 12, fontWeight: 'normal', color: '#444' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },

  messageList: { padding: 12, paddingBottom: 8 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#0f3460' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#16213e', borderWidth: 1, borderColor: '#0f3460' },
  bubbleText: { color: '#eeeeee', fontSize: 15, lineHeight: 22 },
  errorText: { color: '#FF6B6B' },
  msgImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 6 },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  providerLabel: { color: '#4ECDC4', fontSize: 10, opacity: 0.7, flex: 1 },
  saveBtnText: { color: '#4ECDC4', fontSize: 11, fontWeight: '600', paddingLeft: 8 },

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
});
