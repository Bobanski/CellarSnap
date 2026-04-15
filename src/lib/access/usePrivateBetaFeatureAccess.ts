"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { canAccessPrivateBetaFeatures } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function isMissingTestAccountSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("is_test_account") ||
    (lower.includes("column") && lower.includes("does not exist")) ||
    (lower.includes("relation") && lower.includes("does not exist"))
  );
}

export function usePrivateBetaFeatureAccess() {
  const [hasPrivateBetaFeatureAccess, setHasPrivateBetaFeatureAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;

    const resolveAccessForUser = async (user: { id: string; email?: string | null } | null) => {
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

    const syncUserAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const hasAccess = await resolveAccessForUser(user);

      if (isMounted) {
        setHasPrivateBetaFeatureAccess(hasAccess);
      }
    };

    void syncUserAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
      void (async () => {
        const hasAccess = await resolveAccessForUser(session?.user ?? null);
        if (isMounted) {
          setHasPrivateBetaFeatureAccess(hasAccess);
        }
      })();
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    hasPrivateBetaFeatureAccess,
  };
}
