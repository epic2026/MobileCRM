import { createClient } from "npm:@supabase/supabase-js@2.50.0";

type ZohoTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  api_domain?: string;
  token_type?: string;
  scope?: string;
};

type ZohoIntegrationRow = {
  provider: string;
  api_domain: string;
  accounts_server: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  expires_at: string | null;
};

const getServiceClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

export const getZohoEnv = () => {
  const clientId = Deno.env.get("ZOHO_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET") || "";
  const scopes = Deno.env.get("ZOHO_OAUTH_SCOPES") ||
    "ZohoCRM.modules.tasks.CREATE,ZohoCRM.modules.calls.CREATE,ZohoCRM.modules.leads.READ,ZohoSearch.securesearch.READ";

  if (!clientId || !clientSecret) {
    throw new Error("Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET in Supabase function secrets");
  }

  return { clientId, clientSecret, scopes };
};

export const exchangeZohoCode = async (input: {
  code: string;
  redirectUri: string;
  accountsServer: string;
}) => {
  const { clientId, clientSecret } = getZohoEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  const response = await fetch(`${input.accountsServer.replace(/\/$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const parsed = await parseJson(response);
  if (!response.ok || !parsed?.access_token) {
    throw new Error(parsed?.error || parsed?.message || `Zoho token exchange failed (${response.status})`);
  }

  return parsed as ZohoTokenPayload;
};

export const refreshZohoToken = async (input: {
  refreshToken: string;
  accountsServer: string;
}) => {
  const { clientId, clientSecret } = getZohoEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: input.refreshToken,
  });

  const response = await fetch(`${input.accountsServer.replace(/\/$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const parsed = await parseJson(response);
  if (!response.ok || !parsed?.access_token) {
    throw new Error(parsed?.error || parsed?.message || `Zoho token refresh failed (${response.status})`);
  }

  return parsed as ZohoTokenPayload;
};

export const upsertZohoIntegration = async (input: {
  accessToken: string;
  refreshToken: string;
  apiDomain: string;
  accountsServer: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  userId: string;
}) => {
  const serviceClient = getServiceClient();
  const expiresAt = typeof input.expiresIn === "number"
    ? new Date(Date.now() + Math.max(1, input.expiresIn - 60) * 1000).toISOString()
    : null;

  const { error } = await serviceClient
    .from("crm_integrations")
    .upsert(
      {
        provider: "zoho",
        api_domain: input.apiDomain,
        accounts_server: input.accountsServer,
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        token_type: input.tokenType || "Bearer",
        scope: input.scope || null,
        expires_at: expiresAt,
        connected_by: input.userId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );

  if (error) {
    throw new Error(`Failed saving Zoho integration: ${error.message}`);
  }
};

export const getZohoIntegration = async () => {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("crm_integrations")
    .select("provider, api_domain, accounts_server, access_token, refresh_token, token_type, scope, expires_at")
    .eq("provider", "zoho")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed loading Zoho integration: ${error.message}`);
  }

  return (data || null) as ZohoIntegrationRow | null;
};

export const ensureZohoAccessToken = async () => {
  const serviceClient = getServiceClient();
  const integration = await getZohoIntegration();

  if (!integration) {
    throw new Error("Zoho CRM is not connected. Connect Zoho from Admin > Connect CRM first.");
  }

  const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null;
  const shouldRefresh = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() + 30_000;

  if (!shouldRefresh) {
    return { accessToken: integration.access_token, apiDomain: integration.api_domain };
  }

  const refreshed = await refreshZohoToken({
    refreshToken: integration.refresh_token,
    accountsServer: integration.accounts_server,
  });

  const nextExpiresAt = typeof refreshed.expires_in === "number"
    ? new Date(Date.now() + Math.max(1, refreshed.expires_in - 60) * 1000).toISOString()
    : integration.expires_at;

  const { error } = await serviceClient
    .from("crm_integrations")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || integration.refresh_token,
      token_type: refreshed.token_type || integration.token_type,
      scope: refreshed.scope || integration.scope,
      api_domain: refreshed.api_domain || integration.api_domain,
      expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "zoho");

  if (error) {
    throw new Error(`Failed updating Zoho access token: ${error.message}`);
  }

  return {
    accessToken: refreshed.access_token,
    apiDomain: refreshed.api_domain || integration.api_domain,
  };
};
