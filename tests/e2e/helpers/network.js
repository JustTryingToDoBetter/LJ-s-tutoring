async function installNetworkGuard(page, options = {}) {
  const allowedHosts = new Set(options.allowedHosts || ["localhost", "127.0.0.1"]);
  const blocked = [];

  await page.route("**/*", (route) => {
    const url = route.request().url();

    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) {
      return route.continue();
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      blocked.push(url);
      return route.fulfill({ status: 204, body: "" });
    }

    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && allowedHosts.has(parsed.hostname)) {
      return route.continue();
    }

    blocked.push(url);
    return route.fulfill({ status: 204, body: "" });
  });

  return { blocked };
}

module.exports = { installNetworkGuard };
