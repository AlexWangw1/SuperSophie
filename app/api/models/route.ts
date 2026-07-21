import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../db/ensure";
import { getPublicModelCatalog } from "../../../lib/agents/model-catalog";
import {
  publicWorkspaceModelSettings,
  readWorkspaceModelSettings,
  WorkspaceCustomModelSchema,
  workspaceModelBindings,
  writeWorkspaceModelSettings,
} from "../../../lib/agents/workspace-models";
import { authErrorResponse, requireWorkspace, writeSecurityEvent } from "../../../lib/auth";

const bindings = env as unknown as Record<string, unknown> & { CONNECTOR_ENCRYPTION_KEY?: string };
const ProviderActionSchema = z.object({
  action: z.literal("set-provider"),
  provider: z.enum(["openai", "openrouter", "ollama"]),
  value: z.string().trim().min(8).max(1_000),
});
const CustomActionSchema = z.object({ action: z.literal("upsert-custom"), profile: WorkspaceCustomModelSchema });
const ActionSchema = z.discriminatedUnion("action", [ProviderActionSchema, CustomActionSchema]);

async function responsePayload(workspaceId: string) {
  const effective = await workspaceModelBindings(env.DB, workspaceId, bindings);
  const models = getPublicModelCatalog(effective.bindings);
  return {
    models,
    defaultModelId: models.find((model) => model.available)?.id ?? models[0]?.id,
    settings: publicWorkspaceModelSettings(effective.settings, bindings),
  };
}

export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request);
    await ensureSchema();
    return Response.json(await responsePayload(workspaceId));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "model_catalog_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { workspaceId, userId } = await requireWorkspace(request, { write: true });
    await ensureSchema();
    const action = ActionSchema.parse(await request.json());
    const current = await readWorkspaceModelSettings(env.DB, workspaceId, bindings);
    if (action.action === "set-provider") {
      if (action.provider === "openai") current.openaiApiKey = action.value;
      else if (action.provider === "openrouter") current.openrouterApiKey = action.value;
      else current.ollamaBaseUrl = action.value;
    } else {
      const index = current.customModels.findIndex((profile) => profile.id === action.profile.id);
      const existingKey = index >= 0 ? current.customModels[index].apiKey : undefined;
      const profile = { ...action.profile, apiKey: action.profile.apiKey ?? existingKey };
      if (index >= 0) current.customModels[index] = profile;
      else current.customModels.push(profile);
    }
    await writeWorkspaceModelSettings(env.DB, workspaceId, bindings, current);
    await writeSecurityEvent({ userId, workspaceId, eventType: "workspace_model_secret_updated", details: [action.action === "set-provider" ? `已更新 ${action.provider} 工作区模型配置。` : `已更新自定义模型 ${action.profile.id}。`, "事件不包含 API key。"] });
    return Response.json(await responsePayload(workspaceId));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "模型配置无效" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "model_settings_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId, userId } = await requireWorkspace(request, { write: true });
    await ensureSchema();
    const url = new URL(request.url);
    const target = z.enum(["openai", "openrouter", "ollama", "custom"]).parse(url.searchParams.get("target"));
    const current = await readWorkspaceModelSettings(env.DB, workspaceId, bindings);
    if (target === "openai") delete current.openaiApiKey;
    else if (target === "openrouter") delete current.openrouterApiKey;
    else if (target === "ollama") delete current.ollamaBaseUrl;
    else {
      const id = z.string().min(2).max(120).parse(url.searchParams.get("id"));
      current.customModels = current.customModels.filter((profile) => profile.id !== id);
    }
    await writeWorkspaceModelSettings(env.DB, workspaceId, bindings, current);
    await writeSecurityEvent({ userId, workspaceId, eventType: "workspace_model_secret_deleted", details: [`已移除 ${target} 工作区模型配置。`, "事件不包含 API key。"] });
    return Response.json(await responsePayload(workspaceId));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof z.ZodError) return Response.json({ error: "模型配置删除请求无效" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "model_settings_delete_failed" }, { status: 500 });
  }
}
