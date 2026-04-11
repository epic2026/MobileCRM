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

interface SnoozeBody {
  task_id?: string;
  option?: "10m" | "1h" | "tomorrow" | "custom";
  custom_until?: string;
}

const resolveSnoozeDate = (option: SnoozeBody["option"], customUntil?: string) => {
  const now = new Date();
  if (option === "10m") return new Date(now.getTime() + 10 * 60 * 1000);
  if (option === "1h") return new Date(now.getTime() + 60 * 60 * 1000);
  if (option === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (option === "custom" && customUntil) {
    const parsed = new Date(customUntil);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid custom_until");
    }
    return parsed;
  }
  throw new Error("Invalid snooze option");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const user = await getAuthedUser(authHeader);
    const userRole = await getUserRole(authHeader!, user.id);
    const payload = await parseBody<SnoozeBody>(req);

    if (!payload.task_id || !payload.option) {
      return withCors({ error: "task_id and option are required" }, 400);
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

    const snoozedUntil = resolveSnoozeDate(payload.option, payload.custom_until);
    const reminderAt = new Date(snoozedUntil.getTime() - 10 * 60 * 1000);

    const { data: updatedTask, error: updateError } = await adminClient
      .from("tasks")
      .update({
        due_at: snoozedUntil.toISOString(),
        snoozed_until: snoozedUntil.toISOString(),
        reminder_at: reminderAt.toISOString(),
        status: "pending",
      })
      .eq("id", payload.task_id)
      .select("*, lead:leads(id, name, phone, company, status)")
      .single();

    if (updateError) {
      return withCors({ error: updateError.message }, 400);
    }

    await adminClient
      .from("task_reminders")
      .update({ status: "cancelled" })
      .eq("task_id", payload.task_id)
      .eq("status", "pending");

    await adminClient.from("task_reminders").insert({
      task_id: payload.task_id,
      remind_at: reminderAt.toISOString(),
      channel: "push",
      status: "pending",
      payload: { snoozed: true },
    });

    await adminClient.rpc("task_log_event", {
      _task_id: payload.task_id,
      _event_type: "snoozed",
      _metadata: {
        option: payload.option,
        until: snoozedUntil.toISOString(),
      },
    });

    return withCors({ task: updatedTask });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return withCors({ error: message }, status);
  }
});
