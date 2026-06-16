
-- =============== PIPELINES ===============
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipelines TO authenticated;
GRANT ALL ON public.pipelines TO service_role;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages pipelines" ON public.pipelines FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "sub users read pipelines" ON public.pipelines FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid() AND a.owner_id = pipelines.owner_id
    AND (a.sub_company_id IS NULL OR a.sub_company_id = pipelines.sub_company_id)));
CREATE TRIGGER trg_pipelines_updated BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== PIPELINE STAGES ===============
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  color text DEFAULT 'bg-muted-foreground',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage stages via pipeline" ON public.pipeline_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stages.pipeline_id
    AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stages.pipeline_id
    AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))));
CREATE POLICY "read stages via access" ON public.pipeline_stages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.pipelines p
    JOIN public.user_account_access a ON a.owner_id = p.owner_id
    WHERE p.id = pipeline_stages.pipeline_id AND a.user_id = auth.uid()
    AND (a.sub_company_id IS NULL OR a.sub_company_id = p.sub_company_id)));
CREATE TRIGGER trg_stages_updated BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== CHANNEL ROUTING ===============
CREATE TABLE public.channel_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  channel text NOT NULL,
  chat_provider text NOT NULL DEFAULT 'uaz' CHECK (chat_provider IN ('uaz','evolution','wavoip','meta','instagram','telegram','facebook','linkedin','tiktok','youtube','widget','none')),
  voice_provider text DEFAULT 'wavoip',
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sub_company_id, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_routing TO authenticated;
GRANT ALL ON public.channel_routing TO service_role;
ALTER TABLE public.channel_routing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages routing" ON public.channel_routing FOR ALL
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "sub users read routing" ON public.channel_routing FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid() AND a.owner_id = channel_routing.owner_id
    AND (a.sub_company_id IS NULL OR a.sub_company_id = channel_routing.sub_company_id)));
CREATE TRIGGER trg_routing_updated BEFORE UPDATE ON public.channel_routing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== EXTEND CUSTOMERS ===============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS origin_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;

-- =============== EXTEND LEADS ===============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS origin_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- =============== EXTEND CHAT MESSAGES ===============
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;

-- =============== EXTEND WHATSAPP CONNECTIONS ===============
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'chat' CHECK (role IN ('chat','voice','both'));

CREATE INDEX IF NOT EXISTS idx_customers_phone_sub ON public.customers(phone, sub_company_id);
CREATE INDEX IF NOT EXISTS idx_leads_customer ON public.leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_msgs_customer ON public.chat_messages(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_lookup ON public.channel_routing(sub_company_id, channel) WHERE enabled = true;
