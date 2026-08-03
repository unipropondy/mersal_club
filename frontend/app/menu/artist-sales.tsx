import { API_URL } from "@/constants/Config";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "../../components/Toast";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useRouter } from "expo-router";
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
import { artistDateState } from "@/stores/artistDateStore";
import { formatToSingaporeTime } from "@/utils/timezoneHelper";

interface CustomDatePickerProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onApply: (date: Date) => void;
  title: string;
}

function CustomDatePicker({ visible, onClose, selectedDate, onApply, title }: CustomDatePickerProps) {
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

  const prevMonth = () => { setViewDate(new Date(year, month - 1, 1)); };
  const nextMonth = () => { setViewDate(new Date(year, month + 1, 1)); };

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
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={[pickerStyles.modalContainer, { width: isTablet ? 360 : '90%', padding: 16 }]}>
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.headerTitle}>{title}</Text>
            <TouchableOpacity style={pickerStyles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color="#44403C" />
            </TouchableOpacity>
          </View>

          <View style={{ width: '100%' }}>
            <View style={pickerStyles.calNavigator}>
              <TouchableOpacity onPress={prevMonth} style={pickerStyles.navBtn}>
                <Ionicons name="chevron-back" size={16} color="#44403C" />
              </TouchableOpacity>
              <Text style={pickerStyles.monthYearText}>{monthNames[month]} {year}</Text>
              <TouchableOpacity onPress={nextMonth} style={pickerStyles.navBtn}>
                <Ionicons name="chevron-forward" size={16} color="#44403C" />
              </TouchableOpacity>
            </View>

            <View style={pickerStyles.weekdaysRow}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((wd, i) => (
                <Text key={i} style={pickerStyles.weekdayText}>{wd}</Text>
              ))}
            </View>

            <View style={pickerStyles.daysGrid}>
              {days.map((dObj, idx) => {
                const isSelected = selectedDay.getDate() === dObj.day &&
                  selectedDay.getMonth() === dObj.month &&
                  selectedDay.getFullYear() === dObj.year;

                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleDaySelect(dObj)}
                    style={[
                      pickerStyles.dayBtn,
                      isSelected && pickerStyles.dayBtnSelected
                    ]}
                  >
                    <Text style={[
                      pickerStyles.dayText,
                      !dObj.isCurrentMonth && pickerStyles.dayTextInactive,
                      isSelected && pickerStyles.dayTextSelected
                    ]}>
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
            <TouchableOpacity style={pickerStyles.applyBtn} onPress={handleApply}>
              <Text style={pickerStyles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  modalContainer: { backgroundColor: Theme.bgCard, borderRadius: 20, maxWidth: '95%', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 16 },
  headerTitle: { fontSize: 16, fontFamily: Fonts.black, color: Theme.textPrimary },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  calNavigator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 8 },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' },
  monthYearText: { fontSize: 14, fontFamily: Fonts.black, color: Theme.textPrimary },
  weekdaysRow: { flexDirection: 'row', marginBottom: 8 },
  weekdayText: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: Fonts.bold, color: Theme.textMuted },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayBtn: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 2, borderRadius: 8 },
  dayBtnSelected: { backgroundColor: '#A855F7' },
  dayText: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary },
  dayTextInactive: { color: '#D1D5DB' },
  dayTextSelected: { color: '#fff' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#F5F5F4', justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontFamily: Fonts.black, color: '#44403C' },
  applyBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#A855F7', justifyContent: 'center', alignItems: 'center' },
  applyBtnText: { fontSize: 13, fontFamily: Fonts.black, color: '#fff' }
});

interface ArtistRow {
  dishId: string;
  name: string;
  totalSales: number;
  bonusEarned: number;
  bonusPaid: number;
  pendingBonus: number;
  lifetimeOutstanding: number;
  status: string;
  thresholdAmount: number;
  thresholdReached: boolean;
  progressPct: number;
  remainingToThreshold: number;
}

interface EventLog {
  time: string;
  billNo: string;
  artistName: string;
  amount: number;
  remaining: number;
  milestoneReached: boolean;
}

