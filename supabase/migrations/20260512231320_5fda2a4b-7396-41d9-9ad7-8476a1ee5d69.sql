
-- LEADS
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'novo',
  source text,
  estimated_value numeric DEFAULT 0,
  assigned_to uuid,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE TRIGGER set_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CUSTOMERS
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  company text,
  document text,
  address text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select" ON public.customers FOR SELECT TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE TRIGGER set_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sku text,
  price numeric NOT NULL DEFAULT 0,
  category text,
  stock integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE POLICY "products_insert" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE POLICY "products_delete" ON public.products FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE TRIGGER set_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TASKS
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  due_date timestamptz,
  priority text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'pendente',
  assigned_to uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (auth.uid() = created_by OR auth.uid() = assigned_to OR has_role(auth.uid(),'admin'));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (auth.uid() = created_by OR auth.uid() = assigned_to OR has_role(auth.uid(),'admin'));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(),'admin'));
CREATE TRIGGER set_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
