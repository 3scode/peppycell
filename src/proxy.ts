import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

const PUBLIC_ROUTES = ["/login", "/auth/confirm", "/api/health", "/403"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!isSupabaseConfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: "Supabase belum dikonfigurasi.",
          },
          meta: null,
        },
        { status: 503 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Autentikasi Supabase: cek cookie sesi; role divalidasi di server
  // (requireRole/requireApiRole) memakai profil public.users.
  const hasSession = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." },
          meta: null,
        },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
