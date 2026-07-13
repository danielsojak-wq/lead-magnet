-- Lead triage — detekce leadů, kterým email jako nurturing kanál nefunguje.

-- ── Ecomail email eventy ─────────────────────────────────────────────────────
-- Webhook URL je v Ecomailu GLOBÁLNÍ pro celý účet → chodí sem eventy ze VŠECH
-- kampaní/automatizací (client, lead_warm, subscriber…), ne jen z lead magnetu.
-- Ukládáme všechno, filtrujeme až při scanu → proto index na (email, event_type),
-- ať scan nezpomaluje, jak tabulka poroste.
create table if not exists public.lm_email_events (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  automation_email_id text,
  event_type          text not null,
  occurred_at         timestamptz,
  raw_payload         jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists lm_email_events_email_event_type_idx
  on public.lm_email_events (email, event_type);

-- ── Triage fronta ────────────────────────────────────────────────────────────
create table if not exists public.lm_lead_triage (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null unique,
  session_id            uuid references public.lm_sessions(id),
  domain                text,
  checkpoint_reached_at timestamptz,
  icp_fit               boolean default null,   -- null = neposouzeno (manuální checkbox)
  draft_message         text,
  status                text not null default 'needs_review'
                          check (status in ('needs_review','moved_to_manual','skipped')),
  moved_to_manual_at    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- seznam v dashboardu = status + řazení dle checkpointu
create index if not exists lm_lead_triage_status_checkpoint_idx
  on public.lm_lead_triage (status, checkpoint_reached_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Bez policy → anon/authenticated nemá přístup. Edge funkce jezdí přes service
-- role (bypassuje RLS) a jsou chráněné heslem (PERFORMIND_DEV_PASSWORD).
alter table public.lm_email_events enable row level security;
alter table public.lm_lead_triage  enable row level security;
