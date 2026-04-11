-- crm_integrations and crm_oauth_states are managed exclusively by
-- edge functions using the service role key, which normally bypasses RLS.
-- Disabling RLS on these internal-only tables removes any accidental block
-- while keeping them inaccessible to anon/authenticated roles (no SELECT/INSERT
-- grants are issued to those roles).

ALTER TABLE public.crm_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oauth_states DISABLE ROW LEVEL SECURITY;

-- Explicitly revoke direct access from public so no client can reach these.
REVOKE ALL ON public.crm_integrations FROM anon, authenticated;
REVOKE ALL ON public.crm_oauth_states FROM anon, authenticated;
