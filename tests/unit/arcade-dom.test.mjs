import { describe, expect, it } from "vitest";
import { el } from "../../assets/arcade/ui/dom.js";

describe("arcade dom helpers", () => {
  it("wires onClick handlers", () => {
    let clicked = false;
    const node = el("button", { onClick: () => { clicked = true; } }, ["Click"]);

    node.click();
    expect(clicked).toBe(true);
  });
});
