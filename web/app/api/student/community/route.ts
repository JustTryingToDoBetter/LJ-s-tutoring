import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.userId || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    const cookieHeader = request.headers.get('cookie') || '';
    const res = await fetch(`${process.env.API_BASE_URL}/student/community`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'failed to fetch' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'failed to fetch' }, { status: 500 });
  }
}
