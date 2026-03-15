import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ListScanResult } from "@cellarsnap/shared";

const STORAGE_PREFIX = "cellarsnap:list-scan:";

function getStorageKey(scanId: string) {
  return `${STORAGE_PREFIX}${scanId}`;
}

export async function saveListScanResult(result: ListScanResult) {
  await AsyncStorage.setItem(getStorageKey(result.scan_id), JSON.stringify(result));
}

export async function readListScanResult(scanId: string) {
  const raw = await AsyncStorage.getItem(getStorageKey(scanId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ListScanResult;
  } catch {
    return null;
  }
}

export async function clearListScanResult(scanId: string) {
  await AsyncStorage.removeItem(getStorageKey(scanId));
}
