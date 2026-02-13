"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizePhone, PHONE_FORMAT_MESSAGE } from "@/lib/validation/phone";

type LoginFormValues = {
  phone: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit } = useForm<LoginFormValues>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const normalizedPhone = normalizePhone(values.phone);
      if (!normalizedPhone) {
        setErrorMessage(PHONE_FORMAT_MESSAGE);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password: values.password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.push("/");
    } catch {
      setErrorMessage("Unable to sign in. Check your connection and try again.");
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
            <label className="text-sm font-medium text-zinc-200" htmlFor="phone">
              Phone number
            </label>
            <input
              id="phone"
              type="text"
              autoComplete="tel"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              placeholder="(555) 123-4567"
              {...register("phone", { required: true })}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Sign in with the phone number attached to your account.
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
            Sign In
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
          </div>
        </form>
      </div>
    </div>
  );
}
