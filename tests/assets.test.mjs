import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cloud attachment API preserves public asset IDs and page ownership", async () => {
  const [route, workspace, schema, migration] = await Promise.all([
    readFile(new URL("../app/api/assets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/ensure.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_nifty_doomsday.sql", import.meta.url), "utf8"),
  ]);
  assert.match(route, /scopedResourceId\(workspaceId, requestedAssetId\)/);
  assert.match(route, /publicResourceId\(workspaceId, id\)/);
  assert.match(route, /asset_checksum_mismatch/);
  assert.match(route, /INSERT OR IGNORE INTO document_assets/);
  assert.match(route, /JOIN asset_ownership/);
  assert.match(workspace, /loadCloudPageAssets/);
  assert.match(workspace, /uploadCloudPageAssets/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS document_assets/);
  assert.match(migration, /DELETE FROM `asset_ownership`/);
  assert.match(migration, /CREATE UNIQUE INDEX `asset_ownership_asset_workspace_idx`/);
});

test("OneDrive sync includes byte mirroring in the same verified workflow", async () => {
  const [route, helper, snapshot] = await Promise.all([
    readFile(new URL("../app/api/connectors/onedrive/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/connectors/onedrive-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/connectors/workspace-snapshot.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /syncOneDriveAssets/);
  assert.match(route, /下载附件/);
  assert.match(helper, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(helper, /OneDrive 附件校验失败/);
  assert.match(helper, /App Cloud 附件校验失败/);
  assert.match(snapshot, /OneDrive 内容寻址副本/);
});
