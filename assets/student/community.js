
import { apiFetch, loadJson, renderList, setActiveNav } from '/assets/common.js';
setActiveNav('community');
let activeRoomId = null;

async function loadRooms() {
  const data = await loadJson('/community/rooms').catch(() => ({ items: [] }));
  renderList(document.getElementById('communityRoomsList'), data.items || [], (room) => `
    <strong>${room.subject}</strong>
    <div>${room.grade || 'Mixed grade'} • ${room.memberCount || 0} members</div>
    <button class="button secondary" type="button" data-room-id="${room.id}">Open room</button>
  `);
  document.querySelectorAll('[data-room-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      activeRoomId = button.getAttribute('data-room-id');
      document.getElementById('selectedRoomLabel').textContent = `Room: ${button.closest('.list-item')?.querySelector('strong')?.textContent || 'Selected room'}`;
      await apiFetch(`/community/rooms/${activeRoomId}/join`, { method: 'POST' }).catch(() => null);
      await loadMessages();
    });
  });
}

async function loadMessages() {
  if (!activeRoomId) return;
  const data = await loadJson(`/community/rooms/${activeRoomId}/messages`).catch(() => ({ items: [] }));
  renderList(document.getElementById('roomMessagesList'), data.items || [], (message) => `
    <strong>${message.nickname || message.authorName || 'Member'}</strong>
    <div>${message.content}</div>
  `);
}

async function loadChallenges() {
  const data = await loadJson('/community/challenges').catch(() => ({ items: [] }));
  renderList(document.getElementById('challengeList'), data.items || [], (challenge) => `
    <strong>${challenge.title}</strong>
    <div>${challenge.subject} • ${challenge.weekStart} → ${challenge.weekEnd}</div>
  `);
}

async function loadQuestions() {
  const data = await loadJson('/community/questions').catch(() => ({ items: [] }));
  renderList(document.getElementById('questionList'), data.items || [], (question) => `
    <strong>${question.title}</strong>
    <div>${question.subject} • ${question.topic}</div>
  `);
}

document.getElementById('createRoomBtn')?.addEventListener('click', async () => {
  const subject = window.prompt('Study room subject');
  if (!subject) return;
  await apiFetch('/community/rooms', { method: 'POST', body: { subject } }).catch(() => null);
  await loadRooms();
});

document.getElementById('sendRoomMessageBtn')?.addEventListener('click', async () => {
  if (!activeRoomId) return;
  const textarea = document.getElementById('roomMessageInput');
  const content = textarea.value.trim();
  if (!content) return;
  await apiFetch(`/community/rooms/${activeRoomId}/messages`, { method: 'POST', body: { content } }).catch(() => null);
  textarea.value = '';
  await loadMessages();
});

document.getElementById('refreshQuestionsBtn')?.addEventListener('click', loadQuestions);

await Promise.all([loadRooms(), loadChallenges(), loadQuestions()]);
