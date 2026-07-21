import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";
import { ModelNotConfiguredError, redactModelSecrets } from "../../../lib/agents/model-catalog";
import { buildAgentRunMarkdown, buildConversationMarkdown } from "../../../lib/agents/run-markdown";
import { runSophie, shouldUseTeam } from "../../../lib/agents/runtime";
import { ChatRequestSchema, type SophieRunResult } from "../../../lib/agents/types";
import { workspaceModelBindings } from "../../../lib/agents/workspace-models";
import { authErrorResponse, requireWorkspace } from "../../../lib/auth";
import { scopedResourceId } from "../../../lib/workspace-resource";

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  contentMarkdown: string;
  runId: string | null;
  createdAt: string;
};

const bindings = env as unknown as Record<string, unknown>;

function titleFromMessage(message: string) {
  const title = message.replace(/^\/(team|agent)\s*/i, "").replace(/\s+/g, " ").trim();
  return title.slice(0, 48) || "与 Sophie 的对话";
}

function publicError(error: unknown, runtimeBindings: Record<string, unknown> = bindings) {
  const message = error instanceof Error ? error.message : "Sophie 暂时无法完成这次请求。";
  return redactModelSecrets(message, runtimeBindings).slice(0, 600);
}

async function addMessage(conversationId: string, role: "user" | "assistant", content: string, runId?: string) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO chat_messages (id, conversation_id, role, content_markdown, run_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, conversationId, role, content, runId ?? null).run();
  return id;
}

