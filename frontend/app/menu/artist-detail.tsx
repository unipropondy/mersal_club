import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "../../components/Toast";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
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
import { formatToSingaporeDateTime } from "@/utils/timezoneHelper";
import { artistDateState } from "@/stores/artistDateStore";

import * as Print from "expo-print";

const pad = (n: number) => n.toString().padStart(2, "0");
const fmtDate = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const WALLET_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  Paid:             { bg: "#DCFCE7", text: "#16A34A", label: "🟢 Settled" },
  "Partially Paid": { bg: "#FFF7ED", text: "#A855F7", label: "🟠 Partial Payment" },
  Pending:          { bg: "#FEE2E2", text: "#DC2626", label: "🟡 Due Payment" },
  "No Bonus":      { bg: "#F5F5F4", text: "#78716C", label: "⚪ Wallet Empty" },
};

export default function ArtistDetailScreen() {
  const { dishId } = useLocalSearchParams<{ dishId: string }>();
  const router     = useRouter();
  const { token }  = useAuthStore();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  const [loading, setLoading]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [artist, setArtist]           = useState<{ dishId: string; name: string } | null>(null);
  const [summary, setSummary]         = useState({
    totalSales: 0,
    bonusEarned: 0,
    bonusPaid: 0,
    pendingBonus: 0,
    periodSales: 0,
    periodEarned: 0,
    periodPaid: 0,
    periodPending: 0,
    lifetimeEarned: 0,
    lifetimePaid: 0,
    lifetimePending: 0,
  });
  const [activeRule, setActiveRule]   = useState<any>(null);
  const [progress, setProgress]       = useState<any>(null);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [bonusHistory, setBonusHistory] = useState<any[]>([]);
  const [payHistory, setPayHistory]   = useState<any[]>([]);

  // Expandable dropdowns
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Pay modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount]       = useState("");
  const [payMethod, setPayMethod]       = useState("Cash");
  const [payRemarks, setPayRemarks]     = useState("");
  const [paying, setPaying]             = useState(false);
  
  // Receipt
  const [showReceipt, setShowReceipt]   = useState(false);
  const [receiptData, setReceiptData]   = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!dishId) return;
    try {
      setLoading(true);
      const params = artistDateState.fromDate && artistDateState.toDate
        ? `?fromDate=${artistDateState.fromDate}&toDate=${artistDateState.toDate}`
        : "";
      const res = await axios.get(
        `${API_URL}/api/artist-bonus/artist/${dishId}${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setArtist(res.data.artist);
        setSummary(res.data.summary);
        setActiveRule(res.data.activeRule);
        setProgress(res.data.progressToNext);
        setSalesHistory(res.data.salesHistory || []);
        setBonusHistory(res.data.bonusHistory || []);
        setPayHistory(res.data.paymentHistory || []);
      }
    } catch (err: any) {
      showToast({ type: "error", message: "Load Failed", subtitle: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dishId, token]);

  useEffect(() => { fetchData(); }, [dishId, token]);

  const totalOutstanding = summary.lifetimePending ?? summary.pendingBonus;

  let walletStatus = "No Bonus";
  if (totalOutstanding > 0) {
    walletStatus = summary.lifetimePaid > 0 ? "Partially Paid" : "Pending";
  } else if (summary.lifetimePaid > 0) {
    walletStatus = "Paid";
  }
  const sc = WALLET_STATUS_COLORS[walletStatus] || WALLET_STATUS_COLORS["No Bonus"];

  // Unified Chronological Timeline Construction
  const timelineEvents: any[] = [];
  
  salesHistory.forEach(s => {
    timelineEvents.push({
      type: "sales",
      date: new Date(s.SaleDate),
      title: "Recorded Sales",
      icon: "bar-chart",
      color: "#2563EB",
      amount: s.Amount,
      desc: `Bill ${s.BillNo || "Cashbox"} · ${s.ItemName || "Event sales"}`
    });
  });

  bonusHistory.forEach(b => {
    timelineEvents.push({
      type: "bonus",
      date: new Date(b.SalesToDate),
      title: "Bonus Earned",
      icon: "trophy",
      color: "#A855F7",
      amount: b.BonusEarned,
      desc: `Threshold met during business cycle`
    });
  });

  payHistory.forEach(p => {
    timelineEvents.push({
      type: "payment",
      date: new Date(p.PaidDate),
      title: "Payout Disbursed",
      icon: "cash",
      color: "#16A34A",
      amount: p.PaymentAmount,
      desc: `Paid by ${p.PaidBy} · Method: ${p.Remarks || "Cash"}`
    });
  });

  const sortedTimeline = timelineEvents.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 15);

  const openPayModal = () => {
    if (totalOutstanding <= 0) {
      showToast({ type: "error", message: "No Bonus Due", subtitle: "Wallet has no pending balances." });
      return;
    }
    setPayAmount(totalOutstanding.toFixed(2));
    setPayRemarks("");
    setPayMethod("Cash");
    setShowPayModal(true);
  };

  const handlePay = async () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0 || amt > totalOutstanding) {
      showToast({ type: "error", message: "Validation", subtitle: "Please enter a valid payout amount." });
      return;
    }

    const pendingTxns = bonusHistory.filter(r => (Number(r.BonusEarned) - Number(r.BonusPaid)) > 0);
    const txnsToSettle = [...pendingTxns].reverse(); // oldest first
    let remaining = amt;

    try {
      setPaying(true);
      for (const txn of txnsToSettle) {
        if (remaining <= 0) break;
        const txnPending = Number(txn.BonusEarned) - Number(txn.BonusPaid);
        const payForThisTxn = Math.min(remaining, txnPending);
        await axios.post(
          `${API_URL}/api/artist-bonus/pay`,
          {
            transactionId: txn.Id,
            paymentAmount: parseFloat(payForThisTxn.toFixed(2)),
            remarks: `${payRemarks || "Direct Wallet Payout"} (${payMethod})`,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        remaining -= payForThisTxn;
      }

      showToast({
        type: "success",
        message: "Payout Confirmed",
        subtitle: `$${amt.toFixed(2)} wallet payout logged.`,
      });

      setReceiptData({
        artistName: artist?.name || "Artist",
        amount: amt,
        date: formatToSingaporeDateTime(new Date()),
        method: payMethod,
        refNo: `WLT-${Date.now().toString().slice(-6)}`,
      });

      setShowPayModal(false);
      setShowReceipt(true);
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      showToast({ type: "error", message: "Payment Failed", subtitle: msg });
    } finally {
      setPaying(false);
    }
  };

  const toggleSection = (sec: string) => {
    setExpandedSection(expandedSection === sec ? null : sec);
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgMain} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/menu/artist-management");
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{artist?.name || "Artist Wallet"}</Text>
          <Text style={styles.headerSub}>Wallet Profile Details</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={Theme.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} colors={[Theme.primary]} tintColor={Theme.primary} />}
        >
          {/* ── HERO HEADER ── */}
          <View style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{(artist?.name || "?")[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroName}>{artist?.name}</Text>
                <View style={[styles.badge, { backgroundColor: sc.bg, alignSelf: "flex-start", marginTop: 4 }]}>
                  <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.heroWalletLabel}>Current Wallet</Text>
                <Text style={[styles.heroWalletValue, { color: totalOutstanding > 0 ? "#DC2626" : "#16A34A" }]}>
                  ${totalOutstanding.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── WALLET SUMMARY CARDS ── */}
          <View style={styles.cardsGrid}>
            {[
              { label: "Lifetime Sales", value: `$${summary.totalSales.toFixed(0)}`, color: "#2563EB", bg: "#EFF6FF" },
              { label: "Lifetime Earned", value: `$${summary.lifetimeEarned.toFixed(0)}`, color: "#A855F7", bg: "#FFF7ED" },
              { label: "Lifetime Paid", value: `$${summary.lifetimePaid.toFixed(0)}`, color: "#16A34A", bg: "#F0FDF4" },
              { label: "Current Wallet", value: `$${totalOutstanding.toFixed(0)}`, color: totalOutstanding > 0 ? "#DC2626" : "#16A34A", bg: totalOutstanding > 0 ? "#FEF2F2" : "#F0FDF4" },
            ].map(c => (
              <View key={c.label} style={[styles.card, { backgroundColor: c.bg }]}>
                <Text style={[styles.cardValue, { color: c.color }]}>{c.value}</Text>
                <Text style={styles.cardLabel}>{c.label}</Text>
              </View>
            ))}
          </View>

          {/* ── ACTIVE BONUS RULE CARD ── */}
          {activeRule && (
            <View style={styles.ruleCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.cardTitle}>⚙️ Bonus Rule</Text>
                {activeRule.ArtistDishId && (
                  <View style={styles.customBadge}>
                    <Text style={styles.customBadgeText}>Custom Rule</Text>
                  </View>
                )}
              </View>
              <View style={styles.ruleDetails}>
                <Text style={styles.ruleText}>
                  Every <Text style={{ fontFamily: Fonts.black }}>${activeRule.ThresholdAmount}</Text> sales ➔ earn <Text style={{ fontFamily: Fonts.black, color: "#16A34A" }}>${activeRule.BonusAmount}</Text> bonus ({activeRule.IsRepeating ? "Repeating" : "One-time"}).
                </Text>
              </View>
            </View>
          )}

          {/* ── PROGRESS CARD ── */}
          {progress && (
            <View style={styles.progressCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={styles.cardTitle}>📈 Next Bonus Target</Text>
                <Text style={styles.rewardTag}>+${progress.nextBonus.toFixed(0)} Next Reward</Text>
              </View>
              <View style={styles.progressStats}>
                <View>
                  <Text style={styles.progLabel}>Current Sales</Text>
                  <Text style={styles.progVal}>${progress.currentSales.toFixed(0)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.progLabel}>Need sales</Text>
                  <Text style={[styles.progVal, { color: "#DC2626" }]}>${progress.remaining.toFixed(0)} Away</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress.progressPct}%` }]}>
                  {progress.progressPct >= 15 && (
                    <Text style={styles.progressFillText}>{progress.progressPct.toFixed(0)}%</Text>
                  )}
                </View>
                {progress.progressPct < 15 && (
                  <Text style={styles.progressTrackText}>{progress.progressPct.toFixed(0)}%</Text>
                )}
              </View>
            </View>
          )}

          {/* ── STICKY PAYOUT BUTTON ── */}
          <View style={{ paddingHorizontal: 16, marginVertical: 14 }}>
            {totalOutstanding > 0 ? (
              <TouchableOpacity style={styles.payBtn} onPress={openPayModal}>
                <Ionicons name="cash" size={20} color="#fff" />
                <Text style={styles.payBtnText}>Pay Wallet Bonus · ${totalOutstanding.toFixed(2)} due</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.disabledPayBtn}>
                <Ionicons name="checkmark-circle" size={20} color={Theme.textMuted} />
                <Text style={styles.disabledPayText}>No Bonus Due</Text>
              </View>
            )}
          </View>

          {/* ── UNIFIED TIMELINE ── */}
          <Text style={styles.sectionHeader}>🕒 Wallet Event Timeline</Text>
          <View style={styles.timelineCard}>
            {sortedTimeline.length === 0 ? (
              <Text style={styles.emptyTimelineText}>No wallet events recorded.</Text>
            ) : (
              sortedTimeline.map((ev, i) => (
                <View key={i} style={styles.timelineRow}>
                  <View style={styles.timelineLine} />
                  <View style={[styles.timelineNode, { backgroundColor: ev.color }]}>
                    <Ionicons name={ev.icon as any} size={14} color="#fff" />
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={styles.timelineTitle}>{ev.title}</Text>
                      <Text style={[styles.timelineAmt, { color: ev.color }]}>
                        {ev.type === "payment" ? "-" : "+"}${ev.amount.toFixed(0)}
                      </Text>
                    </View>
                    <Text style={styles.timelineDesc}>{ev.desc}</Text>
                    <Text style={styles.timelineTime}>{fmtDate(ev.date.toISOString())}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* ── EXPANDABLE SECTIONS ── */}
          <Text style={styles.sectionHeader}>📊 Details & Ledgers</Text>

          {/* 1. Grouped Sales Details */}
          <View style={styles.dropdownCard}>
            <TouchableOpacity style={styles.dropdownHeader} onPress={() => toggleSection("sales")}>
              <Text style={styles.dropdownTitle}>📊 Sales Log</Text>
              <Ionicons name={expandedSection === "sales" ? "chevron-up" : "chevron-down"} size={18} color={Theme.textSecondary} />
            </TouchableOpacity>
            {expandedSection === "sales" && (
              <View style={styles.dropdownBody}>
                {salesHistory.length === 0 ? <Text style={styles.emptyText}>No sales recorded.</Text> : salesHistory.map((s, idx) => (
                  <View key={idx} style={styles.logRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logBillText}>Bill {s.BillNo || "Direct Stage"}</Text>
                      <Text style={styles.logSubText}>{s.ItemName} · Qty {s.Qty}</Text>
                    </View>
                    <Text style={styles.logAmountText}>+${Number(s.Amount).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 2. Payout History */}
          <View style={styles.dropdownCard}>
            <TouchableOpacity style={styles.dropdownHeader} onPress={() => toggleSection("payouts")}>
              <Text style={styles.dropdownTitle}>💵 Payout History (Bank Logs)</Text>
              <Ionicons name={expandedSection === "payouts" ? "chevron-up" : "chevron-down"} size={18} color={Theme.textSecondary} />
            </TouchableOpacity>
            {expandedSection === "payouts" && (
              <View style={styles.dropdownBody}>
                {payHistory.length === 0 ? <Text style={styles.emptyText}>No payouts settled.</Text> : payHistory.map((p, idx) => (
                  <View key={idx} style={styles.logRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logBillText}>Paid to Artist ({p.Remarks || "Cash"})</Text>
                      <Text style={styles.logSubText}>{fmtDate(p.PaidDate)} · by {p.PaidBy}</Text>
                    </View>
                    <Text style={[styles.logAmountText, { color: "#16A34A" }]}>-${Number(p.PaymentAmount).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 3. Bonus Ledger */}
          <View style={styles.dropdownCard}>
            <TouchableOpacity style={styles.dropdownHeader} onPress={() => toggleSection("ledger")}>
              <Text style={styles.dropdownTitle}>🏆 Earned Bonus Ledger</Text>
              <Ionicons name={expandedSection === "ledger" ? "chevron-up" : "chevron-down"} size={18} color={Theme.textSecondary} />
            </TouchableOpacity>
            {expandedSection === "ledger" && (
              <View style={styles.dropdownBody}>
                {bonusHistory.length === 0 ? <Text style={styles.emptyText}>No bonuses earned.</Text> : bonusHistory.map((b, idx) => (
                  <View key={idx} style={styles.logRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logBillText}>Milestone Reached</Text>
                      <Text style={styles.logSubText}>{fmtDate(b.SalesFromDate)} ➔ {fmtDate(b.SalesToDate)} · Sales: ${b.TotalSales}</Text>
                    </View>
                    <Text style={[styles.logAmountText, { color: "#A855F7" }]}>+${Number(b.BonusEarned).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 4. Statistics */}
          <View style={styles.dropdownCard}>
            <TouchableOpacity style={styles.dropdownHeader} onPress={() => toggleSection("stats")}>
              <Text style={styles.dropdownTitle}>📈 Wallet Statistics & Insights</Text>
              <Ionicons name={expandedSection === "stats" ? "chevron-up" : "chevron-down"} size={18} color={Theme.textSecondary} />
            </TouchableOpacity>
            {expandedSection === "stats" && (
              <View style={[styles.dropdownBody, { gap: 10 }]}>
                <StatRow label="Lifetime Sales" value={`$${summary.totalSales.toFixed(2)}`} />
                <StatRow label="Lifetime Earned" value={`$${summary.lifetimeEarned.toFixed(2)}`} />
                <StatRow label="Lifetime Paid" value={`$${summary.lifetimePaid.toFixed(2)}`} />
                <StatRow label="Current Wallet" value={`$${totalOutstanding.toFixed(2)}`} />
                <StatRow label="Average Daily Sales" value={`$${(summary.totalSales / 30).toFixed(2)}`} />
                <StatRow label="Last Payment Date" value={payHistory[0] ? fmtDate(payHistory[0].PaidDate) : "Never"} />
                <StatRow label="Last Paid Cashier" value={payHistory[0] ? payHistory[0].PaidBy : "None"} />
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Pay Modal */}
      <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Settle Wallet Bonus</Text>
                <Text style={styles.modalSubtitle}>{artist?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPayModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSummary}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 4 }}>
                <Text style={styles.modalSumLabel}>Total Outstanding</Text>
                <Text style={[styles.modalSumVal, { color: "#DC2626", fontSize: 16 }]}>${totalOutstanding.toFixed(2)}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>payout Amount ($)</Text>
            <TextInput
              style={styles.input}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
            />
            <View style={styles.quickAmtRow}>
              <TouchableOpacity style={styles.quickAmtBtn} onPress={() => setPayAmount(totalOutstanding.toFixed(2))}>
                <Text style={styles.quickAmtText}>Full</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAmtBtn} onPress={() => setPayAmount((totalOutstanding / 2).toFixed(2))}>
                <Text style={styles.quickAmtText}>Half</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Payment Mode</Text>
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
              placeholder="e.g. Settle wallet payouts"
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPayModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, paying && { opacity: 0.6 }]} onPress={handlePay} disabled={paying}>
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
              <Text style={styles.receiptTitle}>Wallet Settled</Text>
              <Text style={styles.receiptAmt}>${receiptData?.amount.toFixed(2)}</Text>
            </View>
            <View style={styles.receiptBody}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Artist</Text>
                <Text style={styles.receiptVal}>{receiptData?.artistName}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Date</Text>
                <Text style={styles.receiptVal}>{receiptData?.date}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Method</Text>
                <Text style={styles.receiptVal}>{receiptData?.method}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Reference</Text>
                <Text style={styles.receiptVal}>{receiptData?.refNo}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.printReceiptBtn} onPress={printReceipt}>
              <Ionicons name="print" size={16} color="#fff" />
              <Text style={styles.printReceiptText}>Print Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.receiptDoneBtn} onPress={() => setShowReceipt(false)}>
              <Text style={styles.receiptDoneText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Theme.border }}>
      <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Theme.textSecondary }}>{label}</Text>
      <Text style={{ fontFamily: Fonts.black, fontSize: 13, color: Theme.textPrimary }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Theme.bgCard, borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: Fonts.black, fontSize: 17, color: Theme.textPrimary },
  headerSub: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary },

  // Hero Card
  heroCard: { backgroundColor: Theme.bgCard, margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Theme.border },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Theme.primaryLight, justifyContent: "center", alignItems: "center" },
  heroAvatarText: { fontFamily: Fonts.black, fontSize: 18, color: Theme.primary },
  heroName: { fontFamily: Fonts.black, fontSize: 18, color: Theme.textPrimary },
  heroWalletLabel: { fontFamily: Fonts.medium, fontSize: 9, color: Theme.textMuted, textTransform: "uppercase" },
  heroWalletValue: { fontFamily: Fonts.black, fontSize: 22, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontFamily: Fonts.bold, fontSize: 10 },

  // Cards Grid
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  card: { flex: 1, minWidth: "45%", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Theme.border },
  cardValue: { fontFamily: Fonts.black, fontSize: 16 },
  cardLabel: { fontFamily: Fonts.bold, fontSize: 10, color: Theme.textSecondary, marginTop: 4 },

  cardTitle: { fontFamily: Fonts.black, fontSize: 12, color: Theme.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  ruleCard: { backgroundColor: Theme.bgCard, marginHorizontal: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Theme.border, marginBottom: 12 },
  customBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  customBadgeText: { fontFamily: Fonts.bold, fontSize: 10, color: "#DC2626" },
  ruleDetails: { marginTop: 8 },
  ruleText: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textPrimary },

  progressCard: { backgroundColor: Theme.bgCard, marginHorizontal: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Theme.border },
  rewardTag: { fontFamily: Fonts.black, fontSize: 10, color: "#2563EB", backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  progressStats: { flexDirection: "row", justifyContent: "space-between", marginVertical: 8 },
  progLabel: { fontFamily: Fonts.medium, fontSize: 9, color: Theme.textSecondary, textTransform: "uppercase" },
  progVal: { fontFamily: Fonts.black, fontSize: 14, marginTop: 2, color: Theme.textPrimary },
  progressTrack: { height: 16, backgroundColor: Theme.bgMuted, borderRadius: 8, overflow: "hidden", position: "relative", justifyContent: "center" },
  progressFill: { height: "100%", backgroundColor: "#2563EB", borderRadius: 8, justifyContent: "center", alignItems: "flex-end", paddingRight: 8 },
  progressFillText: { fontFamily: Fonts.black, fontSize: 9, color: "#fff" },
  progressTrackText: { fontFamily: Fonts.black, fontSize: 9, color: Theme.textSecondary, position: "absolute", left: 8 },

  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#16A34A", padding: 14, borderRadius: 12 },
  payBtnText: { fontFamily: Fonts.bold, fontSize: 14, color: "#fff" },
  disabledPayBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Theme.bgMuted, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Theme.border },
  disabledPayText: { fontFamily: Fonts.bold, fontSize: 14, color: Theme.textMuted },

  sectionHeader: { fontFamily: Fonts.black, fontSize: 12, color: Theme.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, margin: 16, marginBottom: 8 },

  // Timeline
  timelineCard: { backgroundColor: Theme.bgCard, marginHorizontal: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Theme.border },
  emptyTimelineText: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted, fontStyle: "italic", textAlign: "center" },
  timelineRow: { flexDirection: "row", gap: 12, paddingBottom: 16, position: "relative" },
  timelineLine: { position: "absolute", left: 14, top: 28, bottom: 0, width: 2, backgroundColor: Theme.border },
  timelineNode: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", zIndex: 10 },
  timelineContent: { flex: 1, borderBottomWidth: 1, borderBottomColor: Theme.border, paddingBottom: 12 },
  timelineTitle: { fontFamily: Fonts.black, fontSize: 13, color: Theme.textPrimary },
  timelineAmt: { fontFamily: Fonts.black, fontSize: 14 },
  timelineDesc: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary, marginTop: 2 },
  timelineTime: { fontFamily: Fonts.bold, fontSize: 9, color: Theme.textMuted, marginTop: 4 },

  // Dropdowns
  dropdownCard: { backgroundColor: Theme.bgCard, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: Theme.border, marginBottom: 8, overflow: "hidden" },
  dropdownHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  dropdownTitle: { fontFamily: Fonts.black, fontSize: 13, color: Theme.textPrimary },
  dropdownBody: { borderTopWidth: 1, borderTopColor: Theme.border, padding: 14, backgroundColor: "#FAFAF9" },
  emptyText: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textMuted, fontStyle: "italic" },
  logRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Theme.border },
  logBillText: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary },
  logSubText: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary, marginTop: 2 },
  logAmountText: { fontFamily: Fonts.black, fontSize: 14 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: Theme.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontFamily: Fonts.black, fontSize: 18 },
  modalSubtitle: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  modalSummary: { backgroundColor: Theme.bgMuted, padding: 12, borderRadius: 12, marginBottom: 16 },
  modalSumLabel: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary },
  modalSumVal: { fontFamily: Fonts.bold, fontSize: 13 },
  sumDivider: { height: 1, backgroundColor: Theme.border, marginVertical: 6 },
  fieldLabel: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textPrimary, marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: Theme.bgInput, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Theme.border },
  quickAmtRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  quickAmtBtn: { flex: 1, backgroundColor: Theme.bgMuted, padding: 8, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  quickAmtText: { fontFamily: Fonts.bold, fontSize: 11, color: Theme.textSecondary },
  methodRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  methodBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Theme.border, alignItems: "center", backgroundColor: Theme.bgMuted },
  methodBtnActive: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  methodText: { fontFamily: Fonts.bold, fontSize: 12, color: Theme.textSecondary },
  methodTextActive: { color: "#fff" },
  modalFooter: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Theme.bgMuted, alignItems: "center" },
  cancelBtnText: { fontFamily: Fonts.bold, fontSize: 14, color: Theme.textSecondary },
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
