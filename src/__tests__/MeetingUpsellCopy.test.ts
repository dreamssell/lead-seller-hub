/**
 * Garante que a mensagem literal do upsell do módulo Meeting NUNCA muda —
 * seja por i18n, edições acidentais, refatorações ou variação por navegador.
 *
 * Se este teste falhar, revise TODOS os pontos que exibem o upsell antes de
 * atualizar a constante.
 */
import { describe, it, expect } from 'vitest';
import { MEETING_UPSELL_MESSAGE, MEETING_UPSELL_TITLE, MEETING_UPSELL_DESCRIPTION } from '@/lib/meetingUpsell';

describe('Padronização da mensagem "Contrate esse serviço agora!"', () => {
  it('MEETING_UPSELL_MESSAGE é EXATAMENTE a string canônica', () => {
    // Comparação estrita — sem trim, sem case-insensitive, sem regex.
    expect(MEETING_UPSELL_MESSAGE).toBe('Contrate esse serviço agora!');
    // Não pode ter espaços invisíveis, NBSP, zero-width, etc.
    expect(MEETING_UPSELL_MESSAGE).toMatch(/^[\x20-\x7E\u00C0-\u017F]+$/);
    expect(MEETING_UPSELL_MESSAGE).not.toMatch(/[\u00A0\u200B\u200C\u200D\uFEFF]/);
    // Título e descrição também são estáveis.
    expect(MEETING_UPSELL_TITLE).toBe('Meeting — recurso premium');
    expect(MEETING_UPSELL_DESCRIPTION.startsWith(MEETING_UPSELL_MESSAGE)).toBe(true);
  });

  it('não varia com locale/normalização (pt-BR, en-US, ...)', () => {
    for (const locale of ['pt-BR', 'en-US', 'es-ES', 'fr-FR']) {
      // toLocaleLowerCase(locale) não pode alterar caracteres da string
      // (garantia contra locales exóticos que remapeiam ç/ã).
      const lower = MEETING_UPSELL_MESSAGE.toLocaleLowerCase(locale);
      expect(lower.length).toBe(MEETING_UPSELL_MESSAGE.length);
    }
    // Normalização Unicode NFC/NFD produz o MESMO comprimento visual —
    // impede que alguém troque "ç" por "c + cedilha" combinante.
    expect(MEETING_UPSELL_MESSAGE.normalize('NFC')).toBe(MEETING_UPSELL_MESSAGE);
  });

  it('é a mesma string usada no card do Dashboard (fonte única)', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/components/dashboard/HighlightServiceCards.tsx', 'utf8'),
    );
    // O componente NÃO pode conter a string hardcoded — deve usar a constante.
    expect(src).not.toMatch(/'Contrate esse serviço agora!'/);
    expect(src).toContain('MEETING_UPSELL_DESCRIPTION');
  });
});
