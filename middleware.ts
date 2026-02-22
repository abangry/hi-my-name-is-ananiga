import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWLIST = new Set<string>([
  "/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/goodbye")
  ) {
    return NextResponse.next();
  }

  // Allow common static file extensions
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff|woff2|ttf)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Allow only explicitly listed routes
  if (ALLOWLIST.has(pathname)) {
    return NextResponse.next();
  }

  // Block everything else — redirect to the goodbye page
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}

// Use the recommended regex matcher — catches ALL routes reliably
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};