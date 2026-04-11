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

interface CreateTaskBody {
  title?: string;
  description?: string;
  lead_id?: string | null;
  assigned_to?: string;
  due_at?: string;
  priority?: "low" | "medium" | "high";
  reminder_at?: string | null;
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
    const payload = await parseBody<CreateTaskBody>(req);

    if (!payload.title?.trim()) {
      return withCors({ error: "Title is required" }, 400);
    }

    if (!payload.due_at) {
      return withCors({ error: "Due date/time is required" }, 400);
    }

    if (isPastDate(payload.due_at)) {
      return withCors({ error: "Due date/time cannot be in the past" }, 400);
    }

    const assignee = payload.assigned_to ?? user.id;
    await assertTaskVisibility(authHeader!, user.id, userRole, assignee);

    const { adminClient } = createClients(authHeader);

    const { data: createdTask, error: createError } = await adminClient
      .from("tasks")
      .insert({
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        lead_id: payload.lead_id ?? null,
        assigned_to: assignee,
        created_by: user.id,
        priority: payload.priority ?? "medium",
        due_at: payload.due_at,
        reminder_at: payload.reminder_at ?? null,
        is_recurring: Boolean(payload.is_recurring),
        recurrence_rule: payload.recurrence_rule ?? null,
      })
      .select("*")
      .single();

    if (createError) {
      return withCors({ error: createError.message }, 400);
    }

    if (payload.note?.trim()) {
      await adminClient.from("task_comments").insert({
        task_id: createdTask.id,
        user_id: user.id,
        body: payload.note.trim(),
      });
    }

    await adminClient.rpc("task_log_event", {
      _task_id: createdTask.id,
      _event_type: "created",
      _metadata: {
        source: "edge_function",
      },
    });

    const { data: hydratedTask } = await adminClient
      .from("tasks")
      .select("*, lead:leads(id, name, phone, company, status)")
      .eq("id", createdTask.id)
      .single();

    return withCors({ task: hydratedTask ?? createdTask });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return withCors({ error: message }, status);
  }
});
