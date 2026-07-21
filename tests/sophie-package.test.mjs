import test from "node:test";
import assert from "node:assert/strict";
import {
  SOPHIE_MAGIC,
  blocksToMarkdown,
  createSophieAsset,
  createSophiePackage,
  parseSophiePageMarkdown,
  readSophiePackage,
  readSophiePackageWithAssets,
} from "../lib/sophie-package.ts";

function page() {
  return {
    id: "page-test-1",
    title: "Portable page",
    kind: "page",
    revision: 2,
    updatedAt: "2026-07-18T00:00:00.000Z",
    properties: { status: "Ready", tags: ["Offline"] },
    blocks: [
      { id: "block-text-1", type: "text", content: "离线可读" },
      { id: "block-code-1", type: "code", language: "typescript", content: "const fence = ```nested```;" },
    ],
  };
}

test("round-trips a page and verified binary attachment", async () => {
  const asset = await createSophieAsset({ id: "asset-1", name: "pixel.png", mime: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) });
  const input = page();
  input.blocks.push({ id: "block-image-1", type: "image", content: "pixel", assetId: asset.id });
  const packed = await createSophiePackage(input, [asset]);
  const restored = await readSophiePackageWithAssets(packed);
  assert.deepEqual(restored.page, input);
  assert.deepEqual(restored.assets, [asset]);
  assert.equal((await readSophiePackage(packed)).title, input.title);
  assert.match(blocksToMarkdown(input), /````typescript/);
});

test("reconstructs editable blocks and properties from the Markdown truth", () => {
  const input = page();
  input.properties = { status: "Ready", score: 72, published: true, tags: ["Offline", "Cloud"] };
  input.blocks = [
    { id: "b-text", type: "text", content: "正文\n第二行" },
    { id: "b-heading", type: "heading", content: "标题" },
    { id: "b-todo", type: "todo", content: "完成同步", checked: true },
    { id: "b-list", type: "bulleted-list", content: "列表" },
    { id: "b-number", type: "numbered-list", content: "编号" },
    { id: "b-quote", type: "quote", content: "引用" },
    { id: "b-callout", type: "callout", content: "提示" },
    { id: "b-toggle", type: "toggle", content: "展开" },
    { id: "b-divider", type: "divider", content: "" },
    { id: "b-image", type: "image", content: "图片", assetId: "asset-1" },
    { id: "b-file", type: "file", content: "文件", assetId: "asset-2" },
    { id: "b-page", type: "page-reference", content: "另一页", url: "page-other" },
    { id: "b-database", type: "database", content: "tasks" },
    { id: "b-code", type: "code", language: "typescript", content: "const fence = ```nested```;" },
  ];
  assert.deepEqual(parseSophiePageMarkdown(blocksToMarkdown(input)), input);
});

test("rejects a page object changed independently of its Markdown truth", async () => {
  const packed = await createSophiePackage(page());
  const [magic, json] = packed.split("\n", 2);
  const container = JSON.parse(json);
  container.page.blocks[0].content = "tampered";
  await assert.rejects(readSophiePackageWithAssets(`${magic}\n${JSON.stringify(container)}`), /块结构与 Markdown/);
});

test("rejects attachment data changed after export", async () => {
  const asset = await createSophieAsset({ id: "asset-2", name: "data.bin", mime: "application/octet-stream", bytes: new Uint8Array([1, 2, 3, 4]) });
  const input = page();
  input.blocks.push({ id: "block-file-1", type: "file", content: "data", assetId: asset.id });
  const packed = await createSophiePackage(input, [asset]);
  const newline = packed.indexOf("\n");
  const container = JSON.parse(packed.slice(newline + 1));
  container.assets[0].data = "AQIDBQ==";
  await assert.rejects(readSophiePackageWithAssets(`${SOPHIE_MAGIC}\n${JSON.stringify(container)}`), /附件 data.bin 校验失败/);
});

test("keeps compatibility with the original empty-asset SOPHIE/1 writer", async () => {
  const input = page();
  input.blocks = [input.blocks[0]];
  const legacyMarkdown = [
    "---", "sophie: 1", `id: ${input.id}`, `title: ${JSON.stringify(input.title)}`, `kind: ${input.kind}`,
    `revision: ${input.revision}`, "properties:", '  status: "Ready"', '  tags: ["Offline"]', "---",
    "<!-- sophie:block=block-text-1 type=text -->", "离线可读", "",
  ].join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(legacyMarkdown));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const legacy = {
    format: "application/x-sophie-page",
    version: 1,
    manifest: { packageId: "legacy", exportedAt: "2026-01-01T00:00:00.000Z", pageId: input.id, title: input.title, contentSha256: hash },
    page: { ...input, markdown: legacyMarkdown },
    assets: [],
  };
  assert.deepEqual(await readSophiePackage(`${SOPHIE_MAGIC}\n${JSON.stringify(legacy)}`), input);
});
