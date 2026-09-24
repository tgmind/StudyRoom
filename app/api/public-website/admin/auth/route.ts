import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { isMatchingAdminKey, DEFAULT_PUBLIC_ADMIN_KEY } from "@/lib/public-website/authUtils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, email } = body;

    let isAuthorized = false;

    // Check direct admin key
    if (key && isMatchingAdminKey(String(key))) {
      isAuthorized = true;
    }

    // Check platform admin email
    if (!isAuthorized && email && isAdminEmail(String(email).trim())) {
      isAuthorized = true;
    }

    // Check active Supabase session
    if (!isAuthorized) {
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && isAdminEmail(user.email)) {
          isAuthorized = true;
        }
      } catch {
        // ignore
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Invalid admin key or unauthorized email." }, { status: 401 });
    }

    const token = key?.trim() || DEFAULT_PUBLIC_ADMIN_KEY;
    const response = NextResponse.json({
      success: true,
      token,
      message: "Admin authentication successful.",
    });

    response.cookies.set("public_site_admin_auth", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Authentication error" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, message: "Logged out" });
  response.cookies.delete("public_site_admin_auth");
  return response;
}
