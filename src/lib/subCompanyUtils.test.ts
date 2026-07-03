import { describe, it, expect } from 'vitest';
import {
  normalizeAdminEmail,
  dedupeSubCompaniesByEmail,
  type SubCompanyLike,
} from '@/lib/subCompanyUtils';

describe('normalizeAdminEmail', () => {
  it('lowercases and trims the value', () => {
    expect(normalizeAdminEmail('  Admin@LeadSeller.COM  ')).toBe('admin@leadseller.com');
  });

  it('handles null/undefined/empty gracefully', () => {
    expect(normalizeAdminEmail(null)).toBe('');
    expect(normalizeAdminEmail(undefined)).toBe('');
    expect(normalizeAdminEmail('')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeAdminEmail('Foo@Bar.io');
    expect(normalizeAdminEmail(once)).toBe(once);
  });
});

describe('dedupeSubCompaniesByEmail', () => {
  const row = (id: string, admin_email: string | null): SubCompanyLike => ({
    id,
    admin_email,
    created_at: '2026-01-01T00:00:00Z',
  });

  it('keeps the first occurrence (newest) and drops duplicates by normalized email', () => {
    const list = [
      row('newest', 'Admin@LeadSeller.com'),
      row('older', ' admin@leadseller.com '),
      row('oldest', 'ADMIN@leadseller.COM'),
      row('other', 'contact@leadseller.com'),
    ];
    const result = dedupeSubCompaniesByEmail(list);
    expect(result.map(r => r.id)).toEqual(['newest', 'other']);
  });

  it('preserves rows with empty/nullish emails (no key to collide on)', () => {
    const list = [
      row('a', ''),
      row('b', null),
      row('c', 'x@y.com'),
      row('d', 'X@Y.com'),
    ];
    const result = dedupeSubCompaniesByEmail(list);
    expect(result.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeSubCompaniesByEmail([])).toEqual([]);
  });

  it('never mutates the input array', () => {
    const list = [row('a', 'A@b.com'), row('b', 'a@b.com')];
    const snapshot = list.map(r => ({ ...r }));
    dedupeSubCompaniesByEmail(list);
    expect(list).toEqual(snapshot);
  });
});
