import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const password = process.env.PASSWORD;
  
  // If no password set in env, allow all access
  if (!password) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  
  // Allow access to login page and auth api
  if (url.pathname === '/login' || url.pathname === '/api/auth') {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get('site-auth');
  if (authCookie?.value === password) {
    return NextResponse.next();
  }

  // Redirect to login if unauthorized
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
