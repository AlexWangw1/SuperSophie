import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";
import { getSocialConnectorStatus } from "../../../lib/connectors/delivery";
import { authErrorResponse, requireWorkspace } from "../../../lib/auth";

export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request);
    await ensureSchema();
    const [oneDriveCredential, lastSync, conflictCount] = await Promise.all([
    env.DB.prepare(
      `SELECT account_label AS accountLabel, expires_at AS expiresAt
       FROM connector_credentials WHERE workspace_id = ? AND provider = 'onedrive' LIMIT 1`,
    ).bind(workspaceId).first<{ accountLabel: string; expiresAt: string | null }>(),
    env.DB.prepare(
      `SELECT status, remote_path AS remotePath, details_markdown AS detailsMarkdown, created_at AS createdAt
       FROM connector_sync_events WHERE workspace_id = ? AND provider = 'onedrive'
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(workspaceId).first<{ status: string; remotePath: string; detailsMarkdown: string; createdAt: string }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count FROM connector_sync_conflicts
       WHERE workspace_id = ? AND provider = 'onedrive' AND status = 'open'`,
    ).bind(workspaceId).first<{ count: number }>(),
    ]);
    const social = getSocialConnectorStatus(env);
    const oneDriveConfigured = Boolean(
      env.ONEDRIVE_CLIENT_ID?.trim() && env.ONEDRIVE_CLIENT_SECRET?.trim() && env.CONNECTOR_ENCRYPTION_KEY?.trim(),
    );

    return Response.json({
      connectors: {
        appcloud: { configured: true, connected: true, label: "D1 + R2" },
        telegram: { configured: social.telegram, connected: social.telegram },
        wechat: { configured: social.wechat, connected: social.wechat, label: "企业微信群机器人" },
        qq: { configured: social.qq, connected: social.qq, label: "QQ 官方机器人" },
        onedrive: {
          configured: oneDriveConfigured,
          connected: Boolean(oneDriveCredential),
          accountLabel: oneDriveCredential?.accountLabel ?? null,
          lastSync,
          openConflicts: Number(conflictCount?.count ?? 0),
        },
      },
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "connector_status_failed" }, { status: 500 });
  }
}
