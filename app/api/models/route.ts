import { env } from "cloudflare:workers";
import { getPublicModelCatalog } from "../../../lib/agents/model-catalog";

export async function GET() {
  const models = getPublicModelCatalog(env as unknown as Record<string, unknown>);
  const defaultModelId = models.find((model) => model.available)?.id ?? models[0]?.id;
  return Response.json({ models, defaultModelId });
}
