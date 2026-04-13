-- Enforce one tenant manager/admin per tenant.
-- Owner role remains separate and is not counted in this limit.

CREATE OR REPLACE FUNCTION public.enforce_single_tenant_manager_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NEW.role IN ('admin', 'manager') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.role IN ('admin', 'manager')
        AND tm.id <> NEW.id
    )
    INTO v_exists;

    IF v_exists THEN
      RAISE EXCEPTION 'Only one tenant manager/admin is allowed per tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_tenant_manager_member_trigger ON public.tenant_members;
CREATE TRIGGER enforce_single_tenant_manager_member_trigger
BEFORE INSERT OR UPDATE OF role, tenant_id
ON public.tenant_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_tenant_manager_member();

CREATE OR REPLACE FUNCTION public.enforce_single_tenant_manager_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_exists BOOLEAN;
  v_invite_exists BOOLEAN;
BEGIN
  IF NEW.role IN ('admin', 'manager') AND COALESCE(NEW.accepted, false) = false THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.role IN ('admin', 'manager')
    )
    INTO v_member_exists;

    IF v_member_exists THEN
      RAISE EXCEPTION 'This tenant already has a manager/admin member';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_invites ti
      WHERE ti.tenant_id = NEW.tenant_id
        AND ti.role IN ('admin', 'manager')
        AND ti.accepted = false
        AND ti.id <> NEW.id
    )
    INTO v_invite_exists;

    IF v_invite_exists THEN
      RAISE EXCEPTION 'A pending manager/admin invite already exists for this tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_tenant_manager_invite_trigger ON public.tenant_invites;
CREATE TRIGGER enforce_single_tenant_manager_invite_trigger
BEFORE INSERT OR UPDATE OF role, tenant_id, accepted
ON public.tenant_invites
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_tenant_manager_invite();
