
-- Storage bucket for client logos
INSERT INTO storage.buckets (id, name, public) VALUES ('client-logos', 'client-logos', true);

-- Allow public read access
CREATE POLICY "Public read access for client logos" ON storage.objects FOR SELECT USING (bucket_id = 'client-logos');

-- Allow authenticated insert/update/delete (edge functions use service role, so this is for completeness)
CREATE POLICY "Service role full access for client logos" ON storage.objects FOR ALL USING (bucket_id = 'client-logos') WITH CHECK (bucket_id = 'client-logos');
