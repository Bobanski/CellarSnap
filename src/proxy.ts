import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = await createSupabaseServerClient({ request, response });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isEntriesRoute = pathname.startsWith("/entries");
  const isProfileRoute = pathname.startsWith("/profile");
  const isFeedRoute = pathname.startsWith("/feed");
  const isLoginRoute = pathname.startsWith("/login");
  const isSignupRoute = pathname.startsWith("/signup");
  const isUsernameSetupBypass = pathname.startsWith("/profile");

  const isProtected = isEntriesRoute || isProfileRoute || isFeedRoute;
  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const hasUsername = Boolean(profile?.display_name?.trim());
    if (!hasUsername && !isUsernameSetupBypass) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/profile";
      redirectUrl.searchParams.set("setup", "username");
      return NextResponse.redirect(redirectUrl);
    }

    if (isLoginRoute || isSignupRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = hasUsername ? "/entries" : "/profile";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/entries/:path*", "/profile/:path*", "/login", "/signup", "/feed"],
};
