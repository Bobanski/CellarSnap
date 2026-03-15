import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export const AGE_VERIFIED_KEY = "cellarsnap_age_verified";

export async function getAgeVerified(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(AGE_VERIFIED_KEY);
    return value === "true";
  } catch {
    try {
      const value = await AsyncStorage.getItem(AGE_VERIFIED_KEY);
      return value === "true";
    } catch {
      return false;
    }
  }
}

export async function setAgeVerified(): Promise<void> {
  try {
    await SecureStore.setItemAsync(AGE_VERIFIED_KEY, "true");
  } catch {
    await AsyncStorage.setItem(AGE_VERIFIED_KEY, "true");
  }
}
