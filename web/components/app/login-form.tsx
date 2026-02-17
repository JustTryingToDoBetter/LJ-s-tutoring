'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        role?: 'ADMIN' | 'TUTOR' | 'STUDENT';
        redirectTo?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? 'Unable to sign in. Please try again.');
        return;
      }

      const requestedPath = search.get('next');
      if (requestedPath && requestedPath.startsWith('/')) {
        router.replace(requestedPath);
        router.refresh();
        return;
      }

      if (payload.redirectTo?.startsWith('http://') || payload.redirectTo?.startsWith('https://')) {
        window.location.assign(payload.redirectTo);
        return;
      }

      if (payload.role === 'STUDENT') {
        router.replace('/dashboard');
      } else if (payload.role === 'TUTOR' || payload.role === 'ADMIN') {
        router.replace('/tutor/dashboard');
      } else if (payload.redirectTo?.startsWith('/')) {
        router.replace(payload.redirectTo);
      } else {
        router.replace('/dashboard');
      }

      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ody-card space-y-4" onSubmit={onSubmit}>
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="text-sm text-ody-muted">Use your existing Odysseus credentials. Session is stored in HttpOnly cookies.</p>
      {error && <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      <label className="grid gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-lg border border-ody-border bg-slate-900/50 px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-lg border border-ody-border bg-slate-900/50 px-3 py-2"
        />
      </label>
      <button className="ody-btn-primary w-full" type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
