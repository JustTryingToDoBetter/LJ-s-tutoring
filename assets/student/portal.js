import { apiGet, apiPost, qs, setActiveNav, renderSkeletonCards, renderStateCard, clearChildren, createEl, initPortalUX, trackPortalEvent } from '/assets/portal-shared.js';

function renderProgressTopics(container, topics) {
  clearChildren(container);
  if (!topics?.length) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'No topic progress yet',
      description: 'Complete a practice or session to populate your progress snapshot.'
    });
    return;
  }

  const frag = document.createDocumentFragment();
  topics.forEach((topic) => {
    const row = createEl('div', { className: 'topic-row' });
    const head = createEl('div', { className: 'topic-head' });
    head.append(
      createEl('strong', { text: topic.topic }),
      createEl('span', { text: `${topic.completion}%` })
    );
    const track = createEl('div', { className: 'progress-track' });
    const fill = createEl('div', {
      className: 'progress-fill',
      attrs: { style: `width:${Math.max(0, Math.min(100, Number(topic.completion || 0)))}%` }
    });
    track.append(fill);
    row.append(head, track);
    frag.append(row);
  });
  container.append(frag);
}

function renderCalendar(container, streakDays) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const activeCount = Math.max(0, Math.min(7, Number(streakDays || 0)));
  clearChildren(container);
  const frag = document.createDocumentFragment();
  days.forEach((label, idx) => {
    const day = createEl('div', {
      className: `calendar-day ${idx < activeCount ? 'active' : ''}`,
      text: label,
      attrs: { 'aria-label': `Day ${label} ${idx < activeCount ? 'completed' : 'not completed'}` }
    });
    frag.append(day);
  });
  container.append(frag);
}

