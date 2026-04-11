import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LeadRef = {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
};

type ConnectorRecord = {
  id: string;
  title?: string;
  description?: string | null;
  due_date?: string | null;
  created_at?: string;
  status?: string;
  type?: string;
  lead?: LeadRef | null;
};

type RequestBody = {
  mode?: "tasks" | "activities";
  apiDomain?: string;
  accessToken?: string;
  records?: ConnectorRecord[];
};

const normalizePhone = (phone: string) => phone.replace(/[^+\d]/g, "");

const safeIsoDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseZohoResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleRow || roleRow.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    const mode = body.mode;
    const records = Array.isArray(body.records) ? body.records : [];
    const accessToken = (body.accessToken || "").trim();
    const apiDomain = (body.apiDomain || "https://www.zohoapis.com").replace(/\/$/, "");

    if (!mode || (mode !== "tasks" && mode !== "activities")) {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing Zoho OAuth access token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zohoFetch = (path: string, init?: RequestInit) =>
      fetch(`${apiDomain}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          ...(init?.headers || {}),
        },
      });

    const findZohoLeadId = async (lead: LeadRef | null | undefined) => {
      if (!lead) return null;

      if (lead.email) {
        const response = await zohoFetch(`/crm/v8/Leads/search?email=${encodeURIComponent(lead.email)}`);
        if (response.ok) {
          const parsed = await parseZohoResponse(response);
          const id = parsed?.data?.[0]?.id;
          if (id) return String(id);
        }
      }

      if (lead.phone) {
        const normalized = normalizePhone(lead.phone);
        if (normalized.length >= 6) {
          const response = await zohoFetch(`/crm/v8/Leads/search?phone=${encodeURIComponent(normalized)}`);
          if (response.ok) {
            const parsed = await parseZohoResponse(response);
            const id = parsed?.data?.[0]?.id;
            if (id) return String(id);
          }
        }
      }

      if (lead.name && lead.name.length >= 2) {
        const response = await zohoFetch(`/crm/v8/Leads/search?word=${encodeURIComponent(lead.name)}`);
        if (response.ok) {
          const parsed = await parseZohoResponse(response);
          const id = parsed?.data?.[0]?.id;
          if (id) return String(id);
        }
      }

      return null;
    };

    let success = 0;
    let failed = 0;
    const details: Array<{ id: string; reason: string }> = [];

    for (const record of records) {
      try {
        const zohoLeadId = await findZohoLeadId(record.lead);
        if (!zohoLeadId) {
          failed += 1;
          details.push({ id: record.id, reason: "Lead not found in Zoho" });
          continue;
        }

        if (mode === "tasks") {
          const dueDate = safeIsoDate(record.due_date)?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10);
          const payload = {
            data: [
              {
                Subject: record.title?.trim() || "CRM Task",
                Description: record.description || "",
                Due_Date: dueDate,
                Status: record.status === "completed" ? "Completed" : "Not Started",
                What_Id: { id: zohoLeadId },
                $se_module: "Leads",
              },
            ],
          };

          const response = await zohoFetch("/crm/v8/Tasks", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const parsed = await parseZohoResponse(response);
            failed += 1;
            details.push({ id: record.id, reason: parsed?.message || `Zoho task API failed (${response.status})` });
            continue;
          }

          success += 1;
          continue;
        }

        const startAt = safeIsoDate(record.created_at)?.toISOString() || new Date().toISOString();
        const isCall = record.type === "call";
        const payload = isCall
          ? {
              data: [
                {
                  Subject: record.title?.trim() || "Sales Call",
                  Call_Type: "Outbound",
                  Call_Start_Time: startAt,
                  Call_Duration: "00:01",
                  Description: record.description || "",
                  What_Id: { id: zohoLeadId },
                  $se_module: "Leads",
                },
              ],
            }
          : {
              data: [
                {
                  Subject: `Activity: ${record.title?.trim() || "Follow-up"}`,
                  Description: record.description || "",
                  Due_Date: new Date().toISOString().slice(0, 10),
                  Status: "Completed",
                  What_Id: { id: zohoLeadId },
                  $se_module: "Leads",
                },
              ],
            };

        const response = await zohoFetch(isCall ? "/crm/v8/Calls" : "/crm/v8/Tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const parsed = await parseZohoResponse(response);
          failed += 1;
          details.push({ id: record.id, reason: parsed?.message || `Zoho ${isCall ? "call" : "activity"} API failed (${response.status})` });
          continue;
        }

        success += 1;
      } catch (error) {
        failed += 1;
        details.push({ id: record.id, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    return new Response(JSON.stringify({ success, failed, details }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected connector failure" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
