"use client";
import React, { useEffect, useState } from 'react';

export default function ApprovalsClient({ initialItems }: { initialItems: any[] }) {
  const [items, setItems] = useState<any[]>(initialItems || []);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/approvals?page=${page}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      // noop
    } finally { setLoading(false); }
  }

  useEffect(() => { if (!initialItems?.length) load(); }, [page]);

  return (
    <div>
      <div className="mb-3">
        <button className="ody-btn" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
        <span className="mx-2">Page {page}</span>
        <button className="ody-btn" onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
      {loading ? <div className="panel">Loading…</div> : (
        <div className="grid gap-3">
          {items.map((it) => (
            <div key={it.id || Math.random()} className="panel">
              <div className="font-medium">{it.title || 'Approval item'}</div>
              <div className="text-ody-muted text-sm">{it.note || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
