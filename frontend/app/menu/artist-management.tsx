import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "../../components/Toast";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useRouter, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ArtistRow {
  dishId: string;
  name: string;
  totalSales: number;
  bonusEarned: number;
  bonusPaid: number;
  pendingBonus: number;
  status: string;
  thresholdAmount: number;
  thresholdReached: boolean;
  progressPct: number;
  remainingToThreshold: number;
  lifetimeOutstanding?: number;
}

const WALLET_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  Paid:             { bg: "rgba(16,185,129,0.15)",  text: "#10B981", label: "🟢 Settled" },
  "Partially Paid": { bg: "rgba(245,158,11,0.15)",  text: "#F59E0B", label: "🟠 Partial" },
  Pending:          { bg: "rgba(239,68,68,0.15)",   text: "#EF4444", label: "🔴 Due" },
  Accruing:         { bg: "rgba(59,130,246,0.15)",  text: "#3B82F6", label: "🔵 Live Day" },
  "No Bonus":      { bg: "rgba(255,255,255,0.06)",  text: "#5A5080", label: "⚪ Empty" },
};

export default function ArtistManagementScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { token } = useAuthStore();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [isDayActive, setIsDayActive] = useState(false);
  const [activeDay, setActiveDay]     = useState<string | null>(null);
  const [cards, setCards] = useState({ totalArtistSales: 0, totalBonusEarned: 0, totalBonusPaid: 0, pendingBonus: 0 });
  const [artists, setArtists]         = useState<ArtistRow[]>([]);
  const [activeRule, setActiveRule]   = useState<any>(null);
  const [pendingArtists, setPendingArtists] = useState<any[]>([]);
  const [lastPayment, setLastPayment] = useState<{ amount: number; date: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, pendingRes] = await Promise.all([
        axios.get(`${API_URL}/api/artist-bonus/sales-summary`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/artist-bonus/pending`,       { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (summaryRes.data.success) {
        setCards(summaryRes.data.cards);
        setArtists(summaryRes.data.artists || []);
        setActiveRule(summaryRes.data.activeRule);
        setIsDayActive(summaryRes.data.isDayActive ?? false);
        setActiveDay(summaryRes.data.activeDay ?? null);
      }
      if (pendingRes.data.success) {
        setPendingArtists(pendingRes.data.data || []);
      }

      // Fetch last payment for dashboard summary
      const payRes = await axios.get(`${API_URL}/api/artist-bonus/payments?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (payRes.data.success && payRes.data.data && payRes.data.data.length > 0) {
        const lp = payRes.data.data[0];
        setLastPayment({
          amount: Number(lp.PaymentAmount),
          date: lp.PaidDate ? lp.PaidDate.split("T")[0] : "Recent",
        });
      }
    } catch (err: any) {
      showToast({ type: "error", message: "Load Failed", subtitle: "Could not load artist summary." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => fetchData());
    return unsubscribe;
  }, [navigation, fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // Calculate stats
  const pendingByArtist: Record<string, number> = {};
  pendingArtists.forEach(txn => {
    const name = txn.ArtistName || "Unknown";
    pendingByArtist[name] = (pendingByArtist[name] || 0) + (Number(txn.pendingBonus) || 0);
  });
  const artistsWithPending = Object.keys(pendingByArtist).filter(n => pendingByArtist[n] > 0);
  const totalAllTimePending = Object.values(pendingByArtist).reduce((s, v) => s + v, 0);

  // Business Day State Logic
  let dayStateLabel = "⚪ Fully Settled";
  let dayStateColor = "#78716C";
  let dayStateIcon = "ellipse-outline";
  let dayStateDesc = "All artist wallets are settled.";

  if (isDayActive) {
    dayStateLabel = "🟢 Business Day Active";
    dayStateColor = "#16A34A";
    dayStateIcon = "play-circle-outline";
    dayStateDesc = "Sales are accumulating automatically. Live Sales Updating...";
  } else if (!isDayActive) {
    if (artists.some(a => a.totalSales > 0 && a.bonusEarned === 0 && activeRule)) {
      dayStateLabel = "🟡 Awaiting Calculation";
      dayStateColor = "#CA8A04";
      dayStateIcon = "time-outline";
      dayStateDesc = "Business day closed. Settle live calculations.";
    } else if (totalAllTimePending > 0) {
      dayStateLabel = "🔵 Bonus Calculated";
      dayStateColor = "#2563EB";
      dayStateIcon = "checkbox-outline";
      dayStateDesc = "Wallets updated. Ready for settlement.";
    }
  }

  const quickLinks = [
    { title: "Live Sales",   subtitle: "Watch sales progress",      icon: "trending-up",   color: "#3B82F6",  bg: "rgba(59,130,246,0.12)",   route: "/menu/artist-sales" },
    { title: "Bonus Wallets",subtitle: "Settle money due",          icon: "wallet",        color: "#EF4444",  bg: "rgba(239,68,68,0.12)",    route: "/menu/artist-bonus-payments" },
    { title: "Bonus Rules",  subtitle: "Setup targets & rewards",    icon: "settings",      color: "#A855F7",  bg: "rgba(168,85,247,0.12)",   route: "/menu/artist-bonus-master" },
    { title: "Reports",      subtitle: "Audit wallets & payments",   icon: "document-text", color: "#5A5080",  bg: "rgba(255,255,255,0.06)",  route: "/menu/artist-reports" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgMain} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/category" as any);
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Artist Hub</Text>
          <Text style={styles.headerSub}>
            {activeRule
              ? `Rule: Every $${activeRule.ThresholdAmount} ➔ $${activeRule.BonusAmount} Bonus`
              : "No active bonus rule"}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={Theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Theme.primary]} tintColor={Theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. BUSINESS DAY STATUS BANNER ── */}
        <View style={[styles.dayBanner, { borderColor: dayStateColor + "40" }]}>
          <View style={[styles.dayBannerIconWrap, { backgroundColor: dayStateColor + "15" }]}>
            <Ionicons name={dayStateIcon as any} size={22} color={dayStateColor} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.dayBannerTitle, { color: dayStateColor }]}>
                {dayStateLabel}
              </Text>
              {activeDay && (
                <Text style={styles.dayDateText}>· {activeDay}</Text>
              )}
            </View>
            <Text style={styles.dayBannerSub}>{dayStateDesc}</Text>
          </View>
          {isDayActive && (
            <View style={[styles.dayLiveBadge, { backgroundColor: dayStateColor }]}>
              <Text style={styles.dayLiveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* ── 2. ATTENTION BANNER ── */}
        {artistsWithPending.length > 0 && (
          <TouchableOpacity
            style={styles.pendingAlert}
            onPress={() => router.push("/menu/artist-bonus-payments" as any)}
            activeOpacity={0.8}
          >
            <View style={styles.pendingAlertIcon}>
              <Ionicons name="alert-circle" size={22} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingAlertTitle}>💰 Bonus Due</Text>
              <Text style={styles.pendingAlertSub}>
                {artistsWithPending.length} Artist{artistsWithPending.length > 1 ? "s" : ""} · ${totalAllTimePending.toFixed(2)} due payout
              </Text>
            </View>
            <View style={styles.settleBtn}>
              <Text style={styles.settleBtnText}>Settle Now</Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.cardsGrid}>
          {[
            { label: "Today's Artist Sales", value: `$${cards.totalArtistSales.toFixed(0)}`, icon: "trending-up", color: "#3B82F6" },
            { label: "Today's Bonus Earned", value: `$${cards.totalBonusEarned.toFixed(0)}`, icon: "trophy", color: "#A855F7" },
            { label: "Bonus Due", value: `$${totalAllTimePending.toFixed(0)}`, sub: `${artistsWithPending.length} Artists`, icon: "wallet", color: totalAllTimePending > 0 ? "#EF4444" : "#10B981" },
            { label: "Last Settlement", value: lastPayment ? `$${lastPayment.amount.toFixed(0)}` : "$0", sub: lastPayment ? lastPayment.date : "None yet", icon: "checkmark-circle", color: "#10B981" },
          ].map(c => (
            <View key={c.label} style={[styles.card, { borderColor: c.color + "40" }, isTablet && { flex: 1 }]}>
              <View style={[styles.cardIconWrap, { backgroundColor: c.color + "15" }]}>
                <Ionicons name={c.icon as any} size={18} color={c.color} />
              </View>
              <Text style={styles.cardValue}>{c.value}</Text>
              <Text style={styles.cardLabel}>{c.label}</Text>
              {c.sub && <Text style={styles.cardSubText}>{c.sub}</Text>}
            </View>
          ))}
        </View>

        {/* ── 4. QUICK ACTIONS ── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickLinksRow}>
          {quickLinks.map(link => (
            <TouchableOpacity
              key={link.route}
              style={[styles.quickLink, { backgroundColor: link.bg }]}
              onPress={() => router.push(link.route as any)}
              activeOpacity={0.75}
            >
              <View style={[styles.quickLinkIcon, { backgroundColor: link.color + "22" }]}>
                <Ionicons name={link.icon as any} size={20} color={link.color} />
              </View>
              <Text style={[styles.quickLinkText, { color: link.color }]}>{link.title}</Text>
              <Text style={styles.quickLinkSubtitle}>{link.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── 5. ARTIST LIST ── */}
        {artists.length > 0 && (
          <>
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>Artist Bonus Registry</Text>
              <TouchableOpacity onPress={() => router.push("/menu/artist-sales" as any)}>
                <Text style={styles.listHeaderLink}>View Live Sales ➔</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.artistListCard}>
              {artists.map((artist, idx) => {
                const artistLifetimeOwed = pendingByArtist[artist.name] ?? 0;
                let statusKey = artist.status;
                if (artistLifetimeOwed > 0 && statusKey === "Paid") {
                  statusKey = "Partially Paid";
                }
                const sc = WALLET_STATUS_COLORS[statusKey] || WALLET_STATUS_COLORS["No Bonus"];

                return (
                  <TouchableOpacity
                    key={artist.dishId}
                    style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                    onPress={() => router.push(`/menu/artist-detail?dishId=${artist.dishId}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowCellLeft}>
                      <View style={[styles.avatarCircle, artistLifetimeOwed > 0 && { backgroundColor: "#FEE2E2" }]}>
                        <Text style={[styles.avatarText, artistLifetimeOwed > 0 && { color: "#DC2626" }]}>
                          {(artist.name || "?")[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
                        <Text style={styles.artistSubText}>
                          Today's Sales: <Text style={{ fontFamily: Fonts.bold, color: "#2563EB" }}>${artist.totalSales.toFixed(0)}</Text>
                        </Text>
                      </View>
                    </View>

                    <View style={styles.rowCellRight}>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.walletLabel}>Current Wallet</Text>
                        <Text style={[styles.walletValue, { color: artistLifetimeOwed > 0 ? "#DC2626" : "#16A34A" }]}>
                          ${artistLifetimeOwed.toFixed(0)}
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Theme.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: Theme.bgNav,
    borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 12,
    ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(0,0,0,0.25)" } }) as any,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: Fonts.black, fontSize: 17, color: Theme.textPrimary },
  headerSub: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary, marginTop: 1 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.primaryLight, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, paddingBottom: 40 },

  // Day Status Banner
  dayBanner: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5,
    backgroundColor: Theme.bgCard,
  },
  dayBannerIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  dayBannerTitle: { fontFamily: Fonts.black, fontSize: 13 },
  dayDateText: { fontFamily: Fonts.bold, fontSize: 13, color: Theme.textSecondary },
  dayBannerSub: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary, marginTop: 2 },
  dayLiveBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  dayLiveText: { fontFamily: Fonts.black, fontSize: 10, color: "#fff", letterSpacing: 1 },

  // Attention Banner
  pendingAlert: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16,
    backgroundColor: Theme.dangerBg, borderWidth: 1.5, borderColor: "#FECACA",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(220,38,38,0.08)" } }) as any,
  },
  pendingAlertIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center" },
  pendingAlertTitle: { fontFamily: Fonts.black, fontSize: 14, color: "#B91C1C" },
  pendingAlertSub: { fontFamily: Fonts.medium, fontSize: 12, color: "#DC2626", marginTop: 2 },
  settleBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DC2626", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  settleBtnText: { fontFamily: Fonts.bold, fontSize: 11, color: "#fff" },

  // Summary Cards
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  card: {
    width: "47%", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
    ...Platform.select({ web: { boxShadow: "0 2px 12px rgba(0,0,0,0.20)" } }) as any,
  },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  cardValue: { fontFamily: Fonts.black, fontSize: 20, color: Theme.textPrimary },
  cardLabel: { fontFamily: Fonts.bold, fontSize: 11, color: Theme.textSecondary, marginTop: 4 },
  cardSubText: { fontFamily: Fonts.medium, fontSize: 10, color: Theme.textMuted, marginTop: 2 },

  sectionTitle: {
    fontFamily: Fonts.black, fontSize: 12, color: Theme.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },

  // Quick Actions
  quickLinksRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  quickLink: {
    width: "48%", borderRadius: 14, padding: 12, gap: 4,
    borderWidth: 1, borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
  },
  quickLinkIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  quickLinkText: { fontFamily: Fonts.black, fontSize: 13 },
  quickLinkSubtitle: { fontFamily: Fonts.medium, fontSize: 10, color: Theme.textSecondary },

  // Artist List
  listHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  listHeaderLink: { fontFamily: Fonts.bold, fontSize: 12, color: Theme.primary },
  artistListCard: {
    backgroundColor: Theme.bgCard, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: Theme.border,
  },
  tableRow: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 12, alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: Theme.border },
  tableRowAlt: { backgroundColor: Theme.bgMuted },
  rowCellLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1.2 },
  rowCellRight: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, justifyContent: "flex-end" },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.primaryLight, justifyContent: "center", alignItems: "center" },
  avatarText: { fontFamily: Fonts.black, fontSize: 13, color: Theme.primary },
  artistName: { fontFamily: Fonts.black, fontSize: 13, color: Theme.textPrimary },
  artistSubText: { fontFamily: Fonts.medium, fontSize: 11, color: Theme.textSecondary, marginTop: 2 },
  walletLabel: { fontFamily: Fonts.medium, fontSize: 9, color: Theme.textMuted, textTransform: "uppercase" },
  walletValue: { fontFamily: Fonts.black, fontSize: 14, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontFamily: Fonts.bold, fontSize: 10 },
});
