# CLAUDE.md — Performind Lead Magnet

> Tento soubor čte Claude Code při každém spuštění. Drž ho aktuální. Když AI dělá chybu opakovaně, přidej pravidlo sem.

## Project context

Performind Lead Magnet je nástroj pro získávání leadů marketingové agentury Performind (analyza.performind.cz). User zadá svůj e-shop + 2 konkurenty → systém nascrapuje Meta reklamy přes Apify → Gemini AI vygeneruje konkurenční analýzu → user vidí dashboard. Cíl produktu **není** poskytnout analýzu, ale získat verified email do Ecomail nurturing flow vedoucí k booking call.

Target audience: čeští e-commerce founders a firmy s ročním obratem 10-50M Kč (premium segment, ne mass-market e-shopy).

## Tech stack

- **Frontend**: React + TypeScript + Vite, deployed přes Lovable (vizuální úpravy dělá Daniel přes Lovable Visual edits, logiku Claude Code lokálně)
- **Backend**: Supabase Edge Functions (Deno runtime), projekt `pxhpmgzeduqazgfzllyo`, Pro plán (no-pause kvůli background tasks)
- **DB**: Supabase Postgres, hlavní tabulky: `lm_sessions`, `lm_session_competitors`, `ads`
- **Scraping**: Apify, actor `curious_coder/facebook-ads-library-scraper`
- **AI**: Gemini přes Lovable API (dvojvrstvá: L1 paralelně pro 3 hráče, L2 syntéza)
- **Email**: Resend (transactional verification), Ecomail (nurturing sekvence)

## Architektura pipeline

User flow: form → email verification → spustí pipeline → loading screen → dashboard

Pipeline order (edge functions):
1. `verify-email` → potvrdí email a inicializuje session
2. `analyze-lm-session` → spustí scraping přes Apify (background task, < 150s limit)
3. L1 analýza paralelně pro 3 hráče (Promise.all)
4. L2 syntéza výsledků
5. `ecomail-sync` → push do Ecomail nurturing

**Critical timing constraint**: Supabase background task limit je 150 sekund. Současný runtime je ~90s. Nikdy nepřidávej sériové AI calls do pipeline.

## Konvence kódu

- TypeScript strict mode, žádné `any`. Když potřebuješ unknown shape, použij `unknown` + type guard.
- Session IDs jsou UUID v4. Vždy nazvi proměnnou `sessionId`, ne `id` nebo `session_id` (v TS — v DB je `session_id` snake_case OK).
- Edge function naming: kebab-case, sloveso-objekt (`verify-email`, `analyze-lm-session`, `ecomail-sync`).
- Secrets přes `Deno.env.get('NAME')`, nikdy hardcoded. Pokud chybí required secret → fail loudly při startu funkce, ne až za runtime.
- Logy structured: `{ level, message, session_id, error? }`. JSON, ne plain text — usnadňuje Supabase log filtry.
- Error handling: external API failures (Apify, Gemini, Ecomail) jsou **non-blocking pro user flow**. Loguj error, ale neukončuj session pokud lze pokračovat.

## AI prompt pravidla (NEVER violate)

Tyto 4 pravidla platí pro každý prompt v `analyze-lm-session` a souvisejících funkcích. Porušení = bug, ne stylistic choice.

1. **Nikdy nezmiňuj % rozpočtu nebo absolute spend.** Tahle data nemáme, scrapeme jen počty a typy reklam. Pokud AI usuzuje "asi 40 % budgetu jde do videí", je to halucinace.
2. **Nikdy nezmiňuj Google Ads data.** Neanalyzujeme. Pokud AI zmíní "podle Google Ads", je to halucinace.
3. **Nikdy nepoužívej slovo "zadavatel" ani "Konkurent A/B"** ve výstupu zobrazeném uživateli. Vždy reálné názvy domén (`vaskyboots.cz`, ne "zadavatel").
4. **Reálné názvy domén z `lm_session_competitors`** musí být v promptu i ve výstupu konzistentně. Pokud doména v promptu chybí, AI si název vymyslí.

