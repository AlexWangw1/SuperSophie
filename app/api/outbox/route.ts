import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";

export async function GET() {
  await ensureSchema();
  const result = await env.DB.prepare(
    `SELECT id, channel, payload_markdown AS payloadMarkdown, status,
      created_at AS createdAt, sent_at AS sentAt
     FROM connector_outbox WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50`,
  ).bind("default").all();
  return Response.json({ messages: result.results });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { channel?: string; markdown?: string };
    if (!payload.channel?.trim() || !payload.markdown?.trim()) {
      return Response.json({ error: "channel and markdown are required" }, { status: 400 });
    }
    await ensureSchema();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO connector_outbox (id, workspace_id, channel, payload_markdown, status)
       VALUES (?, 'default', ?, ?, 'review')`,
    ).bind(id, payload.channel, payload.markdown).run();
    return Response.json({ id, status: "review" }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create message" }, { status: 500 });
  }
}

