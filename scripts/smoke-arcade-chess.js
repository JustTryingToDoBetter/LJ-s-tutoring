const base = (process.env.ARCADE_SMOKE_URL || "http://localhost:8080").replace(/\/$/, "");

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
  return res.text();
}

async function fetchOk(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`Asset missing: ${url} (${res.status})`);
}

async function run() {
  const chessUrl = `${base}/assets/games/chess.js`;
  const chessText = await fetchText(chessUrl);

  if (!/export\s+default/.test(chessText) || !/init\s*\(/.test(chessText)) {
    throw new Error("Chess module missing default export or init() function.");
  }

  await fetchOk(`${base}/assets/arcade/sprites/chess/wp.svg`);
  await fetchOk(`${base}/assets/arcade/sprites/chess/bk.svg`);

  console.log("Chess smoke check: OK");
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
