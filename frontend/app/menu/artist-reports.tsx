import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useToast } from "../../components/Toast";

interface CustomDatePickerProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onApply: (date: Date) => void;
  title: string;
}

function CustomDatePicker({
  visible,
  onClose,
  selectedDate,
  onApply,
  title,
}: CustomDatePickerProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 640;

  const [viewDate, setViewDate] = useState(() => new Date(selectedDate));
  const [selectedDay, setSelectedDay] = useState(() => new Date(selectedDate));

  useEffect(() => {
    if (visible) {
      setViewDate(new Date(selectedDate));
      setSelectedDay(new Date(selectedDate));
    }
  }, [visible, selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const arr = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      arr.push({
        day: prevMonthDays - i,
        month: month === 0 ? 11 : month - 1,
        year: month === 0 ? year - 1 : year,
        isCurrentMonth: false,
      });
    }
    for (let i = 1; i <= totalDaysInMonth; i++) {
      arr.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true,
      });
    }
    const totalCells = arr.length;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      arr.push({
        day: i,
        month: month === 11 ? 0 : month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false,
      });
    }
    return arr;
  }, [year, month]);

  const handleDaySelect = (dayObj: any) => {
    setSelectedDay(new Date(dayObj.year, dayObj.month, dayObj.day));
  };

  const handleApply = () => {
    const finalDate = new Date(selectedDay);
    finalDate.setHours(0, 0, 0, 0);
    onApply(finalDate);
    onClose();
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={pickerStyles.overlay}>
        <View
          style={[
            pickerStyles.modalContainer,
            { width: isTablet ? 360 : "90%", padding: 16 },
          ]}
        >
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.headerTitle}>{title}</Text>
            <TouchableOpacity style={pickerStyles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color="#44403C" />
            </TouchableOpacity>
          </View>

          <View style={{ width: "100%" }}>
            <View style={pickerStyles.calNavigator}>
              <TouchableOpacity onPress={prevMonth} style={pickerStyles.navBtn}>
                <Ionicons name="chevron-back" size={16} color="#44403C" />
              </TouchableOpacity>
              <Text style={pickerStyles.monthYearText}>
                {monthNames[month]} {year}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={pickerStyles.navBtn}>
                <Ionicons name="chevron-forward" size={16} color="#44403C" />
              </TouchableOpacity>
            </View>

            <View style={pickerStyles.weekdaysRow}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((wd, i) => (
                <Text key={i} style={pickerStyles.weekdayText}>
                  {wd}
                </Text>
              ))}
            </View>

            <View style={pickerStyles.daysGrid}>
              {days.map((dObj, idx) => {
                const isSelected =
                  selectedDay.getDate() === dObj.day &&
                  selectedDay.getMonth() === dObj.month &&
                  selectedDay.getFullYear() === dObj.year;

                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleDaySelect(dObj)}
                    style={[
                      pickerStyles.dayBtn,
                      isSelected && pickerStyles.dayBtnSelected,
                    ]}
                  >
                    <Text
                      style={[
                        pickerStyles.dayText,
                        !dObj.isCurrentMonth && pickerStyles.dayTextInactive,
                        isSelected && pickerStyles.dayTextSelected,
                      ]}
                    >
                      {dObj.day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={pickerStyles.footer}>
            <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onClose}>
              <Text style={pickerStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={pickerStyles.applyBtn}
              onPress={handleApply}
            >
              <Text style={pickerStyles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  modalContainer: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    maxWidth: "95%",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  calNavigator: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },
  monthYearText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  weekdaysRow: { flexDirection: "row", marginBottom: 8 },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayBtn: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 2,
    borderRadius: 8,
  },
  dayBtnSelected: { backgroundColor: "#A855F7" },
  dayText: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary },
  dayTextInactive: { color: "#D1D5DB" },
  dayTextSelected: { color: "#fff" },
  footer: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F5F5F4",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 13, fontFamily: Fonts.black, color: "#44403C" },
  applyBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#A855F7",
    justifyContent: "center",
    alignItems: "center",
  },
  applyBtnText: { fontSize: 13, fontFamily: Fonts.black, color: "#fff" },
});

