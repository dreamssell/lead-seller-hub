
-- Adiciona colunas de anexos e áudio à Comunicação Interna, sem quebrar registros existentes.
ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint,
  ADD COLUMN IF NOT EXISTS attachment_kind text CHECK (attachment_kind IS NULL OR attachment_kind IN ('image','audio','file')),
  ADD COLUMN IF NOT EXISTS audio_duration_ms integer;

-- Relaxa o CHECK de content: agora aceita vazio SE houver anexo, mas mantém teto de 8000.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'public.internal_messages'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%length(content)%';
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE public.internal_messages DROP CONSTRAINT %I', cname); END IF;
END $$;

ALTER TABLE public.internal_messages
  ADD CONSTRAINT internal_messages_content_or_attachment CHECK (
    length(content) <= 8000
    AND (length(content) > 0 OR attachment_url IS NOT NULL)
  );

-- Storage policies do bucket privado `internal-comms`.
-- Layout de chaves: {owner_id}/{sub_company_id_or_root}/{sender_id}/{yyyy}/{mm}/{uuid}.{ext}
-- SELECT/INSERT/DELETE restritos ao mesmo escopo (owner + sub_company) via has_internal_scope.

CREATE OR REPLACE FUNCTION public.has_internal_scope_for_key(_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  key_owner uuid;
  key_sub uuid;
  my_owner uuid;
  my_sub uuid;
BEGIN
  parts := string_to_array(_key, '/');
  IF array_length(parts, 1) < 3 THEN RETURN false; END IF;
  BEGIN key_owner := parts[1]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  IF parts[2] = 'root' THEN key_sub := NULL;
  ELSE BEGIN key_sub := parts[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  END IF;

  SELECT owner_id, sub_company_id INTO my_owner, my_sub
    FROM public.user_account_access
   WHERE user_id = auth.uid()
   LIMIT 1;

  IF my_owner IS NULL THEN RETURN false; END IF;
  RETURN my_owner = key_owner AND COALESCE(my_sub::text,'') = COALESCE(key_sub::text,'');
END;
$$;

DROP POLICY IF EXISTS "ic_objects_select" ON storage.objects;
DROP POLICY IF EXISTS "ic_objects_insert" ON storage.objects;
DROP POLICY IF EXISTS "ic_objects_delete" ON storage.objects;

CREATE POLICY "ic_objects_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'internal-comms' AND public.has_internal_scope_for_key(name));

CREATE POLICY "ic_objects_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'internal-comms' AND public.has_internal_scope_for_key(name) AND owner = auth.uid());

CREATE POLICY "ic_objects_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'internal-comms' AND public.has_internal_scope_for_key(name) AND owner = auth.uid());
