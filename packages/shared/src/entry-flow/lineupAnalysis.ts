export type SourcePhotoRole = "individual" | "lineup" | "unknown";

export type NormalizedLineupBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedLabelAnchor = {
  x: number;
  y: number;
};

function normalizeUnitBbox(
  value: unknown,
  {
    minWidth,
    minHeight,
  }: {
    minWidth: number;
    minHeight: number;
  }
): NormalizedLineupBbox | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const bbox = value as Partial<NormalizedLineupBbox>;
  const x = Number(bbox.x);
  const y = Number(bbox.y);
  const width = Number(bbox.width);
  const height = Number(bbox.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  const clampedX = Math.min(1, Math.max(0, x));
  const clampedY = Math.min(1, Math.max(0, y));
  const clampedWidth = Math.min(1, Math.max(0, width));
  const clampedHeight = Math.min(1, Math.max(0, height));

  const right = Math.min(1, clampedX + clampedWidth);
  const bottom = Math.min(1, clampedY + clampedHeight);
  const normalizedWidth = right - clampedX;
  const normalizedHeight = bottom - clampedY;

  if (normalizedWidth < minWidth || normalizedHeight < minHeight) {
    return null;
  }

  return {
    x: clampedX,
    y: clampedY,
    width: normalizedWidth,
    height: normalizedHeight,
  };
}

export function normalizeBottleBbox(value: unknown) {
  return normalizeUnitBbox(value, {
    minWidth: 0.05,
    minHeight: 0.08,
  });
}

export function normalizeLabelBbox(value: unknown) {
  return normalizeUnitBbox(value, {
    minWidth: 0.03,
    minHeight: 0.03,
  });
}

export function normalizeLabelAnchor(
  value: unknown
): NormalizedLabelAnchor | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const anchor = value as Partial<NormalizedLabelAnchor>;
  const x = Number(anchor.x);
  const y = Number(anchor.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

export function resolveSourcePhotoRole({
  detectedBottleCount,
  identifiedBottleCount,
}: {
  detectedBottleCount: number;
  identifiedBottleCount: number;
}): SourcePhotoRole {
  if (detectedBottleCount >= 2 || identifiedBottleCount >= 2) {
    return "lineup";
  }
  if (detectedBottleCount === 1 || identifiedBottleCount === 1) {
    return "individual";
  }
  return "unknown";
}

export function shouldForceLineupForSinglePhoto(
  bottleBbox: Pick<NormalizedLineupBbox, "width" | "height"> | null
) {
  if (!bottleBbox) {
    return false;
  }

  // Narrow, tall single-bottle detections are frequently lineup framing.
  return bottleBbox.width < 0.42 && bottleBbox.height > 0.45;
}

export function hasDominantSingleBottleFrame(
  bottleBbox: Pick<NormalizedLineupBbox, "width" | "height"> | null
) {
  if (!bottleBbox) {
    return false;
  }

  return bottleBbox.width >= 0.34 && bottleBbox.height >= 0.45;
}

export function resolveSinglePhotoEntryMode({
  identifiedBottleCount,
  detectedBottleCount,
  guardrailBottleCount,
  hasStrongSingleBottleEvidence,
}: {
  identifiedBottleCount: number;
  detectedBottleCount: number;
  guardrailBottleCount: number | null;
  hasStrongSingleBottleEvidence: boolean;
}) {
  const normalizedIdentifiedBottleCount = Math.max(
    0,
    Math.round(identifiedBottleCount)
  );
  const normalizedDetectedBottleCount = Math.max(0, Math.round(detectedBottleCount));
  const normalizedGuardrailBottleCount =
    typeof guardrailBottleCount === "number" && Number.isFinite(guardrailBottleCount)
      ? Math.max(0, Math.round(guardrailBottleCount))
      : 0;

  const effectiveBottleCount = Math.max(
    normalizedIdentifiedBottleCount,
    normalizedDetectedBottleCount,
    normalizedGuardrailBottleCount
  );

  const likelyLineup =
    normalizedIdentifiedBottleCount > 1 || normalizedDetectedBottleCount > 1;
  const guardrailSuggestsAdditionalBottles =
    normalizedGuardrailBottleCount > 1 &&
    normalizedGuardrailBottleCount >
      Math.max(normalizedIdentifiedBottleCount, normalizedDetectedBottleCount) &&
    !hasStrongSingleBottleEvidence;

  return {
    effectiveBottleCount,
    guardrailSuggestsAdditionalBottles,
    likelyLineup,
  };
}
