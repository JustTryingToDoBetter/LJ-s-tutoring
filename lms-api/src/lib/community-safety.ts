const PROFANITY = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'slut', 'dick'
];

const SPAM_PATTERNS = [
  /(https?:\/\/\S+).*(https?:\/\/\S+)/i,
  /(.)\1{8,}/,
  /\b(buy now|free money|click here)\b/i,
];

export type ModerationOutcome = {
  state: 'VISIBLE' | 'FLAGGED';
  flags: string[];
};

export function moderateCommunityText(content: string): ModerationOutcome {
  const text = String(content || '').trim();
  const normalized = text.toLowerCase();
  const flags: string[] = [];

  if (!text) {
    flags.push('empty_content');
  }

  if (PROFANITY.some((term) => normalized.includes(term))) {
    flags.push('profanity');
  }

  if (SPAM_PATTERNS.some((pattern) => pattern.test(text))) {
    flags.push('spam_heuristic');
  }

  if (text.length > 1800) {
    flags.push('too_long');
  }

  return {
    state: flags.length > 0 ? 'FLAGGED' : 'VISIBLE',
    flags,
  };
}

export function sanitizeNickname(input: string, fallback = 'Learner') {
  const base = String(input || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  if (!base) return fallback;
  return base.slice(0, 40);
}
