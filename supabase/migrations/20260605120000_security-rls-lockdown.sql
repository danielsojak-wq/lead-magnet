BEGIN;

-- ============================================================
-- Pre-launch security lockdown (audit S-tier nálezy)
--
-- 🔴 KRITICKÉ — rate_limit_attempts
--    Tabulka měla RLS DISABLED a anon (+authenticated) plné granty
--    (SELECT/INSERT/UPDATE/DELETE/TRUNCATE). Důsledek: kdokoli s
--    veřejným anon klíčem mohl (a) číst hashe IP/emailů (PII), (b)
--    smazat/TRUNCATE počítadla → obejít rate limiting → vyžrat Apify
--    kredity. Čteno/zapisováno výhradně edge funkcemi (service_role).
--
-- 🟠 DŮLEŽITÉ — latentní mina na lm_session_competitors / lm_session_ads
--    RLS enabled, ale zůstala "Public select" policy s qual=true.
--    Table-granty pro anon/authenticated už byly revoknuté migrací
--    20260601130000, takže policy je dnes INERTNÍ — ale je to mina:
--    kdyby kdokoli přidal grant (Supabase UI / příští migrace), data
--    by okamžitě tekla. Dropujeme policy + defenzivní revoke.
--
-- POZNÁMKA — lm_sessions ZÁMĚRNĚ NEDOTČENO:
--    anon má jen COLUMN-level SELECT (id, status) — to potřebuje
--    CheckEmailPage poll a je to bezpečné (email/verification_token
--    NEčitelné, ověřeno). "Public select lm_sessions" policy (qual=true)
--    + column grant = anon vidí jen id+status. Drop policy / revoke by
--    funkční poll ROZBIL a leak emailu už je uzavřený column grantem.
--    Viz REPORT k tasku.
--
-- Vše additivní/bezpečné: jen RLS enable + revoke + drop policy.
-- service_role granty + policies nedotčeny (a service_role navíc
-- obchází RLS přes BYPASSRLS).
-- ============================================================

-- ── 🔴 rate_limit_attempts — uzamknout ───────────────────────────────
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_attempts FROM anon, authenticated;
-- Žádná anon/authenticated policy → plně odepřeno.
-- service_role (edge funkce) jede dál beze změny.

-- ── 🟠 lm_session_competitors / lm_session_ads — zavřít inertní minu ──
DROP POLICY IF EXISTS "Public select lm_session_competitors" ON public.lm_session_competitors;
DROP POLICY IF EXISTS "Public select lm_session_ads"         ON public.lm_session_ads;

-- Defenzivní revoke (granty už dnes nejsou; idempotentní no-op, ale
-- pojistka, kdyby je něco mezitím přidalo).
REVOKE SELECT ON public.lm_session_competitors FROM anon, authenticated;
REVOKE SELECT ON public.lm_session_ads         FROM anon, authenticated;

-- "Service role …" policies na obou tabulkách zůstávají beze změny.

COMMIT;
