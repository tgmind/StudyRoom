import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Protected application routes
  const protectedRoutes = ["/room", "/leaderboard", "/goals", "/settings"];
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  if (user) {
    // If authenticated, check profile onboarding status
    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const profileData = profile as { display_name?: string } | null;
    const isProfileIncomplete = !profileData || !profileData.display_name || profileData.display_name.trim() === "";

    if (isProfileIncomplete && !isOnboardingRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    if (!isProfileIncomplete && (isAuthRoute || isOnboardingRoute || pathname === "/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/room";
      return NextResponse.redirect(url);
    }
  } else {
    // Unauthenticated access attempt to protected or onboarding routes
    if (isProtectedRoute || isOnboardingRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
