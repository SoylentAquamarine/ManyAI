/**
 * Settings screen — API keys, instructions, and about.
 */

import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { loadKey, saveKey, deleteKey } from '@/lib/keyStore';
import { PROVIDERS, ROUTING_ORDER, ProviderKey } from '@/lib/providers';
import { testProvider } from '@/lib/callProvider';

const KEY_PROVIDERS: ProviderKey[] = ROUTING_ORDER.filter(k => k !== 'pollinations');

export default function SettingsScreen() {
  const [keys, setKeys] = useState<Partial<Record<ProviderKey, string>>>({});
  const [editing, setEditing] = useState<Partial<Record<ProviderKey, string>>>({});
  const [scanTarget, setScanTarget] = useState<ProviderKey | null>(null);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [testStatus, setTestStatus] = useState<Partial<Record<ProviderKey, 'testing' | 'ok' | 'fail'>>>({});
  const [testMsg, setTestMsg] = useState<Partial<Record<ProviderKey, string>>>({});
  const [showInstructions, setShowInstructions] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const loadAll = useCallback(async () => {
    const loaded: Partial<Record<ProviderKey, string>> = {};
    for (const p of KEY_PROVIDERS) {
      const k = await loadKey(p);
      if (k) loaded[p] = k;
    }
    setKeys(loaded);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const openScanner = async (provider: ProviderKey) => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Please allow camera access to scan QR codes.');
        return;
      }
    }
    setScanned(false);
    setScanTarget(provider);
  };

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || !scanTarget) return;
    const target = scanTarget; // capture before clearing
    setScanned(true);
    setScanTarget(null);
    const val = data.trim();
    await saveKey(target, val);
    setKeys(prev => ({ ...prev, [target]: val }));
    Alert.alert('Key saved!', `${PROVIDERS[target].name} API key imported. Tap Test to verify it works.`);
  };

  const handleSave = async (provider: ProviderKey) => {
    const val = (editing[provider] ?? '').trim();
    if (!val) return;
    await saveKey(provider, val);
    setKeys(prev => ({ ...prev, [provider]: val }));
    setEditing(prev => ({ ...prev, [provider]: '' }));
    Alert.alert('Saved', `${PROVIDERS[provider].name} key saved. Tap Test to verify it works.`);
  };

  const handleTest = async (provider: ProviderKey) => {
    const apiKey = keys[provider];
    setTestStatus(prev => ({ ...prev, [provider]: 'testing' }));
    setTestMsg(prev => ({ ...prev, [provider]: 'Testing...' }));
    const result = await testProvider(PROVIDERS[provider], apiKey);
    setTestStatus(prev => ({ ...prev, [provider]: result.ok ? 'ok' : 'fail' }));
    setTestMsg(prev => ({ ...prev, [provider]: result.message }));
  };

  const handleDelete = (provider: ProviderKey) => {
    Alert.alert('Remove key', `Remove ${PROVIDERS[provider].name} API key?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await deleteKey(provider);
          setKeys(prev => { const n = { ...prev }; delete n[provider]; return n; });
          setTestStatus(prev => { const n = { ...prev }; delete n[provider]; return n; });
        },
      },
    ]);
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerLinks}>
            <TouchableOpacity onPress={() => setShowInstructions(true)}>
              <Text style={styles.headerLink}>How to get keys</Text>
            </TouchableOpacity>
            <Text style={styles.headerLinkDivider}> · </Text>
            <TouchableOpacity onPress={() => setShowAbout(true)}>
              <Text style={styles.headerLink}>About</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>API KEYS</Text>
        <Text style={styles.sectionHint}>
          Tap <Text style={styles.highlight}>Test</Text> after adding a key to confirm it works.
          Keys that fail will be skipped automatically in chat.
        </Text>

        {/* Pollinations — no key needed */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.dot, { backgroundColor: '#FD79A8' }]} />
            <Text style={styles.providerName}>Pollinations</Text>
            <View style={styles.badge}><Text style={styles.badgeText}>No key needed</Text></View>
          </View>
          <Text style={styles.hint}>Always available as fallback. No setup required.</Text>
        </View>

        {KEY_PROVIDERS.map(providerKey => {
          const p = PROVIDERS[providerKey];
          const hasKey = !!keys[providerKey];
          const draft = editing[providerKey] ?? '';
          const status = testStatus[providerKey];

          return (
            <View key={providerKey} style={[styles.card, status === 'fail' && styles.cardFail, status === 'ok' && styles.cardOk]}>
              <View style={styles.cardHeader}>
                <View style={[styles.dot, { backgroundColor: p.color }]} />
                <Text style={styles.providerName}>{p.name}</Text>
                {hasKey && !status && <View style={[styles.badge, styles.activeBadge]}><Text style={[styles.badgeText, styles.activeBadgeText]}>Active</Text></View>}
                {status === 'ok' && <View style={[styles.badge, styles.okBadge]}><Text style={[styles.badgeText, styles.okBadgeText]}>Working</Text></View>}
                {status === 'fail' && <View style={[styles.badge, styles.failBadge]}><Text style={[styles.badgeText, styles.failBadgeText]}>Failed</Text></View>}
              </View>

              <Text style={styles.hint}>Model: {p.model}</Text>

              {hasKey ? (
                <View style={styles.keyedSection}>
                  <View style={styles.row}>
                    <Text style={styles.maskedKey}>Key saved</Text>
                    <TouchableOpacity
                      style={[styles.testBtn, status === 'testing' && styles.btnDisabled]}
                      onPress={() => handleTest(providerKey)}
                      disabled={status === 'testing'}
                    >
                      <Text style={styles.testBtnText}>{status === 'testing' ? 'Testing...' : 'Test'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeBtn} onPress={() => handleDelete(providerKey)}>
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  {status && status !== 'testing' && (
                    <Text style={status === 'ok' ? styles.testOk : styles.testFail}>
                      {status === 'ok' ? '+ ' : 'x '}{testMsg[providerKey]}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.row}>
                  <TextInput
                    style={styles.keyInput}
                    value={draft}
                    onChangeText={val => setEditing(prev => ({ ...prev, [providerKey]: val }))}
                    placeholder="Paste API key..."
                    placeholderTextColor="#555"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={styles.qrBtn} onPress={() => openScanner(providerKey)}>
                    <Text style={styles.qrBtnText}>QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, !draft && styles.btnDisabled]}
                    onPress={() => handleSave(providerKey)}
                    disabled={!draft}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* QR Scanner Modal */}
      <Modal visible={!!scanTarget} animationType="slide" onRequestClose={() => setScanTarget(null)}>
        <View style={styles.scannerContainer}>
          <Text style={styles.scannerTitle}>Scan QR for {scanTarget ? PROVIDERS[scanTarget].name : ''}</Text>
          <Text style={styles.scannerHint}>
            Go to qr.io on your laptop, paste your API key, generate a QR code, then point your camera here.
          </Text>
          <View style={styles.cameraWrapper}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan}
            />
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanTarget(null)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Instructions Modal */}
      <Modal visible={showInstructions} animationType="slide" onRequestClose={() => setShowInstructions(false)}>
        <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>How to get API keys</Text>
          <Text style={styles.modalBody}>
            All of these are free. Sign up, find your API key, and add it in Settings.
          </Text>

          {[
            { name: 'Groq', url: 'console.groq.com' },
            { name: 'Cerebras', url: 'cloud.cerebras.ai' },
            { name: 'Mistral', url: 'console.mistral.ai' },
            { name: 'SambaNova', url: 'cloud.sambanova.ai' },
            { name: 'Fireworks', url: 'fireworks.ai' },
            { name: 'OpenAI', url: 'platform.openai.com' },
            { name: 'Gemini', url: 'aistudio.google.com' },
          ].map(({ name, url }) => (
            <View key={name} style={styles.keyRow}>
              <Text style={styles.keyName}>{name}</Text>
              <Text style={styles.keyUrl}>{url}</Text>
            </View>
          ))}

          <Text style={styles.modalSubtitle}>Adding a key to ManyAI</Text>
          <Text style={styles.modalBody}>
            From your laptop:{'\n'}
            1. Go to qr.io{'\n'}
            2. Paste your API key and generate a QR code{'\n'}
            3. In ManyAI Settings, tap the QR button next to the provider{'\n'}
            4. Point your camera at the screen{'\n\n'}
            From your phone only:{'\n'}
            1. Open your provider's site on your phone{'\n'}
            2. Copy your API key{'\n'}
            3. Paste it into the key field in Settings and tap Save{'\n\n'}
            Tap Test after saving to confirm the key works.
          </Text>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowInstructions(false)}>
            <Text style={styles.modalCloseBtnText}>Got it</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* About Modal */}
      <Modal visible={showAbout} animationType="slide" onRequestClose={() => setShowAbout(false)}>
        <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>ManyAI</Text>
          <Text style={styles.modalBody}>
            ManyAI routes your questions to the best available free AI provider automatically.
            If one fails or hits a limit, it tries the next one — so you always get an answer.{'\n\n'}
            All API keys are stored encrypted on your device only. Nothing is ever sent to a ManyAI server.
          </Text>

          <Text style={styles.modalSubtitle}>Support the developer</Text>
          <Text style={styles.modalBody}>
            ManyAI is free. If it saves you money or time, consider tipping $1 — it genuinely helps.
          </Text>

          <View style={styles.donateRow}>
            <View style={styles.donateCard}>
              <Text style={styles.donateName}>PayPal</Text>
              <Text style={styles.donateHandle}>paypal.me/StevePleasants</Text>
            </View>
            <View style={styles.donateCard}>
              <Text style={styles.donateName}>Cash App</Text>
              <Text style={styles.donateHandle}>$StevePleasants</Text>
            </View>
            <View style={styles.donateCard}>
              <Text style={styles.donateName}>Venmo</Text>
              <Text style={styles.donateHandle}>@StevePleasants</Text>
            </View>
          </View>

          <Text style={styles.version}>Version 1.0.0 · Built with Expo</Text>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowAbout(false)}>
            <Text style={styles.modalCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  );
}

const CORNER = 24;
const CORNER_THICK = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { padding: 16, paddingBottom: 40 },
  header: { paddingTop: 54, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#4ECDC4', marginBottom: 6 },
  headerLinks: { flexDirection: 'row', alignItems: 'center' },
  headerLink: { color: '#4ECDC4', fontSize: 13 },
  headerLinkDivider: { color: '#444', fontSize: 13 },
  sectionLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  sectionHint: { color: '#666', fontSize: 12, marginBottom: 14, lineHeight: 18 },
  highlight: { color: '#4ECDC4' },
  card: {
    backgroundColor: '#16213e', borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#0f3460',
  },
  cardFail: { borderColor: '#FF6B6B44' },
  cardOk: { borderColor: '#4ECDC444' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  providerName: { color: '#eeeeee', fontWeight: '600', fontSize: 15, flex: 1 },
  badge: { backgroundColor: '#0f3460', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#888', fontSize: 11 },
  activeBadge: { backgroundColor: '#1a3a2a' },
  activeBadgeText: { color: '#4ECDC4' },
  okBadge: { backgroundColor: '#1a4a1a' },
  okBadgeText: { color: '#4ECDC4' },
  failBadge: { backgroundColor: '#3a1a1a' },
  failBadgeText: { color: '#FF6B6B' },
  hint: { color: '#666', fontSize: 12, marginBottom: 10 },
  keyedSection: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  maskedKey: { flex: 1, color: '#4ECDC4', fontSize: 14 },
  testBtn: {
    backgroundColor: '#1a3a2a', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#4ECDC4',
  },
  testBtnText: { color: '#4ECDC4', fontSize: 14 },
  testOk: { color: '#4ECDC4', fontSize: 12 },
  testFail: { color: '#FF6B6B', fontSize: 12 },
  keyInput: {
    flex: 1, backgroundColor: '#0f3460', color: '#ffffff',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
  },
  qrBtn: {
    backgroundColor: '#0f3460', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#4ECDC4',
  },
  qrBtnText: { color: '#4ECDC4', fontWeight: 'bold', fontSize: 14 },
  saveBtn: { backgroundColor: '#4ECDC4', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 14 },
  removeBtn: {
    backgroundColor: '#3a1a1a', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#FF6B6B',
  },
  removeBtnText: { color: '#FF6B6B', fontSize: 14 },

  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  scannerTitle: { fontSize: 20, fontWeight: 'bold', color: '#4ECDC4', marginBottom: 10 },
  scannerHint: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  cameraWrapper: { width: 260, height: 260, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  camera: { width: '100%', height: '100%' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#4ECDC4' },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK },
  cancelBtn: {
    marginTop: 32, backgroundColor: '#16213e', borderRadius: 12,
    paddingHorizontal: 40, paddingVertical: 14,
    borderWidth: 1, borderColor: '#0f3460',
  },
  cancelBtnText: { color: '#aaa', fontSize: 16 },

  // Modals
  modalContainer: { flex: 1, backgroundColor: '#1a1a2e' },
  modalContent: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#4ECDC4', marginBottom: 16 },
  modalSubtitle: { fontSize: 17, fontWeight: '600', color: '#eeeeee', marginTop: 24, marginBottom: 10 },
  modalBody: { color: '#aaa', fontSize: 14, lineHeight: 22 },
  keyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  keyName: { color: '#eeeeee', fontSize: 15, fontWeight: '600' },
  keyUrl: { color: '#4ECDC4', fontSize: 13 },
  donateRow: { gap: 10, marginTop: 12 },
  donateCard: {
    backgroundColor: '#16213e', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#0f3460',
  },
  donateName: { color: '#eeeeee', fontWeight: '600', fontSize: 15, marginBottom: 4 },
  donateHandle: { color: '#4ECDC4', fontSize: 14 },
  version: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 24 },
  modalCloseBtn: {
    marginTop: 32, backgroundColor: '#4ECDC4', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCloseBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 16 },
});
