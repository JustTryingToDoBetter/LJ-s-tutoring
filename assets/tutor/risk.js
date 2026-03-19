
import { loadJson, renderList, setActiveNav } from '/assets/common.js';
setActiveNav('risk');
(async () => {
  const data = await loadJson('/tutor/scores?page=1&pageSize=25').catch(() => ({ items: [] }));
  renderList(document.getElementById('tutorRiskList'), data.items || [], (item) => `
    <strong>${item.studentName || item.student_name || 'Student'}</strong>
    <div>Risk: ${item.riskScore ?? item.risk_score ?? '—'} • Momentum: ${item.momentumScore ?? item.momentum_score ?? '—'}</div>
    <div>${((item.reasons || item.modelReasons || []).map((reason) => reason.label || reason.detail || reason).join(' • '))}</div>
  `);
})();
