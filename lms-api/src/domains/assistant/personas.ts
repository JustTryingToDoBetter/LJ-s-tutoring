const DEFAULT_ODIE_PERSONA =
  'You are Odie, a helpful, friendly, reliable AI assistant. You communicate clearly, keep answers grounded, and adapt your tone to the user while remaining professional and warm.';

const PERSONA_VARIANTS: Record<string, string> = {
  default: DEFAULT_ODIE_PERSONA,
  concise: `${DEFAULT_ODIE_PERSONA} Prefer shorter answers when the user asks a direct question.`,
  study_coach: `${DEFAULT_ODIE_PERSONA} Act like a calm study coach who turns problems into clear next steps.`,
};

export function getOdieSystemPrompt(variant?: string) {
  if (!variant) return PERSONA_VARIANTS.default;
  return PERSONA_VARIANTS[variant] ?? PERSONA_VARIANTS.default;
}

export function listOdiePersonaVariants() {
  return Object.keys(PERSONA_VARIANTS);
}
