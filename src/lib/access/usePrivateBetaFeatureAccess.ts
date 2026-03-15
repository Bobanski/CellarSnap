"use client";

import { useEffect, useState } from "react";
import { canAccessPrivateBetaFeatures } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function usePrivateBetaFeatureAccess() {
  const [hasPrivateBetaFeatureAccess, setHasPrivateBetaFeatureAccess] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;

    const syncUserAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (isMounted) {
        setHasPrivateBetaFeatureAccess(canAccessPrivateBetaFeatures(user?.email));
      }
    };

    void syncUserAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setHasPrivateBetaFeatureAccess(
        canAccessPrivateBetaFeatures(session?.user?.email)
      );
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    hasPrivateBetaFeatureAccess,
  };
}
