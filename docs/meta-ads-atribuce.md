# Meta Ads atribuce leadů — jak s tím pracovat

> Lead magnet (analyza.performind.cz) páruje každý lead na konkrétní Meta reklamu, ze které přišel. Tenhle dokument popisuje, jak atribuce funguje, jaká pravidla dodržovat při zakládání reklam a jak si vytáhnout čísla. Vznikl po incidentu z července 2026 (viz poslední kapitola), kdy 12 leadů leželo pod špatným názvem reklamy.

---

## Zlaté pravidlo: názvy lžou, ID ne

**Meta zamrazí name-based makra (`{{ad.name}}`, `{{adset.name}}`, `{{campaign.name}}`) při PRVNÍM zveřejnění reklamy.** Pozdější přejmenování hodnotu v URL nikdy nezmění — Meta to sama říká oranžovým warningem u parametru.

Důsledky:

- Workflow „duplikuj → publikuj → přejmenuj" vyrobí reklamu, která **navždy posílá starý název** (přesně tak vznikl červencový incident: reklama „1/7/2026 - banner 5 + ai variace" posílala `utm_term=1/7/2026 - banner 4`).
- `hsa_*` parametry (HubSpot auto-tracking) jsou **literály** — čísla natvrdo, která se duplikací zkopírují beze změny. `hsa_ad` proto NENÍ spolehlivé ID reklamy (ověřeno: banner 5 i banner 6 sdílely stejné `hsa_ad`).
- **Jediný spolehlivý klíč je `{{ad.id}}`** — makro se resolvuje pro každou reklamu zvlášť a ID se po zveřejnění už nikdy nemění. Zamrznutí u něj proto nevadí.

**Nikdy nepáruj leady na reklamy podle názvu (`utm_term`). Vždy podle ID (`meta_ad_id`).**

---

## Povinné URL parametry na každé reklamě

V Ads Manageru na úrovni reklamy → Sledování → Parametry URL:

| Parametr | Hodnota | K čemu |
|---|---|---|
| `utm_source` | `facebook` | standard |
| `utm_medium` | `cpc` | standard |
| `utm_campaign` | `{{campaign.name}}` | název kampaně (zamrzlý — datum založení, to je záměr) |
| `utm_content` | `{{adset.name}}` | název sady (zamrzlý — datum založení, to je záměr) |
| `utm_term` | `{{ad.name}}` | název reklamy — **jen informativní/čitelnost**, zamrzá |
| `utm_ad_id` | `{{ad.id}}` | **KLÍČOVÝ — immutable ID reklamy pro párování** |

⚠️ Název parametru musí být přesně `utm_ad_id` — ne `utm_id`! `utm_id` na starých reklamách obsahuje natvrdo ID kampaně (pozůstatek HubSpot šablony) a systém ho záměrně ignoruje, aby se ID kampaně nevydávalo za ID reklamy.

---

## Checklist při zakládání nové reklamy

1. Duplikuj reklamu (nebo vytvoř novou).
2. **Přejmenuj na finální název JEŠTĚ V DRAFTU** — před prvním kliknutím na Zveřejnit. Po zveřejnění už `utm_term` navždy ponese název z toho okamžiku.
3. Zkontroluj URL parametry dle tabulky výše — hlavně že tam je `utm_ad_id={{ad.id}}`. Při duplikaci se parametry kopírují (makra se resolvnou znovu pro nové ID, takže duplikace je bezpečná).
4. Zveřejni.

**U běžící reklamy URL parametry NEEDITUJ** — každá změna URL znamená nové schválení reklamy a možný reset learning fáze. Parametr `utm_ad_id` přidávej jen do nových reklam / draftů.

---

## Jak data tečou (technický přehled)

```
Meta reklama (URL parametry)
  → klik → landing page → captureUtm() uloží UTM do sessionStorage
                          + celou landing URL (first-touch, surová pravda)
  → odeslání formuláře → edge funkce send-verification-email
  → tabulka lm_sessions: utm_source/medium/campaign/content/term,
                         meta_ad_id (z utm_ad_id, fallback z landing_url),
                         landing_url, fbp/fbc
  → po dokončené analýze → syncToEcomail → custom fields kontaktu v Ecomailu
```

