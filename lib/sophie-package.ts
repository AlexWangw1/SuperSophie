export const SOPHIE_MAGIC = "SOPHIE/1";

export type SophieBlock = {
  id: string;
  type: "text" | "heading" | "todo" | "quote" | "callout" | "code";
  content: string;
  checked?: boolean;
  language?: string;
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

type SophieContainer = {
  format: "application/x-sophie-page";
  version: 1;
  manifest: {
    packageId: string;
    exportedAt: string;
    pageId: string;
    title: string;
    contentSha256: string;
  };
  page: SophiePage & { markdown: string };
  assets: Array<{
    name: string;
    mime: string;
    sha256: string;
    data: string;
  }>;
};

function yamlValue(value: string | number | boolean | string[]) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

export function blocksToMarkdown(page: SophiePage) {
  const properties = Object.entries(page.properties)
    .map(([key, value]) => `  ${key}: ${yamlValue(value)}`)
    .join("\n");
  const frontmatter = [
    "---",
    "sophie: 1",
    `id: ${page.id}`,
    `title: ${JSON.stringify(page.title)}`,
    `kind: ${page.kind}`,
    `revision: ${page.revision}`,
    "properties:",
    properties || "  {}",
    "---",
    "",
  ].join("\n");

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

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSophiePackage(page: SophiePage) {
  const markdown = blocksToMarkdown(page);
  const container: SophieContainer = {
    format: "application/x-sophie-page",
    version: 1,
    manifest: {
      packageId: crypto.randomUUID(),
      exportedAt: new Date().toISOString(),
      pageId: page.id,
      title: page.title,
      contentSha256: await sha256(markdown),
    },
    page: { ...page, markdown },
    assets: [],
  };
  return `${SOPHIE_MAGIC}\n${JSON.stringify(container)}`;
}

export async function readSophiePackage(source: string): Promise<SophiePage> {
  const [magic, ...payload] = source.split("\n");
  if (magic.trim() !== SOPHIE_MAGIC) throw new Error("这不是受支持的 .sophie 文件");
  const container = JSON.parse(payload.join("\n")) as SophieContainer;
  if (container.format !== "application/x-sophie-page" || container.version !== 1) {
    throw new Error("这个 .sophie 版本尚不受支持");
  }
  const actualHash = await sha256(container.page.markdown);
  if (actualHash !== container.manifest.contentSha256) throw new Error("文件校验失败，内容可能已损坏");
  const { markdown: _markdown, ...page } = container.page;
  return page;
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

