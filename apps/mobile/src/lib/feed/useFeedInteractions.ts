import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  DEFAULT_FEED_REPORT_REASON,
  FEED_REPORT_REASON_OPTIONS,
  type FeedReportReason,
} from "@cellarsnap/shared";
import {
  countComments,
  fetchFeedComments,
  type FeedComment,
} from "@/src/lib/feed/comments";
import type { MobileFeedEntry } from "@/src/lib/feed/feedPage";
import { supabase } from "@/src/lib/supabase";

export const REPORT_REASON_OPTIONS = FEED_REPORT_REASON_OPTIONS;
export type ReportReason = FeedReportReason;
export const DEFAULT_REPORT_REASON: ReportReason = DEFAULT_FEED_REPORT_REASON;

function isDuplicateReportError(error: { code?: string | null; message?: string | null }) {
  return (
    error.code === "23505" ||
    (error.message ?? "").includes("content_reports_unique_active_")
  );
}

type PendingReport = {
  targetType: "entry" | "comment";
  entryId: string;
  commentId?: string;
  targetUserId: string;
  reason: ReportReason;
};

export type ModerationNotice = {
  kind: "success" | "error";
  message: string;
};

export type FeedEntryInteractionState = {
  reportMenuOpen: boolean;
  reportBusy: boolean;
  notesExpanded: boolean;
  commentsExpanded: boolean;
  replyTargetName: string | null;
  commentCount: number;
  comments: FeedComment[];
  commentsLoading: boolean;
  commentDraft: string;
  postingComment: boolean;
  commentError: string | null;
  commentMenuKey: string | null;
  reportingCommentId: string | null;
  reactionPickerOpen: boolean;
};

