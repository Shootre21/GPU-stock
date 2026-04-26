import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const adminKey = process.env.CRM_ADMIN_KEY;
  if (!adminKey) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/webhooks/resend')) {
    return NextResponse.next();
  }

  const header = request.headers.get('x-crm-admin-key');
  const bearer = request.headers.get('authorization');

  if (header === adminKey || bearer === `Bearer ${adminKey}`) {
    return NextResponse.next();
  }

  return new NextResponse('Unauthorized', { status: 401 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
