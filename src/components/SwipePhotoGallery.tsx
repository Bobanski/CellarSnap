"use client";

import { useRef, useState, type ReactNode } from "react";
import Photo from "@/components/Photo";

export type SwipePhotoGalleryItem = {
  id?: string;
  url: string | null;
  alt: string;
  badge?: ReactNode;
};

export default function SwipePhotoGallery({
  items,
  heightClassName = "h-80",
  wrapperClassName = "",
  footer,
  empty,
}: {
  items: SwipePhotoGalleryItem[];
  heightClassName?: string;
  wrapperClassName?: string;
  footer?: (active: SwipePhotoGalleryItem, activeIndex: number) => ReactNode;
  empty?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  if (items.length === 0) {
    return (
      <div
        className={`flex ${heightClassName} items-center justify-center rounded-3xl border border-white/10 bg-black/40 text-sm text-zinc-400 ${wrapperClassName}`}
      >
        {empty ?? "No photo"}
      </div>
    );
  }

  const total = items.length;
  const activeIndex = Math.min(index, total - 1);
  const active = items[activeIndex]!;
  const goPrev = () => setIndex((current) => (current - 1 + total) % total);
  const goNext = () => setIndex((current) => (current + 1) % total);

  return (
    <div
      className={`overflow-hidden rounded-3xl border border-white/10 bg-black/40 ${wrapperClassName}`}
    >
      <div className="relative">
        <div
          className={`flex ${heightClassName} transition-transform duration-300`}
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          onTouchStart={(event) => {
            touchStartXRef.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (items.length <= 1 || touchStartXRef.current === null) {
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
          {items.map((item, itemIndex) => (
            <div
              key={
                item.id ??
                `${item.url ?? "missing"}-${itemIndex}`
              }
              className="relative min-w-full"
            >
              {item.url ? (
                <Photo
                  src={item.url}
                  alt={item.alt}
                  containerClassName="h-full w-full"
                  className="h-full w-full object-cover"
                  loading={itemIndex === 0 ? "eager" : "lazy"}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                  Photo unavailable
                </div>
              )}
              {item.badge
                ? typeof item.badge === "string"
                  ? (
                      <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-200">
                        {item.badge}
                      </span>
                    )
                  : (
                      <div className="absolute left-2 top-2">{item.badge}</div>
                    )
                : null}
            </div>
          ))}
        </div>

        {items.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 md:inline-flex"
              aria-label="Previous photo"
              onClick={goPrev}
            >
              {"<"}
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm text-zinc-100 transition hover:border-amber-300/60 hover:text-amber-200 md:inline-flex"
              aria-label="Next photo"
              onClick={goNext}
            >
              {">"}
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-1">
              {items.map((_, dotIndex) => (
                <button
                  key={dotIndex}
                  type="button"
                  aria-label={`Go to photo ${dotIndex + 1}`}
                  className={`h-1.5 w-1.5 rounded-full transition ${
                    dotIndex === activeIndex ? "bg-amber-300" : "bg-zinc-400/70"
                  }`}
                  onClick={() => setIndex(dotIndex)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {footer ? (
        <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
          {footer(active, activeIndex)}
        </div>
      ) : null}
    </div>
  );
}
