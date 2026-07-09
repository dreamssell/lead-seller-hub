
-- =========================================================
-- CUSTOMERS: permitir acesso a todos os membros da conta
-- =========================================================
DROP POLICY IF EXISTS customers_select ON public.customers;
DROP POLICY IF EXISTS customers_insert ON public.customers;
DROP POLICY IF EXISTS customers_update ON public.customers;
DROP POLICY IF EXISTS customers_delete ON public.customers;

-- SELECT: dono, criador, admin da plataforma ou membro com acesso à conta/sub-empresa
CREATE POLICY customers_select ON public.customers
FOR SELECT
USING (
  auth.uid() = created_by
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = COALESCE(customers.owner_id, customers.created_by)
      AND (a.sub_company_id IS NULL OR a.sub_company_id = customers.sub_company_id)
  )
);

-- INSERT: qualquer usuário autenticado que grave created_by = auth.uid()
-- OU membro de uma conta gravando com owner_id da conta a que pertence
CREATE POLICY customers_insert ON public.customers
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    owner_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = customers.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = customers.sub_company_id)
    )
  )
);

-- UPDATE: criador, dono, admin ou membro da conta
CREATE POLICY customers_update ON public.customers
FOR UPDATE
USING (
  auth.uid() = created_by
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = COALESCE(customers.owner_id, customers.created_by)
      AND (a.sub_company_id IS NULL OR a.sub_company_id = customers.sub_company_id)
  )
)
WITH CHECK (
  auth.uid() = created_by
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = COALESCE(customers.owner_id, customers.created_by)
      AND (a.sub_company_id IS NULL OR a.sub_company_id = customers.sub_company_id)
  )
);

-- DELETE: criador, dono ou admin (mais restritivo, evita exclusão acidental)
CREATE POLICY customers_delete ON public.customers
FOR DELETE
USING (
  auth.uid() = created_by
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = COALESCE(customers.owner_id, customers.created_by)
      AND (a.sub_company_id IS NULL OR a.sub_company_id = customers.sub_company_id)
      AND a.is_account_admin
  )
);

-- =========================================================
-- CHAT_MESSAGES: permitir SELECT/INSERT para todos os membros
-- =========================================================
DROP POLICY IF EXISTS "Users can view messages for their customers" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert messages for their customers" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update messages for their customers" ON public.chat_messages;

-- SELECT: qualquer membro com acesso ao cliente
CREATE POLICY "Users can view messages for their customers"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = chat_messages.customer_id
      AND (
        c.created_by = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid()
            AND a.owner_id = COALESCE(c.owner_id, c.created_by)
            AND (a.sub_company_id IS NULL OR a.sub_company_id = c.sub_company_id)
        )
      )
  )
);

-- INSERT: qualquer membro com acesso ao cliente pode enviar mensagens
CREATE POLICY "Users can insert messages for their customers"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = chat_messages.customer_id
      AND (
        c.created_by = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid()
            AND a.owner_id = COALESCE(c.owner_id, c.created_by)
            AND (a.sub_company_id IS NULL OR a.sub_company_id = c.sub_company_id)
        )
      )
  )
);

-- UPDATE: mantém padrão amplo (status, edição)
CREATE POLICY "Users can update messages for their customers"
ON public.chat_messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = chat_messages.customer_id
      AND (
        c.created_by = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid()
            AND a.owner_id = COALESCE(c.owner_id, c.created_by)
            AND (a.sub_company_id IS NULL OR a.sub_company_id = c.sub_company_id)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = chat_messages.customer_id
      AND (
        c.created_by = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid()
            AND a.owner_id = COALESCE(c.owner_id, c.created_by)
            AND (a.sub_company_id IS NULL OR a.sub_company_id = c.sub_company_id)
        )
      )
  )
);
