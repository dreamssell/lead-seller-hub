export type ChatErrorCode =
  | 'EVOLUTION_MENTIONED_INVALID'
  | 'EVOLUTION_TEXT_REQUIRED'
  | 'EVOLUTION_CONNECTION_CLOSED'
  | 'EVOLUTION_SCHEMA_INVALID'
  | 'WHATSAPP_CONNECTION_MISSING'
  | 'UNKNOWN_SEND_ERROR';

export interface NormalizedChatError {
  code: ChatErrorCode;
  title: string;
  message: string;
  detail: string;
  retryable: boolean;
  blockedBy?: string;
}

export function rawErrorMessage(input: unknown): string {
  if (input instanceof Error) return input.message || input.name;
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const anyInput = input as any;
    const detail = anyInput.response?.message ?? anyInput.message ?? anyInput.error ?? anyInput.details ?? anyInput.hint;
    if (typeof detail === 'string') return detail;
    if (detail != null) {
      try { return JSON.stringify(detail); } catch { /* ignore */ }
    }
    try { return JSON.stringify(input); } catch { /* ignore */ }
  }
  return 'Erro desconhecido ao enviar mensagem.';
}

export function normalizeChatSendError(input: unknown): NormalizedChatError {
  const detail = rawErrorMessage(input);
  const normalized = detail.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (/mentioned\s+does\s+not\s+meet\s+minimum\s+length|mentioned.*minimum length|mentioned inval/i.test(detail)) {
    return {
      code: 'EVOLUTION_MENTIONED_INVALID',
      title: 'Erro ao enviar',
      message: 'A Evolution recusou o payload por menção inválida. O envio foi bloqueado antes da entrega.',
      detail,
      retryable: true,
      blockedBy: 'mentioned inválido',
    };
  }

  if (/requires property\s+\\?"?text\\?"?|property\s+text|text is required|text.*obrigat/i.test(detail)) {
    return {
      code: 'EVOLUTION_TEXT_REQUIRED',
      title: 'Erro ao enviar',
      message: 'A Evolution exigiu um campo de texto válido. O sistema tentará reenviar com texto normalizado.',
      detail,
      retryable: true,
      blockedBy: 'texto obrigatório',
    };
  }

  if (/connection\s*closed|connectionclosed|socket.*closed|not\s*connected|instance.*not.*(open|connected)|desconectad/i.test(detail)) {
    return {
      code: 'EVOLUTION_CONNECTION_CLOSED',
      title: 'Instância desconectada',
      message: 'Sua instância do WhatsApp está desconectada. Reescaneie o QR Code em Conexões & Canais.',
      detail,
      retryable: false,
      blockedBy: 'instância desconectada',
    };
  }

  if (/requires property|schema|invalid|400|bad request|validation/i.test(detail)) {
    return {
      code: 'EVOLUTION_SCHEMA_INVALID',
      title: 'Erro ao enviar',
      message: 'A Evolution recusou o formato do payload. Veja o diagnóstico da mensagem e tente reenviar.',
      detail,
      retryable: true,
      blockedBy: 'payload inválido',
    };
  }

  if (normalized.includes('conexao ativa nao encontrada') || normalized.includes('whatsapp') && normalized.includes('conexao')) {
    return {
      code: 'WHATSAPP_CONNECTION_MISSING',
      title: 'WhatsApp sem conexão ativa',
      message: 'Nenhuma conexão ativa foi encontrada para enviar por WhatsApp.',
      detail,
      retryable: false,
      blockedBy: 'conexão ausente',
    };
  }

  return {
    code: 'UNKNOWN_SEND_ERROR',
    title: 'Erro ao enviar',
    message: detail || 'Não foi possível enviar a mensagem.',
    detail,
    retryable: true,
    blockedBy: 'falha no envio',
  };
}
