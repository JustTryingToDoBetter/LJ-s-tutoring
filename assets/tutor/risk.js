import { apiGet, clearChildren, createEl, initPortalUX, qs, renderSkeletonCards, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

async function initRiskPage() {
  initPortalUX();
  setActiveNav('risk');
  trackPortalEvent('tutor_risk_viewed', { role: 'tutor' });

  const list = qs('#tutorRiskList');
  renderSkeletonCards(list, 4);

  try {
    const data = await apiGet('/tutor/scores?page=1&pageSize=50');
    clearChildren(list);

    if (!data.items?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No students mapped yet',
        description: 'Risk analytics populate after student mapping and activity.',
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.items.forEach((item) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: item.studentName }),
        createEl('div', { className: 'note', text: `Risk: ${item.riskScore ?? '-'} · Momentum: ${item.momentumScore ?? '-'}` }),
        createEl('div', { className: 'note', text: (item.reasons || []).slice(0, 2).map((r) => r.label).join(' · ') || 'No explainable reasons yet.' }),
      );
      frag.append(row);
    });
    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Unable to load risk monitor',
      description: 'Refresh and try again.',
    });
  }
}

initRiskPage();