async function saveDocument(workspaceId: string, id: string, title: string, kind: string, markdown: string, properties: Record<string, unknown>) {
  const storedId = scopedResourceId(workspaceId, id);
  await env.DB.prepare(
    `INSERT INTO documents
      (id, workspace_id, title, icon, kind, markdown, properties_json, revision, updated_at)
     VALUES (?, ?, ?, '✦', ?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       kind = excluded.kind,
       markdown = excluded.markdown,
       properties_json = excluded.properties_json,
       revision = documents.revision + 1,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(storedId, workspaceId, title, kind, markdown, JSON.stringify(properties)).run();
}

async function syncConversationDocument(workspaceId: string, conversationId: string, title: string) {
  const result = await env.DB.prepare(
    `SELECT role, content_markdown AS contentMarkdown, created_at AS createdAt
     FROM chat_messages WHERE conversation_id = ? ORDER BY created_at, id`,
  ).bind(conversationId).all<{ role: string; contentMarkdown: string; createdAt: string }>();
  const updatedAt = new Date().toISOString();
  const markdown = buildConversationMarkdown({ conversationId, title, updatedAt, messages: result.results });
  await saveDocument(workspaceId, `conversation-${conversationId}`, title, "conversation", markdown, { conversationId });
}

async function startAgentRun(workspaceId: string, runId: string, goal: string, modelId: string) {
  await env.DB.prepare(
    `INSERT INTO agent_runs (id, workspace_id, name, goal_markdown, model, status, approval)
     VALUES (?, ?, 'Sophie', ?, ?, 'running', 'review-side-effects')`,
  ).bind(runId, workspaceId, goal, modelId).run();
}

async function finishAgentRun(workspaceId: string, runId: string, conversationId: string, goal: string, createdAt: string, result: SophieRunResult) {
  await env.DB.prepare(
    `UPDATE agent_runs SET model = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(result.modelId, runId).run();

  if (result.team) {
    await env.DB.prepare(
      `INSERT INTO agent_run_events (id, run_id, agent_name, event_type, content_markdown)
       VALUES (?, ?, 'Sophie', 'team-plan', ?)`,
    ).bind(crypto.randomUUID(), runId, `# 团队计划\n\n${result.team.summary}\n\n${result.team.strategy}`).run();
  }

  for (const member of result.specialists ?? []) {
    await env.DB.prepare(
      `INSERT INTO agent_runs (id, parent_id, workspace_id, name, goal_markdown, model, status, approval)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'auto')`,
    ).bind(member.id, runId, workspaceId, member.name, member.deliverable, member.modelId, member.status).run();
    await env.DB.prepare(
      `INSERT INTO agent_run_events (id, run_id, agent_name, event_type, content_markdown)
       VALUES (?, ?, ?, 'specialist-output', ?)`,
    ).bind(crypto.randomUUID(), runId, member.name, member.output).run();
  }

  const markdown = buildAgentRunMarkdown({ runId, conversationId, goal, createdAt, result });
  await saveDocument(workspaceId, `agent-run-${runId}`, goal.slice(0, 80), "agent-run", markdown, {
    runId,
    conversationId,
    status: "completed",
    modelId: result.modelId,
  });
}

async function failAgentRun(workspaceId: string, runId: string, conversationId: string, goal: string, createdAt: string, error: string) {
  await env.DB.prepare(
    `UPDATE agent_runs SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(runId).run();
  const markdown = buildAgentRunMarkdown({ runId, conversationId, goal, createdAt, error });
  await saveDocument(workspaceId, `agent-run-${runId}`, goal.slice(0, 80), "agent-run", markdown, {
    runId,
    conversationId,
    status: "failed",
  });
}

export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request);
    await ensureSchema();
    const url = new URL(request.url);
    let conversationId = url.searchParams.get("conversationId");
    if (!conversationId && url.searchParams.get("latest") === "1") {
      const latest = await env.DB.prepare(
        `SELECT id FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1`,
      ).bind(workspaceId).first<{ id: string }>();
      conversationId = latest?.id ?? null;
    }
    if (!conversationId) {
      const conversations = await env.DB.prepare(
        `SELECT id, title, model_id AS modelId, updated_at AS updatedAt
         FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 30`,
      ).bind(workspaceId).all();
      return Response.json({ conversations: conversations.results });
    }
    conversationId = scopedResourceId(workspaceId, conversationId);
    const conversation = await env.DB.prepare(
      `SELECT id, title, model_id AS modelId, updated_at AS updatedAt
       FROM conversations WHERE id = ? AND workspace_id = ?`,
    ).bind(conversationId, workspaceId).first();
    if (!conversation) return Response.json({ error: "conversation_not_found" }, { status: 404 });
    const messages = await env.DB.prepare(
      `SELECT id, role, content_markdown AS contentMarkdown, run_id AS runId, created_at AS createdAt
       FROM chat_messages WHERE conversation_id = ? ORDER BY created_at, id LIMIT 200`,
    ).bind(conversationId).all<StoredMessage>();
    return Response.json({ conversation, messages: messages.results });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: publicError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "请求格式不正确", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  let conversationId = input.conversationId ?? crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const title = titleFromMessage(input.message);
  const isTeamRun = input.mode === "team" || (input.mode === "auto" && shouldUseTeam(input.message));
  const runId = isTeamRun ? crypto.randomUUID() : undefined;
  let workspaceId: string | undefined;
  let runtimeBindings = bindings;

  try {
    const context = await requireWorkspace(request, { write: true });
    workspaceId = context.workspaceId;
    conversationId = scopedResourceId(workspaceId, conversationId);
    await ensureSchema();
    await env.DB.prepare(
      `INSERT INTO conversations (id, workspace_id, title, model_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    ).bind(conversationId, workspaceId, title, input.modelId ?? "auto").run();
    await addMessage(conversationId, "user", input.message, runId);
    if (runId) await startAgentRun(workspaceId, runId, input.message, input.modelId ?? "auto");

    runtimeBindings = (await workspaceModelBindings(env.DB, workspaceId, bindings)).bindings;
    const result = await runSophie(input, runtimeBindings);
    const assistantMessageId = await addMessage(conversationId, "assistant", result.reply, runId);
    await env.DB.prepare(
      `UPDATE conversations SET model_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?`,
    ).bind(result.modelId, conversationId, workspaceId).run();
    if (runId) await finishAgentRun(workspaceId, runId, conversationId, input.message, createdAt, result);
    await syncConversationDocument(workspaceId, conversationId, title);

    return Response.json({
      conversationId,
      message: { id: assistantMessageId, role: "assistant", content: result.reply, createdAt: new Date().toISOString() },
      run: runId ? {
        id: runId,
        mode: result.mode,
        modelId: result.modelId,
        team: result.team,
        specialists: result.specialists,
        status: "completed",
      } : undefined,
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const message = publicError(error, runtimeBindings);
    if (runId && workspaceId) await failAgentRun(workspaceId, runId, conversationId, input.message, createdAt, message).catch(() => undefined);
    if (workspaceId) await addMessage(conversationId, "assistant", message, runId).catch(() => undefined);
    if (workspaceId) await syncConversationDocument(workspaceId, conversationId, title).catch(() => undefined);
    const status = error instanceof ModelNotConfiguredError ? 503 : 500;
    return Response.json({
      error: message,
      code: error instanceof ModelNotConfiguredError ? error.code : "AGENT_RUN_FAILED",
      conversationId,
      runId,
    }, { status });
  }
}
