"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createTypedSupabaseBrowserClient } from "@/lib/supabase/browser";
import { requestAiConsent } from "@shared";
import AiConsentCard from "./AiConsentCard";

export default function AiConsentPrompt() {
  const path = usePathname();
  const isLegal = path.startsWith("/privacy") || path === "/terms";
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const supabase = createTypedSupabaseBrowserClient();
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id ?? null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let active = true;
    const load = () => {
      setOpen(false);
      if (userId && !isLegal) void requestAiConsent({ baseUrl: "" }).then(consent => {
        if (active) setOpen(consent === null);
      }).catch(() => { /* Server denies AI while unavailable; manual features remain usable. */ });
    };
    load();
    window.addEventListener("cluster-ai-choice", load);
    return () => { active = false; window.removeEventListener("cluster-ai-choice", load); };
  }, [userId, isLegal]);
  useEffect(() => {
    if (open && dialog.current) {
      dialog.current.showModal();
      // While the choice loads, disabled buttons make the browser focus the
      // policy link below the disclosure. Start at the title on small screens.
      dialog.current.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      dialog.current.scrollTop = 0;
    } else dialog.current?.close();
  }, [open]);
  if (!userId || isLegal) return null;
  return <dialog ref={dialog} onCancel={() => setOpen(false)} aria-label="Your choice about AI" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-[var(--color-screen-bg)] p-0 text-[var(--color-text-primary)] backdrop:bg-black/70">
    {open && <AiConsentCard key={userId} onComplete={() => setOpen(false)} />}
    <button onClick={() => setOpen(false)} className="min-h-11 px-6 underline">Decide later</button>
  </dialog>;
}
