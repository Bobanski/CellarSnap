"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getAuthMode } from "@/lib/auth/mode";
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  isUsernameFormatValid,
} from "@/lib/validation/username";
import { normalizePhone, PHONE_FORMAT_MESSAGE } from "@/lib/validation/phone";

type EmailSignupValues = {
  email: string;
};

type PhoneSignupValues = {
  username: string;
  phone: string;
  email: string;
  password: string;
};

export default function SignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const authMode = getAuthMode();

  const emailForm = useForm<EmailSignupValues>();
  const phoneForm = useForm<PhoneSignupValues>();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailCooldownUntil, setEmailCooldownUntil] = useState<number>(0);
  const [cooldownTick, setCooldownTick] = useState(0);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("emailSignupCooldownUntil");
      const parsed = stored ? Number(stored) : 0;
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        setEmailCooldownUntil(parsed);
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    if (!emailCooldownUntil) return;
    const remaining = emailCooldownUntil - Date.now();
    if (remaining <= 0) return;
    const id = window.setInterval(() => setCooldownTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [emailCooldownUntil]);

  const emailCooldownSeconds = useMemo(() => {
    void cooldownTick;
    return Math.max(0, Math.ceil((emailCooldownUntil - Date.now()) / 1000));
  }, [emailCooldownUntil, cooldownTick]);

  const setEmailCooldown = (msFromNow: number) => {
    const until = Date.now() + msFromNow;
    setEmailCooldownUntil(until);
    try {
      window.localStorage.setItem("emailSignupCooldownUntil", String(until));
    } catch {
      // Ignore storage failures.
    }
  };

  const onEmailSubmit = emailForm.handleSubmit(async (values) => {
    const email = values.email.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      setErrorMessage("A valid email is required.");
      return;
    }

    if (emailCooldownSeconds > 0) {
      setErrorMessage(
        `Please wait ${emailCooldownSeconds}s before requesting another signup email.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      // Use Supabase email OTP. If the email template contains `{{ .Token }}`, Supabase sends a
      // numeric code. If it contains `{{ .ConfirmationURL }}`, Supabase sends a link.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/finish-signup`,
        },
      });

      if (error) {
        const msg = error.message || "Unable to send signup email.";
        if (msg.toLowerCase().includes("rate limit")) {
          // Supabase email rate limits are enforced server-side. Cool down locally to prevent spamming.
          setEmailCooldown(5 * 60 * 1000);
          setErrorMessage(
            "Too many signup emails were requested recently. Please wait a few minutes and try again."
          );
          return;
        }
        setErrorMessage(msg);
        return;
      }

      // Prevent accidental double-requests right after success.
      setEmailCooldown(60 * 1000);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("pendingEmailSignupEmail", email);
        } catch {
          // Ignore client storage failures.
        }
      }

      setInfoMessage("Confirmation code sent. Check your email to continue.");
      router.push(`/finish-signup?email=${encodeURIComponent(email)}`);
    } catch {
      setErrorMessage("Unable to start signup. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  });

  const onPhoneSubmit = phoneForm.handleSubmit(async (values) => {
    const username = values.username.trim();
    const normalizedPhone = normalizePhone(values.phone);
    const email = values.email.trim().toLowerCase();

    if (username.length < USERNAME_MIN_LENGTH) {
      setErrorMessage(USERNAME_MIN_LENGTH_MESSAGE);
      return;
    }

    if (!isUsernameFormatValid(username)) {
      setErrorMessage(USERNAME_FORMAT_MESSAGE);
      return;
    }

    if (!normalizedPhone) {
      setErrorMessage(PHONE_FORMAT_MESSAGE);
      return;
    }

    if (!email || !email.includes("@")) {
      setErrorMessage("A valid email is required.");
      return;
    }

    if (values.password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (values.password.length > 72) {
      setErrorMessage("Password must be 72 characters or fewer.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const usernameCheckResponse = await fetch("/api/username-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (!usernameCheckResponse.ok) {
        const payload = await usernameCheckResponse.json().catch(() => ({}));
        setErrorMessage(payload.error ?? "Unable to check username.");
        return;
      }

      const usernameCheckData = await usernameCheckResponse.json();
      if (!usernameCheckData.available) {
        setErrorMessage("That username is already taken.");
        return;
      }

      const phoneCheckResponse = await fetch("/api/phone-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      });

      if (!phoneCheckResponse.ok) {
        const payload = await phoneCheckResponse.json().catch(() => ({}));
        setErrorMessage(payload.error ?? "Unable to check phone number.");
        return;
      }

      const phoneCheckData = await phoneCheckResponse.json();
      if (!phoneCheckData.available) {
        setErrorMessage("That phone number is already in use.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        phone: normalizedPhone,
        password: values.password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("pendingSignupUsername", username);
          window.sessionStorage.setItem("pendingSignupEmail", email);
          window.sessionStorage.setItem("pendingSignupPhone", normalizedPhone);
        } catch {
          // Ignore client storage failures.
        }
      }

      if (data.session) {
        const profileResponse = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: username,
            email,
            phone: normalizedPhone,
          }),
        });

        if (!profileResponse.ok) {
          const payload = await profileResponse.json().catch(() => ({}));
          setErrorMessage(payload.error ?? "Unable to save profile details.");
          return;
        }

        router.push("/");
        return;
      }

      router.push(`/verify-phone?phone=${encodeURIComponent(normalizedPhone)}`);
    } catch {
      setErrorMessage("Unable to create account. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  });

  const isPhoneMode = authMode === "phone";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f0a09] px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-10 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -bottom-40 left-0 h-96 w-96 rounded-full bg-rose-500/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Create account
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">Join CellarSnap</h1>
          <p className="text-sm text-zinc-300">
            {isPhoneMode
              ? "Create your account with username, phone, email, and password."
              : "Enter your email to get started. We'll send a confirmation code, then you'll set your password."}
          </p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={isPhoneMode ? onPhoneSubmit : onEmailSubmit}
        >
          {isPhoneMode ? (
            <>
              <div>
                <label className="text-sm font-medium text-zinc-200" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="At least 3 characters"
                  {...phoneForm.register("username", { required: true })}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-200" htmlFor="phone">
                  Phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="(555) 123-4567"
                  {...phoneForm.register("phone", { required: true })}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-200" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="you@example.com"
                  {...phoneForm.register("email", { required: true })}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-200" htmlFor="password">
                  Password
                </label>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-20 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    placeholder="********"
                    {...phoneForm.register("password", { required: true })}
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
                <p className="mt-1 text-xs text-zinc-500">Must be at least 8 characters.</p>
              </div>

              <p className="text-xs leading-5 text-zinc-400">
                By creating an account with a phone number, you agree to receive
                transactional SMS verification codes for login and account security.
                Message frequency varies. Message and data rates may apply. Reply STOP to
                opt out and HELP for help. See{" "}
                <Link href="/privacy/more" className="text-amber-200 transition hover:text-amber-100">
                  Privacy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="text-amber-200 transition hover:text-amber-100">
                  Terms
                </Link>
                . Compliance details:{" "}
                <Link
                  href="/sms-compliance"
                  className="text-amber-200 transition hover:text-amber-100"
                >
                  SMS Compliance
                </Link>
                .
              </p>
            </>
          ) : (
            <div>
              <label className="text-sm font-medium text-zinc-200" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="you@example.com"
                {...emailForm.register("email", { required: true })}
              />
            </div>
          )}

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
          {infoMessage ? <p className="text-sm text-emerald-300">{infoMessage}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting || emailCooldownSeconds > 0}
          >
            {isPhoneMode ? "Create account" : "Send confirmation code"}
          </button>
          {!isPhoneMode && emailCooldownSeconds > 0 ? (
            <p className="text-center text-xs text-zinc-500">
              You can request another email in {emailCooldownSeconds}s.
            </p>
          ) : null}

          <div className="text-center">
            <Link
              href="/login"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 transition hover:text-amber-200"
            >
              Back to sign in
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
          </div>
        </form>
      </div>
    </div>
  );
}
