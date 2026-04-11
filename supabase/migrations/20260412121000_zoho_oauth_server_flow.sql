-- Server-managed Zoho OAuth storage for admin CRM integration.

CREATE TABLE IF NOT EXISTS public.crm_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  api_domain text NOT NULL DEFAULT 'https://www.zohoapis.com',
  accounts_server text NOT NULL DEFAULT 'https://accounts.zoho.com',
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'Bearer',
  scope text,
  expires_at timestamptz,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_oauth_states (
  state text PRIMARY KEY,
  provider text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_domain text NOT NULL DEFAULT 'https://www.zohoapis.com',
  accounts_server text NOT NULL DEFAULT 'https://accounts.zoho.com',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS crm_oauth_states_expires_idx
  ON public.crm_oauth_states (expires_at);

ALTER TABLE public.crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oauth_states ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.crm_integrations IS 'Server-side OAuth credentials for CRM providers. Managed only by edge functions.';
COMMENT ON TABLE public.crm_oauth_states IS 'Short-lived OAuth states for secure callback validation.';
