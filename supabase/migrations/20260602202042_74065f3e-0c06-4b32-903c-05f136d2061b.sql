-- Create mcp_servers table
CREATE TABLE public.mcp_servers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sub_company_id UUID REFERENCES public.sub_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    api_key TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for faster filtering by sub_company_id
CREATE INDEX idx_mcp_servers_sub_company_id ON public.mcp_servers(sub_company_id);

-- Enable RLS
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

-- Use GRANT to set permissions for different roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_servers TO authenticated;
GRANT ALL ON public.mcp_servers TO service_role;

-- Policies for sub_company access
CREATE POLICY "Users can view mcp_servers of their sub_company or master"
ON public.mcp_servers
FOR SELECT
USING (
    sub_company_id IS NULL OR 
    EXISTS (
        SELECT 1 FROM public.user_account_access uaa 
        WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id = mcp_servers.sub_company_id
    )
);

CREATE POLICY "Users can insert mcp_servers to their sub_company"
ON public.mcp_servers
FOR INSERT
WITH CHECK (
    (sub_company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND sub_company_id IS NULL)) OR
    EXISTS (
        SELECT 1 FROM public.user_account_access uaa 
        WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id = mcp_servers.sub_company_id
    )
);

CREATE POLICY "Users can update mcp_servers of their sub_company"
ON public.mcp_servers
FOR UPDATE
USING (
    (sub_company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND sub_company_id IS NULL)) OR
    EXISTS (
        SELECT 1 FROM public.user_account_access uaa 
        WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id = mcp_servers.sub_company_id
    )
);

CREATE POLICY "Users can delete mcp_servers of their sub_company"
ON public.mcp_servers
FOR DELETE
USING (
    (sub_company_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND sub_company_id IS NULL)) OR
    EXISTS (
        SELECT 1 FROM public.user_account_access uaa 
        WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id = mcp_servers.sub_company_id
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_mcp_servers_updated_at
BEFORE UPDATE ON public.mcp_servers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
