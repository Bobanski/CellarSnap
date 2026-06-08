import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RateLimitBucket = {
  timestamps: number[];
};

type RateLimitStore = Map<string, RateLimitBucket>;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type ApplyRateLimitParams = {
  request: Request;
  routeKey: string;
  windowMs: number;
  maxRequests: number;
  userId?: string | null;
};

type DistributedRateLimitRow = {
  allowed: boolean;
  limit_count: number;
  remaining_count: number;
  reset_at: string;
  retry_after_seconds: number;
};

declare global {
  var __cellarsnapRateLimitStore__: RateLimitStore | undefined;
}

const rateLimitStore: RateLimitStore =
  globalThis.__cellarsnapRateLimitStore__ ??
  (globalThis.__cellarsnapRateLimitStore__ = new Map());

let warnedAboutDistributedRateLimit = false;

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function getRateLimitSubject({
  request,
  userId,
}: {
  request: Request;
  userId?: string | null;
}) {
  if (userId) {
    return `user:${userId}`;
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const normalizedUserAgent = userAgent.slice(0, 120);
  return `ip:${ip}|ua:${normalizedUserAgent}`;
}

function cleanupStore(now: number) {
  // Keep cleanup cheap: only run when store is moderately sized.
  if (rateLimitStore.size < 500) {
    return;
  }

  for (const [key, bucket] of rateLimitStore) {
    const fresh = bucket.timestamps.filter((ts) => now - ts < 60 * 60 * 1000);
    if (fresh.length === 0) {
      rateLimitStore.delete(key);
    } else {
      bucket.timestamps = fresh;
    }
  }
}

function applyMemoryRateLimit({
  request,
  routeKey,
  windowMs,
  maxRequests,
  userId,
}: ApplyRateLimitParams): RateLimitResult {
  const now = Date.now();
  cleanupStore(now);

  const subject = getRateLimitSubject({ request, userId });
  const key = `${routeKey}|${subject}`;
  const bucket = rateLimitStore.get(key) ?? { timestamps: [] };
  const freshTimestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (freshTimestamps.length >= maxRequests) {
    const oldest = freshTimestamps[0] ?? now;
    const resetAt = oldest + windowMs;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((resetAt - now) / 1000)
    );

    rateLimitStore.set(key, { timestamps: freshTimestamps });
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    };
  }

  freshTimestamps.push(now);
  rateLimitStore.set(key, { timestamps: freshTimestamps });

  const oldest = freshTimestamps[0] ?? now;
  const resetAt = oldest + windowMs;
  return {
    allowed: true,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - freshTimestamps.length),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

function shouldUseDistributedRateLimit() {
  if (process.env.CELLARSNAP_RATE_LIMIT_BACKEND === "memory") {
    return false;
  }

  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE)
  );
}

async function applyDistributedRateLimit({
  request,
  routeKey,
  windowMs,
  maxRequests,
  userId,
}: ApplyRateLimitParams): Promise<RateLimitResult | null> {
  if (!shouldUseDistributedRateLimit()) {
    return null;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const subject = getRateLimitSubject({ request, userId });
    const { data, error } = await supabase.rpc("consume_api_rate_limit", {
      p_route_key: routeKey,
      p_subject: subject,
      p_window_seconds: Math.ceil(windowMs / 1000),
      p_max_requests: maxRequests,
    });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data)
      ? (data[0] as DistributedRateLimitRow | undefined)
      : (data as DistributedRateLimitRow | null);

    if (!row) {
      throw new Error("consume_api_rate_limit returned no data.");
    }

    return {
      allowed: row.allowed,
      limit: row.limit_count,
      remaining: row.remaining_count,
      resetAt: new Date(row.reset_at).getTime(),
      retryAfterSeconds: row.retry_after_seconds,
    };
  } catch (error) {
    if (!warnedAboutDistributedRateLimit) {
      warnedAboutDistributedRateLimit = true;
      console.warn(
        "Falling back to in-memory rate limiting. Apply supabase/sql/093_api_rate_limits.sql to enable shared buckets.",
        error
      );
    }
    return null;
  }
}

export async function applyRateLimit(
  params: ApplyRateLimitParams
): Promise<RateLimitResult> {
  const distributedResult = await applyDistributedRateLimit(params);
  return distributedResult ?? applyMemoryRateLimit(params);
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}
