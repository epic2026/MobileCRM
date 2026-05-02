import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClients, corsHeaders, getAuthedUser, getUserRole } from "../_shared/task-module.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const callerUser = await getAuthedUser(authHeader);
    const callerRole = await getUserRole(authHeader!, callerUser.id);

    if (callerRole !== "admin" && callerRole !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin or super_admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, fullName, role, tenantId } = await req.json() as {
      email: string;
      fullName: string;
      role: "super_admin" | "admin" | "sales";
      tenantId?: string;
    };

    if (!email || !fullName || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Non-super-admins cannot create super_admin accounts
    if (callerRole !== "super_admin" && role === "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: cannot create super_admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { adminClient } = createClients(authHeader);

    const appUrl = Deno.env.get("APP_URL") ?? Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".vercel.app") ?? "";

    // Send invite email — user sets their own password via the link
    const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: fullName },
        redirectTo: `${appUrl}/invite`,
      },
    );

    if (createError || !newUser.user) {
      throw new Error(createError?.message ?? "Failed to create user");
    }

    const userId = newUser.user.id;

    // Assign role
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      role,
    });
    if (roleError) throw new Error(roleError.message);

    // Assign to tenant if provided and user is not super_admin
    if (tenantId && role !== "super_admin") {
      const { error: memberError } = await adminClient.from("tenant_members").insert({
        tenant_id: tenantId,
        user_id: userId,
        role: "member",
      });
      if (memberError) throw new Error(memberError.message);
    }

    return new Response(JSON.stringify({ ok: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
