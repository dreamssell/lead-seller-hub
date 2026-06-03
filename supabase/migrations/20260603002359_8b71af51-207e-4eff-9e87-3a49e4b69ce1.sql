-- Create chat messages table
CREATE TABLE public.chat_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'agent', 'bot')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view messages for their customers"
ON public.chat_messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.customers c 
        WHERE c.id = customer_id 
        AND (c.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
);

CREATE POLICY "Users can insert messages for their customers"
ON public.chat_messages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.customers c 
        WHERE c.id = customer_id 
        AND (c.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
