import { env } from "cloudflare:workers";
import { ensureSchema } from "../db/ensure";
import { randomSecret, sha256 } from "./auth-crypto";
export { deriveAccessKey, normalizeHandle, randomSecret, sha256, verifyAccessKey } from "./auth-crypto";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_PRODUCTION = "__Host-sophie_session";
const COOKIE_LOCAL = "sophie_session";

export type WorkspaceRole = "owner" | "editor" | "viewer";

export type AuthContext = {
  sessionId: string;
  userId: string;
  handle: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
};

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
  }
}

function cookieMap(request: Request) {
  return new Map(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator < 0 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function requestSessionToken(request: Request) {
  const cookies = cookieMap(request);
  return cookies.get(COOKIE_PRODUCTION) || cookies.get(COOKIE_LOCAL) || null;
}

export function createSessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? COOKIE_PRODUCTION : COOKIE_LOCAL;
  return `${name}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function clearSessionCookies() {
  return [
    `${COOKIE_PRODUCTION}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`,
    `${COOKIE_LOCAL}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
  ];
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AuthError(403, "cross_origin_request_rejected");
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  await ensureSchema();
  const token = requestSessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.id AS sessionId, u.id AS userId, u.handle, u.display_name AS displayName,
      w.id AS workspaceId, w.name AS workspaceName, m.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN workspace_members m ON m.user_id = s.user_id AND m.workspace_id = s.active_workspace_id
     JOIN workspaces w ON w.id = s.active_workspace_id
     WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`,
  ).bind(tokenHash, new Date().toISOString()).first<AuthContext>();
  return row ?? null;
}

export async function requireWorkspace(request: Request, options: { write?: boolean; sameOrigin?: boolean } = {}) {
  if (options.sameOrigin ?? options.write) assertSameOrigin(request);
  const context = await getAuthContext(request);
  if (!context) throw new AuthError(401, "authentication_required");
  if (options.write && context.role === "viewer") throw new AuthError(403, "workspace_read_only");
  return context;
}

export function authErrorResponse(error: unknown) {
  if (!(error instanceof AuthError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}

export async function createSession(input: { request: Request; userId: string; workspaceId: string; deviceLabel?: string }) {
  const token = randomSecret(32);
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, active_workspace_id, device_label, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, input.userId, tokenHash, input.workspaceId, (input.deviceLabel ?? "").slice(0, 160), expiresAt).run();
  return { id, token, expiresAt, cookie: createSessionCookie(input.request, token) };
}

export async function writeSecurityEvent(input: {
  userId?: string;
  workspaceId?: string;
  eventType: string;
  details: string[];
}) {
  const markdown = [
    "---",
    "sophie: 1",
    "kind: security-event",
    `event: ${input.eventType}`,
    `occurredAt: ${new Date().toISOString()}`,
    "---",
    "",
    ...input.details,
  ].join("\n");
  await env.DB.prepare(
    `INSERT INTO security_events (id, user_id, workspace_id, event_type, details_markdown)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), input.userId ?? null, input.workspaceId ?? null, input.eventType, markdown).run();
}

export function deviceLabel(request: Request) {
  return (request.headers.get("user-agent") || "未知设备").slice(0, 160);
}
