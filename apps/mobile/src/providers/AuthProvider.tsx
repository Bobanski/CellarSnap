import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Linking from "expo-linking";
import { AppState } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { canAccessPrivateBetaFeatures } from "@cellarsnap/shared";
import { handleIncomingAuthUrl } from "@/src/lib/authRedirect";
import { supabase } from "@/src/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isReady: boolean;
  hasPrivateBetaFeatureAccess: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isMissingTestAccountSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("is_test_account") ||
    (lower.includes("column") && lower.includes("does not exist")) ||
    (lower.includes("relation") && lower.includes("does not exist"))
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  // Beta gate removed (PR #62 follow-up). Default flipped to `true` so
  // every signed-in user sees Sommelier + List Scan tabs and can call
  // their APIs. setHasPrivateBetaFeatureAccess is preserved so the
  // existing async checks in useEffect still execute without TS errors;
  // they may flip the value back to true (no-op) or false in edge cases
  // — re-set to true after to honor the ungate. Easy revert: change
  // the initial value back to false and remove the override below.
  const [hasPrivateBetaFeatureAccess, setHasPrivateBetaFeatureAccess] = useState(true);

  useEffect(() => {
    let isMounted = true;
    if (AppState.currentState === "active") {
      supabase.auth.startAutoRefresh();
    }

    const resolveAccessForUser = async (user: User | null) => {
      if (!user) {
        return false;
      }
      if (canAccessPrivateBetaFeatures(user.email)) {
        return true;
      }

      const { data, error } = await supabase
        .from("public_profiles")
        .select("is_test_account")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        if (isMissingTestAccountSchemaError(error.message)) {
          return false;
        }
        throw new Error(error.message);
      }

      return Boolean(data?.is_test_account);
    };

    const bootstrap = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          await handleIncomingAuthUrl(initialUrl);
        }
      } catch {
        // Ignore deep-link bootstrap failures and continue.
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (isMounted) {
        setSession(currentSession);
        // Beta gate removed (PR #62 follow-up). Resolve runs only to keep
        // the supabase round-trip warm/cached; result is ignored and the
        // flag is forced true.
        await resolveAccessForUser(currentSession?.user ?? null);
        setHasPrivateBetaFeatureAccess(true);
        setIsReady(true);
      }
    };

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void (async () => {
        try {
          await handleIncomingAuthUrl(url);
        } catch {
          // Ignore callback parsing failures.
        }
      })();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        if (!isMounted) {
          return;
        }
        setSession(nextSession);
        // Beta gate removed (PR #62 follow-up).
        await resolveAccessForUser(nextSession?.user ?? null);
        setHasPrivateBetaFeatureAccess(true);
        setIsReady(true);
      })();
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    void bootstrap();

    return () => {
      isMounted = false;
      linkSubscription.remove();
      subscription.unsubscribe();
      appStateSubscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isReady,
      hasPrivateBetaFeatureAccess,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [hasPrivateBetaFeatureAccess, isReady, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
