
import { loadJson, renderList } from '/assets/common.js';
(async () => {
  const data = await loadJson('/tutor/reports').catch(() => ({ items: [] }));
  renderList(document.getElementById('tutorReportsList'), data.items || [], (item) => `
    <strong>${item.student_name || 'Student report'}</strong>
    <div>${String(item.week_start).slice(0, 10)} → ${String(item.week_end).slice(0, 10)}</div>
  `);
})();
