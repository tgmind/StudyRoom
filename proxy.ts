import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Turbopack recompile trigger
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest)
     * - sw.js (Service Worker)
     * - icons/ (PWA icons)
     * - offline.html (Offline page)
     * - api/ (API routes)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|offline.html|api/).*)",
  ],
};
