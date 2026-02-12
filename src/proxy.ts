import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithCookies({
  request,
  response,
  pathname,
  searchParams,
}: {
  request: NextRequest;
  response: NextResponse;
  pathname: string;
  searchParams?: Record<string, string>;
}) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  redirectUrl.search = "";

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      redirectUrl.searchParams.set(key, value);
    });
  }

  const redirect = NextResponse.redirect(redirectUrl);
  response.cookies.getAll().forEach((cookie) => {
    // Preserve cookie attributes (path/expires/sameSite/etc) during redirects.
    redirect.cookies.set(cookie);
  });
  return redirect;
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = await createSupabaseServerClient({ request, response });

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  let user = authUser;

  // Fresh sign-in/sign-up flows can briefly return null from getUser()
  // while the cookie state settles; fallback to session to avoid false redirects.
  if (!user) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  }

  const { pathname } = request.nextUrl;
  const isPrefetchRequest =
    request.headers.get("purpose") === "prefetch" ||
    request.headers.has("next-router-prefetch") ||
    request.headers.get("x-middleware-prefetch") === "1";
  const isEntriesRoute = pathname.startsWith("/entries");
  const isProfileRoute = pathname.startsWith("/profile");
  const isFeedRoute = pathname.startsWith("/feed");
  const isFriendsRoute = pathname.startsWith("/friends");
  const isLoginRoute = pathname.startsWith("/login");
  const isSignupRoute = pathname.startsWith("/signup");

  const isProtected =
    isEntriesRoute || isProfileRoute || isFeedRoute || isFriendsRoute;
  if (isProtected && !user) {
    // Avoid caching false redirects from speculative route prefetches.
    if (isPrefetchRequest) {
      return response;
    }
    return redirectWithCookies({
      request,
      response,
      pathname: "/login",
    });
  }

  if (user) {
    if (isLoginRoute || isSignupRoute) {
      return redirectWithCookies({
        request,
        response,
        pathname: "/",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/entries/:path*",
    "/profile/:path*",
    "/login",
    "/signup",
    "/feed",
    "/friends",
  ],
};
