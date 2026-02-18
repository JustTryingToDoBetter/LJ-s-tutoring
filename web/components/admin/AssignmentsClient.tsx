"use client";
import React, { useEffect, useState } from 'react';

export default function AssignmentsClient({ initialAssignments }: { initialAssignments: any[] }) {
  const [assignments, setAssignments] = useState(initialAssignments || []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [tutors, setTutors] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  useEffect(() => { if (!assignments?.length) load(); loadLookups(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/assignments');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
    } catch (e) {
      // ignore for now
    } finally { setLoading(false); }
  }

  async function loadLookups() {
    try {
      const [tres, sres] = await Promise.all([fetch('/api/admin/tutors'), fetch('/api/admin/students')]);
      if (tres.ok) setTutors((await tres.json()).tutors || []);
      if (sres.ok) setStudents((await sres.json()).students || []);
    } catch (e) {}
  }

  const filtered = assignments.filter((a: any) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [a.subject, a.student_name, a.tutor_name].filter(Boolean).some((v: any) => String(v).toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input placeholder="Search assignment by student, tutor, or subject" value={query} onChange={(e) => setQuery(e.target.value)} className="input" />
        <button className="ody-btn" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
      </div>

      <div className="grid gap-3">
        {filtered.map((a: any) => (
          <div key={a.id} className="panel">
            <div className="font-medium">{a.subject} • {a.student_name}</div>
            <div className="text-ody-muted">Tutor: {a.tutor_name} • {a.start_date} → {a.end_date || 'open-ended'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
