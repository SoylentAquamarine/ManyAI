import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { loadAllKeys } from '@/lib/keyStore';
import { pickProvider, PROVIDERS, ProviderKey } from '@/lib/providers';
import { callProvider } from '@/lib/callProvider';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  error?: boolean;
};

/** Providers that support image input */
const VISION_PROVIDERS = new Set<ProviderKey>(['openai', 'gemini']);

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Hi! I am ManyAI. Ask me anything and I will route it to the best available free AI provider.',
      provider: 'system',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Routing to best provider...');
  const [keys, setKeys] = useState<Partial<Record<ProviderKey, string>>>({});
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  /** Providers that failed this session — skip them */
  const failedProviders = useRef<Set<ProviderKey>>(new Set());
  const listRef = useRef<FlatList>(null);

  // Reload keys every time this tab is focused so removals in Settings take effect
  useFocusEffect(useCallback(() => {
    loadAllKeys().then(k => {
      setKeys(k);
      // Clear failed list when keys change (user may have fixed a key)
      failedProviders.current = new Set();
    });
  }, []));

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingImage(result.assets[0].uri);
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || '(image)',
      imageUri: pendingImage ?? undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setPendingImage(null);
    setLoading(true);

    // Build available set from stored keys + pollinations
    const available = new Set<ProviderKey>([
      ...Object.keys(keys) as ProviderKey[],
      'pollinations',
    ]);

    // If image attached, only use vision-capable providers
    const pool = pendingImage
      ? new Set([...available].filter(k => VISION_PROVIDERS.has(k)))
      : available;

    // Try providers in order, skipping failed ones
    let lastError = 'No providers available';
    const tried = new Set(failedProviders.current);

    while (true) {
      const providerKey = pickProvider(pool, 'general', tried);
      if (!providerKey) break;

      setLoadingLabel(`Trying ${PROVIDERS[providerKey].name}...`);
      const apiKey = keys[providerKey] ?? undefined;
      const result = await callProvider(PROVIDERS[providerKey], text, apiKey);

      if (!result.error && result.content) {
        // Success
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
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

      // Failed — mark it and try next
      lastError = result.error ?? 'Empty response';
      tried.add(providerKey);
      failedProviders.current.add(providerKey);
    }

    // All providers failed
    setMessages(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: `All providers failed. Last error: ${lastError}`,
      error: true,
    }]);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
      {item.imageUri && (
        <Image source={{ uri: item.imageUri }} style={styles.msgImage} />
      )}
      {item.content !== '(image)' && (
        <Text style={[styles.bubbleText, item.error && styles.errorText]}>{item.content}</Text>
      )}
      {item.provider && item.provider !== 'system' && (
        <Text style={styles.providerLabel}>
          {item.provider}{item.model ? ` · ${item.model}` : ''}{item.latencyMs ? ` · ${item.latencyMs}ms` : ''}
        </Text>
      )}
    </View>
  );

  const keyCount = Object.keys(keys).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ManyAI <Text style={styles.version}>v0.3</Text></Text>
        <Text style={styles.headerSub}>
          {keyCount > 0
            ? `${keyCount + 1} providers ready`
            : 'Using Pollinations (free) — add keys in Settings for more'}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {loading && (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color="#4ECDC4" />
          <Text style={styles.typingText}>{loadingLabel}</Text>
        </View>
      )}

      {pendingImage && (
        <View style={styles.pendingImageRow}>
          <Image source={{ uri: pendingImage }} style={styles.pendingThumb} />
          <Text style={styles.pendingLabel}>Image attached</Text>
          <TouchableOpacity onPress={() => setPendingImage(null)}>
            <Text style={styles.removeImage}>x</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.cameraBtn} onPress={pickImage} disabled={loading}>
          <Text style={styles.cameraBtnText}>img</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    paddingTop: 54, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#4ECDC4' },
  version: { fontSize: 12, fontWeight: 'normal', color: '#444', },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  messageList: { padding: 12, paddingBottom: 8 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#0f3460' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#16213e', borderWidth: 1, borderColor: '#0f3460' },
  bubbleText: { color: '#eeeeee', fontSize: 15, lineHeight: 22 },
  errorText: { color: '#FF6B6B' },
  msgImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 6 },
  providerLabel: { color: '#4ECDC4', fontSize: 10, marginTop: 6, opacity: 0.7 },
  typingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 6, gap: 8,
  },
  typingText: { color: '#888', fontSize: 13 },
  pendingImageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#16213e', borderTopWidth: 1, borderTopColor: '#0f3460',
  },
  pendingThumb: { width: 40, height: 40, borderRadius: 6 },
  pendingLabel: { color: '#aaa', fontSize: 13, flex: 1 },
  removeImage: { color: '#FF6B6B', fontSize: 18, paddingHorizontal: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10,
    backgroundColor: '#16213e', borderTopWidth: 1, borderTopColor: '#0f3460', gap: 8,
  },
  cameraBtn: {
    backgroundColor: '#0f3460', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#4ECDC4',
  },
  cameraBtnText: { color: '#4ECDC4', fontSize: 13, fontWeight: 'bold' },
  input: {
    flex: 1, backgroundColor: '#0f3460', color: '#ffffff',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 120,
  },
  sendBtn: { backgroundColor: '#4ECDC4', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 15 },
});
