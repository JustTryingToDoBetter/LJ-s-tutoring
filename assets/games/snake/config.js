export const snakeConfig = {
  seedMode: "daily",
  lives: 1,
  defaultSettings: { sound: true, haptics: false, difficulty: "normal" },

  ui: {
    title: "Neon Snake",
    subtitle: "Procedural runs • daily seed • mobile-first",
  },

  pacing: {
    curveType: "easeInOut",
    maxScoreForMaxDifficulty: 60,
    baseTickMs: 160,
    minTickMs: 70,
  },

  lootTable: [
    { item: { type: "food", points: 1, grow: 1 }, w: 70 },
    { item: { type: "food", points: 3, grow: 2 }, w: 22 },
    { item: { type: "hazard", points: 0, grow: 0 }, w: 8 },
  ],
};