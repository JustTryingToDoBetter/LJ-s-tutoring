import { apiGet, apiPost, clearChildren, createEl, initPortalUX, qs, renderSkeletonCards, renderStateCard, setActiveNav, trackPortalEvent } from '/assets/portal-shared.js';

const scope = document.body?.dataset?.assistantScope === 'tutor' ? 'tutor' : 'student';
const base = scope === 'tutor' ? '/tutor/assistant' : '/assistant';

let activeThreadId = null;

function renderMessages(container, messages) {
  clearChildren(container);
  if (!messages.length) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'No messages yet',
      description: 'Ask your first question to start the thread.'
    });
    return;
  }

  const frag = document.createDocumentFragment();
  messages.forEach((message) => {
    const row = createEl('div', { className: 'list-row' });
    row.append(
      createEl('strong', { text: message.author === 'assistant' ? 'Odysseus' : 'You' }),
      createEl('p', { text: String(message.content || '') })
    );

    if (Array.isArray(message.citations) && message.citations.length) {
      const citeWrap = createEl('div', { className: 'note' });
      citeWrap.append(createEl('span', { text: 'Sources: ' }));
      message.citations.forEach((citation, index) => {
        if (index > 0) {
          citeWrap.append(document.createTextNode(' · '));
        }
        citeWrap.append(createEl('span', {
          text: `#${index + 1} ${citation.snippet ? String(citation.snippet).slice(0, 80) : 'Vault source'}`
        }));
      });
      row.append(citeWrap);
    }

    frag.append(row);
  });
  container.append(frag);
}

function renderThreads(container, items, onSelect) {
  clearChildren(container);
  if (!items.length) {
    renderStateCard(container, {
      variant: 'empty',
      title: 'No threads yet',
      description: 'Create a thread to ask your first question.'
    });
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((thread) => {
    const card = createEl('button', {
      className: 'button secondary',
      text: thread.title || 'Untitled thread',
      attrs: { type: 'button', 'aria-label': `Open thread ${thread.title || 'Untitled thread'}` }
    });

    if (thread.id === activeThreadId) {
      card.classList.add('active');
    }

    card.addEventListener('click', () => onSelect(thread.id));
    const wrap = createEl('div', { className: 'list-row' });
    wrap.append(
      card,
      createEl('div', { className: 'note', text: String(thread.last_message || '').slice(0, 100) })
    );
    frag.append(wrap);
  });
  container.append(frag);
}

async function loadThread(threadId) {
  const messagesEl = qs('#chatMessages');
  renderSkeletonCards(messagesEl, 3);
  try {
    const data = await apiGet(`${base}/threads/${encodeURIComponent(threadId)}`);
    activeThreadId = threadId;
    qs('#chatHeading').textContent = data.thread?.title || 'Conversation';
    renderMessages(messagesEl, data.messages || []);
    return data;
  } catch {
    renderStateCard(messagesEl, {
      variant: 'error',
      title: 'Could not load thread',
      description: 'Try selecting it again.'
    });
    return null;
  }
}

async function initAssistantPage() {
  setActiveNav('assistant');
  initPortalUX();

  const threadList = qs('#threadList');
  const messagesEl = qs('#chatMessages');
  const newThreadBtn = qs('#newThreadBtn');
  const form = qs('#chatForm');
  const input = qs('#chatInput');
  let currentItems = [];

  renderSkeletonCards(threadList, 3);
  renderSkeletonCards(messagesEl, 2);

  const refreshThreads = async () => {
    try {
      const listData = await apiGet(`${base}/threads`);
      currentItems = listData.items || [];
      renderThreads(threadList, currentItems, async (threadId) => {
        await loadThread(threadId);
        renderThreads(threadList, currentItems, async (nextId) => {
          await loadThread(nextId);
          renderThreads(threadList, currentItems, async () => undefined);
        });
      });

      if (!activeThreadId && currentItems[0]?.id) {
        await loadThread(currentItems[0].id);
        renderThreads(threadList, currentItems, async (threadId) => {
          await loadThread(threadId);
          renderThreads(threadList, currentItems, async () => undefined);
        });
      }
    } catch {
      renderStateCard(threadList, {
        variant: 'error',
        title: 'Could not load threads',
        description: 'Please refresh and try again.'
      });
      renderStateCard(messagesEl, {
        variant: 'error',
        title: 'Chat unavailable',
        description: 'Please refresh and try again.'
      });
    }
  };

  newThreadBtn?.addEventListener('click', async () => {
    newThreadBtn.disabled = true;
    try {
      const created = await apiPost(`${base}/threads`, {
        title: scope === 'tutor' ? 'Tutor planning chat' : 'Student study chat'
      });
      trackPortalEvent('assistant_thread_created', { scope });
      activeThreadId = created.thread?.id || null;
      await refreshThreads();
    } finally {
      newThreadBtn.disabled = false;
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeThreadId) {
      renderStateCard(messagesEl, {
        variant: 'empty',
        title: 'Create a thread first',
        description: 'Use New thread to start the conversation.'
      });
      return;
    }

    const question = input.value.trim();
    if (!question) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await apiPost(`${base}/threads/${encodeURIComponent(activeThreadId)}/messages`, {
        message: question,
        dedupeKey: `msg-${Date.now()}`
      });
      trackPortalEvent('assistant_message_sent', { scope });
      input.value = '';
      await loadThread(activeThreadId);
      trackPortalEvent('assistant_answer_received', { scope });
      await refreshThreads();
    } catch (err) {
      renderStateCard(messagesEl, {
        variant: 'error',
        title: 'Could not send message',
        description: err?.message || 'Please try again.'
      });
    } finally {
      submitBtn.disabled = false;
    }
  });

  await refreshThreads();
}

initAssistantPage();
