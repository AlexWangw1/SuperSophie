import { env } from "cloudflare:workers";
import { getPublicModelCatalog } from "../../../lib/agents/model-catalog";
import { authErrorResponse, requireWorkspace } from "../../../lib/auth";

export async function GET(request: Request) {
  try {
    await requireWorkspace(request);
    const models = getPublicModelCatalog(env as unknown as Record<string, unknown>);
    const defaultModelId = models.find((model) => model.available)?.id ?? models[0]?.id;
    return Response.json({ models, defaultModelId });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "model_catalog_failed" }, { status: 500 });
  }
}
