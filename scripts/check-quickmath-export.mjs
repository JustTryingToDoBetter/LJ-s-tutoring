const mod = await import(new URL("../assets/games/quickmath.js", import.meta.url));
const game = mod?.default;

if (!game || typeof game.init !== "function") {
  throw new Error("Quick Math default export must provide init().");
}

console.log("OK: quickmath exports a lifecycle-based default.");
