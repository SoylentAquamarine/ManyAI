/**
 * Saved screen — browse, categorise, and delete saved AI responses.
 */

import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  SavedResponse, loadAllResponses, loadCategories, deleteResponse,
  updateCategory, addCategory, deleteCategory, saveCategories,
} from '@/lib/savedResponses';

export default function SavedScreen() {
  const [responses, setResponses] = useState<SavedResponse[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<SavedResponse | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);

  const reload = useCallback(async () => {
    const [all, cats] = await Promise.all([loadAllResponses(), loadCategories()]);
    setResponses(all);
    setCategories(cats);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const filtered = activeCategory === 'All'
    ? responses
    : responses.filter(r => r.category === activeCategory);

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Remove this saved response?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteResponse(id);
        setResponses(prev => prev.filter(r => r.id !== id));
      }},
    ]);
  };

  const handleMove = async (newCat: string) => {
    if (!moveTarget) return;
    await updateCategory(moveTarget.id, newCat);
    setMoveTarget(null);
    reload();
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const cats = await addCategory(name);
    setCategories(cats);
    setNewCatName('');
    setShowNewCat(false);
  };

  const handleDeleteCategory = (cat: string) => {
    Alert.alert('Delete category', `Delete "${cat}"? Responses will move to General.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const cats = await deleteCategory(cat);
        setCategories(cats);
        if (activeCategory === cat) setActiveCategory('All');
        reload();
      }},
    ]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Saved <Text style={s.version}>v0.7</Text></Text>
        <Text style={s.headerSub}>{responses.length} saved response{responses.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catBar} contentContainerStyle={s.catBarContent}>
        {['All', ...categories].map(cat => (
          <TouchableOpacity
            key={cat}
            style={[s.catTab, activeCategory === cat && s.catTabActive]}
            onPress={() => setActiveCategory(cat)}
            onLongPress={() => cat !== 'All' && handleDeleteCategory(cat)}
          >
            <Text style={[s.catTabText, activeCategory === cat && s.catTabTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.catTab} onPress={() => setShowNewCat(true)}>
          <Text style={s.catTabText}>+ New</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* New category input */}
      {showNewCat && (
        <View style={s.newCatRow}>
          <TextInput
            style={s.newCatInput}
            value={newCatName}
            onChangeText={setNewCatName}
            placeholder="Category name..."
            placeholderTextColor="#555"
            autoFocus
          />
          <TouchableOpacity style={s.newCatBtn} onPress={handleAddCategory}>
            <Text style={s.newCatBtnText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowNewCat(false)} style={{ padding: 8 }}>
            <Text style={{ color: '#888' }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={s.list}>
        {filtered.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No saved responses yet.</Text>
            <Text style={s.emptyHint}>Tap Save on any AI response in the chat.</Text>
          </View>
        )}

        {filtered.map(item => (
          <View key={item.id} style={s.card}>
            <TouchableOpacity onPress={() => setExpanded(expanded === item.id ? null : item.id)}>
              <View style={s.cardHeader}>
                <View style={s.cardMeta}>
                  <Text style={s.cardCategory}>{item.category}</Text>
                  <Text style={s.cardDate}>{formatDate(item.savedAt)}</Text>
                </View>
                <Text style={s.cardProvider}>{item.provider}</Text>
              </View>
              <Text style={s.cardPrompt} numberOfLines={expanded === item.id ? undefined : 1}>
                Q: {item.prompt || '(no prompt)'}
              </Text>
              <Text style={s.cardResponse} numberOfLines={expanded === item.id ? undefined : 3}>
                {item.response}
              </Text>
              {expanded !== item.id && <Text style={s.readMore}>Tap to expand</Text>}
            </TouchableOpacity>

            {expanded === item.id && (
              <View style={s.cardActions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => setMoveTarget(item)}>
                  <Text style={s.actionBtnText}>Move</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, s.deleteBtn]} onPress={() => handleDelete(item.id)}>
                  <Text style={s.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Move to category modal */}
      <Modal visible={!!moveTarget} animationType="slide" transparent onRequestClose={() => setMoveTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Move to category</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {categories.map(cat => (
                <TouchableOpacity key={cat} style={s.moveCatBtn} onPress={() => handleMove(cat)}>
                  <Text style={s.moveCatText}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setMoveTarget(null)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingTop: 54, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#4ECDC4' },
  version: { fontSize: 12, fontWeight: 'normal', color: '#444' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  catBar: { maxHeight: 50, backgroundColor: '#16213e' },
  catBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  catTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#0f3460' },
  catTabActive: { borderColor: '#4ECDC4', backgroundColor: '#1a3a2a' },
  catTabText: { color: '#888', fontSize: 13 },
  catTabTextActive: { color: '#4ECDC4' },
  newCatRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#16213e', gap: 8 },
  newCatInput: { flex: 1, backgroundColor: '#0f3460', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  newCatBtn: { backgroundColor: '#4ECDC4', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newCatBtnText: { color: '#1a1a2e', fontWeight: 'bold' },
  list: { padding: 12, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { color: '#555', fontSize: 16 },
  emptyHint: { color: '#444', fontSize: 13 },
  card: { backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#0f3460' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cardCategory: { color: '#4ECDC4', fontSize: 11, fontWeight: '600' },
  cardDate: { color: '#555', fontSize: 11 },
  cardProvider: { color: '#666', fontSize: 11 },
  cardPrompt: { color: '#888', fontSize: 12, marginBottom: 6, fontStyle: 'italic' },
  cardResponse: { color: '#eeeeee', fontSize: 14, lineHeight: 20 },
  readMore: { color: '#444', fontSize: 11, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { backgroundColor: '#0f3460', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#4ECDC4' },
  actionBtnText: { color: '#4ECDC4', fontSize: 13 },
  deleteBtn: { borderColor: '#FF6B6B', backgroundColor: '#3a1a1a' },
  deleteBtnText: { color: '#FF6B6B', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#16213e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  moveCatBtn: { backgroundColor: '#0f3460', borderRadius: 10, padding: 14, marginBottom: 8 },
  moveCatText: { color: '#eee', fontSize: 15 },
  cancelBtn: { marginTop: 8, padding: 14, alignItems: 'center' },
  cancelText: { color: '#888', fontSize: 15 },
});
