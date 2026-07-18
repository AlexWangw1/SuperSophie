import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../../db/ensure";
import { createPkceChallenge, createPkceVerifier } from "../../../../../lib/connectors/crypto";
import { getOneDriveOAuthConfig } from "../../../../../lib/connectors/onedrive";

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const config = getOneDriveOAuthConfig(env);
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/connectors/onedrive/callback`;
    const state = crypto.randomUUID();
    const verifier = createPkceVerifier();
    const challenge = await createPkceChallenge(verifier);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM connector_oauth_states WHERE expires_at < ?`).bind(new Date().toISOString()),
      env.DB.prepare(
        `INSERT INTO connector_oauth_states (state, workspace_id, provider, code_verifier, redirect_uri, expires_at)
         VALUES (?, 'default', 'onedrive', ?, ?, ?)`,
      ).bind(state, verifier, redirectUri, expiresAt),
    ]);
    const authorizeUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize`);
    authorizeUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: config.scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return Response.redirect(authorizeUrl.toString(), 302);
  } catch {
    const redirect = new URL("/", new URL(request.url).origin);
    redirect.searchParams.set("section", "connectors");
    redirect.searchParams.set("onedrive", "unconfigured");
    return Response.redirect(redirect.toString(), 302);
  }
}
