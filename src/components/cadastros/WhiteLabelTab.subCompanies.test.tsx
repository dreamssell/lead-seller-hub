import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// ─── Mocks ──────────────────────────────────────────────────────────────────
const subCompanyRows: any[] = [];
const planRows: any[] = [];
const updateMock = vi.fn();
const insertMock = vi.fn();
const invokeMock = vi.fn();

function makeSelectBuilder(rows: any[]) {
  const p: any = Promise.resolve({ data: rows, error: null });
  p.select = () => p;
  p.eq = () => p;
  p.order = () => p;
  p.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  p.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  return p;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'sub_companies') {
        return {
          select: () => makeSelectBuilder(subCompanyRows),
          update: (payload: any) => {
            updateMock(payload);
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...subCompanyRows[0], ...payload }, error: null }) }) }) };
          },
          insert: (payload: any) => {
            insertMock(payload);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new', ...payload }, error: null }) }) };
          },
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'plan_packages') {
        return { select: () => makeSelectBuilder(planRows) };
      }
      if (table === 'white_label_settings') {
        return { select: () => makeSelectBuilder([]), upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
      }
      return { select: () => makeSelectBuilder([]) };
    },
    functions: { invoke: (...a: any[]) => invokeMock(...a) },
    channel: () => ({ on() { return this; }, subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'owner1' } } }) },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner1', email: 'owner@test.com' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('./SubCompanyManageDialog', () => ({
  SubCompanyManageDialog: () => null,
}));

import WhiteLabelTab from './WhiteLabelTab';
import { normalizeAdminEmail } from '@/lib/subCompanyUtils';

beforeEach(() => {
  subCompanyRows.length = 0;
  planRows.length = 0;
  updateMock.mockClear();
  insertMock.mockClear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
});

const basePlan = {
  id: 'plan-1', slug: 'pro', name: 'Pro', tagline: null,
  monthly_price: 100, credits_included: 500, max_users: 10,
  features: [], is_most_chosen: false, is_custom: false, sort_order: 1, active: true,
};

const baseSub = (overrides: Partial<any>) => ({
  id: 'sub-1', owner_id: 'owner1', name: 'Empresa A',
  admin_name: 'João', admin_email: 'joao@empresa.com',
  whatsapp_limit: 10, plan_slug: 'pro', monthly_fee: 100,
  inherit_branding: true, byok_inherit: true, byok_api_key: null,
  blocked_pages: [], credit_limit: 500, credit_balance: 500,
  credits_used_today: 0, credits_used_30d: 0, status: 'active',
  allow_custom_logic: false, created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('WhiteLabelTab · Sub-empresas listing', () => {
  it('renders the admin_email normalized (lowercase & trimmed) even when DB has mixed casing', async () => {
    subCompanyRows.push(baseSub({ id: 's1', admin_email: '  Admin@LeadSeller.COM  ' }));
    planRows.push(basePlan);

    render(<WhiteLabelTab />);

    const row = await screen.findByTestId('sub-admin-email-s1');
    expect(row).toHaveTextContent('admin@leadseller.com');
    expect(row).not.toHaveTextContent('Admin@LeadSeller.COM');
  });

  it('never displays duplicate rows for the same normalized email', async () => {
    subCompanyRows.push(
      baseSub({ id: 'newest', name: 'Empresa Nova', admin_email: 'Admin@LeadSeller.com' }),
      baseSub({ id: 'older',  name: 'Empresa Antiga', admin_email: ' admin@leadseller.com ' }),
      baseSub({ id: 'other',  name: 'Empresa Outra', admin_email: 'contact@leadseller.com' }),
    );
    planRows.push(basePlan);

    render(<WhiteLabelTab />);

    await screen.findByTestId('sub-admin-email-newest');
    expect(screen.queryByTestId('sub-admin-email-older')).not.toBeInTheDocument();
    expect(screen.getByTestId('sub-admin-email-other')).toBeInTheDocument();

    // The name of the deduped-out row must not leak into the list either.
    expect(screen.queryByText('Empresa Antiga')).not.toBeInTheDocument();
  });
});

describe('WhiteLabelTab · Sub-empresa update flow', () => {
  it('sends admin_email normalized to the backend on update', async () => {
    const sub = baseSub({ id: 'sub-edit', admin_email: 'joao@empresa.com' });
    subCompanyRows.push(sub);
    planRows.push(basePlan);

    render(<WhiteLabelTab />);
    const user = userEvent.setup();

    // Open the edit dialog for the row.
    const emailCell = await screen.findByTestId('sub-admin-email-sub-edit');
    const rowEl = emailCell.closest('div.flex.items-center.justify-between') as HTMLElement;
    const editBtn = within(rowEl!).getByTitle('Editar');
    await user.click(editBtn);

    // Overwrite email with a value containing mixed casing + surrounding spaces.
    const emailInput = await screen.findByPlaceholderText('email@exemplo.com') as HTMLInputElement;
    await user.clear(emailInput);
    await user.type(emailInput, '  NOVO@Empresa.COM  ');

    // Trigger save.
    const saveBtn = screen.getByRole('button', { name: /salvar/i });
    await user.click(saveBtn);

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = updateMock.mock.calls[0][0];
    expect(payload.admin_email).toBe('novo@empresa.com');
    expect(payload.admin_email).toBe(normalizeAdminEmail('  NOVO@Empresa.COM  '));

    // The edge function payload must also carry the normalized address.
    if (invokeMock.mock.calls.length) {
      const [, { body }] = invokeMock.mock.calls[0];
      expect(body.email).toBe('novo@empresa.com');
    }
  });
});
