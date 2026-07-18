import { z } from "zod";

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  conversationId: z.string().uuid().optional(),
  mode: z.enum(["auto", "chat", "team"]).default("auto"),
  modelId: z.string().trim().min(1).max(120).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(20_000),
  })).max(24).default([]),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const SpecialistPlanSchema = z.object({
  name: z.string().min(1).max(40),
  role: z.string().min(1).max(120),
  instructions: z.string().min(1).max(2_000),
  deliverable: z.string().min(1).max(300),
  modelId: z.string().min(1).max(120),
});

export const TeamPlanSchema = z.object({
  summary: z.string().min(1).max(500),
  strategy: z.string().min(1).max(1_200),
  agents: z.array(SpecialistPlanSchema).min(1).max(4),
  successCriteria: z.array(z.string().min(1).max(240)).min(1).max(6),
});

export type SpecialistPlan = z.infer<typeof SpecialistPlanSchema>;
export type TeamPlan = z.infer<typeof TeamPlanSchema>;

export type SpecialistResult = SpecialistPlan & {
  id: string;
  status: "completed" | "failed";
  output: string;
};

export type SophieRunResult = {
  mode: "chat" | "team";
  reply: string;
  modelId: string;
  lastResponseId?: string;
  team?: TeamPlan;
  specialists?: SpecialistResult[];
};

export type PublicModelProfile = {
  id: string;
  label: string;
  provider: string;
  model: string;
  capabilities: string[];
  available: boolean;
  localOnly?: boolean;
};

export type ServerModelProfile = Omit<PublicModelProfile, "available"> & {
  apiKeyEnv?: string;
  baseURL?: string;
  useResponses: boolean;
};
