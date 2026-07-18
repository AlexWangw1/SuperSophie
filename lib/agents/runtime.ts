import { Agent } from "@openai/agents";
import type { ChatRequest, SophieRunResult, SpecialistResult, TeamPlan } from "./types";
import { TeamPlanSchema } from "./types";
import {
  createModelRunner,
  getPublicModelCatalog,
  resolveModelProfile,
} from "./model-catalog";

type RuntimeBindings = Record<string, unknown>;

const SOPHIE_INSTRUCTIONS = `你是 SuperSophie，一个以 Markdown 为内容真源的个人智能工作空间助手。
用用户的语言回答，默认简洁、具体、可执行。不要声称已经执行未实际执行的外部操作。
如果用户提出复杂目标，可以说明将通过 Agent Work 组建团队；如果只是聊天、解释或整理，则直接完成。
任何 API key、OAuth token 或秘密都不得写入回复、Markdown 文档或日志。`;

function historyPrompt(request: ChatRequest) {
  const history = request.history.slice(-16).map((message) =>
    `${message.role === "user" ? "用户" : "Sophie"}: ${message.content}`,
  ).join("\n\n");
  return `${history ? `最近对话：\n${history}\n\n` : ""}用户的新消息：\n${request.message}`;
}

export function shouldUseTeam(message: string) {
  const normalized = message.trim().toLowerCase();
  if (normalized.startsWith("/team") || normalized.startsWith("/agent")) return true;
  return /(组建|创建|安排|召集).{0,8}(团队|agent|智能体|子智能体)|多智能体|完整(实现|完成|研究|开发)|帮我(完成|开发|构建|调研).{4,}/i.test(normalized);
}

function cleanGoal(message: string) {
  return message.replace(/^\/(team|agent)\s*/i, "").trim();
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "未知模型错误";
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .slice(0, 600);
}

async function runChat(request: ChatRequest, bindings: RuntimeBindings): Promise<SophieRunResult> {
  const profile = resolveModelProfile(request.modelId, bindings);
  const agent = new Agent({
    name: "Sophie",
    model: profile.model,
    instructions: SOPHIE_INSTRUCTIONS,
  });
  const runner = createModelRunner(profile, bindings);
  const result = await runner.run(agent, historyPrompt(request), { maxTurns: 6 });
  return {
    mode: "chat",
    reply: String(result.finalOutput ?? "我没有生成可显示的回复，请再试一次。"),
    modelId: profile.id,
    lastResponseId: result.lastResponseId,
  };
}

async function makeTeamPlan(goal: string, coordinatorId: string, bindings: RuntimeBindings) {
  const profile = resolveModelProfile(coordinatorId, bindings);
  const availableModels = getPublicModelCatalog(bindings)
    .filter((model) => model.available)
    .map((model) => `- ${model.id}: ${model.label}；${model.capabilities.join("、")}`)
    .join("\n");
  const planner = new Agent({
    name: "Sophie Team Planner",
    model: profile.model,
    outputType: TeamPlanSchema,
    instructions: `你负责把一个复杂目标拆成 1 到 4 个可以并行交付的专家任务。
只在职责或交付物确实不同的时候创建专家。每个专家必须选择给定的可用 modelId。
instructions 必须包含边界、证据要求和输出格式；不要安排真实发送、删除、支付等未经审批的副作用。
用用户目标所使用的语言填写所有字段。`,
  });
  const runner = createModelRunner(profile, bindings);
  const result = await runner.run(
    planner,
    `目标：\n${goal}\n\n当前可用模型：\n${availableModels}`,
    { maxTurns: 5 },
  );
  return TeamPlanSchema.parse(result.finalOutput);
}

async function runSpecialist(
  goal: string,
  plan: TeamPlan["agents"][number],
  fallbackModelId: string,
  bindings: RuntimeBindings,
): Promise<SpecialistResult> {
  const id = crypto.randomUUID();
  try {
    const profile = resolveModelProfile(plan.modelId || fallbackModelId, bindings);
    const specialist = new Agent({
      name: plan.name,
      model: profile.model,
      instructions: `${plan.instructions}\n\n你是团队中的专家。只交付分配给你的部分，并明确事实、假设、风险和下一步。输出使用 Markdown。`,
    });
    const runner = createModelRunner(profile, bindings);
    const result = await runner.run(
      specialist,
      `团队总目标：\n${goal}\n\n你的角色：${plan.role}\n你的交付物：${plan.deliverable}`,
      { maxTurns: 8 },
    );
    return { ...plan, id, modelId: profile.id, status: "completed", output: String(result.finalOutput ?? "") };
  } catch (error) {
    return { ...plan, id, status: "failed", output: `执行失败：${sanitizeError(error)}` };
  }
}

async function runTeam(request: ChatRequest, bindings: RuntimeBindings): Promise<SophieRunResult> {
  const coordinator = resolveModelProfile(request.modelId, bindings);
  const goal = cleanGoal(request.message);
  const team = await makeTeamPlan(goal, coordinator.id, bindings);
  const specialists = await Promise.all(
    team.agents.map((plan) => runSpecialist(goal, plan, coordinator.id, bindings)),
  );
  const evidence = specialists.map((member) =>
    `## ${member.name} · ${member.role}\n状态：${member.status}\n模型：${member.modelId}\n\n${member.output}`,
  ).join("\n\n---\n\n");
  const lead = new Agent({
    name: "Sophie Lead",
    model: coordinator.model,
    instructions: `${SOPHIE_INSTRUCTIONS}
你现在是团队负责人。综合专家产物，直接回答用户目标。区分已完成结果、仍是建议的内容和需要人工批准的动作。
不要隐藏专家失败；如果证据不足，明确指出。输出清晰的 Markdown，但不要添加无用的形式化章节。`,
  });
  const runner = createModelRunner(coordinator, bindings);
  const final = await runner.run(
    lead,
    `用户目标：\n${goal}\n\n团队策略：\n${team.strategy}\n\n成功标准：\n${team.successCriteria.map((item) => `- ${item}`).join("\n")}\n\n专家产物：\n${evidence}`,
    { maxTurns: 8 },
  );
  return {
    mode: "team",
    reply: String(final.finalOutput ?? "团队已完成工作，但没有生成最终摘要。"),
    modelId: coordinator.id,
    lastResponseId: final.lastResponseId,
    team,
    specialists,
  };
}

export async function runSophie(request: ChatRequest, bindings: RuntimeBindings) {
  const mode = request.mode === "auto"
    ? (shouldUseTeam(request.message) ? "team" : "chat")
    : request.mode;
  return mode === "team" ? runTeam(request, bindings) : runChat(request, bindings);
}
