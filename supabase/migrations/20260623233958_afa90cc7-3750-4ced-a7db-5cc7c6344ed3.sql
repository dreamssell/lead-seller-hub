
ALTER PUBLICATION supabase_realtime ADD TABLE public.landing_pages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.landing_buttons;
ALTER TABLE public.landing_pages REPLICA IDENTITY FULL;
ALTER TABLE public.landing_buttons REPLICA IDENTITY FULL;
