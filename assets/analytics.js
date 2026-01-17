(function () {
  'use strict';

  const STORAGE_KEY = 'po_ga_consent';
  const GA_MEASUREMENT_ID = 'G-YLSHSGSXNE';

  let gtagLoadPromise = null;

  function isDoNotTrackEnabled() {
    try {
      const dnt =
        navigator.doNotTrack ||
        window.doNotTrack ||
        (navigator.msDoNotTrack ? navigator.msDoNotTrack : null);
      return dnt === '1' || dnt === 'yes';
    } catch (_err) {
      return false;
    }
  }

  function ensureGtagLoaded() {
    if (typeof window.gtag === 'function') {return Promise.resolve();}
    if (gtagLoadPromise) {return gtagLoadPromise;}

    gtagLoadPromise = new Promise(function (resolve, reject) {
      // Define dataLayer + gtag stub early
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };

      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
      script.onload = function () {
        try {
          window.gtag('js', new Date());
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = function () {
        reject(new Error('Failed to load gtag.js'));
      };

      document.head.appendChild(script);
    });

    return gtagLoadPromise;
  }

  function ensureGtagConfigured() {
    if (!hasGtag()) {return;}
    if (window.__po_ga_configured) {return;}
    window.__po_ga_configured = true;
    // Do not auto send; we send page_view ourselves when consent is granted.
    window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
  }

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
    if (!hasGtag()) {return;}

    const granted = value === 'granted';

    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      analytics_storage: granted ? 'granted' : 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  function sendPageView() {
    if (!hasGtag()) {return;}
    if (!isConsentGranted()) {return;}

    ensureGtagConfigured();

    window.gtag('event', 'page_view', {
      page_location: window.location.href,
      page_path: window.location.pathname + window.location.search,
      page_title: document.title,
    });
  }

  function sendEvent(eventName, params) {
    if (!hasGtag()) {return;}
    if (!isConsentGranted()) {return;}

    ensureGtagConfigured();

    window.gtag('event', eventName, params || {});
  }

  // ==========================================
  // Web Vitals (lightweight, no dependencies)
  // ==========================================
  let vitalsStarted = false;

  function startWebVitals() {
    if (vitalsStarted) {return;}
    if (!isConsentGranted()) {return;}
    if (typeof PerformanceObserver !== 'function') {return;}

    vitalsStarted = true;

    let clsValue = 0;
    let lcpEntry = 0;
    let inpValue = 0;

    function sendVital(name, value, extra) {
      sendEvent('web_vital', {
        metric_name: name,
        metric_value: Math.round(value * 1000) / 1000,
        page_path: window.location.pathname,
        ...(extra || {}),
      });
    }

    // CLS
    try {
      const clsObserver = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          // Ignore shifts triggered by user input
          if (!entry.hadRecentInput) {clsValue += entry.value;}
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (_err) {
      // ignore
    }

    // LCP
    try {
      const lcpObserver = new PerformanceObserver(function (list) {
        const entries = list.getEntries();
        if (entries && entries.length) {lcpEntry = entries[entries.length - 1];}
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_err) {
      // ignore
    }

    // INP (best-effort using Event Timing API)
    try {
      const inpObserver = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          // Only count interactions
          if (!entry.interactionId) {return;}
          inpValue = Math.max(inpValue, entry.duration);
        });
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    } catch (_err) {
      // ignore
    }

    // Report when the page is being hidden (captures SPA-unfriendly but fine for static)
    window.addEventListener(
      'pagehide',
      function () {
        if (!isConsentGranted()) {return;}

        if (typeof clsValue === 'number') {sendVital('CLS', clsValue);}
        if (lcpEntry && typeof lcpEntry.startTime === 'number') {
          sendVital('LCP', lcpEntry.startTime, {
            lcp_element: lcpEntry.element ? lcpEntry.element.tagName : undefined,
          });
        }
        if (inpValue > 0) {sendVital('INP', inpValue);}
      },
      { capture: true },
    );
  }

  // ==========================================
  // Error Monitoring (consent-gated)
  // ==========================================
  let errorMonitoringStarted = false;

  function startErrorMonitoring() {
    if (errorMonitoringStarted) {return;}
    if (!isConsentGranted()) {return;}

    errorMonitoringStarted = true;

    // Avoid floods on broken pages
    const MAX_ERRORS_PER_PAGE = 10;
    let sent = 0;

    function shouldSend() {
      sent += 1;
      return sent <= MAX_ERRORS_PER_PAGE;
    }

    function safeStr(value, maxLen) {
      try {
        const s = String(value);
        return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
      } catch (_err) {
        return '';
      }
    }

    window.addEventListener(
      'error',
      function (event) {
        if (!isConsentGranted()) {return;}
        if (!shouldSend()) {return;}

        // Ignore opaque "Script error." cases (usually cross-origin without CORS headers)
        const msg = event && event.message ? event.message : '';
        if (msg === 'Script error.' || msg === 'Script error') {return;}

        sendEvent('js_error', {
          error_message: safeStr(msg, 300),
          error_source: safeStr(event && event.filename ? event.filename : '', 200),
          error_lineno: event && typeof event.lineno === 'number' ? event.lineno : undefined,
          error_colno: event && typeof event.colno === 'number' ? event.colno : undefined,
          page_path: window.location.pathname,
        });
      },
      { capture: true },
    );

    window.addEventListener(
      'unhandledrejection',
      function (event) {
        if (!isConsentGranted()) {return;}
        if (!shouldSend()) {return;}

        const reason = event && event.reason ? event.reason : '';
        const message = reason && reason.message ? reason.message : reason;

        sendEvent('js_unhandled_rejection', {
          rejection_reason: safeStr(message, 300),
          page_path: window.location.pathname,
        });
      },
      { capture: true },
    );
  }

  function createBanner() {
    const banner = document.createElement('div');
    banner.id = 'po-cookie-banner';
    banner.className =
      'fixed inset-x-0 bottom-0 z-[9999] border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-4 shadow-lg';

    const dntNote = isDoNotTrackEnabled()
      ? '<div class="mt-2 text-xs text-slate-600"><strong>Note:</strong> Your browser has “Do Not Track” enabled. Analytics will stay off unless you accept.</div>'
      : '';

    banner.innerHTML =
      '<div class="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">' +
      '  <div class="text-sm text-slate-700">' +
      '    <div class="font-semibold text-slate-900">Cookies & analytics</div>' +
      '    <div class="mt-1">We use Google Analytics to understand site usage and improve the service. You can accept or decline analytics cookies. <a class="underline text-slate-900 hover:text-slate-700" href="/privacy.html">Privacy Policy</a>.</div>' +
      dntNote +
      '  </div>' +
      '  <div class="flex gap-2">' +
      '    <button id="po-cookie-decline" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Decline</button>' +
      '    <button id="po-cookie-accept" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Accept</button>' +
      '  </div>' +
      '</div>';

    return banner;
  }

  function showBannerIfNeeded() {
    const stored = getStoredConsent();
    if (stored === 'granted' || stored === 'denied') {return;}

    const banner = createBanner();
    document.body.appendChild(banner);

    const acceptBtn = document.getElementById('po-cookie-accept');
    const declineBtn = document.getElementById('po-cookie-decline');

    function closeBanner() {
      const el = document.getElementById('po-cookie-banner');
      if (el && el.parentNode) {el.parentNode.removeChild(el);}
    }

    acceptBtn.addEventListener('click', function () {
      setStoredConsent('granted');
      ensureGtagLoaded()
        .then(function () {
          updateConsentTo('granted');
          ensureGtagConfigured();
          sendEvent('consent_granted', { consent_type: 'analytics' });
          sendPageView();
          startWebVitals();
          startErrorMonitoring();
        })
        .catch(function () {
          // If GA can't load, still close the banner (fail closed).
        });
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
        if (!isConsentGranted()) {return;}

        const target = event.target;
        if (!target) {return;}

        // Anchor clicks
        const anchor = target.closest && target.closest('a');
        if (anchor && anchor.href) {
          const href = anchor.getAttribute('href') || '';

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
            const url = new URL(anchor.href, window.location.href);
            const host = (url.hostname || '').toLowerCase();
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
        const button = target.closest && target.closest('button');
        if (button) {
          const label = (button.textContent || '').trim().slice(0, 80);
          const onclick = button.getAttribute('onclick') || '';

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
      { capture: true },
    );
  }

  function init() {
    const stored = getStoredConsent();
    if (stored === 'granted') {
      ensureGtagLoaded()
        .then(function () {
          updateConsentTo('granted');
          ensureGtagConfigured();
          sendPageView();
          startWebVitals();
          startErrorMonitoring();
        })
        .catch(function () {
          // If GA can't load, silently do nothing.
        });
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
