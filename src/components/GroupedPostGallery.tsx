"use client";

import SwipePhotoGallery from "@/components/SwipePhotoGallery";
import { formatConsumedDate } from "@/lib/formatDate";
import { shouldHideProducerInEntryTile } from "@/lib/entryDisplay";
import type { GroupedEntrySlide } from "@/types/wine";

function normalizeMetaValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildSlideMeta(slide: GroupedEntrySlide) {
  const wineName = normalizeMetaValue(slide.wine_name) ?? "";
  const producer = normalizeMetaValue(slide.producer);
  const vintage = normalizeMetaValue(slide.vintage);
  const region = normalizeMetaValue(slide.region);
  const country = normalizeMetaValue(slide.country);
  const appellation = normalizeMetaValue(slide.appellation);
  const hideProducer = shouldHideProducerInEntryTile(wineName, producer);
  return [hideProducer ? null : producer, vintage, region, country, appellation]
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
    .join(" • ");
}

export default function GroupedPostGallery({
  title,
  slides,
  heightClassName = "",
}: {
  title: string;
  slides: GroupedEntrySlide[];
  heightClassName?: string;
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
        badge: slide.label,
      }))}
      heightClassName={heightClassName}
      wrapperClassName="overflow-hidden bg-black/40"
      header={(_active, activeIndex) => {
        const slide = slides[activeIndex] ?? slides[0];
        const isWineSlide = Boolean(slide?.entry_id);
        const slideTitle = isWineSlide
          ? slide?.wine_name ?? slide?.producer ?? slide?.label ?? "Wine"
          : slide?.label ?? "Photo";
        const slideMeta = slide ? buildSlideMeta(slide) : "";

        return (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-secondary)]/80">
                {title}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
                {slideTitle}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {isWineSlide
                  ? slideMeta || "Wine details update as you swipe."
                  : `${slide?.label ?? "Photo"} slide`}
              </p>
            </div>
            {slide?.created_at ? (
              <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
                {formatConsumedDate(slide.created_at)}
              </span>
            ) : slide?.consumed_at ? (
              <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
                {formatConsumedDate(slide.consumed_at)}
              </span>
            ) : null}
          </div>
        );
      }}
      footer={(_active, activeIndex) => (
        <>
          <span>
            {activeIndex + 1} of {slides.length}
          </span>
          <span className="text-[var(--color-text-tertiary)]">
            Swipe to move between wines and event photos
          </span>
        </>
      )}
    />
  );
}
