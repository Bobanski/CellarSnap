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

  return [
    { storage: window.localStorage, fallback: window.sessionStorage },
    { storage: window.sessionStorage, fallback: null },
  ];
}

export function saveListScanResult(result: ListScanResult) {
  const serialized = JSON.stringify(result);
  getStorageAreas().some(({ storage, fallback }) => {
    try {
      storage.setItem(getStorageKey(result.scan_id), serialized);
      return true;
    } catch {
      if (!fallback) {
        return false;
      }

      try {
        fallback.setItem(getStorageKey(result.scan_id), serialized);
        return true;
      } catch {
        return false;
      }
    }
  });
}

export function readListScanResult(scanId: string) {
  const storageKey = getStorageKey(scanId);
  const storageAreas = getStorageAreas();

  for (const { storage, fallback } of storageAreas) {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        continue;
      }

      const parsed = JSON.parse(raw) as ListScanResult;
      if (fallback) {
        try {
          fallback.removeItem(storageKey);
        } catch {
          // Ignore cleanup failures.
        }
      }
      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

export function clearListScanResult(scanId: string) {
  getStorageAreas().forEach(({ storage, fallback }) => {
    try {
      storage.removeItem(getStorageKey(scanId));
    } catch {
      // Ignore storage cleanup failures.
    }
    if (fallback) {
      try {
        fallback.removeItem(getStorageKey(scanId));
      } catch {
        // Ignore storage cleanup failures.
      }
    }
  });
}
