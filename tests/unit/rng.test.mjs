import { describe, it, expect } from "vitest";
import { createRNG, dayKey, hashStringToSeed, seededRng } from "../../assets/lib/rng.js";

describe("rng helpers", () => {
  it("creates deterministic sequences for the same seed", () => {
    const a = createRNG("seed-a");
    const b = createRNG("seed-a");

    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it("hashStringToSeed is stable", () => {
    expect(hashStringToSeed("odyssey")).toBe(hashStringToSeed("odyssey"));
    expect(hashStringToSeed("odyssey")).not.toBe(hashStringToSeed("odysseus"));
  });

  it("dayKey formats YYYY-MM-DD", () => {
    const key = dayKey(new Date("2026-02-06T12:00:00Z"));
    expect(key).toBe("2026-02-06");
  });

  it("seededRng returns values in range", () => {
    const rand = seededRng(123);
    for (let i = 0; i < 10; i += 1) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
