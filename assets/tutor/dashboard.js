import { loadJson, renderList, renderEmpty, setActiveNav, setText } from '/assets/common.js';

setActiveNav('dashboard');

function toText(value, fallback = '') {
  if (value === null || value === undefined) {return fallback;}
  return String(value);
}

function renderTodaySession(item) {
  const title = document.createElement('strong');
  title.textContent = `${toText(item.time, 'Time TBC')} - ${toText(item.studentName, 'Student')}`;

  const status = document.createElement('div');
  status.textContent = `Status: ${toText(item.status, 'scheduled')}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'list-item';
  wrapper.append(title, status);
  return wrapper;
}

function renderAttentionItem(item) {
  const title = document.createElement('strong');
  title.textContent = toText(item.studentName, 'Student');

  const scores = document.createElement('div');
  scores.textContent = `Risk: ${toText(item.riskScore, '-')} - Momentum: ${toText(item.momentumScore, '-')}`;

  const reasons = document.createElement('div');
  reasons.textContent = Array.isArray(item.reasons) && item.reasons.length
    ? item.reasons.join(' - ')
    : 'No reasons listed yet.';

  const wrapper = document.createElement('div');
  wrapper.className = 'list-item';
  wrapper.append(title, scores, reasons);
  return wrapper;
}

function renderQuickTools(target, tools) {
  target.innerHTML = '';
  if (!tools.length) {
    renderEmpty(target, 'No quick tools available yet.');
    return;
  }

  tools.forEach((tool) => {
    const a = document.createElement('a');
    a.className = 'list-item';
    a.href = toText(tool.href, '#');
    const label = document.createElement('strong');
    label.textContent = toText(tool.label, 'Open tool');
    const hint = document.createElement('div');
    hint.textContent = 'Open workspace';
    a.append(label, hint);
    target.appendChild(a);
  });
}

(async () => {
  const data = await loadJson('/tutor/dashboard').catch(() => ({
    todaySessions: [],
    studentsNeedingAttention: [],
    quickTools: [],
  }));

  const todaySessions = data.todaySessions || [];
  const attention = data.studentsNeedingAttention || [];
  const quickTools = data.quickTools || [];

  setText('#tutorMetricSessions', String(todaySessions.length));
  setText('#tutorMetricAttention', String(attention.length));
  setText('#tutorMetricTools', String(quickTools.length));

  renderList(document.getElementById('tutorTodaySessions'), todaySessions, renderTodaySession);
  renderQuickTools(document.getElementById('tutorQuickTools'), quickTools);
  renderList(document.getElementById('tutorAttentionList'), attention, renderAttentionItem);
})();
