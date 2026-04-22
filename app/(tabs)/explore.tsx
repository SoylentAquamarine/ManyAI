/**
 * ManyAI — © 2026 Steve Pleasants. All rights reserved.
 *
 * Settings screen — menu-style layout with sub-screens for each section.
 *
 * Provider Order screen now includes per-provider model selection.
 * Compare screen uses KeyboardAvoidingView so the keyboard doesn't cover input.
 * About screen has a Check for Updates button powered by expo-updates.
 */

import { useState, useCallback, useEffect } from 'react';
import Constants from 'expo-constants';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Modal, Switch, ActivityIndicator, Image, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import * as Updates from 'expo-updates';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { loadKey, saveKey, deleteKey } from '@/lib/keyStore';
import { PROVIDERS, ROUTING_ORDER, ProviderKey, ProviderModel } from '@/lib/providers';
import { getRemoteConfig, RemoteConfig } from '@/lib/remoteConfig';
import { testProvider, callProvider } from '@/lib/callProvider';
import {
  loadProviderOrder, saveProviderOrder,
  loadEnabledProviders, saveEnabledProviders,
  loadSelectedModels, saveSelectedModels,
} from '@/lib/providerPrefs';

const FREE_KEY_PROVIDERS: ProviderKey[] = ROUTING_ORDER.filter(k => k !== 'pollinations' && !PROVIDERS[k].paidOnly);
const PAID_KEY_PROVIDERS: ProviderKey[] = ROUTING_ORDER.filter(k => PROVIDERS[k].paidOnly);
// Combined for key loading
const KEY_PROVIDERS: ProviderKey[] = ROUTING_ORDER.filter(k => k !== 'pollinations');

type Screen = 'menu' | 'keys' | 'providers' | 'instructions' | 'about' | 'donate';

