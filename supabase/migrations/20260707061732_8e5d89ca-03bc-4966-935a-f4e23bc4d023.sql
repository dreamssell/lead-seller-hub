-- Habilita Realtime (Postgres Changes) para as tabelas que governam blocked_pages,
-- para que o AuthContext receba UPDATEs por ID (owner/sub/user) em tempo real.
DO $$
BEGIN
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.client_companies'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_companies'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_account_access'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Garante REPLICA IDENTITY FULL para que os filtros por ID/coluna
-- (auth_user_id, id, user_id) sejam entregues corretamente aos assinantes.
ALTER TABLE public.client_companies REPLICA IDENTITY FULL;
ALTER TABLE public.sub_companies REPLICA IDENTITY FULL;
ALTER TABLE public.user_account_access REPLICA IDENTITY FULL;