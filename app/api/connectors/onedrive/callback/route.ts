import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../../db/ensure";
import { exchangeOneDriveCode, encryptOneDriveCredential } from "../../../../../lib/connectors/onedrive";

type OauthStateRow = { workspaceId: string; codeVerifier: string; redirectUri: string; expiresAt: string };

function redirectToConnectors(request: Request, status: "connected" | "error") {
  const target = new URL("/", new URL(request.url).origin);
  target.searchParams.set("section", "connectors");
  target.searchParams.set("onedrive", status);
  return Response.redirect(target.toString(), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code || url.searchParams.has("error")) return redirectToConnectors(request, "error");

  try {
    await ensureSchema();
    const stateRow = await env.DB.prepare(
      `SELECT workspace_id AS workspaceId, code_verifier AS codeVerifier,
        redirect_uri AS redirectUri, expires_at AS expiresAt
       FROM connector_oauth_states WHERE state = ? AND provider = 'onedrive' LIMIT 1`,
    ).bind(state).first<OauthStateRow>();
    if (!stateRow || Date.parse(stateRow.expiresAt) <= Date.now()) return redirectToConnectors(request, "error");
    const consumed = await env.DB.prepare(`DELETE FROM connector_oauth_states WHERE state = ?`).bind(state).run() as { meta?: { changes?: number } };
    if (!consumed.meta?.changes) return redirectToConnectors(request, "error");

    const credential = await exchangeOneDriveCode({
      code,
      codeVerifier: stateRow.codeVerifier,
      redirectUri: stateRow.redirectUri,
      bindings: env,
    });
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName", {
      headers: { authorization: `Bearer ${credential.accessToken}` },
    });
    const profile = profileResponse.ok
      ? await profileResponse.json() as { displayName?: string; userPrincipalName?: string }
      : {};
    const accountLabel = profile.displayName || profile.userPrincipalName || "OneDrive";
    const ciphertext = await encryptOneDriveCredential(credential, env);
    await env.DB.prepare(
      `INSERT INTO connector_credentials
        (id, workspace_id, provider, credential_ciphertext, account_label, scopes, expires_at)
       VALUES (?, ?, 'onedrive', ?, ?, ?, ?)
       ON CONFLICT(workspace_id, provider) DO UPDATE SET
         credential_ciphertext = excluded.credential_ciphertext,
         account_label = excluded.account_label,
         scopes = excluded.scopes,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(crypto.randomUUID(), stateRow.workspaceId, ciphertext, accountLabel, credential.scope, credential.expiresAt).run();
    return redirectToConnectors(request, "connected");
  } catch {
    return redirectToConnectors(request, "error");
  }
}
