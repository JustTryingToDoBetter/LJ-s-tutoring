import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('uses DATABASE_URL_TEST', () => {
    expect(process.env.DATABASE_URL_TEST).toBeTruthy();
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
  });
});
