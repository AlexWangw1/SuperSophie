import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { continuationBlockType, nearestEditableBlockId, splitBlockContent } from "../lib/block-editor.ts";

test("Enter splits a block at the exact selection and drops selected text", () => {
  assert.deepEqual(splitBlockContent("前半段后半段", 3), { before: "前半段", after: "后半段" });
  assert.deepEqual(splitBlockContent("保留删除结尾", 2, 4), { before: "保留", after: "结尾" });
  assert.deepEqual(splitBlockContent("abc", -9, 99), { before: "", after: "" });
});

test("list and todo blocks continue naturally while headings return to body text", () => {
  assert.equal(continuationBlockType("bulleted-list"), "bulleted-list");
  assert.equal(continuationBlockType("numbered-list"), "numbered-list");
  assert.equal(continuationBlockType("todo"), "todo");
  assert.equal(continuationBlockType("heading"), "text");
  assert.equal(continuationBlockType("callout"), "text");
});

test("Backspace focus skips embedded database and other non-text blocks", () => {
  const blocks = [
    { id: "paragraph", type: "text", content: "正文" },
    { id: "database", type: "database", content: "product-tasks" },
    { id: "empty", type: "text", content: "" },
  ];
  assert.equal(nearestEditableBlockId(blocks, "empty"), "paragraph");
});

test("database is rendered inside the note block editor and no longer has a standalone section", async () => {
  const [workspace, testPage] = await Promise.all([
    readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/editor-test/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /type: "database", content: "product-tasks"/);
  assert.match(workspace, /<DatabaseView key=\{`\$\{block\.id\}:\$\{block\.content\}`\} embedded initialSourceId=/);
  assert.match(workspace, /data-testid=\{embedded \? "embedded-database"/);
  assert.match(workspace, /splitBlock\(block, event\.currentTarget\.value, event\.currentTarget\.selectionStart, event\.currentTarget\.selectionEnd\)/);
  assert.match(workspace, /setSelectionRange\(position, position\)/);
  assert.doesNotMatch(workspace, /section === "database"/);
  assert.doesNotMatch(workspace, /id: "database", icon: "▦", label: "数据库"/);
  assert.match(testPage, /process\.env\.NODE_ENV !== "development"/);
  assert.match(testPage, /notFound\(\)/);
});
