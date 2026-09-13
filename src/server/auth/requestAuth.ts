import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@shared";
import { createTypedSupabaseServerClient } from "@/lib/supabase/server";
import { registerRequestPhotoClient } from "@/lib/storage/photoDelivery";
import { PHOTO_DELIVERY_HEADER, PHOTO_DELIVERY_VERSION } from "@shared/photoDelivery";

export type RequestAuthMode = "bearer" | "cookie";

export type RequestAuthOptions = {
  allowBearer?: boolean;
  allowCookieFallback?: boolean;
};

export type RequestAuthResult = {
  supabase: SupabaseClient;
  user: User;
  authMode: RequestAuthMode;
};

type RequestAuthEnv = {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
};

type RequestAuthClientLike = {
  auth: {
    getUser: () => Promise<{ data: { user: User | null } }>;
  };
};

type CreateBearerClientParams = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  bearerToken: string;
};

export type RequestAuthDependencies = {
  getEnv?: () => RequestAuthEnv;
  createBearerClient?: (params: CreateBearerClientParams) => RequestAuthClientLike;
  createCookieClient?: () => Promise<SupabaseClient>;
};

export class RequestAuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 401, code = "UNAUTHORIZED") {
    super(message);
    this.name = "RequestAuthError";
    this.status = status;
    this.code = code;
  }
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  return bearerMatch?.[1]?.trim() ?? null;
}

function getDefaultEnv(): RequestAuthEnv {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
  };
}

function createBearerClient({
  supabaseUrl,
  supabaseAnonKey,
  bearerToken,
}: CreateBearerClientParams) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
  });
}

async function resolveRequestAuth<Client extends RequestAuthClientLike>(
  request: Request,
  options: RequestAuthOptions | undefined,
  dependencies: {
    getEnv: () => RequestAuthEnv;
    createBearerClient: (params: CreateBearerClientParams) => Client;
    createCookieClient: () => Promise<Client>;
  }
): Promise<{ supabase: Client; user: User; authMode: RequestAuthMode }> {
  const allowBearer = options?.allowBearer ?? true;
  const allowCookieFallback = options?.allowCookieFallback ?? true;
  const getEnv = dependencies.getEnv;
  const buildBearerClient = dependencies.createBearerClient;
  const createCookieClient = dependencies.createCookieClient;

  if (allowBearer) {
    const bearerToken = getBearerToken(request);
    const { supabaseUrl, supabaseAnonKey } = getEnv();

    if (bearerToken && supabaseUrl && supabaseAnonKey) {
      const bearerClient = buildBearerClient({
        supabaseUrl,
        supabaseAnonKey,
        bearerToken,
      });
      const {
        data: { user },
      } = await bearerClient.auth.getUser();

      if (user) {
        if (request.headers.get(PHOTO_DELIVERY_HEADER) === PHOTO_DELIVERY_VERSION) {
          registerRequestPhotoClient(bearerClient);
        }
        return {
          supabase: bearerClient,
          user,
          authMode: "bearer",
        };
      }
    }
  }

  if (allowCookieFallback) {
    const supabase = await createCookieClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      return {
        supabase,
        user,
        authMode: "cookie",
      };
    }
  }

  throw new RequestAuthError("Unauthorized");
}

export type TypedRequestAuthResult = {
  supabase: SupabaseClient<Database>;
  user: User;
  authMode: RequestAuthMode;
};

export function requireTypedRequestAuth(
  request: Request,
  options?: RequestAuthOptions
): Promise<TypedRequestAuthResult> {
  return resolveRequestAuth(request, options, {
    getEnv: getDefaultEnv,
    createBearerClient,
    createCookieClient: createTypedSupabaseServerClient,
  });
}

// AUD-21 migration bridge: preserve legacy callers and their injectable auth mocks.
// Both entry points use the same resolver and typed runtime clients.
export async function requireRequestAuth(
  request: Request,
  options?: RequestAuthOptions,
  dependencies?: RequestAuthDependencies
): Promise<RequestAuthResult> {
  if (!dependencies) return requireTypedRequestAuth(request, options);
  const result = await resolveRequestAuth<RequestAuthClientLike>(request, options, {
    getEnv: dependencies.getEnv ?? getDefaultEnv,
    createBearerClient: dependencies.createBearerClient ?? createBearerClient,
    createCookieClient: dependencies.createCookieClient ?? createTypedSupabaseServerClient,
  });
  return { ...result, supabase: result.supabase as SupabaseClient };
}
