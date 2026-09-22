"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AI_CONSENT_TITLE, AI_CONSENT_PARAGRAPHS, requestAiConsent, type AiConsent } from "@shared";

export default function AiConsentCard({ onComplete }: { onComplete?: () => void }) {
  const mounted = useRef(true);
  const [consent, setConsent] = useState<AiConsent | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; mounted.current = true;
    requestAiConsent({ baseUrl: "" }).then(value => { if (active) setConsent(value); })
      .catch(() => { if (active) setError("Sign in to manage AI sharing, or try again if you are already signed in."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; mounted.current = false; };
  }, []);
  const save = async (granted: boolean) => {
    setBusy(true); setError(null);
    try {
      const value = await requestAiConsent({ baseUrl: "", granted });
      if (!mounted.current) return;
      setConsent(value);
      window.dispatchEvent(new Event("cluster-ai-choice"));
      onComplete?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="ai-choice-title" className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 text-sm leading-6">
    <h2 id="ai-choice-title" className="font-serif text-2xl text-[var(--color-text-primary)]">{AI_CONSENT_TITLE}</h2>
    {AI_CONSENT_PARAGRAPHS.map(text => <p key={text} className="text-[var(--color-text-secondary)]">{text}</p>)}
    <p role="status">{busy ? "Loading your choice…" : consent ? `AI sharing is ${consent.granted ? "on" : "off"}.` : "AI sharing is off until you allow it."}</p>
    {error && <p role="alert" className="text-[var(--color-text-primary)]">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={() => void save(true)} className="min-h-11 rounded-xl bg-[var(--color-accent-primary)] px-4 py-2 font-semibold text-[var(--color-text-on-accent)] disabled:opacity-50">Allow AI sharing</button>
      <button disabled={busy} onClick={() => void save(false)} className="min-h-11 rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-[var(--color-text-primary)] disabled:opacity-50">{consent?.granted ? "Turn off AI sharing" : "Continue without AI"}</button>
    </div>
    <Link href="/privacy" className="underline">Read the privacy policy</Link>
  </section>;
}
