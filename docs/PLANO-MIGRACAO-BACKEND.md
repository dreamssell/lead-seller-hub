# Plano de Migração: Backend Lovable Cloud para Supabase Próprio

Este documento descreve o passo a passo para migrar a infraestrutura de backend da Lead Seller para sua conta pessoal do Supabase, garantindo a integridade dos dados, especialmente da **Mult Seguros**.

## ⚠️ Considerações Importantes
- **Backup de Dados:** Antes de iniciar, realizaremos um export completo do banco de dados (esquema e dados).
- **Tempo de Inatividade:** Durante a troca das chaves no frontend, haverá um breve período onde o sistema poderá ficar instável até que os usuários recarreguem a página.
- **Segurança:** As novas chaves (URL e Anon Key) deverão ser configuradas no ambiente do projeto.

---

## 📋 Passo a Passo da Migração

### 1. Preparação do Novo Ambiente (Sua Conta Supabase)
1. Crie um novo projeto no seu Dashboard do Supabase.
2. Anote a **Project URL** e a **Anon Key** (disponíveis em Project Settings > API).
3. Habilite os provedores de autenticação necessários (E-mail e Google).

### 2. Migração da Estrutura (Esquema)
O projeto já possui todos os arquivos de migração necessários na pasta `supabase/migrations`.
1. Instale a CLI do Supabase localmente.
2. Execute o login e link com seu novo projeto:
   ```bash
   supabase login
   supabase link --project-ref <seu-novo-project-ref>
   ```
3. Aplique as migrações para reconstruir as tabelas, RLS, triggers e funções:
   ```bash
   supabase db push
   ```

### 3. Migração de Dados (Backup Mult Seguros e outros)
Para garantir que o histórico não seja perdido:
1. **Exportação:** Eu gerarei um script de dump dos dados das tabelas públicas (especialmente `companies`, `profiles`, `customers`, `chat_messages`, `leads`, `funnels`).
2. **Importação:** Os dados serão inseridos no novo banco respeitando as chaves estrangeiras.
   - *Nota:* As senhas de usuários não são migradas diretamente entre bancos Supabase por segurança. Os usuários precisarão resetar a senha ou usar o fluxo de "Esqueci minha senha" no primeiro acesso, a menos que usemos um export/import via ferramenta administrativa do Supabase (que requer acesso total que providenciarei no guia detalhado).

### 4. Deploy das Edge Functions
Temos diversas funções críticas (WAHA, Wavoip, Webhooks).
1. Realize o deploy das funções da pasta `supabase/functions` para o novo projeto:
   ```bash
   supabase functions deploy --all
   ```
2. Configure os **Secrets** no novo projeto (chaves de API do WAHA, Wavoip, etc.) usando `supabase secrets set`.

### 5. Reconexão do Frontend
1. Atualizaremos as variáveis de ambiente do projeto para apontar para a nova URL e Key.
2. Reiniciaremos as integrações de Webhook (Holmes, DealerSpace) para apontar para a nova URL das Edge Functions.

### 6. Reinicialização das Sessões WhatsApp
Como as sessões do WAHA/Evolution dependem de tokens que podem mudar ou estar vinculados à infraestrutura antiga:
1. Acessar o menu de Reconexão no Dashboard.
2. Validar o status das instâncias e realizar novo pareamento de QR Code onde necessário.

---

## 🚀 Próximos Passos
Deseja que eu comece a gerar os scripts de exportação de dados para a **Mult Seguros** agora?
