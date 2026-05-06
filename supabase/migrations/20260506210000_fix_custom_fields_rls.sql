-- Fix custom_field_definitions RLS policies so super_admin can bypass tenant_members check.
-- Super admins are global roles not necessarily present in tenant_members for every tenant.

DROP POLICY IF EXISTS "cfd_admins_insert" ON public.custom_field_definitions;
DROP POLICY IF EXISTS "cfd_admins_update" ON public.custom_field_definitions;
DROP POLICY IF EXISTS "cfd_admins_delete" ON public.custom_field_definitions;

CREATE POLICY "cfd_admins_insert"
  ON public.custom_field_definitions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.get_user_role(auth.uid()) = 'admin'
      AND tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "cfd_admins_update"
  ON public.custom_field_definitions FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.get_user_role(auth.uid()) = 'admin'
      AND tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.get_user_role(auth.uid()) = 'admin'
      AND tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "cfd_admins_delete"
  ON public.custom_field_definitions FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.get_user_role(auth.uid()) = 'admin'
      AND tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );
