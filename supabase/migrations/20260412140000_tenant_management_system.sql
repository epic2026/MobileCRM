-- Create enum for tenant roles
CREATE TYPE public.tenant_role AS ENUM ('owner', 'admin', 'manager', 'member');

-- Create enum for subscription plans
CREATE TYPE public.subscription_plan AS ENUM ('free', 'pro', 'enterprise');

-- Create tenants table
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  subscription_plan subscription_plan NOT NULL DEFAULT 'free',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tenant_members table (team members with roles)
CREATE TABLE public.tenant_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role tenant_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Create tenant_invites table
CREATE TABLE public.tenant_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role tenant_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, email)
);

-- Add tenant_id column to existing tables
ALTER TABLE public.leads ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.call_logs ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.lead_tasks ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.lead_activities ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.call_recordings ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Create indexes for tenant_id to improve query performance
CREATE INDEX idx_leads_tenant_id ON public.leads(tenant_id);
CREATE INDEX idx_call_logs_tenant_id ON public.call_logs(tenant_id);
CREATE INDEX idx_lead_tasks_tenant_id ON public.lead_tasks(tenant_id);
CREATE INDEX idx_lead_activities_tenant_id ON public.lead_activities(tenant_id);
CREATE INDEX idx_call_recordings_tenant_id ON public.call_recordings(tenant_id);
CREATE INDEX idx_tenant_members_user_id ON public.tenant_members(user_id);
CREATE INDEX idx_tenant_invites_token ON public.tenant_invites(token);

-- Enable RLS on new tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

-- Enable RLS on existing tables (if not already enabled)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants table
-- Users can view tenants they own or are members of
CREATE POLICY "Users can view their own tenants"
ON public.tenants
FOR SELECT
USING (
  auth.uid() = owner_id 
  OR auth.uid() IN (
    SELECT user_id FROM public.tenant_members WHERE tenant_id = tenants.id
  )
);

-- Only owners can update their tenants
CREATE POLICY "Only owners can update tenants"
ON public.tenants
FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Only owners can delete their tenants
CREATE POLICY "Only owners can delete tenants"
ON public.tenants
FOR DELETE
USING (auth.uid() = owner_id);

-- Anyone can insert a new tenant (creates new)
CREATE POLICY "Users can create new tenants"
ON public.tenants
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- RLS Policies for tenant_members table
-- Users can see members of their own tenants
CREATE POLICY "Users can view members of their tenants"
ON public.tenant_members
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.tenant_members tm WHERE tm.tenant_id = tenant_members.tenant_id
  )
  OR auth.uid() IN (SELECT owner_id FROM public.tenants WHERE id = tenant_members.tenant_id)
);

-- Admins and owners can manage members
CREATE POLICY "Admins and owners can manage members"
ON public.tenant_members
FOR ALL
USING (
  auth.uid() IN (
    SELECT tm.user_id FROM public.tenant_members tm 
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.role IN ('owner', 'admin')
  )
  OR auth.uid() IN (SELECT owner_id FROM public.tenants WHERE id = tenant_members.tenant_id)
)
WITH CHECK (
  auth.uid() IN (
    SELECT tm.user_id FROM public.tenant_members tm 
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.role IN ('owner', 'admin')
  )
  OR auth.uid() IN (SELECT owner_id FROM public.tenants WHERE id = tenant_members.tenant_id)
);

-- RLS Policies for tenant_invites table
-- Users can view invites for their tenants
CREATE POLICY "Users can view invites for their tenants"
ON public.tenant_invites
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.tenant_members WHERE tenant_id = tenant_invites.tenant_id
  )
  OR auth.uid() IN (SELECT owner_id FROM public.tenants WHERE id = tenant_invites.tenant_id)
  OR auth.jwt() ->> 'email' = email
);

-- Admins and owners can manage invites
CREATE POLICY "Admins and owners can manage invites"
ON public.tenant_invites
FOR ALL
USING (
  auth.uid() IN (
    SELECT tm.user_id FROM public.tenant_members tm 
    WHERE tm.tenant_id = tenant_invites.tenant_id AND tm.role IN ('owner', 'admin')
  )
  OR auth.uid() IN (SELECT owner_id FROM public.tenants WHERE id = tenant_invites.tenant_id)
)
WITH CHECK (
  auth.uid() IN (
    SELECT tm.user_id FROM public.tenant_members tm 
    WHERE tm.tenant_id = tenant_invites.tenant_id AND tm.role IN ('owner', 'admin')
  )
  OR auth.uid() IN (SELECT owner_id FROM public.tenants WHERE id = tenant_invites.tenant_id)
);

-- RLS Policies for existing tables (now with tenant isolation)
-- Drop old open policies and replace with tenant-based ones
DROP POLICY IF EXISTS "Allow all operations on leads" ON public.leads;
DROP POLICY IF EXISTS "Allow all operations on call_logs" ON public.call_logs;

-- New tenant-based policies for leads
CREATE POLICY "Users can view leads in their tenant"
ON public.leads
FOR SELECT
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert leads in their tenant"
ON public.leads
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update leads in their tenant"
ON public.leads
FOR UPDATE
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete leads in their tenant"
ON public.leads
FOR DELETE
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

-- New tenant-based policies for call_logs
CREATE POLICY "Users can view call logs in their tenant"
ON public.call_logs
FOR SELECT
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert call logs in their tenant"
ON public.call_logs
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update call logs in their tenant"
ON public.call_logs
FOR UPDATE
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete call logs in their tenant"
ON public.call_logs
FOR DELETE
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

-- Similar policies for lead_tasks, lead_activities, and call_recordings
CREATE POLICY "Users can view tasks in their tenant"
ON public.lead_tasks
FOR SELECT
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert tasks in their tenant"
ON public.lead_tasks
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update tasks in their tenant"
ON public.lead_tasks
FOR UPDATE
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view activities in their tenant"
ON public.lead_activities
FOR SELECT
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view recordings in their tenant"
ON public.call_recordings
FOR SELECT
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
);

-- Create trigger for updating tenants.updated_at
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_invites;

-- Helper function to accept tenant invite
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(invite_token TEXT)
RETURNS uuid AS $$
DECLARE
  v_invite_id uuid;
  v_tenant_id uuid;
  v_email text;
  v_role tenant_role;
BEGIN
  -- Get invite details
  SELECT id, tenant_id, email, role INTO v_invite_id, v_tenant_id, v_email, v_role
  FROM public.tenant_invites
  WHERE token = invite_token
  AND expires_at > now()
  AND accepted = false;

  IF v_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  -- Check if user email matches (or create account association)
  IF auth.jwt() ->> 'email' != v_email THEN
    RAISE EXCEPTION 'Email mismatch. Please sign in with the invited email address.';
  END IF;

  -- Add user to tenant
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, auth.uid(), v_role)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- Mark invite as accepted
  UPDATE public.tenant_invites
  SET accepted = true
  WHERE id = v_invite_id;

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant invoke on function
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite TO authenticated;
