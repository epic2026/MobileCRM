import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createClients,
  getAuthedUser,
  getUserRole,
  assertTaskVisibility,
  parseBody,
  withCors,
  isPastDate,
} from "../_shared/task-module.ts";

interface UpdateTaskBody {
  task_id?: string;
  title?: string;
  description?: string | null;
  lead_id?: string | null;
  assigned_to?: string;
  due_at?: string;
  priority?: "low" | "medium" | "high";
  reminder_at?: string | null;
  status?: "pending" | "completed";
  note?: string;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const user = await getAuthedUser(authHeader);
    const userRole = await getUserRole(authHeader!, user.id);
    const payload = await parseBody<UpdateTaskBody>(req);

    if (!payload.task_id) {
      return withCors({ error: "task_id is required" }, 400);
    }

    const { adminClient } = createClients(authHeader);
    const { data: existing, error: existingErr } = await adminClient
      .from("tasks")
      .select("id, assigned_to")
      .eq("id", payload.task_id)
      .single();

    if (existingErr || !existing) {
      return withCors({ error: "Task not found" }, 404);
    }

    await assertTaskVisibility(authHeader!, user.id, userRole, existing.assigned_to);

    if (payload.due_at && isPastDate(payload.due_at)) {
      return withCors({ error: "Due date/time cannot be in the past" }, 400);
    }

    if (payload.assigned_to) {
      await assertTaskVisibility(authHeader!, user.id, userRole, payload.assigned_to);
    }

    const updates: Record<string, unknown> = {};
    if (typeof payload.title === "string") updates.title = payload.title.trim();
    if ("description" in payload) updates.description = payload.description?.trim() || null;
    if ("lead_id" in payload) updates.lead_id = payload.lead_id ?? null;
    if (payload.assigned_to) updates.assigned_to = payload.assigned_to;
    if (payload.due_at) updates.due_at = payload.due_at;
    if (payload.priority) updates.priority = payload.priority;
    if ("reminder_at" in payload) updates.reminder_at = payload.reminder_at ?? null;
    if (payload.status) updates.status = payload.status;
    if ("is_recurring" in payload) updates.is_recurring = Boolean(payload.is_recurring);
    if ("recurrence_rule" in payload) updates.recurrence_rule = payload.recurrence_rule ?? null;

    const { data: updatedTask, error: updateError } = await adminClient
      .from("tasks")
      .update(updates)
      .eq("id", payload.task_id)
      .select("*, lead:leads(id, name, phone, company, status)")
      .single();

    if (updateError) {
      return withCors({ error: updateError.message }, 400);
    }

    if (payload.note?.trim()) {
      await adminClient.from("task_comments").insert({
        task_id: payload.task_id,
        user_id: user.id,
        body: payload.note.trim(),
      });
    }

    await adminClient.rpc("task_log_event", {
      _task_id: payload.task_id,
      _event_type: "updated",
      _metadata: {
        fields: Object.keys(updates),
      },
    });

    return withCors({ task: updatedTask });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return withCors({ error: message }, status);
  }
});
