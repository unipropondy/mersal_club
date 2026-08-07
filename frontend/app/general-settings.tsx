import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Animated,
  Easing,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";
import { useGeneralSettingsStore } from "../stores/generalSettingsStore";
import { useToast } from "../components/Toast";
import { API_URL } from "../constants/Config";
import { useAuthStore } from "../stores/authStore";

// ── SLEEK COMPACT ANIMATED SWITCH COMPONENT ──
interface CustomSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}

const CustomSwitch = ({ value, onValueChange, disabled = false }: CustomSwitchProps) => {
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [value]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 25],
  });

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [Theme.border, Theme.primary],
  });

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.8}
      onPress={() => !disabled && onValueChange(!value)}
      style={styles.switchTouchArea}
    >
      <Animated.View
        style={[
          styles.switchContainer,
          { backgroundColor },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Animated.View
          style={[
            styles.switchThumb,
            { transform: [{ translateX }] },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

export default function GeneralSettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  const { settings, loading, fetchSettings, updateSettings } = useGeneralSettingsStore();

  // Local setting states
  const [enableKOT, setEnableKOT] = useState(settings.enableKOT !== undefined ? settings.enableKOT : true);
  const [enableKDS, setEnableKDS] = useState(settings.enableKDS !== undefined ? settings.enableKDS : true);
  const [enableCheckoutBill, setEnableCheckoutBill] = useState(settings.enableCheckoutBill !== undefined ? settings.enableCheckoutBill : true);
  const [enableCheckoutFlow, setEnableCheckoutFlow] = useState(settings.enableCheckoutFlow !== undefined ? settings.enableCheckoutFlow : true);
  const [enableDirectProcessToPay, setEnableDirectProcessToPay] = useState(settings.enableDirectProcessToPay !== undefined ? settings.enableDirectProcessToPay : false);
  const [customerSideDisplay, setCustomerSideDisplay] = useState(settings.customerSideDisplay !== undefined ? settings.customerSideDisplay : true);
  const [enableGuestDetailsPopup, setEnableGuestDetailsPopup] = useState(settings.enableGuestDetailsPopup !== undefined ? settings.enableGuestDetailsPopup : true);
  const [enableCashDrawer, setEnableCashDrawer] = useState(settings.enableCashDrawer !== undefined ? settings.enableCashDrawer : true);
  const [SVCIdentification, setSVCIdentification] = useState(settings.SVCIdentification !== undefined ? settings.SVCIdentification : true);
  const [enableKDSPrint, setEnableKDSPrint] = useState(settings.enableKDSPrint !== undefined ? settings.enableKDSPrint : true);
  const [enableCombo, setEnableCombo] = useState(settings.enableCombo !== undefined ? settings.enableCombo : true);
  const [showLoyalty, setShowLoyalty] = useState(settings.showLoyalty !== undefined ? settings.showLoyalty : true);
  const [showRewardPoints, setShowRewardPoints] = useState(settings.showRewardPoints !== undefined ? settings.showRewardPoints : true);
  const [showPromoCode, setShowPromoCode] = useState(settings.showPromoCode !== undefined ? settings.showPromoCode : true);
  const [vipRuleEnabled, setVipRuleEnabled] = useState(settings.vipRuleEnabled !== undefined ? settings.vipRuleEnabled : false);


  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingCashDrawerValue, setPendingCashDrawerValue] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    setEnableKOT(settings.enableKOT);
    setEnableKDS(settings.enableKDS);
    setEnableCheckoutBill(settings.enableCheckoutBill);
    setCustomerSideDisplay(settings.customerSideDisplay);
    setEnableGuestDetailsPopup(settings.enableGuestDetailsPopup !== undefined ? settings.enableGuestDetailsPopup : true);
    setEnableCashDrawer(settings.enableCashDrawer !== undefined ? settings.enableCashDrawer : true);
    setSVCIdentification(settings.SVCIdentification !== undefined ? settings.SVCIdentification : true);
    setEnableKDSPrint(settings.enableKDSPrint !== undefined ? settings.enableKDSPrint : true);
    setEnableCombo(settings.enableCombo !== undefined ? settings.enableCombo : true);
    setShowLoyalty(settings.showLoyalty !== undefined ? settings.showLoyalty : true);
    setShowRewardPoints(settings.showRewardPoints !== undefined ? settings.showRewardPoints : true);
    setShowPromoCode(settings.showPromoCode !== undefined ? settings.showPromoCode : true);
    setVipRuleEnabled(settings.vipRuleEnabled !== undefined ? settings.vipRuleEnabled : false);


    let initialCheckoutFlow = settings.enableCheckoutFlow;
    let initialDirectProcess = settings.enableDirectProcessToPay;

    if ((initialCheckoutFlow && initialDirectProcess) || (!initialCheckoutFlow && !initialDirectProcess)) {
      initialCheckoutFlow = true;
      initialDirectProcess = false;
    }

    setEnableCheckoutFlow(initialCheckoutFlow);
    setEnableDirectProcessToPay(initialDirectProcess);
  }, [settings]);

  const handleToggleCashDrawer = (val: boolean) => {
    setPendingCashDrawerValue(val);
    setPasswordValue("");
    setShowPasswordModal(true);
  };

  const handlePasswordVerify = async () => {
    if (!passwordValue) {
      showToast({ type: "warning", message: "Please enter password" });
      return;
    }
    setVerifyingPassword(true);
    try {
      const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordValue }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.success) {
        if (pendingCashDrawerValue !== null) {
          setEnableCashDrawer(pendingCashDrawerValue);
        }
        setShowPasswordModal(false);
        showToast({ type: "success", message: "Access Unlocked" });
      } else {
        if (Platform.OS === "web") {
          window.alert("Incorrect admin password");
        } else {
          Alert.alert("Access Denied", "Incorrect admin password");
        }
      }
    } catch (err) {
      if (Platform.OS === "web") {
        window.alert("Could not verify password. Check connection.");
      } else {
        Alert.alert("Error", "Could not verify password. Check connection.");
      }
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleToggleCheckoutFlow = (val: boolean) => {
    if (val) {
      setEnableCheckoutFlow(true);
      setEnableDirectProcessToPay(false);
    } else {
      setEnableCheckoutFlow(false);
      setEnableDirectProcessToPay(true);
    }
  };

  const handleToggleDirectProcessToPay = (val: boolean) => {
    if (val) {
      setEnableDirectProcessToPay(true);
      setEnableCheckoutFlow(false);
    } else {
      setEnableDirectProcessToPay(false);
      setEnableCheckoutFlow(true);
    }
  };

  const handleSave = () => {
    setShowConfirmModal(true);
  };

  const performSave = async () => {
    setSaving(true);
    const success = await updateSettings({
      enableKOT,
      enableKDS,
      enableCheckoutBill,
      enableCheckoutFlow,
      enableDirectProcessToPay,
      customerSideDisplay,
      enableGuestDetailsPopup,
      enableCashDrawer,
      SVCIdentification,
      enableKDSPrint,
      enableCombo,
      showLoyalty,
      showRewardPoints,
      showPromoCode,
      vipRuleEnabled,
    });
    setSaving(false);

    if (success) {
      showToast({ type: "success", message: "Settings saved successfully." });
      router.replace("/(tabs)/category" as any);
    } else {
      showToast({ type: "error", message: "Failed to save settings. Please try again." });
    }
  };

  const categories = [
    {
      name: "Workflow & Operations",
      icon: "git-network-outline",
      items: [
        {
          title: "Guest Details Popup",
          desc: "Show guest info details popup before entering order screen.",
          icon: "people-outline",
          value: enableGuestDetailsPopup,
          onToggle: setEnableGuestDetailsPopup,
        },
        {
          title: "Enable Checkout Flow",
          desc: "Enable order summary checkout step.",
          icon: "git-compare-outline",
          value: enableCheckoutFlow,
          onToggle: handleToggleCheckoutFlow,
        },
        {
          title: "Enable Direct Process To Pay",
          desc: "Show 'Process To Pay' shortcut button in Cart Sidebar.",
          icon: "card-outline",
          value: enableDirectProcessToPay,
          onToggle: handleToggleDirectProcessToPay,
        },
        {
          title: "Combo Feature",
          desc: "Enable combo menu items and selections wizard.",
          icon: "fast-food-outline",
          value: enableCombo,
          onToggle: setEnableCombo,
        },
      ]
    },
    {
      name: "Receipts & Screen Displays",
      icon: "print-outline",
      items: [
        {
          title: "KOT (Kitchen Order Ticket)",
          desc: "Enable kitchen ticket printing.",
          icon: "receipt-outline",
          value: enableKOT,
          onToggle: setEnableKOT,
        },
        {
          title: "Checkout Bill",
          desc: "Enable checkout receipt printing.",
          icon: "wallet-outline",
          value: enableCheckoutBill,
          onToggle: setEnableCheckoutBill,
        },
        {
          title: "Order Hub (Order Display)",
          desc: "Show Order Hub screen.",
          icon: "desktop-outline",
          value: enableKDS,
          onToggle: setEnableKDS,
        },
        {
          title: "Customer-Side Display",
          desc: "Enable/disable secondary customer screen sync.",
          icon: "tv-outline",
          value: customerSideDisplay,
          onToggle: setCustomerSideDisplay,
        },
        {
          title: "KDS Printer Button",
          desc: "Show the PRINT button on every order card in KDS screen.",
          icon: "print-outline",
          value: enableKDSPrint,
          onToggle: setEnableKDSPrint,
        },
      ]
    },
    {
      name: "Drawer & Charges",
      icon: "cash-outline",
      items: [
        {
          title: "Enable Cash Drawer Module",
          desc: "Enable checkout cashbox opening triggers.",
          icon: "wallet-outline",
          value: enableCashDrawer,
          onToggle: handleToggleCashDrawer,
        },
        {
          title: "SVC Identification",
          desc: "Highlight Service (SVC) items with red identification.",
          icon: "pricetag-outline",
          value: SVCIdentification,
          onToggle: setSVCIdentification,
        },
      ]
    },
    {
      name: "Loyalty & Promotions",
      icon: "gift-outline",
      items: [
        {
          title: "Enable VIP Flow",
          desc: "Configure automatic VIP threshold promos and active rules.",
          icon: "people-circle-outline",
          value: vipRuleEnabled,
          onToggle: setVipRuleEnabled,
        },
        {
          title: "Loyalty Feature",
          desc: "Show the Loyalty button in the POS Summary screen.",
          icon: "ribbon-outline",
          value: showLoyalty,
          onToggle: setShowLoyalty,
        },
        {
          title: "Reward Points Feature",
          desc: "Show the Reward Points button in the POS Summary screen.",
          icon: "gift-outline",
          value: showRewardPoints,
          onToggle: setShowRewardPoints,
        },
        {
          title: "Promo Code Feature",
          desc: "Show the Promo Code button in the POS Summary screen.",
          icon: "pricetag-outline",
          value: showPromoCode,
          onToggle: setShowPromoCode,
        },
      ]
    }
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/menu/settlement" as any);
            }
          }} 
          style={styles.backBtn} 
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="settings" size={22} color={Theme.primary} />
            <Text style={styles.headerTitle}>General Settings</Text>
          </View>
        </View>
      </View>

      {/* Body Grid */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {categories.map((cat, catIdx) => (
          <View key={catIdx} style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name={cat.icon as any} size={18} color={Theme.primary} />
              <Text style={styles.sectionTitle}>{cat.name}</Text>
            </View>
            <View style={styles.gridContainer}>
              {cat.items.map((item, index) => (
                <View
                  key={index}
                  style={[
                    styles.settingCard,
                    item.value && styles.settingCardActive,
                    isTablet ? styles.cardTablet : styles.cardMobile,
                  ]}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.iconWrapper, item.value ? styles.iconWrapperActive : styles.iconWrapperInactive]}>
                        <Ionicons name={item.icon as any} size={18} color={item.value ? Theme.primary : Theme.textSecondary} />
                      </View>
                      <Text style={styles.settingTitle} numberOfLines={1}>{item.title}</Text>
                    </View>
                    <Text style={styles.settingDesc}>{item.desc}</Text>
                  </View>
                  <CustomSwitch value={item.value} onValueChange={item.onToggle} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/menu/settlement" as any);
            }
          }}
          disabled={saving || loading}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, (saving || loading) && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving || loading}
          activeOpacity={0.8}
        >
          {saving || loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Settings</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Admin Password Modal for Cash Drawer toggle verification */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.pwOverlay}>
          <View style={styles.pwModalContent}>
            <View style={styles.pwHeader}>
              <Text style={styles.pwTitle}>Admin Verification Required</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.pwClose}>
                <Ionicons name="close" size={20} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.pwBody}>
              <Text style={styles.pwDesc}>Please enter admin password to unlock Cash Drawer settings.</Text>
              <TextInput
                style={styles.pwInput}
                secureTextEntry
                placeholder="Enter password..."
                value={passwordValue}
                onChangeText={setPasswordValue}
                onSubmitEditing={handlePasswordVerify}
                autoFocus
              />
              <TouchableOpacity
                style={styles.pwBtn}
                onPress={handlePasswordVerify}
                disabled={verifyingPassword}
                activeOpacity={0.8}
              >
                {verifyingPassword ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.pwBtnText}>Verify Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Save Changes Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.pwOverlay}>
          <View style={styles.pwModalContent}>
            <View style={styles.pwHeader}>
              <Text style={styles.pwTitle}>Confirm Changes</Text>
              <TouchableOpacity onPress={() => setShowConfirmModal(false)} style={styles.pwClose}>
                <Ionicons name="close" size={20} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.pwBody}>
              <Text style={styles.pwDesc}>Are you sure you want to update settings? These changes will apply globally to all users.</Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1, height: 44 }]}
                  onPress={() => setShowConfirmModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pwBtn, { flex: 1, height: 44, marginTop: 0 }]}
                  onPress={() => {
                    setShowConfirmModal(false);
                    performSave();
                  }}
                >
                  <Text style={styles.pwBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingLeft: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  header: {
    height: 72,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.bgNav,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    position: "relative",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    left: 24,
    padding: 8,
    borderRadius: 10,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
    zIndex: 10,
  },
  headerTitleContainer: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  settingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#172B4D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  settingCardActive: {
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.primary,
    borderLeftWidth: 4,
    borderLeftColor: Theme.primary,
    shadowColor: Theme.primary,
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  cardMobile: {
    width: "100%",
  },
  cardTablet: {
    width: "49%",
  },
  cardLeft: {
    flex: 1,
    paddingRight: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapperActive: {
    backgroundColor: Theme.primary + "15",
  },
  iconWrapperInactive: {
    backgroundColor: Theme.bgMuted,
  },
  settingTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    flex: 1,
  },
  settingDesc: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  switchTouchArea: {
    paddingVertical: 4,
  },
  switchContainer: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.bgCard,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  footer: {
    padding: 20,
    backgroundColor: Theme.bgNav,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelBtn: {
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bgMuted,
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  saveBtn: {
    height: 46,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  pwOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  pwModalContent: {
    width: 380,
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  pwHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  pwTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  pwClose: {
    padding: 4,
  },
  pwBody: {
    gap: 16,
  },
  pwDesc: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  pwInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Theme.textPrimary,
    outlineWidth: 0,
  },
  pwBtn: {
    height: 44,
    backgroundColor: Theme.primary,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  pwBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#fff",
  },

});
