"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  buildEntryShareText,
  buildFeedEntryMetaFields as buildEntryMetaFields,
  COLLECTIONS_COPY,
  DEFAULT_FEED_REPORT_REASON as DEFAULT_REPORT_REASON,
  FEED_EYEBROW,
  FEED_LOAD_MORE_LABEL,
  FEED_PHOTO_TYPE_LABELS as PHOTO_TYPE_LABELS,
  FEED_REACTION_EMOJIS as REACTION_EMOJIS,
  FEED_REPORT_REASON_OPTIONS as REPORT_REASON_OPTIONS,
  FEED_SCOPE_LABELS,
  FEED_TITLE_ALL,
  FEED_TITLE_CIRCLE,
  type CollectionOption,
  type EntryCollectionSummary,
  normalizePrivacyLevel,
  type FeedReportReason as ReportReason,
  EVENT_TYPE_LABELS,
  type EventTypeValue,
  getPublicRatingBandLabel,
} from "@shared";
import CollectionPickerPopover from "@/components/collections/CollectionPickerPopover";
import FirstRunChecklist from "@/features/feed/FirstRunChecklist";
import PalateGlimpse from "@/features/palate/PalateGlimpse";
import { formatConsumedDate } from "@/lib/formatDate";
import {
  addEntryToCollectionsClient,
  createUserCollectionClient,
  fetchEntryCollectionsClient,
  fetchUserCollectionsClient,
} from "@/lib/collections/client";
import {
  DRINKING_NOW_REFRESH_INTERVAL_MS,
  isDrinkingNowActive,
} from "@/lib/drinkingNow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { copyTextToClipboard } from "@/lib/clipboard";
import Photo from "@/components/Photo";
import AppImage from "@/components/AppImage";
import AppShell from "@/components/AppShell";
import GroupedPostGallery from "@/components/GroupedPostGallery";
import QprBadge from "@/components/QprBadge";
import Button, { Chip, SegmentedControl } from "@/components/ui/Button";
import ScoreBadge from "@/components/ui/ScoreBadge";
import type {
  EntryGroup,
  GroupedEntrySlide,
  PrivacyLevel,
  WineEntryWithUrls,
} from "@/types/wine";

function isDuplicateReportError(error: { code?: string | null; message?: string | null }) {
  return (
    error.code === "23505" ||
    (error.message ?? "").includes("content_reports_unique_active_")
  );
}
const COLLAPSED_NOTES_STYLE: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

type FeedPhoto = {
  type: keyof typeof PHOTO_TYPE_LABELS;
  url: string;
};

type FeedEntry = WineEntryWithUrls & {
  author_name: string;
  author_avatar_url?: string | null;
  drinking_now?: boolean | null;
  viewer_is_direct_friend?: boolean;
  can_react?: boolean;
  can_comment?: boolean;
  comments_privacy?: PrivacyLevel;
  comment_count?: number;
  reaction_counts?: Record<string, number>;
  my_reactions?: string[];
  reaction_users?: Record<string, string[]>;
  photo_gallery?: FeedPhoto[];
  entry_group?: EntryGroup | null;
  group_slides?: GroupedEntrySlide[];
};

type FeedReply = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  author_name: string | null;
  author_avatar_url?: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
};

type FeedComment = {
  id: string;
  entry_id: string;
  user_id: string;
  author_name: string | null;
  author_avatar_url?: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
  replies: FeedReply[];
};

function EntryPhotoGallery({ entry }: { entry: FeedEntry }) {
  const fallbackPhotos: FeedPhoto[] = entry.place_image_url
    ? [{ type: "place", url: entry.place_image_url }]
    : entry.label_image_url
      ? [{ type: "label", url: entry.label_image_url }]
      : [];
  const photos = entry.photo_gallery?.length ? entry.photo_gallery : fallbackPhotos;
  const [index, setIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const didSwipeRef = useRef(false);

  if (photos.length === 0) {
    return null;
  }

  const total = photos.length;
  const activeIndex = Math.min(index, total - 1);
  const goPrev = () => setIndex((current) => (current - 1 + total) % total);
  const goNext = () => setIndex((current) => (current + 1) % total);

  return (
    <div
      className="relative overflow-hidden bg-black/40"
      style={{ aspectRatio: "4 / 3" }}
      onClickCapture={(event) => {
        if (!didSwipeRef.current) {
          return;
        }
        didSwipeRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className="flex h-full transition-transform duration-300"
        style={{
          transform: `translateX(-${activeIndex * 100}%)`,
          touchAction: "pan-y",
        }}
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null;
          touchStartYRef.current = event.touches[0]?.clientY ?? null;
          didSwipeRef.current = false;
        }}
        onTouchMove={(event) => {
          if (touchStartXRef.current === null || touchStartYRef.current === null) {
            return;
          }
          const point = event.touches[0];
          if (!point) {
            return;
          }
          const deltaX = Math.abs(point.clientX - touchStartXRef.current);
          const deltaY = Math.abs(point.clientY - touchStartYRef.current);
          if (deltaX > 10 || deltaY > 10) {
            didSwipeRef.current = true;
          }
        }}
        onTouchEnd={(event) => {
          if (photos.length <= 1 || touchStartXRef.current === null) {
            touchStartXRef.current = null;
            touchStartYRef.current = null;
            return;
          }
          const endX = event.changedTouches[0]?.clientX ?? touchStartXRef.current;
          const delta = touchStartXRef.current - endX;
          touchStartXRef.current = null;
          touchStartYRef.current = null;
          if (Math.abs(delta) < 40) return;
          didSwipeRef.current = true;
          if (delta > 0) goNext();
          else goPrev();
        }}
        onTouchCancel={() => {
          touchStartXRef.current = null;
          touchStartYRef.current = null;
        }}
      >
        {photos.map((photo, photoIndex) => (
          <div key={`${photo.type}-${photo.url}-${photoIndex}`} className="relative min-w-full">
            <Photo
              src={photo.url}
              alt={`${entry.wine_name ?? entry.producer ?? "Wine"} ${PHOTO_TYPE_LABELS[photo.type]} photo`}
              containerClassName="h-full w-full"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
            <span className="absolute left-2 top-2 rounded-full border border-[var(--color-border-strong)] bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-primary)]">
              {PHOTO_TYPE_LABELS[photo.type]}
            </span>
          </div>
        ))}
      </div>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] md:inline-flex"
            aria-label="Previous photo"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
          >
            {"<"}
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] md:inline-flex"
            aria-label="Next photo"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
          >
            {">"}
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--color-border)] bg-black/45 px-2 py-1">
            {photos.map((_, dotIndex) => (
              <button
                key={dotIndex}
                type="button"
                aria-label={`Go to photo ${dotIndex + 1}`}
                className={`h-1.5 w-1.5 rounded-full transition ${
                  dotIndex === activeIndex ? "bg-accent-primary" : "bg-zinc-400/70"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setIndex(dotIndex);
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CommentBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7 18H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4z" />
    </svg>
  );
}

function CommentAuthorAvatar({
  authorName,
  authorAvatarUrl,
}: {
  authorName: string;
  authorAvatarUrl?: string | null;
}) {
  const fallbackInitial = (authorName.trim()[0] ?? "?").toUpperCase();

  if (authorAvatarUrl) {
    return (
      <span
        className="h-5 w-5 shrink-0 rounded-full border border-[var(--color-border-strong)] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${authorAvatarUrl})` }}
        aria-hidden
      />
    );
  }

  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-black/40 text-[10px] font-semibold text-[var(--color-text-secondary)]"
      aria-hidden
    >
      {fallbackInitial}
    </span>
  );
}

function formatCommentDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function FeedPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedScope, setFeedScope] = useState<"public" | "friends">("public");
  const [reactionPopupEntryId, setReactionPopupEntryId] = useState<string | null>(null);
  const [reactionUsersPopup, setReactionUsersPopup] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [nextCursorV2, setNextCursorV2] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [groupedSlideIndexByEntryId, setGroupedSlideIndexByEntryId] = useState<Record<string, number>>({});
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [collectionMembershipsByEntryId, setCollectionMembershipsByEntryId] = useState<
    Record<string, EntryCollectionSummary[]>
  >({});
  const [collectionPickerEntryId, setCollectionPickerEntryId] = useState<string | null>(null);
  const [savingCollectionEntryId, setSavingCollectionEntryId] = useState<string | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [expandedNotesByEntryId, setExpandedNotesByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [expandedCommentsByEntryId, setExpandedCommentsByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [commentCountByEntryId, setCommentCountByEntryId] = useState<Record<string, number>>({});
  const [commentsByEntryId, setCommentsByEntryId] = useState<Record<string, FeedComment[]>>({});
  const [commentDraftByEntryId, setCommentDraftByEntryId] = useState<Record<string, string>>({});
  const [replyTargetByEntryId, setReplyTargetByEntryId] = useState<
    Record<string, string | null>
  >({});
  const [expandedRepliesByCommentId, setExpandedRepliesByCommentId] = useState<
    Record<string, boolean>
  >({});
  const [loadingCommentsByEntryId, setLoadingCommentsByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [postingCommentByEntryId, setPostingCommentByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [deletingCommentById, setDeletingCommentById] = useState<
    Record<string, boolean>
  >({});
  const [commentErrorByEntryId, setCommentErrorByEntryId] = useState<Record<string, string | null>>(
    {}
  );
  const [postMenuEntryId, setPostMenuEntryId] = useState<string | null>(null);
  const [postMenuView, setPostMenuView] = useState<"actions" | "report">("actions");
  const [sharingEntryId, setSharingEntryId] = useState<string | null>(null);
  const [reportingEntryId, setReportingEntryId] = useState<string | null>(null);
  const [postReportReasonByEntryId, setPostReportReasonByEntryId] = useState<
    Record<string, ReportReason>
  >({});
  const [commentMenuKey, setCommentMenuKey] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [commentReportReasonByCommentId, setCommentReportReasonByCommentId] = useState<
    Record<string, ReportReason>
  >({});
  const [moderationNotice, setModerationNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!moderationNotice) {
      return;
    }
    const timer = window.setTimeout(() => setModerationNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [moderationNotice]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, DRINKING_NOW_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!postMenuEntryId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPostMenuEntryId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [postMenuEntryId]);

  useEffect(() => {
    if (!postMenuEntryId) {
      setPostMenuView("actions");
    }
  }, [postMenuEntryId]);

  const toggleNotesExpanded = (entryId: string) => {
    setExpandedNotesByEntryId((current) => ({
      ...current,
      [entryId]: !current[entryId],
    }));
  };

  const commentCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      const entryComments = commentsByEntryId[entry.id];
      if (entryComments) {
        map.set(entry.id, entryComments.reduce((total, comment) => total + 1 + comment.replies.length, 0));
      } else {
        map.set(entry.id, commentCountByEntryId[entry.id] ?? entry.comment_count ?? 0);
      }
    }
    return map;
  }, [entries, commentsByEntryId, commentCountByEntryId]);



  const toggleReaction = async (entryId: string, emoji: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const counts = entry.reaction_counts ?? {};
    const mine = entry.my_reactions ?? [];
    const hasMine = mine.includes(emoji);

    const updateEntry = (next: FeedEntry) =>
      setEntries((prev) => prev.map((e) => (e.id === entryId ? next : e)));

    if (hasMine) {
      const res = await fetch(`/api/entries/${entryId}/reactions?emoji=${encodeURIComponent(emoji)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      const nextCount = Math.max(0, (counts[emoji] ?? 1) - 1);
      const nextCounts = { ...counts };
      if (nextCount === 0) delete nextCounts[emoji];
      else nextCounts[emoji] = nextCount;
      updateEntry({
        ...entry,
        reaction_counts: nextCounts,
        my_reactions: mine.filter((e) => e !== emoji),
      });
    } else {
      const res = await fetch(`/api/entries/${entryId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) return;
      updateEntry({
        ...entry,
        reaction_counts: { ...counts, [emoji]: (counts[emoji] ?? 0) + 1 },
        my_reactions: [...mine, emoji],
      });
    }
    setReactionPopupEntryId(null);
  };

  const loadCommentsForEntry = async (
    entryId: string,
    { force = false }: { force?: boolean } = {}
  ) => {
    if (loadingCommentsByEntryId[entryId]) return;
    if (!force && commentsByEntryId[entryId]) return;

    setLoadingCommentsByEntryId((current) => ({
      ...current,
      [entryId]: true,
    }));
    setCommentErrorByEntryId((current) => ({
      ...current,
      [entryId]: null,
    }));

    try {
      const response = await fetch(`/api/entries/${entryId}/comments`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorMessage =
          typeof payload.error === "string"
            ? payload.error
            : "Unable to load comments right now.";
        setCommentErrorByEntryId((current) => ({
          ...current,
          [entryId]: errorMessage,
        }));
        if (response.status === 403) {
          setEntries((current) =>
            current.map((entry) =>
              entry.id === entryId ? { ...entry, can_comment: false } : entry
            )
          );
        }
        return;
      }

      const data = await response.json().catch(() => ({}));
      const nextComments = Array.isArray(data.comments) ? (data.comments as FeedComment[]) : [];
      const nextCount =
        typeof data.comment_count === "number"
          ? data.comment_count
          : nextComments.reduce((total, comment) => total + 1 + comment.replies.length, 0);

      setCommentsByEntryId((current) => ({
        ...current,
        [entryId]: nextComments,
      }));
      setCommentCountByEntryId((current) => ({
        ...current,
        [entryId]: nextCount,
      }));
      setEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                can_comment:
                  typeof data.can_comment === "boolean" ? data.can_comment : entry.can_comment,
                comments_privacy:
                  data.comments_privacy === "public" ||
                  data.comments_privacy === "friends_of_friends" ||
                  data.comments_privacy === "friends" ||
                  data.comments_privacy === "private"
                    ? data.comments_privacy
                    : entry.comments_privacy,
              }
            : entry
        )
      );
    } finally {
      setLoadingCommentsByEntryId((current) => ({
        ...current,
        [entryId]: false,
      }));
    }
  };

  const toggleCommentsExpanded = (entryId: string) => {
    setReactionPopupEntryId(null);
    setCommentMenuKey(null);
    setExpandedCommentsByEntryId((current) => {
      const nextExpanded = !current[entryId];
      if (nextExpanded) {
        void loadCommentsForEntry(entryId);
      }
      return {
        ...current,
        [entryId]: nextExpanded,
      };
    });
  };

  const submitCommentForEntry = async (entryId: string) => {
    const nextBody = (commentDraftByEntryId[entryId] ?? "").trim();
    if (!nextBody) return;
    if (postingCommentByEntryId[entryId]) return;
    const replyTargetId = replyTargetByEntryId[entryId] ?? null;
    const canComment = entries.find((entry) => entry.id === entryId)?.can_comment ?? true;
    if (!canComment) {
      setCommentErrorByEntryId((current) => ({
        ...current,
        [entryId]: "Comments are private for this post.",
      }));
      return;
    }

    setPostingCommentByEntryId((current) => ({
      ...current,
      [entryId]: true,
    }));
    setCommentErrorByEntryId((current) => ({
      ...current,
      [entryId]: null,
    }));

    try {
      const response = await fetch(`/api/entries/${entryId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: nextBody,
          parent_comment_id: replyTargetId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorMessage =
          typeof payload.error === "string"
            ? payload.error
            : "Unable to post comment right now.";
        setCommentErrorByEntryId((current) => ({
          ...current,
          [entryId]: errorMessage,
        }));
        return;
      }

      if (replyTargetId) {
        setExpandedRepliesByCommentId((current) => ({
          ...current,
          [replyTargetId]: true,
        }));
      }

      setCommentDraftByEntryId((current) => ({
        ...current,
        [entryId]: "",
      }));
      setReplyTargetByEntryId((current) => ({
        ...current,
        [entryId]: null,
      }));

      await loadCommentsForEntry(entryId, { force: true });
    } finally {
      setPostingCommentByEntryId((current) => ({
        ...current,
        [entryId]: false,
      }));
    }
  };

  const deleteCommentForEntry = async (entryId: string, commentId: string) => {
    if (deletingCommentById[commentId]) return;

    setDeletingCommentById((current) => ({
      ...current,
      [commentId]: true,
    }));
    setCommentErrorByEntryId((current) => ({
      ...current,
      [entryId]: null,
    }));

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorMessage =
          typeof payload.error === "string"
            ? payload.error
            : "Unable to delete comment right now.";
        setCommentErrorByEntryId((current) => ({
          ...current,
          [entryId]: errorMessage,
        }));
        return;
      }

      setReplyTargetByEntryId((current) =>
        current[entryId] === commentId
          ? {
              ...current,
              [entryId]: null,
            }
          : current
      );
      await loadCommentsForEntry(entryId, { force: true });
    } finally {
      setDeletingCommentById((current) => ({
        ...current,
        [commentId]: false,
      }));
    }
  };

  const reportContent = async ({
    targetType,
    entryId,
    targetUserId,
    reason,
    commentId,
  }: {
    targetType: "entry" | "comment";
    entryId: string;
    targetUserId: string;
    reason: ReportReason;
    commentId?: string;
  }) => {
    if (!viewerUserId) {
      setModerationNotice({
        kind: "error",
        message: "Sign in to report content.",
      });
      return;
    }
    if (viewerUserId === targetUserId) {
      return;
    }

    if (targetType === "entry") {
      setReportingEntryId(entryId);
      setPostMenuEntryId(null);
    } else if (commentId) {
      setReportingCommentId(commentId);
      setCommentMenuKey(null);
    }
    setModerationNotice(null);

    const { error } = await supabase.from("content_reports").insert({
      reporter_id: viewerUserId,
      target_type: targetType,
      entry_id: entryId,
      comment_id: commentId ?? null,
      target_user_id: targetUserId,
      reason,
      details: null,
    });

    if (error) {
      setModerationNotice({
        kind: "error",
        message: isDuplicateReportError(error)
          ? "You've already reported this."
          : error.message.includes("content_reports")
          ? "Reporting is temporarily unavailable."
          : "Unable to report right now.",
      });
      if (targetType === "entry") {
        setReportingEntryId(null);
      } else if (commentId) {
        setReportingCommentId(null);
      }
      return;
    }

    setModerationNotice({
      kind: "success",
      message: "Report submitted.",
    });
    if (targetType === "entry") {
      setReportingEntryId(null);
    } else if (commentId) {
      setReportingCommentId(null);
    }
  };

  const ensureCollectionsLoaded = async () => {
    const result = await fetchUserCollectionsClient();
    if (!result.ok) {
      throw new Error(result.errorMessage);
    }
    setCollections(
      result.collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
      }))
    );
    return result.collections;
  };

  const openCollectionPicker = async (entryId: string) => {
    setModerationNotice(null);
    setCollectionPickerEntryId(entryId);
    try {
      const [collectionResult, membershipResult] = await Promise.all([
        ensureCollectionsLoaded(),
        fetchEntryCollectionsClient([entryId]),
      ]);

      const memberships = membershipResult.ok
        ? membershipResult.memberships[entryId] ?? []
        : collectionMembershipsByEntryId[entryId] ?? [];

      if (!membershipResult.ok) {
        setModerationNotice({
          kind: "error",
          message: membershipResult.errorMessage,
        });
      }

      setCollections(
        collectionResult.map((collection) => ({
          id: collection.id,
          name: collection.name,
        }))
      );
      setCollectionMembershipsByEntryId((current) => ({
        ...current,
        [entryId]: memberships,
      }));
      setSelectedCollectionIds(memberships.map((membership) => membership.id));
    } catch (error) {
      setCollectionPickerEntryId(null);
      setModerationNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Unable to load collections.",
      });
    }
  };

  const handleCreateCollection = async (name: string) => {
    setCreatingCollection(true);
    const result = await createUserCollectionClient(name);
    setCreatingCollection(false);

    if (!result.ok) {
      setModerationNotice({
        kind: "error",
        message: result.errorMessage,
      });
      return;
    }

    setCollections((current) => {
      if (current.some((collection) => collection.id === result.collection.id)) {
        return current;
      }
      return [...current, result.collection];
    });
    setSelectedCollectionIds((current) =>
      current.includes(result.collection.id)
        ? current
        : [...current, result.collection.id]
    );
  };

  const saveCollectionSelection = async () => {
    if (!collectionPickerEntryId || savingCollectionEntryId === collectionPickerEntryId) {
      return;
    }

    const lockedCollectionIds =
      collectionMembershipsByEntryId[collectionPickerEntryId]?.map((membership) => membership.id) ?? [];

    setSavingCollectionEntryId(collectionPickerEntryId);
    const result = await addEntryToCollectionsClient({
      entryId: collectionPickerEntryId,
      collectionIds: Array.from(new Set([...lockedCollectionIds, ...selectedCollectionIds])),
    });
    setSavingCollectionEntryId(null);

    if (!result.ok) {
      setModerationNotice({
        kind: "error",
        message: result.errorMessage,
      });
      return;
    }

    setCollectionMembershipsByEntryId((current) => ({
      ...current,
      [collectionPickerEntryId]: result.memberships,
    }));
    setCollectionPickerEntryId(null);
    setModerationNotice({
      kind: "success",
      message:
        result.addedCollectionIds.length > 0
          ? `Saved to ${result.addedCollectionIds.length} collection${
              result.addedCollectionIds.length === 1 ? "" : "s"
            }.`
          : "Already saved to the selected collection(s).",
    });
  };

  const shareEntry = async (entry: FeedEntry) => {
    if (!viewerUserId) {
      setModerationNotice({
        kind: "error",
        message: "Sign in to share posts.",
      });
      return;
    }

    if (normalizePrivacyLevel(entry.entry_privacy, "public") !== "public") {
      setModerationNotice({
        kind: "error",
        message: "Only public posts can be shared.",
      });
      return;
    }

    setSharingEntryId(entry.id);
    setPostMenuEntryId(null);
    setModerationNotice(null);

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postId: entry.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || typeof payload.url !== "string") {
        setModerationNotice({
          kind: "error",
          message: payload.error ?? "Unable to create share link.",
        });
        return;
      }

      const shareUrl = payload.url;
      const shareText = buildEntryShareText();

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({
            text: shareText,
            url: shareUrl,
          });
          setModerationNotice({
            kind: "success",
            message: "Share link ready.",
          });
          return;
        } catch (shareError) {
          if (shareError instanceof Error && shareError.name === "AbortError") {
            return;
          }
        }
      }

      const copied = await copyTextToClipboard(shareUrl);
      if (copied) {
        setModerationNotice({
          kind: "success",
          message: "Share link copied to clipboard.",
        });
      } else if (typeof window !== "undefined" && typeof window.prompt === "function") {
        window.prompt("Copy share link", shareUrl);
        setModerationNotice({
          kind: "success",
          message: "Share link ready. Copy it from the prompt.",
        });
      } else {
        setModerationNotice({
          kind: "error",
          message: "Unable to copy link automatically.",
        });
      }
    } catch {
      setModerationNotice({
        kind: "error",
        message: "Unable to create share link.",
      });
    } finally {
      setSharingEntryId(null);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadFeed = async () => {
      if (isMounted) {
        setLoading(true);
        setErrorMessage(null);
        setNextCursor(null);
        setNextCursorV2(null);
        setHasMore(false);
      }

      try {
        const feedResponse = await fetch(`/api/feed?scope=${feedScope}&limit=30`, {
          cache: "no-store",
        });

        if (!feedResponse.ok) {
          if (isMounted) {
            setErrorMessage("Unable to load feed.");
            setLoading(false);
          }
          return;
        }

        const feedData = await feedResponse.json();

        if (isMounted) {
          const nextEntries = (feedData.entries ?? []) as FeedEntry[];
          setEntries(nextEntries);
          setViewerUserId(
            typeof feedData.viewer_user_id === "string"
              ? feedData.viewer_user_id
              : null
          );
          setCommentCountByEntryId(
            Object.fromEntries(
              nextEntries.map((entry) => [entry.id, entry.comment_count ?? 0])
            )
          );
          setCommentsByEntryId({});
          setCommentDraftByEntryId({});
          setReplyTargetByEntryId({});
          setExpandedCommentsByEntryId({});
          setExpandedRepliesByCommentId({});
          setLoadingCommentsByEntryId({});
          setPostingCommentByEntryId({});
          setDeletingCommentById({});
          setCommentErrorByEntryId({});
          setReactionPopupEntryId(null);
          setPostMenuEntryId(null);
          setSharingEntryId(null);
          setReportingEntryId(null);
          setPostReportReasonByEntryId({});
          setCommentMenuKey(null);
          setReportingCommentId(null);
          setCommentReportReasonByCommentId({});
          setNextCursor(feedData.next_cursor ?? null);
          setNextCursorV2(feedData.next_cursor_v2 ?? null);
          setHasMore(Boolean(feedData.has_more));
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Unable to load feed.");
          setLoading(false);
        }
      }
    };

    loadFeed().catch(() => null);

    return () => {
      isMounted = false;
    };
  }, [feedScope]);

  const loadMoreFeed = async () => {
    if (!hasMore || loadingMore || (!nextCursor && !nextCursorV2)) return;
    setLoadingMore(true);
    try {
      const cursorQuery = nextCursorV2
        ? `cursor_v2=${encodeURIComponent(nextCursorV2)}`
        : `cursor=${encodeURIComponent(nextCursor ?? "")}`;
      const res = await fetch(
        `/api/feed?scope=${feedScope}&limit=30&${cursorQuery}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      const nextEntries = (data.entries ?? []) as FeedEntry[];
      setEntries((prev) => [...prev, ...nextEntries]);
      setCommentCountByEntryId((current) => ({
        ...current,
        ...Object.fromEntries(nextEntries.map((entry) => [entry.id, entry.comment_count ?? 0])),
      }));
      setNextCursor(data.next_cursor ?? null);
      setNextCursorV2(data.next_cursor_v2 ?? null);
      setHasMore(Boolean(data.has_more));
    } finally {
      setLoadingMore(false);
    }
  };

  const sortedEntries = entries;

  return (
    <AppShell>
      <div className="overflow-x-hidden py-6 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-8">
        <header className="space-y-2 px-6">
          <span className="block text-[9px] uppercase tracking-[3px] text-[var(--color-accent-secondary)]">
            {FEED_EYEBROW}
          </span>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 300 }} className="text-[var(--color-text-primary)]">
            {feedScope === "friends" ? FEED_TITLE_CIRCLE : FEED_TITLE_ALL}
          </h1>
        </header>

        <div className="px-6">
          <SegmentedControl
            options={[
              { value: "public", label: FEED_SCOPE_LABELS.public },
              { value: "friends", label: FEED_SCOPE_LABELS.friends },
            ]}
            value={feedScope}
            onChange={setFeedScope}
          />
        </div>

        {/* "Your palate, read by the somm" — the returning-user moment
            (overhaul-plan §4). Self-gated: renders nothing until the
            viewer has enough palate data, so it's safe to place
            unconditionally at the top of the home surface. */}
        <div className="px-6">
          <PalateGlimpse />
        </div>

        {moderationNotice ? (
          <div
            className={`rounded-xl border px-3 py-2 text-xs mx-6 ${
              moderationNotice.kind === "success"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                : "border-rose-500/40 bg-rose-500/10 text-rose-100"
            }`}
          >
            {moderationNotice.message}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--color-border)] bg-surface-primary/10 p-4 animate-pulse"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-full bg-surface-raised" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-28 rounded bg-surface-raised" />
                    <div className="h-2.5 w-20 rounded bg-surface-raised" />
                  </div>
                </div>
                <div className="aspect-[4/3] w-full rounded-xl bg-surface-raised mb-4" />
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded bg-surface-raised" />
                  <div className="h-3 w-1/2 rounded bg-surface-raised" />
                </div>
              </div>
            ))}
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : entries.length === 0 ? (
          <div className="mx-6">
            <FirstRunChecklist />
          </div>
        ) : (
          <>
          <div className="grid min-w-0 items-start gap-6">
            {sortedEntries.map((entry) => (
              <article
                key={entry.id}
                className={`group flex min-w-0 cursor-pointer flex-col border-[0.5px] p-4 px-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 ${
                  isDrinkingNowActive({
                    drinkingNow: entry.drinking_now,
                    createdAt: entry.created_at,
                    now: currentTimeMs,
                  }) && entry.viewer_is_direct_friend === true
                    ? "rounded-[10px] border-[rgba(74,48,96,0.4)] bg-[#2E1420] hover:border-[rgba(74,48,96,0.7)]"
                    : "rounded-[10px] border-[var(--color-border)] bg-surface-primary hover:border-[var(--color-accent-secondary)]/40"
                }`}
                role="button"
                tabIndex={0}
                onPointerDown={(event) => {
                  pointerStartRef.current = { x: event.clientX, y: event.clientY };
                }}
                onClick={(event) => {
                  const start = pointerStartRef.current;
                  pointerStartRef.current = null;
                  if (start) {
                    const dx = Math.abs(event.clientX - start.x);
                    const dy = Math.abs(event.clientY - start.y);
                    if (dx > 10 || dy > 10) return;
                  }
                  router.push(`/entries/${entry.id}?from=feed`);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/entries/${entry.id}?from=feed`);
                  }
                }}
              >
                <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-[var(--color-text-tertiary)]">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/profile/${entry.user_id}`);
                      }}
                        className="flex min-w-0 max-w-full items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-black/40 ring-1 ring-white/5">
                        {entry.author_avatar_url ? (
                          <AppImage
                            src={entry.author_avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] font-medium text-[var(--color-text-tertiary)]">
                            {(entry.author_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="block min-w-0 whitespace-normal break-words font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent-secondary)]">
                        {entry.author_name}
                        <span className="ml-1">is drinking:</span>
                      </span>
                    </button>
                    {/* Occasion pill removed from top — the occasion now
                        reads 'Occasion: {label}' inside the photo gallery's
                        inner band (GroupedPostGallery header). */}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {viewerUserId && viewerUserId !== entry.user_id ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPostMenuEntryId((current) => {
                                const nextEntryId = current === entry.id ? null : entry.id;
                                if (nextEntryId) {
                                  setPostMenuView("actions");
                                }
                                return nextEntryId;
                              });
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                            aria-label="More actions"
                          >
                            <span className="inline-flex items-center gap-0.5" aria-hidden>
                              <span className="h-1 w-1 rounded-full bg-current" />
                              <span className="h-1 w-1 rounded-full bg-current" />
                              <span className="h-1 w-1 rounded-full bg-current" />
                            </span>
                          </button>
                          {postMenuEntryId === entry.id ? (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setPostMenuEntryId(null)}
                                aria-hidden="true"
                              />
                              <div
                                className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[var(--color-border-strong)] bg-surface-raised p-2 text-left shadow-lg"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {postMenuView === "actions" ? (
                                  <div className="flex flex-col gap-2">
                                    {normalizePrivacyLevel(entry.entry_privacy, "public") === "public" ? (
                                      <button
                                        type="button"
                                        disabled={sharingEntryId === entry.id || reportingEntryId === entry.id}
                                        onClick={() => void shareEntry(entry)}
                                        className="flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--color-border)] bg-surface-muted px-3 py-2 text-[11px] font-medium text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)] hover:bg-surface-hover disabled:opacity-50"
                                      >
                                        {sharingEntryId === entry.id ? "Sharing..." : "Share via text"}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      disabled={sharingEntryId === entry.id || reportingEntryId === entry.id}
                                      onClick={() => setPostMenuView("report")}
                                      className="flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--color-border)] bg-surface-muted px-3 py-2 text-[11px] font-medium text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)] hover:bg-surface-hover disabled:opacity-50"
                                    >
                                      Report post
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2 px-1">
                                      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                                        Report post
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setPostMenuView("actions")}
                                        className="text-[11px] font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
                                      >
                                        Back
                                      </button>
                                    </div>
                                    <select
                                      id={`post-report-reason-${entry.id}`}
                                      value={postReportReasonByEntryId[entry.id] ?? DEFAULT_REPORT_REASON}
                                      onChange={(event) =>
                                        setPostReportReasonByEntryId((current) => ({
                                          ...current,
                                          [entry.id]: event.target.value as ReportReason,
                                        }))
                                      }
                                      className="w-full rounded-md border border-[var(--color-border-strong)] bg-surface-muted px-2 py-2 text-[11px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)]/60 focus:outline-none"
                                    >
                                      {REPORT_REASON_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={reportingEntryId === entry.id}
                                      onClick={() =>
                                        void reportContent({
                                          targetType: "entry",
                                          entryId: entry.id,
                                          targetUserId: entry.user_id,
                                          reason:
                                            postReportReasonByEntryId[entry.id] ??
                                            DEFAULT_REPORT_REASON,
                                        })
                                      }
                                      className="flex min-h-10 w-full items-center justify-center rounded-md border border-[var(--color-border)] bg-surface-muted px-3 py-2 text-[11px] font-medium text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)] hover:bg-surface-hover disabled:opacity-50"
                                    >
                                      {reportingEntryId === entry.id
                                        ? "Reporting..."
                                        : "Submit report"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                {/* Wine name + meta — sits between the "is drinking:" byline
                    above and the photo below, per Eitan's reorder. */}
                <div className="mt-1.5">
                  {entry.entry_group ? (() => {
                    const activeSlide = (entry.group_slides ?? [])[groupedSlideIndexByEntryId[entry.id] ?? 0] ?? null;
                    const wineName = activeSlide?.wine_name ?? activeSlide?.producer ?? null;
                    const meta = activeSlide ? [
                      activeSlide.producer && activeSlide.producer !== activeSlide.wine_name ? activeSlide.producer : null,
                      activeSlide.vintage,
                      activeSlide.appellation || activeSlide.region,
                      activeSlide.country,
                    ].filter(Boolean).slice(0, 3).join(" · ") : "";
                    return (
                      <div className="min-w-0">
                        {wineName ? (
                          <h2 className="text-base font-semibold leading-snug text-[var(--color-text-primary)] break-words">
                            {wineName}
                          </h2>
                        ) : null}
                        {meta ? (
                          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)] break-words">{meta}</p>
                        ) : null}
                      </div>
                    );
                  })() : (
                    <div className="min-w-0">
                      {entry.wine_name ? (
                        <h2 className="text-base font-semibold leading-snug text-[var(--color-text-primary)] break-words">
                          {entry.wine_name}
                        </h2>
                      ) : null}
                      {(() => {
                        const meta = buildEntryMetaFields(entry).join(" · ");

                        return meta ? (
                          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)] break-words">{meta}</p>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
                <div className="mt-3 -mx-5">
                  {entry.entry_group && (entry.group_slides?.length ?? 0) > 0 ? (
                    <GroupedPostGallery
                      title={entry.entry_group.event_type ? (EVENT_TYPE_LABELS[entry.entry_group.event_type as EventTypeValue] ?? entry.entry_group.title) : entry.entry_group.title}
                      slides={entry.group_slides ?? []}
                      heightClassName=""
                      onIndexChange={(index) => setGroupedSlideIndexByEntryId((prev) => ({ ...prev, [entry.id]: index }))}
                    />
                  ) : (
                    <EntryPhotoGallery entry={entry} />
                  )}
                </div>
                {/* Order under photo (Eitan reorder v3):
                    1. Notes block (label + body, left) with rating + QPR
                       (right, top-aligned with TASTING NOTES: label so the
                       rating sits 'just below the image' on the right edge).
                    2. Date row, right-aligned, mt-4 for the tiny extra
                       breathing room Eitan asked for.
                    3. Tasted-with line. */}
                {(() => {
                  const notes = (entry.notes ?? "").trim();
                  const hasRating = !entry.entry_group
                    && typeof entry.rating === "number"
                    && !Number.isNaN(entry.rating);
                  const hasQpr = !entry.entry_group && Boolean(entry.qpr_level);
                  if (!notes && !hasRating && !hasQpr) {
                    return null;
                  }
                  const expanded = Boolean(expandedNotesByEntryId[entry.id]);
                  // Decision 1 (overhaul-plan): the raw 1-100 rating is a
                  // private input. Only the entry owner sees their own
                  // number (ScoreBadge, as before); every other viewer sees
                  // a warm qualitative band instead — never the score.
                  const isOwnEntry = viewerUserId !== null && viewerUserId === entry.user_id;
                  const publicBandLabel = hasRating && !isOwnEntry
                    ? getPublicRatingBandLabel(entry.rating)
                    : null;
                  return (
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <div className="min-w-0 max-w-[60%] flex-1">
                        {notes ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleNotesExpanded(entry.id);
                            }}
                            className="block w-full text-left text-base leading-snug text-[var(--color-text-primary)]"
                            title={expanded ? "Collapse notes" : "Expand notes"}
                          >
                            <span
                              className="block break-words"
                              style={expanded ? undefined : COLLAPSED_NOTES_STYLE}
                            >
                              <span className="font-semibold">Notes:</span>{" "}
                              {notes}
                            </span>
                          </button>
                        ) : null}
                      </div>
                      {hasRating || hasQpr ? (
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {hasRating ? (
                            isOwnEntry ? (
                              <ScoreBadge value={entry.rating as number} kind="rating" label="pts" size="sm" />
                            ) : publicBandLabel ? (
                              <Chip variant="tag" tone="neutral">
                                {publicBandLabel}
                              </Chip>
                            ) : null
                          ) : null}
                          {hasQpr ? <QprBadge level={entry.qpr_level!} /> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                <div className="mt-5 flex justify-end">
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {formatConsumedDate(entry.created_at)}
                  </span>
                </div>

                {entry.tasted_with_users && entry.tasted_with_users.length > 0 ? (
                  <div className="mt-3 break-words text-xs text-[var(--color-text-tertiary)]">
                    Tasted with:{" "}
                    {entry.tasted_with_users
                      .map((user) => user.display_name ?? "Unknown")
                      .join(", ")}
                  </div>
                ) : null}
                {(() => {
                  const entryComments = commentsByEntryId[entry.id] ?? [];
                  const commentDraft = commentDraftByEntryId[entry.id] ?? "";
                  const replyTargetId = replyTargetByEntryId[entry.id] ?? null;
                  const commentsLoading = Boolean(loadingCommentsByEntryId[entry.id]);
                  const postingComment = Boolean(postingCommentByEntryId[entry.id]);
                  const commentError = commentErrorByEntryId[entry.id];
                  const replyTarget =
                    replyTargetId && entryComments.length > 0
                      ? entryComments.find((comment) => comment.id === replyTargetId) ?? null
                      : null;
                  const commentsExpanded = Boolean(expandedCommentsByEntryId[entry.id]);
                  const canReact = Boolean(entry.can_react);
                  const canComment = entry.can_comment ?? true;
                  const activeCollectionEntryId =
                    entry.entry_group && (entry.group_slides?.length ?? 0) > 0
                      ? (entry.group_slides ?? [])[groupedSlideIndexByEntryId[entry.id] ?? 0]
                          ?.entry_id ?? entry.id
                      : entry.id;
                  const reactionSummary = REACTION_EMOJIS
                    .map((emoji) => ({
                      emoji,
                      count: entry.reaction_counts?.[emoji] ?? 0,
                    }))
                    .filter((item) => item.count > 0);
                  const hasReactionCounts = reactionSummary.length > 0;

                  return (
                    <>
                      <div
                        className="mt-auto"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {/* Action bar — Dani Round 4 Task 13 + Task 11 spec:
                            quiet footer, transparent bg, top divider at 0.10,
                            10px vertical padding, 12px text. */}
                        <div className="border-t border-[rgba(196,96,122,0.10)] py-[10px]">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            {canComment ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleCommentsExpanded(entry.id);
                                }}
                                className={`inline-flex items-center gap-2 rounded-full border-[0.5px] bg-transparent px-2.5 py-1.5 text-xs font-medium transition ${
                                  commentsExpanded
                                    ? "border-[var(--color-accent-secondary)]/50 text-[var(--color-accent-secondary)]"
                                    : "border-[rgba(196,96,122,0.25)] text-[#A08878] hover:border-[var(--color-accent-secondary)]/50 hover:text-[var(--color-accent-secondary)]"
                                }`}
                                aria-label={`Toggle comments (${(commentCountMap.get(entry.id) ?? 0)})`}
                              >
                                <CommentBubbleIcon className="h-4 w-4 shrink-0" />
                                <span>Comments</span>
                                <span className="rounded-full bg-[rgba(196,96,122,0.15)] px-1.5 py-0.5 tabular-nums text-[#C4607A]">
                                  {(commentCountMap.get(entry.id) ?? 0)}
                                </span>
                              </button>
                            ) : null}
                            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                              {hasReactionCounts
                                ? reactionSummary.map(({ emoji, count }) => {
                                    const names = entry.reaction_users?.[emoji] ?? [];
                                    const popupKey = `${entry.id}-${emoji}`;
                                    const showNames = reactionUsersPopup === popupKey;
                                    return (
                                      <span
                                        key={`${entry.id}-reaction-summary-${emoji}`}
                                        className="group/reaction relative"
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setReactionUsersPopup((prev) =>
                                              prev === popupKey ? null : popupKey
                                            );
                                          }}
                                          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-strong)] bg-surface-muted px-1.5 py-0.5 text-[11px] text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/40"
                                        >
                                          <span>{emoji}</span>
                                          <span className="tabular-nums text-[var(--color-text-tertiary)]">{count}</span>
                                        </button>
                                        {names.length > 0 ? (
                                          <span
                                            className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--color-border-strong)] bg-surface-raised px-2.5 py-1.5 text-[11px] text-[var(--color-text-primary)] shadow-lg transition-opacity ${
                                              showNames
                                                ? "pointer-events-auto opacity-100"
                                                : "opacity-0 group-hover/reaction:pointer-events-auto group-hover/reaction:opacity-100"
                                            }`}
                                          >
                                            {names.join(", ")}
                                          </span>
                                        ) : null}
                                      </span>
                                    );
                                  })
                                : null}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReactionPopupEntryId((id) =>
                                    id === entry.id ? null : entry.id
                                  );
                                }}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-0 bg-[rgba(196,96,122,0.12)] text-sm font-semibold leading-none transition ${
                                  canReact
                                    ? "text-[#A08878] hover:bg-[rgba(196,96,122,0.2)] hover:text-[var(--color-accent-secondary)]"
                                    : "text-[#A08878] hover:bg-[rgba(196,96,122,0.2)] hover:text-[var(--color-text-primary)]"
                                }`}
                                aria-label={canReact ? "Add reaction" : "View reaction options"}
                              >
                                +
                              </button>
                              <CollectionPickerPopover
                                open={collectionPickerEntryId === activeCollectionEntryId}
                                onOpenChange={(open) => {
                                  if (open) {
                                    void openCollectionPicker(activeCollectionEntryId);
                                  } else if (
                                    collectionPickerEntryId === activeCollectionEntryId
                                  ) {
                                    setCollectionPickerEntryId(null);
                                  }
                                }}
                                collections={collections}
                                selectedIds={selectedCollectionIds}
                                lockedIds={
                                  collectionPickerEntryId === activeCollectionEntryId
                                    ? collectionMembershipsByEntryId[activeCollectionEntryId]?.map((membership) => membership.id) ?? []
                                    : []
                                }
                                onToggleCollection={(collectionId) =>
                                  setSelectedCollectionIds((current) =>
                                    current.includes(collectionId)
                                      ? current.filter((id) => id !== collectionId)
                                      : [...current, collectionId]
                                  )
                                }
                                onCreateCollection={handleCreateCollection}
                                creating={creatingCollection}
                                primaryActionLabel={COLLECTIONS_COPY.saveActionLabel}
                                onPrimaryAction={() => void saveCollectionSelection()}
                                busy={savingCollectionEntryId === activeCollectionEntryId}
                                align="right"
                                widthClassName="w-72"
                                trigger={({ toggle }) => (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggle();
                                    }}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border-0 bg-[rgba(196,96,122,0.12)] text-[#A08878] transition hover:bg-[rgba(196,96,122,0.2)] hover:text-[var(--color-accent-secondary)]"
                                    aria-label="Add to collections"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.7"
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    >
                                      <path
                                        d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V5.5a1 1 0 0 1 1-1Z"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  </button>
                                )}
                              />
                              {canComment && (commentCountMap.get(entry.id) ?? 0) > 0 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCommentsExpanded(entry.id);
                                  }}
                                  className="text-[11px] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-accent-secondary)]"
                                >
                                  {(commentCountMap.get(entry.id) ?? 0)} {(commentCountMap.get(entry.id) ?? 0) === 1 ? "comment" : "comments"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          {reactionPopupEntryId === entry.id ? (
                            <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-surface-muted p-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {REACTION_EMOJIS.map((emoji) => {
                                  const count = entry.reaction_counts?.[emoji] ?? 0;
                                  if (canReact) {
                                    return (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleReaction(entry.id, emoji);
                                        }}
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-surface-hover ${
                                          (entry.my_reactions ?? []).includes(emoji)
                                            ? "bg-accent-primary/20"
                                            : ""
                                        }`}
                                      >
                                        {emoji}
                                      </button>
                                    );
                                  }
                                  return (
                                    <span
                                      key={emoji}
                                      className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-surface-muted px-1 text-lg text-[var(--color-text-tertiary)]"
                                    >
                                      {emoji}
                                      {count > 0 ? (
                                        <span className="ml-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
                                          {count}
                                        </span>
                                      ) : null}
                                    </span>
                                  );
                                })}
                              </div>
                              {!canReact ? (
                                <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                                  Reactions are not available for this post.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {commentsExpanded ? (
                        <div
                          className="mt-4 rounded-2xl border border-[var(--color-border)] bg-surface-muted p-3 md:mt-3"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-accent-secondary)]/70">
                              Comments
                            </p>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleCommentsExpanded(entry.id);
                              }}
                              className="text-[11px] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-primary)]"
                            >
                              Collapse
                            </button>
                          </div>
                          {commentsLoading ? (
                            <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-surface-muted p-3 text-sm text-[var(--color-text-tertiary)]">
                              Loading comments...
                            </div>
                          ) : !canComment ? (
                            <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-surface-muted p-3 text-sm text-[var(--color-text-tertiary)]">
                              Comments are private for this post.
                            </div>
                          ) : entryComments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-surface-muted p-3 text-sm text-[var(--color-text-tertiary)]">
                              No comments yet. Start the thread.
                            </div>
                          ) : (
                            <ul className="space-y-2">
                              {entryComments.map((comment) => {
                                const repliesExpanded = Boolean(
                                  expandedRepliesByCommentId[comment.id]
                                );
                                const isCommentDeleted = Boolean(comment.is_deleted);
                                const deletingComment = Boolean(
                                  deletingCommentById[comment.id]
                                );
                                const topCommentMenuKey = `${entry.id}:${comment.id}`;
                                return (
                                  <li
                                    key={comment.id}
                                    className="rounded-xl border border-[var(--color-border)] bg-black/25 p-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        {!isCommentDeleted && comment.author_name ? (
                                          <div className="flex items-center gap-2">
                                            <CommentAuthorAvatar
                                              authorName={comment.author_name}
                                              authorAvatarUrl={comment.author_avatar_url}
                                            />
                                            <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                                              {comment.author_name}
                                            </p>
                                          </div>
                                        ) : null}
                                        <p
                                          className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed ${
                                            isCommentDeleted
                                              ? "italic text-[var(--color-text-tertiary)]"
                                              : "text-[var(--color-text-primary)]"
                                          }`}
                                        >
                                          {isCommentDeleted ? "[deleted]" : comment.body}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-[11px] text-[var(--color-text-tertiary)]">
                                          {formatCommentDate(comment.created_at)}
                                        </span>
                                        {!isCommentDeleted &&
                                        viewerUserId === comment.user_id ? (
                                          <button
                                            type="button"
                                            disabled={deletingComment}
                                            onClick={() => {
                                              void deleteCommentForEntry(entry.id, comment.id);
                                            }}
                                            className="text-[11px] font-medium text-[var(--color-text-tertiary)] transition hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {deletingComment ? "Deleting..." : "Delete"}
                                          </button>
                                        ) : null}
                                        {!isCommentDeleted &&
                                        viewerUserId &&
                                        viewerUserId !== comment.user_id ? (
                                          <div className="relative">
                                            <button
                                              type="button"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setCommentMenuKey((current) =>
                                                  current === topCommentMenuKey
                                                    ? null
                                                    : topCommentMenuKey
                                                );
                                              }}
                                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                                              aria-label="Comment actions"
                                            >
                                              <span className="inline-flex items-center gap-0.5" aria-hidden>
                                                <span className="h-1 w-1 rounded-full bg-current" />
                                                <span className="h-1 w-1 rounded-full bg-current" />
                                                <span className="h-1 w-1 rounded-full bg-current" />
                                              </span>
                                            </button>
                                            {commentMenuKey === topCommentMenuKey ? (
                                              <div
                                                className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[var(--color-border-strong)] bg-surface-raised py-1 text-left shadow-lg"
                                                onClick={(event) => event.stopPropagation()}
                                              >
                                                <div className="px-3 pb-1">
                                                  <label
                                                    htmlFor={`comment-report-reason-${comment.id}`}
                                                    className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]"
                                                  >
                                                    Reason
                                                  </label>
                                                  <select
                                                    id={`comment-report-reason-${comment.id}`}
                                                    value={
                                                      commentReportReasonByCommentId[comment.id] ??
                                                      DEFAULT_REPORT_REASON
                                                    }
                                                    onChange={(event) =>
                                                      setCommentReportReasonByCommentId(
                                                        (current) => ({
                                                          ...current,
                                                          [comment.id]: event.target
                                                            .value as ReportReason,
                                                        })
                                                      )
                                                    }
                                                    className="w-full rounded border border-[var(--color-border-strong)] bg-surface-muted px-1.5 py-1 text-[11px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)]/60 focus:outline-none"
                                                  >
                                                    {REPORT_REASON_OPTIONS.map((option) => (
                                                      <option key={option.value} value={option.value}>
                                                        {option.label}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </div>
                                                <button
                                                  type="button"
                                                  disabled={reportingCommentId === comment.id}
                                                  onClick={() =>
                                                    void reportContent({
                                                      targetType: "comment",
                                                      entryId: entry.id,
                                                      commentId: comment.id,
                                                      targetUserId: comment.user_id,
                                                      reason:
                                                        commentReportReasonByCommentId[
                                                          comment.id
                                                        ] ?? DEFAULT_REPORT_REASON,
                                                    })
                                                  }
                                                  className="block w-full px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-primary)] transition hover:bg-surface-hover disabled:opacity-50"
                                                >
                                                  {reportingCommentId === comment.id
                                                    ? "Reporting..."
                                                    : "Report comment"}
                                                </button>
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                                      {!isCommentDeleted ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setReplyTargetByEntryId((current) => ({
                                              ...current,
                                              [entry.id]: comment.id,
                                            }))
                                          }
                                          className="font-medium text-[var(--color-text-secondary)] transition hover:text-[var(--color-accent-secondary)]"
                                        >
                                          Reply
                                        </button>
                                      ) : null}
                                      {comment.replies.length > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedRepliesByCommentId((current) => ({
                                              ...current,
                                              [comment.id]: !current[comment.id],
                                            }))
                                          }
                                          className="text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-primary)]"
                                        >
                                          {repliesExpanded
                                            ? "Hide replies"
                                            : `View ${comment.replies.length} ${
                                                comment.replies.length === 1
                                                  ? "reply"
                                                  : "replies"
                                              }`}
                                        </button>
                                      ) : null}
                                    </div>
                                    {repliesExpanded && comment.replies.length > 0 ? (
                                      <div className="mt-2 space-y-2 border-l border-[var(--color-border)] pl-3">
                                        {comment.replies.map((reply) => {
                                          const isReplyDeleted = Boolean(reply.is_deleted);
                                          const deletingReply = Boolean(
                                            deletingCommentById[reply.id]
                                          );
                                          const replyMenuKey = `${entry.id}:${reply.id}`;
                                          return (
                                            <div
                                              key={reply.id}
                                              className="rounded-lg border border-[var(--color-border)] bg-surface-muted px-3 py-2"
                                            >
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                  {!isReplyDeleted && reply.author_name ? (
                                                    <div className="flex items-center gap-2">
                                                      <CommentAuthorAvatar
                                                        authorName={reply.author_name}
                                                        authorAvatarUrl={reply.author_avatar_url}
                                                      />
                                                      <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                                                        {reply.author_name}
                                                      </p>
                                                    </div>
                                                  ) : null}
                                                  <p
                                                    className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
                                                      isReplyDeleted
                                                        ? "italic text-[var(--color-text-tertiary)]"
                                                        : "text-[var(--color-text-primary)]"
                                                    }`}
                                                  >
                                                    {isReplyDeleted ? "[deleted]" : reply.body}
                                                  </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                                                    {formatCommentDate(reply.created_at)}
                                                  </span>
                                                  {!isReplyDeleted &&
                                                  viewerUserId === reply.user_id ? (
                                                    <button
                                                      type="button"
                                                      disabled={deletingReply}
                                                      onClick={() => {
                                                        void deleteCommentForEntry(
                                                          entry.id,
                                                          reply.id
                                                        );
                                                      }}
                                                      className="text-[11px] font-medium text-[var(--color-text-tertiary)] transition hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                      {deletingReply ? "Deleting..." : "Delete"}
                                                    </button>
                                                  ) : null}
                                                  {!isReplyDeleted &&
                                                  viewerUserId &&
                                                  viewerUserId !== reply.user_id ? (
                                                    <div className="relative">
                                                      <button
                                                        type="button"
                                                        onClick={(event) => {
                                                          event.stopPropagation();
                                                          setCommentMenuKey((current) =>
                                                            current === replyMenuKey
                                                              ? null
                                                              : replyMenuKey
                                                          );
                                                        }}
                                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                                                        aria-label="Reply actions"
                                                      >
                                                        <span className="inline-flex items-center gap-0.5" aria-hidden>
                                                          <span className="h-1 w-1 rounded-full bg-current" />
                                                          <span className="h-1 w-1 rounded-full bg-current" />
                                                          <span className="h-1 w-1 rounded-full bg-current" />
                                                        </span>
                                                      </button>
                                                      {commentMenuKey === replyMenuKey ? (
                                                        <div
                                                          className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[var(--color-border-strong)] bg-surface-raised py-1 text-left shadow-lg"
                                                          onClick={(event) => event.stopPropagation()}
                                                        >
                                                          <div className="px-3 pb-1">
                                                            <label
                                                              htmlFor={`comment-report-reason-${reply.id}`}
                                                              className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]"
                                                            >
                                                              Reason
                                                            </label>
                                                            <select
                                                              id={`comment-report-reason-${reply.id}`}
                                                              value={
                                                                commentReportReasonByCommentId[
                                                                  reply.id
                                                                ] ?? DEFAULT_REPORT_REASON
                                                              }
                                                              onChange={(event) =>
                                                                setCommentReportReasonByCommentId(
                                                                  (current) => ({
                                                                    ...current,
                                                                    [reply.id]: event.target
                                                                      .value as ReportReason,
                                                                  })
                                                                )
                                                              }
                                                              className="w-full rounded border border-[var(--color-border-strong)] bg-surface-muted px-1.5 py-1 text-[11px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)]/60 focus:outline-none"
                                                            >
                                                              {REPORT_REASON_OPTIONS.map((option) => (
                                                                <option key={option.value} value={option.value}>
                                                                  {option.label}
                                                                </option>
                                                              ))}
                                                            </select>
                                                          </div>
                                                          <button
                                                            type="button"
                                                            disabled={reportingCommentId === reply.id}
                                                            onClick={() =>
                                                              void reportContent({
                                                                targetType: "comment",
                                                                entryId: entry.id,
                                                                commentId: reply.id,
                                                                targetUserId: reply.user_id,
                                                                reason:
                                                                  commentReportReasonByCommentId[
                                                                    reply.id
                                                                  ] ?? DEFAULT_REPORT_REASON,
                                                              })
                                                            }
                                                            className="block w-full px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-primary)] transition hover:bg-surface-hover disabled:opacity-50"
                                                          >
                                                            {reportingCommentId === reply.id
                                                              ? "Reporting..."
                                                              : "Report comment"}
                                                          </button>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {commentError ? (
                            <p className="mt-2 text-xs text-rose-300">{commentError}</p>
                          ) : null}
                          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                            {replyTarget ? (
                              <div className="mb-2 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-surface-muted px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]">
                                <span className="truncate">
                                  Replying to {replyTarget.author_name ?? "this thread"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyTargetByEntryId((current) => ({
                                      ...current,
                                      [entry.id]: null,
                                    }))
                                  }
                                  className="shrink-0 text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-primary)]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : null}
                            <textarea
                              value={commentDraft}
                              onChange={(event) =>
                                setCommentDraftByEntryId((current) => ({
                                  ...current,
                                  [entry.id]: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                  event.preventDefault();
                                  void submitCommentForEntry(entry.id);
                                }
                              }}
                              rows={2}
                              placeholder={
                                replyTarget ? "Write a reply..." : "Write a comment..."
                              }
                              className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-black/25 px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                              disabled={!canComment || postingComment}
                            />
                            <div className="mt-2 flex items-center justify-between">
                              <p className="text-[11px] text-[var(--color-text-tertiary)]">
                                {canComment
                                  ? "Comments + replies are now live."
                                  : "Comments are private for this post."}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  void submitCommentForEntry(entry.id);
                                }}
                                disabled={!commentDraft.trim() || !canComment || postingComment}
                                className="inline-flex rounded-full border border-[var(--color-accent-secondary)]/50 bg-accent-primary/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-secondary)] transition hover:bg-accent-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {postingComment
                                  ? "Posting..."
                                  : replyTarget
                                    ? "Post reply"
                                    : "Post comment"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
          {hasMore ? (
            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={loadMoreFeed} disabled={loadingMore}>
                {loadingMore ? "Loading..." : FEED_LOAD_MORE_LABEL}
              </Button>
            </div>
          ) : null}
          </>
        )}
      </div>
      </div>
    </AppShell>
  );
}
