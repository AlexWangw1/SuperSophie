import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../db/ensure";
import { authErrorResponse, requireWorkspace } from "../../../../lib/auth";

export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    await ensureSchema();
    const result = await env.DB.prepare(
      `DELETE FROM connector_credentials WHERE workspace_id = ? AND provider = 'onedrive'`,
    ).bind(workspaceId).run() as { meta?: { changes?: number } };
    return Response.json({ disconnected: Boolean(result.meta?.changes) });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "onedrive_disconnect_failed" }, { status: 500 });
  }
}
