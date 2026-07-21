export const SOPHIE_MAGIC = "SOPHIE/1";
const MAX_PACKAGE_CHARACTERS = 96 * 1024 * 1024;
const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 64 * 1024 * 1024;

export type SophieBlock = {
  id: string;
  type: "text" | "heading" | "todo" | "quote" | "callout" | "code" | "bulleted-list" | "numbered-list" | "toggle" | "divider" | "image" | "file" | "page-reference" | "database";
  content: string;
  checked?: boolean;
  language?: string;
  assetId?: string;
  url?: string;
};

export type SophiePage = {
  id: string;
  title: string;
  icon?: string;
  kind: string;
  revision: number;
  updatedAt: string;
  properties: Record<string, string | number | boolean | string[]>;
  blocks: SophieBlock[];
};

export type SophiePackageAsset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  data: string;
};

type SophieContainer = {
  format: "application/x-sophie-page";
  version: 1;
  manifest: {
    packageId: string;
    exportedAt: string;
    pageId: string;
    title: string;
    contentSha256: string;
    assetCount?: number;
    assetsSha256?: string;
  };
  page: SophiePage & { markdown: string };
  assets: SophiePackageAsset[];
};

function assertStableId(value: string, label: string) {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new Error(`${label} 格式无效`);
}

function yamlValue(value: string | number | boolean | string[]) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function codeFence(content: string) {
  const longest = Math.max(0, ...(content.match(/`+/g)?.map((run) => run.length) ?? []));
  return "`".repeat(Math.max(3, longest + 1));
}

export function blocksToMarkdown(page: SophiePage) {
  assertStableId(page.id, "页面 id");
  if (!page.kind.trim() || page.kind.length > 80) throw new Error("页面 kind 格式无效");
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
    assertStableId(block.id, "块 id");
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
    if (block.type === "page-reference") return `${meta}\n[[${block.content}]]`;
    if (block.type === "database") return `${meta}\n{{database:${block.content}}}`;
    if (block.type === "code") {
      const fence = codeFence(block.content);
      return `${meta}\n${fence}${block.language ?? "text"}\n${block.content}\n${fence}`;
    }
    return `${meta}\n${block.content}`;
  }).join("\n\n");

  return `${frontmatter}${body}\n`;
}

function parseMarkdownScalar(source: string): string | number | boolean | string[] {
  const value = source.trim();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") return parsed;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch { /* Legacy unquoted Markdown value. */ }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function frontmatterField(frontmatter: string, name: string) {
  const match = frontmatter.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
  return match ? parseMarkdownScalar(match[1]) : undefined;
}

function blockContent(type: SophieBlock["type"], raw: string) {
  if (type === "heading") return raw.replace(/^##\s?/, "");
  if (type === "todo") return raw.replace(/^-\s+\[[ xX]\]\s?/, "");
  if (type === "bulleted-list") return raw.replace(/^-\s?/, "");
  if (type === "numbered-list") return raw.replace(/^1\.\s?/, "");
  if (type === "quote") return raw.replace(/^>\s?/, "");
  if (type === "callout") return raw.replace(/^> \[!NOTE\]\r?\n>\s?/, "");
  if (type === "toggle") return raw.match(/^<details><summary>([\s\S]*)<\/summary><\/details>$/)?.[1] ?? raw;
  if (type === "divider") return "";
  if (type === "image") return raw.match(/^!\[([\s\S]*?)\]\(sophie-asset:/)?.[1] ?? "";
  if (type === "file") return raw.match(/^\[([\s\S]*?)\]\(sophie-asset:/)?.[1] ?? "";
  if (type === "page-reference") return raw.match(/^\[\[([\s\S]*)\]\]$/)?.[1] ?? raw;
  if (type === "database") return raw.match(/^\{\{database:([\s\S]*)\}\}$/)?.[1] ?? raw;
  return raw;
}

export function parseSophiePageMarkdown(markdown: string): SophiePage {
  const envelope = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!envelope) throw new Error("页面 Markdown 缺少 SuperSophie frontmatter");
  const frontmatter = envelope[1];
  const id = String(frontmatterField(frontmatter, "id") ?? "");
  const title = String(frontmatterField(frontmatter, "title") ?? "");
  const kind = String(frontmatterField(frontmatter, "kind") ?? "page");
  const revision = Number(frontmatterField(frontmatter, "revision") ?? 1);
  const updatedAt = String(frontmatterField(frontmatter, "updatedAt") ?? new Date(0).toISOString());
  assertStableId(id, "页面 id");
  if (!title || !kind || !Number.isInteger(revision) || revision < 1 || Number.isNaN(Date.parse(updatedAt))) throw new Error("页面 Markdown frontmatter 无效");

  const properties: SophiePage["properties"] = {};
  const propertySection = frontmatter.match(/(?:^|\r?\n)properties:\r?\n([\s\S]*)$/)?.[1] ?? "";
  for (const line of propertySection.split(/\r?\n/)) {
    const match = line.match(/^\s{2}("(?:\\.|[^"\\])*"|[^:]+):\s*(.*)$/);
    if (!match || match[1] === "{}") continue;
    let key = match[1].trim();
    try { key = JSON.parse(key) as string; } catch { /* Legacy plain property name. */ }
    if (key) properties[key] = parseMarkdownScalar(match[2]);
  }

  const body = markdown.slice(envelope[0].length);
  const expression = /<!-- sophie:block=([A-Za-z0-9._:-]+) type=([a-z-]+)(?: checked=(true|false))?(?: asset=([A-Za-z0-9._:-]+))? -->\r?\n/g;
  const matches = [...body.matchAll(expression)];
  const validTypes = new Set<SophieBlock["type"]>(["text", "heading", "todo", "quote", "callout", "code", "bulleted-list", "numbered-list", "toggle", "divider", "image", "file", "page-reference", "database"]);
  const blocks = matches.map((match, index): SophieBlock => {
    const type = match[2] as SophieBlock["type"];
    if (!validTypes.has(type)) throw new Error(`页面包含不支持的块类型：${match[2]}`);
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? body.length : body.length;
    let raw = body.slice(start, end);
    raw = index + 1 < matches.length ? raw.replace(/\r?\n\r?\n$/, "") : raw.replace(/\r?\n$/, "");
    const block: SophieBlock = { id: match[1], type, content: blockContent(type, raw) };
    assertStableId(block.id, "块 id");
    if (type === "todo") block.checked = match[3] === "true";
    if (type === "image" || type === "file") block.assetId = match[4];
    if (type === "code") {
      const code = raw.match(/^(`{3,})([^\r\n]*)\r?\n([\s\S]*?)\r?\n\1$/);
      block.language = code?.[2] || "text";
      block.content = code?.[3] ?? raw;
    }
    return block;
  });
  return { id, title, kind, revision, updatedAt, properties, blocks };
}

function legacyBlocksToMarkdown(page: SophiePage) {
  const properties = Object.entries(page.properties).map(([key, value]) => `  ${key}: ${yamlValue(value)}`).join("\n");
  const frontmatter = ["---", "sophie: 1", `id: ${page.id}`, `title: ${JSON.stringify(page.title)}`, `kind: ${page.kind}`, `revision: ${page.revision}`, "properties:", properties || "  {}", "---", ""].join("\n");
  const body = page.blocks.map((block) => {
    const meta = `<!-- sophie:block=${block.id} type=${block.type} -->`;
    if (block.type === "heading") return `${meta}\n## ${block.content}`;
    if (block.type === "todo") return `${meta}\n- [${block.checked ? "x" : " "}] ${block.content}`;
    if (block.type === "quote") return `${meta}\n> ${block.content}`;
    if (block.type === "callout") return `${meta}\n> [!NOTE]\n> ${block.content}`;
    if (block.type === "code") return `${meta}\n\`\`\`${block.language ?? "text"}\n${block.content}\n\`\`\``;
    return `${meta}\n${block.content}`;
  }).join("\n\n");
  return `${frontmatter}${body}\n`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("附件 Base64 数据无效");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Bytes(bytes: Uint8Array) {
  const material = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", material);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(input: string) {
  return sha256Bytes(new TextEncoder().encode(input));
}

function assertAssetMetadata(asset: Pick<SophiePackageAsset, "id" | "name" | "mime" | "size">) {
  assertStableId(asset.id, "附件 id");
  if (!asset.name || asset.name.length > 240 || /[\\/\0]/.test(asset.name) || asset.name === "." || asset.name === "..") throw new Error("附件名称无效");
  if (!/^[\w.+-]+\/[\w.+-]+$/i.test(asset.mime) || asset.mime.length > 120) throw new Error("附件 MIME 类型无效");
  if (!Number.isInteger(asset.size) || asset.size < 0 || asset.size > MAX_ASSET_BYTES) throw new Error("单个附件超过 32 MB 限制");
}

function assetManifestSource(assets: SophiePackageAsset[]) {
  return assets.map((asset) => `${asset.id}\0${asset.name}\0${asset.mime}\0${asset.size}\0${asset.sha256}`).join("\n");
}

export async function createSophieAsset(input: { id?: string; name: string; mime: string; bytes: ArrayBuffer | Uint8Array }) {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  const asset: SophiePackageAsset = {
    id: input.id || crypto.randomUUID(),
    name: input.name,
    mime: input.mime || "application/octet-stream",
    size: bytes.byteLength,
    sha256: await sha256Bytes(bytes),
    data: bytesToBase64(bytes),
  };
  assertAssetMetadata(asset);
  return asset;
}

export function sophieAssetDataUrl(asset: SophiePackageAsset) {
  assertAssetMetadata(asset);
  return `data:${asset.mime};base64,${asset.data}`;
}

export async function createSophiePackage(page: SophiePage, assets: SophiePackageAsset[] = []) {
  const markdown = blocksToMarkdown(page);
  const uniqueIds = new Set<string>();
  let totalSize = 0;
  for (const asset of assets) {
    assertAssetMetadata(asset);
    if (uniqueIds.has(asset.id)) throw new Error("附件 id 不能重复");
    uniqueIds.add(asset.id);
    const bytes = base64ToBytes(asset.data);
    if (bytes.byteLength !== asset.size || await sha256Bytes(bytes) !== asset.sha256) throw new Error(`附件 ${asset.name} 校验失败`);
    totalSize += asset.size;
  }
  if (totalSize > MAX_TOTAL_ASSET_BYTES) throw new Error("附件总大小超过 64 MB 限制");
  for (const block of page.blocks) {
    if ((block.type === "image" || block.type === "file") && (!block.assetId || !uniqueIds.has(block.assetId))) {
      throw new Error(`块 ${block.id} 引用了不存在的附件`);
    }
  }
  const container: SophieContainer = {
    format: "application/x-sophie-page",
    version: 1,
    manifest: {
      packageId: crypto.randomUUID(),
      exportedAt: new Date().toISOString(),
      pageId: page.id,
      title: page.title,
      contentSha256: await sha256(markdown),
      assetCount: assets.length,
      assetsSha256: await sha256(assetManifestSource(assets)),
    },
    page: { ...page, markdown },
    assets,
  };
  return `${SOPHIE_MAGIC}\n${JSON.stringify(container)}`;
}

export async function readSophiePackageWithAssets(source: string): Promise<{ page: SophiePage; assets: SophiePackageAsset[] }> {
  if (source.length > MAX_PACKAGE_CHARACTERS) throw new Error(".sophie 文件超过当前 96 MB 解析限制");
  const newline = source.indexOf("\n");
  if (newline < 0 || source.slice(0, newline).trim() !== SOPHIE_MAGIC) throw new Error("这不是受支持的 .sophie 文件");
  let container: SophieContainer;
  try { container = JSON.parse(source.slice(newline + 1)) as SophieContainer; }
  catch { throw new Error(".sophie 容器 JSON 已损坏"); }
  if (container.format !== "application/x-sophie-page" || container.version !== 1 || !container.page || !Array.isArray(container.assets)) {
    throw new Error("这个 .sophie 版本尚不受支持");
  }
  if (container.manifest.pageId !== container.page.id || container.manifest.title !== container.page.title) throw new Error("文件清单与页面不一致");
  const { markdown, ...page } = container.page;
  const reconstructed = blocksToMarkdown(page);
  if (reconstructed !== markdown && legacyBlocksToMarkdown(page) !== markdown) throw new Error("页面块结构与 Markdown 真相源不一致");
  const actualHash = await sha256(markdown);
  if (actualHash !== container.manifest.contentSha256) throw new Error("文件校验失败，内容可能已损坏");

  const ids = new Set<string>();
  let totalSize = 0;
  for (const asset of container.assets) {
    assertAssetMetadata(asset);
    if (ids.has(asset.id)) throw new Error("附件 id 重复");
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
  return { page, assets: container.assets };
}

export async function readSophiePackage(source: string): Promise<SophiePage> {
  return (await readSophiePackageWithAssets(source)).page;
}

export function downloadSophiePackage(content: string, title: string) {
  const blob = new Blob([content], { type: "application/x-sophie-page;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[\\/:*?\"<>|]/g, "-") || "page"}.sophie`;
  anchor.click();
  URL.revokeObjectURL(url);
}
