"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createTypedSupabaseBrowserClient } from "@/lib/supabase/browser";
import AiConsentCard from "./AiConsentCard";
export default function AiConsentSettings() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createTypedSupabaseBrowserClient();
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id ?? null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return userId ? <AiConsentCard key={userId} /> : <p className="text-sm">AI sharing is optional. <Link href="/login" className="underline">Sign in</Link> to manage your account’s AI choice.</p>;
}
