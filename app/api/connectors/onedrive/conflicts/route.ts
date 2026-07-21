import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../../../db/ensure";
import { authErrorResponse, requireWorkspace } from "../../../../../lib/auth";
import { resolveWorkspaceSyncConflict } from "../../../../../lib/connectors/workspace-sync";

const ResolutionSchema = z.object({
  id: z.string().uuid(),
  resolution: z.enum(["keep-local", "use-remote"]),
});

export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request);
    await ensureSchema();
    const result = await env.DB.prepare(
      `SELECT id, entity_kind AS entityKind, entity_id AS entityId,
        details_markdown AS detailsMarkdown, created_at AS createdAt
       FROM connector_sync_conflicts
       WHERE workspace_id = ? AND provider = 'onedrive' AND status = 'open'
       ORDER BY created_at DESC LIMIT 100`,
    ).bind(workspaceId).all();
    return Response.json({ conflicts: result.results });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "同步冲突读取失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    const parsed = ResolutionSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "冲突解决操作无效" }, { status: 400 });
    await ensureSchema();
    const result = await resolveWorkspaceSyncConflict({ db: env.DB, workspaceId, conflictId: parsed.data.id, resolution: parsed.data.resolution });
    return Response.json(result);
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "同步冲突解决失败" }, { status: 500 });
  }
}
