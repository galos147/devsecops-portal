import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "session_token";

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(COOKIE_NAME);
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    if (hasSession) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!hasSession) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
