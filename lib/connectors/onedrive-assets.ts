import { publicResourceId, scopedResourceId } from "../workspace-resource.ts";
import { downloadOneDriveBinary, uploadOneDriveBinary } from "./onedrive.ts";
import type { WorkspaceSnapshot, WorkspaceSnapshotEntry } from "./workspace-snapshot.ts";

const MAX_ASSET_BYTES = 32 * 1024 * 1024;

export type OneDriveAssetManifest = {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  createdAt?: string;
};

export type OneDriveAssetSyncResult = {
  downloaded: number;
  uploaded: number;
  repaired: number;
  unchanged: number;
  skipped: number;
};

function value(data: Record<string, unknown>, snake: string, camel: string) {
  return data[snake] ?? data[camel];
}

export function oneDriveAssetManifestFromEntry(entry: WorkspaceSnapshotEntry): OneDriveAssetManifest | null {
  if (entry.kind !== "asset-manifest") return null;
  const name = String(entry.data.name ?? "").trim();
  const mime = String(entry.data.mime ?? "").trim();
  const sha256 = String(entry.data.sha256 ?? "").toLowerCase();
  const size = Number(entry.data.size);
  if (!entry.id || entry.id.length > 240) return null;
  if (!name || name.length > 240 || /[\\/\0]/.test(name) || name === "." || name === "..") return null;
  if (!/^[\w.+-]+\/[\w.+-]+$/i.test(mime) || mime.length > 120) return null;
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  if (!Number.isInteger(size) || size < 0 || size > MAX_ASSET_BYTES) return null;
  const createdAt = String(value(entry.data, "created_at", "createdAt") ?? "");
  return { id: entry.id, name, mime, size, sha256, createdAt: Number.isNaN(Date.parse(createdAt)) ? undefined : createdAt };
}

export function oneDriveAssetFileName(workspaceId: string, sha256: string) {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("附件 SHA-256 无效");
  const workspace = workspaceId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "default";
  return `SuperSophie-asset-${workspace}-${sha256.toLowerCase()}.bin`;
}

