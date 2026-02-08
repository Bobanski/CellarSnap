"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type ResetFormValues = {
  password: string;
  confirmPassword: string;
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit } = useForm<ResetFormValues>();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      const url = window.location.href;
      const hasCode = url.includes("code=");

      if (hasCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (isMounted) {
          if (error) {
            setErrorMessage("This reset link is invalid or expired.");
          }
          setReady(true);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        if (!data.session) {
          setErrorMessage("This reset link is invalid or expired.");
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
    if (values.password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (values.password !== values.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage("Password updated. Redirecting to your cellar...");
    router.push("/entries");
  });

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Reset password
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">
            Set a new password
          </h1>
          <p className="text-sm text-zinc-300">
            Choose a new password to regain access to CellarSnap.
          </p>
        </div>

        {!ready ? (
          <p className="text-sm text-zinc-300">Preparing reset form...</p>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="text-sm font-medium text-zinc-200" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="At least 8 characters"
                {...register("password", { required: true })}
              />
            </div>
            <div>
              <label
                className="text-sm font-medium text-zinc-200"
                htmlFor="confirmPassword"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Repeat password"
                {...register("confirmPassword", { required: true })}
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-rose-300">{errorMessage}</p>
            ) : null}
            {message ? (
              <p className="text-sm text-emerald-300">{message}</p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
