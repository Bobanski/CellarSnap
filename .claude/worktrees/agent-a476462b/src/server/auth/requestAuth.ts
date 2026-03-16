import { createClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RequestAuthMode = "bearer" | "cookie";

export type RequestAuthOptions = {
  allowBearer?: boolean;
  allowCookieFallback?: boolean;
};

export type RequestAuthResult = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
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
  createCookieClient?: () => Promise<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
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
}: CreateBearerClientParams): RequestAuthClientLike {
  return createClient(supabaseUrl, supabaseAnonKey, {
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
  }) as unknown as RequestAuthClientLike;
}

export async function requireRequestAuth(
  request: Request,
  options?: RequestAuthOptions,
  dependencies?: RequestAuthDependencies
): Promise<RequestAuthResult> {
  const allowBearer = options?.allowBearer ?? true;
  const allowCookieFallback = options?.allowCookieFallback ?? true;
  const getEnv = dependencies?.getEnv ?? getDefaultEnv;
  const buildBearerClient = dependencies?.createBearerClient ?? createBearerClient;
  const createCookieClient = dependencies?.createCookieClient ?? createSupabaseServerClient;

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
        return {
          supabase: bearerClient as unknown as Awaited<
            ReturnType<typeof createSupabaseServerClient>
          >,
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
