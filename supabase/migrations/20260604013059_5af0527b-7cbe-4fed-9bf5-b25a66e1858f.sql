-- Tabela para templates de e-mail
CREATE TABLE IF NOT EXISTS public.crm_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_email_templates TO authenticated;
GRANT ALL ON public.crm_email_templates TO service_role;
ALTER TABLE public.crm_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage templates" ON public.crm_email_templates
  FOR ALL TO authenticated USING (true);

-- Adiciona campos de retry no log de webhook
ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'; -- pending, sent, failed, retrying

-- Inserir templates padrão
INSERT INTO public.crm_email_templates (name, subject, body_html, description)
VALUES 
('kanban_move', 'Movimentação no Kanban: {{contact_name}}', '<p>Olá,</p><p>O contato <strong>{{contact_name}}</strong> foi movido para a etapa <strong>{{new_status}}</strong> por <strong>{{agent_name}}</strong>.</p><p>ID de Correlação: {{correlation_id}}</p>', 'Notificação de mudança de etapa no Kanban'),
('ai_action', 'Ação Automática Executada', '<p>A I.A. executou uma ação para o contato <strong>{{contact_name}}</strong>.</p><p>Detalhes: {{action_details}}</p><p>ID de Correlação: {{correlation_id}}</p>', 'Notificação de execução de agente de I.A.')
ON CONFLICT (name) DO NOTHING;
