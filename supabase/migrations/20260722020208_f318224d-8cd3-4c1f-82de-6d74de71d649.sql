CREATE INDEX IF NOT EXISTS idx_lead_assignments_owner_customer_open
  ON public.lead_assignments (owner_id, customer_id, assigned_at DESC)
  WHERE stage <> 'closed';

CREATE INDEX IF NOT EXISTS idx_customers_owner_updated_desc
  ON public.customers (owner_id, updated_at DESC);