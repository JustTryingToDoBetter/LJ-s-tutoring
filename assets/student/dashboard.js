
import { loadJson, renderList, setActiveNav, setText } from '/assets/common.js';

setActiveNav('dashboard');

(async () => {
  const data = await loadJson('/dashboard').catch(() => null);
  if (!data) return;
  setText('#metricXp', String(data.streak?.xp ?? 0));
  setText('#metricStreak', `${data.streak?.current ?? 0} days`);
  setText('#metricMinutes', String(data.thisWeek?.minutesStudied ?? 0));
  setText('#metricSessions', String(data.thisWeek?.sessionsAttended ?? 0));
  setText('#recommendedTitle', data.recommendedNext?.title || 'Recommended next');
  setText('#recommendedDescription', data.recommendedNext?.description || 'Keep moving forward with one focused study block.');

  const upcoming = document.getElementById('upcomingSession');
  if (data.today?.hasUpcoming) {
    renderList(upcoming, [data.today.session], (session) => `
      <strong>${session.subject}</strong>
      <div>${session.date} • ${session.startTime}</div>
      <div>${session.mode}</div>
    `);
  } else {
    upcoming.innerHTML = `<div class="empty-state">${data.today?.emptyState?.title || 'No upcoming session.'}</div>`;
  }

  renderList(document.getElementById('progressSnapshot'), data.progressSnapshot || [], (topic) => `
    <strong>${topic.topic}</strong>
    <div>${topic.minutes} minutes • ${topic.sessions} sessions</div>
    <div class="progress-bar"><span style="width:${Math.max(0, Math.min(100, topic.completion || 0))}%"></span></div>
  `);
})();
