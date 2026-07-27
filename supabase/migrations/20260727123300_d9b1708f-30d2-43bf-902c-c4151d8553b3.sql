ALTER TABLE public.sip_configurations
ADD COLUMN IF NOT EXISTS auth_username text;

COMMENT ON COLUMN public.sip_configurations.auth_username IS 'SIP authentication username / Yeastar Register Name when different from extension URI user.';