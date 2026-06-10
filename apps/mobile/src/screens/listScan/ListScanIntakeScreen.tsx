import { useEffect, useRef, useState } from "react";
import { LIST_SCAN_MAX_IMAGE_COUNT } from "@cellarsnap/shared";
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { AppTopBar } from "@/src/components/AppTopBar";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { requestListScan, type MobileListScanUpload } from "@/src/lib/api/listScan";
import { saveListScanResult } from "@/src/lib/listScan/storage";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

type SelectedImage = {
  uri: string;
  name: string;
  mimeType: string;
};

type SelectedPdf = {
  uri: string;
  name: string;
  mimeType: string;
};

function toUploadName(name: string | null | undefined, fallback: string) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function getFileNameFromUri(uri: string, fallback: string) {
  const segment = uri.split("/").pop()?.trim();
  return segment && segment.length > 0 ? segment : fallback;
}

function createImageKey(image: SelectedImage) {
  return `${image.uri}|${image.name}`;
}

type ScanSourceKind = "image" | "pdf" | "url";

type ScanProgressState = {
  percent: number;
  label: string;
  detail: string;
};

const SCAN_PROGRESS_TIMELINES: Record<
  ScanSourceKind,
  Array<{ until: number; label: string; detail: string }>
> = {
  image: [
    { until: 20, label: "Reading the list", detail: "Extracting text from your photo." },
    { until: 55, label: "Parsing wines", detail: "Identifying entries, prices, and regions." },
    { until: 94, label: "Scoring matches", detail: "Computing your personalized match scores." },
  ],
  pdf: [
    { until: 20, label: "Reading the PDF", detail: "Extracting text and finding the wine section." },
    { until: 55, label: "Parsing wines", detail: "Identifying entries, prices, and regions." },
    { until: 94, label: "Scoring matches", detail: "Computing your personalized match scores." },
  ],
  url: [
    { until: 25, label: "Fetching the page", detail: "Loading the wine-list link." },
    { until: 55, label: "Parsing wines", detail: "Extracting entries from the menu." },
    { until: 94, label: "Scoring matches", detail: "Computing your personalized match scores." },
  ],
};

function buildScanProgress(kind: ScanSourceKind, elapsedMs: number): ScanProgressState {
  const targetDurationMs = kind === "image" ? 6_000 : kind === "pdf" ? 4_000 : 8_000;
  const midpointMs = targetDurationMs * 0.33;
  let progressCurve: number;
  if (elapsedMs <= midpointMs) {
    progressCurve = 0.55 * (1 - Math.exp((-3 * elapsedMs) / targetDurationMs));
  } else {
    const tail = 1 - Math.exp(-(elapsedMs - midpointMs) / (targetDurationMs * 1.8));
    progressCurve = 0.55 + 0.45 * tail;
  }
  const percent = Math.max(6, Math.min(99, Math.round(6 + progressCurve * 93)));
  const timeline =
    SCAN_PROGRESS_TIMELINES[kind].find((step) => percent <= step.until) ??
    SCAN_PROGRESS_TIMELINES[kind][SCAN_PROGRESS_TIMELINES[kind].length - 1];
  const isTakingLongerThanExpected = elapsedMs > targetDurationMs * 1.15;

  return {
    percent,
    label: isTakingLongerThanExpected ? "Still working" : timeline.label,
    detail: isTakingLongerThanExpected
      ? "This one is taking a little longer than usual, but the scan is still running."
      : timeline.detail,
  };
}

function resolveScanSourceKind(params: {
  selectedImages: SelectedImage[];
  selectedPdf: SelectedPdf | null;
  urlValue: string;
}): ScanSourceKind | null {
  if (params.selectedImages.length > 0) return "image";
  if (params.selectedPdf) return "pdf";
  if (params.urlValue.trim()) return "url";
  return null;
}

