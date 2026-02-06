function watchConsole(page) {
  const errors = [];

  page.on("pageerror", (err) => {
    errors.push({ type: "pageerror", message: err?.message || String(err) });
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push({ type: "console", message: msg.text() });
    }
  });

  return { errors };
}

module.exports = { watchConsole };
