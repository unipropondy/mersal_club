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
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatToSingaporeTime, formatToSingaporeDateTime } from "../../utils/timezoneHelper";

import * as Print from "expo-print";

const pad = (n: number) => n.toString().padStart(2, "0");
const fmtDate = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

interface Transaction {
  Id: string;
  ArtistDishId: string;
  ArtistName: string;
  SalesFromDate: string;
  SalesToDate: string;
  TotalSales: number;
  BonusEarned: number;
  BonusPaid: number;
  pendingBonus: number;
  status: string;
  CreatedDate: string;
}

export default function ArtistBonusPaymentsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading]       = useState(false);
  const [transactions, setTxns]     = useState<Transaction[]>([]);
  const [selectedTxns, setSelectedTxns] = useState<Record<string, boolean>>({});
  const [settledToday, setSettledToday] = useState<any[]>([]);

  // Payout modals
  const [showPayModal, setShowPayModal] = useState(false);
  const [singleTxn, setSingleTxn]       = useState<Transaction | null>(null);
  const [payAmount, setPayAmount]       = useState("");
  const [payMethod, setPayMethod]       = useState("Cash");
  const [payRemarks, setPayRemarks]     = useState("");
  const [paying, setPaying]             = useState(false);

  // Receipt Modal
  const [showReceipt, setShowReceipt]   = useState(false);
  const [receiptData, setReceiptData]   = useState<any>(null);

  const fetchPending = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/artist-bonus/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        setTxns(res.data.data);
        // Clear selections
        setSelectedTxns({});
      }
    } catch (err: any) {
      showToast({ type: "error", message: "Load Failed", subtitle: err.message });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const toggleSelect = (id: string) => {
    setSelectedTxns(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelectAll = () => {
    const activeWaiting = transactions.filter(t => t.status === "Pending" || t.status === "Partially Paid");
    const allSelected = activeWaiting.every(t => selectedTxns[t.Id]);
    
    const next: Record<string, boolean> = {};
    if (!allSelected) {
      activeWaiting.forEach(t => { next[t.Id] = true; });
    }
    setSelectedTxns(next);
  };

  const getSelectedCount = () => Object.values(selectedTxns).filter(Boolean).length;
  const getSelectedTotal = () => {
    return transactions
      .filter(t => selectedTxns[t.Id])
      .reduce((s, t) => s + Number(t.pendingBonus), 0);
  };

  const openSettleModal = (txn: Transaction) => {
    setSingleTxn(txn);
    setPayAmount(txn.pendingBonus.toFixed(2));
    setPayMethod("Cash");
    setPayRemarks("");
    setShowPayModal(true);
  };

  const handleBatchPay = async () => {
    const activeList = transactions.filter(t => selectedTxns[t.Id]);
    if (activeList.length === 0) return;

    try {
      setPaying(true);
      let batchTotal = 0;
      const settledNames: string[] = [];

      for (const t of activeList) {
        await axios.post(
          `${API_URL}/api/artist-bonus/pay`,
          {
            transactionId: t.Id,
            paymentAmount: Number(t.pendingBonus.toFixed(2)),
            remarks: `Batch Settle via Payments Portal (${payMethod})`,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        batchTotal += t.pendingBonus;
        settledNames.push(t.ArtistName);
        
        // Track local settled session history
        setSettledToday(prev => [
          { artistName: t.ArtistName, amount: t.pendingBonus, date: formatToSingaporeTime(new Date()), method: payMethod },
          ...prev
        ]);
      }

      showToast({
        type: "success",
        message: "Batch Settled",
        subtitle: `Paid $${batchTotal.toFixed(2)} to ${activeList.length} artists.`,
      });

      // Show final receipt summary
      setReceiptData({
        artistName: settledNames.join(", "),
        amount: batchTotal,
        date: formatToSingaporeDateTime(new Date()),
        method: payMethod,
        refNo: `BATCH-${Date.now().toString().slice(-6)}`,
      });
      setShowReceipt(true);
      fetchPending();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      showToast({ type: "error", message: "Batch Payment Failed", subtitle: msg });
    } finally {
      setPaying(false);
    }
  };

  const handleSinglePay = async () => {
    if (!singleTxn) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0 || amt > singleTxn.pendingBonus) {
      showToast({ type: "error", message: "Validation", subtitle: "Please enter a valid payout amount." });
      return;
    }

    try {
      setPaying(true);
      const res = await axios.post(
        `${API_URL}/api/artist-bonus/pay`,
        {
          transactionId: singleTxn.Id,
          paymentAmount: amt,
          remarks: payRemarks || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        showToast({
          type: "success",
          message: "Payment Recorded",
          subtitle: `$${amt.toFixed(2)} paid to ${singleTxn.ArtistName}.`,
        });

        setSettledToday(prev => [
          { artistName: singleTxn.ArtistName, amount: amt, date: formatToSingaporeTime(new Date()), method: payMethod },
          ...prev
        ]);

        setReceiptData({
          artistName: singleTxn.ArtistName,
          amount: amt,
          date: formatToSingaporeDateTime(new Date()),
          method: payMethod,
          refNo: res.data.paymentId ? res.data.paymentId.slice(-8).toUpperCase() : `TX-${Date.now().toString().slice(-6)}`,
        });
        
        setShowPayModal(false);
        setShowReceipt(true);
        fetchPending();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      showToast({ type: "error", message: "Payment Failed", subtitle: msg });
    } finally {
      setPaying(false);
    }
  };

  const printReceipt = async () => {
    if (!receiptData) return;
    const html = `
      <html>
      <head>
        <style>
          @page { size: auto; margin: 0mm; }
          body { font-family: monospace; padding: 20px; width: 280px; margin: 0; }
        </style>
      </head>
      <body>
        <h3 style="text-align: center; margin-top: 10px;">ARTIST BONUS RECEIPT</h3>
        <hr/>
        <p><b>Date:</b> ${receiptData.date}</p>
        <p><b>Ref:</b> ${receiptData.refNo}</p>
        <p><b>Artist:</b> ${receiptData.artistName}</p>
        <p><b>Method:</b> ${receiptData.method}</p>
        <hr/>
        <h2 style="text-align: center;">TOTAL: $${receiptData.amount.toFixed(2)}</h2>
        <hr/>
        <p style="text-align: center; font-size: 10px; margin-bottom: 10px;">Thank you for your performance!</p>
      </body>
      </html>
    `;
    try {
      await Print.printAsync({ html });
    } catch (_) {
      showToast({ type: "error", message: "Print Failed", subtitle: "Receipt could not be sent to printer." });
    }
  };

  // Groups
  const waitingList = transactions.filter(t => t.status === "Pending");
  const partialList = transactions.filter(t => t.status === "Partially Paid");
  const totalWaitingAmount = transactions.reduce((s, t) => s + Number(t.pendingBonus), 0);

  const selectedCount = getSelectedCount();
  const selectedTotal = getSelectedTotal();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={Theme.bgMain} />

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
          <Text style={styles.headerTitle}>Bonus Wallets</Text>
          <Text style={styles.headerSub}>{transactions.length} outstanding periods</Text>
        </View>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryMeta}>
            <View style={styles.sumBadge}>
              <Ionicons name="wallet" size={20} color="#DC2626" />
            </View>
            <View>
              <Text style={styles.sumLabel}>Total Wallet Dues</Text>
              <Text style={styles.sumValue}>${totalWaitingAmount.toFixed(2)}</Text>
            </View>
          </View>
          {transactions.length > 0 && (
            <TouchableOpacity style={styles.payAllBtn} onPress={toggleSelectAll}>
              <Text style={styles.payAllText}>
                {selectedCount === transactions.length ? "Deselect All" : "Select All"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="large" color={Theme.primary} style={{ marginTop: 20 }} />}

        {/* ── BATCH ACTION FOOTER ── */}
        {selectedCount > 0 && (
          <View style={styles.batchCard}>
            <View>
              <Text style={styles.batchTitle}>{selectedCount} Wallets Selected</Text>
              <Text style={styles.batchSub}>Total: <Text style={{ fontFamily: Fonts.black }}>${selectedTotal.toFixed(2)}</Text></Text>
            </View>
            <TouchableOpacity style={styles.batchPayBtn} onPress={handleBatchPay}>
              <Ionicons name="cash" size={16} color="#fff" />
              <Text style={styles.batchPayText}>Pay Selected</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── WAITING LIST ── */}
        {waitingList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>🔴 Due Payment ({waitingList.length})</Text>
            {waitingList.map((t) => (
              <View key={t.Id} style={styles.walletCard}>
                <TouchableOpacity style={styles.checkWrap} onPress={() => toggleSelect(t.Id)}>
                  <Ionicons 
                    name={selectedTxns[t.Id] ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={selectedTxns[t.Id] ? "#DC2626" : Theme.textMuted} 
                  />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.artistNameText}>{t.ArtistName}</Text>
                  <Text style={styles.periodText}>{fmtDate(t.SalesFromDate)} ➔ {fmtDate(t.SalesToDate)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", marginRight: 8 }}>
                  <Text style={styles.dueLabel}>Bonus Due</Text>
                  <Text style={styles.dueAmount}>${t.pendingBonus.toFixed(0)}</Text>
                </View>
                <TouchableOpacity style={styles.payBtn} onPress={() => openSettleModal(t)}>
                  <Text style={styles.payBtnText}>Pay</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── PARTIAL LIST ── */}
        {partialList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>🟠 Partial Payment ({partialList.length})</Text>
            {partialList.map((t) => (
              <View key={t.Id} style={styles.walletCard}>
                <TouchableOpacity style={styles.checkWrap} onPress={() => toggleSelect(t.Id)}>
                  <Ionicons 
                    name={selectedTxns[t.Id] ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={selectedTxns[t.Id] ? "#DC2626" : Theme.textMuted} 
                  />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.artistNameText}>{t.ArtistName}</Text>
                  <Text style={styles.periodText}>Earned: ${t.BonusEarned.toFixed(0)} · Paid: ${t.BonusPaid.toFixed(0)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", marginRight: 8 }}>
                  <Text style={styles.dueLabel}>Bonus Due</Text>
                  <Text style={[styles.dueAmount, { color: "#A855F7" }]}>${t.pendingBonus.toFixed(0)}</Text>
                </View>
                <TouchableOpacity style={[styles.payBtn, { backgroundColor: "#A855F7" }]} onPress={() => openSettleModal(t)}>
                  <Text style={styles.payBtnText}>Pay</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── SETTLED TODAY ── */}
        {settledToday.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>🟢 Settled Today ({settledToday.length})</Text>
            {settledToday.map((t, idx) => (
              <View key={idx} style={[styles.walletCard, { opacity: 0.8 }]}>
                <Ionicons name="checkmark-circle" size={22} color="#16A34A" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.artistNameText}>{t.artistName}</Text>
                  <Text style={styles.periodText}>Settled at {t.date} · via {t.method}</Text>
                </View>
                <Text style={[styles.dueAmount, { color: "#16A34A" }]}>${t.amount.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}

        {transactions.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={56} color="#16A34A" />
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptySubtitle}>No artists have due payments. Everyone has been settled.</Text>
          </View>
        )}
      </ScrollView>

      {/* Pay Modal */}
      <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Settle Wallet Payout</Text>
                <Text style={styles.modalSubtitle}>{singleTxn?.ArtistName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPayModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {singleTxn && (
              <View style={styles.modalSummary}>
                <View style={styles.modalSumRow}>
                  <Text style={styles.modalSumLabel}>Earned Period</Text>
                  <Text style={styles.modalSumVal}>${singleTxn.BonusEarned}</Text>
                </View>
                <View style={styles.modalSumRow}>
                  <Text style={styles.modalSumLabel}>Already Paid</Text>
                  <Text style={styles.modalSumVal}>${singleTxn.BonusPaid}</Text>
                </View>
                <View style={styles.sumDivider} />
                <View style={styles.modalSumRow}>
                  <Text style={[styles.modalSumLabel, { fontFamily: Fonts.black }]}>Remaining Balance</Text>
                  <Text style={[styles.modalSumVal, { color: "#DC2626", fontSize: 16 }]}>${singleTxn.pendingBonus}</Text>
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>Choose Payout Amount</Text>
            <TextInput
              style={styles.input}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor={Theme.textMuted}
            />
            <View style={styles.quickAmtRow}>
              <TouchableOpacity style={styles.quickAmtBtn} onPress={() => setPayAmount(String(singleTxn?.pendingBonus || 0))}>
                <Text style={styles.quickAmtText}>Full Payout</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAmtBtn} onPress={() => setPayAmount(String((singleTxn?.pendingBonus || 0) / 2))}>
                <Text style={styles.quickAmtText}>Half Payout</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Payment Method</Text>
            <View style={styles.methodRow}>
              {["Cash", "Card", "Transfer"].map(m => (
                <TouchableOpacity 
                  key={m} 
                  style={[styles.methodBtn, payMethod === m && styles.methodBtnActive]}
                  onPress={() => setPayMethod(m)}
                >
                  <Text style={[styles.methodText, payMethod === m && styles.methodTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Remarks</Text>
            <TextInput
              style={[styles.input, { height: 60 }]}
              value={payRemarks}
              onChangeText={setPayRemarks}
              placeholder="e.g. Settle shift bonus"
              placeholderTextColor={Theme.textMuted}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPayModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, paying && { opacity: 0.6 }]} onPress={handleSinglePay} disabled={paying}>
                {paying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmBtnText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt Modal */}
      <Modal visible={showReceipt} transparent animationType="fade" onRequestClose={() => setShowReceipt(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.receiptBox}>
            <View style={styles.receiptHeader}>
              <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
              <Text style={styles.receiptTitle}>Bonus Paid</Text>
              <Text style={styles.receiptAmt}>${receiptData?.amount.toFixed(2)}</Text>
            </View>
            <View style={styles.receiptBody}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Artist</Text>
                <Text style={styles.receiptVal}>{receiptData?.artistName}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Method</Text>
                <Text style={styles.receiptVal}>{receiptData?.method}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Date</Text>
                <Text style={styles.receiptVal}>{receiptData?.date}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Reference No</Text>
                <Text style={styles.receiptVal}>{receiptData?.refNo}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.printReceiptBtn} onPress={printReceipt}>
              <Ionicons name="print" size={16} color="#fff" />
              <Text style={styles.printReceiptText}>Print Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.receiptDoneBtn} onPress={() => setShowReceipt(false)}>
              <Text style={styles.receiptDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Theme.bgNav, borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: Fonts.black, fontSize: 17, color: Theme.textPrimary },
  headerSub: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary },

  // Summary Bar
  summaryBar: { padding: 16, backgroundColor: Theme.bgCard, borderBottomWidth: 1, borderBottomColor: Theme.border },
  summaryCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryMeta: { flexDirection: "row", gap: 10, alignItems: "center" },
  sumBadge: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.15)", justifyContent: "center", alignItems: "center" },
  sumLabel: { fontFamily: Fonts.medium, fontSize: 10, color: Theme.textSecondary, textTransform: "uppercase" },
  sumValue: { fontFamily: Fonts.black, fontSize: 18, color: "#DC2626", marginTop: 2 },
  payAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Theme.border, backgroundColor: Theme.bgMuted },
  payAllText: { fontFamily: Fonts.bold, fontSize: 12, color: Theme.textSecondary },

  scroll: { padding: 16, paddingBottom: 60 },

  // Batch Card
  batchCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1.5, borderColor: "rgba(239,68,68,0.30)", padding: 12, borderRadius: 12, marginBottom: 16 },
  batchTitle: { fontFamily: Fonts.black, fontSize: 13, color: "#DC2626" },
  batchSub: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary, marginTop: 2 },
  batchPayBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#DC2626", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  batchPayText: { fontFamily: Fonts.bold, fontSize: 13, color: "#fff" },

  section: { marginBottom: 20 },
  sectionHeader: { fontFamily: Fonts.black, fontSize: 12, color: Theme.textSecondary, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  walletCard: { flexDirection: "row", alignItems: "center", backgroundColor: Theme.bgCard, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Theme.border },
  checkWrap: { marginRight: 10 },
  artistNameText: { fontFamily: Fonts.black, fontSize: 13, color: Theme.textPrimary },
  periodText: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary, marginTop: 2 },
  dueLabel: { fontFamily: Fonts.medium, fontSize: 9, color: Theme.textMuted, textTransform: "uppercase" },
  dueAmount: { fontFamily: Fonts.black, fontSize: 15, color: "#DC2626", marginTop: 2 },
  payBtn: { backgroundColor: "#DC2626", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  payBtnText: { fontFamily: Fonts.bold, fontSize: 12, color: "#fff" },

  emptyState: { alignItems: "center", paddingVertical: 80, gap: 10 },
  emptyTitle: { fontFamily: Fonts.black, fontSize: 18, color: Theme.textPrimary },
  emptySubtitle: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textSecondary, textAlign: "center" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: Theme.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontFamily: Fonts.black, fontSize: 18, color: Theme.textPrimary },
  modalSubtitle: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary, marginTop: 2, opacity: 0.8 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  modalSummary: { backgroundColor: Theme.bgMuted, padding: 12, borderRadius: 12, marginBottom: 16 },
  modalSumRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 4 },
  modalSumLabel: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textPrimary, opacity: 0.8 },
  modalSumVal: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary },
  sumDivider: { height: 1, backgroundColor: Theme.border, marginVertical: 6 },
  fieldLabel: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary, marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: Theme.bgInput, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Theme.border, color: Theme.textPrimary },
  quickAmtRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  quickAmtBtn: { flex: 1, backgroundColor: Theme.bgMuted, padding: 8, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  quickAmtText: { fontFamily: Fonts.bold, fontSize: 11, color: Theme.textPrimary },
  methodRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  methodBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Theme.border, alignItems: "center", backgroundColor: Theme.bgMuted },
  methodBtnActive: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  methodText: { fontFamily: Fonts.bold, fontSize: 12, color: Theme.textPrimary },
  methodTextActive: { color: "#fff" },
  modalFooter: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Theme.bgMuted, alignItems: "center" },
  cancelBtnText: { fontFamily: Fonts.bold, fontSize: 14, color: Theme.textPrimary },
  confirmBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: "#16A34A", alignItems: "center" },
  confirmBtnText: { fontFamily: Fonts.bold, fontSize: 14, color: "#fff" },

  // Receipt
  receiptBox: { backgroundColor: Theme.bgCard, borderRadius: 20, padding: 24, width: "85%", maxWidth: 360, alignSelf: "center", alignItems: "center" },
  receiptHeader: { alignItems: "center", marginBottom: 16 },
  receiptTitle: { fontFamily: Fonts.black, fontSize: 18, color: Theme.textPrimary, marginTop: 10 },
  receiptAmt: { fontFamily: Fonts.black, fontSize: 26, color: "#16A34A", marginTop: 4 },
  receiptBody: { width: "100%", borderTopWidth: 1, borderTopColor: Theme.border, borderBottomWidth: 1, borderBottomColor: Theme.border, paddingVertical: 12, marginVertical: 12, gap: 8 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between" },
  receiptLabel: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary },
  receiptVal: { fontFamily: Fonts.bold, fontSize: 12, color: Theme.textPrimary },
  printReceiptBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Theme.primary, width: "100%", padding: 12, borderRadius: 10, justifyContent: "center", marginBottom: 8 },
  printReceiptText: { fontFamily: Fonts.bold, fontSize: 13, color: "#fff" },
  receiptDoneBtn: { width: "100%", padding: 12, borderRadius: 10, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border, backgroundColor: Theme.bgMuted },
  receiptDoneText: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textSecondary },
});
