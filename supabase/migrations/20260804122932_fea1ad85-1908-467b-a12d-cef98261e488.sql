ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_pipeline ON public.customers(pipeline_id);