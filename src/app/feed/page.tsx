"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { shouldHideProducerInEntryTile } from "@/lib/entryDisplay";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";
import QprBadge from "@/components/QprBadge";
import RatingBadge from "@/components/RatingBadge";
import type { PrivacyLevel, WineEntryWithUrls } from "@/types/wine";

const REACTION_EMOJIS = ["🍷", "🔥", "❤️", "👀", "🤝"] as const;
const PHOTO_TYPE_LABELS = {
  label: "Label",
  place: "Place",
  pairing: "Pairing",
} as const;
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
  can_react?: boolean;
  can_comment?: boolean;
  comments_privacy?: PrivacyLevel;
  comment_count?: number;
  reaction_counts?: Record<string, number>;
  my_reactions?: string[];
  photo_gallery?: FeedPhoto[];
};

type FeedReply = {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
};

type FeedComment = {
  id: string;
  entry_id: string;
  user_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  is_deleted?: boolean;
  replies: FeedReply[];
};

type UserOption = {
  id: string;
  display_name: string | null;
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

  if (photos.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-sm text-zinc-400 md:h-64">
        No photo
      </div>
    );
  }

  const total = photos.length;
  const activeIndex = Math.min(index, total - 1);
  const goPrev = () => setIndex((current) => (current - 1 + total) % total);
  const goNext = () => setIndex((current) => (current + 1) % total);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
      <div
        className="flex h-56 transition-transform duration-300 md:h-64"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (photos.length <= 1 || touchStartXRef.current === null) {
            touchStartXRef.current = null;
            return;
          }
          const endX = event.changedTouches[0]?.clientX ?? touchStartXRef.current;
          const delta = touchStartXRef.current - endX;
          touchStartXRef.current = null;
          if (Math.abs(delta) < 40) return;
          if (delta > 0) goNext();
          else goPrev();
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
            <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-200">
              {PHOTO_TYPE_LABELS[photo.type]}
            </span>
          </div>
        ))}
      </div>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 md:inline-flex"
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
            className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 md:inline-flex"
            aria-label="Next photo"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
          >
            {">"}
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-1">
            {photos.map((_, dotIndex) => (
              <button
                key={dotIndex}
                type="button"
                aria-label={`Go to photo ${dotIndex + 1}`}
                className={`h-1.5 w-1.5 rounded-full transition ${
                  dotIndex === activeIndex ? "bg-amber-300" : "bg-zinc-400/70"
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
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedScope, setFeedScope] = useState<"public" | "friends">("public");
  const [reactionPopupEntryId, setReactionPopupEntryId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
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

  const toggleNotesExpanded = (entryId: string) => {
    setExpandedNotesByEntryId((current) => ({
      ...current,
      [entryId]: !current[entryId],
    }));
  };

  const getCommentCount = (entry: FeedEntry) => {
    const entryComments = commentsByEntryId[entry.id];
    if (entryComments) {
      return entryComments.reduce((total, comment) => total + 1 + comment.replies.length, 0);
    }
    return commentCountByEntryId[entry.id] ?? entry.comment_count ?? 0;
  };

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      const response = await fetch(
        `/api/users?search=${encodeURIComponent(trimmedQuery)}`,
        { cache: "no-store" }
      );
      setSearching(false);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users ?? []);
      } else {
        setSearchResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  useEffect(() => {
    let isMounted = true;

    const loadFeed = async () => {
      if (isMounted) {
        setLoading(true);
        setErrorMessage(null);
        setNextCursor(null);
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
          setNextCursor(feedData.next_cursor ?? null);
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
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/feed?scope=${feedScope}&limit=30&cursor=${encodeURIComponent(nextCursor)}`,
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
      setHasMore(Boolean(data.has_more));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-8">
        <NavBar />
        <header className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Social feed
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            What the cellar is sipping.
          </h1>
          <p className="text-sm text-zinc-300">
            Discover what others are enjoying across the app.
          </p>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Find a friend
          </label>
          <input
            type="search"
            placeholder="Search by username..."
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              if (!value.trim()) {
                setSearchResults([]);
              }
            }}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
            aria-describedby="search-results-desc"
          />
          <p id="search-results-desc" className="sr-only">
            Search results appear below; click to open their profile.
          </p>
          {searchQuery.trim() && (
            <div className="mt-3 space-y-1">
              {searching ? (
                <p className="text-sm text-zinc-400">Searching...</p>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-zinc-400">No friends match your search.</p>
              ) : (
                <ul className="space-y-1">
                  {searchResults.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={`/profile/${u.id}`}
                        className="block rounded-lg px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/10"
                      >
                        {u.display_name ?? "Unknown"}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFeedScope("public")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              feedScope === "public"
                ? "border border-amber-300/60 bg-amber-400/10 text-amber-200"
                : "border border-white/10 text-zinc-200 hover:border-white/30"
            }`}
          >
            Public feed
          </button>
          <button
            type="button"
            onClick={() => setFeedScope("friends")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              feedScope === "friends"
                ? "border border-amber-300/60 bg-amber-400/10 text-amber-200"
                : "border border-white/10 text-zinc-200 hover:border-white/30"
            }`}
          >
            Friends only
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading feed...
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            No entries yet.
          </div>
        ) : (
          <>
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/entries/${entry.id}?from=feed`)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/entries/${entry.id}?from=feed`);
                  }
                }}
              >
                <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-zinc-400">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/profile/${entry.user_id}`);
                      }}
                      className="flex min-w-0 max-w-full items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40 ring-1 ring-white/5">
                        {entry.author_avatar_url ? (
                          <img
                            src={entry.author_avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] font-medium text-zinc-500">
                            {(entry.author_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="block min-w-0 whitespace-normal break-words font-medium text-zinc-200 hover:text-amber-200">
                        {entry.author_name}
                      </span>
                    </button>
                  </div>
                  <span className="shrink-0">{formatConsumedDate(entry.consumed_at)}</span>
                </div>
                <div className="mt-4">
                  <EntryPhotoGallery entry={entry} />
                </div>
                <div className="mt-4">
                  <div className="min-w-0">
                    {entry.wine_name ? (
                      <h2 className="text-base font-semibold leading-snug text-zinc-50 break-words">
                        {entry.wine_name}
                      </h2>
                    ) : null}
                    {(() => {
                      const wineName = entry.wine_name?.trim() ?? "";
                      const producer = entry.producer?.trim() ?? "";
                      const vintage = entry.vintage?.trim() ?? "";
                      const hideProducer = shouldHideProducerInEntryTile(
                        wineName,
                        producer
                      );
                      const meta = [hideProducer ? null : producer || null, vintage || null]
                        .filter(Boolean)
                        .join(" · ");

                      return meta ? (
                        <p className="text-sm text-zinc-400 break-words">{meta}</p>
                      ) : null;
                    })()}
                  </div>
                </div>
                {entry.tasted_with_users && entry.tasted_with_users.length > 0 ? (
                  <div className="mt-3 break-words text-xs text-zinc-400">
                    Tasted with:{" "}
                    {entry.tasted_with_users
                      .map((user) => user.display_name ?? user.email ?? "Unknown")
                      .join(", ")}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {typeof entry.rating === "number" &&
                  !Number.isNaN(entry.rating) ? (
                    <RatingBadge rating={entry.rating} variant="text" />
                  ) : null}
                  {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
                </div>
                {(() => {
                  const notes = (entry.notes ?? "").trim();
                  if (!notes) {
                    return null;
                  }

                  const expanded = Boolean(expandedNotesByEntryId[entry.id]);
                  return (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleNotesExpanded(entry.id);
                      }}
                      className="mt-3 block w-full text-left text-xs leading-relaxed text-zinc-300"
                      title={expanded ? "Collapse notes" : "Expand notes"}
                    >
                      <span
                        className="block break-words"
                        style={expanded ? undefined : COLLAPSED_NOTES_STYLE}
                      >
                        {notes}
                      </span>
                    </button>
                  );
                })()}
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
                        className="mt-auto pt-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="border-t border-white/10 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReactionPopupEntryId((id) =>
                                    id === entry.id ? null : entry.id
                                  );
                                }}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-black/20 text-lg font-semibold leading-none transition ${
                                  canReact
                                    ? "border-white/20 text-zinc-100 hover:border-amber-300/60 hover:text-amber-200"
                                    : "border-white/15 text-zinc-300 hover:border-white/40 hover:text-zinc-100"
                                }`}
                                aria-label={canReact ? "Add reaction" : "View reaction options"}
                              >
                                +
                              </button>
                              {canComment ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleCommentsExpanded(entry.id);
                                  }}
                                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
                                    commentsExpanded
                                      ? "border-amber-300/50 bg-amber-400/10 text-amber-200"
                                      : "border-white/10 bg-black/20 text-zinc-300 hover:border-amber-300/50 hover:text-amber-200"
                                  }`}
                                  aria-label={`Toggle comments (${getCommentCount(entry)})`}
                                >
                                  <CommentBubbleIcon className="h-4 w-4 shrink-0" />
                                  <span>Comments</span>
                                  <span className="rounded-full border border-white/15 bg-black/30 px-1.5 py-0.5 tabular-nums">
                                    {getCommentCount(entry)}
                                  </span>
                                </button>
                              ) : null}
                            </div>
                            {hasReactionCounts ? (
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {reactionSummary.map(({ emoji, count }) => (
                                  <span
                                    key={`${entry.id}-reaction-summary-${emoji}`}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-1.5 py-0.5 text-[11px] text-zinc-200"
                                  >
                                    <span>{emoji}</span>
                                    <span className="tabular-nums text-zinc-400">{count}</span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {reactionPopupEntryId === entry.id ? (
                            <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-1.5">
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
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-white/10 ${
                                          (entry.my_reactions ?? []).includes(emoji)
                                            ? "bg-amber-400/20"
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
                                      className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 px-1 text-lg text-zinc-400"
                                    >
                                      {emoji}
                                      {count > 0 ? (
                                        <span className="ml-0.5 text-[10px] font-medium text-zinc-500">
                                          {count}
                                        </span>
                                      ) : null}
                                    </span>
                                  );
                                })}
                              </div>
                              {!canReact ? (
                                <p className="mt-1 text-[11px] text-zinc-500">
                                  Reactions are not available for this post.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {commentsExpanded ? (
                        <div
                          className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 md:mt-3"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/70">
                              Comments
                            </p>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleCommentsExpanded(entry.id);
                              }}
                              className="text-[11px] text-zinc-400 transition hover:text-zinc-200"
                            >
                              Collapse
                            </button>
                          </div>
                          {commentsLoading ? (
                            <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-3 text-sm text-zinc-400">
                              Loading comments...
                            </div>
                          ) : !canComment ? (
                            <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-3 text-sm text-zinc-400">
                              Comments are private for this post.
                            </div>
                          ) : entryComments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-3 text-sm text-zinc-400">
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
                                return (
                                  <li
                                    key={comment.id}
                                    className="rounded-xl border border-white/10 bg-black/25 p-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        {!isCommentDeleted && comment.author_name ? (
                                          <p className="text-xs font-semibold text-zinc-200">
                                            {comment.author_name}
                                          </p>
                                        ) : null}
                                        <p
                                          className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed ${
                                            isCommentDeleted
                                              ? "italic text-zinc-500"
                                              : "text-zinc-100"
                                          }`}
                                        >
                                          {isCommentDeleted ? "[deleted]" : comment.body}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-[11px] text-zinc-500">
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
                                            className="text-[11px] font-medium text-zinc-400 transition hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {deletingComment ? "Deleting..." : "Delete"}
                                          </button>
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
                                          className="font-medium text-zinc-300 transition hover:text-amber-200"
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
                                          className="text-zinc-400 transition hover:text-zinc-200"
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
                                      <div className="mt-2 space-y-2 border-l border-white/10 pl-3">
                                        {comment.replies.map((reply) => {
                                          const isReplyDeleted = Boolean(reply.is_deleted);
                                          const deletingReply = Boolean(
                                            deletingCommentById[reply.id]
                                          );
                                          return (
                                            <div
                                              key={reply.id}
                                              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                                            >
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                  {!isReplyDeleted && reply.author_name ? (
                                                    <p className="text-xs font-semibold text-zinc-200">
                                                      {reply.author_name}
                                                    </p>
                                                  ) : null}
                                                  <p
                                                    className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
                                                      isReplyDeleted
                                                        ? "italic text-zinc-500"
                                                        : "text-zinc-100"
                                                    }`}
                                                  >
                                                    {isReplyDeleted ? "[deleted]" : reply.body}
                                                  </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                  <span className="text-[11px] text-zinc-500">
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
                                                      className="text-[11px] font-medium text-zinc-400 transition hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                      {deletingReply ? "Deleting..." : "Delete"}
                                                    </button>
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
                          <div className="mt-3 border-t border-white/10 pt-3">
                            {replyTarget ? (
                              <div className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-zinc-300">
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
                                  className="shrink-0 text-zinc-400 transition hover:text-zinc-100"
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
                              className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                              disabled={!canComment || postingComment}
                            />
                            <div className="mt-2 flex items-center justify-between">
                              <p className="text-[11px] text-zinc-500">
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
                                className="inline-flex rounded-full border border-amber-300/50 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
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
              <button
                type="button"
                onClick={loadMoreFeed}
                disabled={loadingMore}
                className="inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
          </>
        )}
      </div>
    </div>
  );
}
