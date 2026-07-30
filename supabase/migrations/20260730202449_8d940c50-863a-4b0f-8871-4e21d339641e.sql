-- 1) Canonical source mapping ------------------------------------------------
CREATE OR REPLACE FUNCTION public.canonical_lead_source(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text := lower(btrim(coalesce(_raw, '')));
BEGIN
  IF s = '' THEN RETURN NULL; END IF;
  -- remove ruídos comuns (prefixos/sufixos de integração)
  s := regexp_replace(s, '^(webhook|inbound|integra(c|ç)(a|ã)o|integration|api|crm)[:_\-\s/]+', '', 'g');
  s := regexp_replace(s, '[:_\-\s/]+(webhook|inbound|api|crm|integration)$', '', 'g');

  IF s ~ 'holmes' THEN RETURN 'holmes'; END IF;
  IF s ~ 'dealer[[:space:]_\-\.]*space' OR s ~ '\mds[[:space:]_\-]?space\M' THEN RETURN 'dealerspace'; END IF;
  IF s ~ 'n8n' THEN RETURN 'n8n'; END IF;
  IF s ~ 'zapier' THEN RETURN 'zapier'; END IF;
  IF s ~ 'make\.com' OR s ~ '\mmake\M' OR s ~ 'integromat' THEN RETURN 'make'; END IF;
  IF s ~ 'typebot' THEN RETURN 'typebot'; END IF;
  IF s ~ 'rd[[:space:]_\-]?station' OR s ~ '\mrdstation\M' THEN RETURN 'rdstation'; END IF;
  IF s ~ 'hubspot' THEN RETURN 'hubspot'; END IF;
  IF s ~ 'pipedrive' THEN RETURN 'pipedrive'; END IF;
  IF s ~ 'google[[:space:]_\-]?ads' OR s ~ 'adwords' OR s ~ '\mgoogle\M' THEN RETURN 'google_ads'; END IF;
  IF s ~ '(meta|facebook|fb)[[:space:]_\-]?(ads|lead)' OR s ~ '\mfacebook\M' OR s ~ '\mmeta\M' THEN RETURN 'meta_ads'; END IF;
  IF s ~ 'instagram' OR s ~ '\mig\M' THEN RETURN 'instagram'; END IF;
  IF s ~ 'tiktok' THEN RETURN 'tiktok'; END IF;
  IF s ~ 'linkedin' THEN RETURN 'linkedin'; END IF;
  IF s ~ 'whats' OR s ~ '\mwaha\M' OR s ~ '\muaz\M' OR s ~ 'evolution' THEN RETURN 'whatsapp'; END IF;
  IF s ~ 'telegram' THEN RETURN 'telegram'; END IF;
  IF s ~ 'landing' OR s ~ '\msite\M' OR s ~ 'website' OR s ~ 'formul(a|á)rio' OR s ~ '\mform\M' THEN RETURN 'site'; END IF;
  IF s ~ 'indica' OR s ~ 'referr?al' THEN RETURN 'indicacao'; END IF;
  IF s ~ 'telefone' OR s ~ '\mcall\M' OR s ~ 'yeastar' OR s ~ '3cx' OR s ~ 'wavoip' THEN RETURN 'telefone'; END IF;

  -- fallback: slug estável (evita variações por caixa/acento/pontuação)
  s := regexp_replace(s, '[^a-z0-9]+', '_', 'g');
  s := btrim(s, '_');
  RETURN nullif(s, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.lead_source_label(_canonical text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE coalesce(_canonical, '')
    WHEN 'holmes' THEN 'Holmes'
    WHEN 'dealerspace' THEN 'DealerSpace'
    WHEN 'n8n' THEN 'n8n'
    WHEN 'zapier' THEN 'Zapier'
    WHEN 'make' THEN 'Make'
    WHEN 'typebot' THEN 'Typebot'
    WHEN 'rdstation' THEN 'RD Station'
    WHEN 'hubspot' THEN 'HubSpot'
    WHEN 'pipedrive' THEN 'Pipedrive'
    WHEN 'google_ads' THEN 'Google Ads'
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'instagram' THEN 'Instagram'
    WHEN 'tiktok' THEN 'TikTok'
    WHEN 'linkedin' THEN 'LinkedIn'
    WHEN 'whatsapp' THEN 'WhatsApp'
    WHEN 'telegram' THEN 'Telegram'
    WHEN 'site' THEN 'Site / Landing'
    WHEN 'indicacao' THEN 'Indicação'
    WHEN 'telefone' THEN 'Telefone'
    WHEN '' THEN 'Sem origem'
    ELSE coalesce(_canonical, 'Sem origem')
  END;
$$;

-- 2) Dedup columns ------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_norm text GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')) STORED,
  ADD COLUMN IF NOT EXISTS email_norm text GENERATED ALWAYS AS (nullif(lower(btrim(coalesce(email, ''))), '')) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_phone_norm ON public.leads (owner_id, phone_norm) WHERE phone_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email_norm ON public.leads (owner_id, email_norm) WHERE email_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_duplicate_of ON public.leads (duplicate_of) WHERE duplicate_of IS NOT NULL;

-- 3) Normalization + dedup trigger -------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_lead_integration_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text := lower(coalesce(NEW.status, ''));
  v_src text;
  v_phone text;
  v_email text;
  v_tenant uuid;
  v_master public.leads%ROWTYPE;
BEGIN
  v_src := public.canonical_lead_source(NEW.source);
  IF v_src IS NOT NULL THEN NEW.source := v_src; END IF;

  IF v_status IN ('new','novo','novo lead','lead','aberto','open') THEN
    NEW.status := 'novo';
  ELSIF v_status IN ('in_progress','in progress','em_atendimento','em atendimento','atendendo','working','contacted') THEN
    NEW.status := 'em_atendimento';
  ELSIF v_status IN ('won','ganho','converted','sale','venda','closed_won','sold') THEN
    NEW.status := 'ganho';
  ELSIF v_status IN ('lost','perdido','cancelled','canceled','closed_lost','declined') THEN
    NEW.status := 'perdido';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_phone := nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), '');
    v_email := nullif(lower(btrim(coalesce(NEW.email, ''))), '');
    v_tenant := coalesce(NEW.owner_id, NEW.created_by);

    IF (v_phone IS NOT NULL OR v_email IS NOT NULL) AND NEW.duplicate_of IS NULL THEN
      SELECT l.* INTO v_master
        FROM public.leads l
       WHERE coalesce(l.owner_id, l.created_by) = v_tenant
         AND l.duplicate_of IS NULL
         AND (
              (v_phone IS NOT NULL AND l.phone_norm = v_phone)
           OR (v_email IS NOT NULL AND l.email_norm = v_email)
         )
       ORDER BY l.created_at ASC
       LIMIT 1;

      IF FOUND THEN
        NEW.duplicate_of := v_master.id;
        NEW.merged_at := now();

        -- enriquece o registro consolidado com o que estiver faltando
        UPDATE public.leads m
           SET email = coalesce(nullif(btrim(m.email, ' '), ''), NEW.email),
               phone = coalesce(nullif(btrim(m.phone, ' '), ''), NEW.phone),
               name = coalesce(nullif(btrim(m.name, ' '), ''), NEW.name),
               channel = coalesce(m.channel, NEW.channel),
               source = coalesce(m.source, NEW.source),
               pipeline_id = coalesce(m.pipeline_id, NEW.pipeline_id),
               stage_id = coalesce(m.stage_id, NEW.stage_id),
               sub_company_id = coalesce(m.sub_company_id, NEW.sub_company_id),
               estimated_value = GREATEST(coalesce(m.estimated_value, 0), coalesce(NEW.estimated_value, 0)),
               updated_at = now()
         WHERE m.id = v_master.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lead_integration_fields ON public.leads;
CREATE TRIGGER trg_normalize_lead_integration_fields
  BEFORE INSERT OR UPDATE OF source, status, phone, email ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lead_integration_fields();

-- 4) Report considera apenas registros consolidados ---------------------------
DROP FUNCTION IF EXISTS public.get_leads_capture_report(uuid, timestamptz, timestamptz);
CREATE FUNCTION public.get_leads_capture_report(p_owner uuid DEFAULT NULL, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS TABLE (
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
     WHERE l.duplicate_of IS NULL
       AND (
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
      public.lead_source_label(public.canonical_lead_source(source)) AS cat,
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
GRANT EXECUTE ON FUNCTION public.canonical_lead_source(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.lead_source_label(text) TO authenticated, anon, service_role;

-- 5) Realtime completo (updates/deletes com payload completo)
ALTER TABLE public.leads REPLICA IDENTITY FULL;