
-- Politicas de acesso ao bucket chat-media (mídia recebida/enviada no chat WAHA).
-- Autenticados podem ler e gravar; service_role tem acesso total.
CREATE POLICY "chat-media authenticated read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-media');

CREATE POLICY "chat-media authenticated write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "chat-media authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'chat-media')
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "chat-media service full"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'chat-media')
  WITH CHECK (bucket_id = 'chat-media');
