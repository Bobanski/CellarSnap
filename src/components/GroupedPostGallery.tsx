"use client";

import SwipePhotoGallery from "@/components/SwipePhotoGallery";
import { formatConsumedDate } from "@/lib/formatDate";
import type { GroupedEntrySlide } from "@/types/wine";

export default function GroupedPostGallery({
  title,
  slides,
  heightClassName = "",
  onIndexChange,
}: {
  title: string;
  slides: GroupedEntrySlide[];
  heightClassName?: string;
  onIndexChange?: (index: number) => void;
}) {
  if (slides.length === 0) {
    return null;
  }

  return (
    <SwipePhotoGallery
      items={slides.map((slide) => ({
        id: slide.id,
        url: slide.url,
        alt: `${slide.wine_name ?? slide.producer ?? title} ${slide.label}`,
      }))}
      heightClassName={heightClassName}
      wrapperClassName="overflow-hidden bg-black/40"
      onIndexChange={onIndexChange}
      header={(_active, activeIndex) => {
        const slide = slides[activeIndex] ?? slides[0];
        return (
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-secondary)]/80">
              {title}
            </p>
            {slide?.consumed_at ? (
              <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
                Drank {formatConsumedDate(slide.consumed_at)}
              </span>
            ) : null}
          </div>
        );
      }}
      footer={(_active, activeIndex) => (
        <span>
          {activeIndex + 1} of {slides.length}
        </span>
      )}
    />
  );
}
