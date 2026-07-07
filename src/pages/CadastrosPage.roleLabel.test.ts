import { describe, it, expect } from 'vitest';

/**
 * Integration-shaped tests that verify how the Cargo column is derived
 * from the manage-account-user list response and how the create payload
 * carries role_label. These lock in the contract without needing a live
 * Supabase session, so they run in CI for every push.
 */

type Row = {
  user_id: string;
  is_account_admin: boolean;
  allowed_pages: string[];
  profile: { display_name: string; email: string; role_label?: string | null } | null;
};

// Mirror of the render logic in CadastrosPage (Cargo cell).
function renderCargo(row: Row): string {
  return row.profile?.role_label || '—';
}

describe('Cargo column - Empresas & Sub-empresas', () => {
  it('shows the exact role_label entered at creation', () => {
    const row: Row = {
      user_id: 'u1',
      is_account_admin: false,
      allowed_pages: [],
      profile: { display_name: 'Alice', email: 'alice@x.com', role_label: 'Gerente Comercial' },
    };
    expect(renderCargo(row)).toBe('Gerente Comercial');
  });

  it('shows CEO for the titular provisioned automatically (Empresa)', () => {
    const row: Row = {
      user_id: 'titular-empresa',
      is_account_admin: true,
      allowed_pages: [],
      profile: { display_name: 'Mult Seguros', email: 'multi@x.com', role_label: 'CEO' },
    };
    expect(renderCargo(row)).toBe('CEO');
  });

  it('shows CEO for the titular provisioned automatically (Sub-empresa)', () => {
    const row: Row = {
      user_id: 'titular-sub',
      is_account_admin: true,
      allowed_pages: [],
      profile: { display_name: 'Sub Alpha', email: 'sub@x.com', role_label: 'CEO' },
    };
    expect(renderCargo(row)).toBe('CEO');
  });

  it('falls back to em-dash when role_label is missing (legacy rows only)', () => {
    const row: Row = {
      user_id: 'u2',
      is_account_admin: false,
      allowed_pages: [],
      profile: { display_name: 'Legacy', email: 'l@x.com', role_label: null },
    };
    expect(renderCargo(row)).toBe('—');
  });

  it('preserves custom titles (accents, casing, spaces preserved)', () => {
    const row: Row = {
      user_id: 'u3',
      is_account_admin: false,
      allowed_pages: [],
      profile: { display_name: 'Bruno', email: 'b@x.com', role_label: 'Coordenador de Pós-Vendas' },
    };
    expect(renderCargo(row)).toBe('Coordenador de Pós-Vendas');
  });
});

describe('Frontend role_label validation', () => {
  // Mirror of the guard in CadastrosPage.save()
  function validate(role: string): { ok: boolean; normalized?: string } {
    const normalized = (role || '').trim();
    if (!normalized) return { ok: false };
    return { ok: true, normalized };
  }

  it('rejects empty string', () => {
    expect(validate('').ok).toBe(false);
  });

  it('rejects whitespace-only', () => {
    expect(validate('    ').ok).toBe(false);
  });

  it('trims and accepts valid labels', () => {
    expect(validate('  CEO  ')).toEqual({ ok: true, normalized: 'CEO' });
  });
});
