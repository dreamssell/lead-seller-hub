
ALTER TABLE public.support_tickets ADD COLUMN contact_phone TEXT;
COMMENT ON COLUMN public.support_tickets.contact_phone IS 'E.164 phone used to send WhatsApp updates to the ticket author';
