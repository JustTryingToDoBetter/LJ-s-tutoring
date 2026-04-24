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
  when.textContent = `${toText(session.date)} - ${toText(session.startTime)}`.trim();

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
  meta.textContent = `${minutes} minutes - ${sessions} sessions`;

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

function updateTodayDate() {
  const target = document.getElementById('todayDate');
  const greeting = document.getElementById('todayGreeting');
  if (!target) {return;}

  const now = new Date();
  target.textContent = now.toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (greeting) {
    const hour = now.getHours();
    greeting.textContent = hour < 12
      ? 'Good morning'
      : hour < 18
        ? 'Good afternoon'
        : 'Good evening';
  }
}

function setupReflection() {
  const input = document.getElementById('reflectionInput');
  const save = document.getElementById('saveReflection');
  if (!input) {return;}

  const key = 'po_student_reflection';
  try {
    input.value = localStorage.getItem(key) || '';
  } catch {
    input.value = '';
  }

  const persist = () => {
    try {
      localStorage.setItem(key, input.value);
    } catch {
      /* local storage may be unavailable */
    }
  };

  input.addEventListener('input', persist);
  save?.addEventListener('click', persist);
}

function updateWeeklyRhythm(data) {
  const label = document.getElementById('weeklyRhythmLabel');
  const bar = document.getElementById('weeklyRhythmBar');
  const minutes = Number(data.thisWeek?.minutesStudied ?? 0);
  const sessions = Number(data.thisWeek?.sessionsAttended ?? 0);
  const progress = Math.max(12, Math.min(100, Math.round((minutes / 180) * 70 + sessions * 10)));

  if (bar) {
    bar.style.width = `${progress}%`;
  }
  if (label) {
    label.textContent = progress >= 80 ? 'Strong' : progress >= 45 ? 'Growing' : 'Starting';
  }
}

updateTodayDate();
setupReflection();

(async () => {
  const upcoming = document.getElementById('upcomingSession');
  const snapshot = document.getElementById('progressSnapshot');
  renderLoading(upcoming, 'Loading your next session...');
  renderLoading(snapshot, 'Loading progress snapshot...');

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
  setText('#recommendedTitle', data.recommendedNext?.title || 'Build one strong study block');
  setText('#recommendedDescription', data.recommendedNext?.description || 'Choose one subject, work calmly, and leave a note for your next session.');
  updateWeeklyRhythm(data);

  if (data.today?.hasUpcoming && data.today.session) {
    renderList(upcoming, [data.today.session], renderSession);
  } else {
    renderEmpty(upcoming, data.today?.emptyState?.title || 'No upcoming session today. Use the space to review, reflect, or prepare a question.');
  }

  renderList(snapshot, data.progressSnapshot || [], renderSnapshot);
})();
