/**
 * Project Odysseus – Critical JS
 *
 * Goal: keep first interaction fast by only running critical UI logic on load,
 * then loading non-critical features (carousel, observers, scroll effects, etc.)
 * in an idle callback.
 */
(function () {
  'use strict';

  // ==========================================
  // CONFIGURATION - Single source of truth
  // ==========================================
  const CONFIG = {
    // WhatsApp number (country code, no + or spaces)
    whatsappNumber: '27679327754',

    // Formspree endpoint
    formspreeEndpoint: 'https://formspree.io/f/xreebzqa',

    // Contact email
    email: 'projectodysseus10@gmail.com',

    // Countdown target date (YYYY, Month-1, Day, Hour, Min)
    // Month is 0-indexed: January = 0, February = 1, etc.
    countdownDate: new Date(2026, 1, 15, 17, 0, 0), // Feb 15, 2026 5pm
  };

  // Keep backwards compatibility for any inline references
  window.CONFIG = CONFIG;

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ==========================================
  // WHATSAPP LINK NORMALISATION (critical)
  // ==========================================
  function updateAllWhatsAppLinks(message) {
    const msg =
      message || "Hi! I'm interested in Maths tutoring. Can you tell me more about your packages?";
    $$('a[href*="wa.me"]').forEach(function (link) {
      link.href = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(msg);
    });
  }

  // Share minimal helpers with the non-critical bundle
  window.PO_APP = {
    CONFIG: CONFIG,
    $: $,
    $$: $$,
    isValidEmail: isValidEmail,
    updateAllWhatsAppLinks: updateAllWhatsAppLinks,
  };

  // ==========================================
  // DARK MODE TOGGLE (critical)
  // ==========================================
  function initDarkMode() {
  const toggle = $('#dark-mode-toggle');
  const icon = $('#dark-mode-icon');
  const html = document.documentElement;

  if (!toggle || !icon) {return;}

  const THEME_KEY = 'po_theme';     // 'dark' | 'light'
  const LEGACY_KEY = 'darkMode';    // 'true' | 'false' (old)

  // Read theme preference with backwards compatibility.
  function readTheme() {
    // 1) New key wins
    const modern = localStorage.getItem(THEME_KEY);
    if (modern === 'dark' || modern === 'light') {return modern;}

    // 2) Legacy key fallback
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'true') {return 'dark';}
    if (legacy === 'false') {return 'light';}

    // 3) System default
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    const isDark = mode === 'dark';

    html.classList.toggle('dark', isDark);

    // Keep icon consistent
    icon.classList.toggle('fa-moon', !isDark);
    icon.classList.toggle('fa-sun', isDark);

    // Persist BOTH keys for backwards compatibility across versions/pages
    localStorage.setItem(THEME_KEY, mode);
    localStorage.setItem(LEGACY_KEY, String(isDark));
  }

  // Initial load
  applyTheme(readTheme());

  // Toggle handler
  toggle.addEventListener('click', function () {
    const isDark = html.classList.contains('dark');
    applyTheme(isDark ? 'light' : 'dark');
  });
}

  // ==========================================
  // COUNTDOWN TIMER (critical)
  // ==========================================
  function initCountdown() {
    function update() {
      const now = Date.now();
      const target = CONFIG.countdownDate.getTime();
      const diff = target - now;

      if (diff > 0) {
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        const elDays = $('#countdown-days');
        const elHours = $('#countdown-hours');
        const elMins = $('#countdown-mins');
        const elSecs = $('#countdown-secs');

        if (elDays) {elDays.textContent = String(days).padStart(2, '0');}
        if (elHours) {elHours.textContent = String(hours).padStart(2, '0');}
        if (elMins) {elMins.textContent = String(mins).padStart(2, '0');}
        if (elSecs) {elSecs.textContent = String(secs).padStart(2, '0');}
      } else {
        const countdown = $('#countdown');
        if (countdown) {countdown.innerHTML = '<p class="text-brand-gold font-bold">Bookings Now Open!</p>';}
      }
    }

    update();
    setInterval(update, 1000);
  }

  // ==========================================
  // MOBILE MENU (critical)
  // ==========================================
  function initMobileMenu() {
    const btn = $('#mobile-menu-btn');
    const menu = $('#mobile-menu');
    const icon = $('#menu-icon');
    if (!btn || !menu || !icon) {return;}

    btn.addEventListener('click', function () {
      const isOpen = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen);
      icon.classList.toggle('fa-bars');
      icon.classList.toggle('fa-times');
    });

    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        icon.classList.add('fa-bars');
        icon.classList.remove('fa-times');
      });
    });
  }

  // ==========================================
  // FAQ ACCORDION (critical)
  // ==========================================
  function initFaq() {
    $$('.faq-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const item = btn.parentElement;
        const isOpen = item.classList.contains('open');

        $$('.faq-item').forEach(function (i) {
          i.classList.remove('open');
        });
        $$('.faq-btn').forEach(function (b) {
          b.setAttribute('aria-expanded', 'false');
        });

        if (!isOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  // ==========================================
  // CONTACT FORM (critical)
  // ==========================================
  function initContactForm() {
    const form = $('#contact-form');
    if (!form) {return;}

    const formStatus = document.createElement('div');
    formStatus.id = 'form-status';
    formStatus.className = 'mt-4 text-center hidden';
    form.appendChild(formStatus);

    function trackFormEvent(eventName, params) {
      if (typeof window.gtag !== 'function') {return;}
      if (localStorage.getItem('po_ga_consent') !== 'granted') {return;}
      window.gtag('event', eventName, params || {});
    }

    function showFormError(message, options) {
      const opts = options || {};
      formStatus.innerHTML =
        '<p class="text-red-400"><i class="fas fa-exclamation-circle mr-2"></i>' + message + '</p>';
      formStatus.classList.remove('hidden');
      if (!opts.sticky) {
        setTimeout(function () {
          formStatus.classList.add('hidden');
        }, 5000);
      }
    }

    function showFormFallback(details) {
      const subject = 'Tutoring enquiry (website form)';
      const body =
        'Hi Project Odysseus,%0D%0A%0D%0A' +
        'My form submission failed, but here are my details:%0D%0A' +
        (details.name ? 'Name: ' + details.name + '%0D%0A' : '') +
        (details.email ? 'Email: ' + details.email + '%0D%0A' : '') +
        (details.grade ? 'Grade: ' + details.grade + '%0D%0A' : '') +
        '%0D%0AThanks!';

      const mailtoHref =
        'mailto:' +
        encodeURIComponent(CONFIG.email) +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        body;

      const waMessage =
        'Hi! My website form submission failed. My name is ' +
        (details.name || '') +
        (details.grade ? ' (Grade ' + details.grade + ')' : '') +
        '. Can you help me book a session?';

      const waHref = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(waMessage);

      formStatus.innerHTML =
        '<div class="text-red-200">' +
        '  <p class="text-red-400"><i class="fas fa-exclamation-circle mr-2"></i>We couldn\'t submit the form right now.</p>' +
        '  <p class="mt-2 text-slate-200">No stress — you can still reach us instantly:</p>' +
        '  <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">' +
        '    <a class="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-500" href="' +
        waHref +
        '" target="_blank" rel="noopener">' +
        '      <i class="fab fa-whatsapp mr-2"></i> WhatsApp us' +
        '    </a>' +
        '    <a class="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-900/30 px-4 py-2 font-semibold text-white hover:bg-slate-900/50" href="' +
        mailtoHref +
        '">' +
        '      <i class="fas fa-envelope mr-2"></i> Email us' +
        '    </a>' +
        '  </div>' +
        '</div>';
      formStatus.classList.remove('hidden');
    }

    // Honeypot check (capture phase)
    form.addEventListener(
      'submit',
      function (e) {
        const honeypot = $('#website');
        if (honeypot && honeypot.value) {
          e.preventDefault();
          console.log('Bot detected - form submission blocked');
        }
      },
      true,
    );

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;

      const nameEl = $('#name');
      const emailEl = $('#email');
      const gradeEl = $('#grade');

      const name = (nameEl && nameEl.value ? nameEl.value : '').trim();
      const email = (emailEl && emailEl.value ? emailEl.value : '').trim();
      const grade = gradeEl && gradeEl.value ? gradeEl.value : '';

      if (!name || name.length < 2) {
        showFormError('Please enter a valid name.');
        return;
      }
      if (!email || !isValidEmail(email)) {
        showFormError('Please enter a valid email address.');
        return;
      }
      if (!grade) {
        showFormError('Please select a grade.');
        return;
      }

      trackFormEvent('form_submit_attempt', {
        form_id: 'contact-form',
        page_path: window.location.pathname,
      });

      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
      btn.disabled = true;
      formStatus.classList.add('hidden');

      try {
        if (CONFIG.formspreeEndpoint && !CONFIG.formspreeEndpoint.includes('YOUR_FORM_ID')) {
          const formData = new FormData(form);
          const response = await fetch(CONFIG.formspreeEndpoint, {
            method: 'POST',
            body: formData,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) {throw new Error('Form submission failed');}

          trackFormEvent('form_submit_success', {
            form_id: 'contact-form',
            page_path: window.location.pathname,
          });

          if (typeof window.gtag === 'function' && localStorage.getItem('po_ga_consent') === 'granted') {
            window.gtag('event', 'generate_lead', {
              lead_type: 'contact_form',
              form_id: 'contact-form',
              page_path: window.location.pathname,
            });
          }
        }

        btn.innerHTML = '<i class="fas fa-check mr-2"></i> Sent Successfully!';
        btn.classList.remove('bg-brand-gold', 'hover:bg-yellow-400');
        btn.classList.add('bg-green-500');

        formStatus.innerHTML =
          '<p class="text-green-400"><i class="fas fa-check-circle mr-2"></i>Thank you! We\'ll be in touch within 24 hours.</p>';
        formStatus.classList.remove('hidden');

        setTimeout(function () {
          btn.innerHTML = originalText;
          btn.classList.add('bg-brand-gold', 'hover:bg-yellow-400');
          btn.classList.remove('bg-green-500');
          btn.disabled = false;
          form.reset();
          formStatus.classList.add('hidden');
        }, 3000);
      } catch (_err) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        trackFormEvent('form_submit_failure', {
          form_id: 'contact-form',
          page_path: window.location.pathname,
        });
        showFormFallback({ name: name, email: email, grade: grade });
      }
    });
  }

  // ==========================================
  // LEAD MAGNET FORM (critical)
  // ==========================================
  function initLeadForm() {
    const form = $('#lead-form');
    if (!form) {return;}

    function trackFormEvent(eventName, params) {
      if (typeof window.gtag !== 'function') {return;}
      if (localStorage.getItem('po_ga_consent') !== 'granted') {return;}
      window.gtag('event', eventName, params || {});
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      const emailInput = $('#lead-email');
      const email = emailInput ? emailInput.value : '';

      if (!isValidEmail(email)) {
        alert('Please enter a valid email address.');
        return;
      }

      trackFormEvent('form_submit_attempt', {
        form_id: 'lead-form',
        page_path: window.location.pathname,
      });

      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
      btn.disabled = true;

      try {
        if (CONFIG.formspreeEndpoint && !CONFIG.formspreeEndpoint.includes('YOUR_FORM_ID')) {
          const formData = new FormData(form);
          formData.append('form_type', 'lead_magnet');
          const response = await fetch(CONFIG.formspreeEndpoint, {
            method: 'POST',
            body: formData,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) {throw new Error('Lead magnet submission failed');}

          trackFormEvent('form_submit_success', {
            form_id: 'lead-form',
            page_path: window.location.pathname,
          });

          if (typeof window.gtag === 'function' && localStorage.getItem('po_ga_consent') === 'granted') {
            window.gtag('event', 'generate_lead', {
              lead_type: 'lead_magnet',
              form_id: 'lead-form',
              page_path: window.location.pathname,
            });
          }
        }

        btn.innerHTML = '<i class="fas fa-check mr-2"></i> Check Your Email!';
        btn.classList.remove('bg-brand-gold');
        btn.classList.add('bg-green-500');

        setTimeout(function () {
          window.open('guides/matric-maths-mistakes-guide.html', '_blank');
          btn.innerHTML = originalText;
          btn.classList.add('bg-brand-gold');
          btn.classList.remove('bg-green-500');
          btn.disabled = false;
          form.reset();
        }, 1500);
      } catch (_err) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        trackFormEvent('form_submit_failure', {
          form_id: 'lead-form',
          page_path: window.location.pathname,
        });
        alert('Something went wrong. Please try again, or contact us on WhatsApp.');
      }
    });
  }

  // ==========================================
  // KEYBOARD SHORTCUTS (critical)
  // ==========================================
  function initShortcuts() {
    const modal = $('#shortcuts-modal');
    const closeBtn = $('#shortcuts-close');
    const darkToggle = $('#dark-mode-toggle');

    if (!modal) {return;}

    function open() {
      modal.classList.add('visible');
    }
    function close() {
      modal.classList.remove('visible');
    }

    if (closeBtn) {closeBtn.addEventListener('click', close);}
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {close();}
    });

    document.addEventListener('keydown', function (e) {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {return;}

      if (modal.classList.contains('visible') && e.key !== '?') {
        close();
        return;
      }

      switch (e.key.toLowerCase()) {
      case '?':
        e.preventDefault();
        open();
        break;
      case 'd':
        if (darkToggle) {darkToggle.click();}
        break;
      case 'p': {
        const pricing = $('#pricing');
        if (pricing) {pricing.scrollIntoView({ behavior: 'smooth' });}
        break;
      }
      case 'c': {
        const contact = $('#contact');
        if (contact) {contact.scrollIntoView({ behavior: 'smooth' });}
        break;
      }
      case 'w':
        window.open('https://wa.me/' + CONFIG.whatsappNumber, '_blank');
        break;
      case 't':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      }
    });
  }

  // ==========================================
  // REAL-TIME FORM VALIDATION + WHATSAPP MSG (critical)
  // ==========================================
  function initFormValidation() {
    const nameInput = $('#name');
    const emailInput = $('#email');
    const gradeSelect = $('#grade');

    function addValidationStyles(input, isValid) {
      if (!input) {return;}
      input.classList.remove('input-valid', 'input-invalid');
      if (input.value.trim()) {
        input.classList.add(isValid ? 'input-valid' : 'input-invalid');
      }
    }

    function updateWhatsAppMessage() {
      const grade = gradeSelect ? gradeSelect.value : '';
      const name = nameInput ? nameInput.value.trim() : '';
      let message = "Hi! I'm interested in Maths tutoring.";

      if (grade) {
        message = "Hi! I'm interested in Maths tutoring for a Grade " + grade + ' student.';
      }
      if (name) {
        message =
          "Hi! I'm " +
          name +
          " and I'm interested in Maths tutoring" +
          (grade ? ' for a Grade ' + grade + ' student' : '') +
          '.';
      }

      updateAllWhatsAppLinks(message);
    }

    if (nameInput) {
      nameInput.addEventListener('blur', function () {
        addValidationStyles(nameInput, nameInput.value.trim().length >= 2);
      });
      nameInput.addEventListener('input', function () {
        if (nameInput.classList.contains('input-invalid')) {
          addValidationStyles(nameInput, nameInput.value.trim().length >= 2);
        }
        updateWhatsAppMessage();
      });
    }

    if (emailInput) {
      emailInput.addEventListener('blur', function () {
        addValidationStyles(emailInput, isValidEmail(emailInput.value));
      });
      emailInput.addEventListener('input', function () {
        if (emailInput.classList.contains('input-invalid')) {
          addValidationStyles(emailInput, isValidEmail(emailInput.value));
        }
      });
    }

    if (gradeSelect) {
      gradeSelect.addEventListener('change', function () {
        addValidationStyles(gradeSelect, gradeSelect.value !== '');
        updateWhatsAppMessage();
      });
    }
  }

  // ==========================================
  // NON-CRITICAL LOADER
  // ==========================================
  function loadNonCriticalBundle() {
    if (window.__poNonCriticalLoaded) {return;}
    window.__poNonCriticalLoaded = true;

    const script = document.createElement('script');
    script.src = '/assets/app-noncritical.js';
    script.async = true;
    document.body.appendChild(script);
  }

  function scheduleNonCritical() {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(loadNonCriticalBundle, { timeout: 2000 });
    } else {
      setTimeout(loadNonCriticalBundle, 1);
    }
  }

  /* ==========================================================================
   Grade Results Carousel
   ========================================================================== */
