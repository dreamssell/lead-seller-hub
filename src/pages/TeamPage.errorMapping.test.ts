import { describe, it, expect } from 'vitest';
import { extractManageUserError, MANAGE_USER_ERROR_MESSAGES } from '@/lib/manageAccountUserErrors';

/**
 * Contract tests for the code→message dictionary returned by
 * `manage-account-user`. These guarantee that the UI can differentiate
 * each backend failure and surface a specific, user-friendly text.
 */

const BACKEND_CODES = [
  'unauthenticated',
  'invalid_json',
  'missing_action',
  'unknown_action',
  'not_allowed_for_sub',
  'not_account_admin',
  'scope_error',
  'list_query_error',
  'invalid_create_payload',
  'member_already_exists',
  'auth_user_error',
  'profile_save_error',
  'access_save_error',
  'password_update_error',
  'profile_update_error',
  'access_update_error',
  'missing_user_id',
  'not_in_scope',
  'cannot_delete_self',
  'access_delete_error',
  'signature_role_delete_error',
  'internal_error',
];

describe('MANAGE_USER_ERROR_MESSAGES dictionary', () => {
  it('has an entry for every documented backend code', () => {
    for (const code of BACKEND_CODES) {
      expect(MANAGE_USER_ERROR_MESSAGES[code], `missing PT-BR text for code ${code}`).toBeTruthy();
    }
  });

  it('all messages are non-empty and human readable', () => {
    for (const [code, msg] of Object.entries(MANAGE_USER_ERROR_MESSAGES)) {
      expect(msg.length, code).toBeGreaterThan(10);
      // Should not be a bare technical token.
      expect(msg, code).not.toMatch(/^[a-z_]+$/);
    }
  });
});

describe('extractManageUserError', () => {
  it('prefers PT-BR text when data.code is a known backend code', async () => {
    const r = await extractManageUserError(
      { code: 'not_account_admin', error: 'raw backend text' },
      null,
    );
    expect(r?.code).toBe('not_account_admin');
    expect(r?.message).toBe(MANAGE_USER_ERROR_MESSAGES.not_account_admin);
  });

  it('falls back to raw data.error text when code is unknown', async () => {
    const r = await extractManageUserError({ error: 'Algo específico' }, null);
    expect(r?.message).toBe('Algo específico');
  });

  it('parses FunctionsHttpError body from error.context (Response)', async () => {
    const response = new Response(
      JSON.stringify({ code: 'cannot_delete_self', error: 'raw' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
    const err = Object.assign(new Error('non-2xx'), { context: response });
    const r = await extractManageUserError(null, err);
    expect(r?.code).toBe('cannot_delete_self');
    expect(r?.message).toBe(MANAGE_USER_ERROR_MESSAGES.cannot_delete_self);
  });

  it('parses legacy error.context.response wrapper', async () => {
    const response = new Response(
      JSON.stringify({ code: 'member_already_exists' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
    const err = Object.assign(new Error('non-2xx'), { context: { response } });
    const r = await extractManageUserError(null, err);
    expect(r?.message).toBe(MANAGE_USER_ERROR_MESSAGES.member_already_exists);
  });

  it('falls back to error.message when the response body is not JSON', async () => {
    const response = new Response('boom', { status: 500 });
    const err = Object.assign(new Error('Falha de rede'), { context: response });
    const r = await extractManageUserError(null, err);
    expect(r?.message).toBe('Falha de rede');
  });

  it('returns null when there is neither error nor code', async () => {
    const r = await extractManageUserError({ ok: true }, null);
    expect(r).toBeNull();
  });
});
