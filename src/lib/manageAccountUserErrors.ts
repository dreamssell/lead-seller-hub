export const MANAGE_USER_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sua sessão expirou. Faça login novamente para continuar.',
  invalid_json: 'Não foi possível interpretar a requisição. Recarregue a página e tente novamente.',
  missing_action: 'Ação não informada. Contate o suporte se o erro persistir.',
  unknown_action: 'Ação desconhecida. Atualize a página para carregar a versão mais recente.',
  not_allowed_for_sub: 'Você não tem permissão para gerenciar esta sub-empresa.',
  not_account_admin: 'Apenas administradores da conta podem executar esta ação.',
  scope_error: 'Não foi possível validar seu nível de acesso. Tente novamente.',
  list_query_error: 'Falha ao carregar a lista de membros da equipe.',
  invalid_create_payload: 'Informe nome, e-mail e uma senha com pelo menos 6 caracteres.',
  member_already_exists: 'Este e-mail já é membro deste escopo. Use "Editar" no card existente.',
  auth_user_error: 'Não foi possível criar/atualizar o usuário na base de autenticação.',
  profile_save_error: 'Usuário criado, mas o perfil não pôde ser salvo. Tente editar o membro.',
  access_save_error: 'Não foi possível salvar as permissões deste membro.',
  password_update_error: 'A nova senha não pôde ser aplicada. Verifique se ela tem 6+ caracteres.',
  profile_update_error: 'Não foi possível atualizar o perfil deste membro.',
  access_update_error: 'Não foi possível atualizar as permissões deste membro.',
  missing_user_id: 'Nenhum usuário selecionado para esta operação.',
  not_in_scope: 'Este usuário não pertence ao escopo atual.',
  cannot_delete_self: 'Você não pode remover a si mesmo. Peça a outro administrador.',
  access_delete_error: 'Não foi possível remover o acesso do membro.',
  signature_role_delete_error: 'Não foi possível remover o nível de acesso do membro.',
  email_change_forbidden: 'Apenas o dono da plataforma pode alterar o e-mail de um usuário.',
  email_already_used: 'Este e-mail já pertence a outro usuário.',
  email_update_error: 'Não foi possível atualizar o e-mail deste usuário na base de autenticação.',
  invalid_email: 'E-mail inválido. Verifique o formato e tente novamente.',
  internal_error: 'Erro interno inesperado. Tente novamente em instantes.',
};

async function parseErrorResponse(error: any): Promise<{ code?: string; message?: string } | null> {
  const context = error?.context;
  const response = (typeof Response !== 'undefined' && context instanceof Response)
    ? context
    : (context?.response as Response | undefined);

  if (!response) return null;

  const bodyText = await response.clone().text().catch(() => '');
  if (!bodyText) return null;

  try {
    const json = JSON.parse(bodyText);
    return {
      code: json?.code,
      message: json?.error || json?.message,
    };
  } catch {
    return null;
  }
}

export async function extractManageUserError(
  data: any,
  error: any,
): Promise<{ code?: string; message: string; raw?: string } | null> {
  let code: string | undefined = data?.code;
  let raw: string | undefined = data?.error || data?.message;

  if (error) {
    try {
      const parsed = await parseErrorResponse(error);
      raw = parsed?.message || raw;
      code = code || parsed?.code;
    } catch {
      // Keep fallback below.
    }

    const genericEdgeMessage = /Edge Function returned a non-2xx status code/i.test(String(error?.message || ''));
    if (!raw && !genericEdgeMessage) raw = error.message;
    if (!raw && genericEdgeMessage) {
      raw = 'O backend recusou a criação do membro. Recarregue a página e tente novamente; se persistir, verifique suas permissões e o limite do plano.';
    }
  }

  if (!raw && !code) return null;

  const friendlyBase = (code && MANAGE_USER_ERROR_MESSAGES[code])
    || raw
    || 'Erro desconhecido ao processar membro.';
  const friendly = (code && MANAGE_USER_ERROR_MESSAGES[code] && raw && raw !== MANAGE_USER_ERROR_MESSAGES[code])
    ? `${friendlyBase} Detalhe: ${raw}`
    : friendlyBase;

  return { code, message: friendly, raw };
}