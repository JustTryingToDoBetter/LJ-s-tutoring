(function () {
  'use strict';

  const SYSTEM_PROMPT =
    'You are Odie, a friendly AI assistant for Project Odysseus — a premium Mathematics tutoring service based in Cape Town, South Africa. ' +
    'You help students (Grades 8–12) and parents get quick answers and feel confident about booking.\n\n' +
    'Key facts about Project Odysseus:\n' +
    '- 1-on-1 Mathematics tutoring for Grades 8–12 (CAPS curriculum only, not Maths Literacy)\n' +
    '- Two tutors: Liam Newton (BSc Investment Banking, Stellenbosch University) and Jaydin Morrison (BSc Honours Computer Science, UWC)\n' +
    '- Sessions run Monday–Thursday 5pm–8pm, with limited weekend slots available\n' +
    '- Pricing: R180–R250 per hour (far cheaper than big agencies at R300–R500)\n' +
    '- Money-back guarantee on the first session\n' +
    '- WhatsApp: +27 67 932 7754 | Email: projectodysseus10@gmail.com\n' +
    '- 150+ students helped, 95% grade improvement rate, 2+ years of experience\n\n' +
    'Respond in a warm, concise, encouraging tone. Keep replies to 2–4 sentences where possible. ' +
    'If someone asks a maths question, give a brief pointer and encourage them to book a session for in-depth help. ' +
    'Do not invent any information not listed above.';

  const WELCOME_MSG =
    "Hi! I'm Odie 👋 I'm here to help with any questions about Project Odysseus — subjects, pricing, scheduling, or how we can boost your Maths grade. What would you like to know?";

  const conversationHistory = [];
  let isOpen = false;
  let isLoading = false;
  let assistantLiveStatus = 'checking';

  function isLoopbackBase(url) {
    return /^https?:\/\/(localhost|127(?:\.\d{1,3}){3})(?::\d+)?$/i.test(url);
  }

  function resolveApiBase() {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (isLocal) {
      return window.location.protocol + '//' + host + ':3001';
    }
    const raw = String(window.__PO_API_BASE__ || '').replace(/\/$/, '');
    if (!raw || raw === '__PO_API_BASE__' || isLoopbackBase(raw)) {
      return '/api';
    }
    return raw;
  }

  function assistantEnabled() {
    if (typeof window.__ODIE_ASSISTANT_ENABLED__ === 'boolean') {
      return window.__ODIE_ASSISTANT_ENABLED__;
    }
    return true;
  }

  function apiUrl(path) {
    const base = resolveApiBase();
    return base ? base + path : path;
  }

  function setPresence(state) {
    assistantLiveStatus = state;
    const panel = document.getElementById('odie-panel');
    const sub = panel ? panel.querySelector('.odie-header-sub') : null;

    if (panel) {
      panel.setAttribute('data-odie-status', state);
    }
    if (!sub) {return;}

    if (state === 'live') {
      sub.textContent = 'Online - ask me anything';
      return;
    }
    if (state === 'checking') {
      sub.textContent = 'Connecting...';
      return;
    }
    sub.textContent = 'Limited - WhatsApp backup available';
  }

  async function refreshPresence() {
    setPresence('checking');
    try {
      const res = await fetch(apiUrl('/health'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      setPresence(res.ok ? 'live' : 'offline');
    } catch (_err) {
      setPresence('offline');
    }
  }

  function togglePanel() {
    isOpen = !isOpen;
    const panel = document.getElementById('odie-panel');
    const btn = document.getElementById('odie-btn');
    panel.classList.toggle('odie-open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      if (assistantLiveStatus !== 'live') {
        refreshPresence();
      }
      setTimeout(function () {
        const input = document.getElementById('odie-input');
        if (input) {input.focus();}
      }, 260);
    }
  }

  function scrollMessages() {
    const container = document.getElementById('odie-messages');
    if (container) {container.scrollTop = container.scrollHeight;}
  }

  function appendMessage(role, text) {
    const container = document.getElementById('odie-messages');
    if (!container) {return;}

    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = 'odie-msg ' + (isUser ? 'odie-msg-user' : 'odie-msg-bot');

    if (!isUser) {
      const avatar = document.createElement('div');
      avatar.className = 'odie-msg-small-avatar';
      avatar.textContent = 'O';
      wrapper.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'odie-msg-bubble';
    bubble.textContent = text;
    wrapper.appendChild(bubble);

    container.appendChild(wrapper);
    scrollMessages();
  }

  function showTyping() {
    const container = document.getElementById('odie-messages');
    if (!container) {return;}

    const wrapper = document.createElement('div');
    wrapper.className = 'odie-msg odie-msg-bot';
    wrapper.id = 'odie-typing-row';

    const avatar = document.createElement('div');
    avatar.className = 'odie-msg-small-avatar';
    avatar.textContent = 'O';
    wrapper.appendChild(avatar);

    const dots = document.createElement('div');
    dots.className = 'odie-typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    wrapper.appendChild(dots);

    container.appendChild(wrapper);
    scrollMessages();
  }

  function hideTyping() {
    const el = document.getElementById('odie-typing-row');
    if (el) {el.remove();}
  }

  function setLoading(state) {
    isLoading = state;
    const btn = document.getElementById('odie-send');
    if (btn) {btn.disabled = state;}
  }

  async function sendMessage() {
    if (isLoading) {return;}

    const input = document.getElementById('odie-input');
    if (!input) {return;}

    const message = input.value.trim();
    if (!message) {return;}

    input.value = '';
    appendMessage('user', message);
    setLoading(true);
    showTyping();

    try {
      const headers = { 'Content-Type': 'application/json' };

      const res = await fetch(apiUrl('/assistant/chat'), {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({
          message: message,
          history: conversationHistory.slice(-20),
          personaVariant: 'study_coach',
          systemPrompt: SYSTEM_PROMPT,
        }),
      });

      hideTyping();

      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }

      const data = await res.json();
      const reply = (data && data.text) ? data.text : "Sorry, I couldn't get a response. Try WhatsApp or email us directly!";

      conversationHistory.push({ role: 'user', content: message });
      conversationHistory.push({ role: 'assistant', content: reply });
      setPresence('live');
      appendMessage('assistant', reply);
    } catch (_err) {
      hideTyping();
      setPresence('offline');
      appendMessage('assistant', "Hmm, I can't connect right now. Feel free to reach us on WhatsApp (+27 67 932 7754) or email projectodysseus10@gmail.com!");
    } finally {
      setLoading(false);
      const inp = document.getElementById('odie-input');
      if (inp && isOpen) {inp.focus();}
    }
  }

  function hideWidgetUi() {
    const btn = document.getElementById('odie-btn');
    const panel = document.getElementById('odie-panel');
    if (btn) {
      btn.setAttribute('hidden', '');
      btn.setAttribute('aria-hidden', 'true');
    }
    if (panel) {
      panel.setAttribute('hidden', '');
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  function init() {
    if (!assistantEnabled()) {
      hideWidgetUi();
      return;
    }
    const btn = document.getElementById('odie-btn');
    const closeBtn = document.getElementById('odie-close');
    const sendBtn = document.getElementById('odie-send');
    const input = document.getElementById('odie-input');

    if (!btn || !closeBtn || !sendBtn || !input) {return;}

    btn.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', togglePanel);
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    setPresence('checking');
    refreshPresence();

    // Seed the welcome message
    appendMessage('assistant', WELCOME_MSG);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
