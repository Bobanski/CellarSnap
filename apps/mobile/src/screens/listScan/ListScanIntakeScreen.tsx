import { useState } from "react";
import { LIST_SCAN_MAX_IMAGE_COUNT } from "@cellarsnap/shared";
import {
  ActivityIndicator,
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

export default function ListScanIntakeScreen() {
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<SelectedPdf | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      quality: 1,
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
      quality: 1,
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
        <AppTopBar activeHref="/(app)/home" />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>List scan</AppText>
          <AppText style={styles.title}>Scan or upload a wine list.</AppText>
          <AppText style={styles.subtitle}>
            Upload one or more list photos, choose a PDF, or paste a public wine-list
            link.
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

          <Pressable
            style={[styles.submitButton, isSubmitting ? styles.submitButtonDisabled : null]}
            disabled={
              isSubmitting ||
              (selectedImages.length === 0 && !selectedPdf && !urlValue.trim())
            }
            onPress={() => void submitScan()}
          >
            {isSubmitting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.screenBg} />
                <AppText style={styles.submitButtonText}>Scanning...</AppText>
              </View>
            ) : (
              <AppText style={styles.submitButtonText}>Scan list</AppText>
            )}
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
    color: colors.accentPrimary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.08)",
    backgroundColor: "rgba(44,26,14,0.05)",
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
    gap: 10,
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.12)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
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
    borderColor: "rgba(44,26,14,0.10)",
    backgroundColor: colors.limestone,
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
    backgroundColor: "rgba(44, 26, 14, 0.5)",
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
    borderColor: "rgba(44,26,14,0.10)",
    backgroundColor: colors.limestone,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pdfBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(44,26,14,0.08)",
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
    borderColor: "rgba(44,26,14,0.12)",
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
  submitButton: {
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 18,
    paddingVertical: 14,
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
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
