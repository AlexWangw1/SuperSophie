const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  json: "json", md: "markdown", css: "css", html: "html", py: "python", rs: "rust", go: "go",
  java: "java", kt: "kotlin", swift: "swift", sh: "shell", ps1: "powershell", sql: "sql", yaml: "yaml", yml: "yaml",
};

export function normalizeCodePath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.length > 240 || normalized.startsWith("/") || normalized.includes("\0")) throw new Error("文件路径无效");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("文件路径不能包含空段或相对跳转");
  return segments.join("/");
}

export function languageForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() || "";
  return LANGUAGE_BY_EXTENSION[extension] || "text";
}

function codeFenceFor(content: string) {
  const runs = content.match(/`+/g)?.map((run) => run.length) ?? [];
  return "`".repeat(Math.max(3, ...runs.map((length) => length + 1)));
}

export function buildCodeFileMarkdown(input: { id: string; projectId: string; path: string; language?: string; content: string; revision: number }) {
  const path = normalizeCodePath(input.path);
  const language = input.language || languageForPath(path);
  const fence = codeFenceFor(input.content);
  return [
    "---",
    "sophie: 1",
    `id: ${input.id}`,
    "kind: code-file",
    `projectId: ${input.projectId}`,
    `path: ${JSON.stringify(path)}`,
    `language: ${language}`,
    `revision: ${input.revision}`,
    "---",
    "",
    `${fence}${language === "text" ? "" : language}`,
    input.content,
    fence,
    "",
  ].join("\n");
}
