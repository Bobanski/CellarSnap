import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Linking from "expo-linking";
import { AppState } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { handleIncomingAuthUrl } from "@/src/lib/authRedirect";
import { supabase } from "@/src/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isReady: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (AppState.currentState === "active") {
      supabase.auth.startAutoRefresh();
    }

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
      if (!isMounted) {
        return;
      }
      setSession(nextSession);
      setIsReady(true);
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
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [isReady, session]
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