async function initDashboard() {
  setActiveNav('dashboard');
  trackPortalEvent('dashboard_viewed', { role: 'student' });

  const todayEl = qs('#todayCard');
  const weekMinutesEl = qs('#weekMinutes');
  const weekSessionsEl = qs('#weekSessions');
  const weekStreakEl = qs('#weekStreak');
  const progressEl = qs('#progressSnapshot');
  const recommendedEl = qs('#recommendedNext');
  const greetingEl = qs('#studentGreeting');
  const streakCurrentEl = qs('#streakCurrent');
  const xpEl = qs('#xpCount');
  const calendarEl = qs('#calendarStrip');
  const momentumEl = qs('#momentumScore');
  const riskEl = qs('#riskScore');
  const scoreDateEl = qs('#scoreDate');
  const reasonsEl = qs('#predictiveReasons');
  const careerNextStepsEl = qs('#careerNextSteps');

  renderSkeletonCards(todayEl, 1);
  renderSkeletonCards(progressEl, 2);
  renderSkeletonCards(recommendedEl, 1);
  renderSkeletonCards(reasonsEl, 2);
  renderSkeletonCards(careerNextStepsEl, 1);

  try {
    const data = await apiGet('/dashboard');
    if (greetingEl) greetingEl.textContent = data.greeting || 'Welcome back!';

    clearChildren(todayEl);
    if (data.today?.hasUpcoming) {
      const card = createEl('div', { className: 'list-row' });
      card.append(
        createEl('strong', { text: `${data.today.session.subject} at ${data.today.session.startTime}` }),
        createEl('div', { className: 'note', text: `${data.today.session.date} · ${data.today.session.mode}` }),
      );
      if (data.today.session.joinLink) {
        card.append(createEl('a', {
          className: 'button',
          text: 'Join session',
          attrs: { href: data.today.session.joinLink, 'aria-label': 'Join upcoming session' }
        }));
      }
      todayEl.append(card);
    } else {
      renderStateCard(todayEl, {
        variant: 'empty',
        title: data.today?.emptyState?.title || 'No upcoming session',
        description: 'Take a short focus session to keep your streak alive.'
      });
      const cta = createEl('a', {
        className: 'button secondary',
        text: data.today?.emptyState?.ctaLabel || 'Book session',
        attrs: { href: data.today?.emptyState?.ctaHref || '/contact' }
      });
      todayEl.append(cta);
    }

    weekMinutesEl.textContent = String(data.thisWeek?.minutesStudied || 0);
    weekSessionsEl.textContent = String(data.thisWeek?.sessionsAttended || 0);
    weekStreakEl.textContent = String(data.thisWeek?.streakDays || 0);

    streakCurrentEl.textContent = String(data.streak?.current || 0);
    xpEl.textContent = String(data.streak?.xp || 0);
    renderCalendar(calendarEl, data.streak?.current || 0);

    renderProgressTopics(progressEl, data.progressSnapshot || []);

    if (momentumEl) momentumEl.textContent = String(data.predictiveScore?.momentumScore || 0);
    if (riskEl) riskEl.textContent = String(data.predictiveScore?.riskScore || 0);
    if (scoreDateEl) scoreDateEl.textContent = data.predictiveScore?.date || '-';

    clearChildren(reasonsEl);
    const reasons = data.predictiveScore?.reasons || [];
    if (!reasons.length) {
      renderStateCard(reasonsEl, {
        variant: 'empty',
        title: 'No predictive reasons yet',
        description: 'Your score reasons will appear after activity sync.'
      });
    } else {
      const reasonFrag = document.createDocumentFragment();
      reasons.slice(0, 3).forEach((reason) => {
        const row = createEl('div', { className: 'list-row' });
        row.append(
          createEl('strong', { text: reason.label || 'Reason' }),
          createEl('p', { className: 'note', text: reason.detail || 'No details provided.' })
        );
        reasonFrag.append(row);
      });
      reasonsEl.append(reasonFrag);
    }

    clearChildren(careerNextStepsEl);
    if (!data.careerGoals?.length) {
      renderStateCard(careerNextStepsEl, {
        variant: 'empty',
        title: 'No career goal selected',
        description: 'Pick a goal in Career Mapping to receive roadmap next steps.'
      });
      careerNextStepsEl.append(createEl('a', {
        className: 'button secondary',
        text: 'Open Career Mapping',
        attrs: { href: '/dashboard/career/' }
      }));
    } else {
      const row = createEl('div', { className: 'list-row' });
      const goal = data.careerGoals[0];
      row.append(
        createEl('strong', { text: `Goal: ${goal.goalId}` }),
        createEl('p', { className: 'note', text: `Alignment score: ${goal.alignmentScore ?? 0}%` }),
        createEl('a', {
          className: 'button secondary',
          text: 'View full roadmap',
          attrs: { href: '/dashboard/career/' }
        })
      );
      careerNextStepsEl.append(row);
    }

    clearChildren(recommendedEl);
    const recommendation = createEl('div', { className: 'list-row' });
    recommendation.append(
      createEl('strong', { text: data.recommendedNext?.title || 'Recommended next' }),
      createEl('p', { className: 'note', text: data.recommendedNext?.description || 'Do one focused activity today.' }),
      createEl('button', {
        className: 'button',
        text: data.recommendedNext?.action || 'Start now',
        attrs: { type: 'button', id: 'focusModeStart', 'aria-label': 'Start focus mode 25 minute timer' }
      })
    );
    recommendedEl.append(recommendation);
    bindFocusTimer();
  } catch {
    renderStateCard(todayEl, {
      variant: 'error',
      title: 'Could not load dashboard',
      description: 'Refresh to try again.'
    });
    renderStateCard(progressEl, {
      variant: 'error',
      title: 'Progress unavailable',
      description: 'Try again in a moment.'
    });
    renderStateCard(recommendedEl, {
      variant: 'error',
      title: 'Suggestions unavailable',
      description: 'Try again in a moment.'
    });
    renderStateCard(reasonsEl, {
      variant: 'error',
      title: 'Predictive analytics unavailable',
      description: 'Try again in a moment.'
    });
    renderStateCard(careerNextStepsEl, {
      variant: 'error',
      title: 'Career roadmap unavailable',
      description: 'Try again in a moment.'
    });
  }
}

function bindFocusTimer() {
  const startBtn = qs('#focusModeStart');
  const completeBtn = qs('#focusModeComplete');
  const timerLabel = qs('#focusTimerLabel');
  if (!startBtn || !completeBtn || !timerLabel) return;

  let timerId = null;
  let remaining = 25 * 60;

  const paint = () => {
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = Math.floor(remaining % 60).toString().padStart(2, '0');
    timerLabel.textContent = `${m}:${s}`;
  };

  const stop = () => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  startBtn.addEventListener('click', () => {
    stop();
    remaining = 25 * 60;
    paint();
    timerId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stop();
        remaining = 0;
      }
      paint();
    }, 1000);
  });

  completeBtn.addEventListener('click', async () => {
    try {
      await apiPost('/study-activity', {
        type: 'focus_session',
        dedupeKey: `focus-${new Date().toISOString().slice(0, 10)}`,
        metadata: {
          durationMinutes: 25,
          source: 'focus_mode_widget'
        }
      });
      trackPortalEvent('streak_credited', { source: 'focus_mode_widget' });
      await initDashboard();
    } catch {
      // No-op to keep UX non-blocking.
    }
  });

  paint();
}

