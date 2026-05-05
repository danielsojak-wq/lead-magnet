
ALTER TABLE public.account_manager_clients
ADD COLUMN section text NOT NULL DEFAULT 'leadgen';

-- Drop old unique constraint and create new one with section
ALTER TABLE public.account_manager_clients
DROP CONSTRAINT IF EXISTS account_manager_clients_account_manager_id_client_slug_key;

ALTER TABLE public.account_manager_clients
ADD CONSTRAINT account_manager_clients_am_slug_section_key
UNIQUE (account_manager_id, client_slug, section);
