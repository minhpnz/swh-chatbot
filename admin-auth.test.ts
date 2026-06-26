import { describe, it, expect, beforeEach } from 'vitest';
import { checkAdminPassword } from '@/swh/admin-auth';

beforeEach(() => {
  process.env.SWH_ADMIN_PASSWORD = 'secret';
});

describe('checkAdminPassword', () => {
  it('accepts the correct password', () => expect(checkAdminPassword('secret')).toBe(true));
  it('rejects a wrong password', () => expect(checkAdminPassword('nope')).toBe(false));
  it('rejects null', () => expect(checkAdminPassword(null)).toBe(false));
});
