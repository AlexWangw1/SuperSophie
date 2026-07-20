import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  authErrorResponse,
  deriveAccessKey,
  requireWorkspace,
  verifyAccessKey,
  writeSecurityEvent,
} from "../../../../lib/auth";

const RotateKeySchema = z.object({
  currentKey: z.string().min(1).max(128),
  newKey: z.string().min(16).max(128),
});

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace(request, { sameOrigin: true });
    const payload = RotateKeySchema.parse(await request.json());
    const user = await env.DB.prepare(
      `SELECT access_key_hash AS hash, access_key_salt AS salt, access_key_iterations AS iterations
       FROM users WHERE id = ? LIMIT 1`,
    ).bind(context.userId).first<{ hash: string; salt: string; iterations: number }>();
    if (!user || !(await verifyAccessKey(payload.currentKey, user.hash, user.salt, user.iterations))) {
      return Response.json({ error: "invalid_current_key" }, { status: 401 });
    }
    const derived = await deriveAccessKey(payload.newKey);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE users SET access_key_hash = ?, access_key_salt = ?, access_key_iterations = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(derived.hash, derived.salt, derived.iterations, context.userId),
      env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND id <> ?`).bind(context.userId, context.sessionId),
    ]);
    await writeSecurityEvent({
      userId: context.userId,
      workspaceId: context.workspaceId,
      eventType: "access-key-rotated",
      details: ["云端访问密钥已轮换，其他设备会话已全部撤销。"],
    });
    return Response.json({ rotated: true, otherSessionsRevoked: true });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof z.ZodError) return Response.json({ error: "invalid_key_rotation" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "key_rotation_failed" }, { status: 500 });
  }
}
