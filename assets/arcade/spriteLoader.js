export function preloadSprites(manifest = {}, { timeoutMs = 4000 } = {}) {
  const entries = Object.entries(manifest || {});
  const sprites = {};
  let finished = false;
  let failed = false;

  return new Promise((resolve) => {
    if (!entries.length) {
      resolve({ sprites, failed: false, timedOut: false });
      return;
    }

    const done = (timedOut = false) => {
      if (finished) return;
      finished = true;
      resolve({ sprites, failed, timedOut });
    };

    const timer = setTimeout(() => {
      failed = true;
      done(true);
    }, timeoutMs);

    let loaded = 0;
    const onAssetDone = () => {
      loaded += 1;
      if (loaded >= entries.length) {
        clearTimeout(timer);
        done(false);
      }
    };

    for (const [key, src] of entries) {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";

      img.onload = () => {
        sprites[key] = img;
        onAssetDone();
      };

      img.onerror = () => {
        failed = true;
        onAssetDone();
      };

      img.src = src;
    }
  });
}
