import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createClients,
  getAuthedUser,
  parseBody,
  withCors,
} from "../_shared/task-module.ts";

interface LeadEventBody {
  lead_id?: string;
  event_type?: "lead_created" | "status_changed";
  status?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const user = await getAuthedUser(authHeader);
    const payload = await parseBody<LeadEventBody>(req);

    if (!payload.lead_id || !payload.event_type) {
      return withCors({ error: "lead_id and event_type are required" }, 400);
    }

    const { adminClient } = createClients(authHeader);
    const { data: lead, error: leadErr } = await adminClient
      .from("leads")
      .select("id, name, user_id, status")
      .eq("id", payload.lead_id)
      .single();

    if (leadErr || !lead) {
      return withCors({ error: "Lead not found" }, 404);
    }

    if (lead.user_id !== user.id) {
      const { data: roleRow } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (roleRow?.role !== "admin") {
        return withCors({ error: "Forbidden" }, 403);
      }
    }

    const title = payload.event_type === "lead_created"
      ? `Welcome follow-up: ${lead.name}`
      : `Status follow-up (${payload.status ?? lead.status}): ${lead.name}`;

    const description = payload.event_type === "lead_created"
      ? "Auto-created follow-up task after lead creation."
      : "Auto-created follow-up task after lead status update.";

    const { data: task, error: taskErr } = await adminClient
      .from("tasks")
      .insert({
        title,
        description,
        lead_id: lead.id,
        assigned_to: lead.user_id,
        created_by: user.id,
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        priority: payload.event_type === "status_changed" ? "high" : "medium",
      })
      .select("*")
      .single();

    if (taskErr) {
      return withCors({ error: taskErr.message }, 400);
    }

    return withCors({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : 500;
    return withCors({ error: message }, status);
  }
});
