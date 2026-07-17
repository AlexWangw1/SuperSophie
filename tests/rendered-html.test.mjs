import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses finished SuperSophie metadata and product entry point", async () => {
  const [layout, page] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /SuperSophie/);
  assert.match(layout, /Markdown-first/);
  assert.match(page, /SophieWorkspace/);
  assert.doesNotMatch(`${layout}\n${page}`, /codex-preview|Your site is taking shape|SkeletonPreview/i);
});

test("exposes the requested product surfaces in the initial application bundle", async () => {
  const source = await readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8");
  for (const capability of ["笔记", "数据库", "Agent Work", "代码", "连接器", "Telegram", "OneDrive", ".sophie"]) {
    assert.match(source, new RegExp(capability.replace(".", "\\.")));
  }
  for (const view of ["table", "board", "timeline", "calendar", "gallery", "chart", "map", "feed", "dashboard", "form"]) {
    assert.match(source, new RegExp(`id: \"${view}\"`));
  }
});
