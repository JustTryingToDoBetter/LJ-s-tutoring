import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.userId || session.user.role !== 'TUTOR') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    const cookieHeader = request.headers.get('cookie') || '';
    const today = new Date().toISOString().slice(0, 10);

    const [meRes, sessionRes] = await Promise.all([
      fetch(`${process.env.API_BASE_URL}/tutor/me`, {
        method: 'GET',
        headers: { cookie: cookieHeader },
      }),
      fetch(`${process.env.API_BASE_URL}/tutor/sessions?from=${today}&to=${today}`, {
        method: 'GET',
        headers: { cookie: cookieHeader },
      }),
    ]);

    const me = await meRes.json();
    const sessions = await sessionRes.json();

    return NextResponse.json({ me, todaySessions: sessions.sessions || [] });
  } catch {
    return NextResponse.json({ error: 'failed to fetch' }, { status: 500 });
  }
}
