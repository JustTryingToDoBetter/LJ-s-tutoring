import { apiGet, apiPost, qs, setActiveNav, renderSkeletonCards, renderSkeletonLines, renderStateCard, clearChildren, createEl, initPortalUX, trackPortalEvent } from '/assets/portal-shared.js';

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

function renderSparkline(svg, topics) {
  if (!svg) {return;}
  const values = (topics || []).slice(0, 6).map((topic) => Math.max(0, Math.min(100, Number(topic.completion || 0))));
  const points = values.length ? values : [10, 18, 35, 52, 68, 76];
  const width = 260;
  const height = 72;
  const max = 100;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((value, idx) => {
    const x = idx * stepX;
    const y = height - (value / max) * (height - 8) - 4;
    return `${x},${y}`;
  });
  const areaPath = `M0,${height} L${coords.join(' L')} L${width},${height} Z`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="sparkLineGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#8d4dff"></stop>
        <stop offset="100%" stop-color="#2cb5ff"></stop>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#sparkLineGradient)" opacity="0.16"></path>
    <polyline points="${coords.join(' ')}" fill="none" stroke="url(#sparkLineGradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
  `;
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
  const streakLongestEl = qs('#streakLongest');
  const progressEl = qs('#progressSnapshot');
  const sparklineEl = qs('#progressSparkline');
  const recommendedEl = qs('#recommendedNext');
  const greetingEl = qs('#studentGreeting');
  const streakCurrentEl = qs('#streakCurrent');
  const xpEl = qs('#xpCount');
  const calendarEl = qs('#calendarStrip');
  const heroXpEl = qs('#heroXp');
  const heroTasksDueEl = qs('#heroTasksDue');
  const heroTestsDueEl = qs('#heroTestsDue');
  const heroStreakEl = qs('#heroStreak');
  const heroQuickStatusEl = qs('#heroQuickStatus');
  const momentumEl = qs('#momentumScore');
  const momentumDetailEl = qs('#momentumScoreDetail');
  const riskEl = qs('#riskScore');
  const scoreDateEl = qs('#scoreDate');
  const reasonsEl = qs('#predictiveReasons');
  const careerNextStepsEl = qs('#careerNextSteps');

  renderSkeletonCards(todayEl, 1);
  renderSkeletonLines(progressEl, 4);
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
    if (streakLongestEl) {
      streakLongestEl.textContent = String(data.streak?.longest || data.streak?.current || 0);
    }
    xpEl.textContent = String(data.streak?.xp || 0);
    renderCalendar(calendarEl, data.streak?.current || 0);
    renderSparkline(sparklineEl, data.progressSnapshot || []);

    if (heroXpEl) heroXpEl.textContent = String(data.streak?.xp || 0);
    if (heroTasksDueEl) heroTasksDueEl.textContent = String(data.today?.tasksDue || 0);
    if (heroTestsDueEl) heroTestsDueEl.textContent = String(data.today?.testsDue || 0);
    if (heroStreakEl) heroStreakEl.textContent = String(data.streak?.current || 0);
    if (heroQuickStatusEl) {
      const hasUpcoming = Boolean(data.today?.hasUpcoming);
      heroQuickStatusEl.textContent = hasUpcoming
        ? `Next session ${data.today.session?.startTime || ''}. Keep momentum above ${data.predictiveScore?.momentumScore || 0}.`
        : 'No upcoming session booked. Complete one focus block to preserve consistency.';
    }

    renderProgressTopics(progressEl, data.progressSnapshot || []);

    if (momentumEl) momentumEl.textContent = String(data.predictiveScore?.momentumScore || 0);
    if (momentumDetailEl) momentumDetailEl.textContent = String(data.predictiveScore?.momentumScore || 0);
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
        attrs: { type: 'button', id: 'recommendedActionBtn', 'aria-label': 'Start recommended action' }
      })
    );
    recommendedEl.append(recommendation);
    qs('#recommendedActionBtn')?.addEventListener('click', () => {
      qs('#focusModeStart')?.click();
    });
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
  const filterRoot = qs('#reportsFilterPills');
  let currentFilter = 'all';
  let cachedItems = [];
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

    const now = Date.now();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const filtered = items.filter((item) => {
      if (currentFilter === 'all') {return true;}
      const createdAt = Date.parse(item.created_at || '');
      if (!Number.isFinite(createdAt)) {return currentFilter === 'all';}
      if (currentFilter === 'recent') {
        return now - createdAt <= 14 * 24 * 60 * 60 * 1000;
      }
      if (currentFilter === 'month') {
        return createdAt >= monthStart.getTime();
      }
      return true;
    });

    if (!filtered.length) {
      renderStateCard(listEl, {
        variant: 'empty',
        title: 'No reports in this filter',
        description: 'Try a broader filter or generate a new report.'
      });
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach((item) => {
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

  filterRoot?.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      currentFilter = pill.dataset.filter || 'all';
      filterRoot.querySelectorAll('.filter-pill').forEach((item) => {
        const active = item === pill;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      render(cachedItems);
    });
  });

  try {
    const data = await apiGet('/reports?page=1&pageSize=20');
    cachedItems = data.items || [];
    render(cachedItems);
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
      cachedItems = data.items || [];
      render(cachedItems);
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
    const chips = createEl('div', { className: 'metric-chips' });
    chips.append(
      createEl('span', { className: 'metric-chip', text: `Sessions: ${payload.metrics?.sessionsAttended || 0}` }),
      createEl('span', { className: 'metric-chip', text: `Minutes: ${payload.metrics?.timeStudiedMinutes || 0}` }),
      createEl('span', { className: 'metric-chip', text: `Streak: ${payload.metrics?.streak || 0} days` }),
      createEl('span', { className: 'metric-chip', text: `XP: ${payload.metrics?.xp || 0}` })
    );

    card.append(
      createEl('h2', { className: 'panel-title', text: `Weekly report · ${report.weekStart} to ${report.weekEnd}` }),
      createEl('p', { className: 'note', text: `Student: ${payload.student?.name || 'Student'} (${payload.student?.grade || 'N/A'})` }),
      chips
    );

    const topicsSection = createEl('section', { className: 'report-section' });
    topicsSection.append(createEl('h3', { className: 'panel-title', text: 'Topic progress' }));
    const topicsWrap = createEl('div', { className: 'grid' });
    renderProgressTopics(topicsWrap, payload.topicProgress || []);
    topicsSection.append(topicsWrap);
    card.append(topicsSection);

    const notes = Array.isArray(payload.tutorNotesSummary) ? payload.tutorNotesSummary : [];
    const notesSection = createEl('section', { className: 'report-section' });
    notesSection.append(createEl('h3', { className: 'panel-title', text: 'Tutor notes summary' }));
    if (notes.length) {
      const ul = createEl('ul');
      notes.forEach((line) => ul.append(createEl('li', { text: line })));
      notesSection.append(ul);
    } else {
      notesSection.append(createEl('p', { className: 'note', text: 'No tutor notes captured this week.' }));
    }
    card.append(notesSection);

    const goals = Array.isArray(payload.goalsNextWeek) ? payload.goalsNextWeek : [];
    const goalsSection = createEl('section', { className: 'report-section' });
    goalsSection.append(createEl('h3', { className: 'panel-title', text: 'Goals for next week' }));
    if (goals.length) {
      const ul = createEl('ul');
      goals.forEach((goal) => ul.append(createEl('li', { text: goal })));
      goalsSection.append(ul);
    } else {
      goalsSection.append(createEl('p', { className: 'note', text: 'No goals generated yet.' }));
    }
    card.append(goalsSection);

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
