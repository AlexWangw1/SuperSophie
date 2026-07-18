import test from "node:test";
import assert from "node:assert/strict";
import { buildCodeFileMarkdown, languageForPath, normalizeCodePath } from "../lib/code-files.ts";

test("normalizes safe project-relative paths and rejects traversal", () => {
  assert.equal(normalizeCodePath("./src\\index.ts"), "src/index.ts");
  assert.throws(() => normalizeCodePath("../secret.txt"), /相对跳转/);
  assert.throws(() => normalizeCodePath("src//index.ts"), /空段/);
  assert.throws(() => normalizeCodePath("/absolute.ts"), /无效/);
});

test("detects language and stores code in a Markdown truth document", () => {
  assert.equal(languageForPath("src/view.tsx"), "tsx");
  assert.equal(languageForPath("Dockerfile"), "text");
  const markdown = buildCodeFileMarkdown({
    id: "code-1",
    projectId: "project-1",
    path: "src/fence.ts",
    language: "typescript",
    content: "const sample = ```nested```;",
    revision: 3,
  });
  assert.match(markdown, /kind: code-file/);
  assert.match(markdown, /revision: 3/);
  assert.match(markdown, /````typescript/);
  assert.match(markdown, /const sample = ```nested```;/);
});
