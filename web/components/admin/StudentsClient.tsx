"use client";
import React, { useEffect, useMemo, useState } from 'react';

type Student = {
  id: string;
  full_name?: string;
  guardian_name?: string;
  grade?: string;
  active?: boolean;
};

export default function StudentsClient({ initialStudents }: { initialStudents: Student[] }) {
  const [students, setStudents] = useState<Student[]>(initialStudents || []);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | null; text?: string }>({ type: null });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      const matches = !q || (s.full_name || '').toLowerCase().includes(q) || (s.guardian_name || '').toLowerCase().includes(q);
      const statusMatch = statusFilter === 'all' || (statusFilter === 'active' ? s.active : !s.active);
      return matches && statusMatch;
    });
  }, [students, query, statusFilter]);

  async function reload() {
    setLoading(true);
    setFeedback({ type: null });
    try {
      const res = await fetch('/api/admin/students');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setStudents(Array.isArray(data.students) ? data.students : []);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Unable to load students' });
    } finally { setLoading(false); }
  }

  useEffect(() => { if (!initialStudents?.length) { reload(); } }, []);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input aria-label="Search students" placeholder="Search by student or guardian" value={query} onChange={(e) => setQuery(e.target.value)} className="input" />
        <select aria-label="Filter students" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="input">
          <option value="all">All students</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="ody-btn" onClick={reload} disabled={loading}>{loading ? 'Reloading…' : 'Reload'}</button>
      </div>

      {feedback.type === 'error' && <div className="form-feedback error">{feedback.text}</div>}

      {!filtered.length ? (
        <div className="panel">No students found</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="panel">
              <div className="font-medium">{s.full_name || '—'} <span className="text-ody-muted">({s.grade || 'N/A'})</span></div>
              <div className="text-ody-muted text-sm">{s.guardian_name || 'No guardian'} • {s.active ? 'Active' : 'Inactive'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