export default function SettingsScreen() {
  const [screen, setScreen] = useState<Screen>('menu');
  const navigation = useNavigation();

  // Tapping the Settings tab from any sub-screen returns to the main menu
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress' as any, () => {
      setScreen('menu');
    });
    return unsubscribe;
  }, [navigation]);

  // Key management
  const [keys, setKeys] = useState<Partial<Record<ProviderKey, string>>>({});
  const [editing, setEditing] = useState<Partial<Record<ProviderKey, string>>>({});
  const [scanTarget, setScanTarget] = useState<ProviderKey | null>(null);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [testStatus, setTestStatus] = useState<Partial<Record<ProviderKey, 'testing' | 'ok' | 'fail'>>>({});
  const [testMsg, setTestMsg] = useState<Partial<Record<ProviderKey, string>>>({});

  // Provider order + enable/disable
  const [providerOrder, setProviderOrder] = useState<ProviderKey[]>([...ROUTING_ORDER]);
  const [enabled, setEnabled] = useState<Record<ProviderKey, boolean>>(
    Object.fromEntries(ROUTING_ORDER.map(k => [k, true])) as Record<ProviderKey, boolean>
  );

  // Per-provider model selection
  const [selectedModels, setSelectedModels] = useState<Record<ProviderKey, string>>(
    Object.fromEntries(ROUTING_ORDER.map(k => [k, PROVIDERS[k].model])) as Record<ProviderKey, string>
  );
  // Which provider's model list is expanded
  const [expandedModels, setExpandedModels] = useState<ProviderKey | null>(null);

  // Compare
  const [comparePrompt, setComparePrompt] = useState('');
  const [compareResults, setCompareResults] = useState<{ provider: string; content: string; ms: number; error?: boolean }[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compareImage, setCompareImage] = useState<{ uri: string; base64: string; mime: string } | null>(null);

  // Update checker
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'upToDate' | 'error'>('idle');

  // Remote config — provider/model overrides pushed from stevepleasants.com
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig | null>(null);

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const loaded: Partial<Record<ProviderKey, string>> = {};
    for (const p of KEY_PROVIDERS) {
      const k = await loadKey(p);
      if (k) loaded[p] = k;
    }
    setKeys(loaded);
    const order = await loadProviderOrder();
    setProviderOrder(order);
    const en = await loadEnabledProviders();
    setEnabled(en);
    const models = await loadSelectedModels();
    setSelectedModels(models);
    // Fetch remote provider/model overrides (falls back to cache if offline)
    const remote = await getRemoteConfig();
    if (remote) setRemoteConfig(remote);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ─── Key management ──────────────────────────────────────────────────────

  const openScanner = async (provider: ProviderKey) => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { Alert.alert('Camera required', 'Allow camera access to scan QR codes.'); return; }
    }
    setScanned(false);
    setScanTarget(provider);
  };

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || !scanTarget) return;
    const target = scanTarget;
    setScanned(true);
    setScanTarget(null);
    const val = data.trim();
    await saveKey(target, val);
    setKeys(prev => ({ ...prev, [target]: val }));
    Alert.alert('Key saved!', `${PROVIDERS[target].name} key imported. Tap Test to verify.`);
  };

  const handleSave = async (provider: ProviderKey) => {
    const val = (editing[provider] ?? '').trim();
    if (!val) return;
    await saveKey(provider, val);
    setKeys(prev => ({ ...prev, [provider]: val }));
    setEditing(prev => ({ ...prev, [provider]: '' }));
    Alert.alert('Saved', `${PROVIDERS[provider].name} key saved. Tap Test to verify.`);
  };

  const handleTest = async (provider: ProviderKey) => {
    setTestStatus(prev => ({ ...prev, [provider]: 'testing' }));
    const result = await testProvider(PROVIDERS[provider], keys[provider]);
    setTestStatus(prev => ({ ...prev, [provider]: result.ok ? 'ok' : 'fail' }));
    setTestMsg(prev => ({ ...prev, [provider]: result.message }));
  };

  const handleDelete = (provider: ProviderKey) => {
    Alert.alert('Remove key', `Remove ${PROVIDERS[provider].name} key?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await deleteKey(provider);
        setKeys(prev => { const n = { ...prev }; delete n[provider]; return n; });
        setTestStatus(prev => { const n = { ...prev }; delete n[provider]; return n; });
      }},
    ]);
  };

  // ─── Provider order ──────────────────────────────────────────────────────

  // Move by provider key so filtered-list indices don't corrupt the full order array
  const moveUp = async (pk: ProviderKey) => {
    const idx = providerOrder.indexOf(pk);
    if (idx <= 0) return;
    const next = [...providerOrder];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setProviderOrder(next);
    await saveProviderOrder(next);
  };

  const moveDown = async (pk: ProviderKey) => {
    const idx = providerOrder.indexOf(pk);
    if (idx >= providerOrder.length - 1) return;
    const next = [...providerOrder];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setProviderOrder(next);
    await saveProviderOrder(next);
  };

  const toggleEnabled = async (provider: ProviderKey, value: boolean) => {
    const next = { ...enabled, [provider]: value };
    setEnabled(next);
    await saveEnabledProviders(next);
  };

  /** Select a model for a provider and persist the choice */
  const selectModel = async (provider: ProviderKey, modelId: string) => {
    const next = { ...selectedModels, [provider]: modelId };
    setSelectedModels(next);
    await saveSelectedModels(next);
  };

  // ─── Compare ─────────────────────────────────────────────────────────────

  const comparePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setCompareImage({ uri: a.uri, base64: a.base64 ?? '', mime: a.mimeType ?? 'image/jpeg' });
    }
  };

  const compareTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission required'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setCompareImage({ uri: a.uri, base64: a.base64 ?? '', mime: a.mimeType ?? 'image/jpeg' });
    }
  };

  const runCompare = async () => {
    const prompt = comparePrompt.trim();
    if (!prompt) return;
    setComparing(true);
    setCompareResults([]);
    const available = ROUTING_ORDER.filter(k => {
      if (!enabled[k]) return false;
      if (k === 'pollinations') return true;
      return !!keys[k];
    });
    const results: typeof compareResults = [];
    // Use each provider's currently selected model
    await Promise.all(available.map(async (k) => {
      const providerWithModel = { ...PROVIDERS[k], model: selectedModels[k] ?? PROVIDERS[k].model };
      const r = await callProvider(
        providerWithModel, prompt, keys[k] ?? undefined,
        compareImage?.base64, compareImage?.mime
      );
      results.push({
        provider: `${PROVIDERS[k].name} · ${selectedModels[k] ?? PROVIDERS[k].model}`,
        content: r.error ? r.error : r.content,
        ms: r.latencyMs,
        error: !!r.error,
      });
    }));
    setCompareResults(results.sort((a, b) => a.ms - b.ms));
    setComparing(false);
  };

  // ─── Update checker ───────────────────────────────────────────────────────

  const checkForUpdate = async () => {
    // OTA updates only work in production builds, not Expo Go
    if (__DEV__) {
      Alert.alert('Dev mode', 'Update checks only work in a production build, not Expo Go.');
      return;
    }
    setUpdateStatus('checking');
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateStatus('downloading');
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Update ready',
          'A new version has been downloaded. Restart the app to apply it.',
          [
            { text: 'Later', onPress: () => setUpdateStatus('idle') },
            { text: 'Restart now', onPress: () => Updates.reloadAsync() },
          ]
        );
      } else {
        setUpdateStatus('upToDate');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }
    } catch {
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    }
  };

  // ─── Remote config helpers ────────────────────────────────────────────────

  /** Returns the model list for a provider, patched by remote config if available */
  const effectiveModels = (pk: ProviderKey): ProviderModel[] =>
    remoteConfig?.providers?.[pk]?.models ?? PROVIDERS[pk].models;

  /** Returns the default model for a provider, patched by remote config if available */
  const effectiveDefaultModel = (pk: ProviderKey): string =>
    remoteConfig?.providers?.[pk]?.model ?? PROVIDERS[pk].model;

  // ─── Sub-screens ─────────────────────────────────────────────────────────

  if (screen === 'keys') return (
    <>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.subHeader}>
          <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>← Back</Text></TouchableOpacity>
          <Text style={s.subTitle}>API Keys</Text>
        </View>
        <Text style={s.hint}>Tap <Text style={s.teal}>Test</Text> after adding a key to confirm it works.</Text>

        {/* No key needed */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.dot, { backgroundColor: '#FD79A8' }]} />
            <Text style={s.providerName}>Pollinations</Text>
            <View style={s.badge}><Text style={s.badgeText}>No key needed</Text></View>
          </View>
          <Text style={s.hint}>Always available as fallback.</Text>
        </View>

        {/* Free tier providers */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>🟢 Free Tier</Text>
          <Text style={s.sectionSub}>No credit card required</Text>
        </View>
        {FREE_KEY_PROVIDERS.map(pk => {
          const p = PROVIDERS[pk];
          const hasKey = !!keys[pk];
          const draft = editing[pk] ?? '';
          const status = testStatus[pk];
          return (
            <View key={pk} style={[s.card, status === 'fail' && s.cardFail, status === 'ok' && s.cardOk]}>
              <View style={s.cardHeader}>
                <View style={[s.dot, { backgroundColor: p.color }]} />
                <Text style={s.providerName}>{p.name}</Text>
                {hasKey && !status && <View style={[s.badge, s.activeBadge]}><Text style={[s.badgeText, s.tealText]}>Active</Text></View>}
                {status === 'ok' && <View style={[s.badge, s.okBadge]}><Text style={[s.badgeText, s.tealText]}>Working</Text></View>}
                {status === 'fail' && <View style={[s.badge, s.failBadge]}><Text style={[s.badgeText, s.redText]}>Failed</Text></View>}
              </View>
              <Text style={s.modelHint}>Model: {selectedModels[pk] ?? p.model}</Text>
              {p.keyHint && <Text style={s.keyHintText}>{p.keyHint}</Text>}
              {hasKey ? (
                <View style={{ gap: 6 }}>
                  <View style={s.row}>
                    <Text style={s.maskedKey}>Key saved</Text>
                    <TouchableOpacity style={[s.testBtn, status === 'testing' && s.btnDisabled]} onPress={() => handleTest(pk)} disabled={status === 'testing'}>
                      <Text style={s.tealText}>{status === 'testing' ? 'Testing...' : 'Test'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.removeBtn} onPress={() => handleDelete(pk)}>
                      <Text style={s.redText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  {status && status !== 'testing' && (
                    <Text style={status === 'ok' ? s.testOk : s.testFail}>
                      {status === 'ok' ? '✓ ' : '✗ '}{testMsg[pk]}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={s.row}>
                  <TextInput style={s.keyInput} value={draft}
                    onChangeText={v => setEditing(prev => ({ ...prev, [pk]: v }))}
                    placeholder="Paste API key..." placeholderTextColor="#555"
                    secureTextEntry autoCapitalize="none" autoCorrect={false} />
                  <TouchableOpacity style={s.qrBtn} onPress={() => openScanner(pk)}>
                    <Text style={s.tealText}>QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.saveBtn, !draft && s.btnDisabled]} onPress={() => handleSave(pk)} disabled={!draft}>
                    <Text style={s.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Paid providers */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>💳 Paid</Text>
          <Text style={s.sectionSub}>Credit card required to sign up</Text>
        </View>
        {PAID_KEY_PROVIDERS.map(pk => {
          const p = PROVIDERS[pk];
          const hasKey = !!keys[pk];
          const draft = editing[pk] ?? '';
          const status = testStatus[pk];
          return (
            <View key={pk} style={[s.card, status === 'fail' && s.cardFail, status === 'ok' && s.cardOk]}>
              <View style={s.cardHeader}>
                <View style={[s.dot, { backgroundColor: p.color }]} />
                <Text style={s.providerName}>{p.name}</Text>
                {hasKey && !status && <View style={[s.badge, s.activeBadge]}><Text style={[s.badgeText, s.tealText]}>Active</Text></View>}
                {status === 'ok' && <View style={[s.badge, s.okBadge]}><Text style={[s.badgeText, s.tealText]}>Working</Text></View>}
                {status === 'fail' && <View style={[s.badge, s.failBadge]}><Text style={[s.badgeText, s.redText]}>Failed</Text></View>}
              </View>
              <Text style={s.modelHint}>Model: {selectedModels[pk] ?? p.model}</Text>
              {p.keyHint && <Text style={s.keyHintText}>{p.keyHint}</Text>}
              {hasKey ? (
                <View style={{ gap: 6 }}>
                  <View style={s.row}>
                    <Text style={s.maskedKey}>Key saved</Text>
                    <TouchableOpacity style={[s.testBtn, status === 'testing' && s.btnDisabled]} onPress={() => handleTest(pk)} disabled={status === 'testing'}>
                      <Text style={s.tealText}>{status === 'testing' ? 'Testing...' : 'Test'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.removeBtn} onPress={() => handleDelete(pk)}>
                      <Text style={s.redText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  {status && status !== 'testing' && (
                    <Text style={status === 'ok' ? s.testOk : s.testFail}>
                      {status === 'ok' ? '✓ ' : '✗ '}{testMsg[pk]}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={s.row}>
                  <TextInput style={s.keyInput} value={draft}
                    onChangeText={v => setEditing(prev => ({ ...prev, [pk]: v }))}
                    placeholder="Paste API key..." placeholderTextColor="#555"
                    secureTextEntry autoCapitalize="none" autoCorrect={false} />
                  <TouchableOpacity style={s.qrBtn} onPress={() => openScanner(pk)}>
                    <Text style={s.tealText}>QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.saveBtn, !draft && s.btnDisabled]} onPress={() => handleSave(pk)} disabled={!draft}>
                    <Text style={s.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!scanTarget} animationType="slide" onRequestClose={() => setScanTarget(null)}>
        <View style={s.scannerContainer}>
          <Text style={s.scannerTitle}>Scan QR for {scanTarget ? PROVIDERS[scanTarget].name : ''}</Text>
          <Text style={s.scannerHint}>Go to qr.io on your laptop, paste your key, generate QR, then scan here.</Text>
          <View style={s.cameraWrapper}>
            <CameraView style={s.camera} facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan} />
            <View style={[s.corner, s.cornerTL]} /><View style={[s.corner, s.cornerTR]} />
            <View style={[s.corner, s.cornerBL]} /><View style={[s.corner, s.cornerBR]} />
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setScanTarget(null)}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );

  if (screen === 'providers') return (
    // KeyboardAvoidingView lifts content above the keyboard.
    // 'padding' is used on both platforms — 'height' on Android leaves a
    // residual grey bar after the keyboard dismisses until the next re-render.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#1a1a2e' }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 60}
    >
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.subHeader}>
          <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>← Back</Text></TouchableOpacity>
          <Text style={s.subTitle}>Providers & Models</Text>
        </View>
        <Text style={s.hint}>Enable/disable providers, set priority with arrows, and pick which model each uses.</Text>

        {providerOrder.filter(pk => enabled[pk] !== false && (pk === 'pollinations' || !!keys[pk])).map((pk, index, arr) => {
          const p = PROVIDERS[pk];
          const hasKey = pk === 'pollinations' || !!keys[pk];
          const isModelExpanded = expandedModels === pk;
          const activeModel = selectedModels[pk] ?? effectiveDefaultModel(pk);
          const models = effectiveModels(pk);
          const activeModelName = models.find(m => m.id === activeModel)?.name ?? activeModel;

          return (
            <View key={pk} style={[s.card, !hasKey && s.cardDim]}>
              {/* Provider row: order, name, arrows, toggle */}
              <View style={s.providerRow}>
                <View style={s.providerRowLeft}>
                  <Text style={s.orderNum}>{index + 1}</Text>
                  <View style={[s.dot, { backgroundColor: p.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.providerName, !hasKey && { color: '#555' }]}>
                      {p.name}{p.supportsVision ? ' 👁' : ''}
                    </Text>
                    <Text style={s.noKeyHint}>
                      {!hasKey ? 'No key — add in API Keys' : p.goodAt}
                    </Text>
                  </View>
                </View>
                <View style={s.providerRowRight}>
                  <TouchableOpacity style={s.arrowBtn} onPress={() => moveUp(pk)} disabled={index === 0}>
                    <Text style={[s.arrowText, index === 0 && s.arrowDisabled]}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.arrowBtn} onPress={() => moveDown(pk)} disabled={index === arr.length - 1}>
                    <Text style={[s.arrowText, index === arr.length - 1 && s.arrowDisabled]}>▼</Text>
                  </TouchableOpacity>
                  <Switch
                    value={enabled[pk] !== false}
                    onValueChange={v => toggleEnabled(pk, v)}
                    trackColor={{ false: '#333', true: '#2a5a4a' }}
                    thumbColor={enabled[pk] !== false ? '#4ECDC4' : '#666'}
                  />
                </View>
              </View>

              {/* Model selector — tap active model to expand list */}
              <TouchableOpacity
                style={s.modelRow}
                onPress={() => setExpandedModels(isModelExpanded ? null : pk)}
              >
                <Text style={s.modelRowLabel}>Model: </Text>
                <Text style={s.modelRowValue} numberOfLines={1}>{activeModelName}</Text>
                <Text style={s.modelRowChevron}>{isModelExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {/* Expanded model list */}
              {isModelExpanded && (
                <View style={s.modelList}>
                  {models.map(m => (
                    <TouchableOpacity
                      key={m.id}
                      style={s.modelOption}
                      onPress={() => { selectModel(pk, m.id); setExpandedModels(null); }}
                    >
                      <View style={[s.modelRadio, m.id === activeModel && s.modelRadioSelected]} />
                      <Text style={[s.modelOptionText, m.id === activeModel && s.modelOptionTextSelected]}>
                        {m.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* ── Disabled providers ── */}
        {providerOrder.filter(pk => enabled[pk] === false && (pk === 'pollinations' || !!keys[pk])).length > 0 && (
          <>
            <Text style={[s.hint, { marginTop: 16, marginBottom: 8 }]}>
              Disabled — tap toggle to re-enable
            </Text>
            {providerOrder.filter(pk => enabled[pk] === false && (pk === 'pollinations' || !!keys[pk])).map(pk => (
              <View key={pk} style={[s.card, { opacity: 0.5 }]}>
                <View style={s.providerRow}>
                  <View style={s.providerRowLeft}>
                    <View style={[s.dot, { backgroundColor: PROVIDERS[pk].color }]} />
                    <Text style={[s.providerName, { color: '#555' }]}>{PROVIDERS[pk].name}</Text>
                  </View>
                  <Switch
                    value={false}
                    onValueChange={v => toggleEnabled(pk, v)}
                    trackColor={{ false: '#333', true: '#2a5a4a' }}
                    thumbColor="#666"
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Compare section ── */}
        <Text style={[s.subTitle, { marginTop: 24, marginBottom: 8 }]}>Compare Providers</Text>
        <Text style={s.hint}>Send the same prompt to all enabled providers at once. Results sorted by speed.</Text>

        <View style={s.row}>
          <TextInput
            style={[s.keyInput, { flex: 1 }]}
            value={comparePrompt}
            onChangeText={setComparePrompt}
            placeholder="Enter a prompt to compare..."
            placeholderTextColor="#555"
            returnKeyType="send"
            onSubmitEditing={runCompare}
          />
          <TouchableOpacity style={s.qrBtn} onPress={comparePickImage}><Text>🖼</Text></TouchableOpacity>
          <TouchableOpacity style={s.qrBtn} onPress={compareTakePhoto}><Text>📷</Text></TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, (!comparePrompt || comparing) && s.btnDisabled]}
            onPress={runCompare}
            disabled={!comparePrompt || comparing}
          >
            <Text style={s.saveBtnText}>{comparing ? '...' : 'Go'}</Text>
          </TouchableOpacity>
        </View>

        {compareImage && (
          <View style={s.row}>
            <Image source={{ uri: compareImage.uri }} style={s.compareThumb} />
            <Text style={s.hint}>Image attached (vision providers only)</Text>
            <TouchableOpacity onPress={() => setCompareImage(null)}>
              <Text style={s.redText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {comparing && <ActivityIndicator color="#4ECDC4" style={{ marginTop: 16 }} />}

        {compareResults.map((r, i) => (
          <View key={i} style={[s.card, r.error && s.cardFail, { marginTop: 10 }]}>
            <Text style={[s.providerName, { marginBottom: 4 }]}>
              {r.provider} <Text style={s.hint}>· {r.ms}ms</Text>
            </Text>
            <Text style={[s.hint, r.error && s.redText]}>{r.content}</Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (screen === 'instructions') return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.subHeader}>
        <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.subTitle}>How to Get Keys</Text>
      </View>

      <Text style={[s.subTitle, { marginBottom: 8 }]}>🟢 Free — No Credit Card</Text>
      {FREE_KEY_PROVIDERS.map(pk => {
        const p = PROVIDERS[pk];
        return (
          <TouchableOpacity key={pk} style={s.keyRow} onPress={() => Linking.openURL(`https://${p.instructionsUrl}`)}>
            <View style={{ flex: 1 }}>
              <Text style={s.providerName}>{p.name}</Text>
              {p.keyHint && <Text style={[s.hint, { marginBottom: 0, marginTop: 2 }]}>{p.keyHint}</Text>}
            </View>
            <Text style={s.teal}>{p.instructionsUrl} ›</Text>
          </TouchableOpacity>
        );
      })}

      <Text style={[s.subTitle, { marginTop: 20, marginBottom: 8 }]}>💳 Paid — Credit Card Required</Text>
      {PAID_KEY_PROVIDERS.map(pk => {
        const p = PROVIDERS[pk];
        return (
          <TouchableOpacity key={pk} style={s.keyRow} onPress={() => Linking.openURL(`https://${p.instructionsUrl}`)}>
            <View style={{ flex: 1 }}>
              <Text style={s.providerName}>{p.name}</Text>
              {p.keyHint && <Text style={[s.hint, { marginBottom: 0, marginTop: 2 }]}>{p.keyHint}</Text>}
            </View>
            <Text style={s.teal}>{p.instructionsUrl} ›</Text>
          </TouchableOpacity>
        );
      })}

      <Text style={[s.subTitle, { marginTop: 24, marginBottom: 8 }]}>Adding a key</Text>
      <Text style={s.bodyText}>
        From your laptop:{'\n'}
        1. Go to qr.io{'\n'}
        2. Paste your API key and generate a QR code{'\n'}
        3. In API Keys, tap QR next to the provider{'\n'}
        4. Point your camera at the screen{'\n\n'}
        From your phone only:{'\n'}
        1. Open the provider site on your phone{'\n'}
        2. Copy your API key{'\n'}
        3. Paste it into the key field and tap Save{'\n\n'}
        Always tap Test after saving to confirm it works.
      </Text>
    </ScrollView>
  );

  if (screen === 'donate') return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.subHeader}>
        <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.subTitle}>Donate</Text>
      </View>
      <View style={s.donateHero}>
        <Text style={s.donateEmoji}>🤝</Text>
        <Text style={s.donateHeadline}>ManyAI is shareware</Text>
        <Text style={s.donateSubline}>Use it free. Pay if it's worth it to you.</Text>
      </View>
      <Text style={s.bodyText}>
        ManyAI is free to download and use — no forced payment, no expiry, no nag screens. Like WinRAR, it runs on the honor system.{'\n\n'}
        If ManyAI saves you money on AI subscriptions or just makes your day easier, a $5 tip keeps the lights on. No pressure — but it means a lot.
      </Text>
      <View style={{ gap: 10, marginTop: 20 }}>
        {[
          { name: 'PayPal', handle: 'Donate!', url: 'https://www.paypal.com/donate/?business=L8TLNTRBQSF3Q&no_recurring=0&item_name=Thank+you+for+contributing+to+the+ManyAI+project.++Those+Claude+tokens+are+not+cheap%21&currency_code=USD' },
          { name: 'Cash App', handle: '$StevePleasants9', url: 'https://cash.app/$StevePleasants9' },
          { name: 'Venmo', handle: '@StevePleasants9', url: 'https://venmo.com/StevePleasants9' },
        ].map(({ name, handle, url }) => (
          <TouchableOpacity key={name} style={s.donateCard} onPress={() => Linking.openURL(url)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={s.providerName}>{name}</Text>
                <Text style={s.teal}>{handle}</Text>
              </View>
              <Text style={s.menuArrow}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[s.hint, { textAlign: 'center', marginTop: 24 }]}>Tap to open the app or browser</Text>
    </ScrollView>
  );

  if (screen === 'about') return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.subHeader}>
        <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.subTitle}>About ManyAI</Text>
      </View>
      <Image source={require('@/assets/images/steve.png')} style={s.stevePhoto} />
      <Text style={s.bodyText}>
        Designed by Steve Pleasants. All code written by Claude (Anthropic), under the direction of Steve.{'\n\n'}
        ManyAI routes your questions to the best available free AI provider automatically. If one fails or hits a limit, it tries the next — so you always get an answer.{'\n\n'}
        All API keys are stored encrypted on your device only. Nothing is ever sent to a ManyAI server.{'\n\n'}
        ManyAI is shareware. Free to use — supported by optional donations.
      </Text>
      <TouchableOpacity style={s.githubBtn} onPress={() => Linking.openURL('https://github.com/SoylentAquamarine')}>
        <Text style={s.githubBtnText}>GitHub: SoylentAquamarine</Text>
      </TouchableOpacity>

      {/* Check for updates — works in production builds via EAS Update */}
      <TouchableOpacity
        style={[s.updateBtn, updateStatus === 'checking' || updateStatus === 'downloading' ? s.btnDisabled : null]}
        onPress={checkForUpdate}
        disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
      >
        {updateStatus === 'checking' || updateStatus === 'downloading' ? (
          <ActivityIndicator color="#1a1a2e" size="small" />
        ) : (
          <Text style={s.updateBtnText}>
            {updateStatus === 'upToDate' ? '✓ App is up to date' :
             updateStatus === 'error'    ? '✗ Update check failed' :
             '⬇ Check for Updates'}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={[s.hint, { textAlign: 'center', marginTop: 32 }]}>Version {Constants.expoConfig?.version ?? '1.0'} · Built with Expo</Text>
      <Text style={[s.hint, { textAlign: 'center', marginTop: 8 }]}>© 2026 Steve Pleasants. All rights reserved.</Text>
    </ScrollView>
  );

  // ─── Main menu ────────────────────────────────────────────────────────────

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.menuHeader}>
        <Text style={s.menuTitle}>Settings</Text>
      </View>

      {[
        { id: 'keys',         label: 'API Keys',          desc: `${Object.keys(keys).length + 1} providers configured`, icon: '🔑' },
        { id: 'providers',    label: 'Providers & Models', desc: 'Enable, reorder, and choose models',                   icon: '⚙️' },
        { id: 'instructions', label: 'How to Get Keys',    desc: 'Free API keys for every provider',                     icon: '📖' },
        { id: 'about',        label: 'About',              desc: 'About the app and the developer',                      icon: 'ℹ️' },
      ].map(item => (
        <TouchableOpacity key={item.id} style={s.menuBtn} onPress={() => setScreen(item.id as Screen)}>
          <Text style={s.menuBtnIcon}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.menuBtnLabel}>{item.label}</Text>
            <Text style={s.menuBtnDesc}>{item.desc}</Text>
          </View>
          <Text style={s.menuArrow}>›</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={s.donateMenuBtn} onPress={() => setScreen('donate')}>
        <Text style={s.donateMenuIcon}>💛</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.donateMenuLabel}>Donate!</Text>
          <Text style={s.donateMenuDesc}>Shareware — use free, tip if it's worth it</Text>
        </View>
        <Text style={s.menuArrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = 24; const CT = 3;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { padding: 16, paddingBottom: 40 },

  // Menu
  menuHeader: { paddingTop: 54, paddingBottom: 24 },
  menuTitle: { fontSize: 34, fontWeight: 'bold', color: '#ffffff' },
  menuBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#16213e', borderRadius: 14, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: '#0f3460',
  },
  menuBtnIcon: { fontSize: 26 },
  menuBtnLabel: { color: '#ffffff', fontSize: 17, fontWeight: '600', marginBottom: 2 },
  menuBtnDesc: { color: '#666', fontSize: 13 },
  menuArrow: { color: '#444', fontSize: 22 },

  // Sub-screens
  subHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 54, paddingBottom: 20, gap: 14 },
  back: { color: '#4ECDC4', fontSize: 16 },
  subTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  hint: { color: '#666', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  modelHint: { color: '#666', fontSize: 12, marginBottom: 10 },
  teal: { color: '#4ECDC4' },
  tealText: { color: '#4ECDC4', fontSize: 14 },
  redText: { color: '#FF6B6B', fontSize: 14 },
  bodyText: { color: '#aaa', fontSize: 14, lineHeight: 22 },

  sectionHeader: { marginTop: 20, marginBottom: 10 },
  sectionTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  sectionSub: { color: '#555', fontSize: 12, marginTop: 2 },
  keyHintText: { color: '#888', fontSize: 11, marginBottom: 8, fontStyle: 'italic' },

  card: { backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#0f3460' },
  cardFail: { borderColor: '#FF6B6B44' },
  cardOk: { borderColor: '#4ECDC444' },
  cardDim: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  providerName: { color: '#eeeeee', fontWeight: '600', fontSize: 15, flex: 1 },
  badge: { backgroundColor: '#0f3460', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11 },
  activeBadge: { backgroundColor: '#1a3a2a' },
  okBadge: { backgroundColor: '#1a4a1a' },
  failBadge: { backgroundColor: '#3a1a1a' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  maskedKey: { flex: 1, color: '#4ECDC4', fontSize: 14 },
  testBtn: { backgroundColor: '#1a3a2a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#4ECDC4' },
  testOk: { color: '#4ECDC4', fontSize: 12 },
  testFail: { color: '#FF6B6B', fontSize: 12 },
  keyInput: { flex: 1, backgroundColor: '#0f3460', color: '#ffffff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  qrBtn: { backgroundColor: '#0f3460', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#4ECDC4' },
  saveBtn: { backgroundColor: '#4ECDC4', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 14 },
  removeBtn: { backgroundColor: '#3a1a1a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#FF6B6B' },

  // Provider order
  providerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  providerRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  providerRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderNum: { color: '#444', fontSize: 16, fontWeight: 'bold', width: 20 },
  noKeyHint: { color: '#555', fontSize: 11 },
  arrowBtn: { padding: 6 },
  arrowText: { color: '#4ECDC4', fontSize: 16 },
  arrowDisabled: { color: '#333' },

  // Model selector
  modelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#0f3460' },
  modelRowLabel: { color: '#555', fontSize: 12 },
  modelRowValue: { flex: 1, color: '#4ECDC4', fontSize: 12 },
  modelRowChevron: { color: '#4ECDC4', fontSize: 11 },
  modelList: { marginTop: 6, gap: 2 },
  modelOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 10 },
  modelRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#444' },
  modelRadioSelected: { borderColor: '#4ECDC4', backgroundColor: '#4ECDC4' },
  modelOptionText: { color: '#888', fontSize: 13, flex: 1 },
  modelOptionTextSelected: { color: '#fff', fontWeight: '600' },

  // Donate
  donateMenuBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#2a1a3a', borderRadius: 14, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: '#4a2a6a', marginTop: 8,
  },
  donateMenuIcon: { fontSize: 26 },
  donateMenuLabel: { color: '#FFD700', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  donateMenuDesc: { color: '#888', fontSize: 13 },
  donateHero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  donateEmoji: { fontSize: 48 },
  donateHeadline: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  donateSubline: { color: '#4ECDC4', fontSize: 14, textAlign: 'center' },
  stevePhoto: { width: 60, height: 60, borderRadius: 30, alignSelf: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#4ECDC4' },
  githubBtn: { marginTop: 20, backgroundColor: '#16213e', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#4ECDC4' },
  githubBtnText: { color: '#4ECDC4', fontSize: 15, fontWeight: '600' },
  updateBtn: { marginTop: 12, backgroundColor: '#4ECDC4', borderRadius: 12, padding: 14, alignItems: 'center' },
  updateBtnText: { color: '#1a1a2e', fontSize: 15, fontWeight: '600' },

  compareThumb: { width: 40, height: 40, borderRadius: 6 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  donateCard: { backgroundColor: '#16213e', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#0f3460' },

  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  scannerTitle: { fontSize: 20, fontWeight: 'bold', color: '#4ECDC4', marginBottom: 10 },
  scannerHint: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  cameraWrapper: { width: 260, height: 260, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  camera: { width: '100%', height: '100%' },
  corner: { position: 'absolute', width: C, height: C, borderColor: '#4ECDC4' },
  cornerTL: { top: 0, left: 0, borderTopWidth: CT, borderLeftWidth: CT },
  cornerTR: { top: 0, right: 0, borderTopWidth: CT, borderRightWidth: CT },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CT, borderLeftWidth: CT },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CT, borderRightWidth: CT },
  cancelBtn: { marginTop: 32, backgroundColor: '#16213e', borderRadius: 12, paddingHorizontal: 40, paddingVertical: 14, borderWidth: 1, borderColor: '#0f3460' },
  cancelBtnText: { color: '#aaa', fontSize: 16 },
});
