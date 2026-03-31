"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Photo from "@/components/Photo";
import AppShell from "@/components/AppShell";
import { formatConsumedDate } from "@/lib/formatDate";
import { fetchCollectionDetailClient } from "@/lib/collections/client";
import type {
  UserCollectionItemSummary,
  UserCollectionSummary,
} from "@shared";

function CollectionItemCard({ item }: { item: UserCollectionItemSummary }) {
  const previewImageUrl = item.preview_image_url ?? item.label_image_url ?? null;
  const subtitle = [item.producer, item.vintage].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/entries/${item.entry_id}`}
      className="group flex items-center gap-4 rounded-2xl border p-4 transition hover:border-[var(--color-border-strong)]"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface-primary)",
      }}
    >
      <div
        className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
        style={{ background: "var(--color-surface-tinted)" }}
      >
        {previewImageUrl ? (
          <Photo
            src={previewImageUrl}
            alt={item.wine_name ?? item.producer ?? "Saved wine"}
            containerClassName="h-full w-full"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <span className="px-4 text-center text-xs text-[var(--color-text-secondary)]">
            No photo
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h2
          className="truncate"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 24,
            fontWeight: 300,
            color: "var(--color-text-primary)",
          }}
        >
          {item.wine_name || "Untitled wine"}
        </h2>
        {subtitle ? (
          <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
            {subtitle}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          {item.consumed_at ? `Consumed ${formatConsumedDate(item.consumed_at)}` : "Saved to collection"}
        </p>
      </div>
    </Link>
  );
}

export default function CollectionDetailPage() {
  const params = useParams<{ collectionId: string | string[] }>();
  const collectionId = useMemo(() => {
    return Array.isArray(params.collectionId) ? params.collectionId[0] : params.collectionId;
  }, [params.collectionId]);
  const [collection, setCollection] = useState<UserCollectionSummary | null>(null);
  const [items, setItems] = useState<UserCollectionItemSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(collectionId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!collectionId) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      const result = await fetchCollectionDetailClient(collectionId);

      if (!isMounted) {
        return;
      }

      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        setLoading(false);
        return;
      }

      setCollection(result.collection);
      setItems(result.items);
      setLoading(false);
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [collectionId]);

  return (
    <AppShell>
      <div className="px-5 pb-10 pt-6 text-[var(--color-text-primary)]">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <header>
            <p
              className="uppercase"
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "var(--color-accent-secondary)",
              }}
            >
              My Collections
            </p>
            <h1
              className="mt-1"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 44,
                fontWeight: 300,
                color: "var(--color-text-primary)",
                lineHeight: 1.15,
              }}
            >
              {collection?.name ?? "Collection"}
            </h1>
            {collection ? (
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {collection.item_count} wine{collection.item_count === 1 ? "" : "s"}
              </p>
            ) : null}
          </header>

          {loading ? (
            <div
              className="text-center"
              style={{
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 14,
                padding: "24px 16px",
                fontSize: 12,
                color: "var(--color-text-secondary)",
              }}
            >
              Loading collection...
            </div>
          ) : errorMessage || !collectionId ? (
            <div
              style={{
                borderRadius: 14,
                border: "0.5px solid rgba(192, 57, 43, 0.3)",
                background: "rgba(192, 57, 43, 0.08)",
                padding: "24px 16px",
                fontSize: 12,
                color: "#e6a0a0",
              }}
            >
              {errorMessage ?? "Collection not found."}
            </div>
          ) : collection ? (
            <>
              <div
                className="overflow-hidden rounded-[28px] border p-4"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface-primary)",
                }}
              >
                <div
                  className="flex aspect-[1.25/1] items-center justify-center overflow-hidden rounded-[24px]"
                  style={{ background: "var(--color-surface-tinted)" }}
                >
                  {collection.cover_image_url ? (
                    <Photo
                      src={collection.cover_image_url}
                      alt={collection.name}
                      containerClassName="h-full w-full"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      No cover selected yet
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{
                      borderColor: "var(--color-border-strong)",
                      background: "var(--color-surface-tinted)",
                      color: "var(--color-accent-secondary)",
                    }}
                  >
                    {collection.item_count} wine{collection.item_count === 1 ? "" : "s"}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Updated {formatConsumedDate(collection.updated_at)}
                  </span>
                </div>
              </div>

              {items.length === 0 ? (
                <div
                  style={{
                    background: "var(--color-surface-primary)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 14,
                    padding: "32px 18px",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: 24,
                      fontWeight: 300,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Nothing saved yet
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    Add wines to this collection from Feed or the new-pour flow.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <CollectionItemCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
