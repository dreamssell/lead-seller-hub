-- Add allow_custom_logic to sub_companies
ALTER TABLE public.sub_companies
ADD COLUMN IF NOT EXISTS allow_custom_logic boolean NOT NULL DEFAULT false;

-- Ensure api_keys permissions are correct
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

-- Ensure RLS is enabled and there is a policy for creators
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'api_keys' AND policyname = 'api_keys_creator_all'
    ) THEN
        CREATE POLICY "api_keys_creator_all" ON public.api_keys
        FOR ALL TO authenticated
        USING (auth.uid() = created_by)
        WITH CHECK (auth.uid() = created_by);
    END IF;
END $$;
