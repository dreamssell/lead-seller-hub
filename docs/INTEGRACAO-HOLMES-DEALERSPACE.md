# Mapeamento Holmes / DealerSpace → `public.leads`

Este documento define o contrato de dados esperado pelas integrações externas
Holmes e DealerSpace ao inserir leads no hub Lead Seller.

## 1. Endpoint recomendado

Use o edge function existente `handle-inbound-webhook`, que já valida
autenticação por chave de API e grava em `public.leads`. Payload esperado:

```json
{
  "owner_id": "<uuid da conta destino>",
  "sub_company_id": "<uuid opcional>",
  "name": "Nome do lead",
  "email": "email@exemplo.com",
  "phone": "+55 11 99999-0000",
  "channel": "whatsapp | site | telefone | ...",
  "source": "holmes | dealerspace | <texto original>",
  "status": "novo | em_atendimento | ganho | perdido | <texto original>",
  "estimated_value": 1500.00,
  "metadata": { "external_id": "...", "extras": "..." }
}
```

## 2. Normalização automática (trigger `normalize_lead_integration_fields`)

Após a migração, o Postgres normaliza os campos abaixo em INSERT/UPDATE:

### Origem (`source`)
| Recebido (regex, case-insensitive) | Persistido como |
| --- | --- |
| contém `holmes` | `holmes` |
| contém `dealer` + `space` (com espaço, `-` ou `_`) | `dealerspace` |
| qualquer outro | mantém como veio |

Isso significa que payloads como `"Holmes CRM"`, `"holmes-api"`,
`"DealerSpace"`, `"dealer_space"` ou `"Dealer Space"` são todos consolidados nos
dois valores canônicos, garantindo que o KPI **Leads Gerados** e os
gráficos/tabelas do painel Captura de Leads agrupem corretamente.

### Status (`status`)
| Recebido | Persistido como |
| --- | --- |
| `new`, `novo`, `novo lead`, `lead`, `aberto`, `open` | `novo` |
| `in_progress`, `in progress`, `em_atendimento`, `em atendimento`, `atendendo`, `working`, `contacted` | `em_atendimento` |
| `won`, `ganho`, `converted`, `sale`, `venda`, `closed_won`, `sold` | `ganho` |
| `lost`, `perdido`, `cancelled`, `canceled`, `closed_lost`, `declined` | `perdido` |

Qualquer valor fora dessa tabela é mantido como veio (útil para status
customizados de cada cliente).

## 3. Validação no backend

Chame a RPC `get_leads_capture_report(p_owner, p_from, p_to)` para conferir que
cada categoria (Holmes, DealerSpace, demais) está sendo somada ao total do KPI
LEADS GERADOS. O front-end já expõe esse relatório no bloco
"Validação backend · LEADS GERADOS" da página `Captura de Leads`.

Exemplo:

```sql
SELECT * FROM public.get_leads_capture_report(
  NULL,                       -- owner (NULL = todas as contas visíveis)
  now() - interval '30 days', -- período inicial
  NULL                        -- período final (NULL = hoje)
);
```

Colunas: `source_category`, `total_leads`, `novos`, `em_atendimento`,
`ganhos`, `perdidos`, `receita`, `included_in_leads_gerados` (sempre `true`).

## 4. Tempo real

A tabela `public.leads` está publicada em `supabase_realtime`. O front-end do
painel Captura de Leads assina INSERT/UPDATE/DELETE e atualiza tanto os KPIs
quanto a tabela do modal automaticamente — não é preciso recarregar a página
quando o Holmes/DealerSpace enviar um novo lead.
