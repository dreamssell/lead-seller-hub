-- Create mcp_server_logs table
CREATE TABLE public.mcp_server_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    mcp_server_id UUID REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- 'success' or 'error'
    latency_ms INTEGER,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for faster filtering
CREATE INDEX idx_mcp_server_logs_server_id ON public.mcp_server_logs(mcp_server_id);

-- Enable RLS
ALTER TABLE public.mcp_server_logs ENABLE ROW LEVEL SECURITY;

-- Permissions
GRANT SELECT ON public.mcp_server_logs TO authenticated;
GRANT ALL ON public.mcp_server_logs TO service_role;

-- Policy
CREATE POLICY "Users can view logs of their servers"
ON public.mcp_server_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.mcp_servers ms
        WHERE ms.id = mcp_server_logs.mcp_server_id
    )
);
