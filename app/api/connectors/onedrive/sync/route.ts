import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../../db/ensure";
import { authErrorResponse, requireWorkspace } from "../../../../../lib/auth";
import {
  downloadOneDriveMarkdown,
  getOneDriveAccessToken,
  OneDrivePreconditionError,
  uploadOneDriveMarkdown,
} from "../../../../../lib/connectors/onedrive";
import {
  buildWorkspaceSnapshotMarkdown,
  parseWorkspaceSnapshotMarkdown,
  WORKSPACE_SNAPSHOT_VERSION,
} from "../../../../../lib/connectors/workspace-snapshot";
import { mergeWorkspaceSnapshot, type WorkspaceMergeResult } from "../../../../../lib/connectors/workspace-sync";
import { syncOneDriveAssets, type OneDriveAssetSyncResult } from "../../../../../lib/connectors/onedrive-assets";

function remotePath(workspaceId: string) {
  return workspaceId === "default"
    ? "/SuperSophie-workspace-latest.md"
    : `/SuperSophie-workspace-${workspaceId.slice(0, 8)}-latest.md`;
}

function emptyMerge(): WorkspaceMergeResult {
  return { inserted: 0, updated: 0, unchanged: 0, keptLocal: 0, deleted: 0, conflicts: 0, skipped: 0 };
}

function addMerge(total: WorkspaceMergeResult, next: WorkspaceMergeResult) {
  for (const key of Object.keys(total) as Array<keyof WorkspaceMergeResult>) total[key] += next[key];
}

export async function POST(request: Request) {
  let workspaceId: string | undefined;
  let path = "";
  const eventId = crypto.randomUUID();
  try {
    workspaceId = (await requireWorkspace(request, { write: true })).workspaceId;
    path = remotePath(workspaceId);
    await ensureSchema();
    if (!env.FILES) throw new Error("R2 binding FILES is unavailable");
    const { accessToken, accountLabel } = await getOneDriveAccessToken({ db: env.DB, bindings: env, workspaceId });
    const merge = emptyMerge();
    let uploaded: Awaited<ReturnType<typeof uploadOneDriveMarkdown>> | undefined;
    let assets: OneDriveAssetSyncResult = { downloaded: 0, uploaded: 0, repaired: 0, unchanged: 0, skipped: 0 };
    let legacyArchived = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remote = await downloadOneDriveMarkdown({ accessToken, fileName: path.slice(1) });
      let remoteSnapshot: ReturnType<typeof parseWorkspaceSnapshotMarkdown> | null = null;
      if (remote) {
        const snapshot = parseWorkspaceSnapshotMarkdown(remote.markdown);
        remoteSnapshot = snapshot;
        if (snapshot.workspaceId !== workspaceId) throw new Error("OneDrive 同名快照属于另一个工作区，已拒绝覆盖");
        if (snapshot.version < WORKSPACE_SNAPSHOT_VERSION && !legacyArchived) {
          const stamp = snapshot.generatedAt.replace(/[:.]/g, "-");
          await uploadOneDriveMarkdown({
            accessToken,
            fileName: `${path.slice(1, -3)}-legacy-${stamp}.md`,
            markdown: remote.markdown,
          });
          legacyArchived = true;
        }
        addMerge(merge, await mergeWorkspaceSnapshot(env.DB, workspaceId, snapshot));
      }

      assets = await syncOneDriveAssets({
        db: env.DB,
        files: env.FILES,
        workspaceId,
        accessToken,
        remoteSnapshot,
      });

      const markdown = await buildWorkspaceSnapshotMarkdown(env.DB, workspaceId);
      try {
        uploaded = await uploadOneDriveMarkdown({
          accessToken,
          fileName: path.slice(1),
          markdown,
          itemId: remote?.id,
          ifMatch: remote?.eTag,
        });
        break;
      } catch (error) {
        if (!(error instanceof OneDrivePreconditionError) || attempt === 2) throw error;
      }
    }

    if (!uploaded) throw new Error("OneDrive 同步未能提交一致快照");
    const details = [
      "---",
      "sophie: 1",
      "kind: connector-sync-receipt",
      "provider: onedrive",
      "mode: bidirectional-merge",
      `remoteId: ${uploaded.id}`,
      `syncedAt: ${new Date().toISOString()}`,
      "---",
      "",
      "# OneDrive 双向同步完成",
      "",
      `- 拉取新增：${merge.inserted}`,
      `- 拉取更新：${merge.updated}`,
      `- 远端删除：${merge.deleted}`,
      `- 保留本地较新版本：${merge.keptLocal}`,
      `- 需要人工处理的冲突：${merge.conflicts}`,
      `- 无法导入的清单项：${merge.skipped}`,
      `- 下载附件：${assets.downloaded}`,
      `- 修复本地附件：${assets.repaired}`,
      `- 上传附件：${assets.uploaded}`,
      `- 已存在附件：${assets.unchanged}`,
      `- 跳过附件：${assets.skipped}`,
      `- 旧版快照已归档：${legacyArchived ? "是" : "否"}`,
      "",
      "合并后的 Markdown 真相源已写回 OneDrive；凭据未包含在快照中。",
    ].join("\n");
    await env.DB.prepare(
      `INSERT INTO connector_sync_events (id, workspace_id, provider, status, remote_path, details_markdown)
       VALUES (?, ?, 'onedrive', ?, ?, ?)`,
    ).bind(eventId, workspaceId, merge.conflicts ? "conflict" : "synced", path, details).run();
    return Response.json({
      status: merge.conflicts ? "conflict" : "synced",
      mode: "bidirectional-merge",
      remotePath: path,
      accountLabel,
      webUrl: uploaded.webUrl ?? null,
      merge,
      assets,
      legacyArchived,
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
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
    if (workspaceId) {
      await env.DB.prepare(
        `INSERT INTO connector_sync_events (id, workspace_id, provider, status, remote_path, details_markdown)
         VALUES (?, ?, 'onedrive', 'failed', ?, ?)`,
      ).bind(eventId, workspaceId, path || remotePath(workspaceId), details).run();
    }
    return Response.json({ error: message, code: "ONEDRIVE_SYNC_FAILED" }, { status: 502 });
  }
}
