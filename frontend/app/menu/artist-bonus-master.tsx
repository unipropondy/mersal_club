import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "../../components/Toast";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface BonusRule {
  Id: string;
  ThresholdAmount: number;
  BonusAmount: number;
  IsRepeating: boolean;
  IsActive: boolean;
  ArtistDishId: string | null;
  ArtistType: string | null;
  ArtistDishName: string | null;
  CreatedDate: string;
}

const EMPTY_FORM = {
  ThresholdAmount: "",
  BonusAmount: "",
  IsRepeating: true,
  IsActive: true,
  ArtistDishId: null as string | null,
  ArtistType: "",
};

export default function ArtistBonusMasterScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [rules, setRules] = useState<BonusRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Custom Confirm Dialog States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText: string;
    isDestructive?: boolean;
  } | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/artist-bonus/master`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) setRules(res.data.data);
    } catch (err: any) {
      showToast({ type: "error", message: "Load Failed", subtitle: err.message });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (rule: BonusRule) => {
    setForm({
      ThresholdAmount: String(rule.ThresholdAmount),
      BonusAmount: String(rule.BonusAmount),
      IsRepeating: rule.IsRepeating,
      IsActive: rule.IsActive,
      ArtistDishId: rule.ArtistDishId,
      ArtistType: rule.ArtistType || "",
    });
    setEditingId(rule.Id);
    setShowModal(true);
  };

  const handleSave = async () => {
    const threshold = parseFloat(form.ThresholdAmount);
    const bonus = parseFloat(form.BonusAmount);
    if (!threshold || threshold <= 0) {
      showToast({ type: "error", message: "Validation Error", subtitle: "Threshold Amount must be greater than 0." });
      return;
    }
    if (!bonus || bonus <= 0) {
      showToast({ type: "error", message: "Validation Error", subtitle: "Bonus Amount must be greater than 0." });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        thresholdAmount: threshold,
        bonusAmount: bonus,
        isRepeating: form.IsRepeating,
        isActive: form.IsActive,
        artistDishId: form.ArtistDishId || null,
        artistType: form.ArtistType || null,
      };

      if (editingId) {
        await axios.put(`${API_URL}/api/artist-bonus/master/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        showToast({ type: "success", message: "Rule Saved", subtitle: "Bonus rule saved successfully." });
      } else {
        await axios.post(`${API_URL}/api/artist-bonus/master`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        showToast({ type: "success", message: "Rule Created", subtitle: "New bonus rule created successfully." });
      }

      setShowModal(false);
      fetchRules();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      showToast({ type: "error", message: "Save Failed", subtitle: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (rule: BonusRule) => {
    const title = rule.IsActive ? "Deactivate Rule" : "Activate Rule";
    const msg = rule.IsActive
      ? "This will deactivate the bonus rule. Artists will no longer earn bonuses until a new rule is created."
      : "Activate this rule? It will become the new global bonus rule.";

    const executeChange = async () => {
      try {
        if (rule.IsActive) {
          await axios.delete(`${API_URL}/api/artist-bonus/master/${rule.Id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } else {
          await axios.put(
            `${API_URL}/api/artist-bonus/master/${rule.Id}`,
            {
              thresholdAmount: rule.ThresholdAmount,
              bonusAmount: rule.BonusAmount,
              isRepeating: rule.IsRepeating,
              isActive: true,
              artistDishId: rule.ArtistDishId,
              artistType: rule.ArtistType,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
        showToast({ type: "success", message: "Done", subtitle: "Rule status updated." });
        fetchRules();
      } catch (err: any) {
        const errorMsg = err?.response?.data?.error || err.message;
        showToast({ type: "error", message: "Failed", subtitle: errorMsg });
      }
    };

    setConfirmConfig({
      title,
      message: msg,
      onConfirm: executeChange,
      confirmText: rule.IsActive ? "Deactivate" : "Activate",
      isDestructive: rule.IsActive,
    });
    setShowConfirmModal(true);
  };

  const previewRows = (threshold: number, bonus: number, isRepeating: boolean) => {
    if (!threshold || !bonus || threshold <= 0 || bonus <= 0) return [];
    const rows = [];
    for (let tier = 1; tier <= 4; tier++) {
      const sales = threshold * tier;
      const earned = isRepeating ? bonus * tier : bonus;
      rows.push({ sales, earned });
    }
    return rows;
  };

  const globalActive = rules.find(r => r.IsActive && !r.ArtistDishId);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/menu/artist-management");
            }
          }} 
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bonus Rule Master</Text>
          <Text style={styles.headerSub}>Setup rules & milestones</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>New Rule</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="large" color={Theme.primary} style={{ marginTop: 20 }} />}

        {rules.map((rule) => {
          const previews = previewRows(rule.ThresholdAmount, rule.BonusAmount, rule.IsRepeating);
          return (
            <View key={rule.Id} style={[styles.ruleCard, !rule.IsActive && styles.ruleCardInactive]}>
              <View style={styles.ruleCardHeader}>
                <View style={styles.ruleTypeTag}>
                  <Text style={styles.ruleTypeText}>
                    {rule.ArtistDishId ? `Custom Override: ${rule.ArtistDishName}` : "Global Rule"}
                  </Text>
                </View>
                <View style={[styles.ruleStatusBadge, rule.IsActive ? styles.activeTag : styles.inactiveTag]}>
                  <Text style={[styles.ruleStatusText, rule.IsActive ? styles.activeTagText : styles.inactiveTagText]}>
                    {rule.IsActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>

              {/* Arrow-based visual logic flow */}
              <View style={styles.ruleFlowCard}>
                <Text style={styles.flowHeading}>Bonus Rule</Text>
                <View style={styles.flowBody}>
                  <View style={styles.flowItem}>
                    <Text style={styles.flowLabel}>Every</Text>
                    <Text style={styles.flowVal}>${rule.ThresholdAmount}</Text>
                    <Text style={styles.flowSub}>Sales</Text>
                  </View>
                  <Ionicons name="arrow-down" size={20} color="#2563EB" style={styles.flowArrow} />
                  <View style={styles.flowItem}>
                    <Text style={styles.flowLabel}>Earn</Text>
                    <Text style={[styles.flowVal, { color: "#16A34A" }]}>${rule.BonusAmount}</Text>
                    <Text style={styles.flowSub}>Bonus</Text>
                  </View>
                </View>
                <Text style={styles.flowRepeatText}>
                  {rule.IsRepeating ? "⚙️ Repeats Every Time" : "⚙️ One-time Payout"}
                </Text>
              </View>

              {/* Milestone list */}
              {previews.length > 0 && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewTitle}>Milestone Matrix</Text>
                  {previews.map((row, i) => (
                    <View key={i} style={styles.previewRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.milestoneIcon}>📈</Text>
                        <Text style={styles.previewVal}>Sales: <Text style={{ fontFamily: Fonts.bold }}>${row.sales}</Text></Text>
                      </View>
                      <Text style={styles.previewEarned}>➔ Earned: <Text style={{ color: "#16A34A", fontFamily: Fonts.black }}>+${row.earned}</Text></Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={styles.ruleActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(rule)}>
                  <Ionicons name="pencil" size={15} color="#3B82F6" />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deactivateBtn, !rule.IsActive && styles.activateBtn]}
                  onPress={() => handleDeactivate(rule)}
                >
                  <Ionicons
                    name={rule.IsActive ? "close-circle" : "checkmark-circle"}
                    size={15}
                    color={rule.IsActive ? "#DC2626" : "#16A34A"}
                  />
                  <Text style={[styles.deactivateBtnText, !rule.IsActive && styles.activateBtnText]}>
                    {rule.IsActive ? "Deactivate" : "Activate"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {rules.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Ionicons name="settings-outline" size={48} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No Rules Setup</Text>
            <Text style={styles.emptySubtitle}>Configure rules to track payouts.</Text>
            <TouchableOpacity style={styles.createFirstBtn} onPress={openCreate}>
              <Text style={styles.createFirstBtnText}>Create Rule</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, isTablet && { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? "Edit Bonus Rule" : "Create Bonus Rule"}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Threshold Amount ($)</Text>
              <TextInput
                style={styles.input}
                value={form.ThresholdAmount}
                onChangeText={v => setForm(f => ({ ...f, ThresholdAmount: v }))}
                keyboardType="decimal-pad"
                placeholder="e.g. 500"
                placeholderTextColor={Theme.textMuted}
              />

              <Text style={styles.fieldLabel}>Bonus Amount ($)</Text>
              <TextInput
                style={styles.input}
                value={form.BonusAmount}
                onChangeText={v => setForm(f => ({ ...f, BonusAmount: v }))}
                keyboardType="decimal-pad"
                placeholder="e.g. 50"
                placeholderTextColor={Theme.textMuted}
              />

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Repeating Milestone</Text>
                  <Text style={styles.fieldHint}>
                    {form.IsRepeating ? "Repeats every time threshold is crossed" : "One-time payout limit"}
                  </Text>
                </View>
                <Switch
                  value={form.IsRepeating}
                  onValueChange={v => setForm(f => ({ ...f, IsRepeating: v }))}
                  trackColor={{ false: Theme.border, true: Theme.primaryBorder }}
                  thumbColor={form.IsRepeating ? Theme.primary : "#f4f3f4"}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Rule</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Confirmation Modal */}
      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => setShowConfirmModal(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.alertCard}>
            <View style={[styles.alertIconBg, confirmConfig?.isDestructive && { backgroundColor: "rgba(220,38,38,0.15)" }]}>
              <Ionicons
                name={confirmConfig?.isDestructive ? "close-circle" : "checkmark-circle"}
                size={36}
                color={confirmConfig?.isDestructive ? "#DC2626" : "#16A34A"}
              />
            </View>
            <Text style={styles.alertTitle}>{confirmConfig?.title}</Text>
            <Text style={styles.alertMessage}>{confirmConfig?.message}</Text>

            <View style={styles.alertActions}>
              <TouchableOpacity
                style={[styles.alertBtn, styles.cancelBtn]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.btnLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.alertBtn,
                  confirmConfig?.isDestructive ? styles.confirmDeleteBtn : { backgroundColor: "#16A34A" },
                ]}
                onPress={() => {
                  setShowConfirmModal(false);
                  confirmConfig?.onConfirm();
                }}
              >
                <Text style={[styles.btnLabel, { color: "#FFF" }]}>
                  {confirmConfig?.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: Theme.bgCard,
    borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: Fonts.black, fontSize: 17, color: Theme.textPrimary },
  headerSub: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary, marginTop: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { fontFamily: Fonts.bold, fontSize: 12, color: "#fff" },
  scroll: { padding: 16, paddingBottom: 40 },

  ruleCard: {
    backgroundColor: Theme.bgCard, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: Theme.border,
    ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(0,0,0,0.05)" } }) as any,
  },
  ruleCardInactive: { opacity: 0.6 },
  ruleCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  ruleTypeTag: { backgroundColor: Theme.bgMuted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  ruleTypeText: { fontFamily: Fonts.black, fontSize: 10, color: Theme.textSecondary },
  ruleStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activeTag: { backgroundColor: "rgba(22,163,74,0.12)" },
  inactiveTag: { backgroundColor: Theme.bgMuted },
  ruleStatusText: { fontFamily: Fonts.bold, fontSize: 11 },
  activeTagText: { color: "#16A34A" },
  inactiveTagText: { color: Theme.textSecondary },

  // Flow Card
  ruleFlowCard: { backgroundColor: Theme.bgMuted, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Theme.border, alignItems: "center", marginBottom: 12 },
  flowHeading: { fontFamily: Fonts.black, fontSize: 11, color: Theme.primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  flowBody: { alignItems: "center", gap: 6, width: "100%" },
  flowItem: { alignItems: "center", minWidth: 100 },
  flowLabel: { fontFamily: Fonts.medium, fontSize: 9, color: Theme.textSecondary, textTransform: "uppercase" },
  flowVal: { fontFamily: Fonts.black, fontSize: 22, color: Theme.textPrimary, marginVertical: 2 },
  flowSub: { fontFamily: Fonts.bold, fontSize: 10, color: Theme.textMuted },
  flowArrow: { marginVertical: 4 },
  flowRepeatText: { fontFamily: Fonts.bold, fontSize: 11, color: Theme.primary, marginTop: 10 },

  // Preview Box
  previewBox: { backgroundColor: Theme.bgMuted, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Theme.border, marginBottom: 14 },
  previewTitle: { fontFamily: Fonts.bold, fontSize: 11, color: Theme.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  previewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Theme.border },
  milestoneIcon: { marginRight: 4 },
  previewVal: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textPrimary },
  previewEarned: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textPrimary },

  ruleActions: { flexDirection: "row", gap: 10 },
  editBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: Theme.primaryLight, borderWidth: 1, borderColor: Theme.primaryBorder },
  editBtnText: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.primary },
  deactivateBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: "rgba(220,38,38,0.08)", borderWidth: 1, borderColor: "rgba(220,38,38,0.2)" },
  deactivateBtnText: { fontFamily: Fonts.bold, fontSize: 13, color: "#DC2626" },
  activateBtn: { backgroundColor: "rgba(22,163,74,0.08)", borderColor: "rgba(22,163,74,0.2)" },
  activateBtnText: { color: "#16A34A" },

  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontFamily: Fonts.black, fontSize: 16, color: Theme.textPrimary },
  emptySubtitle: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textSecondary, marginTop: 4, textAlign: "center" },
  createFirstBtn: { marginTop: 16, backgroundColor: Theme.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  createFirstBtnText: { fontFamily: Fonts.bold, fontSize: 13, color: "#fff" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: Theme.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.black, fontSize: 18, color: Theme.textPrimary, flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  fieldLabel: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary, marginBottom: 6, marginTop: 12 },
  fieldHint: { fontFamily: Fonts.regular, fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
  input: { backgroundColor: Theme.bgInput, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Fonts.medium, fontSize: 15, color: Theme.textPrimary, borderWidth: 1, borderColor: Theme.border },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Theme.bgMuted, borderRadius: 12, padding: 14, marginTop: 16 },
  modalFooter: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Theme.bgMuted, alignItems: "center" },
  cancelBtnText: { fontFamily: Fonts.bold, fontSize: 15, color: Theme.textSecondary },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Theme.primary, alignItems: "center" },
  saveBtnText: { fontFamily: Fonts.bold, fontSize: 15, color: "#fff" },

  // Alert Dialog Styles
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  alertCard: { width: "90%", maxWidth: 360, backgroundColor: Theme.bgCard, borderRadius: 24, padding: 30, alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  alertIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(22,163,74,0.15)", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  alertTitle: { fontSize: 20, fontFamily: Fonts.black, color: Theme.textPrimary, marginBottom: 10 },
  alertMessage: { fontSize: 14, fontFamily: Fonts.medium, color: Theme.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 25 },
  alertActions: { flexDirection: "row", gap: 12, width: "100%" },
  alertBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  confirmDeleteBtn: { backgroundColor: Theme.danger },
  btnLabel: { fontSize: 14, fontFamily: Fonts.bold, color: Theme.textPrimary },
});
