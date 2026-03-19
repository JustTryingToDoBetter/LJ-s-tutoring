
import { loadJson, renderList, setActiveNav } from '/assets/common.js';
setActiveNav('reports');
(async () => {
  const data = await loadJson('/reports').catch(() => ({ items: [] }));
  renderList(document.getElementById('studentReportsList'), data.items || [], (item) => `
    <strong>${item.student_name || 'Report'}</strong>
    <div>${String(item.week_start).slice(0, 10)} → ${String(item.week_end).slice(0, 10)}</div>
    <div>Created: ${new Date(item.created_at).toLocaleString()}</div>
  `);
})();
