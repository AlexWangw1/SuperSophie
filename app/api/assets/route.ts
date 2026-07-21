import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";
import { authErrorResponse, requireWorkspace } from "../../../lib/auth";

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    if (!env.FILES) throw new Error("R2 binding FILES is unavailable");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
    if (file.size > 32 * 1024 * 1024) return Response.json({ error: "asset_too_large" }, { status: 413 });
    const bytes = await file.arrayBuffer();
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
    const key = `assets/${workspaceId}/${sha256}/${encodeURIComponent(file.name)}`;
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    await ensureSchema();
    const proposedId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO assets (id, name, mime, size, sha256, r2_key) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(proposedId, file.name, file.type || "application/octet-stream", file.size, sha256, key).run();
    const asset = await env.DB.prepare(`SELECT id FROM assets WHERE r2_key = ? LIMIT 1`).bind(key).first<{ id: string }>();
    if (!asset) throw new Error("asset_metadata_failed");
    const id = asset.id;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO asset_ownership (asset_id, workspace_id) VALUES (?, ?)`,
    ).bind(id, workspaceId).run();
    return Response.json({ id, key, sha256, name: file.name }, { status: 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to upload asset" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request);
    if (!env.FILES) return new Response("R2 binding FILES is unavailable", { status: 500 });
    const key = new URL(request.url).searchParams.get("key");
    if (!key) return new Response("key is required", { status: 400 });
    const owned = await env.DB.prepare(
      `SELECT a.id FROM assets a JOIN asset_ownership o ON o.asset_id = a.id
       WHERE a.r2_key = ? AND o.workspace_id = ? LIMIT 1`,
    ).bind(key, workspaceId).first();
    if (!owned) return new Response("Not found", { status: 404 });
    const object = await env.FILES.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=3600");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return new Response(error instanceof Error ? error.message : "Unable to load asset", { status: 500 });
  }
}
