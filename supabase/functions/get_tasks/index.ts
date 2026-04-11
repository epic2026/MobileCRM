import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createClients,
  getAuthedUser,
  getUserRole,
  parseBody,
  withCors,
} from "../_shared/task-module.ts";

interface GetTasksBody {
  search?: string;
  priority?: "low" | "medium" | "high" | "all";
  status?: "pending" | "completed" | "all";
  bucket?: "today" | "upcoming" | "overdue" | "completed" | "all";
  assigned_to?: string | "me" | "team" | "all";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const user = await getAuthedUser(authHeader);
    const role = await getUserRole(authHeader!, user.id);
    const payload = await parseBody<GetTasksBody>(req);
    const { adminClient } = createClients(authHeader);

    let visibleUserIds: string[] = [user.id];
    if (role === "admin") {
      if (payload.assigned_to && payload.assigned_to !== "all" && payload.assigned_to !== "team" && payload.assigned_to !== "me") {
        visibleUserIds = [payload.assigned_to];
      } else if (payload.assigned_to === "all") {
        visibleUserIds = [];
      }
    } else if (role === "manager") {
      const { data: members } = await adminClient
        .from("user_teams")
        .select("member_id")
        .eq("manager_id", user.id);
      visibleUserIds = [
        user.id,
        ...((members ?? []).map((m) => m.member_id)),
      ];

      if (payload.assigned_to && payload.assigned_to !== "all" && payload.assigned_to !== "team" && payload.assigned_to !== "me") {
        visibleUserIds = [payload.assigned_to];
      }
      if (payload.assigned_to === "me") {
        visibleUserIds = [user.id];
      }
    }

    let query = adminClient
      .from("tasks")
      .select("*, lead:leads(id, name, phone, company, status), assignee:profiles!tasks_assigned_to_fkey(id, full_name, email)")
      .order("due_at", { ascending: true });

    if (visibleUserIds.length > 0) {
      query = query.in("assigned_to", visibleUserIds);
    }

    if (payload.priority && payload.priority !== "all") {
      query = query.eq("priority", payload.priority);
    }

    if (payload.status && payload.status !== "all") {
      query = query.eq("status", payload.status);
    }

    if (payload.search?.trim()) {
      const q = payload.search.trim();
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data: tasks, error } = await query;
    if (error) {
      return withCors({ error: error.message }, 400);
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const enriched = await Promise.all((tasks ?? []).map(async (task) => {
      const [{ data: comments }, { data: events }] = await Promise.all([
        adminClient
          .from("task_comments")
          .select("id, body, user_id, created_at")
          .eq("task_id", task.id)
          .order("created_at", { ascending: false })
          .limit(15),
        adminClient
          .from("task_events")
          .select("id, event_type, metadata, actor_id, created_at")
          .eq("task_id", task.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      return {
        ...task,
        comments: comments ?? [],
        events: events ?? [],
      };
    }));

    const bucketed = {
      today: [] as typeof enriched,
      upcoming: [] as typeof enriched,
      overdue: [] as typeof enriched,
      completed: [] as typeof enriched,
    };

    for (const task of enriched) {
      const due = new Date(task.due_at);
      if (task.status === "completed") {
        bucketed.completed.push(task);
      } else if (due < now) {
        bucketed.overdue.push(task);
      } else if (due >= todayStart && due < tomorrowStart) {
        bucketed.today.push(task);
      } else {
        bucketed.upcoming.push(task);
      }
    }

    const filtered = payload.bucket && payload.bucket !== "all" ? bucketed[payload.bucket] : enriched;

    return withCors({
      tasks: filtered,
      sections: bucketed,
      meta: {
        total: enriched.length,
        role,
        visible_users: visibleUserIds,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : 500;
    return withCors({ error: message }, status);
  }
});
