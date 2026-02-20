import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY for mobile."
  );
}

const storage = {
  getItem: async (key: string) => {
    try {
      const secureValue = await SecureStore.getItemAsync(key);
      if (typeof secureValue === "string") {
        return secureValue;
      }
    } catch {
      // Fall through to AsyncStorage fallback.
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Continue with AsyncStorage cleanup.
    }
    await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

export function buildAuthRedirectUrl(path = "auth/callback") {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return Linking.createURL(normalizedPath);
}
