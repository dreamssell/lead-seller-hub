ALTER TABLE public.sip_configurations
ADD COLUMN IF NOT EXISTS webrtc_username text,
ADD COLUMN IF NOT EXISTS webrtc_secret_ciphertext text,
ADD COLUMN IF NOT EXISTS webrtc_secret_iv text;

COMMENT ON COLUMN public.sip_configurations.webrtc_username IS 'Yeastar Linkus SDK username/email used to obtain WebRTC register info.';
COMMENT ON COLUMN public.sip_configurations.webrtc_secret_ciphertext IS 'Encrypted Yeastar Linkus SDK login signature/secret for WebRTC registration.';
COMMENT ON COLUMN public.sip_configurations.webrtc_secret_iv IS 'AES-GCM IV for encrypted Yeastar Linkus SDK login signature/secret.';