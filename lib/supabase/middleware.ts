import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "sa@admin.tg").toLowerCase();
  const adminUid = (process.env.NEXT_PUBLIC_ADMIN_USER_ID || "8076296e-134a-4036-b8ed-1a9c6ff26ec1").toLowerCase();

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

  // Protected application routes (regular users)
  const protectedRoutes = ["/room", "/leaderboard", "/goals", "/history", "/settings", "/guide"];
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAdminRoute = pathname.startsWith("/admin");
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  if (user) {
    const userEmail = (user.email || "").toLowerCase();
    const isAdmin =
      userEmail === adminEmail ||
      userEmail === "sa@admin.tg" ||
      user.id === adminUid ||
      user.id === "f8d95817-f042-4e61-89e4-bb97679f8a48";

    if (isAdmin) {
      // Admin user: redirect to /admin from ANY other route (including /login, /room, /)
      if (!isAdminRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // Non-admin user: block access to /admin
    if (isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/room";
      return NextResponse.redirect(url);
    }

    // Regular user flow: check profile onboarding status
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
    // Unauthenticated access attempt to protected, admin, or onboarding routes
    if (isProtectedRoute || isOnboardingRoute || isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
