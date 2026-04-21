
import { apiFetch, loadJson, renderList, renderLoading, renderError, renderEmpty, setActiveNav } from '/assets/common.js';
import { track } from '/assets/analytics.js';

setActiveNav('community');
let activeRoomId = null;

function formatSubtitle(parts) {
  return parts.filter(Boolean).join(' • ');
}

function toText(value, fallback = '') {
  if (value === null || value === undefined) {return fallback;}
  return String(value);
}

function renderRoom(room) {
  const title = document.createElement('strong');
  title.textContent = toText(room.subject, 'Study room');

  const subtitle = document.createElement('div');
  subtitle.textContent = formatSubtitle([
    toText(room.grade, 'Mixed grade'),
    `${Number(room.memberCount || 0)} members`,
  ]);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary';
  button.textContent = 'Open room';
  button.dataset.roomId = toText(room.id);
  button.addEventListener('click', async () => {
    activeRoomId = toText(room.id);
    const label = document.getElementById('selectedRoomLabel');
    if (label) {
      label.textContent = `Room: ${toText(room.subject, 'Selected room')}`;
    }
    try {
      const res = await apiFetch(`/community/rooms/${encodeURIComponent(activeRoomId)}/join`, { method: 'POST' });
      if (res.ok) {
        track('community.room.joined', { roomId: activeRoomId });
      }
    } catch (_err) {
      /* non-fatal */
    }
    await loadMessages();
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'list-item';
  wrapper.append(title, subtitle, button);
  return wrapper;
}

async function loadRooms() {
  const target = document.getElementById('communityRoomsList');
  renderLoading(target, 'Loading study rooms…');
  try {
    const data = await loadJson('/community/rooms');
    renderList(target, data.items || [], renderRoom);
  } catch (_err) {
    renderError(target, 'Could not load study rooms.');
  }
}

function renderMessage(message) {
  return {
    rows: [
      { el: 'strong', text: toText(message.nickname || message.authorName, 'Member') },
      { text: toText(message.content) },
    ],
  };
}

async function loadMessages() {
  const target = document.getElementById('roomMessagesList');
  if (!activeRoomId) {
    renderEmpty(target, 'Select a room to see messages.');
    return;
  }
  renderLoading(target, 'Loading messages…');
  try {
    const data = await loadJson(`/community/rooms/${encodeURIComponent(activeRoomId)}/messages`);
    renderList(target, data.items || [], renderMessage);
  } catch (_err) {
    renderError(target, 'Could not load messages.');
  }
}

function renderChallenge(challenge) {
  return {
    rows: [
      { el: 'strong', text: toText(challenge.title, 'Challenge') },
      { text: formatSubtitle([toText(challenge.subject), `${toText(challenge.weekStart)} → ${toText(challenge.weekEnd)}`]) },
    ],
  };
}

async function loadChallenges() {
  const target = document.getElementById('challengeList');
  renderLoading(target, 'Loading challenges…');
  try {
    const data = await loadJson('/community/challenges');
    renderList(target, data.items || [], renderChallenge);
  } catch (_err) {
    renderError(target, 'Could not load challenges.');
  }
}

function renderQuestion(question) {
  return {
    rows: [
      { el: 'strong', text: toText(question.title, 'Question') },
      { text: formatSubtitle([toText(question.subject), toText(question.topic)]) },
    ],
  };
}

async function loadQuestions() {
  const target = document.getElementById('questionList');
  renderLoading(target, 'Loading peer Q&A…');
  try {
    const data = await loadJson('/community/questions');
    renderList(target, data.items || [], renderQuestion);
  } catch (_err) {
    renderError(target, 'Could not load Q&A.');
  }
}

document.getElementById('createRoomBtn')?.addEventListener('click', async () => {
  const subject = window.prompt('Study room subject');
  if (!subject) {return;}
  try {
    const res = await apiFetch('/community/rooms', { method: 'POST', body: { subject } });
    if (res.ok) {
      track('community.room.created', { subject });
    }
  } catch (_err) {
    /* non-fatal */
  }
  await loadRooms();
});

document.getElementById('sendRoomMessageBtn')?.addEventListener('click', async () => {
  if (!activeRoomId) {return;}
  const textarea = document.getElementById('roomMessageInput');
  const content = textarea.value.trim();
  if (!content) {return;}
  try {
    const res = await apiFetch(`/community/rooms/${encodeURIComponent(activeRoomId)}/messages`, { method: 'POST', body: { content } });
    if (res.ok) {
      track('community.message.posted', { roomId: activeRoomId, length: content.length });
    }
  } catch (_err) {
    /* non-fatal */
  }
  textarea.value = '';
  await loadMessages();
});

document.getElementById('refreshQuestionsBtn')?.addEventListener('click', loadQuestions);

await Promise.all([loadRooms(), loadChallenges(), loadQuestions()]);
