import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../db/ensure";
import { SOCIAL_CHANNELS } from "../../../lib/connectors/types";

const QueueMessageSchema = z.object({
  channel: z.enum(SOCIAL_CHANNELS),
  target: z.string().trim().min(1).max(180),
  markdown: z.string().trim().min(1).max(4000),
  metadata: z.object({ targetKind: z.enum(["group", "user"]).optional() }).optional(),
});

const ReviewActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

export async function GET() {
  await ensureSchema();
  const result = await env.DB.prepare(
    `SELECT o.id, o.channel, o.payload_markdown AS payloadMarkdown, o.status,
      o.created_at AS createdAt, o.sent_at AS sentAt,
      COALESCE(d.target, '') AS target, COALESCE(d.metadata_json, '{}') AS metadataJson,
      (SELECT a.response_markdown FROM connector_delivery_attempts a
       WHERE a.outbox_id = o.id ORDER BY a.created_at DESC LIMIT 1) AS lastAttemptMarkdown
     FROM connector_outbox o
     LEFT JOIN connector_outbox_details d ON d.outbox_id = o.id
     WHERE o.workspace_id = ? ORDER BY o.created_at DESC LIMIT 50`,
  ).bind("default").all();
  return Response.json({ messages: result.results });
}

export async function POST(request: Request) {
  try {
    const payload = QueueMessageSchema.parse(await request.json());
    await ensureSchema();
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO connector_outbox (id, workspace_id, channel, payload_markdown, status)
         VALUES (?, 'default', ?, ?, 'review')`,
      ).bind(id, payload.channel, payload.markdown),
      env.DB.prepare(
        `INSERT INTO connector_outbox_details (outbox_id, target, metadata_json) VALUES (?, ?, ?)`,
      ).bind(id, payload.target, JSON.stringify(payload.metadata ?? {})),
    ]);
    return Response.json({ id, status: "review" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "消息格式无效" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create message" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = ReviewActionSchema.parse(await request.json());
    await ensureSchema();
    const nextStatus = payload.action === "approve" ? "approved" : "rejected";
    const allowed = payload.action === "approve" ? ["review", "failed"] : ["review", "approved", "failed"];
    const placeholders = allowed.map(() => "?").join(", ");
    const result = await env.DB.prepare(
      `UPDATE connector_outbox SET status = ? WHERE id = ? AND workspace_id = 'default' AND status IN (${placeholders})`,
    ).bind(nextStatus, payload.id, ...allowed).run() as { meta?: { changes?: number } };
    if (!result.meta?.changes) return Response.json({ error: "消息不存在或当前状态不能执行该操作" }, { status: 409 });
    return Response.json({ id: payload.id, status: nextStatus });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "审核操作无效" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to review message" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return Response.json({ error: "消息 id 无效" }, { status: 400 });
  await ensureSchema();
  const row = await env.DB.prepare(
    `SELECT status FROM connector_outbox WHERE id = ? AND workspace_id = 'default' LIMIT 1`,
  ).bind(id).first<{ status: string }>();
  if (!row) return Response.json({ error: "消息不存在" }, { status: 404 });
  if (["sent", "sending"].includes(row.status)) return Response.json({ error: "发送中或已发送的审计记录不能删除" }, { status: 409 });
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM connector_delivery_attempts WHERE outbox_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM connector_outbox_details WHERE outbox_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM connector_outbox WHERE id = ? AND workspace_id = 'default'`).bind(id),
  ]);
  return Response.json({ id, deleted: true });
}
