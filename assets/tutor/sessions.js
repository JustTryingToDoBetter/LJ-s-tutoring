
import { loadJson, renderList } from '/assets/common.js';
(async () => {
  const data = await loadJson('/tutor/sessions').catch(() => ({ sessions: [] }));
  renderList(document.getElementById('tutorSessionsList'), data.sessions || [], (item) => `
    <strong>${item.student_name || item.studentName || 'Student'}</strong>
    <div>${item.date} • ${item.start_time || item.startTime || ''} ${item.end_time || item.endTime || ''}</div>
    <div>Status: ${item.status}</div>
  `);
})();
