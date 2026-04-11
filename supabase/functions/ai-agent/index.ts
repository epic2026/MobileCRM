import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const sanitizeAction = (rawAction: unknown) => {
  const fallback = { type: "none", params: {} as Record<string, unknown> };

  if (!rawAction || typeof rawAction !== "object") return fallback;

  const candidate = rawAction as { type?: unknown; params?: unknown };
  const type = typeof candidate.type === "string" ? candidate.type : "none";
  const params =
    candidate.params && typeof candidate.params === "object" && !Array.isArray(candidate.params)
      ? (candidate.params as Record<string, unknown>)
      : {};

  switch (type) {
    case "update_lead":
      return isNonEmptyString(params.lead_id) && params.updates && typeof params.updates === "object" && !Array.isArray(params.updates)
        ? { type, params }
        : fallback;
    case "call_lead":
    case "whatsapp_lead":
      return isNonEmptyString(params.phone) ? { type, params } : fallback;
    case "email_lead":
      return isNonEmptyString(params.email) ? { type, params } : fallback;
    case "add_activity":
    case "add_meeting":
    case "add_task":
      return isNonEmptyString(params.lead_id) && isNonEmptyString(params.title) ? { type, params } : fallback;
    case "import_recordings":
    case "none":
      return { type, params };
    default:
      return fallback;
  }
};

