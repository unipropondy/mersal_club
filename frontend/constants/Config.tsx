import Constants from "expo-constants";
import { Platform } from "react-native";

const getLocalBackendIP = (): string => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.hostname;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.manifest?.debuggerHost;

  if (hostUri) {
    return hostUri.split(":")[0];
  }

  return "localhost";
};

const localIP = getLocalBackendIP();

const PRODUCTION_BACKEND = "https://mersalclub-production.up.railway.app";

export const API_URL =
  (Platform.OS === "web" && typeof window !== "undefined")
    ? (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? `http://localhost:3000`           // local web dev
        : PRODUCTION_BACKEND)              // Cloudflare / any cloud → Railway HTTPS
    : (__DEV__ ? `http://${localIP}:3000` : PRODUCTION_BACKEND);

if (__DEV__) {
  console.log(`🌐 [Config] API_URL: ${API_URL} | Platform: ${Platform.OS}`);
}
