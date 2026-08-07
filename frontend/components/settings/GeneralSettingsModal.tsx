import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Theme } from "@/constants/theme";
import { Fonts } from "@/constants/Fonts";
import { useGeneralSettingsStore } from "@/stores/generalSettingsStore";
import { useToast } from "../Toast";
import { API_URL } from "@/constants/Config";

interface GeneralSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

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
    outputRange: [3, 25], // Sleek sliding range: width 50px, thumb 22px, padding 3px.
  });

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["#E2E8F0", Theme.primary],
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

// ── MAIN COMPACT MODAL COMPONENT ──
export default function GeneralSettingsModal({
  visible,
  onClose,
}: GeneralSettingsModalProps) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 500;
  
  const { settings, loading, updateSettings } = useGeneralSettingsStore();

  const [enableKOT, setEnableKOT] = useState(settings.enableKOT);
  const [enableKDS, setEnableKDS] = useState(settings.enableKDS);
  const [enableCheckoutBill, setEnableCheckoutBill] = useState(settings.enableCheckoutBill);
  const [enableCheckoutFlow, setEnableCheckoutFlow] = useState(settings.enableCheckoutFlow);
  const [enableDirectProcessToPay, setEnableDirectProcessToPay] = useState(settings.enableDirectProcessToPay);
  const [customerSideDisplay, setCustomerSideDisplay] = useState(settings.customerSideDisplay);
  const [enableGuestDetailsPopup, setEnableGuestDetailsPopup] = useState(settings.enableGuestDetailsPopup);
  const [enableCashDrawer, setEnableCashDrawer] = useState(settings.enableCashDrawer !== undefined ? settings.enableCashDrawer : true);
  const [SVCIdentification, setSVCIdentification] = useState(settings.SVCIdentification !== undefined ? settings.SVCIdentification : true);
  const [enableKDSPrint, setEnableKDSPrint] = useState(settings.enableKDSPrint !== undefined ? settings.enableKDSPrint : true);
  const [enableCombo, setEnableCombo] = useState(settings.enableCombo !== undefined ? settings.enableCombo : true);
  const [showBillTime, setShowBillTime] = useState(settings.showBillTime !== undefined ? settings.showBillTime : true);
  const [showLoyalty, setShowLoyalty] = useState(settings.showLoyalty !== undefined ? settings.showLoyalty : true);
  const [showRewardPoints, setShowRewardPoints] = useState(settings.showRewardPoints !== undefined ? settings.showRewardPoints : true);
  const [showPromoCode, setShowPromoCode] = useState(settings.showPromoCode !== undefined ? settings.showPromoCode : true);
  const [vipRuleEnabled, setVipRuleEnabled] = useState(settings.vipRuleEnabled !== undefined ? settings.vipRuleEnabled : false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingCashDrawerValue, setPendingCashDrawerValue] = useState<boolean | null>(null);

  const handleToggleCashDrawer = (val: boolean) => {
    setPendingCashDrawerValue(val);
    setPasswordValue("");
    setShowPasswordModal(true);
  };

  const handlePasswordVerify = async () => {
    if (!passwordValue) {
      showToast({ type: "error", message: "Please enter password" });
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
        Alert.alert("Access Denied", "Incorrect admin password");
      }
    } catch (err) {
      Alert.alert("Error", "Could not verify password. Check connection.");
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
  
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const { showToast } = useToast();

  // Entrance animations
  const modalScale = useRef(new Animated.Value(0.96)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  
  // Confirmation Overlay animations
  const confirmScale = useRef(new Animated.Value(0.96)).current;
  const confirmOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setEnableKOT(settings.enableKOT);
      setEnableKDS(settings.enableKDS);
      setEnableCheckoutBill(settings.enableCheckoutBill);
      setCustomerSideDisplay(settings.customerSideDisplay);
      setEnableGuestDetailsPopup(settings.enableGuestDetailsPopup !== undefined ? settings.enableGuestDetailsPopup : true);
      setEnableCashDrawer(settings.enableCashDrawer !== undefined ? settings.enableCashDrawer : true);
      setSVCIdentification(settings.SVCIdentification !== undefined ? settings.SVCIdentification : true);
      setEnableKDSPrint(settings.enableKDSPrint !== undefined ? settings.enableKDSPrint : true);
      setEnableCombo(settings.enableCombo !== undefined ? settings.enableCombo : true);
      setShowBillTime(settings.showBillTime !== undefined ? settings.showBillTime : true);
      setShowLoyalty(settings.showLoyalty !== undefined ? settings.showLoyalty : true);
      setShowRewardPoints(settings.showRewardPoints !== undefined ? settings.showRewardPoints : true);
      setShowPromoCode(settings.showPromoCode !== undefined ? settings.showPromoCode : true);
      setVipRuleEnabled(settings.vipRuleEnabled !== undefined ? settings.vipRuleEnabled : false);
      
      let initialCheckoutFlow = settings.enableCheckoutFlow;
      let initialDirectProcess = settings.enableDirectProcessToPay;
      
      // Enforce mutual exclusion on initial load
      if ((initialCheckoutFlow && initialDirectProcess) || (!initialCheckoutFlow && !initialDirectProcess)) {
        initialCheckoutFlow = true;
        initialDirectProcess = false;
      }
      
      setEnableCheckoutFlow(initialCheckoutFlow);
      setEnableDirectProcessToPay(initialDirectProcess);
      
      Animated.parallel([
        Animated.timing(modalScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.back(1.0)),
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      modalScale.setValue(0.96);
      modalOpacity.setValue(0);
    }
  }, [visible, settings]);

  useEffect(() => {
    if (showConfirmDialog) {
      Animated.parallel([
        Animated.timing(confirmScale, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.back(1.0)),
          useNativeDriver: true,
        }),
        Animated.timing(confirmOpacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      confirmScale.setValue(0.96);
      confirmOpacity.setValue(0);
    }
  }, [showConfirmDialog]);

  const handleSave = () => {
    setShowConfirmDialog(true);
  };

  const performSave = async () => {
    setShowConfirmDialog(false);
    setIsSaving(true);
    
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
      showBillTime,
      showLoyalty,
      showRewardPoints,
      showPromoCode,
      vipRuleEnabled,
    });
    
    setIsSaving(false);

    if (success) {
      showToast({ type: "success", message: "POS Settings updated successfully." });
      onClose();
    } else {
      showToast({ type: "error", message: "Failed to update settings. Please try again." });
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: modalOpacity }]}>
        <Animated.View
          style={[
            styles.modalContent,
            isTablet && { width: "50%", maxWidth: 440 },
            { transform: [{ scale: modalScale }] }
          ]}
        >
          {/* Top Accent Stripe */}
          <View style={styles.topAccentBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <View style={styles.settingsIconBg}>
                <Ionicons name="settings" size={16} color={Theme.primary} />
              </View>
              <View>
                <Text style={styles.headerTitle}>General Settings</Text>
                <Text style={styles.headerSubtitle}>Configure global system preferences</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={Theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {/* Body */}
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {[
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
                  {
                    title: "Show Bill Time",
                    desc: "Print time on Checkout Bill and Re-print Bill.",
                    icon: "time-outline",
                    value: showBillTime,
                    onToggle: setShowBillTime,
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
            ].map((cat, catIdx) => (
              <View key={catIdx} style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <Ionicons name={cat.icon as any} size={14} color={Theme.primary} />
                  <Text style={styles.sectionTitle}>{cat.name}</Text>
                </View>
                <View style={{ gap: 10 }}>
                  {cat.items.map((item, index) => (
                    <View key={index} style={[styles.settingCard, item.value && styles.settingCardActive]}>
                      <View style={styles.cardLeft}>
                        <View style={styles.cardHeaderRow}>
                          <View style={[styles.iconWrapper, item.value ? styles.iconWrapperActive : styles.iconWrapperInactive]}>
                            <Ionicons name={item.icon as any} size={16} color={item.value ? Theme.primary : Theme.textSecondary} />
                          </View>
                          <Text style={styles.settingTitle}>{item.title}</Text>
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
              onPress={onClose}
              disabled={isSaving || loading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.saveBtn, (isSaving || loading) && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={isSaving || loading}
              activeOpacity={0.8}
            >
              {isSaving || loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Settings</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── CUSTOM CONFIRMATION OVERLAY ── */}
          {showConfirmDialog && (
            <Animated.View style={[styles.confirmOverlay, { opacity: confirmOpacity }]}>
              <Animated.View
                style={[
                  styles.confirmCard,
                  { transform: [{ scale: confirmScale }] }
                ]}
              >
                <View style={styles.confirmIconContainer}>
                  <Ionicons name="alert-circle" size={30} color={Theme.warning} />
                </View>
                
                <Text style={styles.confirmTitle}>Confirm Changes</Text>
                
                <Text style={styles.confirmDesc}>
                  Are you sure you want to update settings? These changes will apply globally to all users.
                </Text>
                
                <View style={styles.confirmActions}>
                  <TouchableOpacity
                    style={styles.confirmBtnCancel}
                    onPress={() => setShowConfirmDialog(false)}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.confirmBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.confirmBtnSave}
                    onPress={performSave}
                    disabled={isSaving}
                    activeOpacity={0.8}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmBtnSaveText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </Animated.View>
          )}

          {/* ── ADMIN PASSWORD VERIFICATION MODAL OVERLAY ── */}
          {showPasswordModal && (
            <View style={styles.confirmOverlay}>
              <View style={[styles.confirmCard, { maxWidth: 300 }]}>
                <View style={[styles.confirmIconContainer, { backgroundColor: Theme.primaryLight }]}>
                  <Ionicons name="lock-closed" size={24} color={Theme.primary} />
                </View>
                <Text style={styles.confirmTitle}>Admin Verification</Text>
                <Text style={styles.confirmDesc}>
                  Enter admin password to toggle Cash Drawer settings.
                </Text>
                <TextInput
                  style={[styles.input, { width: "100%", textAlign: "center", marginBottom: 16, fontSize: 18 }]}
                  placeholder="••••"
                  placeholderTextColor={Theme.textMuted}
                  secureTextEntry
                  value={passwordValue}
                  onChangeText={setPasswordValue}
                  onSubmitEditing={handlePasswordVerify}
                  autoFocus
                />
                <View style={styles.confirmActions}>
                  <TouchableOpacity
                    style={styles.confirmBtnCancel}
                    onPress={() => setShowPasswordModal(false)}
                    disabled={verifyingPassword}
                  >
                    <Text style={styles.confirmBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmBtnSave}
                    onPress={handlePasswordVerify}
                    disabled={verifyingPassword}
                  >
                    {verifyingPassword ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmBtnSaveText}>Verify</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#FAF9F6",
    color: Theme.textPrimary,
    fontFamily: Fonts.medium,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingLeft: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  // Overlay & Modal Card
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)", // Dim overlay
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  topAccentBar: {
    height: 4,
    backgroundColor: Theme.primary,
    width: "100%",
  },
  
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.bgCard,
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  settingsIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Theme.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  headerSubtitle: {
    fontSize: 10.5,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 0.5,
  },
  closeBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  
  // Body & Setting Cards
  body: {
    padding: 16,
    gap: 10,
  },
  scrollContainer: {
    maxHeight: 380,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
  },
  settingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: "#FAF9F6", // Light cream
    gap: 12,
  },
  settingCardActive: {
    backgroundColor: Theme.primaryLight,
    borderColor: Theme.primaryBorder,
  },
  cardLeft: {
    flex: 1,
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrapperActive: {
    backgroundColor: "rgba(249,115,22,0.14)",
  },
  iconWrapperInactive: {
    backgroundColor: "#E2E8F0",
  },
  settingTitle: {
    fontSize: 13.5,
    fontFamily: Fonts.semiBold,
    color: Theme.textPrimary,
  },
  settingDesc: {
    fontSize: 10.5,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    lineHeight: 15,
    paddingLeft: 36, // Align with title text (28px icon + 8px gap)
  },
  
  // Status Badges & Dots
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeActive: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.2)",
  },
  statusBadgeInactive: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusDotActive: {
    backgroundColor: "#22C55E",
  },
  statusDotInactive: {
    backgroundColor: "#94A3B8",
  },
  statusBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.bold,
  },
  statusBadgeTextActive: {
    color: "#16A34A",
  },
  statusBadgeTextInactive: {
    color: "#64748B",
  },

  // Custom Switch Styles
  switchTouchArea: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  switchContainer: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.bgCard,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 2,
  },
  
  // Footer
  footer: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    backgroundColor: Theme.bgCard,
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Theme.textSecondary,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    ...Theme.shadowSm,
  },
  saveBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },

  // ── Custom Confirmation Alert Overlay ──
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.6)", // Dark Slate Backdrop
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 100,
  },
  confirmCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 20,
    width: "90%",
    maxWidth: 320,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  confirmIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    marginBottom: 6,
    textAlign: "center",
  },
  confirmDesc: {
    fontSize: 11.5,
    fontFamily: Fonts.regular,
    color: Theme.textSecondary,
    lineHeight: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  confirmBtnCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
    alignItems: "center",
  },
  confirmBtnCancelText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Theme.textSecondary,
  },
  confirmBtnSave: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    ...Theme.shadowSm,
  },
  confirmBtnSaveText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
});