export function useFeedInteractions({
  userId,
  entries,
  setEntries,
  setErrorMessage,
}: {
  userId: string | null | undefined;
  entries: MobileFeedEntry[];
  setEntries: Dispatch<SetStateAction<MobileFeedEntry[]>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const [expandedNotesByEntryId, setExpandedNotesByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [reactionPopupEntryId, setReactionPopupEntryId] = useState<string | null>(
    null
  );
  const [expandedCommentsByEntryId, setExpandedCommentsByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [commentsByEntryId, setCommentsByEntryId] = useState<
    Record<string, FeedComment[]>
  >({});
  const [commentDraftByEntryId, setCommentDraftByEntryId] = useState<
    Record<string, string>
  >({});
  const [replyTargetByEntryId, setReplyTargetByEntryId] = useState<
    Record<string, string | null>
  >({});
  const [loadingCommentsByEntryId, setLoadingCommentsByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [postingCommentByEntryId, setPostingCommentByEntryId] = useState<
    Record<string, boolean>
  >({});
  const [commentErrorByEntryId, setCommentErrorByEntryId] = useState<
    Record<string, string | null>
  >({});
  const [reportMenuEntryId, setReportMenuEntryId] = useState<string | null>(null);
  const [reportingEntryId, setReportingEntryId] = useState<string | null>(null);
  const [commentMenuKey, setCommentMenuKey] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [pendingReport, setPendingReport] = useState<PendingReport | null>(null);
  const [moderationNotice, setModerationNotice] = useState<ModerationNotice | null>(
    null
  );

  const resetFeedTransientUiState = useCallback(() => {
    setReportMenuEntryId(null);
    setReportingEntryId(null);
    setCommentMenuKey(null);
    setReportingCommentId(null);
    setPendingReport(null);
    setExpandedNotesByEntryId({});
    setReactionPopupEntryId(null);
    setExpandedCommentsByEntryId({});
    setCommentsByEntryId({});
    setCommentDraftByEntryId({});
    setReplyTargetByEntryId({});
    setLoadingCommentsByEntryId({});
    setPostingCommentByEntryId({});
    setCommentErrorByEntryId({});
  }, []);

  useEffect(() => {
    if (!moderationNotice) {
      return;
    }
    const timer = setTimeout(() => {
      setModerationNotice(null);
    }, 3200);
    return () => clearTimeout(timer);
  }, [moderationNotice]);

  const loadCommentsForEntry = useCallback(
    async (entryId: string, options?: { force?: boolean }) => {
      if (!userId) {
        return;
      }
      if (loadingCommentsByEntryId[entryId]) {
        return;
      }
      if (!options?.force && commentsByEntryId[entryId]) {
        return;
      }

      setLoadingCommentsByEntryId((current) => ({
        ...current,
        [entryId]: true,
      }));
      setCommentErrorByEntryId((current) => ({
        ...current,
        [entryId]: null,
      }));

      try {
        const { comments, errorMessage: commentsError } = await fetchFeedComments({
          entryId,
          supabaseClient: supabase,
        });

        if (commentsError) {
          setCommentErrorByEntryId((current) => ({
            ...current,
            [entryId]: commentsError,
          }));
          return;
        }

        setCommentsByEntryId((current) => ({
          ...current,
          [entryId]: comments,
        }));
        setEntries((current) =>
          current.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  comment_count: countComments(comments, entry.comment_count),
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
    },
    [commentsByEntryId, loadingCommentsByEntryId, setEntries, userId]
  );

  const toggleNotes = useCallback((entryId: string) => {
    setExpandedNotesByEntryId((current) => ({
      ...current,
      [entryId]: !current[entryId],
    }));
  }, []);

  const toggleCommentsExpanded = useCallback(
    (entryId: string) => {
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
    },
    [loadCommentsForEntry]
  );

  const setReplyTarget = useCallback((entryId: string, commentId: string) => {
    setReplyTargetByEntryId((current) => ({
      ...current,
      [entryId]: current[entryId] === commentId ? null : commentId,
    }));
  }, []);

  const clearReplyTarget = useCallback((entryId: string) => {
    setReplyTargetByEntryId((current) => ({
      ...current,
      [entryId]: null,
    }));
  }, []);

  const setCommentDraft = useCallback((entryId: string, value: string) => {
    setCommentDraftByEntryId((current) => ({
      ...current,
      [entryId]: value,
    }));
  }, []);

  const submitCommentForEntry = useCallback(
    async (entryId: string) => {
      if (!userId) {
        return;
      }
      const body = (commentDraftByEntryId[entryId] ?? "").trim();
      const replyTargetId = replyTargetByEntryId[entryId] ?? null;
      const canComment = entries.find((entry) => entry.id === entryId)?.can_comment ?? false;
      if (!body) {
        return;
      }
      if (!canComment) {
        setCommentErrorByEntryId((current) => ({
          ...current,
          [entryId]: null,
        }));
        return;
      }
      if (postingCommentByEntryId[entryId]) {
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

      const { error } = await supabase.from("entry_comments").insert({
        entry_id: entryId,
        user_id: userId,
        body,
        parent_comment_id: replyTargetId,
      });

      if (error) {
        setCommentErrorByEntryId((current) => ({
          ...current,
          [entryId]: error.message,
        }));
        setPostingCommentByEntryId((current) => ({
          ...current,
          [entryId]: false,
        }));
        return;
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

      setPostingCommentByEntryId((current) => ({
        ...current,
        [entryId]: false,
      }));
    },
    [
      commentDraftByEntryId,
      entries,
      loadCommentsForEntry,
      postingCommentByEntryId,
      replyTargetByEntryId,
      userId,
    ]
  );

  const toggleReactionPicker = useCallback((entryId: string) => {
    setReactionPopupEntryId((current) => (current === entryId ? null : entryId));
  }, []);

  const toggleReaction = useCallback(
    async (entryId: string, emoji: string) => {
      if (!userId) {
        return;
      }
      const target = entries.find((entry) => entry.id === entryId);
      if (!target) {
        return;
      }

      const hasMine = target.my_reactions.includes(emoji);
      if (hasMine) {
        const { error } = await supabase
          .from("entry_reactions")
          .delete()
          .eq("entry_id", entryId)
          .eq("user_id", userId)
          .eq("emoji", emoji);
        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setEntries((current) =>
          current.map((entry) => {
            if (entry.id !== entryId) {
              return entry;
            }
            const nextCounts = { ...entry.reaction_counts };
            const nextValue = Math.max(0, (nextCounts[emoji] ?? 1) - 1);
            if (nextValue === 0) {
              delete nextCounts[emoji];
            } else {
              nextCounts[emoji] = nextValue;
            }
            return {
              ...entry,
              reaction_counts: nextCounts,
              my_reactions: entry.my_reactions.filter((value) => value !== emoji),
            };
          })
        );
      } else {
        const { error } = await supabase.from("entry_reactions").insert({
          entry_id: entryId,
          user_id: userId,
          emoji,
        });
        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setEntries((current) =>
          current.map((entry) => {
            if (entry.id !== entryId) {
              return entry;
            }
            return {
              ...entry,
              reaction_counts: {
                ...entry.reaction_counts,
                [emoji]: (entry.reaction_counts[emoji] ?? 0) + 1,
              },
              my_reactions: [...entry.my_reactions, emoji],
            };
          })
        );
      }
    },
    [entries, setEntries, setErrorMessage, userId]
  );

  const toggleReportMenu = useCallback((entryId: string) => {
    setReportMenuEntryId((current) => (current === entryId ? null : entryId));
  }, []);

  const toggleCommentMenu = useCallback((entryId: string, commentId: string) => {
    setCommentMenuKey((current) =>
      current === `${entryId}:${commentId}` ? null : `${entryId}:${commentId}`
    );
  }, []);

  const reportContent = useCallback(
    async ({
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
      if (!userId || userId === targetUserId) {
        return;
      }

      if (targetType === "entry") {
        setReportingEntryId(entryId);
        setReportMenuEntryId(null);
      } else if (commentId) {
        setReportingCommentId(commentId);
        setCommentMenuKey(null);
      }
      setModerationNotice(null);

      const { error } = await supabase.from("content_reports").insert({
        reporter_id: userId,
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
    },
    [userId]
  );

  const openReportReasonSheet = useCallback(
    ({
      targetType,
      entryId,
      targetUserId,
      commentId,
    }: {
      targetType: "entry" | "comment";
      entryId: string;
      targetUserId: string;
      commentId?: string;
    }) => {
      if (!userId || userId === targetUserId) {
        return;
      }
      setReportMenuEntryId(null);
      setCommentMenuKey(null);
      setPendingReport({
        targetType,
        entryId,
        commentId,
        targetUserId,
        reason: DEFAULT_REPORT_REASON,
      });
    },
    [userId]
  );

  const closePendingReport = useCallback(() => {
    setPendingReport(null);
  }, []);

  const setPendingReportReason = useCallback((reason: ReportReason) => {
    setPendingReport((current) => (current ? { ...current, reason } : current));
  }, []);

  const submitPendingReport = useCallback(async () => {
    if (!pendingReport) {
      return;
    }
    const nextReport = pendingReport;
    setPendingReport(null);
    await reportContent(nextReport);
  }, [pendingReport, reportContent]);

  const getEntryInteractionState = useCallback(
    (entry: MobileFeedEntry): FeedEntryInteractionState => {
      const comments = commentsByEntryId[entry.id] ?? [];
      const replyTargetId = replyTargetByEntryId[entry.id] ?? null;
      const replyTarget =
        replyTargetId && comments.length > 0
          ? comments.find((comment) => comment.id === replyTargetId) ?? null
          : null;

      return {
        reportMenuOpen: reportMenuEntryId === entry.id,
        reportBusy: reportingEntryId === entry.id,
        notesExpanded: Boolean(expandedNotesByEntryId[entry.id]),
        commentsExpanded: Boolean(expandedCommentsByEntryId[entry.id]),
        replyTargetName: replyTarget?.author_name ?? null,
        commentCount: countComments(commentsByEntryId[entry.id], entry.comment_count),
        comments,
        commentsLoading: Boolean(loadingCommentsByEntryId[entry.id]),
        commentDraft: commentDraftByEntryId[entry.id] ?? "",
        postingComment: Boolean(postingCommentByEntryId[entry.id]),
        commentError: commentErrorByEntryId[entry.id] ?? null,
        commentMenuKey,
        reportingCommentId,
        reactionPickerOpen: reactionPopupEntryId === entry.id,
      };
    },
    [
      commentDraftByEntryId,
      commentErrorByEntryId,
      commentMenuKey,
      commentsByEntryId,
      expandedCommentsByEntryId,
      expandedNotesByEntryId,
      loadingCommentsByEntryId,
      postingCommentByEntryId,
      reactionPopupEntryId,
      replyTargetByEntryId,
      reportMenuEntryId,
      reportingCommentId,
      reportingEntryId,
    ]
  );

  return {
    moderationNotice,
    pendingReport,
    resetFeedTransientUiState,
    getEntryInteractionState,
    toggleNotes,
    toggleCommentsExpanded,
    setReplyTarget,
    clearReplyTarget,
    setCommentDraft,
    submitCommentForEntry,
    toggleReactionPicker,
    toggleReaction,
    toggleReportMenu,
    toggleCommentMenu,
    openReportReasonSheet,
    closePendingReport,
    setPendingReportReason,
    submitPendingReport,
  };
}
