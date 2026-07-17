import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";

type PagePayload = {
  id?: string;
  title?: string;
  icon?: string;
  kind?: string;
  markdown?: string;
  properties?: Record<string, unknown>;
  baseRevision?: number;
};

export async function GET() {
  try {
    await ensureSchema();
    const result = await env.DB.prepare(
      `SELECT id, title, icon, kind, markdown, properties_json AS propertiesJson,
        revision, created_at AS createdAt, updated_at AS updatedAt
       FROM documents WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100`,
    ).bind("default").all();
    return Response.json({ pages: result.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load pages" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PagePayload;
    const id = payload.id?.trim() || crypto.randomUUID();
    const title = payload.title?.trim();
    if (!title || typeof payload.markdown !== "string") {
      return Response.json({ error: "title and markdown are required" }, { status: 400 });
    }

    await ensureSchema();
    const existing = await env.DB.prepare("SELECT revision FROM documents WHERE id = ?").bind(id).first<{ revision: number }>();
    if (existing && payload.baseRevision !== undefined && payload.baseRevision !== existing.revision) {
      return Response.json({ error: "revision_conflict", currentRevision: existing.revision }, { status: 409 });
    }

    const nextRevision = (existing?.revision ?? 0) + 1;
    await env.DB.prepare(`INSERT INTO documents
      (id, workspace_id, title, icon, kind, markdown, properties_json, revision, updated_at)
      VALUES (?, 'default', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        icon = excluded.icon,
        kind = excluded.kind,
        markdown = excluded.markdown,
        properties_json = excluded.properties_json,
        revision = excluded.revision,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(
        id,
        title,
        payload.icon ?? "📄",
        payload.kind ?? "page",
        payload.markdown,
        JSON.stringify(payload.properties ?? {}),
        nextRevision,
      ).run();

    return Response.json({ id, revision: nextRevision, updatedAt: new Date().toISOString() }, { status: existing ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save page" }, { status: 500 });
  }
}

