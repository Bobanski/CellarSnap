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
  username: string;
  password: string;
  confirmPassword: string;
};

type VerifyOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change";

export default function FinishSignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit } = useForm<FinishSignupValues>();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkValid, setLinkValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const allowedVerifyTypes = new Set([
        "signup",
        "invite",
        "magiclink",
        "recovery",
        "email_change",
      ]);
      const otpType: VerifyOtpType | null =
        type && allowedVerifyTypes.has(type) ? (type as VerifyOtpType) : null;
      const hasSession = async () => {
        const { data } = await supabase.auth.getSession();
        return Boolean(data.session);
      };

      // Supabase can send different link formats depending on auth flow/settings:
      // - PKCE: ?code=...
      // - Verify OTP: ?token_hash=...&type=signup (or magiclink/recovery/invite)
      // - Implicit: #access_token=...&refresh_token=...
      try {
        // If Supabase auto-detected the session from the URL already, trust it.
        if (await hasSession()) {
          if (isMounted) {
            setLinkValid(true);
            setReady(true);
          }
          return;
        }

        if (code) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          const valid = await hasSession();
          if (isMounted) {
            setLinkValid(valid);
            if (!valid) {
              setErrorMessage("This signup link is invalid or expired.");
            }
            setReady(true);
          }
          return;
        }

        if (tokenHash && otpType) {
          await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          const valid = await hasSession();
          if (isMounted) {
            setLinkValid(valid);
            if (!valid) {
              setErrorMessage("This signup link is invalid or expired.");
            }
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
          const valid = await hasSession();
          if (isMounted) {
            setLinkValid(valid);
            if (!valid) {
              setErrorMessage("This signup link is invalid or expired.");
            }
            setReady(true);
          }
          return;
        }
      } catch {
        if (isMounted) {
          setLinkValid(false);
          setErrorMessage("This signup link is invalid or expired.");
          setReady(true);
        }
        return;
      }

      const valid = await hasSession();
      if (isMounted) {
        setLinkValid(valid);
        if (!valid) {
          setErrorMessage("This signup link is invalid or expired.");
        }
        setReady(true);
      }
    };

    initSession();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const onSubmit = handleSubmit(async (values) => {
    const username = values.username.trim();

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
            Your email is confirmed. Choose a username and password to sign in
            going forward.
          </p>
        </div>

        {!ready ? (
          <p className="text-sm text-zinc-300">Preparing signup...</p>
        ) : !linkValid ? (
          <div className="space-y-4">
            <p className="text-sm text-rose-300">
              {errorMessage ?? "This signup link is invalid or expired."}
            </p>
            <Link
              href="/signup"
              className="inline-block rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
            >
              ← Back to create account
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
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