export default function ArtistSalesScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading]         = useState(false);
  const [fromDate, setFromDate]       = useState("");
  const [toDate, setToDate]           = useState("");

  const handleFromDateChange = (v: string) => { artistDateState.fromDate = v; setFromDate(v); };
  const handleToDateChange   = (v: string) => { artistDateState.toDate = v; setToDate(v);   };

  const [isDayActive, setIsDayActive]   = useState(false);
  const [activeDay, setActiveDay]       = useState<string | null>(null);
  const [isActiveDayView, setIsActiveDayView] = useState(true);

  const [search, setSearch]           = useState("");
  const [artists, setArtists]         = useState<ArtistRow[]>([]);
  const [activeRule, setActiveRule]   = useState<any>(null);
  const [events, setEvents]           = useState<EventLog[]>([]);

  // Calendar Picker States
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);

  const parsedFromDate = useMemo(() => fromDate ? new Date(fromDate) : new Date(), [fromDate]);
  const parsedToDate   = useMemo(() => toDate ? new Date(toDate) : new Date(), [toDate]);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const getLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const fetchData = useCallback(async (explicitFrom?: string, explicitTo?: string, isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const from = explicitFrom !== undefined ? explicitFrom : fromDate;
      const to   = explicitTo   !== undefined ? explicitTo   : toDate;
      const params = from && to ? `?fromDate=${from}&toDate=${to}` : "";
      const res = await axios.get(
        `${API_URL}/api/artist-bonus/sales-summary${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setArtists(res.data.artists || []);
        setActiveRule(res.data.activeRule);
        setIsDayActive(res.data.isDayActive ?? false);
        setActiveDay(res.data.activeDay ?? null);
        setIsActiveDayView(res.data.isActiveDayView ?? true);
        
        const mockEvents: EventLog[] = [];
        const now = new Date();
        
        res.data.artists.slice(0, 3).forEach((a: any, i: number) => {
          const t = new Date(now.getTime() - i * 15 * 60000);
          const timeStr = formatToSingaporeTime(t);
          
          if (a.totalSales > 0) {
            mockEvents.push({
              time: timeStr,
              billNo: "",
              artistName: a.name,
              amount: a.totalSales,
              remaining: a.remainingToThreshold,
              milestoneReached: a.thresholdReached,
            });
          }
        });
        setEvents(mockEvents);
      }
    } catch (err: any) {
      showToast({ type: "error", message: "Load Failed", subtitle: err.message });
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, token]);

  useEffect(() => {
    fetchData("", "", false);
    const timer = setInterval(() => {
      if (isDayActive) {
        fetchData(fromDate, toDate, true);
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [isDayActive, fromDate, toDate]);

  const filtered = artists.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

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
          <Text style={styles.headerTitle}>Live Sales Monitor</Text>
          <Text style={styles.headerSub}>{filtered.length} artists active today</Text>
        </View>
      </View>

      {/* Filters Bar */}
      <View style={styles.filterBar}>
        <View style={[
          styles.activeDayBar,
          { backgroundColor: isDayActive ? "rgba(59,130,246,0.14)" : "rgba(255,255,255,0.03)", borderColor: isDayActive ? "#3B82F6" : Theme.border }
        ]}>
          <View style={[styles.activeDot, { backgroundColor: isDayActive ? "#3B82F6" : "#78716C" }]} />
          <Text style={[styles.activeDayText, { color: isDayActive ? "#93C5FD" : "#78716C" }]}>
            {isDayActive
              ? (isActiveDayView ? `Live Day: ${activeDay}` : `Viewing: ${fromDate} – ${toDate}`)
              : "No Active Day — Historical Mode"}
          </Text>
          {isDayActive && <Text style={styles.liveUpdatingText}>Live updating...</Text>}
        </View>

        {/* Historical Lookup Calendar triggers */}
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateFieldButton} onPress={() => setShowFromPicker(true)}>
            <Text style={styles.dateButtonText}>
              {fromDate || "From Date"}
            </Text>
            <Ionicons name="calendar-outline" size={16} color={Theme.textSecondary} />
          </TouchableOpacity>
          <Ionicons name="arrow-forward" size={14} color={Theme.textMuted} />
          <TouchableOpacity style={styles.dateFieldButton} onPress={() => setShowToPicker(true)}>
            <Text style={styles.dateButtonText}>
              {toDate || "To Date"}
            </Text>
            <Ionicons name="calendar-outline" size={16} color={Theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.searchApplyBtn}
            onPress={() => { if (fromDate && toDate) fetchData(fromDate, toDate); else fetchData("", ""); }}
          >
            <Ionicons name="search" size={16} color="#fff" />
          </TouchableOpacity>
          {(fromDate || toDate) && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => { handleFromDateChange(""); handleToDateChange(""); fetchData("", ""); }}
            >
              <Ionicons name="close-circle" size={20} color={Theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {loading && <ActivityIndicator size="large" color={Theme.primary} style={{ marginTop: 20 }} />}

        {/* ── LIVE EVENTS FEED ── */}
        {isDayActive && events.length > 0 && (
          <View style={styles.eventsCard}>
            <View style={styles.eventsHeader}>
              <Ionicons name="flash" size={16} color="#2563EB" />
              <Text style={styles.eventsTitle}>Live Feed Log</Text>
            </View>
            {events.map((ev, i) => (
              <View key={i} style={styles.eventRow}>
                {ev.milestoneReached ? (
                  <View style={styles.eventMilestoneRow}>
                    <Text style={styles.eventCelebration}>🎉</Text>
                    <Text style={styles.eventText}>
                      <Text style={{ fontFamily: Fonts.black }}>{ev.artistName}</Text> earned <Text style={styles.earnedText}>+${activeRule?.BonusAmount || 50} Bonus</Text>!
                    </Text>
                    <Text style={styles.eventTime}>{ev.time}</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <Text style={styles.eventTime}>{ev.time}</Text>
                      <Text style={styles.eventText}>
                        <Text style={{ fontFamily: Fonts.bold }}>{ev.artistName}</Text> · Today's Sales: <Text style={{ fontFamily: Fonts.bold }}>${ev.amount.toFixed(0)}</Text>
                      </Text>
                    </View>
                    <Text style={styles.eventRemainingText}>Need ${ev.remaining} for next bonus</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── ARTIST SALES LIST ── */}
        <View style={[styles.cardsContainer, { flexDirection: width >= 768 ? "row" : "column", flexWrap: width >= 768 ? "wrap" : "nowrap", justifyContent: "space-between" }]}>
          {filtered.map((a) => {
            const hasEarned = a.bonusEarned > 0;
            const threshold = a.thresholdAmount || activeRule?.ThresholdAmount || 500;
            const reward = activeRule?.BonusAmount || 50;
            const progress = a.progressPct || 0;

            return (
              <TouchableOpacity
                key={a.dishId}
                style={[styles.artistCard, { width: width >= 768 ? "49%" : "100%" }]}
                onPress={() => router.push(`/menu/artist-detail?dishId=${a.dishId}`)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardAvatar}>
                    <Text style={styles.cardAvatarText}>{a.name[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistNameText}>{a.name}</Text>
                    <Text style={styles.todaySalesLabel}>Today's Sales</Text>
                    <Text style={styles.todaySalesText}>${a.totalSales.toFixed(2)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.bonusLabel}>Current Bonus</Text>
                    <Text style={[styles.bonusText, { color: hasEarned ? "#2563EB" : "#78716C" }]}>
                      ${a.bonusEarned.toFixed(0)}
                    </Text>
                  </View>
                </View>

                {/* Progress bar with percentage inside */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]}>
                      {progress >= 15 && (
                        <Text style={styles.progressFillText}>{progress.toFixed(0)}%</Text>
                      )}
                    </View>
                    {progress < 15 && (
                      <Text style={styles.progressTrackText}>{progress.toFixed(0)}%</Text>
                    )}
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  {a.totalSales >= threshold ? (
                    <Text style={styles.motivationText}>
                      Need <Text style={{ fontFamily: Fonts.bold, color: "#2563EB" }}>${a.remainingToThreshold.toFixed(0)}</Text> for next bonus
                    </Text>
                  ) : (
                    <Text style={styles.motivationText}>
                      Need <Text style={{ fontFamily: Fonts.bold, color: "#2563EB" }}>${a.remainingToThreshold.toFixed(0)}</Text> to earn first bonus
                    </Text>
                  )}
                  <View style={styles.rewardTag}>
                    <Text style={styles.rewardTagText}>+${reward} Next Reward</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {filtered.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes-outline" size={48} color={Theme.textMuted} />
              <Text style={styles.emptyTitle}>No Live Performers</Text>
              <Text style={styles.emptySubtitle}>No artists have recorded sales during this business day.</Text>
            </View>
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Date Pickers Modals */}
      <CustomDatePicker
        visible={showFromPicker}
        onClose={() => setShowFromPicker(false)}
        selectedDate={parsedFromDate}
        onApply={(d) => handleFromDateChange(getLocalDateStr(d))}
        title="Select Start Date"
      />
      <CustomDatePicker
        visible={showToPicker}
        onClose={() => setShowToPicker(false)}
        selectedDate={parsedToDate}
        onApply={(d) => handleToDateChange(getLocalDateStr(d))}
        title="Select End Date"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: Theme.bgCard,
    borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 10,
    ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" } }) as any,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: Fonts.black, fontSize: 17, color: Theme.textPrimary },
  headerSub: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary, marginTop: 1 },

  // Filters
  filterBar: { backgroundColor: Theme.bgCard, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 10 },
  activeDayBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  activeDayText: { fontFamily: Fonts.bold, fontSize: 12, flex: 1 },
  liveUpdatingText: { fontFamily: Fonts.bold, fontSize: 10, color: "#2563EB", textTransform: "uppercase" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateFieldButton: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Theme.bgInput, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: Theme.border,
  },
  dateButtonText: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textPrimary },
  searchApplyBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Theme.primary, justifyContent: "center", alignItems: "center" },
  clearBtn: { padding: 4 },

  // Events Feed
  eventsCard: { backgroundColor: "rgba(37,99,235,0.12)", margin: 16, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(37,99,235,0.3)" },
  eventsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  eventsTitle: { fontFamily: Fonts.black, fontSize: 12, color: "#93C5FD", textTransform: "uppercase", letterSpacing: 0.5 },
  eventRow: { borderBottomWidth: 1, borderBottomColor: "rgba(37,99,235,0.15)", paddingVertical: 8 },
  eventMilestoneRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  eventCelebration: { marginRight: 6 },
  eventText: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textPrimary, flex: 1 },
  eventTime: { fontFamily: Fonts.bold, fontSize: 10, color: Theme.textMuted },
  eventBill: { fontFamily: Fonts.bold, fontSize: 10, color: "#2563EB", backgroundColor: "#DBEAFE", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, marginRight: 6 },
  eventRemainingText: { fontFamily: Fonts.bold, fontSize: 10, color: "#2563EB" },
  earnedText: { fontFamily: Fonts.black, color: "#16A34A" },

  // Cards List
  cardsContainer: { padding: 16, gap: 12 },
  artistCard: {
    backgroundColor: Theme.bgCard, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Theme.border,
    ...Platform.select({ web: { boxShadow: "0 2px 8px rgba(0,0,0,0.05)" } }) as any,
  },
  cardHeader: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 12 },
  cardAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.primaryLight, justifyContent: "center", alignItems: "center" },
  cardAvatarText: { fontFamily: Fonts.black, fontSize: 15, color: Theme.primary },
  artistNameText: { fontFamily: Fonts.black, fontSize: 15, color: Theme.textPrimary },
  todaySalesLabel: { fontFamily: Fonts.medium, fontSize: 9, color: Theme.textMuted, textTransform: "uppercase", marginTop: 2 },
  todaySalesText: { fontFamily: Fonts.black, fontSize: 14, color: Theme.textPrimary },
  bonusLabel: { fontFamily: Fonts.medium, fontSize: 9, color: Theme.textMuted, textTransform: "uppercase" },
  bonusText: { fontFamily: Fonts.black, fontSize: 18 },

  // Progress Bar
  progressContainer: { marginBottom: 12 },
  progressTrack: { height: 20, backgroundColor: Theme.bgMuted, borderRadius: 10, overflow: "hidden", position: "relative", justifyContent: "center" },
  progressFill: { height: "100%", backgroundColor: "#2563EB", borderRadius: 10, justifyContent: "center", alignItems: "flex-end", paddingRight: 10 },
  progressFillText: { fontFamily: Fonts.black, fontSize: 10, color: "#fff" },
  progressTrackText: { fontFamily: Fonts.black, fontSize: 10, color: Theme.textSecondary, position: "absolute", left: 10 },

  // Footer
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  motivationText: { fontFamily: Fonts.medium, fontSize: 12, color: Theme.textSecondary },
  rewardTag: { backgroundColor: "rgba(37,99,235,0.15)", borderWidth: 1, borderColor: "rgba(37,99,235,0.3)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rewardTagText: { fontFamily: Fonts.black, fontSize: 11, color: "#93C5FD" },

  emptyState: { alignItems: "center", paddingVertical: 80, gap: 8 },
  emptyTitle: { fontFamily: Fonts.black, fontSize: 16, color: Theme.textPrimary },
  emptySubtitle: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textSecondary, textAlign: "center" },
});
