/**
 * Project Odysseus – Non-critical JS
 * Loaded after the critical bundle, ideally when the browser is idle.
 */
(function () {
  'use strict';

  const PO = window.PO_APP || {};
  const CONFIG = PO.CONFIG || window.CONFIG || { whatsappNumber: '27679327754' };

  function $(selector) {
    return (PO.$ && PO.$(selector)) || document.querySelector(selector);
  }

  function $$(selector) {
    return (PO.$$ && PO.$$(selector)) || document.querySelectorAll(selector);
  }

  function updateAllWhatsAppLinks(message) {
    if (typeof PO.updateAllWhatsAppLinks === 'function') {return PO.updateAllWhatsAppLinks(message);}
    const msg = message || "Hi! I'm interested in Maths tutoring.";
    $$('a[href*="wa.me"]').forEach(function (link) {
      link.href = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(msg);
    });
  }

  // ==========================================
  // SCROLL / INTERSECTION ANIMATIONS
  // ==========================================
  function initScrollAnimations() {
    if (typeof IntersectionObserver !== 'function') {return;}
    const options = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {entry.target.classList.add('visible');}
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
    if (typeof IntersectionObserver !== 'function') {return;}

    const counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {return;}
          const counter = entry.target;
          const target = parseInt(counter.dataset.target, 10);
          const duration = 2000;
          const step = target / (duration / 16);
          let current = 0;

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
      { threshold: 0.5 },
    );

    $$('.counter').forEach(function (c) {
      counterObserver.observe(c);
    });
  }

  // ==========================================
  // EXIT INTENT POPUP
  // ==========================================
  function initExitPopup() {
    const popup = $('#exit-popup');
    const closeBtn = $('#exit-popup-close');
    const ctaBtn = $('#exit-popup-cta');
    const dismissBtn = $('#exit-popup-dismiss');
    if (!popup) {return;}

    let shown = false;
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

    if (closeBtn) {closeBtn.addEventListener('click', close);}
    if (dismissBtn) {dismissBtn.addEventListener('click', close);}
    if (ctaBtn) {ctaBtn.addEventListener('click', close);}

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {close();}
    });

    popup.addEventListener('click', function (e) {
      if (e.target === popup) {close();}
    });
  }

  // ==========================================
  // FLOATING WHATSAPP BUTTON (hide near footer)
  // ==========================================
  function initWhatsAppFloat() {
    const btn = $('#whatsapp-float');
    if (!btn) {return;}

    // Ensure link is correct
    updateAllWhatsAppLinks();

    const footer = $('#contact');
    if (!footer || typeof IntersectionObserver !== 'function') {return;}

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          btn.style.opacity = entry.isIntersecting ? '0' : '1';
          btn.style.pointerEvents = entry.isIntersecting ? 'none' : 'auto';
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(footer);
  }

  // ==========================================
  // PAGE LOADER
  // ==========================================
  function initLoader() {
    const loader = $('#page-loader');
    if (!loader) {return;}

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
    const bar = $('#scroll-progress');
    if (!bar) {return;}

    window.addEventListener('scroll', function () {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (scrollTop / docHeight) * 100 + '%';
    });
  }

  // ==========================================
  // BACK TO TOP BUTTON
  // ==========================================
  function initBackToTop() {
    const btn = $('#back-to-top');
    if (!btn) {return;}

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
    const cta = $('#mobile-sticky-cta');
    const hero = $('#main-content');
    if (!cta || !hero) {return;}

    let lastScrollY = 0;
    window.addEventListener('scroll', function () {
      const currentScrollY = window.scrollY;
      const heroBottom = hero.offsetTop + hero.offsetHeight;
      const nearBottom = document.documentElement.scrollHeight - window.innerHeight - 200;

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
    const track = $('.testimonial-track');
    const dots = $$('.carousel-dot');
    if (!track || dots.length === 0) {return;}

    const slideCount = dots.length;
    let currentSlide = 0;
    let autoSlideInterval;

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

    let touchStartX = 0;
    let touchEndX = 0;

    track.addEventListener(
      'touchstart',
      function (e) {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true },
    );

    track.addEventListener(
      'touchend',
      function (e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      },
      { passive: true },
    );

    function handleSwipe() {
      const threshold = 50;
      const diff = touchStartX - touchEndX;
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
      const el = $('#slots-remaining');
      if (!el) {return;}

      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();

      let base = 5 - Math.floor(day / 2);
      if (hour >= 17 && hour <= 20) {base = Math.max(1, base - 1);}
      const slots = Math.max(1, Math.min(5, base + Math.floor(Math.random() * 2)));

      el.textContent = slots;
      const badge = el.closest('div');
      if (badge) {badge.classList.toggle('animate-pulse', slots <= 2);}
    }

    update();
    setInterval(update, 30 * 60 * 1000);
  }

  function logGreeting() {
    // eslint-disable-next-line no-console
    console.log('%c🎓 Project Odysseus', 'font-size: 24px; font-weight: bold; color: #fbbf24;');
    // eslint-disable-next-line no-console
    console.log('%cNeed a developer? Check out our code!', 'font-size: 14px; color: #64748b;');
    // eslint-disable-next-line no-console
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
