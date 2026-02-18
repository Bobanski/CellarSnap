"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getAuthMode } from "@/lib/auth/mode";
import type { PrivacyLevel } from "@/types/wine";
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
  bio: string | null;
  default_entry_privacy: PrivacyLevel | null;
  default_reaction_privacy: PrivacyLevel | null;
  default_comments_privacy: PrivacyLevel | null;
  created_at: string | null;
  avatar_url?: string | null;
};

type Entry = {
  id: string;
  wine_name: string | null;
  label_image_url: string | null;
};

type FriendProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type Friend = FriendProfile & { request_id: string | null; tasting_count: number };

type Suggestion = FriendProfile & { mutual_count: number };

type FriendMutationPayload = {
  success?: boolean;
  status?: string;
  request_id?: string;
  error?: string;
};

const PRIVACY_OPTIONS: { value: PrivacyLevel; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "friends_of_friends", label: "Friends of friends" },
  { value: "friends", label: "Friends only" },
  { value: "private", label: "Private" },
];

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
  const [editBio, setEditBio] = useState("");
  const [editEmail, setEditEmail] = useState("");
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
  const [flippedBadgeIds, setFlippedBadgeIds] = useState<Set<string>>(
    () => new Set()
  );

  const toggleBadgeFlip = useCallback((badgeId: string) => {
    setFlippedBadgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(badgeId)) {
        next.delete(badgeId);
      } else {
        next.add(badgeId);
      }
      return next;
    });
  }, []);

  const badgeRequirementText = (badge: Badge) => {
    const n = badge.threshold;
    switch (badge.id) {
      case "burgundy_bitch":
        return `Log ${n} wines from Burgundy (Bourgogne counts).`;
      case "california_king":
        return `Log ${n} wines from California.`;
      case "bordeaux_hoe":
        return `Log ${n} wines from Bordeaux.`;
      case "rioja_renegade":
        return `Log ${n} wines from Rioja.`;
      case "sangiovese_savage":
        return `Log ${n} wines from Chianti.`;
      case "rhone_rider":
        return `Log ${n} wines from the Rh\u00f4ne.`;
      case "margaux_monarch":
        return `Log ${n} wines from Margaux.`;
      case "chianti_connoisseur":
        return `Log ${n} wines from Chianti.`;
      case "mosel_maniac":
        return `Log ${n} wines from the Mosel.`;
      case "champagne_champion":
        return `Log ${n} wines from Champagne.`;
      default:
        return `Log ${n} qualifying wines to earn this badge.`;
    }
  };

  // Privacy state
  const [entryPrivacyValue, setEntryPrivacyValue] = useState<PrivacyLevel>("public");
  const [reactionPrivacyValue, setReactionPrivacyValue] = useState<PrivacyLevel>("public");
  const [commentsPrivacyValue, setCommentsPrivacyValue] =
    useState<PrivacyLevel>("friends_of_friends");
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

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Entry gallery state
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesCursor, setEntriesCursor] = useState<string | null>(null);
  const [entriesHasMore, setEntriesHasMore] = useState(false);

  // Friends modal state
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<
    { id: string; requester: FriendProfile; created_at: string; seen_at: string | null }[]
  >([]);
  const [outgoingRequests, setOutgoingRequests] = useState<
    { id: string; recipient: FriendProfile; created_at: string }[]
  >([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; display_name: string | null }[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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
        const profileBio = data.profile.bio?.trim() ?? "";
        const profileEmail = data.profile.email?.trim() ?? "";
        let initialEditUsername = profileDisplayName;
        let initialEditFirstName = profileFirstName;
        let initialEditLastName = profileLastName;
        let initialEditPhone = profilePhone;
        let initialEditBio = profileBio;
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
        setEditBio(initialEditBio);
        setEditEmail(profileEmail);
        setEntryPrivacyValue(data.profile.default_entry_privacy ?? "public");
        setReactionPrivacyValue(data.profile.default_reaction_privacy ?? "public");
        setCommentsPrivacyValue(
          data.profile.default_comments_privacy ?? "friends_of_friends"
        );
        setLoading(false);
        if (
          !profileDisplayName ||
          new URLSearchParams(window.location.search).get("setup") === "username"
        ) {
          setIsEditing(true);
          setSettingsOpen(true);
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

  const loadEntries = useCallback(async (cursor?: string) => {
    setEntriesLoading(true);
    try {
      const url = cursor
        ? `/api/entries?limit=50&sort=consumed_at&cursor=${encodeURIComponent(cursor)}`
        : `/api/entries?limit=50&sort=consumed_at`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setEntriesLoading(false);
        return;
      }
      const data = await res.json();
      setEntries((prev) => (cursor ? [...prev, ...data.entries] : data.entries));
      setEntriesHasMore(data.has_more ?? false);
      setEntriesCursor(data.next_cursor ?? null);
    } catch {
      // ignore
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  const loadFriends = useCallback(async () => {
    setFriendError(null);
    setFriendsLoading(true);
    try {
      const [friendsRes, requestsRes, suggestionsRes] = await Promise.all([
        fetch("/api/friends", { cache: "no-store" }),
        fetch("/api/friends/requests", { cache: "no-store" }),
        fetch("/api/friends/suggestions", { cache: "no-store" }),
      ]);
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends ?? []);
      }
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setIncomingRequests(data.incoming ?? []);
        setOutgoingRequests(data.outgoing ?? []);
      }
      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json();
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      setFriendError("Unable to load friends right now.");
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  const displayFriendName = (p: FriendProfile | null) =>
    p?.display_name ?? p?.email ?? "Unknown";

  const parseMutationPayload = async (
    response: Response
  ): Promise<FriendMutationPayload> =>
    (await response.json().catch(() => ({}))) as FriendMutationPayload;

  const sendRequest = async (userId: string) => {
    setIsMutating(true);
    setFriendError(null);
    try {
      const response = await fetch("/api/friends/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: userId }),
      });
      const payload = await parseMutationPayload(response);
      if (!response.ok) {
        setFriendError(payload.error ?? "Unable to send request.");
        return;
      }
      if (
        !payload.request_id ||
        (payload.status !== "pending" && payload.status !== "accepted")
      ) {
        setFriendError("Unexpected response while sending request.");
        return;
      }
      setFriendSearch("");
      await loadFriends();
    } catch {
      setFriendError("Unable to send request.");
    } finally {
      setIsMutating(false);
    }
  };

  const respondToRequest = async (id: string, action: "accept" | "decline") => {
    setFriendError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/friends/requests/${id}/${action}`, {
        method: "POST",
      });
      const payload = await parseMutationPayload(response);
      if (!response.ok) {
        setFriendError(payload.error ?? "Unable to update request.");
        return;
      }
      const expectedStatus = action === "accept" ? "accepted" : "declined";
      if (
        payload.success !== true ||
        payload.request_id !== id ||
        payload.status !== expectedStatus
      ) {
        setFriendError("Request state changed unexpectedly. Please refresh.");
        return;
      }
      await loadFriends();
    } catch {
      setFriendError("Unable to update request.");
    } finally {
      setIsMutating(false);
    }
  };

  const deleteRequest = async (requestId: string) => {
    setFriendError(null);
    setIsMutating(true);
    try {
      const response = await fetch(`/api/friends/requests/${requestId}`, {
        method: "DELETE",
      });
      const payload = await parseMutationPayload(response);
      if (!response.ok) {
        setFriendError(payload.error ?? "Unable to process request.");
        return;
      }
      if (payload.success !== true || payload.request_id !== requestId) {
        setFriendError("Request state changed unexpectedly. Please refresh.");
        return;
      }
      setConfirmingCancel(null);
      setConfirmingRemove(null);
      await loadFriends();
    } catch {
      setFriendError("Unable to process request.");
    } finally {
      setIsMutating(false);
    }
  };

  useEffect(() => {
    loadProfile();
    loadEntries();

    // Load badges in parallel (independent of profile)
    fetch("/api/profile/badges", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.badges) setBadges(data.badges);
      })
      .catch(() => null);
  }, [loadProfile, loadEntries]);

  const saveProfile = async () => {
    const trimmed = editUsername.trim();
    const trimmedFirstName = editFirstName.trim();
    const trimmedLastName = editLastName.trim();
    const trimmedPhone = editPhone.trim();
    const trimmedBio = editBio.trim();
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
    const bioChanged = (trimmedBio || null) !== (profile?.bio ?? null);
    const trimmedEmail = editEmail.trim().toLowerCase();
    const emailChanged = trimmedEmail !== (profile?.email ?? "").trim().toLowerCase();

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
      if (usernameChanged || firstNameChanged || lastNameChanged || phoneChanged || bioChanged || emailChanged) {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: trimmed,
            first_name: trimmedFirstName || null,
            last_name: trimmedLastName || null,
            phone: normalizedPhone,
            bio: trimmedBio || null,
            ...(emailChanged ? { email: trimmedEmail } : {}),
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
          setEditBio(nextProfile.bio ?? "");
          setEditEmail(nextProfile.email ?? "");
        }
      } else if (uploadedAvatarUrl && profile) {
        setProfile({ ...profile, avatar_url: uploadedAvatarUrl });
      }
      setUsernameSuccess(
        hadPendingAvatar || usernameChanged || firstNameChanged || lastNameChanged || phoneChanged || bioChanged || emailChanged
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
    setEditBio(profile?.bio ?? "");
    setEditEmail(profile?.email ?? "");
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

  const savePrivacyDefaults = async (
    updates: Partial<{
      default_entry_privacy: PrivacyLevel;
      default_reaction_privacy: PrivacyLevel;
      default_comments_privacy: PrivacyLevel;
    }>
  ) => {
    setIsSavingPrivacy(true);
    setPrivacyMessage(null);

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...updates,
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
      setEntryPrivacyValue(data.profile.default_entry_privacy ?? entryPrivacyValue);
      setReactionPrivacyValue(
        data.profile.default_reaction_privacy ?? reactionPrivacyValue
      );
      setCommentsPrivacyValue(
        data.profile.default_comments_privacy ?? commentsPrivacyValue
      );
      setPrivacyMessage("Default visibility settings updated.");
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

  // Computed friend ID sets for status lookup
  const friendIds = new Set(friends.map((f) => f.id));
  const outgoingIds = new Set(outgoingRequests.map((r) => r.recipient.id));
  const incomingIds = new Set(incomingRequests.map((r) => r.requester.id));

  // Debounced friend search
  useEffect(() => {
    let isMounted = true;
    const query = friendSearch.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/users?search=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) {
          if (isMounted) {
            setSearchResults([]);
            setSearchError("Unable to search right now.");
            setSearchLoading(false);
          }
          return;
        }
        const data = await response.json();
        if (isMounted) {
          setSearchResults(data.users ?? []);
          setSearchLoading(false);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (isMounted) {
          setSearchResults([]);
          setSearchError("Unable to search right now.");
          setSearchLoading(false);
        }
      }
    }, 200);
    return () => {
      isMounted = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [friendSearch]);

  const closeFriends = () => {
    setFriendsOpen(false);
    setFriendSearch("");
    setSearchResults([]);
    setSearchError(null);
    setFriendError(null);
    setConfirmingCancel(null);
    setConfirmingRemove(null);
  };

  const closeSettings = () => {
    if (requiresUsernameSetup && isEditing) return;
    cancelEdit();
    cancelPasswordChange();
    setSettingsOpen(false);
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

  const fullName = [
    profile.first_name?.trim() || null,
    profile.last_name?.trim() || null,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" ");

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
        <div className="mx-auto max-w-2xl space-y-6">
          {/* ── Identity Card ── */}
          <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFriendsOpen(true);
                  loadFriends();
                }}
                className="rounded-full border border-white/10 p-2 text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
                aria-label="Friends"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsernameSuccess(null);
                  setSettingsOpen(true);
                }}
                className="rounded-full border border-white/10 p-2 text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
                aria-label="Settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30 text-zinc-500 ring-2 ring-white/5 sm:h-28 sm:w-28">
                {profile.avatar_url ? (
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
              <div className="min-w-0">
                <p className="text-xl font-semibold text-zinc-50">
                  {profile.display_name || "Not set"}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  {fullName || "\u00A0"}
                </p>
                {profile.bio ? (
                  <p className="mt-2 text-sm text-zinc-300">{profile.bio}</p>
                ) : null}
              </div>
            </div>

            {usernameSuccess ? (
              <p className="mt-4 text-sm text-emerald-200">{usernameSuccess}</p>
            ) : null}
          </div>

          {/* ── Entry Photo Gallery ── */}
          <div>
            {entries.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
                {entries.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/entries/${entry.id}`}
                    className="aspect-square overflow-hidden rounded-lg bg-white/5"
                  >
                    {entry.label_image_url ? (
                      <img
                        src={entry.label_image_url}
                        alt={entry.wine_name || "Wine entry"}
                        className="h-full w-full object-cover transition hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-700">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="m21 15-5-5L5 21" />
                        </svg>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : !entriesLoading ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-500">
                No entries yet.
              </div>
            ) : null}

            {entriesLoading ? (
              <p className="mt-4 text-center text-sm text-zinc-500">Loading entries...</p>
            ) : null}

            {entriesHasMore && !entriesLoading ? (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (entriesCursor) loadEntries(entriesCursor);
                  }}
                  className="rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                >
                  Load more
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      {settingsOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center px-4 py-10">
            <div
              className="fixed inset-0 bg-black/70"
              onClick={closeSettings}
            />
            <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[#14100f] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-50">Settings</h2>
                <button
                  type="button"
                  onClick={closeSettings}
                  className="rounded-full border border-white/10 p-2 text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
                  aria-label="Close settings"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-8">
                {/* ── Edit Profile ── */}
                <div className="space-y-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Edit profile
                  </h3>

                  {requiresUsernameSetup && isEditing ? (
                    <p className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Set a username to continue using CellarSnap.
                    </p>
                  ) : null}

                  {/* Avatar + Choose picture */}
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30 text-zinc-500 ring-2 ring-white/5 sm:h-28 sm:w-28">
                      {pendingAvatarPreview ? (
                        <img
                          src={pendingAvatarPreview}
                          alt="New profile"
                          className="h-full w-full object-cover"
                        />
                      ) : profile.avatar_url ? (
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

                  {/* Full name */}
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

                  {/* Bio */}
                  <div>
                    <label
                      className="mb-1 block text-sm font-medium text-zinc-300"
                      htmlFor="edit-bio"
                    >
                      Bio
                    </label>
                    <p className="mb-2 text-xs text-zinc-500">
                      A short description shown on your profile. 100 characters max.
                    </p>
                    <textarea
                      id="edit-bio"
                      placeholder="Wine enthusiast, cheese lover..."
                      maxLength={100}
                      rows={2}
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                    <p className="mt-1 text-right text-xs tabular-nums text-zinc-500">
                      {editBio.length}/100
                    </p>
                  </div>

                  {/* Username */}
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

                  {/* Email */}
                  <div>
                    <label
                      className="mb-1 block text-sm font-medium text-zinc-300"
                      htmlFor="edit-email"
                    >
                      Email (only you)
                    </label>
                    <input
                      id="edit-email"
                      type="email"
                      placeholder="you@example.com"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label
                      className="mb-1 block text-sm font-medium text-zinc-300"
                      htmlFor="edit-phone"
                    >
                      Phone (only you)
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

                  {/* Member since (read-only) */}
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Member since
                    </p>
                    <p className="mt-1 text-sm text-zinc-300">
                      {formatMemberSince(profile.created_at ?? null)}
                    </p>
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
                      {isSavingUsername ? "Saving\u2026" : "Save profile"}
                    </button>
                  </div>
                </div>

                {/* ── Badges ── */}
                {badges.length > 0 ? (
                  <div className="space-y-3 border-t border-white/10 pt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Badges
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Earn badges by logging 10 wines from a specific region or style.
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      {badges.map((badge) => {
                        const flipped = flippedBadgeIds.has(badge.id);
                        const baseClass =
                          "rounded-xl border px-3 py-4 text-center transition";
                        const visualClass = badge.earned
                          ? "border-amber-300/55 bg-amber-400/10 ring-1 ring-amber-300/25 shadow-[0_18px_40px_-28px_rgba(251,191,36,0.65)]"
                          : badge.count > 0
                            ? "border-white/10 bg-black/20 opacity-80 saturate-50"
                            : "border-white/5 bg-black/20 opacity-45 grayscale";

                        if (badge.earned) {
                          const requirement = badgeRequirementText(badge);
                          return (
                            <button
                              key={badge.id}
                              type="button"
                              className={`${baseClass} ${visualClass} cursor-pointer [perspective:900px] focus:outline-none focus:ring-2 focus:ring-amber-300/30`}
                              onClick={() => toggleBadgeFlip(badge.id)}
                              aria-pressed={flipped}
                              aria-label={`${
                                flipped ? "Hide" : "Show"
                              } how you earned the ${badge.name} badge`}
                            >
                              <div
                                className={`relative h-full w-full transition-transform duration-500 motion-reduce:transition-none [transform-style:preserve-3d] ${
                                  flipped ? "[transform:rotateY(180deg)]" : ""
                                }`}
                              >
                                <div className="flex h-full flex-col items-center justify-center gap-1.5 [backface-visibility:hidden]">
                                  <span className="text-2xl drop-shadow-[0_10px_18px_rgba(251,191,36,0.25)]">
                                    {badge.symbol}
                                  </span>
                                  <span className="text-xs font-semibold leading-tight text-amber-200">
                                    {badge.name}
                                  </span>
                                </div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center [transform:rotateY(180deg)] [backface-visibility:hidden]">
                                  <p className="text-xs font-semibold leading-snug text-amber-100">
                                    {requirement}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        }

                        return (
                          <div
                            key={badge.id}
                            className={`${baseClass} ${visualClass} flex flex-col items-center justify-center gap-1.5`}
                          >
                            <span
                              className={`text-2xl ${
                                badge.count > 0 ? "text-zinc-100" : "text-zinc-500"
                              }`}
                            >
                              {badge.symbol}
                            </span>
                            <span
                              className={`text-xs font-semibold leading-tight ${
                                badge.count > 0 ? "text-zinc-200" : "text-zinc-400"
                              }`}
                            >
                              {badge.name}
                            </span>
                            <span
                              className={`text-[10px] tabular-nums ${
                                badge.count > 0
                                  ? "font-medium text-amber-200/80"
                                  : "text-zinc-500"
                              }`}
                            >
                              {badge.count}/{badge.threshold}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* ── Privacy Settings ── */}
                {profile.default_entry_privacy !== null && profile.default_entry_privacy !== undefined ? (
                  <div className="space-y-3 border-t border-white/10 pt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Privacy settings
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Choose defaults for new posts, reactions, and comments.
                    </p>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <label
                          htmlFor="default-entry-privacy-select"
                          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400"
                        >
                          Post visibility
                        </label>
                        <select
                          id="default-entry-privacy-select"
                          value={entryPrivacyValue}
                          onChange={(e) => {
                            const nextValue = e.target.value as PrivacyLevel;
                            setEntryPrivacyValue(nextValue);
                            void savePrivacyDefaults({
                              default_entry_privacy: nextValue,
                            });
                          }}
                          disabled={isSavingPrivacy}
                          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:opacity-50"
                        >
                          {PRIVACY_OPTIONS.map((option) => (
                            <option key={`entry-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <label
                          htmlFor="default-reaction-privacy-select"
                          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400"
                        >
                          Reactions
                        </label>
                        <select
                          id="default-reaction-privacy-select"
                          value={reactionPrivacyValue}
                          onChange={(e) => {
                            const nextValue = e.target.value as PrivacyLevel;
                            setReactionPrivacyValue(nextValue);
                            void savePrivacyDefaults({
                              default_reaction_privacy: nextValue,
                            });
                          }}
                          disabled={isSavingPrivacy}
                          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:opacity-50"
                        >
                          {PRIVACY_OPTIONS.map((option) => (
                            <option key={`reaction-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <label
                          htmlFor="default-comments-privacy-select"
                          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400"
                        >
                          Comments
                        </label>
                        <select
                          id="default-comments-privacy-select"
                          value={commentsPrivacyValue}
                          onChange={(e) => {
                            const nextValue = e.target.value as PrivacyLevel;
                            setCommentsPrivacyValue(nextValue);
                            void savePrivacyDefaults({
                              default_comments_privacy: nextValue,
                            });
                          }}
                          disabled={isSavingPrivacy}
                          className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:opacity-50"
                        >
                          {PRIVACY_OPTIONS.map((option) => (
                            <option key={`comments-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-[11px] text-zinc-500">
                      <p>Reactions privacy controls who can see and react.</p>
                      <p>Comments privacy controls who can see the comments UI and comment.</p>
                    </div>

                    {privacyMessage ? (
                      <p className="mt-3 text-sm text-emerald-200">{privacyMessage}</p>
                    ) : null}
                  </div>
                ) : null}

                {/* ── Change Password ── */}
                <div className="space-y-3 border-t border-white/10 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Password
                      </h3>
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
                    <p className="text-sm text-emerald-200">{passwordSuccess}</p>
                  ) : null}

                  {isPasswordOpen ? (
                    <div className="mt-3 space-y-4">
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
        </div>
      ) : null}

      {/* ── Friends Modal ── */}
      {friendsOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center px-4 py-10">
            <div
              className="fixed inset-0 bg-black/70"
              onClick={closeFriends}
            />
            <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[#14100f] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-50">Friends</h2>
                <button
                  type="button"
                  onClick={closeFriends}
                  className="rounded-full border border-white/10 p-2 text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
                  aria-label="Close friends"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {friendError ? (
                <p className="mb-4 text-sm text-rose-200">{friendError}</p>
              ) : null}

              {friendsLoading ? (
                <p className="text-sm text-zinc-400">Loading friends...</p>
              ) : (
                <div className="space-y-6">
                  {/* ── Search ── */}
                  <div>
                    <input
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      placeholder="Search by username, name, or email"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                    {searchError ? (
                      <p className="mt-2 text-sm text-rose-200">{searchError}</p>
                    ) : null}
                    {searchLoading ? (
                      <p className="mt-2 text-sm text-zinc-400">Searching...</p>
                    ) : null}
                    {searchResults.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {searchResults.slice(0, 5).map((user) => {
                          const label = user.display_name ?? "Unknown";
                          const isFriend = friendIds.has(user.id);
                          const isOutgoing = outgoingIds.has(user.id);
                          const isIncoming = incomingIds.has(user.id);
                          return (
                            <div
                              key={user.id}
                              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-medium text-zinc-100">{label}</p>
                                {isFriend ? (
                                  <p className="text-xs text-emerald-200">Already friends</p>
                                ) : isOutgoing ? (
                                  <p className="text-xs text-amber-200">Request sent</p>
                                ) : isIncoming ? (
                                  <p className="text-xs text-amber-200">Requested you</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                disabled={isFriend || isOutgoing || isMutating}
                                onClick={() => sendRequest(user.id)}
                                className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : friendSearch.trim() && !searchLoading && !searchError ? (
                      <p className="mt-2 text-sm text-zinc-400">No matches.</p>
                    ) : null}
                  </div>

                  {/* ── Top row: Requests + Suggestions ── */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Left column: Incoming + Requests sent */}
                    <div className="space-y-4">
                      {/* Incoming requests */}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            Incoming requests
                          </h3>
                          {incomingRequests.length > 0 ? (
                            <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                              {incomingRequests.length > 99
                                ? "99+"
                                : incomingRequests.length}
                            </span>
                          ) : null}
                        </div>
                        {incomingRequests.length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-500">No new requests.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {incomingRequests.map((req) => (
                              <div
                                key={req.id}
                                className="rounded-xl border border-white/10 bg-black/20 p-3"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30">
                                    {req.requester.avatar_url ? (
                                      <img
                                        src={req.requester.avatar_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-[10px] text-zinc-500">
                                        {(req.requester.display_name ?? "?")[0]}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-medium text-zinc-100">
                                    {displayFriendName(req.requester)}
                                  </p>
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() =>
                                      respondToRequest(req.id, "accept")
                                    }
                                    className="rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() =>
                                      respondToRequest(req.id, "decline")
                                    }
                                    className="rounded-full border border-rose-400/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:opacity-50"
                                  >
                                    Decline
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Requests sent */}
                      {outgoingRequests.length > 0 ? (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            Requests sent
                          </h3>
                          <div className="mt-2 space-y-2">
                            {outgoingRequests.map((req) => (
                              <div
                                key={req.id}
                                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30">
                                    {req.recipient.avatar_url ? (
                                      <img
                                        src={req.recipient.avatar_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-[10px] text-zinc-500">
                                        {(req.recipient.display_name ?? "?")[0]}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm text-zinc-200">
                                    {displayFriendName(req.recipient)}
                                  </span>
                                </div>
                                {confirmingCancel === req.id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-400">
                                      Cancel?
                                    </span>
                                    <button
                                      type="button"
                                      disabled={isMutating}
                                      onClick={() => deleteRequest(req.id)}
                                      className="rounded-full bg-rose-500/80 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isMutating}
                                      onClick={() => setConfirmingCancel(null)}
                                      className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 transition hover:border-white/20 disabled:opacity-50"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() =>
                                      setConfirmingCancel(req.id)
                                    }
                                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Right column: People you may know */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        People you may know
                      </h3>
                      {suggestions.length === 0 ? (
                        <p className="mt-2 text-sm text-zinc-500">
                          No suggestions right now.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {suggestions.map((person) => {
                            const isFriend = friendIds.has(person.id);
                            const isOutgoing = outgoingIds.has(person.id);
                            const mutualLabel =
                              person.mutual_count === 1
                                ? "1 mutual friend"
                                : `${person.mutual_count} mutual friends`;
                            return (
                              <div
                                key={person.id}
                                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30">
                                    {person.avatar_url ? (
                                      <img
                                        src={person.avatar_url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-[10px] text-zinc-500">
                                        {(person.display_name ?? "?")[0]}
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-zinc-100">
                                      {displayFriendName(person)}
                                    </p>
                                    <p className="text-xs text-amber-200">
                                      {mutualLabel}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={isFriend || isOutgoing || isMutating}
                                  onClick={() => sendRequest(person.id)}
                                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isFriend
                                    ? "Friends"
                                    : isOutgoing
                                      ? "Pending"
                                      : "Add"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Friends list ── */}
                  <div className="border-t border-white/10 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Your friends
                    </h3>
                    {friends.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-500">
                        No friends yet. Search to add someone.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {friends.map((friend) => (
                          <div
                            key={friend.id}
                            className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30">
                                {friend.avatar_url ? (
                                  <img
                                    src={friend.avatar_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-xs text-zinc-500">
                                    {(friend.display_name ?? "?")[0]}
                                  </span>
                                )}
                              </div>
                              <Link
                                href={`/profile/${friend.id}`}
                                className="text-sm font-medium text-zinc-100 underline-offset-2 hover:underline hover:text-amber-200"
                              >
                                {displayFriendName(friend)}
                              </Link>
                            </div>
                            {friend.request_id ? (
                              confirmingRemove === friend.request_id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-zinc-400">
                                    Remove?
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() =>
                                      deleteRequest(friend.request_id!)
                                    }
                                    className="rounded-full bg-rose-500/80 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() => setConfirmingRemove(null)}
                                    className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 transition hover:border-white/20 disabled:opacity-50"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() =>
                                    setConfirmingRemove(friend.request_id!)
                                  }
                                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              )
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
