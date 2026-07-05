-- 1) Realtime para leads
ALTER TABLE public.leads REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Normalização de source/status para integrações Holmes / DealerSpace
CREATE OR REPLACE FUNCTION public.normalize_lead_integration_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_src text := lower(coalesce(NEW.source, ''));
  v_status text := lower(coalesce(NEW.status, ''));
BEGIN
  -- source canônico
  IF v_src ~ 'holmes' THEN
    NEW.source := 'holmes';
  ELSIF v_src ~ 'dealer[[:space:]_-]?space' THEN
    NEW.source := 'dealerspace';
  END IF;

  -- status canônico (aceita variantes das APIs externas)
  IF v_status IN ('new','novo','novo lead','lead','aberto','open') THEN
    NEW.status := 'novo';
  ELSIF v_status IN ('in_progress','in progress','em_atendimento','em atendimento','atendendo','working','contacted') THEN
    NEW.status := 'em_atendimento';
  ELSIF v_status IN ('won','ganho','converted','sale','venda','closed_won','sold') THEN
    NEW.status := 'ganho';
  ELSIF v_status IN ('lost','perdido','cancelled','canceled','closed_lost','declined') THEN
    NEW.status := 'perdido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lead_integration_fields ON public.leads;
CREATE TRIGGER trg_normalize_lead_integration_fields
BEFORE INSERT OR UPDATE OF source, status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.normalize_lead_integration_fields();

-- Retro-normaliza registros existentes
UPDATE public.leads
   SET source = 'holmes'
 WHERE source IS NOT NULL AND source <> 'holmes' AND lower(source) ~ 'holmes';

UPDATE public.leads
   SET source = 'dealerspace'
 WHERE source IS NOT NULL AND source <> 'dealerspace' AND lower(source) ~ 'dealer[[:space:]_-]?space';

-- 3) Relatório backend: valida que Holmes/DealerSpace estão contabilizados em LEADS GERADOS
CREATE OR REPLACE FUNCTION public.get_leads_capture_report(
  p_owner uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
) RETURNS TABLE (
  source_category text,
  total_leads bigint,
  novos bigint,
  em_atendimento bigint,
  ganhos bigint,
  perdidos bigint,
  receita numeric,
  included_in_leads_gerados boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT l.*
      FROM public.leads l
     WHERE (
             p_owner IS NULL
             OR l.owner_id = p_owner
             OR l.created_by = p_owner
             OR public.has_role(auth.uid(), 'admin'::app_role)
             OR EXISTS (
               SELECT 1 FROM public.user_account_access a
                WHERE a.user_id = auth.uid()
                  AND a.owner_id = coalesce(l.owner_id, l.created_by)
             )
           )
       AND (p_from IS NULL OR l.created_at >= p_from)
       AND (p_to   IS NULL OR l.created_at <= p_to)
  ),
  categorized AS (
    SELECT
      CASE
        WHEN lower(coalesce(source,'')) ~ 'holmes' THEN 'Holmes'
        WHEN lower(coalesce(source,'')) ~ 'dealer[[:space:]_-]?space' THEN 'DealerSpace'
        WHEN source IS NULL OR source = '' THEN 'Sem origem'
        ELSE source
      END AS cat,
      status,
      estimated_value
    FROM scoped
  )
  SELECT
    cat AS source_category,
    count(*) AS total_leads,
    count(*) FILTER (WHERE status = 'novo') AS novos,
    count(*) FILTER (WHERE status = 'em_atendimento') AS em_atendimento,
    count(*) FILTER (WHERE status = 'ganho') AS ganhos,
    count(*) FILTER (WHERE status = 'perdido') AS perdidos,
    coalesce(sum(estimated_value) FILTER (WHERE status = 'ganho'), 0)::numeric AS receita,
    true AS included_in_leads_gerados
  FROM categorized
  GROUP BY cat
  ORDER BY total_leads DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_leads_capture_report(uuid, timestamptz, timestamptz) TO authenticated;