import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  authErrorResponse,
  getAuthContext,
  requireWorkspace,
  writeSecurityEvent,
} from "../../../../lib/auth";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("switch-workspace"), workspaceId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("create-workspace"), name: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("revoke-session"), sessionId: z.string().uuid() }),
]);

async function sessionPayload(request: Request) {
  const context = await getAuthContext(request);
  if (!context) return { authenticated: false as const };
  const [workspaces, devices] = await Promise.all([
    env.DB.prepare(
      `SELECT w.id, w.name, m.role FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ? ORDER BY w.created_at`,
    ).bind(context.userId).all<{ id: string; name: string; role: string }>(),
    env.DB.prepare(
      `SELECT id, device_label AS deviceLabel, created_at AS createdAt,
        last_seen_at AS lastSeenAt, expires_at AS expiresAt
       FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`,
    ).bind(context.userId, new Date().toISOString()).all<{
      id: string; deviceLabel: string; createdAt: string; lastSeenAt: string; expiresAt: string;
    }>(),
  ]);
  return {
    authenticated: true as const,
    user: { id: context.userId, handle: context.handle, displayName: context.displayName },
    activeWorkspace: { id: context.workspaceId, name: context.workspaceName, role: context.role },
    workspaces: workspaces.results,
    devices: devices.results.map((device) => ({ ...device, current: device.id === context.sessionId })),
  };
}

export async function GET(request: Request) {
  try {
    return Response.json(await sessionPayload(request));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "session_lookup_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace(request, { sameOrigin: true });
    const payload = ActionSchema.parse(await request.json());
    if (payload.action === "switch-workspace") {
      const membership = await env.DB.prepare(
        `SELECT w.name, m.role FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.user_id = ? AND m.workspace_id = ? LIMIT 1`,
      ).bind(context.userId, payload.workspaceId).first<{ name: string; role: string }>();
      if (!membership) return Response.json({ error: "workspace_access_denied" }, { status: 403 });
      await env.DB.prepare(
        `UPDATE sessions SET active_workspace_id = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(payload.workspaceId, context.sessionId).run();
      await writeSecurityEvent({
        userId: context.userId,
        workspaceId: payload.workspaceId,
        eventType: "workspace-switched",
        details: [`当前设备切换到工作区 **${membership.name}**。`],
      });
    } else if (payload.action === "create-workspace") {
      const workspaceId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO workspaces (id, name, owner_user_id) VALUES (?, ?, ?)`)
          .bind(workspaceId, payload.name, context.userId),
        env.DB.prepare(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')`)
          .bind(workspaceId, context.userId),
        env.DB.prepare(`UPDATE sessions SET active_workspace_id = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(workspaceId, context.sessionId),
      ]);
      await writeSecurityEvent({
        userId: context.userId,
        workspaceId,
        eventType: "workspace-created",
        details: [`创建工作区 **${payload.name}**。`],
      });
    } else {
      const target = await env.DB.prepare(`SELECT id FROM sessions WHERE id = ? AND user_id = ? LIMIT 1`)
        .bind(payload.sessionId, context.userId).first();
      if (!target) return Response.json({ error: "session_not_found" }, { status: 404 });
      if (payload.sessionId === context.sessionId) return Response.json({ error: "use_logout_for_current_session" }, { status: 409 });
      await env.DB.prepare(`DELETE FROM sessions WHERE id = ? AND user_id = ?`).bind(payload.sessionId, context.userId).run();
      await writeSecurityEvent({
        userId: context.userId,
        workspaceId: context.workspaceId,
        eventType: "session-revoked",
        details: ["撤销设备会话 `" + payload.sessionId + "`。"],
      });
    }
    return Response.json(await sessionPayload(request));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof z.ZodError) return Response.json({ error: "invalid_session_action" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "session_action_failed" }, { status: 500 });
  }
}
