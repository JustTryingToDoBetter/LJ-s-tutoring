"use client";
import React, { useEffect, useMemo, useState } from 'react';

type Tutor = {
  id: string;
  full_name?: string;
  email?: string;
  active?: boolean;
  default_hourly_rate?: number | string;
  status?: string;
  qualified_subjects_json?: string | string[];
};

export default function TutorsClient({ initialTutors }: { initialTutors: Tutor[] }) {
  const [tutors, setTutors] = useState<Tutor[]>(initialTutors || []);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // keep initial tutors; further interactions will call server endpoints
  }, []);

  const normalizeSubjects = (raw: any) => {
    if (!raw) return [] as string[];
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === 'string') {
      try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [] as string[];
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tutors.filter((t) => {
      const subjects = normalizeSubjects(t.qualified_subjects_json).join(' ').toLowerCase();
      const matchesQuery = !q || (t.full_name || '').toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q) || subjects.includes(q);
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? t.active : !t.active);
      return matchesQuery && matchesStatus;
    });
  }, [tutors, query, statusFilter]);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/tutors');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setTutors(Array.isArray(data.tutors) ? data.tutors : []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load tutors');
    } finally { setLoading(false); }
  }

  useEffect(() => { if (!initialTutors?.length) { reload(); } }, []);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input aria-label="Search tutors" placeholder="Search by tutor, email, or subject" value={query} onChange={(e) => setQuery(e.target.value)} className="input" />
        <select aria-label="Filter tutors" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="input">
          <option value="all">All tutors</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="ody-btn" onClick={reload} disabled={loading}>{loading ? 'Reloading…' : 'Reload'}</button>
      </div>

      {error && <div className="form-feedback error">{error}</div>}

      {!filtered.length ? (
        <div className="panel">No tutors match</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => (
            <div key={t.id} className="panel">
              <div className="font-medium">{t.full_name || '—'} <span className="text-ody-muted">({t.email || 'no email'})</span></div>
              <div className="text-ody-muted text-sm">{Array.isArray(t.qualified_subjects_json) ? t.qualified_subjects_json.join(', ') : (typeof t.qualified_subjects_json === 'string' ? t.qualified_subjects_json : '')}</div>
              <div className="mt-2 flex gap-2">
                <button className="button secondary" onClick={async () => {
                  try {
                    const res = await fetch('/api/admin/impersonate/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tutorId: t.id }) });
                    if (!res.ok) throw new Error('impersonate failed');
                    const body = await res.json();
                    // navigate to tutor area as impersonation handled by API response
                    window.location.href = '/tutor';
                  } catch (e) { alert('Unable to impersonate'); }
                }}>View as tutor (read-only)</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
