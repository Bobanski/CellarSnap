"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getAuthMode } from "@/lib/auth/mode";
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  isUsernameFormatValid,
} from "@/lib/validation/username";
import {
  formatPhoneForDisplay,
  formatPhoneForInput,
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
} from "@/lib/validation/phone";

type Profile = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  default_entry_privacy: "public" | "friends" | "private" | null;
  created_at: string | null;
  avatar_url?: string | null;
};

function formatMemberSince(dateString: string | null): string {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const authMode = getAuthMode();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  // Identity card state
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Avatar state (pending file only applied on Save profile)
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Badges state
  type Badge = {
    id: string;
    name: string;
    symbol: string;
    threshold: number;
    count: number;
    earned: boolean;
  };
  const [badges, setBadges] = useState<Badge[]>([]);

  // Privacy state
  const [privacyValue, setPrivacyValue] = useState<"public" | "friends" | "private">("public");
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  // Password state
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Username setup flow
  const requiresUsernameSetup =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("setup") === "username";

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadErrorMessage(null);
    try {
      const response = await fetch("/api/profile", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        setLoadErrorMessage("Unable to load profile right now.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (data.profile) {
        const profileDisplayName = data.profile.display_name?.trim() ?? "";
        const profileFirstName = data.profile.first_name?.trim() ?? "";
        const profileLastName = data.profile.last_name?.trim() ?? "";
        const profilePhone = data.profile.phone?.trim() ?? "";
        let initialEditUsername = profileDisplayName;
        let initialEditFirstName = profileFirstName;
        let initialEditLastName = profileLastName;
        let initialEditPhone = profilePhone;
        if (!profileDisplayName && typeof window !== "undefined") {
          try {
            const pendingUsername =
              window.sessionStorage.getItem("pendingSignupUsername") ?? "";
            const pendingTrimmed = pendingUsername.trim();
            if (
              pendingTrimmed.length >= USERNAME_MIN_LENGTH &&
              isUsernameFormatValid(pendingTrimmed)
            ) {
              initialEditUsername = pendingTrimmed;
            }
          } catch {
            // Ignore client storage failures.
          }
        }

        if (typeof window !== "undefined") {
          try {
            if (!profileFirstName) {
              const pendingFirstName =
                window.sessionStorage.getItem("pendingSignupFirstName") ?? "";
              initialEditFirstName = pendingFirstName.trim();
            }
            if (!profileLastName) {
              const pendingLastName =
                window.sessionStorage.getItem("pendingSignupLastName") ?? "";
              initialEditLastName = pendingLastName.trim();
            }
            if (!profilePhone) {
              const pendingPhone =
                window.sessionStorage.getItem("pendingSignupPhone") ?? "";
              initialEditPhone = pendingPhone.trim();
            }
            if (profileDisplayName) {
              window.sessionStorage.removeItem("pendingSignupUsername");
              window.sessionStorage.removeItem("pendingSignupEmail");
            }
            if (profileFirstName) {
              window.sessionStorage.removeItem("pendingSignupFirstName");
            }
            if (profileLastName) {
              window.sessionStorage.removeItem("pendingSignupLastName");
            }
            if (profilePhone) {
              window.sessionStorage.removeItem("pendingSignupPhone");
            }
          } catch {
            // Ignore client storage failures.
          }
        }

        setProfile(data.profile);
        setEditUsername(initialEditUsername);
        setEditFirstName(initialEditFirstName);
        setEditLastName(initialEditLastName);
        setEditPhone(formatPhoneForInput(initialEditPhone));
        setPrivacyValue(data.profile.default_entry_privacy ?? "private");
        setLoading(false);
        if (
          !profileDisplayName ||
          new URLSearchParams(window.location.search).get("setup") === "username"
        ) {
          setIsEditing(true);
        }
      } else {
        setLoadErrorMessage("Unable to load profile right now.");
        setLoading(false);
      }
    } catch {
      setLoadErrorMessage("Unable to load profile right now.");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadProfile();

    // Load badges in parallel (independent of profile)
    fetch("/api/profile/badges", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.badges) setBadges(data.badges);
      })
      .catch(() => null);
  }, [loadProfile]);

  const saveProfile = async () => {
    const trimmed = editUsername.trim();
    const trimmedFirstName = editFirstName.trim();
    const trimmedLastName = editLastName.trim();
    const trimmedPhone = editPhone.trim();
    const normalizedPhone = trimmedPhone ? normalizePhone(trimmedPhone) : null;
    if (trimmed.length < USERNAME_MIN_LENGTH) {
      setUsernameError(USERNAME_MIN_LENGTH_MESSAGE);
      return;
    }
    if (!isUsernameFormatValid(trimmed)) {
      setUsernameError(USERNAME_FORMAT_MESSAGE);
      return;
    }
    if (trimmedPhone && !normalizedPhone) {
      setUsernameError(PHONE_FORMAT_MESSAGE);
      return;
    }

    setIsSavingUsername(true);
    setUsernameError(null);
    setUsernameSuccess(null);
    setAvatarError(null);

    const hadPendingAvatar = !!pendingAvatarFile;
    const usernameChanged = trimmed !== (profile?.display_name ?? "").trim();
    const firstNameChanged = trimmedFirstName !== (profile?.first_name ?? "").trim();
    const lastNameChanged = trimmedLastName !== (profile?.last_name ?? "").trim();
    const phoneChanged = (normalizedPhone ?? null) !== (profile?.phone ?? null);

    let uploadedAvatarUrl: string | null = null;

    try {
      // 1. Upload avatar first if user chose a new picture
      if (pendingAvatarFile) {
        const formData = new FormData();
        formData.set("file", pendingAvatarFile);
        const avatarRes = await fetch("/api/profile/avatar", {
          method: "POST",
          body: formData,
        });
        if (!avatarRes.ok) {
          const data = await avatarRes.json().catch(() => ({}));
          setAvatarError(data.error ?? "Photo upload failed.");
          setIsSavingUsername(false);
          return;
        }
        const avatarData = await avatarRes.json();
        uploadedAvatarUrl = avatarData.avatar_url ?? null;
        setPendingAvatarFile(null);
        if (pendingAvatarPreview) {
          URL.revokeObjectURL(pendingAvatarPreview);
          setPendingAvatarPreview(null);
        }
      }

      // 2. Save profile fields if changed
      if (usernameChanged || firstNameChanged || lastNameChanged || phoneChanged) {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: trimmed,
            first_name: trimmedFirstName || null,
            last_name: trimmedLastName || null,
            phone: normalizedPhone,
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setUsernameError(data.error ?? "Unable to update profile.");
          setIsSavingUsername(false);
          return;
        }
      }

      // 3. Refetch profile and exit edit mode (preserve avatar URL if refetch doesn't return it yet)
      const profileRes = await fetch("/api/profile", { cache: "no-store" });
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        if (profileData.profile) {
          const nextProfile = { ...profileData.profile };
          if (uploadedAvatarUrl && !nextProfile.avatar_url) {
            nextProfile.avatar_url = uploadedAvatarUrl;
          }
          setProfile(nextProfile);
          setEditUsername(nextProfile.display_name ?? "");
          setEditFirstName(nextProfile.first_name ?? "");
          setEditLastName(nextProfile.last_name ?? "");
          setEditPhone(formatPhoneForInput(nextProfile.phone ?? ""));
        }
      } else if (uploadedAvatarUrl && profile) {
        setProfile({ ...profile, avatar_url: uploadedAvatarUrl });
      }
      setUsernameSuccess(
        hadPendingAvatar || usernameChanged || firstNameChanged || lastNameChanged || phoneChanged
          ? "Profile saved."
          : "No changes to save."
      );
      setIsEditing(false);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem("pendingSignupUsername");
          window.sessionStorage.removeItem("pendingSignupEmail");
          window.sessionStorage.removeItem("pendingSignupFirstName");
          window.sessionStorage.removeItem("pendingSignupLastName");
          window.sessionStorage.removeItem("pendingSignupPhone");
        } catch {
          // Ignore client storage failures.
        }
      }
    } finally {
      setIsSavingUsername(false);
    }
  };

  const cancelEdit = () => {
    setEditUsername(profile?.display_name ?? "");
    setEditFirstName(profile?.first_name ?? "");
    setEditLastName(profile?.last_name ?? "");
    setEditPhone(formatPhoneForInput(profile?.phone ?? ""));
    setUsernameError(null);
    setUsernameSuccess(null);
    setAvatarError(null);
    if (pendingAvatarPreview) {
      URL.revokeObjectURL(pendingAvatarPreview);
    }
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
    setIsEditing(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    if (pendingAvatarPreview) URL.revokeObjectURL(pendingAvatarPreview);
    setPendingAvatarFile(file);
    setPendingAvatarPreview(URL.createObjectURL(file));
  };

  const savePrivacy = async (value: "public" | "friends" | "private") => {
    setPrivacyValue(value);
    setIsSavingPrivacy(true);
    setPrivacyMessage(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default_entry_privacy: value,
        confirm_privacy_onboarding: true,
      }),
    });

    setIsSavingPrivacy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setPrivacyMessage(data.error ?? "Unable to update privacy setting.");
      return;
    }

    const data = await response.json();
    if (data.profile) {
      // Merge to preserve fields the PATCH response doesn't include (e.g. avatar_url)
      setProfile((prev) => prev ? { ...prev, ...data.profile } : data.profile);
      setPrivacyValue(data.profile.default_entry_privacy ?? value);
      setPrivacyMessage("Default privacy updated.");
      setTimeout(() => setPrivacyMessage(null), 3000);
    }
  };

  const savePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsSavingPassword(true);

    // Verify current password by attempting to sign in with the account's primary auth identifier.
    const loginIdentifier =
      authMode === "phone" && profile?.phone?.trim()
        ? { phone: profile.phone.trim() }
        : profile?.email?.trim()
          ? { email: profile.email.trim().toLowerCase() }
          : null;

    if (!loginIdentifier) {
      setPasswordError("Unable to verify current password.");
      setIsSavingPassword(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      ...loginIdentifier,
      password: currentPassword,
    });

    if (signInError) {
      setPasswordError("Current password is incorrect.");
      setIsSavingPassword(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setIsSavingPassword(false);

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess("Password updated successfully.");
    setIsPasswordOpen(false);
  };

  const cancelPasswordChange = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSuccess(null);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsPasswordOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading profile...
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="mx-auto max-w-2xl rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {loadErrorMessage ?? "Unable to load profile."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
        <div className="mx-auto max-w-2xl space-y-8">
          <header className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
              My profile
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Your cellar identity
            </h1>
            <p className="text-sm text-zinc-300">
              Manage how you appear, your preferences, and your account.
            </p>
          </header>

          {/* ── Section 1: Identity Card ── */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            {requiresUsernameSetup && isEditing ? (
              <p className="mb-5 rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Set a username to continue using CellarSnap.
              </p>
            ) : null}

            {isEditing ? (
              /* ── Edit mode ── */
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Edit profile
                  </h2>
                </div>

                {/* Avatar + Choose picture (only in edit mode) */}
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30 text-zinc-500 ring-2 ring-white/5 sm:h-28 sm:w-28">
                    {pendingAvatarPreview ? (
                      <img
                        src={pendingAvatarPreview}
                        alt="New profile"
                        className="h-full w-full object-cover"
                      />
                    ) : profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt="Profile"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-xs">No photo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                    >
                      Choose picture
                    </button>
                    {avatarError ? (
                      <p className="text-sm text-rose-200">{avatarError}</p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-300">
                    Full name
                  </label>
                  <p className="mb-2 text-xs text-zinc-500">
                    Your first and last name are shown to friends in CellarSnap.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      id="edit-first-name"
                      type="text"
                      placeholder="First name"
                      maxLength={80}
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                    <input
                      id="edit-last-name"
                      type="text"
                      placeholder="Last name"
                      maxLength={80}
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-zinc-300"
                    htmlFor="edit-phone"
                  >
                    Phone
                  </label>
                  <p className="mb-2 text-xs text-zinc-500">
                    Used for sign in. US 10-digit and +E.164 formats are accepted.
                  </p>
                  <input
                    id="edit-phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={editPhone}
                    onChange={(e) => setEditPhone(formatPhoneForInput(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-zinc-300"
                    htmlFor="edit-username"
                  >
                    Username
                  </label>
                  <p className="mb-2 text-xs text-zinc-500">
                    Minimum 3 characters. No spaces or the @ sign.
                  </p>
                  <input
                    id="edit-username"
                    type="text"
                    placeholder="e.g. wine_lover"
                    maxLength={100}
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  />
                </div>

                {usernameError ? (
                  <p className="text-sm text-rose-200">{usernameError}</p>
                ) : null}
                {usernameSuccess ? (
                  <p className="text-sm text-emerald-200">{usernameSuccess}</p>
                ) : null}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSavingUsername}
                    onClick={saveProfile}
                    className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    {isSavingUsername ? "Saving…" : "Save profile"}
                  </button>
                  {!requiresUsernameSetup ? (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              /* ── Read mode ── */
              <div className="space-y-5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setUsernameSuccess(null);
                      setIsEditing(true);
                    }}
                    className="absolute right-0 top-0 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                  >
                    Edit profile
                  </button>

                  <div className="flex flex-col gap-4 pr-28 sm:flex-row sm:items-start sm:pr-28">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30 text-zinc-500 ring-2 ring-white/5 sm:h-28 sm:w-28">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt="Profile"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="text-xs">No photo</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          Username
                        </p>
                        <p className="mt-1 text-xl font-semibold text-zinc-50">
                          {profile?.display_name || "Not set"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          Full name (friends only)
                        </p>
                        <p className="mt-1 text-sm text-zinc-300">
                          {[
                            profile?.first_name?.trim() || null,
                            profile?.last_name?.trim() || null,
                          ]
                            .filter((value): value is string => Boolean(value))
                            .join(" ") || "Not set"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          Email
                        </p>
                        <p className="mt-1 text-sm text-zinc-300">
                          {profile?.email ?? "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          Phone
                        </p>
                        <p className="mt-1 text-sm text-zinc-300">
                          {formatPhoneForDisplay(profile?.phone)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          Member since
                        </p>
                        <p className="mt-1 text-sm text-zinc-300">
                          {formatMemberSince(profile?.created_at ?? null)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {usernameSuccess ? (
                  <p className="text-sm text-emerald-200">{usernameSuccess}</p>
                ) : null}
              </div>
            )}
          </div>

          {/* ── Section 2: Badges ── */}
          {badges.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Badges
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Earn badges by logging 10 wines from a specific region or style.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-center transition ${
                      badge.earned
                        ? "border-amber-300/40 bg-amber-400/10"
                        : "border-white/5 bg-black/20 opacity-40"
                    }`}
                  >
                    <span className="text-2xl">{badge.symbol}</span>
                    <span
                      className={`text-xs font-semibold leading-tight ${
                        badge.earned ? "text-amber-200" : "text-zinc-400"
                      }`}
                    >
                      {badge.name}
                    </span>
                    <span
                      className={`text-[10px] tabular-nums ${
                        badge.earned
                          ? "font-medium text-amber-300/70"
                          : "text-zinc-500"
                      }`}
                    >
                      {badge.count}/{badge.threshold}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Section 3: Settings (only if privacy column exists) ── */}
          {profile?.default_entry_privacy !== null && profile?.default_entry_privacy !== undefined ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Settings
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Choose the default visibility for new entries you create.
              </p>

              <div className="mt-5">
                <label htmlFor="privacy-select" className="sr-only">
                  Default entry privacy
                </label>
                <select
                  id="privacy-select"
                  value={privacyValue}
                  onChange={(e) =>
                    savePrivacy(e.target.value as "public" | "friends" | "private")
                  }
                  disabled={isSavingPrivacy}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:opacity-50"
                >
                  <option value="public">Public — visible to everyone on the feed</option>
                  <option value="friends">Friends only — only your friends can see</option>
                  <option value="private">Private — only you can see</option>
                </select>
              </div>

              {privacyMessage ? (
                <p className="mt-3 text-sm text-emerald-200">{privacyMessage}</p>
              ) : null}
            </div>
          ) : null}

          {/* ── Section 3: Change Password ── */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Password
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Update your account password.
                </p>
              </div>

              {!isPasswordOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setPasswordSuccess(null);
                    setIsPasswordOpen(true);
                  }}
                  className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                >
                  Change password
                </button>
              ) : null}
            </div>

            {passwordSuccess && !isPasswordOpen ? (
              <p className="mt-3 text-sm text-emerald-200">{passwordSuccess}</p>
            ) : null}

            {isPasswordOpen ? (
              <div className="mt-5 space-y-4">
                {/* Current password */}
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-zinc-300"
                    htmlFor="current-password"
                  >
                    Current password
                  </label>
                  <div className="relative">
                    <input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-16 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((p) => !p)}
                      className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-amber-200"
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-zinc-300"
                    htmlFor="new-password"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-16 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-amber-200"
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* Confirm new password */}
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-zinc-300"
                    htmlFor="confirm-password"
                  >
                    Confirm new password
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-16 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((p) => !p)}
                      className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-amber-200"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {passwordError ? (
                  <p className="text-sm text-rose-200">{passwordError}</p>
                ) : null}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword}
                    onClick={savePassword}
                    className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingPassword ? "Updating..." : "Update password"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelPasswordChange}
                    className="text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
