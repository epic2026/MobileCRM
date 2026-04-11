import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createClients,
  getAuthedUser,
  getUserRole,
  assertTaskVisibility,
  parseBody,
  withCors,
} from "../_shared/task-module.ts";

interface MarkCompleteBody {
  task_id?: string;
  note?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const user = await getAuthedUser(authHeader);
    const userRole = await getUserRole(authHeader!, user.id);
    const payload = await parseBody<MarkCompleteBody>(req);

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

    const { data: updatedTask, error: updateError } = await adminClient
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
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
      _event_type: "completed",
      _metadata: {
        quick_action: "complete_and_add_note",
        has_note: Boolean(payload.note?.trim()),
      },
    });

    return withCors({ task: updatedTask });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return withCors({ error: message }, status);
  }
});
