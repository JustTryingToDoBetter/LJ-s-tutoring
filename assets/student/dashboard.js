
import { loadJson, renderList, renderLoading, renderError, renderEmpty, setActiveNav, setText } from '/assets/common.js';
import { track } from '/assets/analytics.js';

setActiveNav('dashboard');

function toText(value, fallback = '') {
  if (value === null || value === undefined) {return fallback;}
  return String(value);
}

function renderSession(session) {
  const subject = document.createElement('strong');
  subject.textContent = toText(session.subject, 'Upcoming session');

  const when = document.createElement('div');
  when.textContent = `${toText(session.date)} • ${toText(session.startTime)}`.trim();

  const mode = document.createElement('div');
  mode.textContent = toText(session.mode, '');

  const wrapper = document.createElement('div');
  wrapper.className = 'list-item';
  wrapper.append(subject, when, mode);
  return wrapper;
}

function renderSnapshot(topic) {
  const title = document.createElement('strong');
  title.textContent = toText(topic.topic, 'Topic');

  const meta = document.createElement('div');
  const minutes = Number(topic.minutes || 0);
  const sessions = Number(topic.sessions || 0);
  meta.textContent = `${minutes} minutes • ${sessions} sessions`;

  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  const fill = document.createElement('span');
  const completion = Math.max(0, Math.min(100, Number(topic.completion || 0)));
  fill.style.width = `${completion}%`;
  bar.appendChild(fill);

  const wrapper = document.createElement('div');
  wrapper.className = 'list-item';
  wrapper.append(title, meta, bar);
  return wrapper;
}

(async () => {
  const upcoming = document.getElementById('upcomingSession');
  const snapshot = document.getElementById('progressSnapshot');
  renderLoading(upcoming, 'Loading your next session…');
  renderLoading(snapshot, 'Loading progress snapshot…');

  let data = null;
  try {
    data = await loadJson('/dashboard');
  } catch (_err) {
    renderError(upcoming, 'Could not load your dashboard.');
    renderError(snapshot, 'Could not load progress snapshot.');
    return;
  }

  track('dashboard.viewed', {});

  setText('#metricXp', String(data.streak?.xp ?? 0));
  setText('#metricStreak', `${data.streak?.current ?? 0} days`);
  setText('#metricMinutes', String(data.thisWeek?.minutesStudied ?? 0));
  setText('#metricSessions', String(data.thisWeek?.sessionsAttended ?? 0));
  setText('#recommendedTitle', data.recommendedNext?.title || 'Recommended next');
  setText('#recommendedDescription', data.recommendedNext?.description || 'Keep moving forward with one focused study block.');

  if (data.today?.hasUpcoming && data.today.session) {
    renderList(upcoming, [data.today.session], renderSession);
  } else {
    renderEmpty(upcoming, data.today?.emptyState?.title || 'No upcoming session.');
  }

  renderList(snapshot, data.progressSnapshot || [], renderSnapshot);
})();
