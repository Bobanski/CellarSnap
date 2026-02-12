type RateLimitBucket = {
  timestamps: number[];
};

type RateLimitStore = Map<string, RateLimitBucket>;

type RateLimitResult = {
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

declare global {
  var __cellarsnapRateLimitStore__: RateLimitStore | undefined;
}

const rateLimitStore: RateLimitStore =
  globalThis.__cellarsnapRateLimitStore__ ??
  (globalThis.__cellarsnapRateLimitStore__ = new Map());

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

export function applyRateLimit({
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