Mapování do Ecomailu (list „Performind kontakty"):

| Ecomail pole | Zdroj |
|---|---|
| Lead Magnet - analýza \| Zdrojová kampaň | `lm_sessions.utm_campaign` |
| Lead Magnet - analýza \| Zdrojový adset | `lm_sessions.utm_content` |
| Lead Magnet - analýza \| Zdrojová reklama | `lm_sessions.utm_term` |

Ecomail pole jsou name-based (čitelnost pro obchod) — pro analytiku vždy DB a `meta_ad_id`.

---

## Jak si vytáhnout čísla

ID reklamy zjistíš v Ads Manageru (sloupec „ID reklamy", nebo v URL při rozkliknuté reklamě).

**Leady z konkrétní reklamy (podle ID — preferovaný způsob):**

```sql
select to_char(created_at, 'DD.MM. HH24:MI') as prisel,
       email, eshop_url, status,
       email_verified_at is not null as overen,
       viewed_count,                         -- kolikrát otevřel výsledky
       booking_cta_clicked_at is not null as cta_klik
from lm_sessions
where meta_ad_id = 'ID_REKLAMY'
order by created_at;
```

**Funnel po reklamách za období:**

```sql
select coalesce(meta_ad_id, utm_term, '(bez atribuce)') as reklama,
       count(*) as vstoupilo,
       count(*) filter (where email_verified_at is not null) as overeno,
       count(*) filter (where status = 'ready') as analyza_ok,
       count(*) filter (where status = 'failed') as zahozeno_technicky
from lm_sessions
where created_at >= 'YYYY-MM-01' and created_at < 'YYYY-MM-31'
group by 1 order by vstoupilo desc;
```

**Prodejní signály (koho oslovit):** vysoký `viewed_count` a `booking_cta_clicked_at` = horký lead.

Kdo nemá přístup k SQL: požádej Claude Code v repu lead-magnet — umí se dotázat přímo.

---

## Známé limity (počítej s nimi)

1. **In-app browsery (Instagram/FB) občas zahodí celý query string.** Lead pak má `utm_* = NULL` i `landing_url = NULL` — atribuce neexistuje a nejde dopočítat (fbclid na reklamu veřejně přeložit nelze). Není to bug. Typicky ~čtvrtina leadů.
2. **Počty v Meta ≠ počty v DB.** Meta počítá konverze v 7denním atribučním okně, cross-device a včetně lidí, kteří nedokončili ověření e-mailu. Meta reporting = zdroj pravdy o výkonu reklamy; DB = zdroj pravdy o kvalitě a obsahu leadů.
3. **Atribuce existuje od 2. 7. 2026.** Starší leady (sloupce vznikly migrací 2. 7.) nemají žádné UTM — prázdno u nich neznamená chybu.
4. **Historická data před 15. 7. 2026 párovaná názvem mohou lhát** (zamrzlé názvy) — kohorta z incidentu byla opravena, ale u jiných starých reklam spoléhej na `landing_url` jako surovou pravdu.

---

## Incident 7/2026 — proč tohle všechno existuje

- Reklama „1/7/2026 - banner 5 + ai variace" vznikla duplikací a přejmenováním **po** prvním zveřejnění → posílala zamrzlé `utm_term=1/7/2026 - banner 4`. 12 leadů (2.–14. 7.) tak v DB i Ecomailu leželo pod názvem reklamy, která neexistovala.
- Při vyšetřování se ukázalo, že ani `hsa_ad` není spolehlivé (literály kopírované duplikací — banner 5 i 6 měly stejné).
- **Oprava 15. 7. 2026:** zaveden sloupec `lm_sessions.meta_ad_id` + capture `utm_ad_id={{ad.id}}`; u 12 postižených sessions přepsán `utm_term` na skutečný název (surová hodnota z kliku zůstává v `landing_url`); 9 existujících kontaktů v Ecomailu opraveno (2 v Ecomailu nebyly — failed leady z doby, kdy se failed do Ecomailu nesynchronizovaly).
- Poučení zakotveno v CLAUDE.md (sekce „Meta ad atribuce (UTM) — pravidla") a v tomto dokumentu.

---

## Kde co je v kódu (pro vývoj)

| Co | Kde |
|---|---|
| Zachytávání UTM + landing_url na frontendu | `src/lib/analytics.ts` → `captureUtm()` |
| Zápis atribuce do DB (vč. `meta_ad_id` + fallback z landing_url) | `supabase/functions/send-verification-email` |
| Push do Ecomail custom fields | `syncToEcomail` uvnitř `supabase/functions/analyze-lm-session` |
| Migrace sloupce | `supabase/migrations/20260715120000_lm-sessions-meta-ad-id.sql` |
| Pravidla pro AI asistenty | `CLAUDE.md` → „Meta ad atribuce (UTM) — pravidla" |
