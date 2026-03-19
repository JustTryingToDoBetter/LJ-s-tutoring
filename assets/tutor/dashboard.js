
import { loadJson, renderList, setActiveNav } from '/assets/common.js';
setActiveNav('dashboard');
(async () => {
  const data = await loadJson('/tutor/dashboard').catch(() => ({ todaySessions: [], studentsNeedingAttention: [], quickTools: [] }));
  renderList(document.getElementById('tutorTodaySessions'), data.todaySessions || [], (item) => `
    <strong>${item.time} • ${item.studentName}</strong>
    <div>Status: ${item.status}</div>
  `);
  const quickTools = document.getElementById('tutorQuickTools');
  quickTools.innerHTML = '';
  (data.quickTools || []).forEach((tool) => {
    const a = document.createElement('a');
    a.href = tool.href;
    a.textContent = tool.label;
    quickTools.appendChild(a);
  });
  renderList(document.getElementById('tutorAttentionList'), data.studentsNeedingAttention || [], (item) => `
    <strong>${item.studentName}</strong>
    <div>Risk: ${item.riskScore ?? '—'} • Momentum: ${item.momentumScore ?? '—'}</div>
    <div>${(item.reasons || []).join(' • ')}</div>
  `);
})();
