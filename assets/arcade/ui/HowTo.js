import { el } from "./dom.js";

export function createHowTo({ gameId, title, subtitle, sections = [], controls = [], steps = [] } = {}) {
  const key = gameId ? `odyssey_howto_${gameId}` : null;
  const shouldShow = () => (key ? !localStorage.getItem(key) : true);

  let dontShow = false;
  const checkboxId = `arc-howto-${gameId || "game"}-${Date.now()}`;

  const body = el("div", { class: "arc-howto" }, [
    subtitle ? el("p", { class: "arc-howto__subtitle", text: subtitle }) : null,
    steps?.length
      ? el("div", { class: "arc-howto__section" }, [
          el("div", { class: "arc-howto__label", text: "Goals" }),
          el("ul", { class: "arc-howto__list" }, steps.map((s) => el("li", { text: s }))),
        ])
      : null,
    sections?.length
      ? el("div", { class: "arc-howto__section" }, sections.map((section) =>
          el("div", { class: "arc-howto__block" }, [
            el("div", { class: "arc-howto__label", text: section.label || "" }),
            el("ul", { class: "arc-howto__list" }, (section.items || []).map((item) => el("li", { text: item }))),
          ])
        ))
      : null,
    controls?.length
      ? el("div", { class: "arc-howto__section" }, [
          el("div", { class: "arc-howto__label", text: "Controls" }),
          el("ul", { class: "arc-howto__list" }, controls.map((s) => el("li", { text: s }))),
        ])
      : null,
    key
      ? el("label", { class: "arc-howto__dontshow", for: checkboxId }, [
          el("input", {
            id: checkboxId,
            type: "checkbox",
            class: "arc-howto__checkbox",
            onChange: (e) => {
              dontShow = Boolean(e.target.checked);
            },
          }),
          el("span", { text: "Don’t show again" }),
        ])
      : null,
  ].filter(Boolean));

  const onClose = () => {
    if (key && dontShow) {
      try { localStorage.setItem(key, "1"); } catch {}
    }
  };

  return { content: body, shouldShow, onClose, title };
}
