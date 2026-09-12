import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppImage from "@/components/AppImage";
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

function shouldUseHttpForHost(host: string) {
  return (
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("192.168.") ||
    host.includes("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

async function getShareSiteUrl() {
  const configured =
    process.env.PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (configured) {
    return getConfiguredPublicSiteUrl();
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host");

  if (host) {
    const forwardedProto = requestHeaders.get("x-forwarded-proto");
    const protocol =
      forwardedProto ??
      (shouldUseHttpForHost(host) ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return getConfiguredPublicSiteUrl();
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { shareId } = await params;
  const share = await resolvePublicPostShare(shareId);
  const siteUrl = await getShareSiteUrl();
  const pageUrl = `${siteUrl}/s/${shareId}`;
  const imageUrl = `${siteUrl}/s/${shareId}/opengraph-image`;

  if (!share) {
    const title = "Link expired — Cluster";
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
        siteName: "Cluster",
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
      siteName: "Cluster",
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-screen-bg)] px-6 py-12 text-[var(--color-text-primary)]">
        <div className="w-full max-w-xl space-y-8 rounded-3xl border border-[var(--color-border)] bg-black/25 p-8 text-center backdrop-blur">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--color-accent-secondary)]/70">
              Cluster share
            </p>
            <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">Link expired</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              This share link has expired, was revoked, or is no longer available.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-[var(--color-accent-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
            >
              Sign in for more posts
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-white/40"
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
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--color-accent-secondary)]/70">
            Cluster share
          </p>
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">{displayTitle}</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Read-only shared wine post</p>
        </header>

        <article className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10">
          {share.labelImageUrl ? (
            <AppImage
              src={share.labelImageUrl}
              alt={`Wine label for ${displayTitle}`}
              className="h-64 w-full object-cover"
              loading="eager"
            />
          ) : (
            <div className="flex h-40 items-center justify-center bg-black/35 text-xs uppercase tracking-[0.3em] text-[var(--color-text-tertiary)]">
              No label image
            </div>
          )}

          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              {/* Decision 1 (overhaul-plan): a public share/OG surface never
                  shows the raw 1-100 rating — a warm band + match-% stand in. */}
              {share.ratingBandLabel ? (
                <span className="rounded-full border border-[var(--color-accent-secondary)]/40 bg-[var(--color-accent-primary)]/10 px-3 py-1 text-sm font-semibold text-[var(--color-accent-secondary)]">
                  {share.ratingBandLabel}
                </span>
              ) : (
                <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-sm text-[var(--color-text-secondary)]">
                  Not rated yet
                </span>
              )}
              {typeof share.matchScore === "number" ? (
                <span className="rounded-full border border-[var(--color-accent-gold)]/40 bg-[var(--color-accent-gold)]/10 px-3 py-1 text-sm font-semibold text-[var(--color-accent-gold)]">
                  {share.matchScore}% match to their palate
                </span>
              ) : null}
              <span className="text-sm text-[var(--color-text-tertiary)]">
                Consumed {formatConsumedDate(share.consumedAt)}
              </span>
            </div>

            {share.producer ? (
              <p className="text-sm text-[var(--color-text-primary)]">{share.producer}</p>
            ) : null}

            {share.notes ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Notes</p>
                <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">{share.notes}</p>
              </div>
            ) : null}

            {detailFields.length > 0 ? (
              <div className="grid gap-3 text-sm text-[var(--color-text-secondary)] sm:grid-cols-2">
                {detailFields.map((field) => (
                  <p key={field.label}>
                    <span className="text-[var(--color-text-tertiary)]">{field.label}:</span>{" "}
                    {field.value}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <section className="rounded-2xl border border-[var(--color-border)] bg-black/25 p-5 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Want to see more tasting details and posts on Cluster?
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-[var(--color-accent-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
            >
              Sign in for more posts
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-white/40"
            >
              Create account
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
