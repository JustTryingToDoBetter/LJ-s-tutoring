import { apiGet, apiPatch, apiPost, clearChildren, createEl, initPortalUX, qs, renderSkeletonCards, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

let selectedQuestionId = null;

async function loadQuestions() {
  const list = qs('#tutorQuestionsList');
  renderSkeletonCards(list, 3);

  try {
    const data = await apiGet('/community/questions?page=1&pageSize=20');
    clearChildren(list);

    if (!data.items?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No peer questions found',
        description: 'Questions will appear here for tutor moderation.'
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.items.forEach((question) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: question.title }),
        createEl('div', { className: 'note', text: `${question.subject} · ${question.topic}` }),
        createEl('div', { className: 'note', text: `Status: ${question.status} · State: ${question.moderation_state}` })
      );

      const actions = createEl('div', { className: 'session-actions' });
      const openBtn = createEl('button', { className: 'button secondary', text: 'Open answers', attrs: { type: 'button' } });
      openBtn.addEventListener('click', async () => {
        selectedQuestionId = question.id;
        await loadAnswers();
      });

      const hideBtn = createEl('button', { className: 'button warning', text: 'Hide', attrs: { type: 'button' } });
      hideBtn.addEventListener('click', async () => {
        await apiPatch(`/community/moderation/QUESTION/${encodeURIComponent(question.id)}/hide`, {});
        await loadQuestions();
      });

      actions.append(openBtn, hideBtn);
      row.append(actions);
      frag.append(row);
    });
    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load questions',
      description: 'Refresh and try again.'
    });
  }
}

async function loadAnswers() {
  const label = qs('#tutorSelectedQuestionLabel');
  const list = qs('#tutorAnswersList');

  if (!selectedQuestionId) {
    renderStateCard(list, {
      variant: 'empty',
      title: 'No question selected',
      description: 'Choose a question to moderate answers.'
    });
    return;
  }

  renderSkeletonCards(list, 2);
  try {
    const data = await apiGet(`/community/questions/${encodeURIComponent(selectedQuestionId)}/answers?page=1&pageSize=20`);
    clearChildren(list);
    if (label) {
      label.textContent = `Moderating answers for question ${selectedQuestionId.slice(0, 8)}…`;
    }

    if (!data.items?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No answers yet',
        description: 'This question has no replies yet.'
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.items.forEach((answer) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: answer.nickname || 'Learner' }),
        createEl('p', { className: 'note', text: answer.body }),
        createEl('div', { className: 'note', text: `Verified: ${answer.is_verified ? 'yes' : 'no'} · State: ${answer.moderation_state}` })
      );

      const actions = createEl('div', { className: 'session-actions' });
      const verifyBtn = createEl('button', { className: 'button', text: 'Verify', attrs: { type: 'button' } });
      verifyBtn.addEventListener('click', async () => {
        await apiPost(`/community/answers/${encodeURIComponent(answer.id)}/verify`, {});
        await loadAnswers();
      });

      const hideBtn = createEl('button', { className: 'button warning', text: 'Hide', attrs: { type: 'button' } });
      hideBtn.addEventListener('click', async () => {
        await apiPatch(`/community/moderation/ANSWER/${encodeURIComponent(answer.id)}/hide`, {});
        await loadAnswers();
      });

      actions.append(verifyBtn, hideBtn);
      row.append(actions);
      frag.append(row);
    });
    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load answers',
      description: 'Refresh and try again.'
    });
  }
}

async function initTutorCommunity() {
  initPortalUX();
  setActiveNav('community');
  trackPortalEvent('tutor_community_viewed', { role: 'tutor' });

  await Promise.all([
    loadQuestions(),
    loadAnswers(),
  ]);
}

initTutorCommunity();
