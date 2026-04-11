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

    if (callerRole !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId } = await req.json() as { userId: string };

    if (!userId || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId === callerUser.id) {
      return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { adminClient } = createClients(authHeader);

    // Remove role and profile rows first (auth delete cascades but be explicit)
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("profiles").delete().eq("id", userId);

    // Hard-delete from Supabase Auth
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      throw new Error(authDeleteError.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
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
