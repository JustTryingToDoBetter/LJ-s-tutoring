import { apiGet, setActiveNav, qs, renderSkeletonCards, renderStateCard, clearChildren, createEl, initPortalUX, trackPortalEvent } from '/assets/portal-shared.js';

async function initTutorDashboard() {
  initPortalUX();
  setActiveNav('dashboard');
  trackPortalEvent('dashboard_viewed', { role: 'tutor' });

  const todayEl = qs('#todaySessionsList');
  const attentionEl = qs('#studentsAttentionList');
  const toolsEl = qs('#quickToolsList');
  const heroStatusEl = qs('#tutorHeroStatus');
  const priorityCountEl = qs('#priorityCount');
  const todayCountEl = qs('#todaySessionCount');
  const attentionCountEl = qs('#attentionCount');

  renderSkeletonCards(todayEl, 3);
  renderSkeletonCards(attentionEl, 2);
  renderSkeletonCards(toolsEl, 1);

  try {
    const data = await apiGet('/tutor/dashboard');

    const todayCount = data.todaySessions?.length || 0;
    const attentionCount = data.studentsNeedingAttention?.length || 0;
    if (todayCountEl) todayCountEl.textContent = String(todayCount);
    if (attentionCountEl) attentionCountEl.textContent = String(attentionCount);
    if (priorityCountEl) priorityCountEl.textContent = String(attentionCount);
    if (heroStatusEl) {
      heroStatusEl.textContent = todayCount
        ? `${todayCount} session(s) scheduled. Prioritize ${attentionCount || 0} learner(s) requiring intervention.`
        : 'No scheduled sessions yet. Use quick actions to plan interventions.';
    }

    clearChildren(todayEl);
    if (!data.todaySessions?.length) {
      renderStateCard(todayEl, {
        variant: 'empty',
        title: 'No sessions today',
        description: 'Use quick tools to prep your next student touchpoint.'
      });
    } else {
      const frag = document.createDocumentFragment();
      data.todaySessions.forEach((item) => {
        const row = createEl('div', { className: 'list-row' });
        row.append(
          createEl('div', { className: 'row-head' }, [
            createEl('strong', { text: `${item.time} · ${item.studentName}` }),
            createEl('span', { className: 'note', text: item.status })
          ])
        );
        const actions = createEl('div', { className: 'session-actions' });
        (item.quickActions || []).forEach((action) => {
          actions.append(createEl('a', {
            className: 'button secondary',
            text: action.label,
            attrs: { href: action.href }
          }));
        });
        row.append(actions);
        frag.append(row);
      });
      todayEl.append(frag);
    }

    clearChildren(attentionEl);
    if (!data.studentsNeedingAttention?.length) {
      renderStateCard(attentionEl, {
        variant: 'success',
        title: 'No urgent attention needed',
        description: 'All active students look healthy this week.'
      });
    } else {
      const frag = document.createDocumentFragment();
      data.studentsNeedingAttention.forEach((item) => {
        const row = createEl('div', { className: 'list-row' });
        const badge = createEl('span', {
          className: 'pill rejected',
          text: Number(item.riskScore || 0) >= 70 ? 'high risk' : 'watch'
        });
        row.append(
          createEl('div', { className: 'row-head' }, [
            createEl('strong', { text: item.studentName }),
            badge
          ]),
          createEl('div', { className: 'note', text: `Current streak: ${item.currentStreak} day(s)` }),
          createEl('div', { className: 'note', text: `Risk: ${item.riskScore ?? '-'} · Momentum: ${item.momentumScore ?? '-'}` }),
          createEl('div', { className: 'note', text: (item.modelReasons || []).slice(0, 1).map((r) => r.label || '').join('') }),
          createEl('div', { className: 'note', text: (item.reasons || []).join(' · ') })
        );
        frag.append(row);
      });
      attentionEl.append(frag);
    }

    clearChildren(toolsEl);
    const tools = createEl('div', { className: 'metric-chips' });
    (data.quickTools || []).forEach((tool) => {
      tools.append(createEl('a', {
        className: 'button',
        text: tool.label,
        attrs: { href: tool.href, 'aria-label': tool.label }
      }));
    });
    toolsEl.append(tools);
  } catch {
    renderStateCard(todayEl, {
      variant: 'error',
      title: 'Could not load today’s sessions',
      description: 'Refresh to retry.'
    });
    renderStateCard(attentionEl, {
      variant: 'error',
      title: 'Could not load student attention list',
      description: 'Refresh to retry.'
    });
    renderStateCard(toolsEl, {
      variant: 'error',
      title: 'Could not load quick tools',
      description: 'Refresh to retry.'
    });
  }
}

initTutorDashboard();
