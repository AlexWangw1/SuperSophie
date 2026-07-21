import { z } from "zod";
import { readWorkspaceSecret, writeWorkspaceSecret } from "../workspace-secrets.ts";

export const WORKSPACE_MODEL_SECRET_PROVIDER = "model-settings";
const builtinIds = new Set(["openai:gpt-5.6", "openai:gpt-5-mini", "openrouter:auto", "ollama:local"]);

function isPublicHttpsEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/.test(host) || host.includes("::ffff:") || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
    if (ipv4) {
      if (ipv4.some((part) => part > 255)) return false;
      const [a, b] = ipv4;
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const SecretSchema = z.string().trim().min(8).max(1_000);
export const WorkspaceCustomModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9:_./-]{1,119}$/i).refine((id) => !builtinIds.has(id), "不能覆盖内置模型 ID"),
  label: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(160),
  capabilities: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  baseURL: z.string().trim().url().refine(isPublicHttpsEndpoint, "模型地址必须是公开 HTTPS endpoint"),
  useResponses: z.boolean().default(false),
  apiKey: SecretSchema.optional(),
});

export const WorkspaceModelSettingsSchema = z.object({
  openaiApiKey: SecretSchema.optional(),
  openrouterApiKey: SecretSchema.optional(),
  ollamaBaseUrl: z.string().trim().url().refine(isPublicHttpsEndpoint, "Ollama 地址必须是公开 HTTPS endpoint").optional(),
  customModels: z.array(WorkspaceCustomModelSchema).max(12).default([]),
});

export type WorkspaceModelSettings = z.infer<typeof WorkspaceModelSettingsSchema>;
type RuntimeBindings = Record<string, unknown> & { CONNECTOR_ENCRYPTION_KEY?: string };

export async function readWorkspaceModelSettings(db: D1Database, workspaceId: string, bindings: RuntimeBindings) {
  const value = await readWorkspaceSecret<unknown>({ db, workspaceId, provider: WORKSPACE_MODEL_SECRET_PROVIDER, bindings });
  if (!value) return { customModels: [] } satisfies WorkspaceModelSettings;
  const parsed = WorkspaceModelSettingsSchema.safeParse(value);
  if (!parsed.success) throw new Error("工作区模型配置无法解密或格式无效");
  return parsed.data;
}

export async function writeWorkspaceModelSettings(db: D1Database, workspaceId: string, bindings: RuntimeBindings, settings: WorkspaceModelSettings) {
  const normalized = WorkspaceModelSettingsSchema.parse(settings);
  await writeWorkspaceSecret({ db, workspaceId, provider: WORKSPACE_MODEL_SECRET_PROVIDER, value: normalized, label: "Workspace model vault", bindings });
  return normalized;
}

function bindingString(bindings: RuntimeBindings, name: string) {
  const value = bindings[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function environmentCustomModels(bindings: RuntimeBindings) {
  const source = bindingString(bindings, "SOPHIE_MODEL_CATALOG_JSON");
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function workspaceModelBindings(db: D1Database, workspaceId: string, bindings: RuntimeBindings) {
  const settings = await readWorkspaceModelSettings(db, workspaceId, bindings);
  const effective = Object.assign(Object.create(bindings) as RuntimeBindings, bindings);
  if (settings.openaiApiKey) effective.OPENAI_API_KEY = settings.openaiApiKey;
  if (settings.openrouterApiKey) effective.OPENROUTER_API_KEY = settings.openrouterApiKey;
  if (settings.ollamaBaseUrl) effective.OLLAMA_BASE_URL = settings.ollamaBaseUrl;
  const workspaceProfiles = settings.customModels.map(({ apiKey, ...profile }, index) => {
    const apiKeyEnv = apiKey ? `SOPHIE_WORKSPACE_MODEL_KEY_${index}` : undefined;
    if (apiKey && apiKeyEnv) effective[apiKeyEnv] = apiKey;
    return { ...profile, apiKeyEnv, localOnly: false };
  });
  effective.SOPHIE_MODEL_CATALOG_JSON = JSON.stringify([...environmentCustomModels(bindings), ...workspaceProfiles]);
  return { bindings: effective, settings };
}

export function publicWorkspaceModelSettings(settings: WorkspaceModelSettings, bindings: RuntimeBindings) {
  return {
    providers: {
      openai: { configured: Boolean(settings.openaiApiKey || bindingString(bindings, "OPENAI_API_KEY")), source: settings.openaiApiKey ? "workspace" : bindingString(bindings, "OPENAI_API_KEY") ? "environment" : null },
      openrouter: { configured: Boolean(settings.openrouterApiKey || bindingString(bindings, "OPENROUTER_API_KEY")), source: settings.openrouterApiKey ? "workspace" : bindingString(bindings, "OPENROUTER_API_KEY") ? "environment" : null },
      ollama: { configured: Boolean(settings.ollamaBaseUrl || bindingString(bindings, "OLLAMA_BASE_URL")), source: settings.ollamaBaseUrl ? "workspace" : bindingString(bindings, "OLLAMA_BASE_URL") ? "environment" : null },
    },
    customModels: settings.customModels.map(({ apiKey, ...profile }) => ({ ...profile, hasKey: Boolean(apiKey) })),
    vaultAvailable: Boolean(bindingString(bindings, "CONNECTOR_ENCRYPTION_KEY")),
  };
}
