import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

const scriptSource = readFileSync(new URL('../../assets/error-monitor.js', import.meta.url), 'utf8');

function runWithConsent(value) {
  let eventListeners = 0;

  const windowStub = {
    addEventListener: () => {
      eventListeners += 1;
    },
    location: {
      href: 'https://example.com/path?x=1#frag',
      pathname: '/path',
      origin: 'https://example.com',
    },
    navigator: {
      userAgent: 'UA',
      language: 'en-US',
    },
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 2,
  };

  const sandbox = {
    window: windowStub,
    document: { referrer: 'https://ref.example.com/a?b=1#c' },
    navigator: windowStub.navigator,
    localStorage: {
      getItem: () => value,
    },
    console: { warn: () => {}, log: () => {} },
    URL,
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);

  return eventListeners;
}

describe('error monitor consent gating', () => {
  it('does not register handlers without consent', () => {
    const listeners = runWithConsent('denied');
    expect(listeners).toBe(0);
  });

  it('registers handlers when consent is granted', () => {
    const listeners = runWithConsent('granted');
    expect(listeners).toBe(2);
  });
});
