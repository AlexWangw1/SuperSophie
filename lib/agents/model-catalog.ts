import { OpenAIProvider, Runner } from "@openai/agents";
import { z } from "zod";
import type { PublicModelProfile, ServerModelProfile } from "./types";

type RuntimeBindings = Record<string, unknown>;

export function redactModelSecrets(message: string, bindings: RuntimeBindings) {
  let redacted = message;
  const names = new Set([...Object.keys(bindings), "OPENAI_API_KEY", "OPENROUTER_API_KEY", "CONNECTOR_ENCRYPTION_KEY"]);
  const catalogSource = bindings.SOPHIE_MODEL_CATALOG_JSON;
  if (typeof catalogSource === "string") {
    try {
      const profiles = JSON.parse(catalogSource);
      if (Array.isArray(profiles)) for (const profile of profiles) if (profile && typeof profile === "object" && typeof profile.apiKeyEnv === "string") names.add(profile.apiKeyEnv);
    } catch { /* Invalid catalogs are ignored by the model resolver too. */ }
  }
  for (const name of names) {
    const value = bindings[name];
    if (!/(?:KEY|TOKEN|SECRET)(?:_|$)/i.test(name) || typeof value !== "string" || value.length < 8) continue;
    redacted = redacted.split(value).join("[REDACTED]");
  }
  return redacted
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}

const CustomProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9:_./-]{1,119}$/i),
  label: z.string().min(1).max(80),
  provider: z.string().min(1).max(60),
  model: z.string().min(1).max(160),
  capabilities: z.array(z.string().min(1).max(60)).max(8).default([]),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  baseURL: z.string().url().optional(),
  useResponses: z.boolean().default(false),
  localOnly: z.boolean().optional(),
});

const BUILTIN_PROFILES: ServerModelProfile[] = [
  {
    id: "openai:gpt-5.6",
    label: "GPT-5.6",
    provider: "OpenAI",
    model: "gpt-5.6",
    capabilities: ["协调", "推理", "工具调用"],
    apiKeyEnv: "OPENAI_API_KEY",
    useResponses: true,
  },
  {
    id: "openai:gpt-5-mini",
    label: "GPT-5 mini",
    provider: "OpenAI",
    model: "gpt-5-mini",
    capabilities: ["快速对话", "分类", "轻量任务"],
    apiKeyEnv: "OPENAI_API_KEY",
    useResponses: true,
  },
  {
    id: "openrouter:auto",
    label: "OpenRouter · Auto",
    provider: "OpenRouter",
    model: "openrouter/auto",
    capabilities: ["多模型路由", "Anthropic", "Google"],
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    useResponses: false,
  },
  {
    id: "ollama:local",
    label: "Ollama · Local",
    provider: "Ollama",
    model: "qwen3",
    capabilities: ["离线", "隐私", "本地模型"],
    baseURL: "http://127.0.0.1:11434/v1",
    useResponses: false,
    localOnly: true,
  },
];

function readBinding(bindings: RuntimeBindings, name: string) {
  const binding = bindings[name];
  if (typeof binding === "string" && binding.trim()) return binding.trim();
  if (typeof process !== "undefined") {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function customProfiles(bindings: RuntimeBindings): ServerModelProfile[] {
  const source = readBinding(bindings, "SOPHIE_MODEL_CATALOG_JSON");
  if (!source) return [];
  try {
    const result = z.array(CustomProfileSchema).max(24).safeParse(JSON.parse(source));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function getServerModelCatalog(bindings: RuntimeBindings) {
  const custom = customProfiles(bindings);
  const byId = new Map([...BUILTIN_PROFILES, ...custom].map((profile) => [profile.id, profile]));
  return [...byId.values()];
}

export function isProfileAvailable(profile: ServerModelProfile, bindings: RuntimeBindings) {
  if (profile.localOnly) return Boolean(readBinding(bindings, "OLLAMA_BASE_URL"));
  return !profile.apiKeyEnv || Boolean(readBinding(bindings, profile.apiKeyEnv));
}

export function getPublicModelCatalog(bindings: RuntimeBindings): PublicModelProfile[] {
  return getServerModelCatalog(bindings).map((profile) => ({
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    model: profile.model,
    capabilities: profile.capabilities,
    localOnly: profile.localOnly,
    available: isProfileAvailable(profile, bindings),
  }));
}

export class ModelNotConfiguredError extends Error {
  readonly code = "MODEL_NOT_CONFIGURED";
  constructor(message = "还没有可用的模型密钥。请先配置 OPENAI_API_KEY，或选择其他已连接模型。") {
    super(message);
    this.name = "ModelNotConfiguredError";
  }
}

export function resolveModelProfile(modelId: string | undefined, bindings: RuntimeBindings) {
  const catalog = getServerModelCatalog(bindings);
  const preferred = modelId ? catalog.find((profile) => profile.id === modelId) : undefined;
  const profile = preferred && isProfileAvailable(preferred, bindings)
    ? preferred
    : catalog.find((candidate) => isProfileAvailable(candidate, bindings));
  if (!profile) throw new ModelNotConfiguredError();
  return profile;
}

export function createModelRunner(profile: ServerModelProfile, bindings: RuntimeBindings) {
  const configuredBaseURL = profile.localOnly
    ? readBinding(bindings, "OLLAMA_BASE_URL")
    : profile.baseURL;
  const apiKey = profile.apiKeyEnv ? readBinding(bindings, profile.apiKeyEnv) : "local-model";
  if (!apiKey) throw new ModelNotConfiguredError(`${profile.label} 尚未配置 ${profile.apiKeyEnv}。`);

  const provider = new OpenAIProvider({
    apiKey,
    baseURL: configuredBaseURL,
    useResponses: profile.useResponses,
  });
  return new Runner({
    model: profile.model,
    modelProvider: provider,
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
    workflowName: "SuperSophie",
  });
}
