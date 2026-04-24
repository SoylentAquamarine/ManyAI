/**
 * ManyAI — © 2026 Steve Pleasants. All rights reserved.
 *
 * saved.tsx — Browse, title, categorise, refine, and delete saved AI responses.
 *
 * Cards expand on tap to show full content and action buttons.
 * "Edit" button opens the category manager: rename, add, or remove categories.
 * "Refine" seeds the chat screen and switches to it.
 */

import { useState, useCallback } from 'react';
import Constants from 'expo-constants';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, TextInput, Modal, Image,
} from 'react-native';
import { shareText, shareImage, saveImageToDevice } from '@/lib/saved/shareUtils';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  SavedResponse, loadAllResponses, loadCategories, deleteResponse,
  updateResponse, addCategory, deleteCategory, saveCategories,
} from '@/lib/saved/savedResponses';
import { setRefineSeed } from '@/lib/saved/refineSeed';

export default function SavedScreen() {
  const router = useRouter();

  // Data
  const [responses, setResponses] = useState<SavedResponse[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // UI state
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Inline title editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Move-to-category modal
  const [moveTarget, setMoveTarget] = useState<SavedResponse | null>(null);

  // Full text editor modal
  const [editTextTarget, setEditTextTarget] = useState<SavedResponse | null>(null);
  const [editTextValue, setEditTextValue] = useState('');

  // Category manager modal
  const [showCatEditor, setShowCatEditor] = useState(false);
  const [catDraft, setCatDraft] = useState<string[]>([]);      // Local copy being edited
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newCatInput, setNewCatInput] = useState('');

  // ─── Data loading ─────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    const [all, cats] = await Promise.all([loadAllResponses(), loadCategories()]);
    setResponses(all);
    setCategories(cats);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // ─── Derived ──────────────────────────────────────────────────────────────

  const filtered = activeCategory === 'All'
    ? responses
    : responses.filter(r => r.category === activeCategory);

  // ─── Card handlers ────────────────────────────────────────────────────────

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Remove this saved response?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteResponse(id);
        setResponses(prev => prev.filter(r => r.id !== id));
        if (expanded === id) setExpanded(null);
      }},
    ]);
  };

  const handleMove = async (newCat: string) => {
    if (!moveTarget) return;
    await updateResponse(moveTarget.id, { category: newCat });
    setMoveTarget(null);
    reload();
  };

  const startEditTitle = (item: SavedResponse) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
  };

  const commitTitle = async (id: string) => {
    const title = editingTitle.trim();
    if (title) {
      await updateResponse(id, { title });
      setResponses(prev => prev.map(r => r.id === id ? { ...r, title } : r));
    }
    setEditingId(null);
  };

  const handleRefine = (item: SavedResponse) => {
    setRefineSeed({
      prompt: item.prompt,
      response: item.response,
      provider: item.provider,
      title: item.title,
    });
    router.navigate('/');
  };

  /** Open the full text editor for a card's response text */
  const openTextEditor = (item: SavedResponse) => {
    setEditTextTarget(item);
    setEditTextValue(item.response);
  };

  /** Save the edited response text */
  const commitTextEdit = async () => {
    if (!editTextTarget) return;
    const response = editTextValue; // capture before clearing
    await updateResponse(editTextTarget.id, { response });
    setResponses(prev => prev.map(r => r.id === editTextTarget.id ? { ...r, response } : r));
    setEditTextTarget(null);
  };

  // ─── Category editor handlers ─────────────────────────────────────────────

  /** Open the editor with a local draft copy of the current categories */
  const openCatEditor = () => {
    setCatDraft([...categories]);
    setRenamingIdx(null);
    setRenameValue('');
    setNewCatInput('');
    setShowCatEditor(true);
  };

  /** Start renaming a category at a given index */
  const startRename = (idx: number) => {
    setRenamingIdx(idx);
    setRenameValue(catDraft[idx]);
  };

  /** Commit a rename to the local draft (not saved to storage yet) */
  const commitRename = () => {
    const name = renameValue.trim();
    if (name && renamingIdx !== null) {
      const next = [...catDraft];
      next[renamingIdx] = name;
      setCatDraft(next);
    }
    setRenamingIdx(null);
  };

  /** Remove a category from the local draft */
  const removeCatFromDraft = (idx: number) => {
    setCatDraft(prev => prev.filter((_, i) => i !== idx));
    if (renamingIdx === idx) setRenamingIdx(null);
  };

  /** Add a new category to the local draft */
  const addCatToDraft = () => {
    const name = newCatInput.trim();
    if (!name || catDraft.includes(name)) return;
    setCatDraft(prev => [...prev, name]);
    setNewCatInput('');
  };

  /**
   * Save all changes: compute what was renamed/deleted and apply them.
   * Renames are matched by index position (order is preserved).
   * Deletions move affected responses to General.
   */
  const saveCatEdits = async () => {
    // Commit any pending rename first
    const finalDraft = [...catDraft];
    if (renamingIdx !== null) {
      const name = renameValue.trim();
      if (name) finalDraft[renamingIdx] = name;
    }

    // Figure out what was deleted vs renamed by comparing to original list
    const deletedCats = categories.filter(c => !finalDraft.includes(c));

    // Apply deletions (this also moves responses → General)
    for (const cat of deletedCats) {
      await deleteCategory(cat);
    }

    // Save the final ordered list (covers renames + additions)
    await saveCategories(finalDraft);

    // If the active tab was deleted, reset to All
    if (deletedCats.includes(activeCategory)) setActiveCategory('All');

    setShowCatEditor(false);
    reload();
  };

  // ─── Misc ─────────────────────────────────────────────────────────────────

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>Saved <Text style={s.version}>v{Constants.expoConfig?.version ?? '1.0'}</Text></Text>
            <Text style={s.headerSub}>{responses.length} saved response{responses.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity style={s.editCatBtn} onPress={openCatEditor}>
            <Text style={s.editCatBtnText}>Edit Categories</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category tabs */}
      <View style={s.catRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.catBarContent}>
          {['All', ...categories].map(cat => (
            <TouchableOpacity
              key={cat}
              style={[s.catTab, activeCategory === cat && s.catTabActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[s.catTabText, activeCategory === cat && s.catTabTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Response cards */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.list}>
        {filtered.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No saved responses yet.</Text>
            <Text style={s.emptyHint}>Tap Save on any AI response in the chat.</Text>
          </View>
        )}

        {filtered.map(item => {
          const isExpanded = expanded === item.id;
          const isEditingTitle = editingId === item.id;

          return (
            <View key={item.id} style={s.card}>

              {/* ── Collapsed tap target ── */}
              {!isExpanded && (
                <TouchableOpacity onPress={() => setExpanded(item.id)} activeOpacity={0.8}>
                  <View style={s.cardHeader}>
                    <View style={s.cardMeta}>
                      <Text style={s.cardCategory}>{item.category}</Text>
                      <Text style={s.cardDate}>{formatDate(item.savedAt)}</Text>
                    </View>
                    <Text style={s.cardProvider}>{item.provider}</Text>
                  </View>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {item.imageUri ? (
                    /* Image item — show thumbnail preview */
                    <Image source={{ uri: item.imageUri }} style={s.cardThumb} resizeMode="cover" />
                  ) : (
                    /* Text item — show prompt + response preview */
                    <>
                      <Text style={s.cardPrompt} numberOfLines={1}>Q: {item.prompt || '(no prompt)'}</Text>
                      <Text style={s.cardResponse} numberOfLines={3}>{item.response}</Text>
                    </>
                  )}
                  <Text style={s.readMore}>Tap to expand</Text>
                </TouchableOpacity>
              )}

              {/* ── Expanded view ── */}
              {isExpanded && (
                <>
                  <View style={s.cardHeader}>
                    <View style={s.cardMeta}>
                      <Text style={s.cardCategory}>{item.category}</Text>
                      <Text style={s.cardDate}>{formatDate(item.savedAt)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setExpanded(null); setEditingId(null); }}>
                      <Text style={s.collapseBtn}>▲ Collapse</Text>
                    </TouchableOpacity>
                  </View>

                  {isEditingTitle ? (
                    <TextInput
                      style={s.titleInput}
                      value={editingTitle}
                      onChangeText={setEditingTitle}
                      onBlur={() => commitTitle(item.id)}
                      onSubmitEditing={() => commitTitle(item.id)}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                    />
                  ) : (
                    <Text style={s.cardTitle}>{item.title}</Text>
                  )}

                  {/* Prompt line */}
                  <Text style={s.cardPrompt}>Q: {item.prompt || '(no prompt)'}</Text>

                  {item.imageUri ? (
                    /* Image item — show full generated image */
                    <Image source={{ uri: item.imageUri }} style={s.cardFullImage} resizeMode="contain" />
                  ) : (
                    /* Text item — show full response */
                    <Text style={[s.cardResponse, { marginBottom: 4 }]}>{item.response}</Text>
                  )}

                  <Text style={s.cardProviderFull}>{item.provider}</Text>

                  <View style={s.cardActions}>
                    {item.imageUri ? (
                      /* Image-specific actions — no Refine (images don't refine well) */
                      <>
                        <TouchableOpacity style={s.actionBtn} onPress={() => saveImageToDevice(item.imageUri!)}>
                          <Text style={s.actionBtnText}>Save to Device</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn} onPress={() => shareImage(item.imageUri!)}>
                          <Text style={s.actionBtnText}>Share</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      /* Text-specific actions */
                      <>
                        <TouchableOpacity style={[s.actionBtn, s.refineBtn]} onPress={() => handleRefine(item)}>
                          <Text style={s.refineBtnText}>Refine</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn} onPress={() => openTextEditor(item)}>
                          <Text style={s.actionBtnText}>Edit Text</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn} onPress={() => shareText(item.response)}>
                          <Text style={s.actionBtnText}>Share</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity style={s.actionBtn} onPress={() => startEditTitle(item)}>
                      <Text style={s.actionBtnText}>Rename</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => setMoveTarget(item)}>
                      <Text style={s.actionBtnText}>Move</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, s.deleteBtn]} onPress={() => handleDelete(item.id)}>
                      <Text style={s.deleteBtnText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

            </View>
          );
        })}
      </ScrollView>

      {/* ── Move to category modal ── */}
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

      {/* ── Category editor modal ── */}
      <Modal visible={showCatEditor} animationType="slide" transparent onRequestClose={() => setShowCatEditor(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>

            {/* Header */}
            <View style={s.editorHeader}>
              <Text style={s.modalTitle}>Edit Categories</Text>
              <TouchableOpacity onPress={() => setShowCatEditor(false)}>
                <Text style={s.editorClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {catDraft.map((cat, idx) => (
                <View key={`${cat}-${idx}`} style={s.editorRow}>
                  {renamingIdx === idx ? (
                    /* Inline rename input */
                    <TextInput
                      style={s.editorInput}
                      value={renameValue}
                      onChangeText={setRenameValue}
                      onBlur={commitRename}
                      onSubmitEditing={commitRename}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                    />
                  ) : (
                    /* Category name — tap to rename */
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => startRename(idx)}>
                      <Text style={s.editorCatName}>{cat}</Text>
                      <Text style={s.editorTapHint}>tap to rename</Text>
                    </TouchableOpacity>
                  )}
                  {/* Remove button — can't delete General */}
                  {cat !== 'General' ? (
                    <TouchableOpacity style={s.editorRemoveBtn} onPress={() => removeCatFromDraft(idx)}>
                      <Text style={s.editorRemoveText}>✕</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.editorRemoveBtn}>
                      <Text style={s.editorLockText}>🔒</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Add new category row */}
            <View style={s.editorAddRow}>
              <TextInput
                style={s.editorAddInput}
                value={newCatInput}
                onChangeText={setNewCatInput}
                placeholder="New category name..."
                placeholderTextColor="#555"
                onSubmitEditing={addCatToDraft}
                returnKeyType="done"
              />
              <TouchableOpacity style={s.editorAddBtn} onPress={addCatToDraft}>
                <Text style={s.editorAddBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Save / Cancel */}
            <TouchableOpacity style={s.editorSaveBtn} onPress={saveCatEdits}>
              <Text style={s.editorSaveBtnText}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCatEditor(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* ── Full text editor modal ── */}
      <Modal
        visible={!!editTextTarget}
        animationType="slide"
        onRequestClose={() => setEditTextTarget(null)}
      >
        <View style={s.editorScreen}>
          <View style={s.editorScreenHeader}>
            <TouchableOpacity onPress={() => setEditTextTarget(null)}>
              <Text style={s.editorScreenCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.editorScreenTitle} numberOfLines={1}>
              {editTextTarget?.title ?? 'Edit'}
            </Text>
            <TouchableOpacity onPress={commitTextEdit}>
              <Text style={s.editorScreenSave}>Save</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.editorScreenInput}
            value={editTextValue}
            onChangeText={setEditTextValue}
            multiline
            autoFocus
            textAlignVertical="top"
            scrollEnabled
            placeholder="Response text..."
            placeholderTextColor="#555"
          />
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingTop: 54, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 34, fontWeight: 'bold', color: '#ffffff' },
  version: { fontSize: 12, fontWeight: 'normal', color: '#444' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },

  // Category bar row — tabs scroll, Edit button is fixed on the right
  catRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460' },
  catBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  catTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#0f3460', borderWidth: 1, borderColor: '#0f3460' },
  catTabActive: { borderColor: '#4ECDC4', backgroundColor: '#1a3a2a' },
  catTabText: { color: '#888', fontSize: 13 },
  catTabTextActive: { color: '#4ECDC4' },
  editCatBtn: { paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: '#0f3460', borderRadius: 8, borderWidth: 1, borderColor: '#4ECDC4' },
  editCatBtnText: { color: '#4ECDC4', fontSize: 13 },

  list: { padding: 12, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { color: '#555', fontSize: 16 },
  emptyHint: { color: '#444', fontSize: 13 },

  card: { backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#0f3460' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cardCategory: { color: '#4ECDC4', fontSize: 11, fontWeight: '600' },
  cardDate: { color: '#555', fontSize: 11 },
  cardProvider: { color: '#666', fontSize: 11 },
  cardProviderFull: { color: '#555', fontSize: 11, marginBottom: 8 },
  collapseBtn: { color: '#4ECDC4', fontSize: 12 },
  cardTitle: { color: '#ffffff', fontSize: 15, fontWeight: '600', marginBottom: 5 },
  titleInput: {
    color: '#fff', fontSize: 15, fontWeight: '600',
    backgroundColor: '#0f3460', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#4ECDC4', marginBottom: 6,
  },
  cardPrompt: { color: '#888', fontSize: 12, marginBottom: 6, fontStyle: 'italic' },
  cardResponse: { color: '#eeeeee', fontSize: 14, lineHeight: 20 },
  cardThumb: { width: '100%', height: 120, borderRadius: 8, marginBottom: 6 },
  cardFullImage: { width: '100%', aspectRatio: 1, borderRadius: 10, marginBottom: 8 },
  readMore: { color: '#444', fontSize: 11, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actionBtn: { backgroundColor: '#0f3460', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#4ECDC4' },
  actionBtnText: { color: '#4ECDC4', fontSize: 13 },
  refineBtn: { backgroundColor: '#1a3a2a', borderColor: '#4ECDC4' },
  refineBtnText: { color: '#4ECDC4', fontSize: 13, fontWeight: '600' },
  deleteBtn: { borderColor: '#FF6B6B', backgroundColor: '#3a1a1a' },
  deleteBtnText: { color: '#FF6B6B', fontSize: 13 },

  // Shared modal styles
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#16213e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  moveCatBtn: { backgroundColor: '#0f3460', borderRadius: 10, padding: 14, marginBottom: 8 },
  moveCatText: { color: '#eee', fontSize: 15 },
  cancelBtn: { marginTop: 8, padding: 14, alignItems: 'center' },
  cancelText: { color: '#888', fontSize: 15 },

  // Category editor modal
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editorClose: { color: '#888', fontSize: 20, paddingLeft: 16 },
  editorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f3460', borderRadius: 10, padding: 12, marginBottom: 8, gap: 10 },
  editorInput: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: '#4ECDC4', paddingVertical: 2 },
  editorCatName: { color: '#eee', fontSize: 15, fontWeight: '600' },
  editorTapHint: { color: '#555', fontSize: 10, marginTop: 2 },
  editorRemoveBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  editorRemoveText: { color: '#FF6B6B', fontSize: 16, fontWeight: 'bold' },
  editorLockText: { fontSize: 14 },
  editorAddRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  editorAddInput: { flex: 1, backgroundColor: '#0f3460', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  editorAddBtn: { backgroundColor: '#4ECDC4', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  editorAddBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 14 },
  editorSaveBtn: { backgroundColor: '#4ECDC4', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  editorSaveBtnText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 15 },

  // Full-screen text editor
  editorScreen: { flex: 1, backgroundColor: '#1a1a2e' },
  editorScreenHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 54, paddingBottom: 12, paddingHorizontal: 20,
    backgroundColor: '#16213e', borderBottomWidth: 1, borderBottomColor: '#0f3460',
  },
  editorScreenTitle: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center', marginHorizontal: 12 },
  editorScreenCancel: { color: '#888', fontSize: 15 },
  editorScreenSave: { color: '#4ECDC4', fontSize: 15, fontWeight: '700' },
  editorScreenInput: {
    flex: 1, color: '#eee', fontSize: 15, lineHeight: 22,
    padding: 16, backgroundColor: '#1a1a2e',
  },
});
