
UPDATE public.clients
SET name = 'obb',
    password_hash = extensions.crypt('j0Vh74zJ3Lxm', extensions.gen_salt('bf'))
WHERE slug = '543465';
