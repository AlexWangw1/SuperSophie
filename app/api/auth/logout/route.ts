import { env } from "cloudflare:workers";
import { assertSameOrigin, clearSessionCookies, getAuthContext, writeSecurityEvent } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await getAuthContext(request);
    if (context) {
      await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(context.sessionId).run();
      await writeSecurityEvent({
        userId: context.userId,
        workspaceId: context.workspaceId,
        eventType: "session-ended",
        details: ["当前设备会话已退出。"],
      });
    }
    const headers = new Headers({ "content-type": "application/json" });
    for (const cookie of clearSessionCookies()) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ authenticated: false }), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "logout_failed" }, { status: 500 });
  }
}
