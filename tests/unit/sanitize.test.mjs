import { describe, it, expect } from 'vitest';
import { containsHtmlTags, stripHtmlTags } from '../../assets/lib/sanitize.js';

describe('sanitize helpers', () => {
  it('detects and strips HTML tags', () => {
    const payload = '<img src=x onerror=alert(1)>';
    expect(containsHtmlTags(payload)).toBe(true);
    expect(stripHtmlTags(payload)).toBe('');
  });

  it('keeps plain text unchanged', () => {
    const text = 'Hello there';
    expect(containsHtmlTags(text)).toBe(false);
    expect(stripHtmlTags(text)).toBe('Hello there');
  });
});
