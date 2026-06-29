
-- 1) Auditoria de edições humanas nos insights de IA
ALTER TABLE public.message_ai_analysis
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 2) Histórico de execução de bot flows
CREATE TABLE IF NOT EXISTS public.bot_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.bot_flows(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  trigger_message_id uuid,
  status text NOT NULL DEFAULT 'pending', -- pending|running|completed|error
  actions_taken jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT ON public.bot_flow_runs TO authenticated;
GRANT ALL ON public.bot_flow_runs TO service_role;

ALTER TABLE public.bot_flow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members can view runs"
  ON public.bot_flow_runs FOR SELECT
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access a WHERE a.user_id = auth.uid() AND a.owner_id = bot_flow_runs.owner_id)
  );

CREATE INDEX IF NOT EXISTS bot_flow_runs_trigger_idx ON public.bot_flow_runs(trigger_message_id);
CREATE INDEX IF NOT EXISTS bot_flow_runs_customer_idx ON public.bot_flow_runs(customer_id, created_at DESC);

-- evita disparar o mesmo flow duas vezes para a mesma mensagem
CREATE UNIQUE INDEX IF NOT EXISTS bot_flow_runs_unique_per_msg
  ON public.bot_flow_runs(flow_id, trigger_message_id)
  WHERE trigger_message_id IS NOT NULL;

-- 3) Extensões necessárias para cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4) Cron: follow-up scheduler (5 min)
DO $$
DECLARE v_id int;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'followup-scheduler';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;
END $$;

SELECT cron.schedule(
  'followup-scheduler',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1/followup-scheduler',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjamFlb3hqaGNmZWlzcGVobWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzYxODUsImV4cCI6MjA5MTg1MjE4NX0.lom6HJlDLttIF3iUFkfMKbi41h4lLLj3Ibsc2Bd-RWE"}'::jsonb,
    body := jsonb_build_object('at', now())
  );
  $$
);

-- 5) Cron: bot flow runner (1 min)
DO $$
DECLARE v_id int;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'bot-flow-runner';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;
END $$;

SELECT cron.schedule(
  'bot-flow-runner',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1/bot-flow-runner',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjamFlb3hqaGNmZWlzcGVobWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzYxODUsImV4cCI6MjA5MTg1MjE4NX0.lom6HJlDLttIF3iUFkfMKbi41h4lLLj3Ibsc2Bd-RWE"}'::jsonb,
    body := jsonb_build_object('at', now())
  );
  $$
);