export default function ListScanIntakeScreen() {
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<SelectedPdf | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);
  const progressBarWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isSubmitting) {
      setScanProgress(null);
      progressBarWidth.setValue(0);
      return;
    }

    const sourceKind = resolveScanSourceKind({ selectedImages, selectedPdf, urlValue });
    if (!sourceKind) {
      setScanProgress(null);
      return;
    }

    const startTime = Date.now();
    setScanProgress(buildScanProgress(sourceKind, 0));

    const interval = setInterval(() => {
      const progress = buildScanProgress(sourceKind, Date.now() - startTime);
      setScanProgress(progress);
      Animated.timing(progressBarWidth, {
        toValue: progress.percent,
        duration: 350,
        useNativeDriver: false,
      }).start();
    }, 400);

    return () => clearInterval(interval);
  }, [isSubmitting, selectedImages, selectedPdf, urlValue]);

  const appendImages = (incomingImages: SelectedImage[]) => {
    if (incomingImages.length === 0) {
      return;
    }

    setErrorMessage(null);
    setSelectedPdf(null);
    setSelectedImages((current) => {
      const deduped = new Map<string, SelectedImage>();
      [...current, ...incomingImages].forEach((image) => {
        deduped.set(createImageKey(image), image);
      });
      const merged = Array.from(deduped.values()).slice(0, LIST_SCAN_MAX_IMAGE_COUNT);
      if (deduped.size > LIST_SCAN_MAX_IMAGE_COUNT) {
        setErrorMessage(`Upload up to ${LIST_SCAN_MAX_IMAGE_COUNT} images at a time.`);
      }
      return merged;
    });
  };

  const pickPhotoFromLibrary = async () => {
    setErrorMessage(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Allow photo access to choose a wine-list image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      ...(Platform.OS === "ios"
        ? {
            preferredAssetRepresentationMode:
              ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          }
        : {}),
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    appendImages(
      result.assets.map((asset, index) => ({
        uri: asset.uri,
        name: toUploadName(asset.fileName, `wine-list-${index + 1}.jpg`),
        mimeType: asset.mimeType ?? "image/jpeg",
      }))
    );
  };

  const takePhoto = async () => {
    setErrorMessage(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Allow camera access to scan a wine list.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    appendImages([
      {
        uri: asset.uri,
        name: toUploadName(asset.fileName, "wine-list.jpg"),
        mimeType: asset.mimeType ?? "image/jpeg",
      },
    ]);
  };

  const pickPdf = async () => {
    setErrorMessage(null);
    try {
      const picked = await File.pickFileAsync(undefined, "application/pdf");
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) {
        return;
      }

      setSelectedImages([]);
      setSelectedPdf({
        uri: file.uri,
        name: getFileNameFromUri(file.uri, "wine-list.pdf"),
        mimeType: file.type || "application/pdf",
      });
    } catch {
      setErrorMessage("Unable to open the PDF picker right now.");
    }
  };

  const submitScan = async () => {
    const trimmedUrl = urlValue.trim();
    let upload: MobileListScanUpload | null = null;

    if (selectedImages.length > 0) {
      upload = {
        kind: "files",
        files: selectedImages.map((image) => ({
          uri: image.uri,
          name: image.name,
          mimeType: image.mimeType,
        })),
      };
    } else if (selectedPdf) {
      upload = {
        kind: "files",
        files: [
          {
            uri: selectedPdf.uri,
            name: selectedPdf.name,
            mimeType: selectedPdf.mimeType,
          },
        ],
      };
    } else if (trimmedUrl) {
      upload = {
        kind: "url",
        url: trimmedUrl,
      };
    }

    if (!upload) {
      setErrorMessage("Upload a list image or PDF, or enter a URL.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const result = await requestListScan(upload);
    setIsSubmitting(false);

    if (!result.ok || !result.payload) {
      setErrorMessage(result.errorMessage);
      return;
    }

    await saveListScanResult(result.payload);
    router.push({
      pathname: "/(app)/list-scan/results",
      params: { scanId: result.payload.scan_id },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <AppTopBar />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>LIST SCAN</AppText>
          <AppText style={styles.title}>Scan any wine list.</AppText>
          <AppText style={styles.subtitle}>
            Upload a photo, PDF, or URL and get instant recommendations.
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.cardEyebrow}>Upload</AppText>
          <AppText style={styles.cardBody}>
            Use up to {LIST_SCAN_MAX_IMAGE_COUNT} photos for multi-page lists, or choose one PDF.
          </AppText>

          <View style={styles.buttonStack}>
            <Pressable style={styles.secondaryButton} onPress={() => void pickPhotoFromLibrary()}>
              <AppText style={styles.secondaryButtonText}>Choose photo</AppText>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void takePhoto()}>
              <AppText style={styles.secondaryButtonText}>Take photo</AppText>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void pickPdf()}>
              <AppText style={styles.secondaryButtonText}>Choose PDF</AppText>
            </Pressable>
          </View>

          {selectedImages.length > 0 ? (
            <View style={styles.thumbnailWrap}>
              {selectedImages.map((image, index) => (
                <View key={createImageKey(image)} style={styles.thumbnailCard}>
                  <Image source={{ uri: image.uri }} style={styles.thumbnailImage} />
                  <Pressable
                    style={styles.thumbnailRemove}
                    onPress={() =>
                      setSelectedImages((current) =>
                        current.filter((_, imageIndex) => imageIndex !== index)
                      )
                    }
                  >
                    <AppText style={styles.thumbnailRemoveText}>x</AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {selectedPdf ? (
            <View style={styles.pdfRow}>
              <View style={styles.pdfBadge}>
                <AppText style={styles.pdfBadgeText}>PDF</AppText>
              </View>
              <AppText numberOfLines={1} style={styles.pdfName}>
                {selectedPdf.name}
              </AppText>
              <Pressable
                style={styles.pdfRemove}
                onPress={() => setSelectedPdf(null)}
              >
                <AppText style={styles.thumbnailRemoveText}>x</AppText>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.urlSection}>
            <AppText style={styles.cardEyebrow}>Public wine list link</AppText>
            <DoneTextInput
              style={styles.urlInput}
              value={urlValue}
              onChangeText={(value) => {
                setUrlValue(value);
                setErrorMessage(null);
              }}
              placeholder="https://restaurant.com/wine-list"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {errorMessage ? (
            <View style={styles.errorCard}>
              <AppText style={styles.errorText}>{errorMessage}</AppText>
            </View>
          ) : null}

          {isSubmitting && scanProgress ? (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <View style={styles.progressTextWrap}>
                  <AppText style={styles.progressLabel}>{scanProgress.label}</AppText>
                  <AppText style={styles.progressDetail}>{scanProgress.detail}</AppText>
                </View>
                <View style={styles.progressBadge}>
                  <AppText style={styles.progressBadgeText}>{scanProgress.percent}%</AppText>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressBarWidth.interpolate({
                        inputRange: [0, 100],
                        outputRange: ["0%", "100%"],
                      }),
                    },
                  ]}
                />
              </View>
              <AppText style={styles.progressHint}>
                Longer PDFs and multi-page lists can take a little while, but the scan is still running.
              </AppText>
            </View>
          ) : null}

          <Pressable
            style={[styles.submitButton, isSubmitting ? styles.submitButtonDisabled : null]}
            disabled={
              isSubmitting ||
              (selectedImages.length === 0 && !selectedPdf && !urlValue.trim())
            }
            onPress={() => void submitScan()}
          >
            <AppText style={styles.submitButtonText}>
              {isSubmitting ? "Scanning..." : "Scan list"}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 16,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    padding: 18,
    gap: 12,
  },
  cardEyebrow: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  cardBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  buttonStack: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  thumbnailWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  thumbnailCard: {
    position: "relative",
    width: 76,
    height: 76,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.shadowColor,
  },
  thumbnailRemoveText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  pdfRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pdfBadge: {
    borderRadius: 999,
    backgroundColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pdfBadgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pdfName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  pdfRemove: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  urlSection: {
    gap: 8,
  },
  urlInput: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    lineHeight: 20,
  },
  errorCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.22)",
    backgroundColor: "rgba(192,57,43,0.10)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
  progressCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(196,96,122,0.20)",
    backgroundColor: "rgba(123,29,58,0.10)",
    padding: 16,
    gap: 12,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  progressTextWrap: {
    flex: 1,
    gap: 4,
  },
  progressLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  progressDetail: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.85,
  },
  progressBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(196,96,122,0.20)",
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  progressBadgeText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accentSecondary,
  },
  progressHint: {
    color: colors.textPrimary,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.65,
  },
  submitButton: {
    borderRadius: 11,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.68,
  },
  submitButtonText: {
    color: colors.screenBg,
    fontSize: 16,
    fontWeight: "700",
  },
});
