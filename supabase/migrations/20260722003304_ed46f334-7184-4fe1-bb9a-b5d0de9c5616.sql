
-- Helper: quem pode gerenciar tags do WhatsApp (criar/editar/excluir)
CREATE OR REPLACE FUNCTION public.can_manage_chat_tags(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- dono da conta
    _user_id = _owner_id
    -- admin global
    OR public.has_role(_user_id, 'admin'::app_role)
    -- admin da conta (CEO / gestão) na mesma empresa/sub-empresa
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = _user_id
        AND a.owner_id = _owner_id
        AND (a.is_owner = true OR a.is_account_admin = true)
    )
    -- cargos de gestão via assinatura (diretor/coordenador/supervisor)
    OR EXISTS (
      SELECT 1
      FROM public.user_signature_roles s
      JOIN public.user_account_access a ON a.user_id = s.user_id
      WHERE s.user_id = _user_id
        AND a.owner_id = _owner_id
        AND s.role IN ('diretor','coordenador','supervisor')
    );
$$;

-- Substitui a policy de escrita restrita ao dono por uma que aceita gestores
DROP POLICY IF EXISTS "owner manages tags" ON public.chat_tags;

CREATE POLICY "managers manage chat tags"
  ON public.chat_tags
  FOR ALL
  USING (public.can_manage_chat_tags(auth.uid(), owner_id))
  WITH CHECK (public.can_manage_chat_tags(auth.uid(), owner_id));
