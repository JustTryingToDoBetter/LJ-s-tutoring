/**
 * Project Odysseus – Non-critical JS
 * Loaded after the critical bundle, ideally when the browser is idle.
 */
(function () {
  'use strict';

  var PO = window.PO_APP || {};
  var CONFIG = PO.CONFIG || window.CONFIG || { whatsappNumber: '27679327754' };

  function $(selector) {
    return (PO.$ && PO.$(selector)) || document.querySelector(selector);
  }

  function $$(selector) {
    return (PO.$$ && PO.$$(selector)) || document.querySelectorAll(selector);
  }

  function updateAllWhatsAppLinks(message) {
    if (typeof PO.updateAllWhatsAppLinks === 'function') return PO.updateAllWhatsAppLinks(message);
    var msg = message || "Hi! I'm interested in Maths tutoring.";
    $$('a[href*="wa.me"]').forEach(function (link) {
      link.href = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(msg);
    });
  }

  // ==========================================
  // SCROLL / INTERSECTION ANIMATIONS
  // ==========================================
  function initScrollAnimations() {
    if (typeof IntersectionObserver !== 'function') return;
    var options = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, options);

    $$('.fade-up').forEach(function (el) {
      observer.observe(el);
    });
  }

  // ==========================================
  // COUNTER ANIMATION
  // ==========================================
  function initCounters() {
    if (typeof IntersectionObserver !== 'function') return;

    var counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var counter = entry.target;
          var target = parseInt(counter.dataset.target, 10);
          var duration = 2000;
          var step = target / (duration / 16);
          var current = 0;

          (function tick() {
            current += step;
            if (current < target) {
              counter.textContent = Math.floor(current);
              requestAnimationFrame(tick);
            } else {
              counter.textContent = target;
            }
          })();

          counterObserver.unobserve(counter);
        });
      },
      { threshold: 0.5 }
    );

    $$('.counter').forEach(function (c) {
      counterObserver.observe(c);
    });
  }

  // ==========================================
  // EXIT INTENT POPUP
  // ==========================================
  function initExitPopup() {
    var popup = $('#exit-popup');
    var closeBtn = $('#exit-popup-close');
    var ctaBtn = $('#exit-popup-cta');
    var dismissBtn = $('#exit-popup-dismiss');
    if (!popup) return;

    var shown = false;
    function close() {
      popup.classList.remove('show');
    }

    if (window.innerWidth > 768 && !sessionStorage.getItem('exitPopupShown')) {
      document.addEventListener('mouseout', function (e) {
        if (!shown && e.clientY < 10 && e.relatedTarget === null) {
          popup.classList.add('show');
          shown = true;
          sessionStorage.setItem('exitPopupShown', 'true');
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (dismissBtn) dismissBtn.addEventListener('click', close);
    if (ctaBtn) ctaBtn.addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    popup.addEventListener('click', function (e) {
      if (e.target === popup) close();
    });
  }

  // ==========================================
  // FLOATING WHATSAPP BUTTON (hide near footer)
  // ==========================================
  function initWhatsAppFloat() {
    var btn = $('#whatsapp-float');
    if (!btn) return;

    // Ensure link is correct
    updateAllWhatsAppLinks();

    var footer = $('#contact');
    if (!footer || typeof IntersectionObserver !== 'function') return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          btn.style.opacity = entry.isIntersecting ? '0' : '1';
          btn.style.pointerEvents = entry.isIntersecting ? 'none' : 'auto';
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(footer);
  }

  // ==========================================
  // PAGE LOADER
  // ==========================================
  function initLoader() {
    var loader = $('#page-loader');
    if (!loader) return;

    function hideLoader() {
      setTimeout(function () {
        loader.classList.add('hidden');
      }, 500);
    }

    // If page is already loaded, hide immediately
    if (document.readyState === 'complete') {
      hideLoader();
    } else {
      // Otherwise wait for load event
      window.addEventListener('load', hideLoader);
    }
  }

  // ==========================================
  // SCROLL PROGRESS BAR
  // ==========================================
  function initScrollProgress() {
    var bar = $('#scroll-progress');
    if (!bar) return;

    window.addEventListener('scroll', function () {
      var scrollTop = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (scrollTop / docHeight) * 100 + '%';
    });
  }

  // ==========================================
  // BACK TO TOP BUTTON
  // ==========================================
  function initBackToTop() {
    var btn = $('#back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', function () {
      btn.classList.toggle('visible', window.scrollY > 500);
    });

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ==========================================
  // MOBILE STICKY CTA
  // ==========================================
  function initMobileStickyCta() {
    var cta = $('#mobile-sticky-cta');
    var hero = $('#main-content');
    if (!cta || !hero) return;

    var lastScrollY = 0;
    window.addEventListener('scroll', function () {
      var currentScrollY = window.scrollY;
      var heroBottom = hero.offsetTop + hero.offsetHeight;
      var nearBottom = document.documentElement.scrollHeight - window.innerHeight - 200;

      if (currentScrollY > heroBottom && currentScrollY < nearBottom) {
        if (currentScrollY < lastScrollY || currentScrollY - lastScrollY < 10) {
          cta.classList.add('visible');
        } else {
          cta.classList.remove('visible');
        }
      } else {
        cta.classList.remove('visible');
      }
      lastScrollY = currentScrollY;
    });
  }

  // ==========================================
  // TESTIMONIAL CAROUSEL (Mobile)
  // ==========================================
  function initCarousel() {
    var track = $('.testimonial-track');
    var dots = $$('.carousel-dot');
    if (!track || dots.length === 0) return;

    var slideCount = dots.length;
    var currentSlide = 0;
    var autoSlideInterval;

    function goToSlide(index) {
      currentSlide = index;
      if (window.innerWidth < 768) {
        track.style.transform = 'translateX(-' + index * 100 + '%)';
      }
      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === index);
      });
    }

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        goToSlide(parseInt(dot.dataset.slide, 10));
        resetAutoSlide();
      });
    });

    function autoSlide() {
      if (window.innerWidth < 768) {
        currentSlide = (currentSlide + 1) % slideCount;
        goToSlide(currentSlide);
      }
    }

    function resetAutoSlide() {
      clearInterval(autoSlideInterval);
      autoSlideInterval = setInterval(autoSlide, 5000);
    }

    if (window.innerWidth < 768) {
      autoSlideInterval = setInterval(autoSlide, 5000);
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768) {
        track.style.transform = 'none';
        clearInterval(autoSlideInterval);
      } else {
        goToSlide(currentSlide);
        resetAutoSlide();
      }
    });

    var touchStartX = 0;
    var touchEndX = 0;

    track.addEventListener(
      'touchstart',
      function (e) {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );

    track.addEventListener(
      'touchend',
      function (e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      },
      { passive: true }
    );

    function handleSwipe() {
      var threshold = 50;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > threshold) {
        if (diff > 0 && currentSlide < slideCount - 1) {
          goToSlide(currentSlide + 1);
        } else if (diff < 0 && currentSlide > 0) {
          goToSlide(currentSlide - 1);
        }
        resetAutoSlide();
      }
    }
  }

  // ==========================================
  // DYNAMIC SLOTS AVAILABILITY
  // ==========================================
  function initSlots() {
    function update() {
      var el = $('#slots-remaining');
      if (!el) return;

      var now = new Date();
      var day = now.getDay();
      var hour = now.getHours();

      var base = 5 - Math.floor(day / 2);
      if (hour >= 17 && hour <= 20) base = Math.max(1, base - 1);
      var slots = Math.max(1, Math.min(5, base + Math.floor(Math.random() * 2)));

      el.textContent = slots;
      var badge = el.closest('div');
      if (badge) badge.classList.toggle('animate-pulse', slots <= 2);
    }

    update();
    setInterval(update, 30 * 60 * 1000);
  }

  function logGreeting() {
    console.log('%c🎓 Project Odysseus', 'font-size: 24px; font-weight: bold; color: #fbbf24;');
    console.log('%cNeed a developer? Check out our code!', 'font-size: 14px; color: #64748b;');
    console.log('%c💡 Press ? for keyboard shortcuts', 'font-size: 12px; color: #22c55e;');
  }

  function initNonCritical() {
    initScrollAnimations();
    initCounters();
    initExitPopup();
    initWhatsAppFloat();
    initLoader();
    initScrollProgress();
    initBackToTop();
    initMobileStickyCta();
    initCarousel();
    initSlots();
    logGreeting();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNonCritical);
  } else {
    initNonCritical();
  }
})();
