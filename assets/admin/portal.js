import { apiGet, apiPost, qs, escapeHtml, setActiveNav, initPortalUX } from '/assets/portal-shared.js';
import { initTutors } from '/assets/admin/domains/tutors.js';
import { initStudents } from '/assets/admin/domains/students.js';
import { initAssignments } from '/assets/admin/domains/assignments.js';
import { initApprovals } from '/assets/admin/domains/approvals.js';
import { initPayroll } from '/assets/admin/domains/payroll.js';
import { initReconciliation } from '/assets/admin/domains/reconciliation.js';
import { initRetention } from '/assets/admin/domains/retention.js';
import { initAudit } from '/assets/admin/domains/audit.js';
import { initPrivacyRequests } from '/assets/admin/domains/privacy-requests.js';

async function initDashboard() {
  setActiveNav('dashboard');
  ['countTutors', 'countStudents', 'countSessions'].forEach(id => {
    qs(`#${id}`).textContent = '\u2026';
  });

  function timeAgo(dateStr) {
    if (!dateStr) {return '';}
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  {return 'just now';}
    if (m < 60) {return `${m}m ago`;}
    const h = Math.floor(m / 60);
    if (h < 24) {return `${h}h ago`;}
    return `${Math.floor(h / 24)}d ago`;
  }

  function auditDotClass(action) {
    if (/approve/i.test(action))            {return 'd-green';}
    if (/reject|delete|remove/i.test(action)) {return 'd-red';}
    if (/create|add|register/i.test(action)) {return 'd-blue';}
    if (/payroll|invoice/i.test(action))    {return 'd-gold';}
    return 'd-dim';
  }

  function refreshApprovalUi(count) {
    const badge   = qs('#approvalsBadge');
    const tooltip = qs('#approvalsTooltip');
    const snapPA  = qs('#snapPendingApprovals');
    if (badge)   { badge.textContent = count > 0 ? String(count) : ''; badge.style.display = count > 0 ? '' : 'none'; }
    if (tooltip) {tooltip.textContent = count > 0 ? `Approvals (${count})` : 'Approvals';}
    if (snapPA)  { snapPA.textContent = String(count); snapPA.className = `snap-val ${count > 0 ? 'c-red' : 'c-green'}`; }
  }

  try {
    const data = await apiGet('/admin/dashboard');
    let liveApprovals = data.pendingApprovalsCount ?? 0;

    // ── Stat cards ─────────────────────────────────────────────
    const totalSessions = (data.sessions || []).reduce((acc, row) => acc + Number(row.count), 0);
    qs('#countTutors').textContent   = data.tutors   ?? '\u2014';
    qs('#countStudents').textContent = data.students ?? '\u2014';
    qs('#countSessions').textContent = totalSessions;

    // ── System snapshot ────────────────────────────────────────
    refreshApprovalUi(liveApprovals);
    const privCount = data.openPrivacyRequestsCount ?? 0;
    if (qs('#snapPrivacyRequests')) {qs('#snapPrivacyRequests').textContent = String(privCount);}
    if (qs('#snapWeekApproved'))    {qs('#snapWeekApproved').textContent    = String(data.payrollWeek?.approvedCount ?? '\u2014');}
    if (qs('#snapWeekHours')) {
      const mins = data.payrollWeek?.approvedMinutes ?? 0;
      qs('#snapWeekHours').textContent = mins ? `${Math.floor(mins / 60)}h ${mins % 60}m` : '0h';
    }
    if (qs('#snapWeekStart') && data.payrollWeek?.weekStart) {
      qs('#snapWeekStart').textContent = new Date(data.payrollWeek.weekStart).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    }
    if (qs('#snapTutors'))   {qs('#snapTutors').textContent   = String(data.tutors   ?? '\u2014');}
    if (qs('#snapStudents')) {qs('#snapStudents').textContent = String(data.students ?? '\u2014');}

    // ── Activity feed ──────────────────────────────────────────
    const feed = qs('#activityFeed');
    if (feed) {
      feed.innerHTML = '';
      const items = data.recentAudit || [];
      if (!items.length) {
        feed.innerHTML = '<div class="activity-item"><div class="a-body"><div class="a-text" style="color:var(--muted)">No recent activity</div></div></div>';
      } else {
        const frag = document.createDocumentFragment();
        items.forEach(entry => {
          const div  = document.createElement('div');
          div.className = 'activity-item';
          const dot  = document.createElement('div');
          dot.className = `a-dot ${auditDotClass(entry.action)}`;
          const body = document.createElement('div');
          body.className = 'a-body';
          const text = document.createElement('div');
          text.className = 'a-text';
          const who  = entry.actorEmail
            ? `<strong>${escapeHtml(entry.actorEmail)}</strong>`
            : `<em>${escapeHtml(entry.actorRole || 'system')}</em>`;
          const what = escapeHtml(`${entry.action}${entry.entityType ? ' \u00b7 ' + entry.entityType : ''}`);
          text.innerHTML = `${who} \u2014 ${what}`;
          const time = document.createElement('div');
          time.className = 'a-time';
          time.textContent = timeAgo(entry.createdAt);
          body.append(text, time);
          div.append(dot, body);
          frag.append(div);
        });
        feed.append(frag);
      }
    }

    // ── Pending approvals ──────────────────────────────────────
    const apprList = qs('#pendingApprovalsList');
    if (apprList) {
      apprList.innerHTML = '';
      const approvals = data.pendingApprovals || [];
      if (!approvals.length) {
        apprList.innerHTML = '<div class="appr-item"><div class="appr-info"><div class="appr-name" style="color:var(--muted)">No pending approvals \u2713</div></div></div>';
      } else {
        const frag = document.createDocumentFragment();
        approvals.forEach(item => {
          const div = document.createElement('div');
          div.className = 'appr-item';
          div.dataset.sessionId = item.id;

          const initials = (item.tutorName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          const avatar = document.createElement('div');
          avatar.className = 'appr-avatar';
          avatar.textContent = initials;

          const info = document.createElement('div');
          info.className = 'appr-info';
          const name = document.createElement('div');
          name.className = 'appr-name';
          name.textContent = `${item.tutorName} \u2192 ${item.studentName}`;
          const meta = document.createElement('div');
          meta.className = 'appr-meta';
          const dateStr = item.date
            ? new Date(item.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';
          meta.textContent = [item.subject, item.startTime, item.durationMinutes ? `${item.durationMinutes}min` : '', dateStr].filter(Boolean).join(' \u00b7 ');
          info.append(name, meta);

          const actions = document.createElement('div');
          actions.className = 'appr-actions';
          const okBtn = document.createElement('button');
          okBtn.className = 'appr-btn ok';
          okBtn.setAttribute('aria-label', 'Approve');
          okBtn.dataset.action = 'approve';
          okBtn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
          const noBtn = document.createElement('button');
          noBtn.className = 'appr-btn no';
          noBtn.setAttribute('aria-label', 'Reject');
          noBtn.dataset.action = 'reject';
          noBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          actions.append(okBtn, noBtn);

          div.append(avatar, info, actions);
          frag.append(div);
        });
        apprList.append(frag);

        // Event delegation — approve / reject
        apprList.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-action]');
          if (!btn) {return;}
          const row = btn.closest('[data-session-id]');
          if (!row) {return;}
          const sessionId = row.dataset.sessionId;
          const action = btn.dataset.action;
          btn.disabled = true;
          btn.style.opacity = '0.4';
          try {
            await apiPost(`/admin/sessions/${encodeURIComponent(sessionId)}/${action}`, {});
            row.style.transition = 'opacity 0.3s';
            row.style.opacity = '0';
            setTimeout(() => {
              row.remove();
              liveApprovals = Math.max(0, liveApprovals - 1);
              refreshApprovalUi(liveApprovals);
              if (!apprList.querySelector('[data-session-id]')) {
                apprList.innerHTML = '<div class="appr-item"><div class="appr-info"><div class="appr-name" style="color:var(--muted)">No pending approvals \u2713</div></div></div>';
              }
            }, 300);
          } catch {
            btn.disabled = false;
            btn.style.opacity = '';
          }
        });
      }
    }

    // ── Payroll week ───────────────────────────────────────────
    const payrollLabel = qs('#payrollWeekLabel');
    const payrollBars  = qs('#payrollBars');
    if (data.payrollWeek) {
      const pw = data.payrollWeek;
      if (payrollLabel && pw.weekStart) {
        payrollLabel.textContent = `w/c ${new Date(pw.weekStart).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`;
      }
      if (payrollBars) {
        const total = (pw.approvedCount + pw.pendingCount) || 1;
        const aPct  = Math.round((pw.approvedCount / total) * 100);
        const pPct  = Math.round((pw.pendingCount  / total) * 100);
        const mins  = pw.approvedMinutes || 0;
        const hrs   = `${Math.floor(mins / 60)}h ${mins % 60}m`;
        payrollBars.innerHTML = `
          <div class="pr-row">
            <div class="pr-header">
              <span class="pr-label">Approved sessions</span>
              <span class="pr-value">${pw.approvedCount} \u00b7 ${aPct}%</span>
            </div>
            <div class="pr-track"><div class="pr-fill f-green" style="width:${aPct}%"></div></div>
          </div>
          <div class="pr-row">
            <div class="pr-header">
              <span class="pr-label">Pending approval</span>
              <span class="pr-value">${pw.pendingCount} \u00b7 ${pPct}%</span>
            </div>
            <div class="pr-track"><div class="pr-fill f-gold" style="width:${pPct}%"></div></div>
          </div>
          <div class="pr-row">
            <div class="pr-header">
              <span class="pr-label">Approved hours</span>
              <span class="pr-value">${hrs}</span>
            </div>
            <div class="pr-track"><div class="pr-fill f-green" style="width:${aPct}%"></div></div>
          </div>
        `;
      }
    }

  } catch {
    ['countTutors', 'countStudents', 'countSessions'].forEach(id => {
      qs(`#${id}`).textContent = '\u2014';
    });
  }
}

const page = document.body.dataset.page;
initPortalUX();

if (page === 'dashboard') {initDashboard();}
if (page === 'tutors') {initTutors();}
if (page === 'students') {initStudents();}
if (page === 'assignments') {initAssignments();}
if (page === 'approvals') {initApprovals();}
if (page === 'payroll') {initPayroll();}
if (page === 'audit') {initAudit();}
if (page === 'reconciliation') {initReconciliation();}
if (page === 'retention') {initRetention();}
if (page === 'privacy-requests') {initPrivacyRequests();}
