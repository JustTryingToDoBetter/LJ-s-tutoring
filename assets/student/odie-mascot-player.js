(function () {
  const PLAYER_SCRIPT_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js';
  let runtimePromise;

  function loadRuntime() {
    if (window.lottie && typeof window.lottie.loadAnimation === 'function') {
      return Promise.resolve(window.lottie);
    }

    if (runtimePromise) {
      return runtimePromise;
    }

    runtimePromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-odie-lottie-runtime="true"]');

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.lottie));
        existingScript.addEventListener('error', () => reject(new Error('Unable to load Lottie runtime.')));
        return;
      }

      const script = document.createElement('script');
      script.src = PLAYER_SCRIPT_SRC;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.odieLottieRuntime = 'true';

      script.onload = () => {
        if (window.lottie && typeof window.lottie.loadAnimation === 'function') {
          resolve(window.lottie);
          return;
        }

        reject(new Error('Lottie runtime loaded without a compatible API.'));
      };

      script.onerror = () => reject(new Error('Unable to load Lottie runtime.'));
      document.head.appendChild(script);
    }).catch((error) => {
      console.warn('[Odie mascot] Falling back to inline SVG mascot.', error);
      return null;
    });

    return runtimePromise;
  }

  function mountAnimation(runtime, wrap) {
    if (!runtime || wrap.dataset.lottieMounted === 'true') {
      return;
    }

    const container = wrap.querySelector('.odie-player');
    const src = wrap.dataset.lottieSrc;

    if (!container || !src) {
      return;
    }

    const animation = runtime.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: src,
      rendererSettings: {
        progressiveLoad: true,
        preserveAspectRatio: 'xMidYMid meet',
      },
    });

    animation.addEventListener('DOMLoaded', () => {
      wrap.classList.add('is-lottie-ready');
    });

    animation.addEventListener('data_failed', () => {
      wrap.classList.remove('is-lottie-ready');
    });

    animation.setSpeed(1);
    wrap.dataset.lottieMounted = 'true';
  }

  function init() {
    const wraps = Array.from(document.querySelectorAll('.odie-wrap[data-lottie-src]'));

    if (!wraps.length) {
      return;
    }

    loadRuntime().then((runtime) => {
      if (!runtime) {
        return;
      }

      wraps.forEach((wrap) => mountAnimation(runtime, wrap));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
