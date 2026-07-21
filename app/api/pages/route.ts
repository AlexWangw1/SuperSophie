import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";
import { authErrorResponse, requireWorkspace } from "../../../lib/auth";
import { publicResourceId, scopedResourceId } from "../../../lib/workspace-resource";
import { clearWorkspaceTombstone, recordWorkspaceTombstone } from "../../../lib/sync-tombstones";

type PagePayload = {
  id?: string;
  title?: string;
  icon?: string;
  kind?: string;
  markdown?: string;
  properties?: Record<string, unknown>;
  baseRevision?: number;
};

export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request);
    await ensureSchema();
    const result = await env.DB.prepare(
      `SELECT id, title, icon, kind, markdown, properties_json AS propertiesJson,
        revision, created_at AS createdAt, updated_at AS updatedAt
       FROM documents WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100`,
    ).bind(workspaceId).all<{ id: string } & Record<string, unknown>>();
    return Response.json({
      pages: result.results.map((page) => ({ ...page, id: publicResourceId(workspaceId, page.id) })),
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load pages" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    const payload = (await request.json()) as PagePayload;
    const id = payload.id?.trim() || crypto.randomUUID();
    const storedId = scopedResourceId(workspaceId, id);
    const title = payload.title?.trim();
    if (!title || typeof payload.markdown !== "string") {
      return Response.json({ error: "title and markdown are required" }, { status: 400 });
    }

    await ensureSchema();
    const existing = await env.DB.prepare("SELECT revision FROM documents WHERE id = ? AND workspace_id = ?")
      .bind(storedId, workspaceId).first<{ revision: number }>();
    if (existing && payload.baseRevision !== undefined && payload.baseRevision !== existing.revision) {
      return Response.json({ error: "revision_conflict", currentRevision: existing.revision }, { status: 409 });
    }

    const nextRevision = (existing?.revision ?? 0) + 1;
    await env.DB.prepare(`INSERT INTO documents
      (id, workspace_id, title, icon, kind, markdown, properties_json, revision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        icon = excluded.icon,
        kind = excluded.kind,
        markdown = excluded.markdown,
        properties_json = excluded.properties_json,
        revision = excluded.revision,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(
        storedId,
        workspaceId,
        title,
        payload.icon ?? "📄",
        payload.kind ?? "page",
        payload.markdown,
        JSON.stringify(payload.properties ?? {}),
        nextRevision,
      ).run();
    await clearWorkspaceTombstone(env.DB, workspaceId, "document", storedId);

    return Response.json({ id, revision: nextRevision, updatedAt: new Date().toISOString() }, { status: existing ? 200 : 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save page" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id || !/^[A-Za-z0-9._:-]{1,160}$/.test(id)) return Response.json({ error: "invalid_page_id" }, { status: 400 });
    const storedId = scopedResourceId(workspaceId, id);
    await ensureSchema();
    const page = await env.DB.prepare(`SELECT revision FROM documents WHERE id = ? AND workspace_id = ? LIMIT 1`)
      .bind(storedId, workspaceId).first<{ revision: number }>();
    if (!page) return Response.json({ error: "page_not_found" }, { status: 404 });
    await env.DB.prepare(`DELETE FROM document_assets WHERE document_id = ? AND workspace_id = ?`).bind(storedId, workspaceId).run();
    await env.DB.prepare(`DELETE FROM documents WHERE id = ? AND workspace_id = ?`).bind(storedId, workspaceId).run();
    await recordWorkspaceTombstone({ db: env.DB, workspaceId, entityKind: "document", entityId: storedId, deletedRevision: page.revision + 1 });
    return Response.json({ id, deleted: true });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete page" }, { status: 500 });
  }
}
