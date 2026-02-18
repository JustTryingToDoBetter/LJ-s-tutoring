import Link from 'next/link';
import type { Route } from 'next';
import { Bell, BookOpen, Compass, Gauge, LayoutDashboard, UserCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

type NavItem = { href: string; label: string; icon: ReactNode };

export function AppShell({
  children,
  title,
  nav,
}: {
  children: ReactNode;
  title: string;
  nav: NavItem[];
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[84px_1fr]">
      <aside className="fixed inset-x-0 bottom-0 z-50 border-t border-ody-border/60 bg-ody-surface/95 p-2 backdrop-blur md:static md:inset-auto md:h-screen md:border-r md:border-t-0 md:p-3">
        <div className="hidden items-center justify-center md:flex">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-ody-gradient text-black font-bold">PO</div>
        </div>
        <nav className="mx-auto flex max-w-xl items-center justify-around gap-2 md:mt-6 md:flex-col md:justify-start">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-label={item.label}
              className="inline-flex h-12 w-14 flex-col items-center justify-center rounded-xl border border-transparent bg-slate-800/30 text-xs text-ody-muted transition hover:border-ody-border hover:text-ody-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ody-blue focus-visible:ring-offset-2 focus-visible:ring-offset-ody-bg md:h-12 md:w-12"
            >
              {item.icon}
              <span className="mt-1 md:hidden">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="pb-24 md:pb-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ody-muted">Academic OS</p>
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 rounded-lg border border-ody-border/70 bg-slate-800/40 px-3 py-2 text-sm text-ody-muted lg:flex">
              <span className="sr-only">Search</span>
              <input
                aria-label="Search workspace"
                placeholder="Search"
                className="w-40 bg-transparent text-sm text-ody-text placeholder:text-ody-muted focus-visible:outline-none"
              />
            </label>
            <button className="h-9 w-9 rounded-lg border border-ody-border/70 bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ody-blue focus-visible:ring-offset-2 focus-visible:ring-offset-ody-bg" aria-label="Notifications">
              <Bell className="mx-auto h-4 w-4" />
            </button>
            <button className="h-9 w-9 rounded-lg border border-ody-border/70 bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ody-blue focus-visible:ring-offset-2 focus-visible:ring-offset-ody-bg" aria-label="Profile">
              <UserCircle2 className="mx-auto h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl gap-4 px-4 md:px-6">{children}</div>
      </main>
    </div>
  );
}

export const studentNav = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className='h-4 w-4' /> },
  { href: '/reports', label: 'Reports', icon: <BookOpen className='h-4 w-4' /> },
  { href: '/community', label: 'Community', icon: <Compass className='h-4 w-4' /> },
  { href: '/vault', label: 'Vault', icon: <Gauge className='h-4 w-4' /> },
];

export const tutorNav = [
  { href: '/tutor/dashboard', label: 'Dashboard', icon: <LayoutDashboard className='h-4 w-4' /> },
  { href: '/tutor/reports', label: 'Reports', icon: <BookOpen className='h-4 w-4' /> },
  { href: '/community', label: 'Community', icon: <Compass className='h-4 w-4' /> },
  { href: '/tutor/risk', label: 'Risk', icon: <Gauge className='h-4 w-4' /> },
];

export const adminNav = [
  { href: '/admin', label: 'Overview', icon: <LayoutDashboard className='h-4 w-4' /> },
  { href: '/admin/students', label: 'Students', icon: <BookOpen className='h-4 w-4' /> },
  { href: '/admin/tutors', label: 'Tutors', icon: <Compass className='h-4 w-4' /> },
  { href: '/admin/payroll', label: 'Payroll', icon: <Gauge className='h-4 w-4' /> },
];
