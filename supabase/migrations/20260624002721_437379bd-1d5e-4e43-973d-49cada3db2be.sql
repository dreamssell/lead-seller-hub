DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'landing_pages'
      AND policyname = 'authenticated read published landing pages'
  ) THEN
    CREATE POLICY "authenticated read published landing pages"
      ON public.landing_pages
      FOR SELECT
      TO authenticated
      USING (status = 'published');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'landing_buttons'
      AND policyname = 'authenticated read buttons of published landing pages'
  ) THEN
    CREATE POLICY "authenticated read buttons of published landing pages"
      ON public.landing_buttons
      FOR SELECT
      TO authenticated
      USING (EXISTS (
        SELECT 1
        FROM public.landing_pages p
        WHERE p.id = landing_buttons.page_id
          AND p.status = 'published'
      ));
  END IF;
END $$;