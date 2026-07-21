import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../../db/ensure";
import {
  deliverConnectorMessage,
  deliveryFailureMarkdown,
  deliveryReceiptMarkdown,
} from "../../../../lib/connectors/delivery";
import { ConnectorDeliveryError, SOCIAL_CHANNELS, type QqTargetKind } from "../../../../lib/connectors/types";
import { workspaceSocialBindings } from "../../../../lib/connectors/workspace-social";
import { authErrorResponse, requireWorkspace } from "../../../../lib/auth";

const SendSchema = z.object({ id: z.string().uuid() });

type OutboxRow = {
  id: string;
  channel: (typeof SOCIAL_CHANNELS)[number];
  payloadMarkdown: string;
  status: string;
  target: string;
  metadataJson: string;
};

export async function POST(request: Request) {
  let outbox: OutboxRow | null = null;
  let workspaceId: string | undefined;
  try {
    workspaceId = (await requireWorkspace(request, { write: true })).workspaceId;
    const payload = SendSchema.parse(await request.json());
    await ensureSchema();
    outbox = await env.DB.prepare(
      `SELECT o.id, o.channel, o.payload_markdown AS payloadMarkdown, o.status,
        d.target, d.metadata_json AS metadataJson
       FROM connector_outbox o JOIN connector_outbox_details d ON d.outbox_id = o.id
       WHERE o.id = ? AND o.workspace_id = ? LIMIT 1`,
    ).bind(payload.id, workspaceId).first<OutboxRow>();
    if (!outbox) return Response.json({ error: "待发送消息不存在" }, { status: 404 });
    if (outbox.status !== "approved") return Response.json({ error: "消息必须先通过人工审核" }, { status: 409 });

    const claim = await env.DB.prepare(
      `UPDATE connector_outbox SET status = 'sending'
       WHERE id = ? AND workspace_id = ? AND status = 'approved'`,
    ).bind(outbox.id, workspaceId).run() as { meta?: { changes?: number } };
    if (!claim.meta?.changes) return Response.json({ error: "消息正在发送或已被处理" }, { status: 409 });

    const metadata = JSON.parse(outbox.metadataJson || "{}") as { targetKind?: QqTargetKind };
    const effectiveBindings = (await workspaceSocialBindings(env.DB, workspaceId, env)).bindings;
    const receipt = await deliverConnectorMessage({
      outboxId: outbox.id,
      channel: outbox.channel,
      target: outbox.target,
      markdown: outbox.payloadMarkdown,
      metadata,
    }, effectiveBindings);
    const receiptMarkdown = deliveryReceiptMarkdown(receipt);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE connector_outbox SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(outbox.id),
      env.DB.prepare(
        `INSERT INTO connector_delivery_attempts (id, outbox_id, channel, status, response_markdown)
         VALUES (?, ?, ?, 'sent', ?)`,
      ).bind(crypto.randomUUID(), outbox.id, outbox.channel, receiptMarkdown),
    ]);
    return Response.json({ id: outbox.id, status: "sent", receipt });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof z.ZodError) return Response.json({ error: "发送请求格式无效" }, { status: 400 });
    const message = error instanceof Error ? error.message : "连接器投递失败";
    const externalCode = error instanceof ConnectorDeliveryError ? error.externalCode : undefined;
    if (outbox?.id) {
      const failureMarkdown = deliveryFailureMarkdown(outbox.channel, message, externalCode);
      await env.DB.batch([
        env.DB.prepare(`UPDATE connector_outbox SET status = 'failed' WHERE id = ? AND workspace_id = ? AND status = 'sending'`).bind(outbox.id, workspaceId),
        env.DB.prepare(
          `INSERT INTO connector_delivery_attempts (id, outbox_id, channel, status, response_markdown)
           VALUES (?, ?, ?, 'failed', ?)`,
        ).bind(crypto.randomUUID(), outbox.id, outbox.channel, failureMarkdown),
      ]);
    }
    return Response.json({ error: message, code: "CONNECTOR_DELIVERY_FAILED" }, { status: 502 });
  }
}
