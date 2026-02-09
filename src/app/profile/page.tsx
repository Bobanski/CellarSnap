"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AlertsMenu from "@/components/AlertsMenu";
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  isUsernameFormatValid,
} from "@/lib/validation/username";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type ProfileFormValues = {
  display_name: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requiresUsernameSetup =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("setup") === "username";

  const { register, handleSubmit, reset } = useForm<ProfileFormValues>({
    defaultValues: { display_name: "" },
  });

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        setErrorMessage("Unable to load profile.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (isMounted && data.profile) {
        setProfile(data.profile);
        reset({ display_name: data.profile.display_name ?? "" });
        setLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [reset, router]);


  const onSubmit = handleSubmit(async (values) => {
    const trimmedDisplayName = values.display_name.trim();
    if (trimmedDisplayName.length < USERNAME_MIN_LENGTH) {
      setErrorMessage(USERNAME_MIN_LENGTH_MESSAGE);
      return;
    }

    if (!isUsernameFormatValid(trimmedDisplayName)) {
      setErrorMessage(USERNAME_FORMAT_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: trimmedDisplayName,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setErrorMessage(data.error ?? "Unable to update profile.");
      return;
    }

    const data = await response.json();
    if (data.profile) {
      setProfile(data.profile);
      setSuccessMessage(
        "Username saved. This is the name shown to other people in the app."
      );
    }
  });

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
              My profile
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Edit how you appear
            </h1>
            <p className="text-sm text-zinc-300">
              Set your username so friends see your name across the app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries"
            >
              My entries
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/feed"
            >
              Social Feed
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/friends"
            >
              Friends
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries/new"
            >
              New entry
            </Link>
            <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200">
              My profile
            </span>
            <AlertsMenu />
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              type="button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <form onSubmit={onSubmit} className="space-y-6">
            {requiresUsernameSetup ? (
              <p className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Set a username to continue using CellarSnap.
              </p>
            ) : null}
            {errorMessage ? (
              <p className="text-sm text-rose-200">{errorMessage}</p>
            ) : null}
            {successMessage ? (
              <p className="text-sm text-emerald-200">{successMessage}</p>
            ) : null}

            <div>
              <label
                className="mb-1 block text-sm font-medium text-zinc-300"
                htmlFor="display_name"
              >
                Username
              </label>
              <p className="mb-2 text-xs text-zinc-500">
                This name is shown across the app. Minimum 3 characters, no spaces or
                the at sign (@).
              </p>
              <input
                id="display_name"
                type="text"
                placeholder="e.g. wine_lover"
                maxLength={100}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("display_name", { required: true })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-500">
                Email
              </label>
              <p className="text-sm text-zinc-300">
                {profile?.email ?? "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Your email is used to sign in and is not editable here.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
