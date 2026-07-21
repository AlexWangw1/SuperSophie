import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("notes workspace uses real cloud pages instead of a fixed navigation mock", async () => {
  const workspace = await readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /fetch\("\/api\/pages"\)/);
  assert.match(workspace, /listCachedPages\(\)/);
  assert.match(workspace, /mergeKnowledgePages\(payload\.pages\.filter\(\(item\) => !pendingDeletions\.has\(item\.id\)\), cachedSummaries\)/);
  assert.match(workspace, /sameContent/);
  assert.match(workspace, /openKnowledgePage/);
  assert.match(workspace, /createKnowledgePage/);
  assert.match(workspace, /deleteKnowledgePage/);
  assert.match(workspace, /openKnowledgePage\(remaining\[0\], false\)/);
  assert.match(workspace, /queuePendingPageDeletion\(page\.id\)/);
  assert.match(workspace, /listPendingPageDeletions\(\)/);
  assert.match(workspace, /filteredPages\.map/);
  assert.match(workspace, /反向链接/);
  assert.match(workspace, /item\.markdown\.includes\(`sophie-page:\$\{page\.id\}`\)/);
  assert.doesNotMatch(workspace, /<strong>产品与架构<\/strong>/);
});

test("page deletion is workspace-scoped and propagates a Markdown tombstone", async () => {
  const route = await readFile(new URL("../app/api/pages/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /DELETE FROM document_assets WHERE document_id = \? AND workspace_id = \?/);
  assert.match(route, /DELETE FROM documents WHERE id = \? AND workspace_id = \?/);
  assert.match(route, /entityKind: "document"/);
  assert.match(route, /deletedRevision: page\.revision \+ 1/);
});
