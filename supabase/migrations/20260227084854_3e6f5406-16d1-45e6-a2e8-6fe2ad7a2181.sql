
CREATE TABLE public.client_data_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_urls TEXT[] NOT NULL DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, source_type)
);

ALTER TABLE public.client_data_sources ENABLE ROW LEVEL SECURITY;

-- Seed OBB data sources
INSERT INTO public.client_data_sources (client_id, source_type, source_urls)
SELECT id, 'leads', ARRAY[
  'https://docs.google.com/spreadsheets/d/1WYGhylCVdO1oHoZcOSBhJQd-FUjKUkRmrNxbFBy4FVg/export?format=csv&gid=0',
  'https://docs.google.com/spreadsheets/d/1uzDOfuTNVY11rDGiuG774L445zARjOyChQQ5QeheRI4/export?format=csv&gid=0'
]
FROM public.clients WHERE slug = '543465';

INSERT INTO public.client_data_sources (client_id, source_type, source_urls)
SELECT id, 'marketing_costs', ARRAY[
  'https://docs.google.com/spreadsheets/d/14C6cvFqgHSQkvAOTYDxpj3ci5875h2aTLUZ9QNNfZcM/export?format=csv&gid=1284543701'
]
FROM public.clients WHERE slug = '543465';

INSERT INTO public.client_data_sources (client_id, source_type, source_urls)
SELECT id, 'ad_costs', ARRAY[
  'https://docs.google.com/spreadsheets/d/14f-XKe9RsJNGYiXql7siz0eTBL-EcPf3lOMpV7o3XJE/export?format=csv&gid=0'
]
FROM public.clients WHERE slug = '543465';

INSERT INTO public.client_data_sources (client_id, source_type, source_urls, config)
SELECT id, 'orders', ARRAY[
  'https://www.inteashop.cz/export/orders.csv?patternId=99&partnerId=3&hash=dae77d143f497188367f548eb45b1592e5a2c2a7947cf7b1cb00685eaf617efb'
], '{"csv_delimiter": ";"}'::jsonb
FROM public.clients WHERE slug = '543465';
