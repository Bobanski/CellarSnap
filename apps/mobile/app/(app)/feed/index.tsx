import {
  buildFeedEntryMetaFields as buildEntryMetaFields,
  FEED_EYEBROW,
  FEED_LOAD_MORE_LABEL,
  FEED_PHOTO_TYPE_LABELS as PHOTO_TYPE_LABELS,
  FEED_REACTION_EMOJIS as REACTION_EMOJIS,
  FEED_SCOPE_LABELS,
  FEED_SUBTITLE,
  FEED_TITLE,
  getFeedDisplayRatingLabel as getDisplayRating,
  getFeedEmptyStateMessage,
} from "@cellarsnap/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  PixelRatio,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { router } from "expo-router";
import { AppTopBar } from "@/src/components/AppTopBar";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { ReactionSummaryPills } from "@/src/components/ReactionSummaryPills";
import {
  DRINKING_NOW_REFRESH_INTERVAL_MS,
  isDrinkingNowActive,
} from "@/src/lib/drinkingNow";
import type { FeedComment } from "@/src/lib/feed/comments";
import {
  fetchFeedPage,
  type FeedScope,
  type MobileFeedEntry,
  type QprLevel,
} from "@/src/lib/feed/feedPage";
import {
  REPORT_REASON_OPTIONS,
  useFeedInteractions,
} from "@/src/lib/feed/useFeedInteractions";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

const PAGE_SIZE = 24;

const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Spot on",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
};

