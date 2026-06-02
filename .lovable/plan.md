# Plano de Melhoria para Webhooks de Saída

Implementação de controle avançado de assinatura HMAC (rotação, versões) e painel de logs completo com filtros e paginação.

## Alterações Técnicas

### Banco de Dados (Supabase)
- **Tabela `webhooks`**:
    - Adição de `secret_version` (inteiro, padrão 1) para rastrear versões da chave.
    - Adição de `previous_secret` (texto) para permitir validação durante períodos de transição/rotação.
    - Adição de `last_rotated_at` (timestamp) para auditoria.
- **Tabela `webhook_logs`**:
    - Criação de índices otimizados para busca por `webhook_id`, `response_status` e data.

### Frontend (React/Vite)
- **`OutboundWebhooksTab.tsx`**:
    - Novo componente de **Gerenciamento de Segredos**: botão de rotação que move o segredo atual para "anterior" e gera um novo, incrementando a versão.
    - Seção de **Prévia de Headers**: exibição dinâmica de como os headers HMAC (`X-Webhook-Signature`, `X-Webhook-Version`, etc.) serão enviados.
    - UI atualizada para mostrar metadados de segurança.
- **`WebhookLogsTab.tsx`**:
    - Implementação de **Busca e Filtros**: barra de pesquisa por tipo de evento e botões de filtro rápido por status (sucesso/erro).
    - **Paginação**: carregamento sob demanda (Load More) ou paginação numérica para lidar com grandes volumes de logs.
    - **Ordenação**: toggle para alternar entre mais recentes e mais antigos.

## Próximos Passos
1. Executar migração do banco de dados.
2. Atualizar o componente de configuração de webhooks de saída.
3. Refatorar o componente de logs para suportar filtros e paginação.
