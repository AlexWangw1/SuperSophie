import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../db/ensure";
import { buildCodeFileMarkdown, languageForPath, normalizeCodePath } from "../../../lib/code-files";

const DEFAULT_PROJECT_ID = "code-project-default";
const defaultFiles = [
  { path: "README.md", content: "# SuperSophie Cloud Code\n\n这些代码文件以 Markdown 包装形式保存到 App Cloud，可跨设备编辑。网页端不执行本机命令。\n" },
  { path: "src/index.ts", content: "export function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n" },
  { path: "src/index.test.ts", content: "import { greet } from \"./index\";\n\nconsole.assert(greet(\"Sophie\") === \"Hello, Sophie!\");\n" },
];

const SaveSchema = z.object({
  action: z.literal("save"),
  file: z.object({
    id: z.string().min(1),
    content: z.string().max(512_000),
    baseRevision: z.number().int().positive(),
  }),
});

const CreateSchema = z.object({
  action: z.literal("create"),
  path: z.string().min(1).max(240),
  content: z.string().max(512_000).default(""),
});

async function ensureDefaultProject() {
  await ensureSchema();
  const created = await env.DB.prepare(
    `INSERT OR IGNORE INTO code_projects (id, workspace_id, name) VALUES (?, 'default', 'SuperSophie Cloud Code')`,
  ).bind(DEFAULT_PROJECT_ID).run() as { meta?: { changes?: number } };
  if (!created.meta?.changes) return;
  await env.DB.batch(defaultFiles.map((file, index) => {
      const id = `code-file-default-${index + 1}`;
      const language = languageForPath(file.path);
      const markdown = buildCodeFileMarkdown({ id, projectId: DEFAULT_PROJECT_ID, path: file.path, language, content: file.content, revision: 1 });
      return env.DB.prepare(
        `INSERT OR IGNORE INTO code_files (id, project_id, path, language, content_markdown, content_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(id, DEFAULT_PROJECT_ID, file.path, language, markdown, file.content);
    }));
}

export async function GET() {
  await ensureDefaultProject();
  const [project, files] = await Promise.all([
    env.DB.prepare(`SELECT id, name, updated_at AS updatedAt FROM code_projects WHERE id = ?`).bind(DEFAULT_PROJECT_ID).first(),
    env.DB.prepare(
      `SELECT id, path, language, content_text AS content, revision, updated_at AS updatedAt
       FROM code_files WHERE project_id = ? ORDER BY path`,
    ).bind(DEFAULT_PROJECT_ID).all(),
  ]);
  return Response.json({ project, files: files.results, execution: { available: false, reason: "网页端只编辑云端代码；请在桌面端选择本地项目后运行命令。" } });
}

export async function POST(request: Request) {
  try {
    await ensureDefaultProject();
    const raw = await request.json();
    if ((raw as { action?: string }).action === "save") {
      const payload = SaveSchema.parse(raw);
      const current = await env.DB.prepare(
        `SELECT path, language, revision FROM code_files WHERE id = ? AND project_id = ? LIMIT 1`,
      ).bind(payload.file.id, DEFAULT_PROJECT_ID).first<{ path: string; language: string; revision: number }>();
      if (!current) return Response.json({ error: "代码文件不存在" }, { status: 404 });
      if (current.revision !== payload.file.baseRevision) return Response.json({ error: "文件已在另一设备更新", code: "REVISION_CONFLICT", currentRevision: current.revision }, { status: 409 });
      const revision = current.revision + 1;
      const markdown = buildCodeFileMarkdown({ id: payload.file.id, projectId: DEFAULT_PROJECT_ID, path: current.path, language: current.language, content: payload.file.content, revision });
      const result = await env.DB.prepare(
        `UPDATE code_files SET content_text = ?, content_markdown = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND project_id = ? AND revision = ?`,
      ).bind(payload.file.content, markdown, revision, payload.file.id, DEFAULT_PROJECT_ID, current.revision).run() as { meta?: { changes?: number } };
      if (!result.meta?.changes) return Response.json({ error: "文件已在另一设备更新", code: "REVISION_CONFLICT" }, { status: 409 });
      await env.DB.prepare(`UPDATE code_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(DEFAULT_PROJECT_ID).run();
      return Response.json({ id: payload.file.id, revision, markdown });
    }

    const payload = CreateSchema.parse(raw);
    const path = normalizeCodePath(payload.path);
    const id = crypto.randomUUID();
    const language = languageForPath(path);
    const markdown = buildCodeFileMarkdown({ id, projectId: DEFAULT_PROJECT_ID, path, language, content: payload.content, revision: 1 });
    await env.DB.prepare(
      `INSERT INTO code_files (id, project_id, path, language, content_markdown, content_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, DEFAULT_PROJECT_ID, path, language, markdown, payload.content).run();
    return Response.json({ file: { id, path, language, content: payload.content, revision: 1 } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || "代码文件格式无效" }, { status: 400 });
    const message = error instanceof Error ? error.message : "代码文件保存失败";
    if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "该路径已经存在" }, { status: 409 });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "文件 id 必填" }, { status: 400 });
  await ensureDefaultProject();
  const result = await env.DB.prepare(`DELETE FROM code_files WHERE id = ? AND project_id = ?`).bind(id, DEFAULT_PROJECT_ID).run() as { meta?: { changes?: number } };
  if (!result.meta?.changes) return Response.json({ error: "代码文件不存在" }, { status: 404 });
  return Response.json({ id, deleted: true });
}
