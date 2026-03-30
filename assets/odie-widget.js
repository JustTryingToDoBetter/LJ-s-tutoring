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

  var conversationHistory = [];
  var isOpen = false;
  var isLoading = false;

  function resolveApiBase() {
    var raw = String(window.__PO_API_BASE__ || '').replace(/\/$/, '');
    var host = window.location.hostname;
    var isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!raw || raw === '__PO_API_BASE__') {
      return isLocal ? window.location.protocol + '//' + host + ':3001' : '';
    }
    return raw;
  }

  function resolveAccessKey() {
    var key = String(window.__ODIE_ACCESS_KEY__ || '');
    return key && key !== '__PO_ODIE_ACCESS_KEY__' ? key : '';
  }

  function togglePanel() {
    isOpen = !isOpen;
    var panel = document.getElementById('odie-panel');
    var btn = document.getElementById('odie-btn');
    panel.classList.toggle('odie-open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      setTimeout(function () {
        var input = document.getElementById('odie-input');
        if (input) input.focus();
      }, 260);
    }
  }

  function scrollMessages() {
    var container = document.getElementById('odie-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }

  function appendMessage(role, text) {
    var container = document.getElementById('odie-messages');
    if (!container) return;

    var isUser = role === 'user';
    var wrapper = document.createElement('div');
    wrapper.className = 'odie-msg ' + (isUser ? 'odie-msg-user' : 'odie-msg-bot');

    if (!isUser) {
      var avatar = document.createElement('div');
      avatar.className = 'odie-msg-small-avatar';
      avatar.textContent = 'O';
      wrapper.appendChild(avatar);
    }

    var bubble = document.createElement('div');
    bubble.className = 'odie-msg-bubble';
    bubble.textContent = text;
    wrapper.appendChild(bubble);

    container.appendChild(wrapper);
    scrollMessages();
  }

  function showTyping() {
    var container = document.getElementById('odie-messages');
    if (!container) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'odie-msg odie-msg-bot';
    wrapper.id = 'odie-typing-row';

    var avatar = document.createElement('div');
    avatar.className = 'odie-msg-small-avatar';
    avatar.textContent = 'O';
    wrapper.appendChild(avatar);

    var dots = document.createElement('div');
    dots.className = 'odie-typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    wrapper.appendChild(dots);

    container.appendChild(wrapper);
    scrollMessages();
  }

  function hideTyping() {
    var el = document.getElementById('odie-typing-row');
    if (el) el.remove();
  }

  function setLoading(state) {
    isLoading = state;
    var btn = document.getElementById('odie-send');
    if (btn) btn.disabled = state;
  }

  async function sendMessage() {
    if (isLoading) return;

    var input = document.getElementById('odie-input');
    if (!input) return;

    var message = input.value.trim();
    if (!message) return;

    input.value = '';
    appendMessage('user', message);
    setLoading(true);
    showTyping();

    try {
      var apiBase = resolveApiBase();
      var accessKey = resolveAccessKey();
      var headers = { 'Content-Type': 'application/json' };
      if (accessKey) headers['x-odie-access-key'] = accessKey;

      var res = await fetch(apiBase + '/assistant/chat', {
        method: 'POST',
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

      var data = await res.json();
      var reply = (data && data.text) ? data.text : "Sorry, I couldn't get a response. Try WhatsApp or email us directly!";

      conversationHistory.push({ role: 'user', content: message });
      conversationHistory.push({ role: 'assistant', content: reply });
      appendMessage('assistant', reply);
    } catch (_err) {
      hideTyping();
      appendMessage('assistant', "Hmm, I can't connect right now. Feel free to reach us on WhatsApp (+27 67 932 7754) or email projectodysseus10@gmail.com!");
    } finally {
      setLoading(false);
      var inp = document.getElementById('odie-input');
      if (inp && isOpen) inp.focus();
    }
  }

  function init() {
    var btn = document.getElementById('odie-btn');
    var closeBtn = document.getElementById('odie-close');
    var sendBtn = document.getElementById('odie-send');
    var input = document.getElementById('odie-input');

    if (!btn || !closeBtn || !sendBtn || !input) return;

    btn.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', togglePanel);
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Seed the welcome message
    appendMessage('assistant', WELCOME_MSG);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
