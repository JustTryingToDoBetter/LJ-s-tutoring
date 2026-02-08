/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * ARCADE INTEGRITY CHECK
 * 1. Ensures all games listed in sw-arcade.js actually exist.
 * 2. Warns if there are game files in assets/games/ that are NOT precached.
 */

const SW_PATH = path.join(__dirname, '../assets/sw-arcade.js');
const GAMES_DIR = path.join(__dirname, '../assets/games');

console.log('🎮 Running Arcade Integrity Check...');

// 1. Extract games list from Service Worker
const swContent = fs.readFileSync(SW_PATH, 'utf8');
// Regex to find "/assets/games/name.js"
const gameMatches = swContent.match(/"\/assets\/games\/([\w-]+)\.js"/g);
const swGames = gameMatches 
  ? gameMatches.map(s => s.replace(/"\/assets\/games\//, '').replace('.js"', '')) 
  : [];

// 2. Get actual files from directory
if (!fs.existsSync(GAMES_DIR)) {
  console.error('❌ Error: assets/games directory not found.');
  process.exit(1);
}

const fsGames = fs.readdirSync(GAMES_DIR)
  .filter(f => f.endsWith('.js'))
  .map(f => f.replace('.js', ''));

// 3. Compare and Report
const missingInFs = swGames.filter(g => !fsGames.includes(g));
const missingInSw = fsGames.filter(g => !swGames.includes(g));

if (missingInFs.length > 0) {
  console.error('❌ BROKEN LINKS: The following games are in sw-arcade.js but missing from disk:');
  missingInFs.forEach(g => console.error(`   - ${g}.js`));
  process.exit(1); // Fail the build
} else {
  console.log(`✅ All ${swGames.length} precached games exist.`);
}

if (missingInSw.length > 0) {
  console.warn('⚠️  WARNING: The following games exist but are NOT precached (offline play may fail):');
  missingInSw.forEach(g => console.warn(`   - ${g}.js`));
}
