
import { loadJson, renderList } from '/assets/common.js';
(async () => {
  const data = await loadJson('/tutor/assignments').catch(() => ({ assignments: [] }));
  renderList(document.getElementById('tutorAssignmentsList'), data.assignments || [], (item) => `
    <strong>${item.subject}</strong>
    <div>${item.full_name || item.studentName || 'Student'}</div>
    <div>${item.start_date || item.startDate} → ${item.end_date || item.endDate || 'Open-ended'}</div>
  `);
})();
