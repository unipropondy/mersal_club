import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";
import { API_URL } from "../constants/Config";

export interface GeneralSettings {
  enableKOT: boolean;
  enableKDS: boolean;
  enableCheckoutBill: boolean;
  enableCheckoutFlow: boolean;
  enableDirectProcessToPay: boolean;
  customerSideDisplay: boolean;
  enableGuestDetailsPopup: boolean;
  enableCashDrawer: boolean;
  SVCIdentification: boolean;
  enableKDSPrint: boolean;
  enableCombo: boolean;
  showBillTime: boolean;
  showLoyalty: boolean;
  showRewardPoints: boolean;
  showPromoCode: boolean;
  vipThreshold: number;
  vipRuleEnabled: boolean;
  vipRuleTargetType: "DISH" | "GROUP" | null;
  vipRuleDishId: string | null;
  vipRuleDishGroupId: string | null;
  vipRuleDiscountType: "PERCENTAGE" | "AMOUNT" | null;
  vipRuleDiscountValue: number;
}

interface GeneralSettingsState {
  settings: GeneralSettings;
  loading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<GeneralSettings>) => Promise<boolean>;
}

export const useGeneralSettingsStore = create<GeneralSettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        enableKOT: true,
        enableKDS: true,
        enableCheckoutBill: true,
        enableCheckoutFlow: true,
        enableDirectProcessToPay: false,
        customerSideDisplay: true,
        enableGuestDetailsPopup: true,
        enableCashDrawer: true,
        SVCIdentification: true,
        enableKDSPrint: true,
        enableCombo: true,
        showBillTime: true,
        showLoyalty: true,
        showRewardPoints: true,
        showPromoCode: true,
        vipThreshold: 5000,
        vipRuleEnabled: false,
        vipRuleTargetType: null,
        vipRuleDishId: null,
        vipRuleDishGroupId: null,
        vipRuleDiscountType: null,
        vipRuleDiscountValue: 0,
      },
      loading: false,

      fetchSettings: async () => {
        set({ loading: true });
        try {
          const response = await fetch(`${API_URL}/api/settings`);
          const data = await response.json();
          
          if (data) {
            set((state) => ({
              settings: {
                ...state.settings,
                enableKOT: data.EnableKOT !== undefined ? Boolean(data.EnableKOT) : true,
                enableKDS: data.EnableKDS !== undefined ? Boolean(data.EnableKDS) : true,
                enableCheckoutBill: data.EnableCheckoutBill !== undefined ? Boolean(data.EnableCheckoutBill) : true,
                enableCheckoutFlow: data.EnableCheckoutFlow !== undefined ? Boolean(data.EnableCheckoutFlow) : true,
                enableDirectProcessToPay: data.EnableDirectProcessToPay !== undefined ? Boolean(data.EnableDirectProcessToPay) : false,
                customerSideDisplay: data.CustomerSideDisplay !== undefined ? Boolean(data.CustomerSideDisplay) : true,
                enableGuestDetailsPopup: data.EnableGuestDetailsPopup !== undefined ? Boolean(data.EnableGuestDetailsPopup) : true,
                enableCashDrawer: data.EnableCashDrawer !== undefined ? Boolean(data.EnableCashDrawer) : true,
                SVCIdentification: data.SVCIdentification !== undefined ? Boolean(data.SVCIdentification) : true,
                enableKDSPrint: data.EnableKDSPrint !== undefined ? Boolean(data.EnableKDSPrint) : true,
                enableCombo: data.EnableCombo !== undefined ? Boolean(data.EnableCombo) : true,
                showBillTime: data.ShowBillTime !== undefined ? Boolean(data.ShowBillTime) : true,
                showLoyalty: data.ShowLoyalty !== undefined ? (String(data.ShowLoyalty) === "true" || data.ShowLoyalty === 1 || data.ShowLoyalty === true) : true,
                showRewardPoints: data.ShowRewardPoints !== undefined ? (String(data.ShowRewardPoints) === "true" || data.ShowRewardPoints === 1 || data.ShowRewardPoints === true) : true,
                showPromoCode: data.ShowPromoCode !== undefined ? (String(data.ShowPromoCode) === "true" || data.ShowPromoCode === 1 || data.ShowPromoCode === true) : true,
                vipThreshold: data.VIPThreshold !== undefined ? Number(data.VIPThreshold) : 5000,
                vipRuleEnabled: data.VipRuleEnabled !== undefined ? (String(data.VipRuleEnabled) === "true" || data.VipRuleEnabled === 1 || data.VipRuleEnabled === true) : false,
                vipRuleTargetType: data.VipRuleTargetType || null,
                vipRuleDishId: data.VipRuleDishId || null,
                vipRuleDishGroupId: data.VipRuleDishGroupId || null,
                vipRuleDiscountType: data.VipRuleDiscountType || null,
                vipRuleDiscountValue: data.VipRuleDiscountValue !== undefined ? Number(data.VipRuleDiscountValue) : 0,
              },
            }));
          }
        } catch (error) {
          console.error("❌ [GeneralSettingsStore] Fetch Error:", error);
        } finally {
          set({ loading: false });
        }
      },

      updateSettings: async (newSettings) => {
        const previousSettings = get().settings;
        const updatedSettings = { ...previousSettings, ...newSettings };
        
        // Optimistic UI update
        set({ settings: updatedSettings, loading: true });

        try {
          console.log("🌐 [GeneralSettingsStore] Saving settings to:", `${API_URL}/api/settings/update`);
          
          let currentData: any = {};
          try {
            const getRes = await fetch(`${API_URL}/api/settings`);
            if (getRes.ok) {
              currentData = await getRes.json();
            }
          } catch (e) {
            console.warn("⚠️ [GeneralSettingsStore] Failed to fetch current settings:", e);
          }

          const payload = {
            upiId: currentData?.UPI_ID || null,
            shopName: currentData?.ShopName || "My Restaurant",
            qrCodeUrl: currentData?.PayNow_QR_Url || null,
            enableKOT: updatedSettings.enableKOT,
            enableKDS: updatedSettings.enableKDS,
            enableCheckoutBill: updatedSettings.enableCheckoutBill,
            enableCheckoutFlow: updatedSettings.enableCheckoutFlow,
            enableDirectProcessToPay: updatedSettings.enableDirectProcessToPay,
            customerSideDisplay: updatedSettings.customerSideDisplay,
            enableGuestDetailsPopup: updatedSettings.enableGuestDetailsPopup,
            enableCashDrawer: updatedSettings.enableCashDrawer,
            SVCIdentification: updatedSettings.SVCIdentification,
            enableKDSPrint: updatedSettings.enableKDSPrint,
            enableCombo: updatedSettings.enableCombo,
            showBillTime: updatedSettings.showBillTime,
            showLoyalty: updatedSettings.showLoyalty !== undefined ? (String(updatedSettings.showLoyalty) === "true" || updatedSettings.showLoyalty === true) : true,
            showRewardPoints: updatedSettings.showRewardPoints !== undefined ? (String(updatedSettings.showRewardPoints) === "true" || updatedSettings.showRewardPoints === true) : true,
            showPromoCode: updatedSettings.showPromoCode !== undefined ? (String(updatedSettings.showPromoCode) === "true" || updatedSettings.showPromoCode === true) : true,
            vipThreshold: updatedSettings.vipThreshold,
            vipRuleEnabled: updatedSettings.vipRuleEnabled,
            vipRuleTargetType: updatedSettings.vipRuleTargetType,
            vipRuleDishId: updatedSettings.vipRuleDishId,
            vipRuleDishGroupId: updatedSettings.vipRuleDishGroupId,
            vipRuleDiscountType: updatedSettings.vipRuleDiscountType,
            vipRuleDiscountValue: updatedSettings.vipRuleDiscountValue,
          };

          console.log("📦 [GeneralSettingsStore] Payload:", JSON.stringify(payload));

          const res = await fetch(`${API_URL}/api/settings/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Server returned ${res.status}: ${errText}`);
          }
          
          set({ loading: false });
          return true;
        } catch (error: any) {
          console.error("❌ [GeneralSettingsStore] Update Error:", error);
          if (Platform.OS === "web") {
            window.alert(`Failed to save settings: ${error.message}`);
          } else {
            Alert.alert("Error", `Failed to save settings: ${error.message}`);
          }
          // Revert on failure
          set({ settings: previousSettings, loading: false });
          return false;
        }
      },
    }),
    {
      name: "general-settings-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
