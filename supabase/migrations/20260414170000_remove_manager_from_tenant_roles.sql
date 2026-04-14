-- Simplify tenant roles to owner/admin/member by removing manager from active usage.

-- Normalize existing data
UPDATE public.tenant_members
SET role = 'admin'
WHERE role::text = 'manager';

UPDATE public.tenant_invites
SET role = 'admin'
WHERE role::text = 'manager';

-- Rework admin-limit guard to only consider admin role.
CREATE OR REPLACE FUNCTION public.enforce_single_tenant_manager_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NEW.role::text = 'admin' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.role::text = 'admin'
        AND tm.id <> NEW.id
    )
    INTO v_exists;

    IF v_exists THEN
      RAISE EXCEPTION 'Only one tenant admin is allowed per tenant';
    END IF;
  END IF;

  IF NEW.role::text = 'manager' THEN
    RAISE EXCEPTION 'Manager role is no longer supported. Use admin or member.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_tenant_manager_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_exists BOOLEAN;
  v_invite_exists BOOLEAN;
BEGIN
  IF NEW.role::text = 'manager' THEN
    RAISE EXCEPTION 'Manager role is no longer supported. Use admin or member.';
  END IF;

  IF NEW.role::text = 'admin' AND COALESCE(NEW.accepted, false) = false THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.role::text = 'admin'
    )
    INTO v_member_exists;

    IF v_member_exists THEN
      RAISE EXCEPTION 'This tenant already has an admin member';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_invites ti
      WHERE ti.tenant_id = NEW.tenant_id
        AND ti.role::text = 'admin'
        AND ti.accepted = false
        AND ti.id <> NEW.id
    )
    INTO v_invite_exists;

    IF v_invite_exists THEN
      RAISE EXCEPTION 'A pending admin invite already exists for this tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
