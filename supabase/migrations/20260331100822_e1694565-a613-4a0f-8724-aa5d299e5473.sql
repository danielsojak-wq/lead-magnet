
-- ============================================================
-- SECURITY HARDENING: Lock down password-containing tables
-- ============================================================

-- 1. ADMINS: Enable RLS and deny all public access
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies first (safe if none exist)
DROP POLICY IF EXISTS "Deny all access to admins" ON public.admins;

CREATE POLICY "Deny all access to admins"
  ON public.admins FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- 2. MARKETING_USERS: Enable RLS and deny all public access
ALTER TABLE public.marketing_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access to marketing_users" ON public.marketing_users;

CREATE POLICY "Deny all access to marketing_users"
  ON public.marketing_users FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- 3. CLIENTS: Enable RLS and deny all public access
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access to clients" ON public.clients;

CREATE POLICY "Deny all access to clients"
  ON public.clients FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- 4. Create clients_public view (without password_hash)
CREATE OR REPLACE VIEW public.clients_public
WITH (security_invoker = on) AS
  SELECT id, slug, name, display_name, created_at
  FROM public.clients;

-- 5. ACCOUNT_MANAGERS: Restrict direct SELECT (password_hash exposed!)
-- Drop existing permissive SELECT policy
DROP POLICY IF EXISTS "Allow select on account_managers" ON public.account_managers;

-- Add restrictive policy denying all public access
CREATE POLICY "Deny all access to account_managers"
  ON public.account_managers FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- 6. CLIENT_DATA_SOURCES: Enable RLS and deny public access (contains sheet URLs)
ALTER TABLE public.client_data_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access to client_data_sources" ON public.client_data_sources;

CREATE POLICY "Deny all access to client_data_sources"
  ON public.client_data_sources FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- TIGHTEN DATA TABLES: Replace "allow all" with service_role only
-- Keep anon INSERT for activity_log (frontend needs it)
-- ============================================================

-- 7. LEAD_REVIEWS: service_role only (accessed via edge functions)
DROP POLICY IF EXISTS "Allow all access to lead_reviews" ON public.lead_reviews;

CREATE POLICY "Service role full access to lead_reviews"
  ON public.lead_reviews FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also allow anon for frontend CRM board operations
CREATE POLICY "Allow anon access to lead_reviews"
  ON public.lead_reviews FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- 8. LEAD_TIMELINE: allow anon (frontend reads/writes timeline)
DROP POLICY IF EXISTS "Allow all access to lead_timeline" ON public.lead_timeline;

CREATE POLICY "Allow anon access to lead_timeline"
  ON public.lead_timeline FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to lead_timeline"
  ON public.lead_timeline FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9. CLIENT_ACTIVITY_LOG: allow anon (frontend inserts/reads)
DROP POLICY IF EXISTS "Allow all access to client_activity_log" ON public.client_activity_log;

CREATE POLICY "Allow anon access to client_activity_log"
  ON public.client_activity_log FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to client_activity_log"
  ON public.client_activity_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 10. NOTIFICATION_RULES: allow anon (frontend CRUD)
DROP POLICY IF EXISTS "Allow all access to notification_rules" ON public.notification_rules;

CREATE POLICY "Allow anon access to notification_rules"
  ON public.notification_rules FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to notification_rules"
  ON public.notification_rules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 11. ECOMMERCE_DIGEST_SCHEDULES: allow anon (frontend CRUD)
DROP POLICY IF EXISTS "Allow all access to ecommerce_digest_schedules" ON public.ecommerce_digest_schedules;

CREATE POLICY "Allow anon access to ecommerce_digest_schedules"
  ON public.ecommerce_digest_schedules FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to ecommerce_digest_schedules"
  ON public.ecommerce_digest_schedules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 12. CLIENT_LEAD_CAMPAIGNS: allow anon
DROP POLICY IF EXISTS "Allow all access to client_lead_campaigns" ON public.client_lead_campaigns;

CREATE POLICY "Allow anon access to client_lead_campaigns"
  ON public.client_lead_campaigns FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to client_lead_campaigns"
  ON public.client_lead_campaigns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 13. SOURCE_CAMPAIGN_MAPPINGS: allow anon
DROP POLICY IF EXISTS "Allow all access to source_campaign_mappings" ON public.source_campaign_mappings;

CREATE POLICY "Allow anon access to source_campaign_mappings"
  ON public.source_campaign_mappings FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to source_campaign_mappings"
  ON public.source_campaign_mappings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 14. ESHOP_BUDGET_TARGETS: allow anon
DROP POLICY IF EXISTS "Allow all access to eshop_budget_targets" ON public.eshop_budget_targets;

CREATE POLICY "Allow anon access to eshop_budget_targets"
  ON public.eshop_budget_targets FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to eshop_budget_targets"
  ON public.eshop_budget_targets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 15. ACCOUNT_MANAGER_CLIENTS: Keep read for anon, add service_role full
DROP POLICY IF EXISTS "Allow public read access to account_manager_clients" ON public.account_manager_clients;

CREATE POLICY "Allow anon read access to account_manager_clients"
  ON public.account_manager_clients FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role full access to account_manager_clients"
  ON public.account_manager_clients FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
