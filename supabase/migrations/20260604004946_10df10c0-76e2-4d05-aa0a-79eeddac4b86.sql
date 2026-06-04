-- 1. Criar tabela de contatos (CRM)
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    job_title TEXT,
    status TEXT DEFAULT 'lead', -- lead, prospect, customer, churned
    source TEXT,
    estimated_value NUMERIC(15,2),
    assigned_agent_id UUID, -- Pode ser um usuário humano ou um AI Agent futuramente
    tags TEXT[],
    notes TEXT,
    last_interaction_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Histórico unificado de CRM (Eventos)
CREATE TABLE IF NOT EXISTS public.crm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'chat', 'call', 'ticket', 'automation', 'autonomous_action'
    title TEXT,
    description TEXT,
    actor_id UUID, -- ID do usuário ou agente que realizou a ação
    actor_type TEXT, -- 'human', 'ai'
    payload JSONB DEFAULT '{}'::jsonb
);

-- 3. Expandir AI Agents para suporte Autônomo
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS is_autonomous BOOLEAN DEFAULT false;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS autonomous_config JSONB DEFAULT '{
    "trigger_events": ["new_lead", "incoming_chat"],
    "allowed_actions": ["send_whatsapp", "create_task", "update_crm_status"],
    "max_actions_per_run": 5,
    "monitoring_level": "high"
}'::jsonb;

-- 4. Permissões
GRANT ALL ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
GRANT ALL ON public.crm_events TO authenticated;
GRANT ALL ON public.crm_events TO service_role;

-- 5. RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own contacts" ON public.contacts
    FOR ALL USING (true); -- Permitindo acesso por enquanto, mas idealmente seria filtrado por empresa/sub-empresa

CREATE POLICY "Users can manage crm events" ON public.crm_events
    FOR ALL USING (true);

-- 6. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contacts_updated_at 
BEFORE UPDATE ON public.contacts 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
