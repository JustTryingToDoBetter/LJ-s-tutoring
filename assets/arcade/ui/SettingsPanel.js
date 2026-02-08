import { el } from "./dom.js";
import { createButton } from "./Button.js";

const SETTINGS_KEY = "odyssey_arcade_settings_v1";

const defaults = {
  mute: false,
  sfxVolume: 0.7,
  musicVolume: 0.5,
  reducedMotion: false,
  crt: false,
};

export function loadArcadeSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function saveArcadeSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export function createSettingsPanel({ settings = {}, onChange } = {}) {
  const state = { ...defaults, ...loadArcadeSettings(), ...settings };

  const emit = (patch) => {
    Object.assign(state, patch);
    saveArcadeSettings(state);
    onChange?.(patch);
  };

  const muteBtn = createButton({
    label: state.mute ? "Unmute" : "Mute",
    variant: "default",
    onClick: () => {
      state.mute = !state.mute;
      muteBtn.querySelector(".arc-btn__label").textContent = state.mute ? "Unmute" : "Mute";
      emit({ mute: state.mute });
    },
  });

  const sfxRange = el("input", {
    class: "arc-range",
    type: "range",
    min: "0",
    max: "1",
    step: "0.05",
    value: String(state.sfxVolume),
  });

  const musicRange = el("input", {
    class: "arc-range",
    type: "range",
    min: "0",
    max: "1",
    step: "0.05",
    value: String(state.musicVolume),
  });

  const motionBtn = createButton({
    label: state.reducedMotion ? "Reduced Motion: On" : "Reduced Motion: Off",
    variant: "default",
    onClick: () => {
      state.reducedMotion = !state.reducedMotion;
      motionBtn.querySelector(".arc-btn__label").textContent = state.reducedMotion
        ? "Reduced Motion: On"
        : "Reduced Motion: Off";
      emit({ reducedMotion: state.reducedMotion });
    },
  });

  const crtBtn = createButton({
    label: state.crt ? "CRT Effect: On" : "CRT Effect: Off",
    variant: "default",
    onClick: () => {
      state.crt = !state.crt;
      crtBtn.querySelector(".arc-btn__label").textContent = state.crt
        ? "CRT Effect: On"
        : "CRT Effect: Off";
      emit({ crt: state.crt });
    },
  });

  sfxRange.addEventListener("input", () => emit({ sfxVolume: Number(sfxRange.value) }));
  musicRange.addEventListener("input", () => emit({ musicVolume: Number(musicRange.value) }));

  const panel = el("div", { class: "arc-settings" }, [
    el("div", { class: "arc-settings__row" }, [
      el("div", { class: "arc-settings__label", text: "Mute" }),
      muteBtn,
    ]),
    el("div", { class: "arc-settings__row" }, [
      el("div", { class: "arc-settings__label", text: "SFX Volume" }),
      sfxRange,
    ]),
    el("div", { class: "arc-settings__row" }, [
      el("div", { class: "arc-settings__label", text: "Music Volume" }),
      musicRange,
    ]),
    el("div", { class: "arc-settings__row" }, [
      el("div", { class: "arc-settings__label", text: "Reduced Motion" }),
      motionBtn,
    ]),
    el("div", { class: "arc-settings__row" }, [
      el("div", { class: "arc-settings__label", text: "CRT Effect" }),
      crtBtn,
    ]),
  ]);

  return { panel, settings: state };
}
