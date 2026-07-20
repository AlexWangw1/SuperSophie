import { env } from "cloudflare:workers";
import { ensureSchema } from "../db/ensure";

const ACCESS_KEY_ITERATIONS = 600_000;
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

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomSecret(byteLength = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function deriveAccessKey(accessKey: string, salt = randomSecret(16), iterations = ACCESS_KEY_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(accessKey),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations },
    keyMaterial,
    256,
  );
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt, iterations };
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyAccessKey(accessKey: string, expectedHash: string, salt: string, iterations: number) {
  const derived = await deriveAccessKey(accessKey, salt, iterations);
  return constantTimeEqual(derived.hash, expectedHash);
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

export function normalizeHandle(value: string) {
  return value.trim().toLowerCase();
}

export function deviceLabel(request: Request) {
  return (request.headers.get("user-agent") || "未知设备").slice(0, 160);
}
