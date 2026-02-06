import { describe, it, expect } from "vitest";
import { el, clear, sectionTitle, gameFrame } from "../../assets/lib/ui.js";

describe("ui helpers", () => {
  it("creates elements with attributes and text", () => {
    const node = el("div", { class: "test", text: "Hello", "data-id": "1" });

    expect(node.tagName).toBe("DIV");
    expect(node.className).toBe("test");
    expect(node.textContent).toBe("Hello");
    expect(node.getAttribute("data-id")).toBe("1");
  });

  it("wires event handlers", () => {
    let clicked = false;
    const node = el("button", { onClick: () => { clicked = true; } }, ["Click"]);

    node.click();
    expect(clicked).toBe(true);
  });

  it("clears a node", () => {
    const parent = el("div", {}, [el("span", { text: "a" }), el("span", { text: "b" })]);
    clear(parent);
    expect(parent.childElementCount).toBe(0);
  });

  it("builds section titles and frames", () => {
    const title = sectionTitle("Title", "Subtitle");
    expect(title.querySelector(".po-game-title")?.textContent).toBe("Title");

    const frame = gameFrame({
      title: "Frame",
      subtitle: "Sub",
      controls: [el("button", { text: "Go" })],
      status: el("span", { text: "Ready" }),
      body: el("div", { text: "Body" })
    });

    expect(frame.querySelector(".po-game-header h3")?.textContent).toBe("Frame");
    expect(frame.querySelector(".po-game-status")?.textContent).toBe("Ready");
  });
});
