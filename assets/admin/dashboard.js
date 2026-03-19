
import { loadJson, renderList } from '/assets/common.js';
(async () => {
  const data = await loadJson('/admin/dashboard').catch(() => null);
  if (!data) {
    return;
  }
  document.getElementById('adminTutors').textContent = String(data.tutors ?? 0);
  document.getElementById('adminStudents').textContent = String(data.students ?? 0);
  renderList(document.getElementById('adminSessions'), data.sessions || [], (row) => `
    <strong>${row.status}</strong>
    <div>${row.count} session(s)</div>
  `);
})();
