import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWLIST = new Set<string>([
  "/", // your goodbye page
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next internals & static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/goodbye") // ✅ allow API routes

  ) {
    return NextResponse.next();
  }

  // Allow common static file extensions anywhere
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Allow only the allowlist routes
  if (ALLOWLIST.has(pathname)) {
    return NextResponse.next();
  }

  // Block everything else -> redirect to homepage goodbye message
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = ""; // optional: strip query params
  return NextResponse.redirect(url);
}

// Run middleware on everything
export const config = {
  matcher: "/:path*",
};