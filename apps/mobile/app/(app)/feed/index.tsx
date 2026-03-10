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
import type { FeedComment } from "@/src/lib/feed/comments";
import {
  fetchFeedPage,
  type FeedPhotoType,
  type FeedScope,
  type MobileFeedEntry,
  type QprLevel,
} from "@/src/lib/feed/feedPage";
import {
  REPORT_REASON_OPTIONS,
  useFeedInteractions,
} from "@/src/lib/feed/useFeedInteractions";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";

type UserOption = {
  id: string;
  display_name: string | null;
};

const PAGE_SIZE = 24;
const REACTION_EMOJIS = ["🍷", "🔥", "❤️", "👀", "🤝"] as const;
const PHOTO_TYPE_LABELS: Record<FeedPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
};

const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Spot on",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
};

function sanitizeUserSearch(search: string) {
  return search.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

function buildTokenAndFilter(tokens: string[], fields: string[]) {
  const cleaned = tokens.map((token) => token.trim()).filter(Boolean).slice(0, 4);
  if (cleaned.length <= 1) {
    return null;
  }

  const tokenOr = (token: string) => {
    const pattern = `%${token}%`;
    return `or(${fields.map((field) => `${field}.ilike.${pattern}`).join(",")})`;
  };

  return `and(${cleaned.map(tokenOr).join(",")})`;
}

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

function normalizeMetaValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function toWordSet(value: string | null | undefined): Set<string> {
  const normalized = value?.toLowerCase() ?? "";
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 2));
}

function shouldHideProducerInEntryTile(
  wineName: string | null | undefined,
  producer: string | null | undefined
) {
  const wineWords = toWordSet(wineName);
  const producerWords = toWordSet(producer);

  if (wineWords.size === 0 || producerWords.size === 0) {
    return false;
  }

  let sharedWordCount = 0;
  for (const word of producerWords) {
    if (!wineWords.has(word)) {
      continue;
    }
    sharedWordCount += 1;
    if (sharedWordCount >= 3) {
      return true;
    }
  }

  return false;
}

function getPrimaryVarietal(entry: MobileFeedEntry) {
  const grapes = Array.isArray(entry.primary_grapes) ? entry.primary_grapes : [];
  if (grapes.length === 0) {
    return null;
  }
  const sorted = [...grapes].sort((a, b) => a.position - b.position);
  for (const grape of sorted) {
    const value = normalizeMetaValue(grape.name);
    if (value) {
      return value;
    }
  }
  return null;
}

function buildEntryMetaFields(entry: MobileFeedEntry) {
  const wineName = normalizeMetaValue(entry.wine_name) ?? "";
  const producer = normalizeMetaValue(entry.producer);
  const vintage = normalizeMetaValue(entry.vintage);
  const region = normalizeMetaValue(entry.region);
  const country = normalizeMetaValue(entry.country);
  const appellation = normalizeMetaValue(entry.appellation);
  const varietal = getPrimaryVarietal(entry);

  const hideProducer = shouldHideProducerInEntryTile(wineName, producer);
  const nonVintagePriority = [
    hideProducer ? null : producer,
    region,
    country,
    appellation,
    varietal,
  ];

  const fields: string[] = [];
  const firstField = nonVintagePriority.find((value): value is string => Boolean(value));
  if (firstField) {
    fields.push(firstField);
  }

  if (vintage && fields.length > 0) {
    fields.push(vintage);
  }

  if (fields.length < 2) {
    for (const value of nonVintagePriority) {
      if (!value || fields.includes(value)) {
        continue;
      }
      fields.push(value);
      if (fields.length >= 2) {
        break;
      }
    }
  }

  return fields.slice(0, 2);
}

