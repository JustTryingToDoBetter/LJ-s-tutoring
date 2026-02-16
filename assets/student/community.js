import { apiGet, apiPost, createEl, clearChildren, initPortalUX, qs, renderSkeletonCards, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

let activeRoomId = null;

function renderRooms(container, rooms) {
  clearChildren(container);
  if (!rooms.length) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'No study rooms yet',
      description: 'Create a room by subject and grade to start collaborating.',
    });
    return;
  }

  const frag = document.createDocumentFragment();
  rooms.forEach((room) => {
    const row = createEl('div', { className: 'list-row' });
    row.append(
      createEl('strong', { text: `${room.subject}${room.grade ? ` · Grade ${room.grade}` : ''}` }),
      createEl('div', { className: 'note', text: `${room.member_count || 0} members` }),
    );

    const actions = createEl('div', { className: 'session-actions' });
    actions.append(createEl('button', {
      className: 'button secondary',
      text: room.is_member ? 'Open chat' : 'Join room',
      attrs: { type: 'button' },
    }));

    actions.firstChild?.addEventListener('click', async () => {
      if (!room.is_member) {
        await apiPost(`/community/rooms/${encodeURIComponent(room.id)}/join`, {});
      }
      activeRoomId = room.id;
      await loadMessages();
    });

    row.append(actions);
    frag.append(row);
  });
  container.append(frag);
}

async function loadRooms() {
  const list = qs('#communityRoomsList');
  renderSkeletonCards(list, 3);
  try {
    const data = await apiGet('/community/rooms?page=1&pageSize=20');
    renderRooms(list, data.items || []);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load rooms',
      description: 'Refresh and try again.',
    });
  }
}

async function loadMessages() {
  const label = qs('#selectedRoomLabel');
  const list = qs('#roomMessagesList');

  if (!activeRoomId) {
    clearChildren(list);
    renderStateCard(list, {
      variant: 'empty',
      title: 'No room selected',
      description: 'Join or open a room to view messages.',
    });
    return;
  }

  renderSkeletonCards(list, 2);
  try {
    const data = await apiGet(`/community/rooms/${encodeURIComponent(activeRoomId)}/messages?page=1&pageSize=20`);
    clearChildren(list);
    if (label) {
      label.textContent = 'Live room chat with moderation safeguards enabled.';
    }

    if (!data.items?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No messages yet',
        description: 'Start the conversation with a short, focused question.',
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.items.forEach((item) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: item.nickname || 'Learner' }),
        createEl('p', { className: 'note', text: item.content }),
        createEl('div', { className: 'note', text: new Date(item.created_at).toLocaleString() }),
      );
      frag.append(row);
    });
    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load messages',
      description: 'Open a different room or refresh.',
    });
  }
}

async function loadChallenges() {
  const list = qs('#challengeList');
  renderSkeletonCards(list, 2);

  try {
    const data = await apiGet('/community/challenges?page=1&pageSize=10');
    clearChildren(list);

    if (!data.items?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No active challenges',
        description: 'New weekly challenges will appear here.',
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.items.forEach((challenge) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: challenge.title }),
        createEl('div', { className: 'note', text: `${challenge.subject}${challenge.grade ? ` · Grade ${challenge.grade}` : ''}` }),
        createEl('div', { className: 'note', text: `XP reward: ${challenge.xp_reward}` }),
      );

      const submitBtn = createEl('button', {
        className: 'button secondary',
        text: challenge.has_submitted ? 'Submitted' : 'Submit quick answer',
        attrs: { type: 'button', 'aria-disabled': challenge.has_submitted ? 'true' : 'false' },
      });

      if (!challenge.has_submitted) {
        submitBtn.addEventListener('click', async () => {
          const content = window.prompt('Submit your challenge answer:');
          if (!content) {return;}
          await apiPost(`/community/challenges/${encodeURIComponent(challenge.id)}/submissions`, { content });
          await loadChallenges();
        });
      }

      row.append(submitBtn);
      frag.append(row);
    });
    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load challenges',
      description: 'Refresh and try again.',
    });
  }
}

async function loadQuestions() {
  const list = qs('#questionList');
  renderSkeletonCards(list, 2);

  try {
    const data = await apiGet('/community/questions?page=1&pageSize=10');
    clearChildren(list);

    if (!data.items?.length) {
      renderStateCard(list, {
        variant: 'empty',
        title: 'No peer questions yet',
        description: 'Ask your first question and help peers collaborate.',
      });
      return;
    }

    const frag = document.createDocumentFragment();
    data.items.forEach((question) => {
      const row = createEl('div', { className: 'list-row' });
      row.append(
        createEl('strong', { text: question.title }),
        createEl('div', { className: 'note', text: `${question.subject} · ${question.topic}` }),
        createEl('div', { className: 'note', text: `${question.answer_count || 0} replies` }),
      );
      frag.append(row);
    });
    list.append(frag);
  } catch {
    renderStateCard(list, {
      variant: 'error',
      title: 'Could not load questions',
      description: 'Refresh and try again.',
    });
  }
}

function bindActions() {
  qs('#createRoomBtn')?.addEventListener('click', async () => {
    const subject = window.prompt('Subject (e.g. Mathematics):');
    if (!subject) {return;}
    const grade = window.prompt('Grade (optional):') || undefined;
    await apiPost('/community/rooms', { subject, grade });
    await loadRooms();
  });

  qs('#sendRoomMessageBtn')?.addEventListener('click', async () => {
    if (!activeRoomId) {return;}
    const input = qs('#roomMessageInput');
    const content = String(input?.value || '').trim();
    if (!content) {return;}

    try {
      await apiPost(`/community/rooms/${encodeURIComponent(activeRoomId)}/messages`, { content });
      input.value = '';
      await loadMessages();
    } catch {
      // Keep interaction lightweight.
    }
  });

  qs('#refreshQuestionsBtn')?.addEventListener('click', () => {
    loadQuestions().catch(() => undefined);
  });
}

async function initCommunity() {
  initPortalUX();
  setActiveNav('community');
  trackPortalEvent('community_viewed', { role: 'student' });

  bindActions();
  await Promise.all([
    loadRooms(),
    loadMessages(),
    loadChallenges(),
    loadQuestions(),
  ]);
}

initCommunity();
