
-- 1) Templates table
CREATE TABLE IF NOT EXISTS public.pipeline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,                 -- NULL = system template
  sub_company_id uuid,           -- optional sub-empresa scope
  name text NOT NULL,
  description text,
  channel text,                  -- optional channel hint (whatsapp, instagram, ...)
  stages jsonb NOT NULL,         -- [{name, color}]
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_templates TO authenticated;
GRANT ALL ON public.pipeline_templates TO service_role;

ALTER TABLE public.pipeline_templates ENABLE ROW LEVEL SECURITY;

-- Read: system templates OR owner's templates OR sub-company members with access
CREATE POLICY "read pipeline templates"
  ON public.pipeline_templates FOR SELECT
  USING (
    is_system = true
    OR auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR (owner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = pipeline_templates.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = pipeline_templates.sub_company_id)
    ))
  );

-- Write: only users with manage-pipelines permission for the scope; cannot touch system templates
CREATE POLICY "manage pipeline templates"
  ON public.pipeline_templates FOR ALL
  USING (
    is_system = false
    AND owner_id IS NOT NULL
    AND public.can_user_manage_pipelines(owner_id, sub_company_id)
  )
  WITH CHECK (
    is_system = false
    AND owner_id IS NOT NULL
    AND public.can_user_manage_pipelines(owner_id, sub_company_id)
  );

CREATE TRIGGER trg_pipeline_templates_updated
  BEFORE UPDATE ON public.pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed system templates
INSERT INTO public.pipeline_templates (name, description, channel, is_system, stages) VALUES
('Vendas WhatsApp', 'Funil padrão para vendas via WhatsApp', 'whatsapp', true,
  '[{"name":"Novo Lead","color":"bg-muted-foreground"},{"name":"Qualificação","color":"bg-primary"},{"name":"Proposta enviada","color":"bg-warning"},{"name":"Negociação","color":"bg-accent"},{"name":"Fechado","color":"bg-success"},{"name":"Perdido","color":"bg-destructive"}]'::jsonb),
('Atendimento / Suporte', 'Fluxo de tickets de atendimento', null, true,
  '[{"name":"Aberto","color":"bg-primary"},{"name":"Em análise","color":"bg-warning"},{"name":"Aguardando cliente","color":"bg-accent"},{"name":"Resolvido","color":"bg-success"},{"name":"Cancelado","color":"bg-destructive"}]'::jsonb),
('Captação de Leads (Widget)', 'Funil para leads vindos do site/widget', 'widget', true,
  '[{"name":"Inscrição","color":"bg-muted-foreground"},{"name":"Contato inicial","color":"bg-primary"},{"name":"Reunião agendada","color":"bg-warning"},{"name":"Convertido","color":"bg-success"}]'::jsonb),
('Pós-venda', 'Acompanhamento e fidelização', null, true,
  '[{"name":"Onboarding","color":"bg-primary"},{"name":"Ativo","color":"bg-success"},{"name":"Em risco","color":"bg-warning"},{"name":"Churn","color":"bg-destructive"}]'::jsonb)
ON CONFLICT DO NOTHING;

-- 3) Enable Realtime
ALTER TABLE public.pipelines REPLICA IDENTITY FULL;
ALTER TABLE public.pipeline_stages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipelines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;