async function initReports() {
  setActiveNav('reports');
  const listEl = qs('#reportsList');
  renderSkeletonCards(listEl, 3);

  const render = (items) => {
    clearChildren(listEl);
    if (!items.length) {
      renderStateCard(listEl, {
        variant: 'empty',
        title: 'No reports yet',
        description: 'Generate your weekly report to see your latest progress.'
      });
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('div', { className: 'row-head' }, [
          createEl('strong', { text: `Week ${item.week_start} → ${item.week_end}` }),
          createEl('span', { className: 'note', text: new Date(item.created_at).toLocaleString() })
        ]),
        createEl('a', {
          className: 'button secondary',
          text: 'View report',
          attrs: {
            href: `/reports/view/?id=${encodeURIComponent(item.id)}`,
            'aria-label': 'View weekly report'
          }
        })
      );
      frag.append(row);
    });
    listEl.append(frag);
  };

  try {
    const data = await apiGet('/reports?page=1&pageSize=20');
    render(data.items || []);
  } catch {
    renderStateCard(listEl, {
      variant: 'error',
      title: 'Could not load reports',
      description: 'Please refresh and try again.'
    });
  }

  qs('#generateReportNow')?.addEventListener('click', async () => {
    const btn = qs('#generateReportNow');
    btn.disabled = true;
    try {
      await apiPost('/reports/generate', {});
      trackPortalEvent('report_generated', { role: 'student' });
      const data = await apiGet('/reports?page=1&pageSize=20');
      render(data.items || []);
    } finally {
      btn.disabled = false;
    }
  });
}

async function initReportView() {
  setActiveNav('reports');
  const viewEl = qs('#reportView');
  renderSkeletonCards(viewEl, 2);

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    renderStateCard(viewEl, {
      variant: 'error',
      title: 'Missing report ID',
      description: 'Open a report from the reports list.'
    });
    return;
  }

  try {
    const data = await apiGet(`/reports/${encodeURIComponent(id)}`);
    trackPortalEvent('report_viewed', { role: 'student' });

    const report = data.report;
    const payload = report.payload || {};
    clearChildren(viewEl);

    const card = createEl('article', { className: 'panel report-print' });
    card.append(
      createEl('h2', { className: 'panel-title', text: `Weekly report · ${report.weekStart} to ${report.weekEnd}` }),
      createEl('p', { className: 'note', text: `Student: ${payload.student?.name || 'Student'} (${payload.student?.grade || 'N/A'})` }),
      createEl('p', { text: `Sessions attended: ${payload.metrics?.sessionsAttended || 0}` }),
      createEl('p', { text: `Time studied: ${payload.metrics?.timeStudiedMinutes || 0} minutes` }),
      createEl('p', { text: `Streak: ${payload.metrics?.streak || 0} days · XP: ${payload.metrics?.xp || 0}` }),
      createEl('h3', { className: 'panel-title', text: 'Topic progress' })
    );

    const topicsWrap = createEl('div', { className: 'grid' });
    renderProgressTopics(topicsWrap, payload.topicProgress || []);
    card.append(topicsWrap);

    const notes = Array.isArray(payload.tutorNotesSummary) ? payload.tutorNotesSummary : [];
    card.append(createEl('h3', { className: 'panel-title', text: 'Tutor notes summary' }));
    if (notes.length) {
      const ul = createEl('ul');
      notes.forEach((line) => ul.append(createEl('li', { text: line })));
      card.append(ul);
    } else {
      card.append(createEl('p', { className: 'note', text: 'No tutor notes captured this week.' }));
    }

    const goals = Array.isArray(payload.goalsNextWeek) ? payload.goalsNextWeek : [];
    card.append(createEl('h3', { className: 'panel-title', text: 'Goals for next week' }));
    if (goals.length) {
      const ul = createEl('ul');
      goals.forEach((goal) => ul.append(createEl('li', { text: goal })));
      card.append(ul);
    } else {
      card.append(createEl('p', { className: 'note', text: 'No goals generated yet.' }));
    }

    viewEl.append(card);
  } catch {
    renderStateCard(viewEl, {
      variant: 'error',
      title: 'Could not load report',
      description: 'Try opening it again from your reports list.'
    });
  }

  qs('#printReportBtn')?.addEventListener('click', () => {
    window.print();
  });
}

initPortalUX();
const page = document.body.dataset.page;
if (page === 'dashboard') initDashboard();
if (page === 'reports') initReports();
if (page === 'report') initReportView();
