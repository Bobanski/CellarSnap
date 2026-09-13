import { useEffect, useState } from "react";
import { AppState, Image as NativeImage, Pressable, View, type ImageProps } from "react-native";
import { useAuth } from "@/src/providers/AuthProvider";
import { isProtectedPhotoUri, loadPhotoDataUrl } from "@/src/lib/storage/photoDelivery";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

export function PhotoImage(props: ImageProps) {
  const { source } = props;
  const uri = source && !Array.isArray(source) && typeof source === "object" ? source.uri : undefined;
  return uri && isProtectedPhotoUri(uri)
    ? <AuthorizedImage key={uri} {...props} uri={uri} />
    : <NativeImage {...props} />;
}

function AuthorizedImage({ uri, ...props }: ImageProps & { uri: string }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ token: string; attempt: number; data?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void loadPhotoDataUrl(uri, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ token, attempt, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ token, attempt, failed: true });
    });
    return () => controller.abort();
  }, [uri, token, attempt]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") setAttempt(value => value + 1);
    });
    return () => subscription.remove();
  }, []);
  const current = result?.token === token && result?.attempt === attempt ? result : null;
  if (current?.failed) {
    return <View style={[props.style, { alignItems: "center", justifyContent: "center" }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry photo" onPress={event => { event.stopPropagation(); setAttempt(value => value + 1); }}>
        <AppText style={{ color: colors.textPrimary, padding: 10 }}>Retry photo</AppText>
      </Pressable>
    </View>;
  }
  return <NativeImage {...props} source={current?.data ? { uri: current.data } : undefined} />;
}

// Size/crop reads use the same authorization boundary. Protected images aren't
// prefetched into a persistent native URL cache; mounted slides own their bytes.
PhotoImage.getSize = (uri: string, success: (width: number, height: number) => void, failure?: (error: unknown) => void) => {
  if (!isProtectedPhotoUri(uri)) return NativeImage.getSize(uri, success, failure);
  void loadPhotoDataUrl(uri).then(data => NativeImage.getSize(data, success, failure)).catch(failure ?? (() => {}));
};
PhotoImage.prefetch = (uri: string) => isProtectedPhotoUri(uri) ? Promise.resolve(false) : NativeImage.prefetch(uri);
