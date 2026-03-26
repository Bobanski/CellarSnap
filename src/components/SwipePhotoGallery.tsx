"use client";

import { useRef, useState, type ReactNode } from "react";
import Photo from "@/components/Photo";

export type SwipePhotoGalleryItem = {
  id?: string;
  url: string | null;
  alt: string;
  badge?: ReactNode;
  topRightBadge?: ReactNode;
};

function resolveItemKey(item: SwipePhotoGalleryItem, itemIndex: number) {
  return item.id ?? `${item.url ?? "missing"}-${itemIndex}`;
}

function toOrdinal(value: number) {
  const abs = Math.abs(value);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }
  const mod10 = abs % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

export default function SwipePhotoGallery({
  items,
  heightClassName = "h-80",
  wrapperClassName = "",
  header,
  footer,
  empty,
  showOrderBadge = false,
  orderBadgeFormatter,
}: {
  items: SwipePhotoGalleryItem[];
  heightClassName?: string;
  wrapperClassName?: string;
  header?: (active: SwipePhotoGalleryItem, activeIndex: number) => ReactNode;
  footer?: (active: SwipePhotoGalleryItem, activeIndex: number) => ReactNode;
  empty?: ReactNode;
  showOrderBadge?: boolean;
  orderBadgeFormatter?: (order: number, total: number) => ReactNode;
}) {
  const [activeItemState, setActiveItemState] = useState<{
    index: number;
    key: string | null;
  }>(() => ({
    index: 0,
    key: items[0] ? resolveItemKey(items[0], 0) : null,
  }));
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const didSwipeRef = useRef(false);

  if (items.length === 0) {
    return (
      <div
        className={`flex ${heightClassName || "aspect-[4/4.2]"} items-center justify-center rounded-3xl border border-[var(--color-border)] bg-black/40 text-sm text-[var(--color-text-tertiary)] ${wrapperClassName}`}
      >
        {empty ?? "No photo"}
      </div>
    );
  }

  const total = items.length;
  const boundedIndex = Math.min(activeItemState.index, total - 1);
  const persistedActiveIndex = activeItemState.key
    ? items.findIndex(
        (item, itemIndex) =>
          resolveItemKey(item, itemIndex) === activeItemState.key
      )
    : -1;
  const activeIndex = persistedActiveIndex >= 0 ? persistedActiveIndex : boundedIndex;
  const active = items[activeIndex]!;
  const setActiveByIndex = (nextIndex: number) => {
    const nextItem = items[nextIndex];
    if (!nextItem) {
      return;
    }
    setActiveItemState({
      index: nextIndex,
      key: resolveItemKey(nextItem, nextIndex),
    });
  };
  const goPrev = () => setActiveByIndex((activeIndex - 1 + total) % total);
  const goNext = () => setActiveByIndex((activeIndex + 1) % total);

  return (
    <div
      className={`overflow-hidden ${wrapperClassName || "rounded-3xl border border-[var(--color-border)] bg-black/40"}`}
      onClickCapture={(event) => {
        if (!didSwipeRef.current) return;
        didSwipeRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {header ? (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          {header(active, activeIndex)}
        </div>
      ) : null}
      <div className="relative">
        <div
          className={`flex ${heightClassName || ""} transition-transform duration-300`}
          style={{
            transform: `translateX(-${activeIndex * 100}%)`,
            touchAction: "pan-y",
            ...(heightClassName ? {} : { aspectRatio: "4 / 4.2" }),
          }}
          onTouchStart={(event) => {
            touchStartXRef.current = event.touches[0]?.clientX ?? null;
            touchStartYRef.current = event.touches[0]?.clientY ?? null;
            didSwipeRef.current = false;
          }}
          onTouchMove={(event) => {
            if (touchStartXRef.current === null || touchStartYRef.current === null) return;
            const point = event.touches[0];
            if (!point) return;
            const deltaX = Math.abs(point.clientX - touchStartXRef.current);
            const deltaY = Math.abs(point.clientY - touchStartYRef.current);
            if (deltaX > 10 || deltaY > 10) {
              didSwipeRef.current = true;
            }
          }}
          onTouchEnd={(event) => {
            if (items.length <= 1 || touchStartXRef.current === null) {
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
          {items.map((item, itemIndex) => {
            const itemKey = resolveItemKey(item, itemIndex);
            const topRightBadge =
              item.topRightBadge ??
              (showOrderBadge
                ? (orderBadgeFormatter?.(itemIndex + 1, total) ??
                  toOrdinal(itemIndex + 1))
                : null);

            return (
              <div key={itemKey} className="relative min-w-full">
                {item.url ? (
                  <Photo
                    src={item.url}
                    alt={item.alt}
                    containerClassName="h-full w-full"
                    className="h-full w-full object-cover"
                    loading={itemIndex === 0 ? "eager" : "lazy"}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
                    Photo unavailable
                  </div>
                )}
                {item.badge
                  ? typeof item.badge === "string"
                    ? (
                        <span className="absolute left-2 top-2 rounded-full border border-[var(--color-border-strong)] bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-primary)]">
                          {item.badge}
                        </span>
                      )
                    : (
                        <div className="absolute left-2 top-2">{item.badge}</div>
                      )
                  : null}
                {topRightBadge
                  ? typeof topRightBadge === "string"
                    ? (
                        <span className="absolute right-2 top-2 rounded-full border border-[var(--color-border-strong)] bg-black/55 px-2 py-1 text-[10px] font-semibold text-[var(--color-text-primary)]">
                          {topRightBadge}
                        </span>
                      )
                    : (
                        <div className="absolute right-2 top-2">{topRightBadge}</div>
                      )
                  : null}
              </div>
            );
          })}
        </div>

        {items.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] md:inline-flex"
              aria-label="Previous photo"
              onClick={goPrev}
            >
              {"<"}
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] md:inline-flex"
              aria-label="Next photo"
              onClick={goNext}
            >
              {">"}
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--color-border)] bg-black/45 px-2 py-1">
              {items.map((_, dotIndex) => (
                <button
                  key={dotIndex}
                  type="button"
                  aria-label={`Go to photo ${dotIndex + 1}`}
                  className={`h-1.5 w-1.5 rounded-full transition ${
                    dotIndex === activeIndex ? "bg-[var(--color-accent-primary)]" : "bg-zinc-400/70"
                  }`}
                  onClick={() => setActiveByIndex(dotIndex)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {footer ? (
        <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          {footer(active, activeIndex)}
        </div>
      ) : null}
    </div>
  );
}
