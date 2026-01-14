(function () {
  'use strict';

  var STORAGE_KEY = 'po_ga_consent';

  function hasGtag() {
    return typeof window.gtag === 'function';
  }

  function getStoredConsent() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (_err) {
      return null;
    }
  }

  function setStoredConsent(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (_err) {
      // ignore
    }
  }

  function isConsentGranted() {
    return getStoredConsent() === 'granted';
  }

  function updateConsentTo(value) {
    if (!hasGtag()) return;

    var granted = value === 'granted';

    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      analytics_storage: granted ? 'granted' : 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  function sendPageView() {
    if (!hasGtag()) return;
    if (!isConsentGranted()) return;

    window.gtag('event', 'page_view', {
      page_location: window.location.href,
      page_path: window.location.pathname + window.location.search,
      page_title: document.title,
    });
  }

  function sendEvent(eventName, params) {
    if (!hasGtag()) return;
    if (!isConsentGranted()) return;

    window.gtag('event', eventName, params || {});
  }

  function createBanner() {
    var banner = document.createElement('div');
    banner.id = 'po-cookie-banner';
    banner.className =
      'fixed inset-x-0 bottom-0 z-[9999] border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-4 shadow-lg';

    banner.innerHTML =
      '<div class="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">' +
      '  <div class="text-sm text-slate-700">' +
      '    <div class="font-semibold text-slate-900">Cookies & analytics</div>' +
      '    <div class="mt-1">We use Google Analytics to understand site usage and improve the service. You can accept or decline analytics cookies. <a class="underline text-slate-900 hover:text-slate-700" href="/privacy.html">Privacy Policy</a>.</div>' +
      '  </div>' +
      '  <div class="flex gap-2">' +
      '    <button id="po-cookie-decline" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Decline</button>' +
      '    <button id="po-cookie-accept" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Accept</button>' +
      '  </div>' +
      '</div>';

    return banner;
  }

  function showBannerIfNeeded() {
    var stored = getStoredConsent();
    if (stored === 'granted' || stored === 'denied') return;

    var banner = createBanner();
    document.body.appendChild(banner);

    var acceptBtn = document.getElementById('po-cookie-accept');
    var declineBtn = document.getElementById('po-cookie-decline');

    function closeBanner() {
      var el = document.getElementById('po-cookie-banner');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    acceptBtn.addEventListener('click', function () {
      setStoredConsent('granted');
      updateConsentTo('granted');
      sendEvent('consent_granted', { consent_type: 'analytics' });
      sendPageView();
      closeBanner();
    });

    declineBtn.addEventListener('click', function () {
      setStoredConsent('denied');
      updateConsentTo('denied');
      closeBanner();
    });
  }

  function trackClicks() {
    document.addEventListener(
      'click',
      function (event) {
        if (!isConsentGranted()) return;

        var target = event.target;
        if (!target) return;

        // Anchor clicks
        var anchor = target.closest && target.closest('a');
        if (anchor && anchor.href) {
          var href = anchor.getAttribute('href') || '';

          // mailto / tel
          if (href.startsWith('mailto:')) {
            sendEvent('email_click', { email: href.replace('mailto:', '') });
            return;
          }
          if (href.startsWith('tel:')) {
            sendEvent('phone_click', { phone: href.replace('tel:', '') });
            return;
          }

          // WhatsApp
          try {
            var url = new URL(anchor.href, window.location.href);
            var host = (url.hostname || '').toLowerCase();
            if (host === 'wa.me' || host === 'api.whatsapp.com') {
              sendEvent('whatsapp_click', { link_url: url.href });
              return;
            }

            // Outbound link
            if (url.protocol === 'http:' || url.protocol === 'https:') {
              if (url.origin !== window.location.origin) {
                sendEvent('outbound_click', {
                  link_url: url.href,
                  link_domain: url.hostname,
                });
                return;
              }
            }
          } catch (_err) {
            // ignore URL parsing issues
          }
        }

        // Button clicks (e.g., guide print/download)
        var button = target.closest && target.closest('button');
        if (button) {
          var label = (button.textContent || '').trim().slice(0, 80);
          var onclick = button.getAttribute('onclick') || '';

          if (onclick.includes('window.print') || label.toLowerCase().includes('download pdf')) {
            sendEvent('download_pdf_click', { label: label || 'Download PDF' });
            return;
          }

          if (label) {
            // Generic button click (kept minimal)
            if (label.toLowerCase().includes('book') || label.toLowerCase().includes('contact')) {
              sendEvent('cta_click', { label: label });
            }
          }
        }
      },
      { capture: true }
    );
  }

  function init() {
    var stored = getStoredConsent();
    if (stored === 'granted' || stored === 'denied') {
      updateConsentTo(stored);
    }

    if (stored === 'granted') {
      sendPageView();
    }

    showBannerIfNeeded();
    trackClicks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
