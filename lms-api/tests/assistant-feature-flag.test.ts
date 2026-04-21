import { describe, expect, it } from 'vitest';
import { isAssistantEnabled } from '../src/routes/assistant.js';

describe('assistant feature flag', () => {
  it('defaults to enabled when ASSISTANT_ENABLED is unset', () => {
    expect(isAssistantEnabled({} as NodeJS.ProcessEnv)).toBe(true);
  });

  it('treats explicit true-like values as enabled', () => {
    for (const value of ['true', 'TRUE', 'True', '1', 'on', 'ON']) {
      expect(isAssistantEnabled({ ASSISTANT_ENABLED: value } as any)).toBe(true);
    }
  });

  it('treats explicit false-like values as disabled', () => {
    for (const value of ['false', 'FALSE', '0', 'off', 'disabled']) {
      expect(isAssistantEnabled({ ASSISTANT_ENABLED: value } as any)).toBe(false);
    }
  });

  it('trims surrounding whitespace before evaluating the flag', () => {
    expect(isAssistantEnabled({ ASSISTANT_ENABLED: '  false  ' } as any)).toBe(false);
    expect(isAssistantEnabled({ ASSISTANT_ENABLED: '  true  ' } as any)).toBe(true);
  });
});
