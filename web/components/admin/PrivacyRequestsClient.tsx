"use client";
import React, { useEffect, useState } from 'react';

export default function PrivacyRequestsClient({ initialItems }: { initialItems: any[] }) {
  const [items, setItems] = useState<any[]>(initialItems || []);

  async function reload() {
    try {
      const res = await fetch('/api/admin/privacy-requests');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {}
  }

  useEffect(() => { if (!initialItems?.length) reload(); }, []);

  return (
    <div>
      <div className="mb-3">
        <button className="ody-btn" onClick={reload}>Reload</button>
      </div>
      <div className="grid gap-3">
        {items.map((it) => (
          <div key={it.id || Math.random()} className="panel">
            <div className="font-medium">{it.type || 'Request'}</div>
            <div className="text-ody-muted text-sm">{it.email || it.detail || ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
