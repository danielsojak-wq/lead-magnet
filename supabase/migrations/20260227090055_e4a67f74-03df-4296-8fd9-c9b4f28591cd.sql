UPDATE public.client_data_sources 
SET config = '{"web_filter": "OBB"}'::jsonb 
WHERE source_type = 'marketing_costs' 
AND client_id = (SELECT id FROM public.clients WHERE slug = '543465');