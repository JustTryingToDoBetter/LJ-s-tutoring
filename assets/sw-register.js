/* assets/sw-register.js
   Registers the root service worker and shows an update toast when a new SW is waiting.
*/
(() => {
  'use strict';

  if (!('serviceWorker' in navigator)) {return;}

  const SW_URL = '/sw.js';
  let didPrompt = false;

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') {n.className = v;}
      else if (k === 'text') {n.textContent = v;}
      else if (k.startsWith('on') && typeof v === 'function') {n.addEventListener(k.slice(2).toLowerCase(), v);}
      else if (v !== false && v !== null && v !== undefined) {n.setAttribute(k, String(v));}
    }
    for (const c of children) {n.append(c);}
    return n;
  }

  function ensureToastStyles() {
    if (document.getElementById('po-sw-toast-styles')) {return;}

    const style = el('style', { id: 'po-sw-toast-styles' });
    style.textContent = `
      .po-sw-toast {
        position: fixed;
        left: 50%;
        bottom: calc(16px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        max-width: min(560px, calc(100vw - 24px));
        width: max-content;
        z-index: 9999;
        border-radius: 16px;
        padding: 12px;
        display: flex;
        gap: 10px;
        align-items: center;
        box-shadow: 0 10px 30px rgba(0,0,0,.30);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        background: rgba(20, 20, 24, 0.72);
        color: #fff;
      }
      .po-sw-toast__text { display: flex; flex-direction: column; gap: 2px; }
      .po-sw-toast__title { font-weight: 700; font-size: 13px; line-height: 1.2; }
      .po-sw-toast__sub { font-size: 12px; opacity: .85; }
      .po-sw-toast__actions { display: flex; gap: 8px; margin-left: 8px; }
      .po-sw-btn {
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.10);
        color: inherit;
        border-radius: 12px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .po-sw-btn:hover { background: rgba(255,255,255,.16); }
      .po-sw-btn--primary { background: rgba(255,255,255,.18); }
      .po-sw-btn--primary:hover { background: rgba(255,255,255,.24); }
    `;
    document.head.appendChild(style);
  }

  function showUpdateToast(reg) {
    if (didPrompt) {return;}
    didPrompt = true;

    ensureToastStyles();

    const toast = el('div', { class: 'po-sw-toast', role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'po-sw-toast__text' }, [
        el('div', { class: 'po-sw-toast__title', text: 'Update available' }),
        el('div', { class: 'po-sw-toast__sub', text: 'Refresh to get the latest version.' }),
      ]),
      el('div', { class: 'po-sw-toast__actions' }, [
        el('button', {
          class: 'po-sw-btn',
          type: 'button',
          onClick: () => toast.remove(),
        }, ['Later']),
        el('button', {
          class: 'po-sw-btn po-sw-btn--primary',
          type: 'button',
          onClick: () => {
            toast.remove();
            reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
          },
        }, ['Update']),
      ]),
    ]);

    document.body.appendChild(toast);
  }

  async function registerSW() {
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });

      // If an update is already waiting (common immediately after deploy)
      if (reg.waiting) {showUpdateToast(reg);}

      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) {return;}

        next.addEventListener('statechange', () => {
          // "installed" + has controller => this is an update (not first install)
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(reg);
          }
        });
      });

      // Reload once when the new SW takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) {return;}
        refreshing = true;
        window.location.reload();
      });
    } catch (e) {
      console.warn('[SW] registration failed:', e);
    }
  }

  window.addEventListener('load', registerSW, { once: true });
})();