import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { resolvePublicPostShare } from "@/lib/shares";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SharePageProps = {
  params: Promise<{ shareId: string }>;
};

function normalizeFieldValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { shareId } = await params;
  const share = await resolvePublicPostShare(shareId);
  const siteUrl = getConfiguredPublicSiteUrl();
  const pageUrl = `${siteUrl}/s/${shareId}`;
  const imageUrl = `${siteUrl}/s/${shareId}/opengraph-image`;

  if (!share) {
    const title = "Link expired — CellarSnap";
    const description = "This share link is no longer available.";

    return {
      title,
      description,
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        title,
        description,
        url: pageUrl,
        siteName: "CellarSnap",
        images: [
          {
            url: imageUrl,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [imageUrl],
      },
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: share.metadataTitle,
    description: share.metadataDescription,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "article",
      title: share.metadataTitle,
      description: share.metadataDescription,
      url: pageUrl,
      siteName: "CellarSnap",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: share.metadataTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: share.metadataTitle,
      description: share.metadataDescription,
      images: [imageUrl],
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { shareId } = await params;
  const share = await resolvePublicPostShare(shareId);

  if (!share) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0a09] px-6 py-12 text-zinc-100">
        <div className="w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-black/25 p-8 text-center backdrop-blur">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-300/70">
              CellarSnap share
            </p>
            <h1 className="text-3xl font-semibold text-zinc-50">Link expired</h1>
            <p className="text-sm text-zinc-300">
              This share link has expired, was revoked, or is no longer available.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              Sign in for more posts
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/40"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: allowedEntry, error: allowedEntryError } = await supabase
      .from("wine_entries")
      .select("id")
      .eq("id", share.postId)
      .maybeSingle();

    if (!allowedEntryError && allowedEntry?.id) {
      redirect(`/entries/${allowedEntry.id}?from=share`);
    }
  }

  const wineName = share.wineName?.trim() || "Untitled wine";
  const vintage = share.vintage?.trim();
  const displayTitle = vintage ? `${wineName} (${vintage})` : wineName;
  const detailFields = [
    { label: "Country", value: normalizeFieldValue(share.country) },
    { label: "Region", value: normalizeFieldValue(share.region) },
    { label: "Appellation", value: normalizeFieldValue(share.appellation) },
    {
      label: "Grapes",
      value:
        share.primaryGrapes.length > 0
          ? share.primaryGrapes.join(", ")
          : null,
    },
    { label: "QPR", value: normalizeFieldValue(share.qprLabel) },
  ]
    .filter(
      (field): field is { label: string; value: string } => field.value !== null
    )
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/70">
            CellarSnap share
          </p>
          <h1 className="text-3xl font-semibold text-zinc-50">{displayTitle}</h1>
          <p className="text-sm text-zinc-300">Read-only shared wine post</p>
        </header>

        <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          {share.labelImageUrl ? (
            <img
              src={share.labelImageUrl}
              alt={`Wine label for ${displayTitle}`}
              className="h-64 w-full object-cover"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="flex h-40 items-center justify-center bg-black/35 text-xs uppercase tracking-[0.3em] text-zinc-500">
              No label image
            </div>
          )}

          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              {typeof share.rating === "number" ? (
                <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-sm font-semibold text-amber-100">
                  Rating {share.rating}/100
                </span>
              ) : (
                <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-zinc-300">
                  No rating
                </span>
              )}
              <span className="text-sm text-zinc-400">
                Consumed {formatConsumedDate(share.consumedAt)}
              </span>
            </div>

            {share.producer ? (
              <p className="text-sm text-zinc-200">{share.producer}</p>
            ) : null}

            {share.notes ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Notes</p>
                <p className="text-sm leading-relaxed text-zinc-200">{share.notes}</p>
              </div>
            ) : null}

            {detailFields.length > 0 ? (
              <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                {detailFields.map((field) => (
                  <p key={field.label}>
                    <span className="text-zinc-500">{field.label}:</span>{" "}
                    {field.value}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <section className="rounded-2xl border border-white/10 bg-black/25 p-5 text-center">
          <p className="text-sm text-zinc-300">
            Want to see more tasting details and posts on CellarSnap?
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              Sign in for more posts
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/40"
            >
              Create account
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
