import { describe, it, expect } from 'vitest';
import { tooSoon } from '@/swh/rate-limit';

describe('tooSoon', () => {
  it('rejects a second message within the window', () => {
    const last = new Date(Date.now() - 500).toISOString();
    expect(tooSoon(last, 1500)).toBe(true);
  });
  it('allows after the window', () => {
    const last = new Date(Date.now() - 3000).toISOString();
    expect(tooSoon(last, 1500)).toBe(false);
  });
  it('allows when there is no previous message', () => {
    expect(tooSoon(null, 1500)).toBe(false);
  });
});
