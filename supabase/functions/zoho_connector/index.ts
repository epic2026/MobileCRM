import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getAuthedUser, getUserRole, withCors } from "../_shared/task-module.ts";
import { ensureZohoAccessToken } from "../_shared/zoho.ts";

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
    const user = await getAuthedUser(authHeader);
    const role = await getUserRole(authHeader || "", user.id);
    if (role !== "admin") {
      return withCors({ error: "Forbidden" }, 403);
    }

    const body = (await req.json()) as RequestBody;
    const mode = body.mode;
    const records = Array.isArray(body.records) ? body.records : [];
    const { accessToken, apiDomain } = await ensureZohoAccessToken();

    if (!mode || (mode !== "tasks" && mode !== "activities")) {
      return withCors({ error: "Invalid mode" }, 400);
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

    return withCors({ success, failed, details }, 200);
  } catch (error) {
    return withCors({ error: error instanceof Error ? error.message : "Unexpected connector failure" }, 500);
  }
});
