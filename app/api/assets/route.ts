import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";
import { authErrorResponse, requireWorkspace } from "../../../lib/auth";
import { publicResourceId, scopedResourceId } from "../../../lib/workspace-resource";

const MAX_ASSET_BYTES = 32 * 1024 * 1024;

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validPublicId(value: string) {
  return /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    if (!env.FILES) throw new Error("R2 binding FILES is unavailable");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
    if (!file.name || file.name.length > 240 || /[\\/\0]/.test(file.name)) return Response.json({ error: "invalid_asset_name" }, { status: 400 });
    if (file.size > MAX_ASSET_BYTES) return Response.json({ error: "asset_too_large" }, { status: 413 });
    const requestedAssetId = formText(form, "assetId") || crypto.randomUUID();
    const documentId = formText(form, "documentId");
    if (!validPublicId(requestedAssetId) || (documentId && !validPublicId(documentId))) {
      return Response.json({ error: "invalid_asset_reference" }, { status: 400 });
    }
    const id = scopedResourceId(workspaceId, requestedAssetId);
    const storedDocumentId = documentId ? scopedResourceId(workspaceId, documentId) : null;
    const bytes = await file.arrayBuffer();
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
    const claimedSha256 = formText(form, "sha256").toLowerCase();
    if (claimedSha256 && claimedSha256 !== sha256) return Response.json({ error: "asset_checksum_mismatch" }, { status: 400 });
    const mime = file.type || "application/octet-stream";
    const key = `assets/${workspaceId}/${sha256}/${encodeURIComponent(id)}`;

    await ensureSchema();
    const global = await env.DB.prepare(
      `SELECT a.sha256, a.name, o.workspace_id AS workspaceId
       FROM assets a LEFT JOIN asset_ownership o ON o.asset_id = a.id AND o.workspace_id = ?
       WHERE a.id = ? LIMIT 1`,
    ).bind(workspaceId, id).first<{ sha256: string; name: string; workspaceId?: string }>();
    if (global && (!global.workspaceId || global.sha256 !== sha256 || global.name !== file.name)) {
      return Response.json({ error: "asset_id_conflict" }, { status: 409 });
    }

    await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
    await env.DB.prepare(
      `INSERT INTO assets (id, document_id, name, mime, size, sha256, r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         document_id = COALESCE(assets.document_id, excluded.document_id),
         name = excluded.name,
         mime = excluded.mime,
         size = excluded.size,
         sha256 = excluded.sha256,
         r2_key = excluded.r2_key`,
    ).bind(id, storedDocumentId, file.name, mime, file.size, sha256, key).run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO asset_ownership (asset_id, workspace_id) VALUES (?, ?)`,
    ).bind(id, workspaceId).run();
    if (storedDocumentId) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO document_assets (document_id, asset_id, workspace_id) VALUES (?, ?, ?)`,
      ).bind(storedDocumentId, id, workspaceId).run();
    }
    const publicId = publicResourceId(workspaceId, id);
    return Response.json({ id: publicId, key, sha256, name: file.name, mime, size: file.size, downloadUrl: `/api/assets?id=${encodeURIComponent(publicId)}` }, { status: global ? 200 : 201 });
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
    await ensureSchema();
    const url = new URL(request.url);
    const documentId = url.searchParams.get("documentId")?.trim();
    if (documentId) {
      if (!validPublicId(documentId)) return Response.json({ error: "invalid_document_id" }, { status: 400 });
      const storedDocumentId = scopedResourceId(workspaceId, documentId);
      const document = await env.DB.prepare(`SELECT 1 AS owned FROM documents WHERE id = ? AND workspace_id = ? LIMIT 1`)
        .bind(storedDocumentId, workspaceId).first();
      if (!document) return Response.json({ error: "document_not_found" }, { status: 404 });
      const assets = await env.DB.prepare(
        `SELECT DISTINCT a.id, a.name, a.mime, a.size, a.sha256, a.r2_key AS r2Key, a.created_at AS createdAt
         FROM assets a
         JOIN asset_ownership o ON o.asset_id = a.id AND o.workspace_id = ?
         LEFT JOIN document_assets d ON d.asset_id = a.id AND d.workspace_id = ?
         WHERE d.document_id = ? OR a.document_id = ?
         ORDER BY a.created_at`,
      ).bind(workspaceId, workspaceId, storedDocumentId, storedDocumentId).all<{ id: string; name: string; mime: string; size: number; sha256: string; r2Key: string; createdAt: string }>();
      return Response.json({
        assets: assets.results.map((asset) => {
          const id = publicResourceId(workspaceId, asset.id);
          return { ...asset, id, downloadUrl: `/api/assets?id=${encodeURIComponent(id)}` };
        }),
      });
    }

    const requestedId = url.searchParams.get("id")?.trim();
    const requestedKey = url.searchParams.get("key")?.trim();
    if (!requestedId && !requestedKey) return new Response("id or key is required", { status: 400 });
    if (requestedId && !validPublicId(requestedId)) return new Response("invalid id", { status: 400 });
    const storedId = requestedId ? scopedResourceId(workspaceId, requestedId) : null;
    const owned = await env.DB.prepare(
      `SELECT a.id, a.name, a.mime, a.r2_key AS r2Key FROM assets a
       JOIN asset_ownership o ON o.asset_id = a.id
       WHERE o.workspace_id = ? AND (${storedId ? "a.id = ?" : "a.r2_key = ?"}) LIMIT 1`,
    ).bind(workspaceId, storedId ?? requestedKey).first<{ id: string; name: string; mime: string; r2Key: string }>();
    if (!owned) return new Response("Not found", { status: 404 });
    const object = await env.FILES.get(owned.r2Key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", owned.mime);
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(owned.name)}`);
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
