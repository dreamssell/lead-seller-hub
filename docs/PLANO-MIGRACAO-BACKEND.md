# Plano de Migração: Backend Lovable Cloud para Supabase Próprio (EXECUÇÃO)

Este documento registra o status e o passo a passo da migração da infraestrutura de backend da Lead Seller para a sua conta pessoal do Supabase.

## 🚀 Status Atual da Execução: PASSO 2 EM ANDAMENTO

### ✅ Passo 1: Preparação do Ambiente (CONCLUÍDO)
- **Project ID:** `svonhzqnuqoagknmjkoo`
- **Region:** `sa-east-1` (São Paulo)
- **Status:** Credenciais recebidas e conexão via `psql` validada com sucesso.

### 🔄 Passo 2: Migração da Estrutura (EM EXECUÇÃO)
- **Ação:** Aplicação dos scripts SQL de `supabase/migrations/` no novo banco.
- **Progresso:** As tabelas principais (ai_agents, profiles, customers, leads, sub_companies, etc) já foram criadas.
- **Próxima Ação Técnica:** Finalizar a sincronização de funções SQL e triggers que podem ter dependências de ordem.

### ⏳ Passo 3: Migração de Dados (PENDENTE)
- **Estratégia:** Exportar dados da Lovable Cloud e importar no novo banco.
- **Foco:** Preservar todo o histórico da **Mult Seguros**.

### ⏳ Passo 4: Deploy das Edge Functions (PRÓXIMO)
- **Funções Detectadas:** 36 funções (WAHA, Wavoip, CRM, etc).
- **Ação:** Realizar o deploy via CLI para o novo Project ID.

---

## 📋 Dados do Novo Projeto (Referência)
- **Project URL:** `https://svonhzqnuqoagknmjkoo.supabase.co`
- **DB Connection:** `postgresql://postgres:k$CSEEt9qTJbRX!@db.svonhzqnuqoagknmjkoo.supabase.co:5432/postgres`

## 🛠️ Comandos Executados por Mim
1. Validação de conectividade com o novo banco de dados.
2. Início da execução sequencial das migrações SQL.
3. Mapeamento das Edge Functions locais.

---

## 💬 Feedback e Próximo Passo
**O que foi executado:** Já estabeleci a conexão com seu novo banco e comecei a "subir" as tabelas. O esquema básico já está lá.

**Próximo Passo:** Vou preparar o deploy das 36 **Edge Functions** para que suas automações e o WhatsApp continuem funcionando. 

*Atenção: Para o passo 4, precisarei configurar os "Secrets" (tokens de API do WAHA, Wavoip, etc) no seu novo painel. Se você tiver essas chaves guardadas, me avise, senão teremos que coletá-las das configurações atuais.*

Deseja que eu prossiga com o deploy das Edge Functions agora?