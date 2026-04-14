-- 20260414_add_tenant_id_profiles_user_roles.sql
-- Add tenant_id to profiles and user_roles, and backfill

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Backfill profiles.tenant_id using tenant_members (if user is a member, use their first tenant)
UPDATE public.profiles p
SET tenant_id = (
  SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = p.id LIMIT 1
)
WHERE tenant_id IS NULL;

-- Backfill user_roles.tenant_id using tenant_members (if user is a member, use their first tenant)
UPDATE public.user_roles ur
SET tenant_id = (
  SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = ur.user_id LIMIT 1
)
WHERE tenant_id IS NULL;

-- Optionally, set NOT NULL if all users are guaranteed to have a tenant
-- ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.user_roles ALTER COLUMN tenant_id SET NOT NULL;
