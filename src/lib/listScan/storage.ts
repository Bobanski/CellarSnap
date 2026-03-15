"use client";

import type { ListScanResult } from "@shared";

const STORAGE_PREFIX = "cellarsnap:list-scan:";

function getStorageKey(scanId: string) {
  return `${STORAGE_PREFIX}${scanId}`;
}

function getStorageAreas() {
  if (typeof window === "undefined") {
    return [];
  }

  return [window.localStorage, window.sessionStorage];
}

export function saveListScanResult(result: ListScanResult) {
  const serialized = JSON.stringify(result);
  getStorageAreas().forEach((storage) => {
    try {
      storage.setItem(getStorageKey(result.scan_id), serialized);
    } catch {
      // Ignore storage quota or privacy-mode failures and keep the flow usable.
    }
  });
}

export function readListScanResult(scanId: string) {
  const storageKey = getStorageKey(scanId);
  const storageAreas = getStorageAreas();

  for (const [index, storage] of storageAreas.entries()) {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        continue;
      }

      const parsed = JSON.parse(raw) as ListScanResult;
      if (index > 0) {
        saveListScanResult(parsed);
      }
      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

export function clearListScanResult(scanId: string) {
  getStorageAreas().forEach((storage) => {
    try {
      storage.removeItem(getStorageKey(scanId));
    } catch {
      // Ignore storage cleanup failures.
    }
  });
}
