import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../../db/ensure";
import {
  ACCESS_KEY_ITERATIONS,
  assertSameOrigin,
  createSession,
  deviceLabel,
  normalizeHandle,
  sha256,
  verifyAccessKey,
  writeSecurityEvent,
} from "../../../../lib/auth";

const LoginSchema = z.object({
  handle: z.string().trim().min(3).max(32),
  accessKey: z.string().min(1).max(128),
});

type UserRow = {
  id: string;
  handle: string;
  displayName: string;
  accessKeyHash: string;
  accessKeySalt: string;
  accessKeyIterations: number;
};

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const DUMMY_HASH = "mW6RWWt7P5tJq0W2N3F0CjZx-2Dlwxki7s3qj2Zb8Ig";
const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAA";

async function rateLimitId(request: Request, handle: string) {
  const address = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  return sha256(`login:${handle}:${address}`);
}

async function recordFailure(id: string, current?: { failures: number; windowStartedAt: string } | null) {
  const now = Date.now();
  const withinWindow = current && now - Date.parse(current.windowStartedAt) < WINDOW_MS;
  const failures = withinWindow ? current.failures + 1 : 1;
  const windowStartedAt = withinWindow ? current.windowStartedAt : new Date(now).toISOString();
  const blockedUntil = failures >= MAX_FAILURES ? new Date(now + WINDOW_MS).toISOString() : null;
  await env.DB.prepare(
    `INSERT INTO auth_login_limits (id, failures, window_started_at, blocked_until, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET failures = excluded.failures,
       window_started_at = excluded.window_started_at,
       blocked_until = excluded.blocked_until,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(id, failures, windowStartedAt, blockedUntil).run();
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = LoginSchema.parse(await request.json());
    await ensureSchema();
    const handle = normalizeHandle(payload.handle);
    const limitId = await rateLimitId(request, handle);
    const limit = await env.DB.prepare(
      `SELECT failures, window_started_at AS windowStartedAt, blocked_until AS blockedUntil
       FROM auth_login_limits WHERE id = ? LIMIT 1`,
    ).bind(limitId).first<{ failures: number; windowStartedAt: string; blockedUntil: string | null }>();
    if (limit?.blockedUntil && Date.parse(limit.blockedUntil) > Date.now()) {
      return Response.json({ error: "too_many_login_attempts" }, {
        status: 429,
        headers: { "retry-after": String(Math.ceil((Date.parse(limit.blockedUntil) - Date.now()) / 1000)) },
      });
    }

    const user = await env.DB.prepare(
      `SELECT id, handle, display_name AS displayName, access_key_hash AS accessKeyHash,
        access_key_salt AS accessKeySalt, access_key_iterations AS accessKeyIterations
       FROM users WHERE handle = ? LIMIT 1`,
    ).bind(handle).first<UserRow>();
    const valid = await verifyAccessKey(
      payload.accessKey,
      user?.accessKeyHash ?? DUMMY_HASH,
      user?.accessKeySalt ?? DUMMY_SALT,
      user?.accessKeyIterations ?? ACCESS_KEY_ITERATIONS,
    );
    if (!user || !valid) {
      await recordFailure(limitId, limit);
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
    }

    const workspace = await env.DB.prepare(
      `SELECT w.id, w.name, m.role FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ? ORDER BY m.created_at LIMIT 1`,
    ).bind(user.id).first<{ id: string; name: string; role: string }>();
    if (!workspace) return Response.json({ error: "account_has_no_workspace" }, { status: 403 });
    await env.DB.prepare(`DELETE FROM auth_login_limits WHERE id = ?`).bind(limitId).run();
    const session = await createSession({ request, userId: user.id, workspaceId: workspace.id, deviceLabel: deviceLabel(request) });
    await writeSecurityEvent({
      userId: user.id,
      workspaceId: workspace.id,
      eventType: "session-created",
      details: [`设备 **${deviceLabel(request)}** 已登录。`],
    });
    return Response.json({
      authenticated: true,
      user: { id: user.id, handle: user.handle, displayName: user.displayName },
      activeWorkspace: workspace,
    }, { headers: { "set-cookie": session.cookie } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "invalid_login" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "login_failed" }, { status: 500 });
  }
}
