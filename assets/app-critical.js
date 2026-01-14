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
  var CONFIG = {
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
    var msg =
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
    var toggle = $('#dark-mode-toggle');
    var icon = $('#dark-mode-icon');
    var html = document.documentElement;

    if (!toggle || !icon) return;

    if (
      localStorage.getItem('darkMode') === 'true' ||
      (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      html.classList.add('dark');
      icon.classList.replace('fa-moon', 'fa-sun');
    }

    toggle.addEventListener('click', function () {
      html.classList.toggle('dark');
      var isDark = html.classList.contains('dark');
      localStorage.setItem('darkMode', isDark);
      icon.classList.toggle('fa-moon', !isDark);
      icon.classList.toggle('fa-sun', isDark);
    });
  }

  // ==========================================
  // COUNTDOWN TIMER (critical)
  // ==========================================
  function initCountdown() {
    function update() {
      var now = Date.now();
      var target = CONFIG.countdownDate.getTime();
      var diff = target - now;

      if (diff > 0) {
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins = Math.floor((diff % 3600000) / 60000);
        var secs = Math.floor((diff % 60000) / 1000);

        var elDays = $('#countdown-days');
        var elHours = $('#countdown-hours');
        var elMins = $('#countdown-mins');
        var elSecs = $('#countdown-secs');

        if (elDays) elDays.textContent = String(days).padStart(2, '0');
        if (elHours) elHours.textContent = String(hours).padStart(2, '0');
        if (elMins) elMins.textContent = String(mins).padStart(2, '0');
        if (elSecs) elSecs.textContent = String(secs).padStart(2, '0');
      } else {
        var countdown = $('#countdown');
        if (countdown) countdown.innerHTML = '<p class="text-brand-gold font-bold">Bookings Now Open!</p>';
      }
    }

    update();
    setInterval(update, 1000);
  }

  // ==========================================
  // MOBILE MENU (critical)
  // ==========================================
  function initMobileMenu() {
    var btn = $('#mobile-menu-btn');
    var menu = $('#mobile-menu');
    var icon = $('#menu-icon');
    if (!btn || !menu || !icon) return;

    btn.addEventListener('click', function () {
      var isOpen = menu.classList.toggle('open');
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
        var item = btn.parentElement;
        var isOpen = item.classList.contains('open');

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
    var form = $('#contact-form');
    if (!form) return;

    var formStatus = document.createElement('div');
    formStatus.id = 'form-status';
    formStatus.className = 'mt-4 text-center hidden';
    form.appendChild(formStatus);

    function showFormError(message) {
      formStatus.innerHTML =
        '<p class="text-red-400"><i class="fas fa-exclamation-circle mr-2"></i>' + message + '</p>';
      formStatus.classList.remove('hidden');
      setTimeout(function () {
        formStatus.classList.add('hidden');
      }, 5000);
    }

    // Honeypot check (capture phase)
    form.addEventListener(
      'submit',
      function (e) {
        var honeypot = $('#website');
        if (honeypot && honeypot.value) {
          e.preventDefault();
          console.log('Bot detected - form submission blocked');
        }
      },
      true
    );

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      var btn = form.querySelector('button[type="submit"]');
      var originalText = btn.innerHTML;

      var nameEl = $('#name');
      var emailEl = $('#email');
      var gradeEl = $('#grade');

      var name = (nameEl && nameEl.value ? nameEl.value : '').trim();
      var email = (emailEl && emailEl.value ? emailEl.value : '').trim();
      var grade = gradeEl && gradeEl.value ? gradeEl.value : '';

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

      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
      btn.disabled = true;
      formStatus.classList.add('hidden');

      try {
        if (CONFIG.formspreeEndpoint && !CONFIG.formspreeEndpoint.includes('YOUR_FORM_ID')) {
          var formData = new FormData(form);
          var response = await fetch(CONFIG.formspreeEndpoint, {
            method: 'POST',
            body: formData,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error('Form submission failed');

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
        showFormError('Something went wrong. Please try WhatsApp instead.');
      }
    });
  }

  // ==========================================
  // LEAD MAGNET FORM (critical)
  // ==========================================
  function initLeadForm() {
    var form = $('#lead-form');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var originalText = btn.innerHTML;
      var emailInput = $('#lead-email');
      var email = emailInput ? emailInput.value : '';

      if (!isValidEmail(email)) {
        alert('Please enter a valid email address.');
        return;
      }

      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
      btn.disabled = true;

      try {
        if (CONFIG.formspreeEndpoint && !CONFIG.formspreeEndpoint.includes('YOUR_FORM_ID')) {
          var formData = new FormData(form);
          formData.append('form_type', 'lead_magnet');
          var response = await fetch(CONFIG.formspreeEndpoint, {
            method: 'POST',
            body: formData,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error('Lead magnet submission failed');

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
        alert('Something went wrong. Please try again.');
      }
    });
  }

  // ==========================================
  // KEYBOARD SHORTCUTS (critical)
  // ==========================================
  function initShortcuts() {
    var modal = $('#shortcuts-modal');
    var closeBtn = $('#shortcuts-close');
    var darkToggle = $('#dark-mode-toggle');

    if (!modal) return;

    function open() {
      modal.classList.add('visible');
    }
    function close() {
      modal.classList.remove('visible');
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
          if (darkToggle) darkToggle.click();
          break;
        case 'p':
          var pricing = $('#pricing');
          if (pricing) pricing.scrollIntoView({ behavior: 'smooth' });
          break;
        case 'c':
          var contact = $('#contact');
          if (contact) contact.scrollIntoView({ behavior: 'smooth' });
          break;
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
    var nameInput = $('#name');
    var emailInput = $('#email');
    var gradeSelect = $('#grade');

    function addValidationStyles(input, isValid) {
      if (!input) return;
      input.classList.remove('input-valid', 'input-invalid');
      if (input.value.trim()) {
        input.classList.add(isValid ? 'input-valid' : 'input-invalid');
      }
    }

    function updateWhatsAppMessage() {
      var grade = gradeSelect ? gradeSelect.value : '';
      var name = nameInput ? nameInput.value.trim() : '';
      var message = "Hi! I'm interested in Maths tutoring.";

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
    if (window.__poNonCriticalLoaded) return;
    window.__poNonCriticalLoaded = true;

    var script = document.createElement('script');
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