function formatConsumedDate(raw: string) {
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCommentDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function buildAuthorWithCompanionsLabel(item: MobileFeedEntry) {
  const companionNames = item.tasted_with_users
    .map((user) => user.display_name ?? "Unknown")
    .filter((name) => name.trim().length > 0);
  return companionNames.length > 0
    ? `${item.author_name} + ${companionNames.join(", ")}`
    : item.author_name;
}

function FeedCard({
  item,
  viewerUserId,
  reportMenuOpen,
  reportBusy,
  notesExpanded,
  onToggleNotes,
  commentsExpanded,
  onToggleComments,
  onGallerySwipeStart,
  onGallerySwipeEnd,
  replyTargetName,
  onSetReplyTarget,
  onClearReplyTarget,
  commentCount,
  comments,
  commentsLoading,
  commentDraft,
  onChangeCommentDraft,
  onSubmitComment,
  postingComment,
  commentError,
  commentMenuKey,
  reportingCommentId,
  reactionPickerOpen,
  onToggleReactionPicker,
  onToggleReaction,
  onToggleReportMenu,
  onReportPost,
  onToggleCommentMenu,
  onReportComment,
  onOpenAuthorProfile,
  canOpenEntry,
  onOpenEntry,
  showDrinkingNowGlow,
}: {
  item: MobileFeedEntry;
  viewerUserId: string | null;
  reportMenuOpen: boolean;
  reportBusy: boolean;
  notesExpanded: boolean;
  onToggleNotes: () => void;
  commentsExpanded: boolean;
  onToggleComments: () => void;
  onGallerySwipeStart: () => void;
  onGallerySwipeEnd: () => void;
  replyTargetName: string | null;
  onSetReplyTarget: (commentId: string) => void;
  onClearReplyTarget: () => void;
  commentCount: number;
  comments: FeedComment[];
  commentsLoading: boolean;
  commentDraft: string;
  onChangeCommentDraft: (value: string) => void;
  onSubmitComment: () => void;
  postingComment: boolean;
  commentError: string | null;
  commentMenuKey: string | null;
  reportingCommentId: string | null;
  reactionPickerOpen: boolean;
  onToggleReactionPicker: () => void;
  onToggleReaction: (emoji: string) => void;
  onToggleReportMenu: () => void;
  onReportPost: () => void;
  onToggleCommentMenu: (commentId: string) => void;
  onReportComment: (commentId: string, targetUserId: string) => void;
  onOpenAuthorProfile: () => void;
  canOpenEntry: () => boolean;
  onOpenEntry: () => void;
  showDrinkingNowGlow: boolean;
}) {
  const metaFields = useMemo(() => buildEntryMetaFields(item), [item]);
  const displayRating = getDisplayRating(item.rating);
  const galleryPhotos = useMemo(() => item.photo_gallery ?? [], [item.photo_gallery]);
  const notes = (item.notes ?? "").trim();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoFrameWidth, setPhotoFrameWidth] = useState(0);
  const [isNotesTruncated, setIsNotesTruncated] = useState(false);
  const galleryScrollRef = useRef<ScrollView | null>(null);
  const swipeActiveRef = useRef(false);
  const pendingSwipeEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockCardOpenUntilRef = useRef(0);
  const photoTapStartRef = useRef<{
    x: number;
    y: number;
    timestamp: number;
    moved: boolean;
  } | null>(null);
  const hasMultiplePhotos = galleryPhotos.length > 1;
  const showCommentsControl = item.can_comment;
  const clampedActivePhotoIndex = Math.max(
    0,
    Math.min(galleryPhotos.length - 1, activePhotoIndex)
  );
  const activePhoto =
    galleryPhotos[clampedActivePhotoIndex] ?? null;
  const canToggleNotes = notesExpanded || isNotesTruncated;
  const authorWithCompanionsLabel = useMemo(() => buildAuthorWithCompanionsLabel(item), [item]);

  const beginGallerySwipe = useCallback(() => {
    if (swipeActiveRef.current) {
      return;
    }
    swipeActiveRef.current = true;
    blockCardOpenUntilRef.current = Date.now() + 450;
    onGallerySwipeStart();
  }, [onGallerySwipeStart]);

  const endGallerySwipe = useCallback(() => {
    if (!swipeActiveRef.current) {
      return;
    }
    swipeActiveRef.current = false;
    onGallerySwipeEnd();
  }, [onGallerySwipeEnd]);

  const clearPendingSwipeEnd = useCallback(() => {
    if (!pendingSwipeEndTimerRef.current) {
      return;
    }
    clearTimeout(pendingSwipeEndTimerRef.current);
    pendingSwipeEndTimerRef.current = null;
  }, []);

  const scheduleGallerySwipeEnd = useCallback(
    (delayMs = 90) => {
      clearPendingSwipeEnd();
      pendingSwipeEndTimerRef.current = setTimeout(() => {
        pendingSwipeEndTimerRef.current = null;
        endGallerySwipe();
      }, delayMs);
    },
    [clearPendingSwipeEnd, endGallerySwipe]
  );

  useEffect(
    () => () => {
      clearPendingSwipeEnd();
      endGallerySwipe();
    },
    [clearPendingSwipeEnd, endGallerySwipe]
  );

  useEffect(() => {
    if (galleryPhotos.length <= 1) {
      return;
    }
    galleryPhotos.forEach((photo) => {
      void Image.prefetch(photo.url);
    });
  }, [item.id, galleryPhotos]);

  const scrollToPhotoIndex = useCallback(
    (nextIndex: number, animated = true) => {
      const maxIndex = Math.max(0, galleryPhotos.length - 1);
      const clampedIndex = Math.max(0, Math.min(maxIndex, nextIndex));
      setActivePhotoIndex(clampedIndex);
      if (!galleryScrollRef.current || photoFrameWidth <= 0) {
        return;
      }
      galleryScrollRef.current.scrollTo({
        x: clampedIndex * photoFrameWidth,
        animated,
      });
    },
    [galleryPhotos.length, photoFrameWidth]
  );

  const goToPreviousPhoto = useCallback(() => {
    if (!hasMultiplePhotos) {
      return;
    }
    const maxIndex = Math.max(0, galleryPhotos.length - 1);
    const nextIndex =
      clampedActivePhotoIndex <= 0 ? maxIndex : clampedActivePhotoIndex - 1;
    scrollToPhotoIndex(nextIndex);
  }, [clampedActivePhotoIndex, galleryPhotos.length, hasMultiplePhotos, scrollToPhotoIndex]);

  const goToNextPhoto = useCallback(() => {
    if (!hasMultiplePhotos) {
      return;
    }
    const maxIndex = Math.max(0, galleryPhotos.length - 1);
    const nextIndex =
      clampedActivePhotoIndex >= maxIndex ? 0 : clampedActivePhotoIndex + 1;
    scrollToPhotoIndex(nextIndex);
  }, [clampedActivePhotoIndex, galleryPhotos.length, hasMultiplePhotos, scrollToPhotoIndex]);

  const handleCardPress = useCallback(() => {
    if (Date.now() < blockCardOpenUntilRef.current || !canOpenEntry()) {
      return;
    }
    blockCardOpenUntilRef.current = Date.now() + 320;
    onOpenEntry();
  }, [canOpenEntry, onOpenEntry]);

  return (
    <View style={[styles.feedCard, showDrinkingNowGlow ? styles.feedCardDrinkingNow : null]}>
      <View style={styles.feedAuthorRow}>
        <Pressable
          style={styles.feedAuthorStack}
          onPress={(event) => {
            event.stopPropagation();
            onOpenAuthorProfile();
          }}
        >
          <View style={styles.feedAvatar}>
            {item.author_avatar_url ? (
              <Image
                source={{ uri: item.author_avatar_url }}
                style={styles.feedAvatarImage}
                resizeMode="cover"
              />
            ) : (
              <AppText style={styles.feedAvatarFallback}>
                {(item.author_name || "?")[0]?.toUpperCase() ?? "?"}
              </AppText>
            )}
          </View>
          <AppText style={styles.feedAuthorName} numberOfLines={2}>
            {authorWithCompanionsLabel}
          </AppText>
        </Pressable>
        <View style={styles.feedAuthorRight}>
          <View style={styles.feedMetaRow}>
            <AppText style={styles.feedDate}>{formatConsumedDate(item.consumed_at)}</AppText>
            {viewerUserId && viewerUserId !== item.user_id ? (
              <View style={styles.feedMenuWrap}>
                <Pressable
                  style={styles.feedMenuButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    onToggleReportMenu();
                  }}
                >
                  <View style={styles.feedMenuDotsRow}>
                    <View style={styles.feedMenuDot} />
                    <View style={styles.feedMenuDot} />
                    <View style={styles.feedMenuDot} />
                  </View>
                </Pressable>
                {reportMenuOpen ? (
                  <View
                    style={styles.feedMenuPanel}
                    onStartShouldSetResponder={() => true}
                  >
                    <Pressable
                      disabled={reportBusy}
                      onPress={(event) => {
                        event.stopPropagation();
                        onReportPost();
                      }}
                    >
                      <AppText style={styles.feedMenuItemText}>
                        {reportBusy ? "Reporting..." : "Report post"}
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View
        style={styles.feedPhotoFrame}
        onLayout={(event) => {
          const nextWidth = PixelRatio.roundToNearestPixel(event.nativeEvent.layout.width);
          if (nextWidth > 0 && Math.abs(nextWidth - photoFrameWidth) > 0.5) {
            setPhotoFrameWidth(nextWidth);
            if (galleryScrollRef.current && hasMultiplePhotos) {
              galleryScrollRef.current.scrollTo({
                x: clampedActivePhotoIndex * nextWidth,
                animated: false,
              });
            }
          }
        }}
      >
        {activePhoto ? (
          <>
            {hasMultiplePhotos && photoFrameWidth > 0 ? (
              <ScrollView
                ref={(node) => {
                  galleryScrollRef.current = node;
                }}
                horizontal
                snapToInterval={photoFrameWidth}
                snapToAlignment="start"
                disableIntervalMomentum
                bounces={false}
                directionalLockEnabled
                nestedScrollEnabled
                overScrollMode="never"
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                scrollEventThrottle={16}
                contentContainerStyle={styles.feedPhotoTrack}
                onTouchStart={(event) => {
                  const touch = event.nativeEvent.touches[0];
                  if (!touch) {
                    photoTapStartRef.current = null;
                    return;
                  }
                  clearPendingSwipeEnd();
                  photoTapStartRef.current = {
                    x: touch.pageX,
                    y: touch.pageY,
                    timestamp: Date.now(),
                    moved: false,
                  };
                }}
                onTouchMove={(event) => {
                  const touch = event.nativeEvent.touches[0];
                  const start = photoTapStartRef.current;
                  if (!touch || !start) {
                    return;
                  }
                  const deltaX = Math.abs(touch.pageX - start.x);
                  const deltaY = Math.abs(touch.pageY - start.y);
                  if (deltaX > 10 && deltaX > deltaY + 2) {
                    beginGallerySwipe();
                  }
                  if (deltaX > 8 || deltaY > 8) {
                    photoTapStartRef.current = { ...start, moved: true };
                  }
                }}
                onTouchEnd={() => {
                  const start = photoTapStartRef.current;
                  photoTapStartRef.current = null;
                  if (!start || start.moved || swipeActiveRef.current) {
                    if (swipeActiveRef.current) {
                      scheduleGallerySwipeEnd(40);
                    }
                    return;
                  }
                  if (Date.now() - start.timestamp > 260) {
                    return;
                  }
                  handleCardPress();
                }}
                onTouchCancel={() => {
                  photoTapStartRef.current = null;
                  scheduleGallerySwipeEnd(0);
                }}
                onScrollBeginDrag={() => {
                  photoTapStartRef.current = null;
                  beginGallerySwipe();
                  clearPendingSwipeEnd();
                }}
                onScrollEndDrag={() => {
                  scheduleGallerySwipeEnd();
                }}
                onMomentumScrollBegin={clearPendingSwipeEnd}
                onMomentumScrollEnd={(event) => {
                  if (photoFrameWidth > 0) {
                    const offsetX = event.nativeEvent.contentOffset.x;
                    const rawIndex = Math.round(offsetX / photoFrameWidth);
                    const maxIndex = Math.max(0, galleryPhotos.length - 1);
                    const clampedIndex = Math.max(0, Math.min(maxIndex, rawIndex));
                    if (clampedIndex !== clampedActivePhotoIndex) {
                      setActivePhotoIndex(clampedIndex);
                    }
                  }
                  blockCardOpenUntilRef.current = Date.now() + 200;
                  endGallerySwipe();
                }}
              >
                {galleryPhotos.map((photo, photoIndex) => (
                  <Image
                    key={`${item.id}-${photo.type}-${photo.url}-${photoIndex}`}
                    source={{ uri: photo.url }}
                    style={[styles.feedPhotoTrackSlide, { width: photoFrameWidth }]}
                    resizeMode="cover"
                    fadeDuration={0}
                  />
                ))}
              </ScrollView>
            ) : (
              <Pressable onPress={handleCardPress}>
                <Image
                  source={{ uri: activePhoto.url }}
                  style={styles.feedPhotoStatic}
                  resizeMode="cover"
                  fadeDuration={0}
                />
              </Pressable>
            )}
            <View style={styles.photoTypeChip}>
              <AppText style={styles.photoTypeChipText}>
                {PHOTO_TYPE_LABELS[activePhoto.type]}
              </AppText>
            </View>
            {hasMultiplePhotos ? (
              <View style={styles.photoDotRow}>
                {galleryPhotos.map((_, dotIndex) => (
                  <Pressable
                    key={`${item.id}-dot-${dotIndex}`}
                    onPress={(event) => {
                      event.stopPropagation();
                      scrollToPhotoIndex(dotIndex);
                    }}
                    hitSlop={6}
                    style={[
                      styles.photoDot,
                      dotIndex === clampedActivePhotoIndex
                        ? styles.photoDotActive
                        : null,
                    ]}
                  />
                ))}
              </View>
            ) : null}
            {hasMultiplePhotos ? (
              <>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    goToPreviousPhoto();
                  }}
                  hitSlop={8}
                  style={[styles.photoNavButton, styles.photoNavButtonLeft]}
                  accessibilityRole="button"
                  accessibilityLabel="Previous photo"
                >
                  <AppText style={styles.photoNavButtonText}>{"<"}</AppText>
                </Pressable>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    goToNextPhoto();
                  }}
                  hitSlop={8}
                  style={[styles.photoNavButton, styles.photoNavButtonRight]}
                  accessibilityRole="button"
                  accessibilityLabel="Next photo"
                >
                  <AppText style={styles.photoNavButtonText}>{">"}</AppText>
                </Pressable>
              </>
            ) : null}
          </>
        ) : (
          <Pressable style={styles.feedPhotoFallback} onPress={handleCardPress}>
            <AppText style={styles.feedPhotoFallbackText}>No photo</AppText>
          </Pressable>
        )}
      </View>

      <Pressable style={styles.feedTextStack} onPress={handleCardPress}>
        {item.wine_name ? <AppText style={styles.feedWineName}>{item.wine_name}</AppText> : null}
        {metaFields.length > 0 ? (
          <AppText style={styles.feedMetaText}>{metaFields.join(" · ")}</AppText>
        ) : null}
      </Pressable>

      {notes ? (
        <Pressable
          style={styles.notesWrap}
          onPress={(event) => {
            event.stopPropagation();
            if (canToggleNotes) {
              onToggleNotes();
              return;
            }
            handleCardPress();
          }}
        >
          <AppText
            style={styles.notesText}
            numberOfLines={notesExpanded ? undefined : 2}
            onTextLayout={(event) => {
              if (notesExpanded) {
                return;
              }
              const nextTruncated = event.nativeEvent.lines.length > 2;
              if (nextTruncated !== isNotesTruncated) {
                setIsNotesTruncated(nextTruncated);
              }
            }}
          >
            {notes}
          </AppText>
          {canToggleNotes ? (
            <AppText style={styles.notesToggleText}>
              {notesExpanded ? "Show less" : "Read more"}
            </AppText>
          ) : null}
        </Pressable>
      ) : null}

      <Pressable style={styles.feedValueRow} onPress={handleCardPress}>
        {displayRating ? <AppText style={styles.feedRating}>{displayRating}</AppText> : null}
        {item.qpr_level ? (
          <AppText style={[styles.feedQprTag, styles[`qpr_${item.qpr_level}` as keyof typeof styles]]}>
            {QPR_LEVEL_LABELS[item.qpr_level]}
          </AppText>
        ) : null}
      </Pressable>

      <View style={styles.feedDivider} />

      <Pressable
        style={styles.feedInteractionRow}
        onPress={(event) => {
          event.stopPropagation();
        }}
      >
        <View>
          {showCommentsControl ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onToggleComments();
              }}
              style={[
                styles.commentsButton,
                commentsExpanded ? styles.commentsButtonActive : null,
              ]}
            >
              <AppText
                style={[
                  styles.commentsButtonText,
                  commentsExpanded ? styles.commentsButtonTextActive : null,
                ]}
              >
                Comments
              </AppText>
              <AppText style={styles.commentsButtonCount}>{commentCount}</AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.reactionRight}>
          <ReactionSummaryPills
            entryId={item.id}
            reactionCounts={item.reaction_counts}
            reactionUsers={item.reaction_users}
          />
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onToggleReactionPicker();
            }}
            style={[
              styles.reactionAddButton,
              item.can_react ? null : styles.reactionAddButtonDisabled,
            ]}
          >
            <View style={styles.plusIcon}>
              <View
                style={[
                  styles.plusLineHorizontal,
                  item.can_react ? null : styles.plusLineDisabled,
                ]}
              />
              <View
                style={[
                  styles.plusLineVertical,
                  item.can_react ? null : styles.plusLineDisabled,
                ]}
              />
            </View>
          </Pressable>
        </View>
      </Pressable>

      {reactionPickerOpen ? (
        <Pressable
          style={styles.reactionPickerCard}
          onPress={(event) => {
            event.stopPropagation();
          }}
        >
          <View style={styles.reactionPickerRow}>
            {REACTION_EMOJIS.map((emoji) => {
              const selected = item.my_reactions.includes(emoji);
              return (
                <Pressable
                  key={`${item.id}-${emoji}`}
                  disabled={!item.can_react}
                  onPress={(event) => {
                    event.stopPropagation();
                    onToggleReaction(emoji);
                  }}
                  style={[
                    styles.reactionEmojiBtn,
                    selected ? styles.reactionEmojiBtnActive : null,
                    !item.can_react ? styles.reactionEmojiBtnDisabled : null,
                  ]}
                >
                  <AppText style={styles.reactionEmojiText}>{emoji}</AppText>
                </Pressable>
              );
            })}
          </View>
          {!item.can_react ? (
            <AppText style={styles.reactionPrivateText}>
              Reactions are not available for this post.
            </AppText>
          ) : null}
        </Pressable>
      ) : null}

      {commentsExpanded ? (
        <Pressable
          style={styles.commentsPanel}
          onPress={(event) => {
            event.stopPropagation();
          }}
        >
          {commentsLoading ? (
            <AppText style={styles.commentsEmptyText}>Loading comments...</AppText>
          ) : comments.length === 0 ? (
            <AppText style={styles.commentsEmptyText}>No comments yet. Start the thread.</AppText>
          ) : (
            <View style={styles.commentList}>
              {comments.map((comment) => (
                <View key={comment.id} style={styles.commentRow}>
                  <View style={styles.commentHeader}>
                    <AppText style={styles.commentAuthor}>
                      {comment.author_name ?? "Unknown"}
                    </AppText>
                    <View style={styles.commentHeaderRight}>
                      <AppText style={styles.commentDate}>
                        {formatCommentDate(comment.created_at)}
                      </AppText>
                      {!comment.is_deleted &&
                      viewerUserId &&
                      viewerUserId !== comment.user_id ? (
                        <View style={styles.commentMenuWrap}>
                          <Pressable
                            style={styles.commentMenuButton}
                            onPress={(event) => {
                              event.stopPropagation();
                              onToggleCommentMenu(comment.id);
                            }}
                          >
                            <View style={styles.commentMenuDotsRow}>
                              <View style={styles.commentMenuDot} />
                              <View style={styles.commentMenuDot} />
                              <View style={styles.commentMenuDot} />
                            </View>
                          </Pressable>
                          {commentMenuKey === `${item.id}:${comment.id}` ? (
                            <View style={styles.commentMenuPanel}>
                              <Pressable
                                disabled={reportingCommentId === comment.id}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  onReportComment(comment.id, comment.user_id);
                                }}
                              >
                                <AppText style={styles.commentMenuItemText}>
                                  {reportingCommentId === comment.id
                                    ? "Reporting..."
                                    : "Report comment"}
                                </AppText>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <AppText
                    style={[
                      styles.commentBody,
                      comment.is_deleted ? styles.commentBodyDeleted : null,
                    ]}
                  >
                    {comment.is_deleted ? "[deleted]" : comment.body}
                  </AppText>
                  {!comment.is_deleted && showCommentsControl ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        onSetReplyTarget(comment.id);
                      }}
                      style={styles.replyActionButton}
                    >
                      <AppText style={styles.replyActionText}>Reply</AppText>
                    </Pressable>
                  ) : null}
                  {comment.replies.length > 0 ? (
                    <View style={styles.replyList}>
                      {comment.replies.map((reply) => (
                        <View key={reply.id} style={styles.replyRow}>
                          <View style={styles.commentHeader}>
                            <AppText style={styles.commentAuthor}>
                              {reply.author_name ?? "Unknown"}
                            </AppText>
                            <View style={styles.commentHeaderRight}>
                              <AppText style={styles.commentDate}>
                                {formatCommentDate(reply.created_at)}
                              </AppText>
                              {!reply.is_deleted &&
                              viewerUserId &&
                              viewerUserId !== reply.user_id ? (
                                <View style={styles.commentMenuWrap}>
                                  <Pressable
                                    style={styles.commentMenuButton}
                                    onPress={(event) => {
                                      event.stopPropagation();
                                      onToggleCommentMenu(reply.id);
                                    }}
                                  >
                                    <View style={styles.commentMenuDotsRow}>
                                      <View style={styles.commentMenuDot} />
                                      <View style={styles.commentMenuDot} />
                                      <View style={styles.commentMenuDot} />
                                    </View>
                                  </Pressable>
                                  {commentMenuKey === `${item.id}:${reply.id}` ? (
                                    <View style={styles.commentMenuPanel}>
                                      <Pressable
                                        disabled={reportingCommentId === reply.id}
                                        onPress={(event) => {
                                          event.stopPropagation();
                                          onReportComment(reply.id, reply.user_id);
                                        }}
                                      >
                                        <AppText style={styles.commentMenuItemText}>
                                          {reportingCommentId === reply.id
                                            ? "Reporting..."
                                            : "Report comment"}
                                        </AppText>
                                      </Pressable>
                                    </View>
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          </View>
                          <AppText
                            style={[
                              styles.commentBody,
                              reply.is_deleted ? styles.commentBodyDeleted : null,
                            ]}
                          >
                            {reply.is_deleted ? "[deleted]" : reply.body}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          {showCommentsControl ? (
            <View style={styles.commentComposer}>
              {replyTargetName ? (
                <View style={styles.replyTargetRow}>
                  <AppText style={styles.replyTargetText}>Replying to {replyTargetName}</AppText>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onClearReplyTarget();
                    }}
                  >
                    <AppText style={styles.replyTargetCancel}>Cancel</AppText>
                  </Pressable>
                </View>
              ) : null}
              <DoneTextInput
                value={commentDraft}
                onChangeText={onChangeCommentDraft}
                placeholder={replyTargetName ? "Write a reply..." : "Write a comment..."}
                placeholderTextColor={colors.textTertiary}
                style={styles.commentInput}
                multiline
              />
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onSubmitComment();
                }}
                disabled={!commentDraft.trim() || postingComment}
                style={[
                  styles.commentSubmitButton,
                  !commentDraft.trim() || postingComment
                    ? styles.commentSubmitButtonDisabled
                    : null,
                ]}
              >
                <AppText style={styles.commentSubmitButtonText}>
                  {postingComment ? "Posting..." : replyTargetName ? "Post reply" : "Post"}
                </AppText>
              </Pressable>
            </View>
          ) : null}
          {commentError ? <AppText style={styles.commentErrorText}>{commentError}</AppText> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export default function FeedScreen() {
  const { user } = useAuth();
  const viewerUserId = user?.id ?? null;
  const [feedScope, setFeedScope] = useState<FeedScope>("public");
  const [entries, setEntries] = useState<MobileFeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isGallerySwipeActive, setIsGallerySwipeActive] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const {
    closePendingReport,
    getEntryInteractionState,
    moderationNotice,
    openReportReasonSheet,
    pendingReport,
    resetFeedTransientUiState,
    setCommentDraft,
    setPendingReportReason,
    setReplyTarget,
    clearReplyTarget,
    submitCommentForEntry,
    submitPendingReport,
    toggleCommentMenu,
    toggleCommentsExpanded,
    toggleNotes,
    toggleReaction,
    toggleReactionPicker,
    toggleReportMenu,
  } = useFeedInteractions({
    userId: viewerUserId,
    entries,
    setEntries,
    setErrorMessage,
  });
  const isFeedScrollActiveRef = useRef(false);
  const feedOpenBlockUntilRef = useRef(0);
  const feedScrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, DRINKING_NOW_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const clearFeedScrollIdleTimer = useCallback(() => {
    if (!feedScrollIdleTimerRef.current) {
      return;
    }
    clearTimeout(feedScrollIdleTimerRef.current);
    feedScrollIdleTimerRef.current = null;
  }, []);

  const markFeedScrolling = useCallback(
    (unlockDelayMs = 220) => {
      isFeedScrollActiveRef.current = true;
      feedOpenBlockUntilRef.current = Date.now() + Math.max(180, unlockDelayMs);
      clearFeedScrollIdleTimer();
      feedScrollIdleTimerRef.current = setTimeout(() => {
        isFeedScrollActiveRef.current = false;
        feedScrollIdleTimerRef.current = null;
      }, unlockDelayMs);
    },
    [clearFeedScrollIdleTimer]
  );

  const canOpenEntry = useCallback(() => {
    if (isFeedScrollActiveRef.current) {
      return false;
    }
    return Date.now() >= feedOpenBlockUntilRef.current;
  }, []);

  useEffect(
    () => () => {
      clearFeedScrollIdleTimer();
      isFeedScrollActiveRef.current = false;
    },
    [clearFeedScrollIdleTimer]
  );

  const visibleEntries = useMemo(() => entries, [entries]);

  const loadFeed = useCallback(
    async (refresh = false) => {
      if (!viewerUserId) {
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      const result = await fetchFeedPage({
        viewerUserId,
        scope: feedScope,
        cursor: null,
        limit: PAGE_SIZE,
      });

      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        setEntries([]);
        setHasMore(false);
        setNextCursor(null);
        resetFeedTransientUiState();
      } else {
        setEntries(result.entries);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        resetFeedTransientUiState();
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [feedScope, resetFeedTransientUiState, viewerUserId]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadFeed();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadFeed]);

  const loadMore = async () => {
    if (!viewerUserId || isLoadingMore || !hasMore || !nextCursor) {
      return;
    }

    setIsLoadingMore(true);
    setErrorMessage(null);

    const result = await fetchFeedPage({
      viewerUserId,
      scope: feedScope,
      cursor: nextCursor,
      limit: PAGE_SIZE,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setIsLoadingMore(false);
      return;
    }

    setEntries((current) => {
      const seen = new Set(current.map((entry) => entry.id));
      const next = result.entries.filter((entry) => !seen.has(entry.id));
      return [...current, ...next];
    });
    setHasMore(result.hasMore);
    setNextCursor(result.nextCursor);
    setIsLoadingMore(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.grenache} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        scrollEnabled={!isGallerySwipeActive}
        scrollEventThrottle={16}
        onScroll={() => {
          markFeedScrolling(220);
        }}
        onScrollBeginDrag={() => {
          markFeedScrolling(280);
        }}
        onScrollEndDrag={() => {
          markFeedScrolling(280);
        }}
        onMomentumScrollBegin={() => {
          markFeedScrolling(340);
        }}
        onMomentumScrollEnd={() => {
          markFeedScrolling(240);
        }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadFeed(true)}
            tintColor={colors.grenache}
          />
        }
      >
        <AppTopBar />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>{FEED_EYEBROW}</AppText>
          <AppText style={[styles.title, { fontSize: 18 }]}>{FEED_TITLE}</AppText>
          <AppText style={styles.subtitle}>{FEED_SUBTITLE}</AppText>
        </View>

        <View style={styles.scopeRow}>
          <Pressable
            style={[
              styles.scopePill,
              feedScope === "public" ? styles.scopePillActive : null,
            ]}
            onPress={() => setFeedScope("public")}
          >
            <AppText
              style={[
                styles.scopePillText,
                feedScope === "public" ? styles.scopePillTextActive : null,
              ]}
            >
              {FEED_SCOPE_LABELS.public}
            </AppText>
          </Pressable>
          <Pressable
            style={[
              styles.scopePill,
              feedScope === "friends" ? styles.scopePillActive : null,
            ]}
            onPress={() => setFeedScope("friends")}
          >
            <AppText
              style={[
                styles.scopePillText,
                feedScope === "friends" ? styles.scopePillTextActive : null,
              ]}
            >
              {FEED_SCOPE_LABELS.friends}
            </AppText>
          </Pressable>
        </View>



        {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
        {moderationNotice ? (
          <View
            style={[
              styles.moderationNotice,
              moderationNotice.kind === "success"
                ? styles.moderationNoticeSuccess
                : styles.moderationNoticeError,
            ]}
          >
            <AppText style={styles.moderationNoticeText}>{moderationNotice.message}</AppText>
          </View>
        ) : null}

        {visibleEntries.length === 0 ? (
          <View style={styles.emptyCard}>
            <AppText style={styles.emptyText}>{getFeedEmptyStateMessage(null, false)}</AppText>
          </View>
        ) : (
          <View style={styles.feedStack}>
            {visibleEntries.map((entry) => {
              const interaction = getEntryInteractionState(entry);

              return (
                <FeedCard
                  key={entry.id}
                  item={entry}
                  viewerUserId={viewerUserId}
                  reportMenuOpen={interaction.reportMenuOpen}
                  reportBusy={interaction.reportBusy}
                  notesExpanded={interaction.notesExpanded}
                  onToggleNotes={() => toggleNotes(entry.id)}
                  commentsExpanded={interaction.commentsExpanded}
                  onToggleComments={() => toggleCommentsExpanded(entry.id)}
                  onGallerySwipeStart={() =>
                    setIsGallerySwipeActive((current) => (current ? current : true))
                  }
                  onGallerySwipeEnd={() =>
                    setIsGallerySwipeActive((current) => (current ? false : current))
                  }
                  replyTargetName={interaction.replyTargetName}
                  onSetReplyTarget={(commentId) => setReplyTarget(entry.id, commentId)}
                  onClearReplyTarget={() => clearReplyTarget(entry.id)}
                  commentCount={interaction.commentCount}
                  comments={interaction.comments}
                  commentsLoading={interaction.commentsLoading}
                  commentDraft={interaction.commentDraft}
                  onChangeCommentDraft={(value) => setCommentDraft(entry.id, value)}
                  onSubmitComment={() => void submitCommentForEntry(entry.id)}
                  postingComment={interaction.postingComment}
                  commentError={interaction.commentError}
                  commentMenuKey={interaction.commentMenuKey}
                  reportingCommentId={interaction.reportingCommentId}
                  reactionPickerOpen={interaction.reactionPickerOpen}
                  onToggleReactionPicker={() => toggleReactionPicker(entry.id)}
                  onToggleReaction={(emoji) => void toggleReaction(entry.id, emoji)}
                  onToggleReportMenu={() => toggleReportMenu(entry.id)}
                  onReportPost={() =>
                    openReportReasonSheet({
                      targetType: "entry",
                      entryId: entry.id,
                      targetUserId: entry.user_id,
                    })
                  }
                  onToggleCommentMenu={(commentId) => toggleCommentMenu(entry.id, commentId)}
                  onReportComment={(commentId, targetUserId) =>
                    openReportReasonSheet({
                      targetType: "comment",
                      entryId: entry.id,
                      commentId,
                      targetUserId,
                    })
                  }
                  onOpenAuthorProfile={() =>
                    entry.user_id === viewerUserId
                      ? router.push("/(app)/profile")
                      : router.push(`/(app)/profile/${entry.user_id}`)
                  }
                  canOpenEntry={canOpenEntry}
                  onOpenEntry={() => router.push(`/(app)/entries/${entry.id}`)}
                  showDrinkingNowGlow={
                    entry.viewer_is_direct_friend &&
                    isDrinkingNowActive({
                      drinkingNow: entry.drinking_now,
                      createdAt: entry.created_at,
                      now: currentTimeMs,
                    })
                  }
                />
              );
            })}
          </View>
        )}

        {hasMore ? (
          <Pressable
            style={styles.loadMoreButton}
            disabled={isLoadingMore}
            onPress={() => void loadMore()}
          >
            {isLoadingMore ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <AppText style={styles.loadMoreText}>{FEED_LOAD_MORE_LABEL}</AppText>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        visible={Boolean(pendingReport)}
        transparent
        animationType="fade"
        onRequestClose={closePendingReport}
      >
        <View style={styles.reportModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closePendingReport}
          />
          <View style={styles.reportModalCard}>
            <AppText style={styles.reportModalTitle}>Report reason</AppText>
            <AppText style={styles.reportModalSubtitle}>
              Select the reason for this report.
            </AppText>

            <View style={styles.reportReasonList}>
              {REPORT_REASON_OPTIONS.map((option) => {
                const selected = pendingReport?.reason === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setPendingReportReason(option.value)}
                    style={[
                      styles.reportReasonRow,
                      selected ? styles.reportReasonRowActive : null,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.reportReasonText,
                        selected ? styles.reportReasonTextActive : null,
                      ]}
                    >
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.reportModalActions}>
              <Pressable
                style={styles.reportModalCancelButton}
                onPress={closePendingReport}
              >
                <AppText style={styles.reportModalCancelText}>Cancel</AppText>
              </Pressable>
              <Pressable
                style={styles.reportModalSubmitButton}
                onPress={() => void submitPendingReport()}
              >
                <AppText style={styles.reportModalSubmitText}>Report</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.screenBg,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  header: {
    gap: 5,
  },
  eyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 18,
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  scopePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  scopePillActive: {
    borderColor: "rgba(252,211,77,0.7)",
    backgroundColor: "rgba(251,191,36,0.15)",
  },
  scopePillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  scopePillTextActive: {
    color: colors.textPrimary,
  },
  searchToggleButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchToggleButtonActive: {
    borderColor: "rgba(252,211,77,0.7)",
    backgroundColor: "rgba(251,191,36,0.15)",
  },
  searchToggleIcon: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20,
  },
  searchToggleIconActive: {
    color: colors.textPrimary,
  },
  friendSearchPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 10,
    gap: 8,
  },
  friendSearchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  friendSearchInput: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  friendSearchClearButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  friendSearchClearText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  friendSearchResultsWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    overflow: "hidden",
  },
  friendSearchResultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  friendSearchResultText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  friendSearchMetaText: {
    color: colors.textSecondary,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  friendSearchSelectionText: {
    color: colors.rose,
    fontSize: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  moderationNotice: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  moderationNoticeSuccess: {
    borderColor: "rgba(16, 185, 129, 0.4)",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  moderationNoticeError: {
    borderColor: "rgba(251, 113, 133, 0.4)",
    backgroundColor: "rgba(251, 113, 133, 0.12)",
  },
  moderationNoticeText: {
    color: colors.textPrimary,
    fontSize: 12,
  },
  reportModalBackdrop: {
    flex: 1,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  reportModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.limestone,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  reportModalTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  reportModalSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  reportReasonList: {
    gap: 6,
  },
  reportReasonRow: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reportReasonRowActive: {
    borderColor: "rgba(252,211,77,0.55)",
    backgroundColor: "rgba(251,191,36,0.14)",
  },
  reportReasonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  reportReasonTextActive: {
    color: colors.textPrimary,
  },
  reportModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 2,
  },
  reportModalCancelButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  reportModalCancelText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  reportModalSubmitButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.5)",
    backgroundColor: "rgba(251,191,36,0.15)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  reportModalSubmitText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  feedStack: {
    gap: 12,
  },
  feedCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 10,
  },
  feedCardDrinkingNow: {
    borderColor: "rgba(125,211,252,0.72)",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    shadowColor: colors.info,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  feedAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  feedAuthorStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  feedAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  feedAvatarImage: {
    width: "100%",
    height: "100%",
  },
  feedAvatarFallback: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  feedAuthorName: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    flexShrink: 1,
  },
  feedDate: {
    color: colors.textSecondary,
    fontSize: 11,
    flexShrink: 0,
  },
  feedAuthorRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  feedMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  feedMenuWrap: {
    position: "relative",
  },
  feedMenuButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  feedMenuDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  feedMenuDot: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.textSecondary,
  },
  feedMenuPanel: {
    position: "absolute",
    right: 0,
    top: 22,
    zIndex: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.limestone,
    minWidth: 116,
    paddingVertical: 4,
  },
  feedMenuItemText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  feedPhotoFrame: {
    aspectRatio: 4 / 3,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: colors.surfacePrimary,
    position: "relative",
    marginHorizontal: -14,
    width: "auto",
  },
  feedPhotoTrack: {
    flexDirection: "row",
    height: "100%",
    backgroundColor: colors.surfaceRaised,
  },
  feedPhotoTrackSlide: {
    height: "100%",
    backgroundColor: colors.surfaceRaised,
    flexShrink: 0,
  },
  feedPhotoStatic: {
    width: "100%",
    height: "100%",
  },
  photoDotRow: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(161,161,170,0.85)",
  },
  photoDotActive: {
    backgroundColor: colors.rose,
  },
  photoNavButton: {
    position: "absolute",
    top: "50%",
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  photoNavButtonLeft: {
    left: 8,
  },
  photoNavButtonRight: {
    right: 8,
  },
  photoNavButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 14,
  },
  feedPhotoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  feedPhotoFallbackText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  photoTypeChip: {
    position: "absolute",
    left: 10,
    top: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoTypeChipText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  feedTextStack: {
    gap: 3,
  },
  feedWineName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  feedMetaText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  feedTastedWithText: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  feedValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  feedRating: {
    color: colors.rose,
    fontSize: 14,
    fontWeight: "800",
  },
  feedQprTag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  qpr_extortion: {
    borderColor: "rgba(251,113,133,0.4)",
    backgroundColor: "rgba(251,113,133,0.1)",
    color: colors.error,
  },
  qpr_pricey: {
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(248,113,113,0.1)",
    color: colors.error,
  },
  qpr_mid: {
    borderColor: "rgba(251,191,36,0.4)",
    backgroundColor: "rgba(251,191,36,0.1)",
    color: colors.rose,
  },
  qpr_good_value: {
    borderColor: "rgba(74,222,128,0.4)",
    backgroundColor: "rgba(74,222,128,0.1)",
    color: colors.success,
  },
  qpr_absolute_steal: {
    borderColor: "rgba(34,197,94,0.4)",
    backgroundColor: "rgba(34,197,94,0.1)",
    color: colors.success,
  },
  notesWrap: {
    gap: 4,
  },
  notesText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  notesToggleText: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
  },
  feedDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 3,
    marginBottom: 2,
  },
  feedInteractionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  commentsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  commentsButtonActive: {
    borderColor: "rgba(252,211,77,0.45)",
    backgroundColor: "rgba(251,191,36,0.12)",
  },
  commentsButtonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  commentsButtonTextActive: {
    color: colors.textPrimary,
  },
  commentsButtonCount: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  reactionRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  reactionAddButton: {
    width: 27,
    height: 27,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfacePrimary,
  },
  reactionAddButtonDisabled: {
    borderColor: colors.border,
  },
  plusIcon: {
    width: 12,
    height: 12,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  plusLineHorizontal: {
    position: "absolute",
    width: 12,
    height: 1.6,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  plusLineVertical: {
    position: "absolute",
    width: 1.6,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  plusLineDisabled: {
    backgroundColor: colors.textSecondary,
  },
  reactionPickerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 9,
    gap: 8,
  },
  reactionPickerRow: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  reactionEmojiBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionEmojiBtnActive: {
    borderColor: "rgba(252,211,77,0.5)",
    backgroundColor: "rgba(251,191,36,0.14)",
  },
  reactionEmojiBtnDisabled: {
    opacity: 0.5,
  },
  reactionEmojiText: {
    fontSize: 18,
  },
  reactionPrivateText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  commentsPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 10,
    gap: 8,
  },
  commentsEmptyText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  commentList: {
    gap: 8,
  },
  commentRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 8,
    gap: 4,
  },
  replyList: {
    marginTop: 6,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    gap: 6,
  },
  replyRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 7,
    gap: 3,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  commentHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commentAuthor: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
  },
  commentDate: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  commentMenuWrap: {
    position: "relative",
  },
  commentMenuButton: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  commentMenuDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1.5,
  },
  commentMenuDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 999,
    backgroundColor: colors.textSecondary,
  },
  commentMenuPanel: {
    position: "absolute",
    right: 0,
    top: 20,
    zIndex: 25,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.limestone,
    minWidth: 120,
    paddingVertical: 4,
  },
  commentMenuItemText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commentBody: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  commentBodyDeleted: {
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  replyActionButton: {
    alignSelf: "flex-start",
  },
  replyActionText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  commentComposer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    gap: 8,
  },
  replyTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  replyTargetText: {
    color: colors.textSecondary,
    fontSize: 11,
    flex: 1,
  },
  replyTargetCancel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  commentInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 52,
    textAlignVertical: "top",
  },
  commentSubmitButton: {
    alignSelf: "flex-end",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.5)",
    backgroundColor: "rgba(251,191,36,0.15)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  commentSubmitButtonDisabled: {
    opacity: 0.5,
  },
  commentSubmitButtonText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  commentErrorText: {
    color: colors.error,
    fontSize: 11,
  },
  loadMoreButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.grenache,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadMoreText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
});
