/**
 * Frase literal do upsell do módulo "Meeting" (videochamadas premium).
 *
 * ⚠️ NÃO ALTERAR sem atualizar os testes E2E em
 * `src/__tests__/MeetingCardGating.e2e.test.tsx` e
 * `src/__tests__/MeetingSidebarGating.e2e.test.tsx`.
 *
 * Precisa aparecer EXATAMENTE igual em todo lugar (toast, tooltip, modal),
 * independente de navegador, idioma do sistema ou tema — é a mensagem
 * padrão exibida a qualquer não-dono que tentar acessar o recurso.
 */
export const MEETING_UPSELL_MESSAGE = 'Contrate esse serviço agora!';

export const MEETING_UPSELL_TITLE = 'Meeting — recurso premium';

export const MEETING_UPSELL_DESCRIPTION =
  `${MEETING_UPSELL_MESSAGE} Fale com o seu consultor para liberar videochamadas e videoconferências.`;
