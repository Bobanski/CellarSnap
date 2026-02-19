"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getAuthMode } from "@/lib/auth/mode";

type LoginFormValues = {
  identifier: string;
  password: string;
};

type ResolvedIdentifier = {
  email?: string | null;
  phone?: string | null;
};

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit } = useForm<LoginFormValues>();
  const authMode = getAuthMode();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage("Signing in...");

    try {
      const identifier = values.identifier.trim();
      if (!identifier) {
        setErrorMessage(
          authMode === "phone"
            ? "Username or phone number is required."
            : "Email or username is required."
        );
        setInfoMessage(null);
        return;
      }

      const resolveResponse = await fetch("/api/auth/resolve-identifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, mode: "auto" }),
      });

      if (!resolveResponse.ok) {
        const payload = await resolveResponse.json().catch(() => ({}));
        setErrorMessage(payload.error ?? "No account matches that sign-in identifier.");
        setInfoMessage(null);
        return;
      }

      const resolved = (await resolveResponse.json()) as ResolvedIdentifier;
      const resolvedPhone = resolved.phone?.trim() || null;
      const resolvedEmail = resolved.email?.trim().toLowerCase() || null;

      if (!resolvedPhone && !resolvedEmail) {
        setErrorMessage("No account matches that sign-in identifier.");
        setInfoMessage(null);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword(
        authMode === "phone" && resolvedPhone
          ? { phone: resolvedPhone, password: values.password }
          : { email: resolvedEmail!, password: values.password }
      );

      if (error) {
        setErrorMessage(error.message);
        setInfoMessage(null);
        return;
      }

      try {
        const profileResponse = await fetch("/api/profile", { cache: "no-store" });
        if (profileResponse.ok) {
          const payload = await profileResponse.json().catch(() => ({}));
          const displayName =
            typeof payload.profile?.display_name === "string"
              ? payload.profile.display_name.trim()
              : "";
          if (!displayName) {
            setInfoMessage("Signed in. Redirecting...");
            await new Promise((resolve) => setTimeout(resolve, 200));
            window.location.assign("/profile?setup=username");
            return;
          }
        }
      } catch {
        // Ignore profile lookup failures and fall back to home.
      }

      setInfoMessage("Signed in. Redirecting...");
      await new Promise((resolve) => setTimeout(resolve, 200));
      window.location.assign("/");
    } catch {
      setErrorMessage("Unable to sign in. Check your connection and try again.");
      setInfoMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-y-auto bg-[#0f0a09] px-4 py-6 sm:items-center sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-10 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -bottom-40 left-0 h-96 w-96 rounded-full bg-rose-500/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">CellarSnap</h1>
            <p className="mt-2 text-sm text-zinc-300">
              A private cellar journal with a social pour.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-200">
            Beta
          </span>
        </div>

        <form className="mt-5 space-y-4 sm:mt-6" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-zinc-200" htmlFor="identifier">
              {authMode === "phone" ? "Username or phone number" : "Email or username"}
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete={authMode === "phone" ? "username" : "email"}
              disabled={isSubmitting}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              placeholder={
                authMode === "phone"
                  ? "username or (555) 123-4567"
                  : "you@example.com or username"
              }
              {...register("identifier", { required: true })}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {authMode === "phone"
                ? "You can also paste your email address."
                : "You can sign in with email or username."}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-200" htmlFor="password">
              Password
            </label>
            <div className="relative mt-1">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-20 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="********"
                {...register("password", { required: true })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:text-amber-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {errorMessage ? (
            <p className="text-sm text-rose-300">{errorMessage}</p>
          ) : null}
          {infoMessage ? (
            <p className="text-sm text-emerald-300">{infoMessage}</p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>

          <Link
            href="/signup"
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm font-semibold text-zinc-200 transition hover:border-white/30"
          >
            Create Account
          </Link>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 transition hover:text-amber-200"
            >
              Forgot password?
            </Link>
          </div>

          <div className="text-center text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            <Link href="/privacy" className="transition hover:text-amber-200">
              Privacy
            </Link>
            {" · "}
            <Link href="/terms" className="transition hover:text-amber-200">
              Terms
            </Link>
            {" · "}
            <Link href="/sms-compliance" className="transition hover:text-amber-200">
              SMS
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