## Meta scraping — pravidla

**Meta scraping — pravidla:** Veškerý scraping Meta Ads Library jde VÝHRADNĚ přes
Apify actor. Nikdy neobcházej anti-bot/captcha ochrany Mety (headless browser přes
challenge apod.) — riziko penalizace IP/Business Manageru. Pokud je potřeba ručně
ověřit reklamu, vypiš ad_archive_id + deeplink a požádej Daniela o ruční kontrolu
v prohlížeči.

## Brand barvy hráčů (UI)

- Zadavatel: fialová `#6B46C1`
- Konkurent 1: modrá `#3B82F6`
- Konkurent 2: oranžová `#F97316`

Použij CSS variables (`--color-zadavatel`, `--color-k1`, `--color-k2`), ne hardcoded hex v komponentech.

## Database konvence

- Snake_case pro sloupce v Postgresu (`session_id`, `created_at`), camelCase v TS.
- Vždy ON CONFLICT pro upserty u externalních identifierů (email, IP).
- Nové sloupce přes migraci, ne přes `alter table` v console. Migrace v `supabase/migrations/`.
- `lm_sessions.status` enum: `pending | verified | scraping | analyzing | completed | failed`. Tyhle stavy se nikdy nepřejmenovávají bez migrace + frontend update.

## Workflow s Claude Code

- Daniel pracuje sériově — jeden task, dokončit, review, commit, další task. Nezačínej multiple parallel changes ve stejné funkci.
- Acceptance criteria v promptu jsou **závazné**. Pokud něco nelze splnit, stop a ptej se, neimprovizuj.
- Před každou edge function změnou: čti current verzi, neassumuj strukturu z paměti.
- Po dokončení dej **REPORT** v tomhle formátu:
  - Co bylo uděláno (1-3 věty)
  - Změněné soubory
  - Co je nutné udělat manuálně (env vars, DB migrace, externí UI nastavení)
  - Edge cases které jsi narazil
  - Co testovat
- Pokud změna může způsobit regresi v existující pipeline, **explicitně to zmín** v reportu.

## Testovací data

- Session ID s reálnými daty: `2ebd6f62` (nejoutdoor.cz + zajo.com + hudy.cz, 8+29+18 reklam)
- Dev preview: `/results/:sessionId`
- Dev sessions list: `/dev/sessions` (password gate, env var `PERFORMIND_DEV_PASSWORD`)

## Out of scope (NEDĚLEJ bez explicitního povolení)

- Google Ads scraping (post-launch consideration)
- LinkedIn / TikTok Ads (post-launch)
- Auth systém / user accounts (lead magnet je anonymní)
- Multi-tenancy nebo white-label (to je Performind Studio, jiný projekt)
- Změny v Lovable visual stylu (to dělá Daniel sám)

## discover-meta-url — aktivní flow
- Graph API (Step 2, resolveViaGraphApi): NEAKTIVNÍ — fbToken=null 
  bez FB_APP_ID/SECRET. Tichý skip, ne error.
- Reálný výsledek: Step 3 keyword search přes buildMetaUrl(searchQ, null).
- searchQ priorita: sameAsSlugs > otherSlugs > brandName > domain.
- Limitace: keyword search ≠ přesný lookup. Přesnost až s Graph API 
  page ID (view_all_page_id).

  ## discover-meta-url logika
- Graph API Step 2: KÓD EXISTUJE, ale NIKDY nesuspěje (#100, bez Meta review). Dormant, neopravovat.
- Reálná discovery: q=<og:site_name> → Apify scrape → pickDominantPage validace
  (vanity_exact > brand_exact > containment, >1 kandidát = fallback)
- page_id se čte z výsledků scrapu (snapshot.page_profile_uri), NE z Graph API