const pad = (n: number) => n.toString().padStart(2, "0");
const fmtDate = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};
const fmtMoney = (v: any) => `$${parseFloat(v || 0).toFixed(2)}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const firstOfMonthStr = () => {
  const d = new Date();
  d.setDate(1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type ReportTab = "all" | "sales" | "bonus" | "payments" | "outstanding";

export default function ArtistReportsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<ReportTab>("all");
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(firstOfMonthStr());
  const [toDate, setToDate] = useState(todayStr());
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  // Calendar Picker controllers
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const parsedFromDate = useMemo(
    () => (fromDate ? new Date(fromDate) : new Date()),
    [fromDate],
  );
  const parsedToDate = useMemo(
    () => (toDate ? new Date(toDate) : new Date()),
    [toDate],
  );
  const getLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Autocomplete Artist Dropdown
  const [artistsList, setArtistsList] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // KPI cards
  const [summaryStats, setSummaryStats] = useState({
    avgBonus: 0,
    largestBonus: 0,
    mostSales: 0,
    mostPending: 0,
    totalSales: 0,
    totalBonus: 0,
    totalPaid: 0,
    totalWaiting: 0,
    artistCount: 0,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const statsRes = await axios.get(
        `${API_URL}/api/artist-bonus/reports/performance?fromDate=${fromDate}&toDate=${toDate}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      let endpoint = `/api/artist-bonus/reports/sales?fromDate=${fromDate}&toDate=${toDate}`;
      if (activeTab === "bonus") {
        endpoint = `/api/artist-bonus/reports/bonus-ledger?fromDate=${fromDate}&toDate=${toDate}`;
      } else if (activeTab === "payments") {
        endpoint = `/api/artist-bonus/reports/payment-ledger?fromDate=${fromDate}&toDate=${toDate}`;
      } else if (activeTab === "outstanding") {
        endpoint = `/api/artist-bonus/reports/pending`;
      } else if (activeTab === "all") {
        endpoint = `/api/artist-bonus/reports/performance?fromDate=${fromDate}&toDate=${toDate}`;
      }

      const res = await axios.get(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.success) {
        setData(res.data.data || []);
      }

      if (statsRes.data.success && statsRes.data.data) {
        const list = statsRes.data.data;
        const totalSales = list.reduce(
          (s: number, r: any) => s + Number(r.CustomSales || r.DailySales),
          0,
        );
        const totalBonus = list.reduce(
          (s: number, r: any) => s + Number(r.TotalBonusEarned),
          0,
        );
        const totalPaid = list.reduce(
          (s: number, r: any) => s + Number(r.TotalBonusPaid),
          0,
        );
        const totalWaiting = list.reduce(
          (s: number, r: any) => s + Number(r.PendingBonus),
          0,
        );

        const avgBonus = list.length > 0 ? totalBonus / list.length : 0;
        const largestBonus = Math.max(
          ...list.map((r: any) => Number(r.TotalBonusEarned)),
          0,
        );
        const mostSales = Math.max(
          ...list.map((r: any) => Number(r.CustomSales || r.DailySales)),
          0,
        );
        const mostPending = Math.max(
          ...list.map((r: any) => Number(r.PendingBonus)),
          0,
        );

        setSummaryStats({
          avgBonus,
          largestBonus,
          mostSales,
          mostPending,
          totalSales,
          totalBonus,
          totalPaid,
          totalWaiting,
          artistCount: list.length,
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        message: "Load Failed",
        subtitle: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, fromDate, toDate, token]);

  useEffect(() => {
    fetchData();
  }, [activeTab, fromDate, toDate]);

  useEffect(() => {
    const loadArtists = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/settlement/artist-list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setArtistsList(res.data.data || []);
      } catch (err) {
        console.error("Failed to load artists list:", err);
      }
    };
    loadArtists();
  }, [token]);

  const filteredData = data.filter((r: any) => {
    const term = search.toLowerCase();
    const name = (r.ArtistName || r.Artist || "").toLowerCase();
    const bill = (r.BillNo || "").toLowerCase();
    const status = (r.Status || r.StatusText || "").toLowerCase();
    return name.includes(term) || bill.includes(term) || status.includes(term);
  });

  const matchingArtists = useMemo(() => {
    if (!search) return artistsList;
    return [...artistsList].sort((a, b) => {
      const aMatch = a.Name.toLowerCase().startsWith(search.toLowerCase());
      const bMatch = b.Name.toLowerCase().startsWith(search.toLowerCase());
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return a.Name.localeCompare(b.Name);
    });
  }, [artistsList, search]);

  const exportCsv = async () => {
    if (!filteredData.length) return;
    const keys = Object.keys(filteredData[0]);
    const header = keys.join(",");
    const rows = filteredData
      .map((row) =>
        keys
          .map((k) => `"${String(row[k] ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const csv = `${header}\n${rows}`;

    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `artist_report_${activeTab}.csv`;
      a.click();
    } else {
      try {
        const FileSystem = require("expo-file-system");
        const path = `${FileSystem.cacheDirectory}artist_report_${activeTab}.csv`;
        await FileSystem.writeAsStringAsync(path, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(path);
      } catch (e) {
        showToast({
          type: "error",
          message: "Export Failed",
          subtitle: "Unable to export on this device.",
        });
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgMain} />

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
          <Text style={styles.headerTitle}>Incentive Ledger Audits</Text>
          <Text style={styles.headerSub}>
            {filteredData.length} entries found
          </Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCsv}>
          <Ionicons name="download-outline" size={17} color={Theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Date Filter & Search */}
      <View style={styles.filterBar}>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={styles.dateFieldButton}
            onPress={() => setShowFromPicker(true)}
          >
            <View>
              <Text style={styles.dateLabel}>From</Text>
              <Text style={styles.dateValueText}>
                {fromDate || "Select Date"}
              </Text>
            </View>
            <Ionicons name="calendar-outline" size={15} color={Theme.primary} />
          </TouchableOpacity>

          <Ionicons name="arrow-forward" size={14} color={Theme.textMuted} />

          <TouchableOpacity
            style={styles.dateFieldButton}
            onPress={() => setShowToPicker(true)}
          >
            <View>
              <Text style={styles.dateLabel}>To</Text>
              <Text style={styles.dateValueText}>
                {toDate || "Select Date"}
              </Text>
            </View>
            <Ionicons name="calendar-outline" size={15} color={Theme.primary} />
          </TouchableOpacity>
        </View>

        {/* Search Everywhere Bar with Autocomplete Dropdown */}
        <View style={{ position: "relative", zIndex: 1000 }}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={Theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={(v) => {
                setSearch(v);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search by Artist"
              placeholderTextColor={Theme.textMuted}
            />
             {(search.length > 0 || showDropdown) && (
              <TouchableOpacity
                onPress={() => {
                  setSearch("");
                  setShowDropdown(false);
                }}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={Theme.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Autocomplete Dropdown List */}
          {showDropdown && (
            <View style={styles.dropdownListContainer}>
               <ScrollView
                style={{ maxHeight: 200 }}
                keyboardShouldPersistTaps="handled"
              >
                {matchingArtists.map((artist, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSearch(artist.Name);
                      setShowDropdown(false);
                    }}
                  >
                    <Ionicons
                      name="person-outline"
                      size={14}
                      color={Theme.textSecondary}
                    />
                    <Text style={styles.dropdownItemText}>{artist.Name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.closeDropdownBtn}
                  onPress={() => setShowDropdown(false)}
                >
                  <Text style={styles.closeDropdownBtnText}>
                    Close Dropdown
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── KPI EXECUTIVE SUMMARY ── */}
        <View style={styles.kpiGrid}>
          {[
            {
              label: "Largest Bonus",
              value: `$${summaryStats.largestBonus.toFixed(0)}`,
              color: "#A855F7",
            },
            {
              label: "Average Bonus",
              value: `$${summaryStats.avgBonus.toFixed(0)}`,
              color: "#2563EB",
            },
            {
              label: "Most Sales",
              value: `$${summaryStats.mostSales.toFixed(0)}`,
              color: "#16A34A",
            },
            {
              label: "Most Pending",
              value: `$${summaryStats.mostPending.toFixed(0)}`,
              color: "#DC2626",
            },
          ].map((k) => (
            <View
              key={k.label}
              style={[
                styles.kpiCard,
                { minWidth: width >= 640 ? "23%" : "45%" },
              ]}
            >
              <Text style={[styles.kpiValue, { color: k.color }]}>
                {k.value}
              </Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* ── TABS AS QUICK FILTERS ── */}
        <View style={styles.filterTabs}>
          {(
            [
              { key: "all", label: "All Ledgers" },
              { key: "sales", label: "Sales Log" },
              { key: "bonus", label: "Bonus Earned" },
              { key: "payments", label: "Payout Logs" },
              { key: "outstanding", label: "Due" },
            ] as const
          ).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterTab,
                activeTab === tab.key && styles.filterTabActive,
              ]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeTab === tab.key && styles.filterTabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={Theme.primary}
            style={{ marginTop: 40 }}
          />
        ) : (
          <View style={styles.reportContainer}>
            {filteredData.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="document-text-outline"
                  size={40}
                  color={Theme.textMuted}
                />
                <Text style={styles.emptyText}>No matching audits found.</Text>
              </View>
            ) : (
              <View style={styles.cardList}>
                {filteredData.map((row, idx) => (
                  <View key={idx} style={styles.rowCard}>
                    <View style={styles.rowTop}>
                      <Text style={styles.artistNameText}>
                        {row.ArtistName || row.Artist}
                      </Text>
                      {activeTab === "all" && (
                        <Text style={styles.metricText}>
                          Sales: {fmtMoney(row.CustomSales || row.DailySales)}
                        </Text>
                      )}
                      {activeTab === "sales" && (
                        <Text style={styles.metricText}>
                          {fmtMoney(row.TotalSales)}
                        </Text>
                      )}
                      {activeTab === "bonus" && (
                        <Text style={[styles.metricText, { color: "#A855F7" }]}>
                          +{fmtMoney(row.BonusEarned)}
                        </Text>
                      )}
                      {activeTab === "payments" && (
                        <Text style={[styles.metricText, { color: "#16A34A" }]}>
                          -{fmtMoney(row.PaymentAmount)}
                        </Text>
                      )}
                      {activeTab === "outstanding" && (
                        <Text style={[styles.metricText, { color: "#DC2626" }]}>
                          {fmtMoney(row.PendingBonus)}
                        </Text>
                      )}
                    </View>

                    {/* Metadata details */}
                    <View style={styles.rowMeta}>
                      {row.CreatedDate && (
                        <Text style={styles.metaText}>
                          Date: {fmtDate(row.CreatedDate)}
                        </Text>
                      )}
                      {row.PaidDate && (
                        <Text style={styles.metaText}>
                          Paid: {fmtDate(row.PaidDate)} by {row.PaidBy}
                        </Text>
                      )}
                      {row.SalesFromDate && (
                        <Text style={styles.metaText}>
                          Cycle: {fmtDate(row.SalesFromDate)} ➔{" "}
                          {fmtDate(row.SalesToDate)}
                        </Text>
                      )}
                      {row.Remarks && (
                        <Text style={styles.remarksText}>
                          Note: {row.Remarks}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom Summary Strip */}
      <View style={styles.bottomStrip}>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>Total Sales</Text>
          <Text style={[styles.stripVal, { color: "#2563EB" }]}>
            ${summaryStats.totalSales.toFixed(0)}
          </Text>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>Total Bonus</Text>
          <Text style={[styles.stripVal, { color: "#A855F7" }]}>
            ${summaryStats.totalBonus.toFixed(0)}
          </Text>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>Total Paid</Text>
          <Text style={[styles.stripVal, { color: "#16A34A" }]}>
            ${summaryStats.totalPaid.toFixed(0)}
          </Text>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>Due</Text>
          <Text style={[styles.stripVal, { color: "#DC2626" }]}>
            ${summaryStats.totalWaiting.toFixed(0)}
          </Text>
        </View>
      </View>

      {/* Date Pickers Modals */}
      <CustomDatePicker
        visible={showFromPicker}
        onClose={() => setShowFromPicker(false)}
        selectedDate={parsedFromDate}
        onApply={(d) => {
          const dStr = getLocalDateStr(d);
          if (toDate && dStr > toDate) {
            showToast({
              type: "warning",
              message: "Invalid Date Range",
              subtitle: "Start date cannot be after End date.",
            });
            return;
          }
          setFromDate(dStr);
        }}
        title="Select Start Date"
      />
      <CustomDatePicker
        visible={showToPicker}
        onClose={() => setShowToPicker(false)}
        selectedDate={parsedToDate}
        onApply={(d) => {
          const dStr = getLocalDateStr(d);
          if (fromDate && dStr < fromDate) {
            showToast({
              type: "warning",
              message: "Invalid Date Range",
              subtitle: "End date cannot be before Start date.",
            });
            return;
          }
          setToDate(dStr);
        }}
        title="Select End Date"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: Fonts.black,
    fontSize: 17,
    color: Theme.textPrimary,
  },
  headerSub: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Theme.textSecondary,
  },
  exportBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },

  // Filters
  filterBar: {
    backgroundColor: Theme.bgCard,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    gap: 10,
    position: "relative",
    zIndex: 1000,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateFieldButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.bgInput,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  dateLabel: {
    fontFamily: Fonts.medium,
    fontSize: 9,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  dateValueText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Theme.textPrimary,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.bgInput,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Theme.textPrimary,
  },

  // Dropdown Autocomplete styles
  dropdownListContainer: {
    backgroundColor: Theme.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    zIndex: 999,
    ...(Platform.select({
      web: { boxShadow: "0 4px 12px rgba(0,0,0,0.1)" },
    }) as any),
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  dropdownItemText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Theme.textPrimary,
  },
  closeDropdownBtn: {
    padding: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    backgroundColor: Theme.bgMuted,
  },
  closeDropdownBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: Theme.textSecondary,
  },

  // KPI grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 },
  kpiCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  kpiValue: { fontFamily: Fonts.black, fontSize: 18 },
  kpiLabel: {
    fontFamily: Fonts.medium,
    fontSize: 10,
    color: Theme.textSecondary,
    marginTop: 4,
  },

  // Filter Tabs
  filterTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  filterTabActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  filterTabText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: Theme.textSecondary,
  },
  filterTabTextActive: { color: "#fff" },

  reportContainer: { paddingHorizontal: 16, paddingBottom: 80 },
  cardList: { gap: 8 },
  rowCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  artistNameText: {
    fontFamily: Fonts.black,
    fontSize: 13,
    color: Theme.textPrimary,
  },
  metricText: {
    fontFamily: Fonts.black,
    fontSize: 14,
    color: Theme.textPrimary,
  },
  rowMeta: { marginTop: 6, gap: 4 },
  metaText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: Theme.textSecondary,
  },
  remarksText: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: Theme.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },

  bottomStrip: {
    flexDirection: "row",
    backgroundColor: Theme.bgCard,
    borderTopWidth: 2,
    borderTopColor: Theme.primary,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  stripCell: { flex: 1, alignItems: "center" },
  stripLabel: {
    fontFamily: Fonts.medium,
    fontSize: 9,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  stripVal: { fontFamily: Fonts.black, fontSize: 15, marginTop: 2 },

  emptyState: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Theme.textSecondary,
  },
});
