import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../db/ensure";
import { getSocialConnectorStatus } from "../../../lib/connectors/delivery";
import {
  QqSecretSchema,
  SOCIAL_SECRET_PROVIDERS,
  TelegramSecretSchema,
  WeChatSecretSchema,
  workspaceSocialBindings,
} from "../../../lib/connectors/workspace-social";
import { authErrorResponse, requireWorkspace, writeSecurityEvent } from "../../../lib/auth";
import { deleteWorkspaceSecret, writeWorkspaceSecret } from "../../../lib/workspace-secrets";

const bindings = env as unknown as Record<string, unknown> & typeof env;
const SocialSecretActionSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("telegram"), credentials: TelegramSecretSchema }),
  z.object({ provider: z.literal("wechat"), credentials: WeChatSecretSchema }),
  z.object({ provider: z.literal("qq"), credentials: QqSecretSchema }),
]);

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
    const socialVault = await workspaceSocialBindings(env.DB, workspaceId, bindings);
    const social = getSocialConnectorStatus(socialVault.bindings);
    const oneDriveConfigured = Boolean(
      env.ONEDRIVE_CLIENT_ID?.trim() && env.ONEDRIVE_CLIENT_SECRET?.trim() && env.CONNECTOR_ENCRYPTION_KEY?.trim(),
    );

    return Response.json({
      connectors: {
        appcloud: { configured: true, connected: true, label: "D1 + R2" },
        telegram: { configured: social.telegram, connected: social.telegram, source: socialVault.sources.telegram },
        wechat: { configured: social.wechat, connected: social.wechat, label: "企业微信群机器人", source: socialVault.sources.wechat },
        qq: { configured: social.qq, connected: social.qq, label: "QQ 官方机器人", source: socialVault.sources.qq },
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

export async function POST(request: Request) {
  try {
    const { workspaceId, userId } = await requireWorkspace(request, { write: true });
    await ensureSchema();
    const payload = SocialSecretActionSchema.parse(await request.json());
    await writeWorkspaceSecret({
      db: env.DB,
      workspaceId,
      provider: SOCIAL_SECRET_PROVIDERS[payload.provider],
      value: payload.credentials,
      label: `${payload.provider} workspace credential`,
      bindings,
    });
    await writeSecurityEvent({ userId, workspaceId, eventType: "workspace_social_secret_updated", details: [`已更新 ${payload.provider} 工作区连接凭据。`, "事件不包含 token、secret 或 webhook。"] });
    return Response.json({ provider: payload.provider, configured: true });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "连接凭据无效" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "connector_secret_save_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId, userId } = await requireWorkspace(request, { write: true });
    await ensureSchema();
    const provider = z.enum(["telegram", "wechat", "qq"]).parse(new URL(request.url).searchParams.get("provider"));
    await deleteWorkspaceSecret({ db: env.DB, workspaceId, provider: SOCIAL_SECRET_PROVIDERS[provider] });
    await writeSecurityEvent({ userId, workspaceId, eventType: "workspace_social_secret_deleted", details: [`已删除 ${provider} 工作区连接凭据。`, "部署环境凭据（若存在）不受影响。"] });
    return Response.json({ provider, deleted: true });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof z.ZodError) return Response.json({ error: "连接器标识无效" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "connector_secret_delete_failed" }, { status: 500 });
  }
}
