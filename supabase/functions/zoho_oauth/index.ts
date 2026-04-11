import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { corsHeaders, getAuthedUser, getUserRole, withCors } from "../_shared/task-module.ts";
import { exchangeZohoCode, getZohoEnv, getZohoIntegration, upsertZohoIntegration } from "../_shared/zoho.ts";

type OAuthAction = "authorize_url" | "status" | "disconnect";

type OAuthRequest = {
  action?: OAuthAction;
  apiDomain?: string;
  accountsServer?: string;
};

const htmlResponse = (ok: boolean, message: string) =>
  new Response(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Zoho CRM Connection</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #f5f7fb; color: #111827; margin: 0; }
      .card { max-width: 520px; margin: 56px auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb; }
      .title { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
      .text { font-size: 14px; color: #4b5563; margin: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="title">${ok ? "Zoho CRM connected" : "Zoho CRM connection failed"}</p>
      <p class="text">${message}</p>
      <p class="text" style="margin-top: 12px;">You can close this window now.</p>
    </div>
    <script>
      (function() {
        try {
          if (window.opener) {
            window.opener.postMessage({ type: 'ZOHO_OAUTH_RESULT', ok: ${ok ? "true" : "false"}, message: ${JSON.stringify(message)} }, '*');
          }
        } catch (error) {}
        setTimeout(function() { window.close(); }, 1200);
      })();
    </script>
  </body>
</html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const serviceClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Derive the public callback URL from SUPABASE_URL env variable.
  // SUPABASE_URL = https://<ref>.supabase.co → functions live at https://<ref>.functions.supabase.co
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const callbackUrl = supabaseUrl
    ? supabaseUrl.replace("https://", "https://").replace(".supabase.co", ".functions.supabase.co") + "/zoho_oauth"
    : (() => { const u = new URL(req.url); return `${u.origin}${u.pathname}`; })();

  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (!code || !state || oauthError) {
      const message = oauthError || "Missing OAuth callback parameters";
      return htmlResponse(false, message);
    }

    try {
      const admin = serviceClient();
      const { data: stateRow, error: stateError } = await admin
        .from("crm_oauth_states")
        .select("state, provider, user_id, accounts_server, api_domain, expires_at, consumed_at")
        .eq("state", state)
        .eq("provider", "zoho")
        .maybeSingle();

      if (stateError) {
        throw new Error(stateError.message);
      }

      if (!stateRow) {
        throw new Error("OAuth state not found. Start connect flow again.");
      }

      if (stateRow.consumed_at) {
        throw new Error("OAuth state was already used.");
      }

      const expiresAt = new Date(stateRow.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        throw new Error("OAuth state expired. Start connect flow again.");
      }

      const token = await exchangeZohoCode({
        code,
        redirectUri: callbackUrl,
        accountsServer: stateRow.accounts_server,
      });

      if (!token.refresh_token) {
        throw new Error("Zoho did not return a refresh token. Ensure access_type=offline and prompt=consent are enabled.");
      }

      await upsertZohoIntegration({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        apiDomain: token.api_domain || stateRow.api_domain,
        accountsServer: stateRow.accounts_server,
        expiresIn: token.expires_in,
        tokenType: token.token_type,
        scope: token.scope,
        userId: stateRow.user_id,
      });

      await admin
        .from("crm_oauth_states")
        .update({ consumed_at: new Date().toISOString() })
        .eq("state", stateRow.state);

      return htmlResponse(true, "Authentication completed and token saved on server.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Zoho OAuth callback failed";
      return htmlResponse(false, message);
    }
  }

  if (req.method !== "POST") {
    return withCors({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const user = await getAuthedUser(authHeader);
    const role = await getUserRole(authHeader || "", user.id);
    if (role !== "admin") {
      return withCors({ error: "Forbidden" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as OAuthRequest;
    const action = body.action;

    if (!action) {
      return withCors({ error: "Missing action" }, 400);
    }

    if (action === "status") {
      const integration = await getZohoIntegration();
      return withCors({
        connected: !!integration,
        apiDomain: integration?.api_domain || "https://www.zohoapis.com",
        accountsServer: integration?.accounts_server || "https://accounts.zoho.com",
        scope: integration?.scope || null,
        expiresAt: integration?.expires_at || null,
      });
    }

    const admin = serviceClient();

    if (action === "disconnect") {
      await admin.from("crm_integrations").delete().eq("provider", "zoho");
      return withCors({ success: true });
    }

    if (action === "authorize_url") {
      const env = getZohoEnv();
      const apiDomain = (body.apiDomain || "https://www.zohoapis.com").replace(/\/$/, "");
      const accountsServer = (body.accountsServer || "https://accounts.zoho.com").replace(/\/$/, "");
      const state = crypto.randomUUID().replace(/-/g, "");

      await admin.from("crm_oauth_states").delete().lt("expires_at", new Date().toISOString());

      const { error: stateInsertError } = await admin.from("crm_oauth_states").insert({
        state,
        provider: "zoho",
        user_id: user.id,
        api_domain: apiDomain,
        accounts_server: accountsServer,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      if (stateInsertError) {
        throw new Error(`Could not start Zoho OAuth flow: ${stateInsertError.message}`);
      }

      const authUrl = `${accountsServer}/oauth/v2/auth?response_type=code&access_type=offline&prompt=consent&client_id=${encodeURIComponent(env.clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(env.scopes)}&state=${encodeURIComponent(state)}`;

      return withCors({ authUrl });
    }

    return withCors({ error: "Invalid action" }, 400);
  } catch (error) {
    return withCors({ error: error instanceof Error ? error.message : "Unexpected Zoho OAuth error" }, 500);
  }
});
