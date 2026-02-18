"use client";
import React, { useEffect, useState } from 'react';

export default function PayrollClient({ initialItems }: { initialItems: any[] }) {
  const [items, setItems] = useState<any[]>(initialItems || []);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/payroll');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      // noop
    } finally { setLoading(false); }
  }

  useEffect(() => { if (!initialItems?.length) reload(); }, []);

  return (
    <div>
      <div className="mb-3">
        <button className="ody-btn" onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
      </div>
      <div className="grid gap-3">
        {items.map((it) => (
          <div key={it.id || Math.random()} className="panel">
            <div className="font-medium">{it.description || 'Payroll run'}</div>
            <div className="text-ody-muted text-sm">{it.status || ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
