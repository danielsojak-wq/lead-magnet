-- Veřejný bucket pro trvalé náhledy reklam z lead-magnetu.
-- Meta fbcdn URL expirují (~dny), proto postery ukládáme k sobě a servírujeme
-- přes getPublicUrl. Kreativy jsou veřejné Meta reklamy → public bucket je OK.
-- (Vzor: bucket client-logos. Privátní creative-assets je pro Studio, sem se nehodí.)

INSERT INTO storage.buckets (id, name, public)
VALUES ('lm-ad-media', 'lm-ad-media', true)
ON CONFLICT (id) DO NOTHING;

-- Idempotentní policy (drop+create), ať jde migrace aplikovat opakovaně.
DROP POLICY IF EXISTS "Public read lm-ad-media" ON storage.objects;
CREATE POLICY "Public read lm-ad-media" ON storage.objects
  FOR SELECT USING (bucket_id = 'lm-ad-media');

DROP POLICY IF EXISTS "Service role lm-ad-media" ON storage.objects;
CREATE POLICY "Service role lm-ad-media" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'lm-ad-media')
  WITH CHECK (bucket_id = 'lm-ad-media');
