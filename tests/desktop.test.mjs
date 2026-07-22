import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSophieAsset, createSophiePackage } from "../lib/sophie-package.ts";

const require = createRequire(import.meta.url);
const offlinePackage = require("../desktop/offline-package.js");

const readWorkspaceFile = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("desktop package registers .sophie files and has aligned versions", async () => {
  const rootPackage = JSON.parse(await readWorkspaceFile("package.json"));
  const desktopPackage = JSON.parse(await readWorkspaceFile("desktop/package.json"));
  assert.equal(rootPackage.version, "0.3.0");
  assert.equal(desktopPackage.version, rootPackage.version);
  assert.equal(rootPackage.build.electronDist, "node_modules/electron/dist");
  assert.deepEqual(rootPackage.build.fileAssociations, [{
    ext: "sophie",
    name: "SuperSophie Page",
    description: "SuperSophie 离线页面",
    role: "Editor",
  }]);
});

test("desktop main process queues associated files and falls back offline", async () => {
  const source = await readWorkspaceFile("desktop/main.cjs");
  for (const expected of [
    "app.requestSingleInstanceLock()",
    "app.on(\"second-instance\"",
    "app.on(\"open-file\"",
    "sophieFileFromArguments(process.argv)",
    "desktop-settings.json",
    "did-fail-load",
    "loadOfflineShell()",
    "process.argv.includes(\"--offline\")",
    "SUPERSOPHIE_OFFLINE",
    "MAX_SOPHIE_FILE_BYTES",
    "assertTrustedRenderer(event, true)",
  ]) assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /nodeIntegration:\s*true/);
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /sandbox:\s*true/);
});

test("preload exposes bounded package-open operations", async () => {
  const source = await readWorkspaceFile("desktop/preload.cjs");
  for (const expected of ["pendingPackage", "consumeOpenedPackage", "onPackageAvailable", "retryOnline"]) {
    assert.match(source, new RegExp(expected));
  }
  assert.doesNotMatch(source, /require\(["']node:fs/);
});

test("offline shell uses a strict CSP and never enables inline execution", async () => {
  const html = await readWorkspaceFile("desktop/offline.html");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /'unsafe-inline'|'unsafe-eval'/);
  assert.match(html, /offline-package\.js/);
  assert.match(html, /offline\.js/);
});

test("desktop companion has a dedicated drag handle and clickable character", async () => {
  const [html, css] = await Promise.all([
    readWorkspaceFile("desktop/pet.html"),
    readWorkspaceFile("desktop/pet.css"),
  ]);
  assert.match(html, /pet-drag-handle/);
  assert.match(css, /\.pet-drag-handle[^}]*-webkit-app-region:\s*drag/s);
  assert.match(css, /#pet-character[^}]*-webkit-app-region:\s*no-drag/s);
});

test("offline parser verifies a complete .sophie page and its attachments", async () => {
  const asset = await createSophieAsset({
    id: "asset.demo",
    name: "hello.txt",
    mime: "text/plain",
    bytes: new TextEncoder().encode("hello offline"),
  });
  const page = {
    id: "page.demo",
    title: "离线演示",
    icon: "✦",
    kind: "page",
    revision: 2,
    updatedAt: "2026-07-21T08:00:00.000Z",
    properties: { 状态: "已验证", 标签: ["离线", "安全"] },
    blocks: [
      { id: "block.heading", type: "heading", content: "完整页面" },
      { id: "block.text", type: "text", content: "Markdown 与块结构必须一致。" },
      { id: "block.todo", type: "todo", content: "校验附件", checked: true },
      { id: "block.code", type: "code", content: "console.log('ok')", language: "javascript" },
      { id: "block.file", type: "file", content: "hello.txt", assetId: asset.id },
    ],
  };
  const source = await createSophiePackage(page, [asset]);
  const parsed = await offlinePackage.read(source);
  assert.deepEqual(parsed.page, page);
  assert.equal(parsed.assets[0].name, "hello.txt");
});

test("offline parser rejects tampered page and attachment data", async () => {
  const asset = await createSophieAsset({
    id: "asset.tamper",
    name: "proof.txt",
    mime: "text/plain",
    bytes: new TextEncoder().encode("original"),
  });
  const page = {
    id: "page.tamper",
    title: "原始页面",
    kind: "page",
    revision: 1,
    updatedAt: "2026-07-21T08:00:00.000Z",
    properties: {},
    blocks: [{ id: "block.file", type: "file", content: "proof.txt", assetId: asset.id }],
  };
  const source = await createSophiePackage(page, [asset]);
  const newline = source.indexOf("\n");
  const pageTamper = JSON.parse(source.slice(newline + 1));
  pageTamper.page.title = "被篡改";
  await assert.rejects(() => offlinePackage.read(`SOPHIE/1\n${JSON.stringify(pageTamper)}`), /清单与页面不一致/);

  const assetTamper = JSON.parse(source.slice(newline + 1));
  assetTamper.assets[0].data = btoa("modified");
  await assert.rejects(() => offlinePackage.read(`SOPHIE/1\n${JSON.stringify(assetTamper)}`), /校验失败/);
});
