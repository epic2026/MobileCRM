import { createClient } from "npm:@supabase/supabase-js@2.50.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const createClients = (authHeader: string | null) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader ?? "" } },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  return { userClient, adminClient };
};

export const getAuthedUser = async (authHeader: string | null) => {
  if (!authHeader) {
    throw new Error("Unauthorized");
  }

  const { userClient } = createClients(authHeader);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user;
};

export const getUserRole = async (authHeader: string, userId: string) => {
  const { adminClient } = createClients(authHeader);
  const { data, error } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Role lookup failed: ${error.message}`);
  }

  return (data?.role as string | undefined) ?? "sales";
};

export const assertTaskVisibility = async (
  authHeader: string,
  currentUserId: string,
  userRole: string,
  assignedTo: string,
) => {
  if (userRole === "admin" || assignedTo === currentUserId) {
    return;
  }

  if (userRole !== "manager") {
    throw new Error("Forbidden");
  }

  const { adminClient } = createClients(authHeader);
  const { data, error } = await adminClient
    .from("user_teams")
    .select("id")
    .eq("manager_id", currentUserId)
    .eq("member_id", assignedTo)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Team lookup failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("Forbidden");
  }
};

export const withCors = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const parseBody = async <T>(req: Request): Promise<T> => {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
};

export const isPastDate = (value: string | null | undefined) => {
  if (!value) return false;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return true;
  return dt.getTime() < Date.now();
};
