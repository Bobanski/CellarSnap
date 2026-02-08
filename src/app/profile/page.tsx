"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: values.display_name.trim() || null,
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
      setSuccessMessage("Profile updated. This name will be shown across the app.");
    }
  });

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">My profile</h1>
            <p className="text-sm text-zinc-600">
              Edit how you appear in the app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="text-sm font-medium text-zinc-600"
              href="/entries"
            >
              Back to cellar
            </Link>
            <button
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
              type="button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <form onSubmit={onSubmit} className="space-y-6">
            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}
            {successMessage ? (
              <p className="text-sm text-green-600">{successMessage}</p>
            ) : null}

            <div>
              <label
                className="mb-1 block text-sm font-medium text-zinc-700"
                htmlFor="display_name"
              >
                Username
              </label>
              <p className="mb-2 text-xs text-zinc-500">
                This is the name shown when you appear in the app (e.g. on the
                feed or when others see your entries). Leave blank to use your
                email.
              </p>
              <input
                id="display_name"
                type="text"
                placeholder="e.g. wine_lover"
                maxLength={100}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                {...register("display_name")}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-500">
                Email
              </label>
              <p className="text-sm text-zinc-600">
                {profile?.email ?? "—"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Your email is used to sign in and is not editable here.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
