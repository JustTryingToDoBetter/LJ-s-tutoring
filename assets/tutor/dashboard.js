import { apiGet, setActiveNav, qs, renderSkeletonCards, renderStateCard, clearChildren, createEl, initPortalUX, trackPortalEvent } from '/assets/portal-shared.js';

const STATUS_LABELS = { DRAFT: '✏ Draft', SUBMITTED: '⏳ Pending', APPROVED: '✓ Approved', REJECTED: '✗ Rejected' };

async function initTutorDashboard() {
  initPortalUX();
  setActiveNav('dashboard');
  trackPortalEvent('dashboard_viewed', { role: 'tutor' });

  const todayEl     = qs('#todaySessionsList');
  const attentionEl = qs('#studentsAttentionList');
  const toolsEl     = qs('#quickToolsList');

  renderSkeletonCards(todayEl, 3);
  renderSkeletonCards(attentionEl, 2);
  renderSkeletonCards(toolsEl, 1);

  try {
    const data = await apiGet('/tutor/dashboard');

    // ── Week stats strip ───────────────────────────────────────
    const ws = data.weekStats || {};
    [
      ['dsStat0', ws.todayCount],
      ['dsStat1', ws.weekCount],
      ['dsStat2', ws.pendingCount],
      ['dsStat3', ws.activeStudents],
    ].forEach(([id, val]) => {
      const el = qs(`#${id}`);
      if (el) el.textContent = val ?? '—';
    });
    const pendingChip = qs('#dsStatPending');
    if (pendingChip && (ws.pendingCount || 0) > 0) {
      pendingChip.style.borderColor = 'rgba(245,158,11,0.5)';
      pendingChip.style.background  = 'rgba(245,158,11,0.08)';
    }

    // ── Today's sessions ───────────────────────────────────────
    clearChildren(todayEl);
    if (!data.todaySessions?.length) {
      renderStateCard(todayEl, {
        variant: 'empty',
        title: 'No sessions today',
        description: 'Use the quick tools below to prep for upcoming students.',
      });
    } else {
      const frag = document.createDocumentFragment();
      data.todaySessions.forEach((item) => {
        const row  = createEl('div', { className: 'list-row' });
        const head = createEl('div', { className: 'row-head' });
        head.append(
          createEl('strong', { text: `${item.time} · ${item.studentName}` }),
          createEl('span',   { className: 'note', text: STATUS_LABELS[item.status] || item.status }),
        );
        const actions = createEl('div', { className: 'session-actions' });
        actions.append(
          createEl('a', { className: 'button secondary', text: 'Log notes',
            attrs: { href: '/tutor/sessions.html', 'aria-label': `Log notes for ${item.studentName}` } }),
          createEl('a', { className: 'button secondary', text: 'Report',
            attrs: { href: '/tutor/reports/', 'aria-label': `Report for ${item.studentName}` } }),
        );
        row.append(head, actions);
        frag.append(row);
      });
      todayEl.append(frag);
    }

    // ── Students needing attention ─────────────────────────────
    clearChildren(attentionEl);
    if (!data.studentsNeedingAttention?.length) {
      renderStateCard(attentionEl, {
        variant: 'success',
        title: '✓ All students on track',
        description: 'No immediate follow-ups needed this week.',
      });
    } else {
      const frag = document.createDocumentFragment();
      data.studentsNeedingAttention.forEach((item) => {
        const row = createEl('div', { className: 'list-row' });

        // Name + grade
        const nameRow = createEl('div', { className: 'row-head' });
        nameRow.append(createEl('strong', { text: item.studentName }));
        if (item.studentGrade) {
          nameRow.append(createEl('span', { className: 'note', text: ` · ${item.studentGrade}` }));
        }

        // Meta: streak + last session
        const meta = createEl('div', { className: 'note' });
        meta.style.cssText = 'margin:3px 0 4px';
        meta.textContent = [
          `Streak: ${item.currentStreak} day(s)`,
          item.lastSessionDate ? `Last: ${item.lastSessionDate}` : 'No recent session',
        ].join(' · ');

        // Reasons (amber)
        const reasons = createEl('div', { className: 'note' });
        reasons.style.cssText = 'color:#f59e0b;margin-bottom:8px';
        reasons.textContent = (item.reasons || []).join(' · ');

        // Action buttons
        const actions = createEl('div', { className: 'session-actions' });
        actions.append(
          createEl('a', { className: 'button secondary', text: 'Sessions',
            attrs: { href: '/tutor/sessions.html', 'aria-label': `Sessions for ${item.studentName}` } }),
          createEl('a', { className: 'button secondary', text: 'Report',
            attrs: { href: `/tutor/reports/?studentId=${encodeURIComponent(item.studentId)}`,
                     'aria-label': `Report for ${item.studentName}` } }),
        );

        if (item.studentEmail) {
          const subj = encodeURIComponent(`Tutoring follow-up — ${item.studentName}`);
          const body = encodeURIComponent(
            `Hi ${item.studentName.split(' ')[0]},\n\nI wanted to follow up on your recent progress and see how you are getting on.\n\nBest,`
          );
          actions.append(createEl('a', { className: 'button', text: 'Contact',
            attrs: { href: `mailto:${item.studentEmail}?subject=${subj}&body=${body}`,
                     'aria-label': `Email ${item.studentName}` } }));
        } else {
          actions.append(createEl('a', { className: 'button secondary', text: 'Assignments',
            attrs: { href: '/tutor/assignments.html', 'aria-label': `Assignments for ${item.studentName}` } }));
        }

        row.append(nameRow, meta, reasons, actions);
        frag.append(row);
      });
      attentionEl.append(frag);
    }

    // ── Quick tools ────────────────────────────────────────────
    clearChildren(toolsEl);
    const tools = createEl('div', { className: 'session-actions' });
    tools.style.cssText = 'flex-wrap:wrap;gap:10px';
    (data.quickTools || []).forEach((tool) => {
      tools.append(createEl('a', { className: 'button', text: tool.label,
        attrs: { href: tool.href, 'aria-label': tool.label } }));
    });
    toolsEl.append(tools);

  } catch {
    renderStateCard(todayEl,     { variant: 'error', title: 'Dashboard unavailable',    description: 'Refresh to retry.' });
    renderStateCard(attentionEl, { variant: 'error', title: 'Could not load students',  description: 'Refresh to retry.' });
    renderStateCard(toolsEl,     { variant: 'error', title: 'Could not load tools',     description: 'Refresh to retry.' });
  }
}

initTutorDashboard();
