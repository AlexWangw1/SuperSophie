import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../../db/ensure";
import { getOneDriveAccessToken, uploadOneDriveMarkdown } from "../../../../../lib/connectors/onedrive";
import { buildWorkspaceSnapshotMarkdown } from "../../../../../lib/connectors/workspace-snapshot";

const REMOTE_PATH = "/SuperSophie-workspace-latest.md";

export async function POST() {
  await ensureSchema();
  const eventId = crypto.randomUUID();
  try {
    const [{ accessToken, accountLabel }, markdown] = await Promise.all([
      getOneDriveAccessToken({ db: env.DB, bindings: env }),
      buildWorkspaceSnapshotMarkdown(env.DB),
    ]);
    const uploaded = await uploadOneDriveMarkdown({
      accessToken,
      fileName: REMOTE_PATH.slice(1),
      markdown,
    });
    const details = [
      "---",
      "sophie: 1",
      "kind: connector-sync-receipt",
      "provider: onedrive",
      `remoteId: ${uploaded.id}`,
      `syncedAt: ${new Date().toISOString()}`,
      "---",
      "",
      "工作区 Markdown 快照已上传；凭据未包含在快照中。",
    ].join("\n");
    await env.DB.prepare(
      `INSERT INTO connector_sync_events (id, workspace_id, provider, status, remote_path, details_markdown)
       VALUES (?, 'default', 'onedrive', 'synced', ?, ?)`,
    ).bind(eventId, REMOTE_PATH, details).run();
    return Response.json({ status: "synced", remotePath: REMOTE_PATH, accountLabel, webUrl: uploaded.webUrl ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OneDrive 同步失败";
    const details = [
      "---",
      "sophie: 1",
      "kind: connector-sync-failure",
      "provider: onedrive",
      `failedAt: ${new Date().toISOString()}`,
      "---",
      "",
      message,
    ].join("\n");
    await env.DB.prepare(
      `INSERT INTO connector_sync_events (id, workspace_id, provider, status, remote_path, details_markdown)
       VALUES (?, 'default', 'onedrive', 'failed', ?, ?)`,
    ).bind(eventId, REMOTE_PATH, details).run();
    return Response.json({ error: message, code: "ONEDRIVE_SYNC_FAILED" }, { status: 502 });
  }
}
