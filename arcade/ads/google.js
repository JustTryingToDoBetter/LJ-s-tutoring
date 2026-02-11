(() => {
  function applySizing() {
    const params = new URLSearchParams(window.location.search);
    const width = params.get('width');
    const height = params.get('height');

    const container = document.getElementById('ad-container');
    if (!container) {
      return null;
    }

    const ins = container.querySelector('ins');
    if (!ins) {
      return null;
    }

    if (width && height) {
      ins.style.width = `${width}px`;
      ins.style.height = `${height}px`;
      ins.removeAttribute('data-ad-format');
      ins.removeAttribute('data-full-width-responsive');
    }

    return ins;
  }

  function initAd() {
    window.adsbygoogle = window.adsbygoogle || [];
    try {
      window.adsbygoogle.push({});
    } catch (_) {
      // Ignore failures if AdSense is blocked.
    }
  }

  window.addEventListener('load', () => {
    applySizing();
    initAd();
  });
})();
