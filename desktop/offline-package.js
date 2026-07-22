(function exposeOfflinePackage(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SophieOfflinePackage = api;
}(typeof window !== "undefined" ? window : globalThis, function createOfflinePackageApi() {
  "use strict";

  const SOPHIE_MAGIC = "SOPHIE/1";
  const MAX_PACKAGE_CHARACTERS = 96 * 1024 * 1024;
  const MAX_ASSET_BYTES = 32 * 1024 * 1024;
  const MAX_TOTAL_ASSET_BYTES = 64 * 1024 * 1024;
  const VALID_BLOCK_TYPES = new Set([
    "text", "heading", "todo", "quote", "callout", "code", "bulleted-list", "numbered-list",
    "toggle", "divider", "image", "file", "page-reference", "database",
  ]);

  function assertStableId(value, label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new Error(`${label} 格式无效`);
  }

  function yamlValue(value) {
    if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
    if (typeof value === "string") return JSON.stringify(value);
    return String(value);
  }

  function codeFence(content) {
    const runs = content.match(/`+/g) || [];
    const longest = Math.max(0, ...runs.map((run) => run.length));
    return "`".repeat(Math.max(3, longest + 1));
  }

  function validatePage(page) {
    if (!page || typeof page !== "object") throw new Error("页面数据缺失");
    assertStableId(page.id, "页面 id");
    if (typeof page.title !== "string" || !page.title || page.title.length > 500) throw new Error("页面标题无效");
    if (typeof page.kind !== "string" || !page.kind.trim() || page.kind.length > 80) throw new Error("页面 kind 无效");
    if (!Number.isInteger(page.revision) || page.revision < 1) throw new Error("页面修订号无效");
    if (typeof page.updatedAt !== "string" || Number.isNaN(Date.parse(page.updatedAt))) throw new Error("页面更新时间无效");
    if (!page.properties || typeof page.properties !== "object" || Array.isArray(page.properties)) throw new Error("页面属性无效");
    for (const [key, value] of Object.entries(page.properties)) {
      const scalar = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
      const stringList = Array.isArray(value) && value.every((item) => typeof item === "string");
      if (!key || key.length > 240 || (!scalar && !stringList)) throw new Error("页面属性无效");
    }
    if (!Array.isArray(page.blocks)) throw new Error("页面块列表无效");
    const blockIds = new Set();
    for (const block of page.blocks) {
      if (!block || typeof block !== "object") throw new Error("页面块无效");
      assertStableId(block.id, "块 id");
      if (blockIds.has(block.id)) throw new Error("块 id 不能重复");
      blockIds.add(block.id);
      if (!VALID_BLOCK_TYPES.has(block.type) || typeof block.content !== "string") throw new Error("页面包含不支持的块");
      if (block.url !== undefined) assertStableId(block.url, "页面引用 id");
      if (block.assetId !== undefined) assertStableId(block.assetId, "附件 id");
      if (block.language !== undefined && (typeof block.language !== "string" || block.language.length > 80)) throw new Error("代码语言无效");
    }
  }

  function blocksToMarkdown(page) {
    validatePage(page);
    const properties = Object.entries(page.properties)
      .map(([key, value]) => `  ${JSON.stringify(key)}: ${yamlValue(value)}`)
      .join("\n");
    const frontmatter = [
      "---",
      "sophie: 1",
      `id: ${JSON.stringify(page.id)}`,
      `title: ${JSON.stringify(page.title)}`,
      `kind: ${JSON.stringify(page.kind)}`,
      `revision: ${page.revision}`,
      `updatedAt: ${JSON.stringify(page.updatedAt)}`,
      "properties:",
      properties || "  {}",
      "---",
      "",
    ].join("\n");
    const body = page.blocks.map((block) => {
      const details = [
        `sophie:block=${block.id}`,
        `type=${block.type}`,
        block.type === "todo" ? `checked=${Boolean(block.checked)}` : undefined,
        block.assetId ? `asset=${block.assetId}` : undefined,
      ].filter(Boolean).join(" ");
      const meta = `<!-- ${details} -->`;
      if (block.type === "heading") return `${meta}\n## ${block.content}`;
      if (block.type === "todo") return `${meta}\n- [${block.checked ? "x" : " "}] ${block.content}`;
      if (block.type === "bulleted-list") return `${meta}\n- ${block.content}`;
      if (block.type === "numbered-list") return `${meta}\n1. ${block.content}`;
      if (block.type === "quote") return `${meta}\n> ${block.content}`;
      if (block.type === "callout") return `${meta}\n> [!NOTE]\n> ${block.content}`;
      if (block.type === "toggle") return `${meta}\n<details><summary>${block.content}</summary></details>`;
      if (block.type === "divider") return `${meta}\n---`;
      if (block.type === "image") return `${meta}\n![${block.content}](sophie-asset:${block.assetId || "missing"})`;
      if (block.type === "file") return `${meta}\n[${block.content}](sophie-asset:${block.assetId || "missing"})`;
      if (block.type === "page-reference") return `${meta}\n[[${block.content}]]${block.url ? `(sophie-page:${block.url})` : ""}`;
      if (block.type === "database") return `${meta}\n{{database:${block.content}}}`;
      if (block.type === "code") {
        const fence = codeFence(block.content);
        return `${meta}\n${fence}${block.language || "text"}\n${block.content}\n${fence}`;
      }
      return `${meta}\n${block.content}`;
    }).join("\n\n");
    return `${frontmatter}${body}\n`;
  }

  function legacyBlocksToMarkdown(page) {
    const properties = Object.entries(page.properties).map(([key, value]) => `  ${key}: ${yamlValue(value)}`).join("\n");
    const frontmatter = ["---", "sophie: 1", `id: ${page.id}`, `title: ${JSON.stringify(page.title)}`, `kind: ${page.kind}`, `revision: ${page.revision}`, "properties:", properties || "  {}", "---", ""].join("\n");
    const body = page.blocks.map((block) => {
      const meta = `<!-- sophie:block=${block.id} type=${block.type} -->`;
      if (block.type === "heading") return `${meta}\n## ${block.content}`;
      if (block.type === "todo") return `${meta}\n- [${block.checked ? "x" : " "}] ${block.content}`;
      if (block.type === "quote") return `${meta}\n> ${block.content}`;
      if (block.type === "callout") return `${meta}\n> [!NOTE]\n> ${block.content}`;
      if (block.type === "code") return `${meta}\n\`\`\`${block.language || "text"}\n${block.content}\n\`\`\``;
      return `${meta}\n${block.content}`;
    }).join("\n\n");
    return `${frontmatter}${body}\n`;
  }

  function base64ToBytes(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("附件 Base64 数据无效");
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function sha256Bytes(bytes) {
    const material = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await crypto.subtle.digest("SHA-256", material);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function sha256(input) {
    return sha256Bytes(new TextEncoder().encode(input));
  }

  function assertAssetMetadata(asset) {
    if (!asset || typeof asset !== "object") throw new Error("附件数据无效");
    assertStableId(asset.id, "附件 id");
    if (typeof asset.name !== "string" || !asset.name || asset.name.length > 240 || /[\\/\0]/.test(asset.name) || asset.name === "." || asset.name === "..") throw new Error("附件名称无效");
    if (typeof asset.mime !== "string" || !/^[\w.+-]+\/[\w.+-]+$/i.test(asset.mime) || asset.mime.length > 120) throw new Error("附件 MIME 类型无效");
    if (!Number.isInteger(asset.size) || asset.size < 0 || asset.size > MAX_ASSET_BYTES) throw new Error("单个附件超过 32 MB 限制");
    if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("附件摘要无效");
  }

  function assetManifestSource(assets) {
    return assets.map((asset) => `${asset.id}\0${asset.name}\0${asset.mime}\0${asset.size}\0${asset.sha256}`).join("\n");
  }

  async function read(source) {
    if (typeof source !== "string" || source.length > MAX_PACKAGE_CHARACTERS) throw new Error(".sophie 文件超过当前 96 MB 解析限制");
    const newline = source.indexOf("\n");
    if (newline < 0 || source.slice(0, newline).trim() !== SOPHIE_MAGIC) throw new Error("这不是受支持的 .sophie 文件");
    let container;
    try {
      container = JSON.parse(source.slice(newline + 1));
    } catch {
      throw new Error(".sophie 容器 JSON 已损坏");
    }
    if (!container || container.format !== "application/x-sophie-page" || container.version !== 1 || !container.manifest || !container.page || !Array.isArray(container.assets)) {
      throw new Error("这个 .sophie 版本尚不受支持");
    }
    const { markdown, ...page } = container.page;
    validatePage(page);
    if (typeof markdown !== "string") throw new Error("页面 Markdown 缺失");
    if (container.manifest.pageId !== page.id || container.manifest.title !== page.title) throw new Error("文件清单与页面不一致");
    if (blocksToMarkdown(page) !== markdown && legacyBlocksToMarkdown(page) !== markdown) throw new Error("页面块结构与 Markdown 真相源不一致");
    if (await sha256(markdown) !== container.manifest.contentSha256) throw new Error("文件校验失败，内容可能已经损坏");

    const ids = new Set();
    let totalSize = 0;
    for (const asset of container.assets) {
      assertAssetMetadata(asset);
      if (ids.has(asset.id)) throw new Error("附件 id 不能重复");
      ids.add(asset.id);
      const bytes = base64ToBytes(asset.data);
      if (bytes.byteLength !== asset.size || await sha256Bytes(bytes) !== asset.sha256) throw new Error(`附件 ${asset.name} 校验失败`);
      totalSize += bytes.byteLength;
    }
    if (totalSize > MAX_TOTAL_ASSET_BYTES) throw new Error("附件总大小超过 64 MB 限制");
    if (container.manifest.assetCount !== undefined && container.manifest.assetCount !== container.assets.length) throw new Error("附件数量与清单不一致");
    if (container.manifest.assetsSha256 && await sha256(assetManifestSource(container.assets)) !== container.manifest.assetsSha256) throw new Error("附件清单校验失败");
    for (const block of page.blocks) {
      if ((block.type === "image" || block.type === "file") && (!block.assetId || !ids.has(block.assetId))) throw new Error(`块 ${block.id} 引用了不存在的附件`);
    }
    return { page, assets: container.assets, manifest: container.manifest };
  }

  return { SOPHIE_MAGIC, read, blocksToMarkdown, base64ToBytes };
}));
