"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  isUsernameFormatValid,
} from "@/lib/validation/username";

type FinishSignupValues = {
  email: string;
  code: string;
  username: string;
  password: string;
  confirmPassword: string;
};

type VerifyOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

export default function FinishSignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit, setValue } = useForm<FinishSignupValues>();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const emailFromQuery = params.get("email") ?? "";
      let emailFromStorage = "";
      try {
        emailFromStorage =
          window.sessionStorage.getItem("pendingEmailSignupEmail") ??
          window.sessionStorage.getItem("pendingSignupEmail") ??
          "";
      } catch {
        // Ignore storage failures.
      }
      const emailPrefill = (emailFromQuery || emailFromStorage).trim().toLowerCase();
      if (emailPrefill) {
        setValue("email", emailPrefill);
      }

      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const allowedVerifyTypes = new Set([
        "signup",
        "invite",
        "magiclink",
        "recovery",
        "email_change",
        "email",
      ]);
      const otpType: VerifyOtpType | null =
        type && allowedVerifyTypes.has(type) ? (type as VerifyOtpType) : null;
      const sessionExists = async () => {
        const { data } = await supabase.auth.getSession();
        return Boolean(data.session);
      };
      const hadCallbackParams = Boolean(
        code ||
          (tokenHash && otpType) ||
          window.location.hash?.includes("access_token=")
      );

      // Supabase can send different link formats depending on auth flow/settings:
      // - PKCE: ?code=...
      // - Verify OTP: ?token_hash=...&type=signup (or magiclink/recovery/invite)
      // - Implicit: #access_token=...&refresh_token=...
      try {
        // If Supabase auto-detected the session from the URL already, trust it.
        if (await sessionExists()) {
          if (isMounted) {
            setHasSession(true);
            setReady(true);
          }
          return;
        }

        if (code) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          const valid = await sessionExists();
          if (isMounted) {
            setHasSession(valid);
            setReady(true);
          }
          return;
        }

        if (tokenHash && otpType) {
          await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          const valid = await sessionExists();
          if (isMounted) {
            setHasSession(valid);
            setReady(true);
          }
          return;
        }

        // Handle older implicit grant links where tokens are in the URL hash.
        if (window.location.hash?.includes("access_token=")) {
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");

          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
          const valid = await sessionExists();
          if (isMounted) {
            setHasSession(valid);
            setReady(true);
          }
          return;
        }
      } catch {
        // Fall back to showing the OTP entry form below.
      }

      const valid = await sessionExists();
      if (isMounted) {
        setHasSession(valid);
        if (!valid && hadCallbackParams) {
          setErrorMessage(
            "This signup link is invalid or expired. You can still enter your confirmation code below."
          );
        }
        setReady(true);
      }
    };

    initSession();

    return () => {
      isMounted = false;
    };
  }, [setValue, supabase]);

  const onSubmit = handleSubmit(async (values) => {
    const email = values.email.trim().toLowerCase();
    const code = values.code.trim();
    const username = values.username.trim();

    if (!hasSession) {
      if (!email || !email.includes("@")) {
        setErrorMessage("A valid email is required.");
        return;
      }

      if (!code) {
        setErrorMessage("Confirmation code is required.");
        return;
      }
    }

    if (username.length < USERNAME_MIN_LENGTH) {
      setErrorMessage(USERNAME_MIN_LENGTH_MESSAGE);
      return;
    }

    if (!isUsernameFormatValid(username)) {
      setErrorMessage(USERNAME_FORMAT_MESSAGE);
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

    if (values.password !== values.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    const usernameCheckResponse = await fetch("/api/username-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    if (!usernameCheckResponse.ok) {
      const payload = await usernameCheckResponse.json().catch(() => ({}));
      setIsSubmitting(false);
      setErrorMessage(payload.error ?? "Unable to check username.");
      return;
    }

    const usernameCheckData = await usernameCheckResponse.json();
    if (!usernameCheckData.available) {
      setIsSubmitting(false);
      setErrorMessage("That username is already taken.");
      return;
    }

    if (!hasSession) {
      const verifyTypes: VerifyOtpType[] = ["email", "signup", "magiclink"];
      let lastError: string | null = null;
      let verified = false;

      for (const verifyType of verifyTypes) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token: code,
          type: verifyType,
        });

        if (!verifyError) {
          verified = true;
          break;
        }
        lastError = verifyError.message;
      }

      if (!verified) {
        setIsSubmitting(false);
        setErrorMessage(lastError ?? "Unable to verify confirmation code.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setIsSubmitting(false);
        setErrorMessage("Unable to verify confirmation code.");
        return;
      }

      setHasSession(true);
    }

    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (error) {
      setIsSubmitting(false);
      setErrorMessage(error.message);
      return;
    }

    const profileResponse = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: username }),
    });

    setIsSubmitting(false);

    if (!profileResponse.ok) {
      const payload = await profileResponse.json().catch(() => ({}));
      setErrorMessage(payload.error ?? "Unable to finish account setup.");
      return;
    }

    try {
      window.sessionStorage.removeItem("pendingEmailSignupEmail");
      window.sessionStorage.removeItem("pendingSignupEmail");
    } catch {
      // Ignore storage failures.
    }

    setMessage("Account created. Taking you home...");
    router.push("/");
  });

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Finish signup
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">
            Create your account
          </h1>
          <p className="text-sm text-zinc-300">
            {hasSession
              ? "Your email is confirmed. Choose a username and password to sign in going forward."
              : "Enter the confirmation code from your email, then choose a username and password."}
          </p>
        </div>

        {!ready ? (
          <p className="text-sm text-zinc-300">Preparing signup...</p>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            {!hasSession ? (
              <>
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
                    {...register("email", { required: true })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-200" htmlFor="code">
                    Confirmation code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    placeholder="6-digit code"
                    {...register("code", { required: true })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Need a new code?{" "}
                    <Link
                      href="/signup"
                      className="font-medium text-zinc-200 transition hover:text-amber-200"
                    >
                      Go back and resend.
                    </Link>
                  </p>
                </div>
              </>
            ) : null}

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
                {...register("username", { required: true })}
              />
              <p className="mt-1 text-xs text-zinc-500">
                No spaces and no @.
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
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-16 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="At least 8 characters"
                  {...register("password", { required: true })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-amber-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-200" htmlFor="confirmPassword">
                Confirm password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-16 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="Repeat password"
                  {...register("confirmPassword", { required: true })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-amber-200"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
            {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

            <button
              type="submit"
              className="w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              Create account
            </button>

            <p className="text-center text-sm text-zinc-400">
              <Link
                href="/login"
                className="font-medium text-zinc-200 transition hover:text-amber-200"
              >
                ← Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