const CRM_ACTION_TOOL = {
  type: "function",
  function: {
    name: "crm_action",
    description: "Handle any CRM action request and generate a structured response",
    parameters: {
      type: "object",
      required: ["message", "action", "suggestions"],
      properties: {
        message: {
          type: "string",
          description: "Friendly, concise assistant response shown to the user (1-2 sentences max). Use emoji where helpful.",
        },
        action: {
          type: "object",
          required: ["type", "params"],
          properties: {
            type: {
              type: "string",
              enum: [
                "update_lead",
                "call_lead",
                "whatsapp_lead",
                "email_lead",
                "add_activity",
                "add_task",
                "add_meeting",
                "import_recordings",
                "none",
              ],
              description: "The CRM action to perform. Use 'none' for pure info/insights responses.",
            },
            params: {
              type: "object",
              description: "Parameters required for the action",
            },
          },
        },
        suggestions: {
          type: "array",
          items: { type: "string" },
          description: "2-3 short, actionable follow-up suggestions shown as tappable chips",
          maxItems: 3,
        },
      },
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      console.error('🔴 Auth failed:', authError?.message || 'No user');
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    console.log('✅ Auth OK for user:', user.id);

    const body = await req.json();
    const message: string = body.message || "";
    const conversationHistory: { role: string; content: string }[] = body.conversationHistory || [];
    console.log('📨 User message:', message.slice(0, 80), '...');

    if (!message.trim()) {
      return new Response("Missing message", { status: 400, headers: corsHeaders });
    }

    // Fetch CRM context in parallel
    console.log('🔍 Fetching CRM context...');
    const [leadsRes, activitiesRes, tasksRes] = await Promise.all([
      client
        .from("leads")
        .select("id, name, phone, email, company, status, value, updated_at")
        .order("updated_at", { ascending: false })
        .limit(25),
      client
        .from("lead_activities")
        .select("id, lead_id, type, title, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      client
        .from("lead_tasks")
        .select("id, lead_id, title, status, due_date")
        .in("status", ["pending", "in_progress"])
        .order("due_date", { ascending: true })
        .limit(15),
    ]);

    const leads = leadsRes.data || [];
    const activities = activitiesRes.data || [];
    const tasks = tasksRes.data || [];
    console.log(`📊 Context: ${leads.length} leads, ${activities.length} activities, ${tasks.length} tasks`);

    // Build concise context strings
    const leadLines = leads
      .map(
        (l) =>
          `[${l.id}] ${l.name} | ${l.phone} | ${l.email ?? "no-email"} | ${l.company ?? "no-company"} | status:${l.status} | value:₹${l.value ?? 0}`,
      )
      .join("\n");

    const taskLines = tasks
      .map((t) => {
        const lead = leads.find((l) => l.id === t.lead_id);
        return `"${t.title}" → ${lead?.name ?? "unknown"} | due:${t.due_date ?? "no date"} | ${t.status}`;
      })
      .join("\n");

    const activityLines = activities
      .slice(0, 12)
      .map((a) => {
        const lead = leads.find((l) => l.id === a.lead_id);
        return `${a.type}: "${a.title}" — ${lead?.name ?? "unknown"} (${new Date(a.created_at).toLocaleDateString("en-IN")})`;
      })
      .join("\n");

    const today = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Status breakdown for insights
    const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {});
    const pipelineValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

    const systemPrompt = `You are ARIA — a smart, friendly AI CRM assistant for an Indian sales team. You help manage leads, log activities, create tasks, initiate calls/messages, and provide business insights.

TODAY: ${today}

=== LEADS IN CRM (${leads.length} total) ===
${leadLines || "No leads yet."}

PIPELINE STATUS BREAKDOWN:
${Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(", ")}
Total pipeline value: ₹${pipelineValue.toLocaleString("en-IN")}

=== PENDING TASKS (${tasks.length}) ===
${taskLines || "No pending tasks."}

=== RECENT ACTIVITY ===
${activityLines || "No recent activity."}

====== RULES YOU MUST FOLLOW ======
1. ALWAYS respond using the crm_action tool. Never return plain text.
2. Match lead names using fuzzy matching — "rahul" → "Rahul Kumar", "priya" → "Priya Verma". Case-insensitive.
3. Only use IDs from the leads list above. Never invent or guess IDs.
4. If you cannot find a matching lead, set action.type="none" and politely ask for clarification.
5. Keep messages short and conversational (1-2 sentences). Use emoji where helpful.
6. For insights/overview/digest/score/analytics requests: summarize pipeline stats, flag stale leads (no activity in 5+ days based on updated_at), list upcoming tasks, give win recommendations. Use action.type="none".
7. Provide 2-3 relevant, actionable suggestion chips.
8. Indian context awareness: understand Hindi/Hinglish intent, Indian name patterns, ₹ currency.

ACTION PARAMS FORMAT:
- update_lead: { lead_id, lead_name, updates: { status?, name?, phone?, email?, company?, notes?, value? } }
- call_lead: { lead_id, lead_name, phone }
- whatsapp_lead: { lead_id, lead_name, phone }
- email_lead: { lead_id, lead_name, email }
- add_activity: { lead_id, lead_name, type: "call"|"email"|"meeting"|"note", title, description? }
- add_task: { lead_id, lead_name, title, description?, due_date? (ISO 8601 string or null) }
- add_meeting: { lead_id, lead_name, type: "meeting", title, description? }
- import_recordings: {}`;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error('🔴 OPENAI_API_KEY not found in Supabase secrets');
      throw new Error("OPENAI_API_KEY not configured. Add it to Supabase → Project Settings → Edge Functions → Secrets");
    }
    console.log('✅ OpenAI key loaded');

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-8),
      { role: "user", content: message },
    ];

    console.log('🚀 Calling OpenAI GPT-4o...');
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: aiMessages,
        tools: [CRM_ACTION_TOOL],
        tool_choice: { type: "function", function: { name: "crm_action" } },
        temperature: 0.35,
        max_tokens: 700,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('🔴 OpenAI API failed:', openaiRes.status, errText.slice(0, 500));
      throw new Error(`OpenAI ${openaiRes.status}: ${errText.slice(0, 200)}`);
    }
    console.log('✅ OpenAI request successful');

    const openaiData = await openaiRes.json();
    console.log('📦 OpenAI response received');
    const toolCall = openaiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('🔴 No tool call in response. Full response:', JSON.stringify(openaiData).slice(0, 500));
    }

    if (!toolCall?.function?.arguments) {
      throw new Error("Model returned no tool call");
    }

    let result: { message: string; action: { type: string; params: Record<string, unknown> }; suggestions: string[] };
    try {
      result = JSON.parse(toolCall.function.arguments);
      console.log('✅ Parsed action:', result.action.type);
    } catch (parseErr) {
      console.error('🔴 Failed to parse arguments:', toolCall.function.arguments);
      throw new Error("Failed to parse tool call arguments");
    }

    // Ensure safe defaults
    if (!result.message) result.message = "Done!";
    result.action = sanitizeAction(result.action);
    if (!Array.isArray(result.suggestions)) result.suggestions = [];

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ AI Agent Error:', errorMsg);
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');
    
    return new Response(
      JSON.stringify({
        message: `Sorry, I ran into an issue: ${errorMsg.slice(0, 100)}. Please try again.`,
        action: { type: "none", params: {} },
        suggestions: ["Try again", "Check my leads", "View tasks"],
        _debug: {
          error: errorMsg,
          timestamp: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
