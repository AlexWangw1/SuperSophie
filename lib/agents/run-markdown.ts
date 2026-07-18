import type { SophieRunResult } from "./types";

function safeYaml(value: string) {
  return JSON.stringify(value.replace(/\r\n/g, "\n"));
}

export function buildAgentRunMarkdown(input: {
  runId: string;
  conversationId: string;
  goal: string;
  createdAt: string;
  result?: SophieRunResult;
  error?: string;
}) {
  const status = input.error ? "failed" : "completed";
  const frontmatter = [
    "---",
    "sophie: 1",
    `id: agent-run-${input.runId}`,
    `kind: agent-run`,
    `conversationId: ${input.conversationId}`,
    `status: ${status}`,
    `createdAt: ${input.createdAt}`,
    `goal: ${safeYaml(input.goal)}`,
    "---",
  ].join("\n");
  if (input.error) {
    return `${frontmatter}\n\n# Agent 运行失败\n\n${input.error}\n`;
  }
  const result = input.result!;
  const plan = result.team
    ? `## 团队计划\n\n${result.team.summary}\n\n${result.team.strategy}\n\n### 成功标准\n\n${result.team.successCriteria.map((item) => `- ${item}`).join("\n")}`
    : "## 执行模式\n\nSophie 单 Agent 对话。";
  const specialists = result.specialists?.length
    ? `## 专家产物\n\n${result.specialists.map((member) =>
        `### ${member.name} · ${member.role}\n\n- 状态：${member.status}\n- 模型：${member.modelId}\n- 交付物：${member.deliverable}\n\n${member.output}`,
      ).join("\n\n")}`
    : "";
  return `${frontmatter}\n\n# ${input.goal}\n\n${plan}\n\n${specialists}\n\n## Sophie 最终回复\n\n${result.reply}\n`;
}

export function buildConversationMarkdown(input: {
  conversationId: string;
  title: string;
  updatedAt: string;
  messages: Array<{ role: string; contentMarkdown: string; createdAt: string }>;
}) {
  const frontmatter = [
    "---",
    "sophie: 1",
    `id: conversation-${input.conversationId}`,
    "kind: conversation",
    `title: ${safeYaml(input.title)}`,
    `updatedAt: ${input.updatedAt}`,
    "---",
  ].join("\n");
  const transcript = input.messages.map((message) =>
    `## ${message.role === "user" ? "你" : "Sophie"} · ${message.createdAt}\n\n${message.contentMarkdown}`,
  ).join("\n\n");
  return `${frontmatter}\n\n# ${input.title}\n\n${transcript}\n`;
}
