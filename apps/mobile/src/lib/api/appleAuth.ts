import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/src/lib/supabase";

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple Sign In failed - no identity token received.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });

  if (error) {
    throw new Error(error.message);
  }

  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName && data.user) {
    void (async () => {
      try {
        await supabase
          .from("profiles")
          .upsert(
            { id: data.user.id, display_name: fullName },
            { onConflict: "id" }
          );
      } catch {
        // Don't block auth if the profile name write fails.
      }
    })();
  }

  return data;
}
