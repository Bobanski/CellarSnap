import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { supabase } from "@/src/lib/supabase";
import { exchangeAppleCredential } from "./appleSignInFlow";

export async function signInWithApple() {
  const { data, credential } = await exchangeAppleCredential({
    randomNonce: () => Crypto.randomUUID(),
    hashNonce: (nonce) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce),
    requestCredential: (nonce) => AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    }),
    exchange: async (input) => {
      const { data, error } = await supabase.auth.signInWithIdToken(input);
      if (error) throw new Error(error.message);
      return data;
    },
  });

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