(function initGradeResultsCarousel() {
  const root = document.querySelector("[data-po-carousel]");
  if (!root) return;

  const track = root.querySelector("[data-po-track]");
  const slides = Array.from(root.querySelectorAll("[data-po-slide]"));
  const dotsWrap = root.querySelector("[data-po-dots]");
  const prevBtns = Array.from(root.querySelectorAll("[data-po-prev]"));
  const nextBtns = Array.from(root.querySelectorAll("[data-po-next]"));

  if (!track || slides.length === 0 || !dotsWrap) return;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // Build dots
  dotsWrap.innerHTML = "";
  const dots = slides.map((_, i) => {
    const b = document.createElement("button");
    b.className = "po-dot";
    b.type = "button";
    b.setAttribute("aria-label", `Go to result ${i + 1}`);
    b.addEventListener("click", () => scrollToIndex(i));
    dotsWrap.appendChild(b);
    return b;
  });

  const slideLeft = (el) => el.getBoundingClientRect().left;
  const trackLeft = () => track.getBoundingClientRect().left;

  function nearestIndex() {
    const tL = trackLeft();
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < slides.length; i++) {
      const d = Math.abs(slideLeft(slides[i]) - tL);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function setActive(i) {
    dots.forEach((d, idx) => d.setAttribute("aria-current", idx === i ? "true" : "false"));
  }

  function scrollToIndex(i) {
    i = clamp(i, 0, slides.length - 1);
    slides[i].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setActive(i);
  }

  function step(dir) {
    const i = nearestIndex();
    scrollToIndex(i + dir);
  }

  prevBtns.forEach((b) => b.addEventListener("click", () => step(-1)));
  nextBtns.forEach((b) => b.addEventListener("click", () => step(+1)));

  // Keyboard support on the track
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); step(+1); }
  });

  // Update active dot while user scrolls
  let raf = 0;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setActive(nearestIndex()));
  });

  // Initialize
  setActive(0);
})();


  function initCritical() {
    updateAllWhatsAppLinks();
    initDarkMode();
    initCountdown();
    initMobileMenu();
    initFaq();
    initContactForm();
    initLeadForm();
    initShortcuts();
    initFormValidation();

    // Defer everything else
    scheduleNonCritical();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCritical);
  } else {
    initCritical();
  }
})();
