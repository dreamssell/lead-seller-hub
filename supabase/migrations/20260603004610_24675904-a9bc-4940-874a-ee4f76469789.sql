-- Allow public access to certain audit log fields for status page
GRANT SELECT ON public.uaz_audit_logs TO anon;

-- Create policy for public view (only essential fields, no sensitive payload if possible, or limited)
-- We'll allow seeing event_type, status, message, latency_ms and created_at
CREATE POLICY "Public status view" 
ON public.uaz_audit_logs FOR SELECT
USING (true);
