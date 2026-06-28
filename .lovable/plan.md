
# Chat Omnichannel WhatsApp — Evolução em 4 Fases

Persona prioritária: **Atendente / SDR (throughput)**. Cada fase entrega valor sozinha; nada quebra o que já existe.

---

## Fase 1 — Composer Avançado + Throughput do Atendente *(implemento agora)*

Foco: o atendente conseguir responder mais rápido e melhor que no WhatsApp Business.

**Composer**
- Gravação de áudio com waveform animada, timer, cancelar/enviar, preview antes de enviar.
- Drag-and-drop de arquivos sobre a janela do chat + clipboard paste (Ctrl+V de imagem).
- Preview rico de mídia antes do envio (imagem, PDF, áudio, documento) com legenda opcional.
- Formatação WhatsApp: `*negrito*`, `_itálico_`, `~tachado~`, ``` `monospace` ``` — barra de formatação + atalhos (Ctrl+B/I).
- Picker de emoji integrado (já parcialmente existe — reorganizar).
- Mensagem agendada: agendar envio para data/hora futura (nova tabela `scheduled_messages` + processador cron).
- Auto-save de rascunho por conversa em `localStorage`.
- Contador de caracteres e indicador de "digitando…" enviado ao WhatsApp.

**Atalhos do atendente**
- `/` abre busca de respostas rápidas inline com preview e variáveis (`{{nome}}`, `{{empresa}}`).
- Atalhos globais: `Ctrl+Enter` envia, `Esc` cancela edição, `↑` edita última mensagem, `Ctrl+K` busca conversa, `Ctrl+/` lista atalhos.
- Sugestão de resposta com IA (botão "✨ Sugerir resposta") baseado no histórico recente — usa Lovable AI Gateway com `google/gemini-3-flash-preview`.
- Tradução automática 1-clique (PT↔EN↔ES).
- Resumo da conversa (botão no header) — gera um TL;DR via IA.

**Polimento de UI**
- Bolhas com melhor contraste, status de entrega ✓✓ azul, timestamps relativos.
- Indicador "visto por <agente>" para a equipe interna.
- Scroll inteligente: trava no fundo quando perto, mostra botão "↓ N novas" quando longe.

---

## Fase 2 — Colaboração Interna + SLA

- Transferir / atribuir conversa para colega ou fila com motivo.
- Menção `@colega` em notas internas → notifica o mencionado.
- Modo supervisor: assistir conversa ao vivo + sussurro (mensagem só o atendente vê).
- Tags coloridas, prioridade (baixa/média/alta/urgente), status de ticket.
- SLA com timer visível: primeiro-resposta, próxima-resposta, resolução; cores conforme proximidade.
- Roteamento por canal/skill já existe — adicionar regras por horário e carga.
- Handoff humano↔IA com contexto preservado.

---

## Fase 3 — CRM 360° + Mídia Rica

- Painel direito com timeline unificada do cliente: leads, tarefas, assinaturas, ligações, e-mails, eventos.
- Galeria de mídias da conversa (grid filtrável por tipo).
- Envio de catálogo de produtos, listas interativas e botões (recursos nativos do WhatsApp Business API via Evolution).
- Cards de localização, contato (vCard) e enquetes.
- Anexar documento de assinatura direto do módulo Signatures.
- Visualizador in-app para PDF, áudio, vídeo (sem download forçado).

---

## Fase 4 — Buscas, Inbox Unificada e Automação Avançada

- Busca global full-text em todas as mensagens (índice `tsvector`).
- Filtros salvos por atendente: "minhas não respondidas", "urgentes hoje", etc.
- Threads fixadas e marcadores personalizados.
- Inbox unificada multi-canal (WhatsApp + Instagram + Messenger + Telegram + Widget).
- Bot de triagem visual (drag-drop flow builder).
- Auto-tag por IA, classificação de sentimento, follow-up automático após X horas.

---

## Detalhes técnicos da Fase 1

**Novos arquivos**
- `src/components/chat/AudioRecorder.tsx` — gravação MediaRecorder + waveform em canvas + upload p/ `whatsapp-media`.
- `src/components/chat/MediaDropzone.tsx` — overlay drag-and-drop + paste handler.
- `src/components/chat/MediaPreviewDialog.tsx` — preview + legenda + envio.
- `src/components/chat/FormatToolbar.tsx` — bold/italic/strike/mono.
- `src/components/chat/ScheduleMessageDialog.tsx` — date/time picker.
- `src/components/chat/QuickReplyPopover.tsx` — autocomplete `/` slash.
- `src/components/chat/AISuggestPopover.tsx` — botão sugerir/resumir/traduzir.
- `src/components/chat/KeyboardShortcutsHelp.tsx` — modal `Ctrl+/`.
- `src/hooks/useChatShortcuts.ts` — bindings de teclado.
- `src/hooks/useDraftMessage.ts` — persistência localStorage por `customer_id`.
- `supabase/functions/chat-ai-assist/index.ts` — endpoint IA (suggest, summarize, translate) usando Lovable AI Gateway.

**Mudanças em arquivos existentes**
- `src/pages/ChatPage.tsx` — integrar dropzone, atalhos, header com "Resumir conversa".
- Componente do composer no ChatPage — substituir input simples por composer rico.

**Banco**
- Nova tabela `scheduled_messages (id, customer_id, owner_id, connection_id, body, media_url, scheduled_for, status, created_at, sent_at, error)`.
- Tabela existente `chat_messages` — adicionar coluna `formatting` (jsonb) opcional para registrar formatação aplicada.
- Bucket `whatsapp-media` já existe (privado) — usar para áudios e anexos novos.
- RLS + GRANTs conforme padrão do projeto.

**Edge Function `chat-ai-assist`**
- POST com `{ mode: 'suggest' | 'summarize' | 'translate', target_lang?, messages[] }`.
- Usa `LOVABLE_API_KEY` + `google/gemini-3-flash-preview`.
- Trata 429/402 com mensagens claras.

**Compatibilidade**
- Nada do fluxo atual (Evolution, Wavoip, importação, badges) é alterado.
- Áudios gravados serão enviados via Evolution endpoint `sendMedia/sendWhatsAppAudio` (já suportado pelo adapter).

---

## Próximo passo
Implemento a Fase 1 completa agora. Ao final, peço seu OK antes de partir para a Fase 2.