function localR2Key(workspaceId: string, manifest: OneDriveAssetManifest) {
  return `assets/${workspaceId}/${manifest.sha256}/${encodeURIComponent(manifest.name)}`;
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function localAssets(db: D1Database, workspaceId: string) {
  const result = await db.prepare(
    `SELECT a.id, a.name, a.mime, a.size, a.sha256, a.r2_key AS r2Key, a.created_at AS createdAt
     FROM assets a JOIN asset_ownership o ON o.asset_id = a.id
     WHERE o.workspace_id = ? ORDER BY a.created_at`,
  ).bind(workspaceId).all<OneDriveAssetManifest & { r2Key: string }>();
  return result.results;
}

async function linkAssetReferences(db: D1Database, workspaceId: string, assetId: string) {
  const publicId = publicResourceId(workspaceId, assetId);
  const documents = await db.prepare(`SELECT id, markdown FROM documents WHERE workspace_id = ?`).bind(workspaceId).all<{ id: string; markdown: string }>();
  for (const document of documents.results) {
    if (!document.markdown.includes(`sophie-asset:${publicId}`)) continue;
    await db.prepare(`INSERT OR IGNORE INTO document_assets (document_id, asset_id, workspace_id) VALUES (?, ?, ?)`)
      .bind(document.id, assetId, workspaceId).run();
  }
}

async function importRemoteAsset(input: {
  db: D1Database;
  files: R2Bucket;
  workspaceId: string;
  accessToken: string;
  manifest: OneDriveAssetManifest;
  fetcher?: typeof fetch;
}) {
  const storedId = scopedResourceId(input.workspaceId, input.manifest.id);
  const key = localR2Key(input.workspaceId, input.manifest);
  const existing = await input.db.prepare(
    `SELECT a.id, a.r2_key AS r2Key FROM assets a JOIN asset_ownership o ON o.asset_id = a.id
     WHERE o.workspace_id = ? AND a.sha256 = ? AND a.name = ? LIMIT 1`,
  ).bind(input.workspaceId, input.manifest.sha256, input.manifest.name).first<{ id: string; r2Key: string }>();
  const object = existing ? await input.files.get(existing.r2Key) : null;
  if (existing && object) {
    await linkAssetReferences(input.db, input.workspaceId, existing.id);
    return "unchanged" as const;
  }

  const remote = await downloadOneDriveBinary({
    accessToken: input.accessToken,
    fileName: oneDriveAssetFileName(input.workspaceId, input.manifest.sha256),
    maxBytes: MAX_ASSET_BYTES,
    fetcher: input.fetcher,
  });
  if (!remote) throw new Error(`OneDrive 附件缺失：${input.manifest.name}`);
  if (remote.bytes.byteLength !== input.manifest.size || await sha256(remote.bytes) !== input.manifest.sha256) {
    throw new Error(`OneDrive 附件校验失败：${input.manifest.name}`);
  }
  await input.files.put(key, remote.bytes, { httpMetadata: { contentType: input.manifest.mime } });

  const globalId = await input.db.prepare(`SELECT r2_key AS r2Key FROM assets WHERE id = ? LIMIT 1`).bind(storedId).first<{ r2Key: string }>();
  if (globalId && globalId.r2Key !== key) throw new Error("OneDrive 附件 ID 与另一个工作区资源冲突");
  await input.db.prepare(
    `INSERT OR IGNORE INTO assets (id, name, mime, size, sha256, r2_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(storedId, input.manifest.name, input.manifest.mime, input.manifest.size, input.manifest.sha256, key, input.manifest.createdAt ?? new Date().toISOString()).run();
  const asset = await input.db.prepare(`SELECT id FROM assets WHERE r2_key = ? LIMIT 1`).bind(key).first<{ id: string }>();
  if (!asset) throw new Error("OneDrive 附件元数据恢复失败");
  await input.db.prepare(`INSERT OR IGNORE INTO asset_ownership (asset_id, workspace_id) VALUES (?, ?)`)
    .bind(asset.id, input.workspaceId).run();
  await linkAssetReferences(input.db, input.workspaceId, asset.id);
  return existing ? "repaired" as const : "downloaded" as const;
}

export async function syncOneDriveAssets(input: {
  db: D1Database;
  files: R2Bucket;
  workspaceId: string;
  accessToken: string;
  remoteSnapshot?: WorkspaceSnapshot | null;
  fetcher?: typeof fetch;
}) {
  const result: OneDriveAssetSyncResult = { downloaded: 0, uploaded: 0, repaired: 0, unchanged: 0, skipped: 0 };
  const remoteManifests = new Map<string, OneDriveAssetManifest>();
  for (const entry of input.remoteSnapshot?.entries ?? []) {
    if (entry.kind !== "asset-manifest") continue;
    const manifest = oneDriveAssetManifestFromEntry(entry);
    if (!manifest) { result.skipped += 1; continue; }
    remoteManifests.set(manifest.sha256, manifest);
    const status = await importRemoteAsset({ ...input, manifest });
    result[status] += 1;
  }

  for (const asset of await localAssets(input.db, input.workspaceId)) {
    if (remoteManifests.has(asset.sha256)) continue;
    const object = await input.files.get(asset.r2Key);
    if (!object) { result.skipped += 1; continue; }
    const bytes = await new Response(object.body).arrayBuffer();
    if (bytes.byteLength !== asset.size || await sha256(bytes) !== asset.sha256) {
      throw new Error(`App Cloud 附件校验失败：${asset.name}`);
    }
    await uploadOneDriveBinary({
      accessToken: input.accessToken,
      fileName: oneDriveAssetFileName(input.workspaceId, asset.sha256),
      bytes,
      contentType: asset.mime,
      fetcher: input.fetcher,
    });
    result.uploaded += 1;
  }
  return result;
}
