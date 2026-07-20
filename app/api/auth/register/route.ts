import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../../db/ensure";
import {
  assertSameOrigin,
  createSession,
  deriveAccessKey,
  deviceLabel,
  normalizeHandle,
  writeSecurityEvent,
} from "../../../../lib/auth";

const RegisterSchema = z.object({
  handle: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  displayName: z.string().trim().min(1).max(80),
  accessKey: z.string().min(16).max(128),
  workspaceName: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = RegisterSchema.parse(await request.json());
    await ensureSchema();
    const handle = normalizeHandle(payload.handle);
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE handle = ? LIMIT 1`).bind(handle).first();
    if (existing) return Response.json({ error: "account_handle_taken" }, { status: 409 });

    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users`).first<{ count: number }>();
    const userId = crypto.randomUUID();
    const workspaceId = Number(count?.count ?? 0) === 0 ? "default" : crypto.randomUUID();
    const derived = await deriveAccessKey(payload.accessKey);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users
          (id, handle, display_name, access_key_hash, access_key_salt, access_key_iterations)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(userId, handle, payload.displayName, derived.hash, derived.salt, derived.iterations),
      env.DB.prepare(
        `INSERT INTO workspaces (id, name, owner_user_id) VALUES (?, ?, ?)`,
      ).bind(workspaceId, payload.workspaceName, userId),
      env.DB.prepare(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')`,
      ).bind(workspaceId, userId),
    ]);
    const session = await createSession({ request, userId, workspaceId, deviceLabel: deviceLabel(request) });
    await writeSecurityEvent({
      userId,
      workspaceId,
      eventType: "account-created",
      details: [`账户 **${handle}** 创建了工作区 **${payload.workspaceName}**。`],
    });
    return Response.json({
      authenticated: true,
      user: { id: userId, handle, displayName: payload.displayName },
      activeWorkspace: { id: workspaceId, name: payload.workspaceName, role: "owner" },
    }, { status: 201, headers: { "set-cookie": session.cookie } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "invalid_registration", details: error.flatten() }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "account_creation_failed";
    if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "account_handle_taken" }, { status: 409 });
    return Response.json({ error: message }, { status: 500 });
  }
}
