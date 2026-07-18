import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../db/ensure";

export async function DELETE() {
  await ensureSchema();
  const result = await env.DB.prepare(
    `DELETE FROM connector_credentials WHERE workspace_id = 'default' AND provider = 'onedrive'`,
  ).run() as { meta?: { changes?: number } };
  return Response.json({ disconnected: Boolean(result.meta?.changes) });
}
