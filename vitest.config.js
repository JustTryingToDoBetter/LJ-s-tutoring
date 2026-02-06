module.exports = {
  test: {
    environment: "jsdom",
    testTimeout: 10000,
    include: ["tests/unit/**/*.test.js", "tests/unit/**/*.test.mjs"]
  }
};
