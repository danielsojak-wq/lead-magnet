CREATE OR REPLACE FUNCTION public.get_distinct_eshop_channels(slug text)
RETURNS TABLE(channel text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c.channel
  FROM cached_eshop_costs c
  WHERE c.client_slug = slug
    AND c.channel IS NOT NULL
    AND c.channel != ''
  ORDER BY c.channel;
$$;