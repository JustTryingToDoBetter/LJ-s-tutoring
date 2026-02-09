(function () {
  "use strict";

  function getParams() {
    try {
      const url = new URL(window.location.href);
      return {
        placement: url.searchParams.get("placement") || "menu_banner",
        provider: url.searchParams.get("provider") || "house",
        creativeId: url.searchParams.get("creativeId") || "house-default",
        variantId: url.searchParams.get("variantId") || "control",
      };
    } catch {
      return { placement: "menu_banner", provider: "house", creativeId: "house-default", variantId: "control" };
    }
  }

  const meta = getParams();

  document.addEventListener("click", () => {
    try {
      window.parent?.postMessage({ type: "arcade_ad_click", ...meta }, "*");
    } catch {}
  });
})();
