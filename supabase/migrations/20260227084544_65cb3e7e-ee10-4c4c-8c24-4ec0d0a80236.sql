
ALTER TABLE public.clients ADD COLUMN display_name TEXT;
UPDATE public.clients SET display_name = 'OBB Stavební materiály' WHERE slug = '543465';