function getDisplayRating(rating: number | null): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.round(rating)));
  return `${normalized}/100`;
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
    <View style={styles.feedCard}>
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
          <AppText style={styles.feedAuthorName}>{item.author_name}</AppText>
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
        {item.tasted_with_users.length > 0 ? (
          <AppText style={styles.feedTastedWithText}>
            Tasted with:{" "}
            {item.tasted_with_users.map((user) => user.display_name ?? "Unknown").join(", ")}
          </AppText>
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
                placeholderTextColor="#71717a"
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
  const [isFriendSearchOpen, setIsFriendSearchOpen] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<UserOption[]>([]);
  const [isFriendSearchLoading, setIsFriendSearchLoading] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [selectedFriendName, setSelectedFriendName] = useState<string | null>(null);
  const [entries, setEntries] = useState<MobileFeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isGallerySwipeActive, setIsGallerySwipeActive] = useState(false);
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

  const visibleEntries = useMemo(() => {
    if (!selectedFriendId) {
      return entries;
    }
    return entries.filter((entry) => entry.user_id === selectedFriendId);
  }, [entries, selectedFriendId]);

  useEffect(() => {
    if (!isFriendSearchOpen || !viewerUserId) {
      return;
    }

    const trimmedQuery = friendSearchQuery.trim();
    if (!trimmedQuery) {
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setIsFriendSearchLoading(true);
      const search = sanitizeUserSearch(trimmedQuery);
      const pattern = `%${search}%`;
      const tokens = search.split(" ").filter(Boolean);
      const tokenAndFilter = buildTokenAndFilter(tokens, [
        "display_name",
        "first_name",
        "last_name",
      ]);

      const baseFilters = [
        `display_name.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        tokenAndFilter,
      ]
        .filter(Boolean)
        .join(",");

      const firstAttempt = await supabase
        .from("public_profiles")
        .select("id, display_name")
        .neq("id", viewerUserId)
        .or(baseFilters)
        .order("display_name", { ascending: true })
        .limit(25);

      let data = firstAttempt.data;
      let error = firstAttempt.error;

      if (
        error &&
        (error.message.includes("first_name") || error.message.includes("last_name"))
      ) {
        const fallbackTokenAndFilter = buildTokenAndFilter(tokens, [
          "display_name",
        ]);
        const fallbackFilters = [
          `display_name.ilike.${pattern}`,
          fallbackTokenAndFilter,
        ]
          .filter(Boolean)
          .join(",");
        const fallbackAttempt = await supabase
          .from("public_profiles")
          .select("id, display_name")
          .neq("id", viewerUserId)
          .or(fallbackFilters)
          .order("display_name", { ascending: true })
          .limit(25);
        data = fallbackAttempt.data;
        error = fallbackAttempt.error;
      }

      if (isCancelled) {
        return;
      }

      if (error) {
        setFriendSearchResults([]);
      } else {
        setFriendSearchResults((data ?? []) as UserOption[]);
      }
      setIsFriendSearchLoading(false);
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [friendSearchQuery, isFriendSearchOpen, viewerUserId]);

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

  const clearFriendSearch = () => {
    setFriendSearchQuery("");
    setFriendSearchResults([]);
    setIsFriendSearchLoading(false);
    setSelectedFriendId(null);
    setSelectedFriendName(null);
  };

  const toggleFriendSearch = () => {
    setIsFriendSearchOpen((current) => {
      const next = !current;
      if (!next) {
        clearFriendSearch();
      }
      return next;
    });
  };

  const selectFriendFilter = (option: UserOption) => {
    const displayName = option.display_name?.trim() || "Unknown";
    setFeedScope("friends");
    setSelectedFriendId(option.id);
    setSelectedFriendName(displayName);
    setFriendSearchQuery(displayName);
    setFriendSearchResults([]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#fbbf24" />
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
            tintColor="#fbbf24"
          />
        }
      >
        <AppTopBar activeHref="/(app)/feed" />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>Social feed</AppText>
          <AppText style={styles.title}>What the cellar is sipping.</AppText>
          <AppText style={styles.subtitle}>
            Discover what others are enjoying across the app.
          </AppText>
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
              Public feed
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
              Friends only
            </AppText>
          </Pressable>
          <Pressable
            style={[
              styles.searchToggleButton,
              isFriendSearchOpen ? styles.searchToggleButtonActive : null,
            ]}
            onPress={toggleFriendSearch}
            accessibilityRole="button"
            accessibilityLabel={isFriendSearchOpen ? "Hide friend search" : "Show friend search"}
          >
            <AppText
              style={[
                styles.searchToggleIcon,
                isFriendSearchOpen ? styles.searchToggleIconActive : null,
              ]}
            >
              ⌕
            </AppText>
          </Pressable>
        </View>

        {isFriendSearchOpen ? (
          <View style={styles.friendSearchPanel}>
            <View style={styles.friendSearchInputRow}>
              <DoneTextInput
                value={friendSearchQuery}
                onChangeText={(value) => {
                  setFriendSearchQuery(value);
                  setSelectedFriendId(null);
                  setSelectedFriendName(null);
                  if (!value.trim()) {
                    setFriendSearchResults([]);
                    setIsFriendSearchLoading(false);
                  }
                }}
                placeholder="Search by username..."
                placeholderTextColor="#71717a"
                style={styles.friendSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {friendSearchQuery.trim() || selectedFriendId ? (
                <Pressable
                  style={styles.friendSearchClearButton}
                  onPress={clearFriendSearch}
                >
                  <AppText style={styles.friendSearchClearText}>Clear</AppText>
                </Pressable>
              ) : null}
            </View>

            {selectedFriendId ? (
              <AppText style={styles.friendSearchSelectionText}>
                Showing posts from {selectedFriendName ?? "this friend"}.
              </AppText>
            ) : null}

            {friendSearchQuery.trim() ? (
              <View style={styles.friendSearchResultsWrap}>
                {isFriendSearchLoading ? (
                  <AppText style={styles.friendSearchMetaText}>Searching...</AppText>
                ) : friendSearchResults.length === 0 ? (
                  <AppText style={styles.friendSearchMetaText}>
                    No friends match your search.
                  </AppText>
                ) : (
                  friendSearchResults.map((option) => {
                    const displayName = option.display_name?.trim() || "Unknown";
                    return (
                      <Pressable
                        key={option.id}
                        style={styles.friendSearchResultRow}
                        onPress={() => selectFriendFilter(option)}
                      >
                        <AppText style={styles.friendSearchResultText}>{displayName}</AppText>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : (
              <AppText style={styles.friendSearchMetaText}>
                Search for a friend, then tap a result to filter the feed.
              </AppText>
            )}
          </View>
        ) : null}

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
            <AppText style={styles.emptyText}>
              {selectedFriendId
                ? `No posts from ${selectedFriendName ?? "this friend"} in this feed yet.`
                : "No entries yet."}
            </AppText>
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
              <ActivityIndicator color="#09090b" />
            ) : (
              <AppText style={styles.loadMoreText}>Load more</AppText>
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
    backgroundColor: "#0f0a09",
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#0f0a09",
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
    gap: 6,
  },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafafa",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: "#d4d4d8",
    fontSize: 13,
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
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  scopePillActive: {
    borderColor: "rgba(252,211,77,0.7)",
    backgroundColor: "rgba(251,191,36,0.15)",
  },
  scopePillText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "700",
  },
  scopePillTextActive: {
    color: "#fef3c7",
  },
  searchToggleButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchToggleButtonActive: {
    borderColor: "rgba(252,211,77,0.7)",
    backgroundColor: "rgba(251,191,36,0.15)",
  },
  searchToggleIcon: {
    color: "#d4d4d8",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20,
  },
  searchToggleIconActive: {
    color: "#fef3c7",
  },
  friendSearchPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
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
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.3)",
    color: "#f4f4f5",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  friendSearchClearButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  friendSearchClearText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
  },
  friendSearchResultsWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
  },
  friendSearchResultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  friendSearchResultText: {
    color: "#e4e4e7",
    fontSize: 13,
    fontWeight: "600",
  },
  friendSearchMetaText: {
    color: "#a1a1aa",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  friendSearchSelectionText: {
    color: "#fde68a",
    fontSize: 12,
  },
  errorText: {
    color: "#fecdd3",
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
    color: "#f4f4f5",
    fontSize: 12,
  },
  reportModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  reportModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#1a1412",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  reportModalTitle: {
    color: "#f4f4f5",
    fontSize: 15,
    fontWeight: "700",
  },
  reportModalSubtitle: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  reportReasonList: {
    gap: 6,
  },
  reportReasonRow: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reportReasonRowActive: {
    borderColor: "rgba(252,211,77,0.55)",
    backgroundColor: "rgba(251,191,36,0.14)",
  },
  reportReasonText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "600",
  },
  reportReasonTextActive: {
    color: "#fef3c7",
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
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  reportModalCancelText: {
    color: "#d4d4d8",
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
    color: "#fef3c7",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyText: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 20,
  },
  feedStack: {
    gap: 12,
  },
  feedCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    gap: 10,
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
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  feedAvatarImage: {
    width: "100%",
    height: "100%",
  },
  feedAvatarFallback: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
  },
  feedAuthorName: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  feedDate: {
    color: "#a1a1aa",
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.22)",
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
    backgroundColor: "#a1a1aa",
  },
  feedMenuPanel: {
    position: "absolute",
    right: 0,
    top: 22,
    zIndex: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#1a1412",
    minWidth: 116,
    paddingVertical: 4,
  },
  feedMenuItemText: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  feedPhotoFrame: {
    width: "100%",
    aspectRatio: 7 / 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.45)",
    position: "relative",
  },
  feedPhotoTrack: {
    flexDirection: "row",
    height: "100%",
    backgroundColor: "#000000",
  },
  feedPhotoTrackSlide: {
    height: "100%",
    backgroundColor: "#000000",
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
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.45)",
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
    backgroundColor: "#fcd34d",
  },
  photoNavButton: {
    position: "absolute",
    top: "50%",
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(0,0,0,0.55)",
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
    color: "#f4f4f5",
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
    color: "#71717a",
    fontSize: 12,
  },
  photoTypeChip: {
    position: "absolute",
    left: 10,
    top: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoTypeChipText: {
    color: "#e4e4e7",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  feedTextStack: {
    gap: 3,
  },
  feedWineName: {
    color: "#fafafa",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  feedMetaText: {
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 18,
  },
  feedTastedWithText: {
    color: "#a1a1aa",
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
    color: "#fcd34d",
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
    color: "#fecdd3",
  },
  qpr_pricey: {
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(248,113,113,0.1)",
    color: "#fecaca",
  },
  qpr_mid: {
    borderColor: "rgba(251,191,36,0.4)",
    backgroundColor: "rgba(251,191,36,0.1)",
    color: "#fde68a",
  },
  qpr_good_value: {
    borderColor: "rgba(74,222,128,0.4)",
    backgroundColor: "rgba(74,222,128,0.1)",
    color: "#bbf7d0",
  },
  qpr_absolute_steal: {
    borderColor: "rgba(34,197,94,0.4)",
    backgroundColor: "rgba(34,197,94,0.1)",
    color: "#86efac",
  },
  notesWrap: {
    gap: 4,
  },
  notesText: {
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 18,
  },
  notesToggleText: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
  },
  feedDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.11)",
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
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  commentsButtonActive: {
    borderColor: "rgba(252,211,77,0.45)",
    backgroundColor: "rgba(251,191,36,0.12)",
  },
  commentsButtonText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "700",
  },
  commentsButtonTextActive: {
    color: "#fef3c7",
  },
  commentsButtonCount: {
    color: "#a1a1aa",
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
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  reactionAddButtonDisabled: {
    borderColor: "rgba(255,255,255,0.1)",
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
    backgroundColor: "#e4e4e7",
  },
  plusLineVertical: {
    position: "absolute",
    width: 1.6,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#e4e4e7",
  },
  plusLineDisabled: {
    backgroundColor: "#71717a",
  },
  reactionPickerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.28)",
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
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
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
    color: "#71717a",
    fontSize: 11,
  },
  commentsPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 10,
    gap: 8,
  },
  commentsEmptyText: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  commentList: {
    gap: 8,
  },
  commentRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
    gap: 4,
  },
  replyList: {
    marginTop: 6,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
    gap: 6,
  },
  replyRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.2)",
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
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
  },
  commentDate: {
    color: "#71717a",
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.22)",
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
    backgroundColor: "#a1a1aa",
  },
  commentMenuPanel: {
    position: "absolute",
    right: 0,
    top: 20,
    zIndex: 25,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#1a1412",
    minWidth: 120,
    paddingVertical: 4,
  },
  commentMenuItemText: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commentBody: {
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 17,
  },
  commentBodyDeleted: {
    color: "#71717a",
    fontStyle: "italic",
  },
  replyActionButton: {
    alignSelf: "flex-start",
  },
  replyActionText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "600",
  },
  commentComposer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
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
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  replyTargetText: {
    color: "#d4d4d8",
    fontSize: 11,
    flex: 1,
  },
  replyTargetCancel: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "600",
  },
  commentInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.25)",
    color: "#f4f4f5",
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
    color: "#fef3c7",
    fontSize: 11,
    fontWeight: "700",
  },
  commentErrorText: {
    color: "#fecdd3",
    fontSize: 11,
  },
  loadMoreButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadMoreText: {
    color: "#09090b",
    fontSize: 12,
    fontWeight: "700",
  },
});
