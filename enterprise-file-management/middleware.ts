
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/token';

// Paths that don't require authentication
const publicPaths = ['/login', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout', '/api/auth/register', '/api/seed'];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check for Access Token in Headers (Authorization: Bearer <token>)
    const authHeader = request.headers.get('Authorization');
    let token = authHeader?.split(' ')[1];

    // Fallback to cookie
    if (!token) {
        token = request.cookies.get('accessToken')?.value;
    }

    // Redirect authenticated users away from login page
    if (pathname === '/login' && token) {
        const payload = await verifyToken(token);
        if (payload) {
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    if (publicPaths.some(path => pathname.startsWith(path))) {
        return NextResponse.next();
    }

    if (!token) {
        // If it's an API route, return 401
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // If it's a page, redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = await verifyToken(token);

    if (!payload) {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Invalid Token' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Token is valid, proceed
    // We can also pass user info via headers if needed, but Next.js limits this.
    const response = NextResponse.next();
    response.headers.set('x-user-id', payload.id as string);
    response.headers.set('x-user-role', payload.role as string);
    response.headers.set('x-user-tenant', payload.tenantId as string);

    return response;
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
