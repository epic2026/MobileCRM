-- Custom field definitions: admins define extra fields per tenant/entity type.
-- Values are stored as JSONB on the leads row (custom_fields column).

CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type  text        NOT NULL DEFAULT 'lead',
  field_key    text        NOT NULL,        -- snake_case JSON key stored in leads.custom_fields
  field_label  text        NOT NULL,        -- display name shown in the UI
  field_type   text        NOT NULL DEFAULT 'text',  -- text | textarea | number | date | select | checkbox
  options      jsonb       NOT NULL DEFAULT '[]',    -- string[] for select fields
  required     boolean     NOT NULL DEFAULT false,
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, field_key)
);

-- Extend leads with a JSONB bag for custom values
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}';

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

-- All tenant members (sales + admin) can read field definitions so the mobile
-- app can render the correct inputs on lead cards.
CREATE POLICY "cfd_members_select"
  ON public.custom_field_definitions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- Only admin / super_admin can create, update or delete field definitions.
CREATE POLICY "cfd_admins_insert"
  ON public.custom_field_definitions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'super_admin')
    AND tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cfd_admins_update"
  ON public.custom_field_definitions FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'super_admin')
    AND tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'super_admin')
    AND tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cfd_admins_delete"
  ON public.custom_field_definitions FOR DELETE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'super_admin')
    AND tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );
