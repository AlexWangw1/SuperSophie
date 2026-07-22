"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  CaretDown,
  CheckSquare,
  ClockCounterClockwise,
  Code,
  GearSix,
  Keyboard,
  Microphone,
  NotePencil,
  PaperPlaneTilt,
  PawPrint,
  Robot,
  Sparkle,
  SquaresFour,
  Waveform,
} from "@phosphor-icons/react";
import { cacheSophiePackage, clearPendingPageDeletion, deleteCachedSophiePackage, listCachedPages, listPendingPageDeletions, queuePendingPageDeletion, readCachedPage, readCachedSophiePackage } from "../lib/offline-store";
import {
  blocksToMarkdown,
  createSophieAsset,
  createSophiePackage,
  downloadSophiePackage,
  parseSophiePageMarkdown,
  readSophiePackageWithAssets,
  sophieAssetDataUrl,
  type SophieBlock,
  type SophiePackageAsset,
  type SophiePage,
} from "../lib/sophie-package";
import {
  applyViewQuery,
  DATABASE_CONDITIONAL_COLORS,
  matchingConditionalColor,
  type ConditionalColorRule,
  type FilterCondition,
  type FilterGroup,
  type ViewSort,
} from "../lib/database/query";
import {
  computeDatabaseProperties,
  DATABASE_PROPERTY_TYPES,
  defaultProductTaskPropertySchema,
  type DatabasePropertyDefinition,
  type DatabasePropertySchema,
  type DatabasePropertyType,
} from "../lib/database/properties";
import { WorkspaceMenu } from "./auth-gate";

type Section = "home" | "notes" | "database" | "agents" | "code" | "connectors";
type ViewType = "table" | "board" | "timeline" | "calendar" | "list" | "gallery" | "chart" | "map" | "feed" | "dashboard" | "form";
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due: string;
  day: number;
  owner: string;
  tags: string[];
  progress: number;
  x: number;
  y: number;
  body?: string;
  revision?: number;
  properties?: Record<string, unknown>;
};

type DatabaseSourceSummary = { id: string; name: string; schema: DatabasePropertySchema; schemaRevision: number };
type DatabaseTemplateSummary = { id: string; name: string; icon: string; description: string; title: string; markdown: string; properties: Record<string, unknown>; revision: number };
type RelationOption = { id: string; title: string };
type DatabaseViewConfig = {
  visibleProperties?: string[];
  sorts?: ViewSort[];
  groupBy?: string | null;
  subGroupBy?: string | null;
  filters?: FilterGroup | null;
  conditionalColors?: ConditionalColorRule[];
};

const navItems: Array<{ id: Section; icon: string; label: string; hint?: string }> = [
  { id: "home", icon: "⌂", label: "今天" },
  { id: "notes", icon: "✎", label: "笔记" },
  { id: "database", icon: "▦", label: "数据库" },
  { id: "agents", icon: "✦", label: "Agent Work", hint: "3" },
  { id: "code", icon: "⌘", label: "代码" },
  { id: "connectors", icon: "◎", label: "连接器" },
];

const viewOptions: Array<{ id: ViewType; label: string; icon: string }> = [
  { id: "table", label: "表格", icon: "▦" },
  { id: "board", label: "看板", icon: "▤" },
  { id: "timeline", label: "时间线", icon: "⇥" },
  { id: "calendar", label: "日历", icon: "□" },
  { id: "list", label: "列表", icon: "☷" },
  { id: "gallery", label: "画廊", icon: "▧" },
  { id: "chart", label: "图表", icon: "⌁" },
  { id: "map", label: "地图", icon: "⌖" },
  { id: "feed", label: "动态", icon: "≋" },
  { id: "dashboard", label: "仪表盘", icon: "◫" },
  { id: "form", label: "表单", icon: "⊞" },
];

const initialTasks: Task[] = [
  { id: "T-108", title: "完成 .sophie 离线包导入", status: "In progress", priority: "High", due: "7月18日", day: 18, owner: "SC", tags: ["Offline", "Core"], progress: 68, x: 62, y: 38 },
  { id: "T-109", title: "设计块级冲突合并协议", status: "Review", priority: "High", due: "7月19日", day: 19, owner: "MZ", tags: ["Sync"], progress: 86, x: 35, y: 56 },
  { id: "T-110", title: "Telegram 消息适配器", status: "Inbox", priority: "Medium", due: "7月21日", day: 21, owner: "JL", tags: ["Connector"], progress: 12, x: 76, y: 64 },
  { id: "T-111", title: "数据库公式解析器", status: "In progress", priority: "Medium", due: "7月22日", day: 22, owner: "SC", tags: ["Database"], progress: 44, x: 48, y: 74 },
  { id: "T-112", title: "移动端块操作菜单", status: "Done", priority: "Low", due: "7月16日", day: 16, owner: "RQ", tags: ["Mobile"], progress: 100, x: 23, y: 30 },
  { id: "T-113", title: "OneDrive 增量同步验证", status: "Review", priority: "High", due: "7月24日", day: 24, owner: "MZ", tags: ["Sync", "Cloud"], progress: 78, x: 66, y: 79 },
];

const initialPage: SophiePage = {
  id: "page_supersophie_launch",
  title: "SuperSophie 发布计划",
  icon: "✦",
  kind: "database-item",
  revision: 1,
  updatedAt: new Date().toISOString(),
  properties: { status: "In progress", priority: "High", owner: "Sophie", tags: ["Product", "Launch"] },
  blocks: [
    { id: "b1", type: "text", content: "把想法、知识与执行放在同一个可离线的工作空间里。" },
    { id: "b2", type: "heading", content: "本周重点" },
    { id: "b3", type: "todo", content: "完成 Markdown 块编辑与云端保存", checked: true },
    { id: "b4", type: "todo", content: "验证 .sophie 文件的导入、校验与恢复", checked: false },
    { id: "b5", type: "callout", content: "所有 Agent 产物都回写为 Markdown；密钥永远不进入文档。" },
    { id: "b6", type: "code", language: "typescript", content: "const workspace = await sophie.open({ offline: true });\nawait workspace.agents.run(\"准备发布\");" },
  ],
};

const agents = [
  { name: "Sophie", role: "主协调 Agent", model: "GPT-5.6", status: "协调中", tone: "violet", initials: "SO" },
  { name: "Scout", role: "调研与资料核验", model: "Gemini 3 Pro", status: "已完成", tone: "blue", initials: "SC" },
  { name: "Maker", role: "产品与界面实现", model: "Claude 4.6", status: "工作中", tone: "amber", initials: "MK" },
  { name: "Critic", role: "测试与风险审阅", model: "GPT-5.6", status: "等待依赖", tone: "mint", initials: "CR" },
];

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function StatusDot({ tone = "green" }: { tone?: string }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

function TopBar({ section, onSearch }: { section: Section; onSearch: () => void }) {
  const labels: Record<Section, string> = { home: "今天", notes: "知识库 / SuperSophie 发布计划", database: "产品任务", agents: "Agent Work", code: "代码工作台", connectors: "连接器" };
  return (
    <header className="topbar">
      <div className="breadcrumbs"><span className="crumb-mark">S</span><span>{labels[section]}</span></div>
      <div className="top-actions">
        <button className="search-trigger" onClick={onSearch} aria-label="打开全局搜索"><span>⌕</span><span>搜索工作区</span><kbd>Ctrl K</kbd></button>
        <button className="icon-button" aria-label="通知">♢<span className="notify-dot" /></button>
        <div className="avatar">SC</div>
      </div>
    </header>
  );
}

export function HomeView({ go }: { go: (section: Section) => void }) {
  return (
    <main className="content home-content">
      <section className="welcome-row">
        <div><p className="eyebrow">FRIDAY · JUL 17</p><h1>{timeGreeting()}，Sophie</h1><p>你的工作区已经同步。这里是现在最值得关注的事情。</p></div>
        <button className="primary-button" onClick={() => go("agents")}><span>✦</span>交给 Sophie</button>
      </section>

      <section className="agent-hero">
        <div className="agent-orb"><span>✦</span><i /></div>
        <div className="agent-hero-copy">
          <div className="agent-live"><StatusDot tone="violet" /> AGENT TEAM LIVE</div>
          <h2>Sophie 正在协调 3 个子 Agent</h2>
          <p>“完成 SuperSophie 的首个可运行版本，并验证离线数据流。”</p>
          <div className="progress-track"><span style={{ width: "64%" }} /></div>
          <div className="progress-meta"><span>4 / 6 个阶段完成</span><span>预计 18 分钟</span></div>
        </div>
        <div className="agent-stack" aria-label="参与任务的 Agent">
          {agents.slice(0, 4).map((agent) => <span key={agent.name} className={`mini-avatar ${agent.tone}`}>{agent.initials}</span>)}
          <button onClick={() => go("agents")}>查看工作台 →</button>
        </div>
      </section>

      <section className="home-grid">
        <div className="panel focus-panel">
          <div className="panel-heading"><div><span className="section-kicker">NOW</span><h3>今日重点</h3></div><button onClick={() => go("database")}>查看全部</button></div>
          {initialTasks.slice(0, 3).map((task, index) => (
            <button className="focus-item" key={task.id} onClick={() => go("database")}>
              <span className={`task-check ${index === 2 ? "done" : ""}`}>{index === 2 ? "✓" : ""}</span>
              <span className="focus-copy"><strong>{task.title}</strong><small>{task.tags.join(" · ")} · {task.due}</small></span>
              <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
            </button>
          ))}
          <button className="add-row" onClick={() => go("database")}>＋ 添加任务</button>
        </div>

        <div className="panel recent-panel">
          <div className="panel-heading"><div><span className="section-kicker">RECENT</span><h3>最近编辑</h3></div><button onClick={() => go("notes")}>知识库</button></div>
          {[
            ["✦", "SuperSophie 发布计划", "刚刚", "violet"],
            ["◫", "同步架构与冲突策略", "26 分钟前", "blue"],
            ["⌘", "Agent Runtime API", "昨天", "amber"],
            ["◎", "社交连接器说明", "周三", "mint"],
          ].map(([icon, title, time, tone]) => (
            <button className="recent-item" key={title} onClick={() => go("notes")}>
              <span className={`doc-icon ${tone}`}>{icon}</span><span><strong>{title}</strong><small>{time}</small></span><i>›</i>
            </button>
          ))}
        </div>
      </section>

      <section className="quick-grid">
        <button onClick={() => go("notes")}><span className="quick-icon violet">✎</span><strong>新建笔记</strong><small>从一个空白块开始</small><i>↗</i></button>
        <button onClick={() => go("agents")}><span className="quick-icon amber">✦</span><strong>运行 Agent</strong><small>描述目标，由团队完成</small><i>↗</i></button>
        <button onClick={() => go("code")}><span className="quick-icon blue">⌘</span><strong>打开代码</strong><small>编辑、审阅与执行任务</small><i>↗</i></button>
        <button onClick={() => go("connectors")}><span className="quick-icon mint">◎</span><strong>发送消息</strong><small>微信、QQ 或 Telegram</small><i>↗</i></button>
      </section>
    </main>
  );
}

type ConversationMessage = {
  id: string;
  role: "sophie" | "user";
  text: string;
  time: string;
  pending?: boolean;
  run?: {
    id: string;
    status: string;
    team?: { summary: string; agents: Array<{ name: string; role: string; modelId: string }> };
  };
};

type ModelProfile = {
  id: string;
  label: string;
  provider: string;
  model: string;
  capabilities: string[];
  available: boolean;
  localOnly?: boolean;
};

type PublicModelSettings = {
  providers: Record<"openai" | "openrouter" | "ollama", { configured: boolean; source: "workspace" | "environment" | null }>;
  customModels: Array<{ id: string; label: string; provider: string; model: string; capabilities: string[]; baseURL: string; useResponses: boolean; hasKey: boolean }>;
  vaultAvailable: boolean;
};

function useModelCatalog() {
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("openai:gpt-5.6");
  const [settings, setSettings] = useState<PublicModelSettings>();
  const refresh = useCallback(async () => {
    await fetch("/api/models")
      .then(async (response) => {
        if (!response.ok) throw new Error("model catalog unavailable");
        return response.json() as Promise<{ models: ModelProfile[]; defaultModelId?: string; settings?: PublicModelSettings }>;
      })
      .then((result) => {
        setModels(result.models);
        if (result.defaultModelId) setDefaultModelId(result.defaultModelId);
        setSettings(result.settings);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { models, defaultModelId, settings, refresh };
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SophieDesktopBridge = {
  setPetEnabled: (enabled: boolean) => Promise<void> | void;
  showMain: () => Promise<void> | void;
  pendingPackage: () => Promise<string | null>;
  consumeOpenedPackage: () => Promise<{ name: string; content: string } | null>;
  onPackageAvailable: (callback: (name: string) => void) => () => void;
  retryOnline: () => Promise<void> | void;
  chooseCodeProject: () => Promise<{ name: string; files: Array<{ path: string; size: number }> } | null>;
  readCodeFile: (path: string) => Promise<{ path: string; content: string; hash: string }>;
  saveCodeFile: (input: { path: string; content: string; expectedHash: string | null }) => Promise<{ path: string; hash: string }>;
  runCodeCheck: (command: "test" | "typecheck" | "lint") => Promise<{ command: string; exitCode: number; output: string }>;
};

const starterMessages: ConversationMessage[] = [
  { id: "welcome", role: "sophie", text: "我在这里。可以直接聊天，也可以给我一个目标，我会按需要组建 Agent 团队。", time: "现在" },
];

function shouldUseTeamClient(message = "") {
  return /^\/(team|agent)\b/i.test(message) || /团队|子智能体|多智能体/i.test(message);
}

function ConversationHome({ go }: { go: (section: Section) => void }) {
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [messages, setMessages] = useState(starterMessages);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [status, setStatus] = useState("轻触麦克风开始说话");
  const [petEnabled, setPetEnabled] = useState(() => typeof window === "undefined" || localStorage.getItem("supersophie-pet-enabled") !== "false");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [sending, setSending] = useState(false);
  const { models, defaultModelId } = useModelCatalog();
  const [modelId, setModelId] = useState("");
  const activeModelId = modelId || defaultModelId;
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    const desktop = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
    void desktop?.setPetEnabled(petEnabled);
  }, [petEnabled]);

  useEffect(() => {
    fetch("/api/chat?latest=1")
      .then(async (response) => response.ok ? response.json() : undefined)
      .then((result: { conversation?: { id: string; modelId?: string }; messages?: Array<{ id: string; role: string; contentMarkdown: string; createdAt: string }> } | undefined) => {
        if (!result?.conversation || !result.messages?.length) return;
        setConversationId(result.conversation.id);
        if (result.conversation.modelId) setModelId(result.conversation.modelId);
        setMessages(result.messages.map((message) => ({
          id: message.id,
          role: message.role === "user" ? "user" : "sophie",
          text: message.contentMarkdown,
          time: new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        })));
      })
      .catch(() => undefined);
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.03;
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendMessage = useCallback(async (value: string) => {
    const clean = value.trim();
    if (!clean || sending) return;
    const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const userMessage: ConversationMessage = { id: crypto.randomUUID(), role: "user", text: clean, time: now };
    const history = messages.filter((message) => !message.pending).map((message) => ({
      role: message.role === "user" ? "user" as const : "assistant" as const,
      content: message.text,
    }));
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setLiveTranscript("");
    setStatus("Sophie 正在思考…");
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: clean, conversationId, history, mode: "auto", modelId: activeModelId }),
      });
      const result = await response.json() as {
        error?: string;
        conversationId?: string;
        message?: { id: string; content: string };
        run?: ConversationMessage["run"];
      };
      if (!response.ok || !result.message) throw new Error(result.error || "Sophie 暂时无法回复");
      if (result.conversationId) setConversationId(result.conversationId);
      const replyTime = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      const reply = result.message.content;
      setMessages((current) => [...current, { id: result.message!.id, role: "sophie", text: reply, time: replyTime, run: result.run }]);
      setStatus("轻触麦克风继续说话");
      if (mode === "voice") speak(reply);
    } catch (error) {
      const reply = error instanceof Error ? error.message : "Sophie 暂时无法回复";
      const replyTime = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "sophie", text: reply, time: replyTime }]);
      setStatus("请检查模型配置后重试");
    } finally {
      setSending(false);
    }
  }, [activeModelId, conversationId, messages, mode, sending, speak]);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      setStatus("轻触麦克风继续说话");
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setMode("text");
      setStatus("当前环境不支持语音识别，已切换到文字输入");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = "";
      let isFinal = false;
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
        isFinal ||= event.results[index].isFinal;
      }
      setLiveTranscript(transcript);
      setStatus(isFinal ? "我听到了" : "正在听…");
      if (isFinal) sendMessage(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setStatus("没有听清，再试一次或切换文字输入");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setStatus("正在听…");
  };

  const togglePet = async () => {
    const next = !petEnabled;
    setPetEnabled(next);
    localStorage.setItem("supersophie-pet-enabled", String(next));
  };

  const railItems = [
    { label: "笔记", icon: NotePencil, section: "notes" as Section },
    { label: "任务", icon: CheckSquare, section: "database" as Section },
    { label: "Agent", icon: Robot, section: "agents" as Section },
    { label: "代码", icon: Code, section: "code" as Section },
  ];

  return (
    <main className="conversation-home">
      <header className="conversation-topbar">
        <button className="conversation-brand" onClick={() => setHistoryOpen(false)} aria-label="SuperSophie 首页">
          <span><Sparkle weight="fill" /></span>
          <strong>SuperSophie</strong>
        </button>
        <div className="conversation-picker-wrap">
          <button className="conversation-picker" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
            <span>今晚的对话</span><CaretDown weight="bold" />
          </button>
          {historyOpen && (
            <div className="conversation-history">
              <button onClick={() => setHistoryOpen(false)}><strong>今晚的对话</strong><small>正在进行</small></button>
              <button onClick={() => setHistoryOpen(false)}><strong>产品发布计划</strong><small>昨天</small></button>
              <button onClick={() => setHistoryOpen(false)}><strong>离线同步讨论</strong><small>周三</small></button>
            </div>
          )}
        </div>
        <button className={`pet-mode-pill ${petEnabled ? "enabled" : ""}`} onClick={togglePet} aria-pressed={petEnabled}>
          <PawPrint weight="fill" />
          <span>宠物模式 · {petEnabled ? "开启" : "关闭"}</span>
          <Sparkle weight="fill" />
          <i aria-hidden="true" />
        </button>
      </header>

      <nav className="conversation-rail" aria-label="工作区入口">
        <button className="active" aria-label="对话"><Sparkle weight="fill" /></button>
        {railItems.map(({ label, icon: Icon, section }) => <button key={label} onClick={() => go(section)} aria-label={label} title={label}><Icon /></button>)}
        <button className="rail-settings" onClick={() => go("connectors")} aria-label="设置与连接器" title="设置与连接器"><GearSix /></button>
      </nav>

      <section className="conversation-stage">
        <div className="conversation-copy">
          <div className="message-stream" aria-live="polite">
            {messages.slice(-8).map((message) => (
              <article className={`conversation-message ${message.role}`} key={message.id}>
                <header>
                  {message.role === "sophie" && <Sparkle weight="fill" />}
                  <strong>{message.role === "sophie" ? "Sophie" : "你"}</strong>
                  <small>{message.time}</small>
                </header>
                <div className="message-body">
                  <p>{message.text}</p>
                  {message.run?.team && (
                    <button className="conversation-run-card" onClick={() => go("agents")}>
                      <span><Robot weight="fill" /></span>
                      <div><strong>{message.run.team.agents.length} 个子 Agent 已完成协作</strong><small>{message.run.team.summary}</small></div>
                      <i>查看运行日志 →</i>
                    </button>
                  )}
                </div>
              </article>
            ))}
            {sending && <div className="sophie-thinking"><Sparkle weight="fill" /><span>Sophie 正在运行{shouldUseTeamClient(messages.at(-1)?.text) ? " Agent 团队" : "模型"}…</span><i /><i /><i /></div>}
          </div>
          <div className="quick-prompts">
            <button onClick={() => sendMessage("/team 帮我把这个目标拆解并组建团队完成")}>组建 Agent 团队</button>
            <button onClick={() => sendMessage("帮我整理现在最重要的三件事")}>整理当前重点</button>
          </div>
        </div>

        <div className="sophie-portrait" aria-hidden="true">
          <div className="portrait-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sophie-companion.png" alt="" />
        </div>
      </section>

      <section className={`conversation-dock ${listening ? "is-listening" : ""} ${mode === "text" ? "mode-text" : ""}`}>
        <div className="dock-status" aria-live="polite">
          <Waveform weight="bold" preserveAspectRatio="none" />
          <div><strong>{listening ? liveTranscript || "正在听…" : "随时开口，我一直在"}</strong><small>{mode === "voice" ? status : "按 Enter 发送，Shift + Enter 换行"}</small></div>
          <select className="conversation-model-select" value={activeModelId} onChange={(event) => setModelId(event.target.value)} aria-label="选择对话模型">
            {(models.length ? models : [{ id: activeModelId, label: "GPT-5.6", provider: "OpenAI", model: "gpt-5.6", capabilities: [], available: false }]).map((model) => (
              <option key={model.id} value={model.id} disabled={!model.available}>{model.label}{model.available ? "" : " · 未配置"}</option>
            ))}
          </select>
        </div>

        <div className="dock-center">
          {mode === "voice" ? (
            <button className="microphone-button" onClick={toggleListening} aria-pressed={listening} aria-label={listening ? "停止聆听" : "开始语音对话"}>
              <Microphone weight="fill" />
            </button>
          ) : (
            <div className="text-composer">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(draft); }
                }}
                autoFocus
                rows={1}
                placeholder="和 Sophie 说点什么…"
                aria-label="输入消息"
              />
              <button onClick={() => sendMessage(draft)} disabled={!draft.trim() || sending} aria-label="发送消息"><PaperPlaneTilt weight="fill" /></button>
            </div>
          )}
          <div className="mode-switch" role="group" aria-label="输入方式">
            <button className={mode === "voice" ? "active" : ""} onClick={() => setMode("voice")}><Microphone weight="fill" />语音</button>
            <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><Keyboard weight="bold" />文字</button>
          </div>
        </div>

        <button className="open-workspace" onClick={() => go("notes")}>
          <SquaresFour weight="fill" />
          <span><strong>打开工作区</strong><small>笔记 · 任务 · Agent</small></span>
        </button>
      </section>

      <button className="conversation-history-shortcut" onClick={() => setHistoryOpen(true)}><ClockCounterClockwise />历史对话</button>
    </main>
  );
}

const blockLabels: Record<SophieBlock["type"], string> = {
  text: "正文", heading: "标题", todo: "待办", quote: "引用", callout: "提示", code: "代码",
  "bulleted-list": "项目列表", "numbered-list": "编号列表", toggle: "折叠", divider: "分割线",
  image: "图片", file: "文件", "page-reference": "页面引用", database: "数据库",
};
const slashBlockTypes = (Object.keys(blockLabels) as SophieBlock["type"][]).filter((type) => type !== "image" && type !== "file");

type CloudAssetMetadata = { id: string; name: string; mime: string; size: number; sha256: string; downloadUrl: string };
type KnowledgePageSummary = { id: string; title: string; icon: string; kind: string; markdown: string; revision: number; updatedAt: string; cloud?: boolean; synced?: boolean };

function knowledgePageSummary(page: SophiePage, state: Pick<KnowledgePageSummary, "cloud" | "synced"> = {}) {
  return { id: page.id, title: page.title, icon: page.icon ?? "📄", kind: page.kind, markdown: blocksToMarkdown(page), revision: page.revision, updatedAt: page.updatedAt, ...state };
}

function mergeKnowledgePages(remotePages: KnowledgePageSummary[], localPages: KnowledgePageSummary[]) {
  const merged = new Map(remotePages.map((page) => [page.id, { ...page, cloud: true, synced: true }]));
  for (const local of localPages) {
    const remote = merged.get(local.id);
    if (!remote) {
      merged.set(local.id, { ...local, cloud: false, synced: false });
      continue;
    }
    const sameContent = local.revision === remote.revision && local.markdown === remote.markdown;
    const localIsNewer = local.revision > remote.revision
      || (local.revision === remote.revision && Date.parse(local.updatedAt) > Date.parse(remote.updatedAt));
    if (!sameContent && localIsNewer) merged.set(local.id, { ...local, cloud: true, synced: false });
  }
  return [...merged.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

async function loadCloudPageAssets(documentId: string) {
  const response = await fetch(`/api/assets?documentId=${encodeURIComponent(documentId)}`);
  if (!response.ok) throw new Error(await responseError(response));
  const payload = await response.json() as { assets: CloudAssetMetadata[] };
  const total = payload.assets.reduce((sum, asset) => sum + asset.size, 0);
  if (total > 64 * 1024 * 1024) throw new Error("页面附件总大小超过 64 MB");
  const assets: SophiePackageAsset[] = [];
  for (const metadata of payload.assets) {
    const download = await fetch(metadata.downloadUrl);
    if (!download.ok) throw new Error(`附件 ${metadata.name} 下载失败`);
    const asset = await createSophieAsset({ id: metadata.id, name: metadata.name, mime: metadata.mime, bytes: await download.arrayBuffer() });
    if (asset.size !== metadata.size || asset.sha256 !== metadata.sha256) throw new Error(`附件 ${metadata.name} 校验失败`);
    assets.push(asset);
  }
  return assets;
}

async function uploadCloudPageAssets(documentId: string, assets: SophiePackageAsset[]) {
  const listing = await fetch(`/api/assets?documentId=${encodeURIComponent(documentId)}`);
  if (!listing.ok) throw new Error(await responseError(listing));
  const existing = await listing.json() as { assets: CloudAssetMetadata[] };
  const uploaded = new Set(existing.assets.map((asset) => `${asset.id}\0${asset.sha256}`));
  for (const asset of assets) {
    if (uploaded.has(`${asset.id}\0${asset.sha256}`)) continue;
    const binary = Uint8Array.from(atob(asset.data), (character) => character.charCodeAt(0));
    const form = new FormData();
    form.set("file", new File([binary.buffer as ArrayBuffer], asset.name, { type: asset.mime }));
    form.set("assetId", asset.id);
    form.set("documentId", documentId);
    form.set("sha256", asset.sha256);
    const response = await fetch("/api/assets", { method: "POST", body: form });
    const result = await response.json() as { id?: string; error?: string };
    if (!response.ok || result.id !== asset.id) throw new Error(result.error || `附件 ${asset.name} 上传失败`);
  }
}

function NotesView() {
  const [page, setPage] = useState(initialPage);
  const [pageAssets, setPageAssets] = useState<SophiePackageAsset[]>([]);
  const [pages, setPages] = useState<KnowledgePageSummary[]>([]);
  const [pageSearch, setPageSearch] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline" | "conflict">("saved");
  const [slashBlock, setSlashBlock] = useState<string>();
  const [draggedBlock, setDraggedBlock] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const assetInput = useRef<HTMLInputElement>(null);

  const applyImportedPackage = useCallback(async (source: string) => {
    const imported = await readSophiePackageWithAssets(source);
    setPage(imported.page);
    setPageAssets(imported.assets);
    const summary = knowledgePageSummary(imported.page, { cloud: false, synced: false });
    setPages((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
    await cacheSophiePackage(imported.page, imported.assets);
    localStorage.setItem("supersophie:last-page", imported.page.id);
    setSaveState("offline");
  }, []);

  useEffect(() => {
    const lastPageId = localStorage.getItem("supersophie:last-page") || initialPage.id;
    let cancelled = false;
    const load = async () => {
      const desktop = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
      const openedPackage = await desktop?.consumeOpenedPackage();
      if (openedPackage) {
        try {
          await applyImportedPackage(openedPackage.content);
          return;
        } catch (error) {
          alert(error instanceof Error ? error.message : "无法打开文件");
        }
      }
      const cachedPages = await listCachedPages();
      const cached = await readCachedSophiePackage(lastPageId);
      const cachedSummaries = cachedPages.map((item) => knowledgePageSummary(item, { cloud: false, synced: false }));
      if (!cancelled && cachedSummaries.length) setPages(cachedSummaries);
      if (cached && !cancelled) {
        setPage(cached.page); setPageAssets(cached.assets); setSaveState("offline");
      }
      else {
        const pageOnly = await readCachedPage(lastPageId);
        if (pageOnly && !cancelled) {
          setPage(pageOnly);
          setPages([knowledgePageSummary(pageOnly, { cloud: false, synced: false })]);
          setSaveState("offline");
        }
      }
      if (!navigator.onLine) return;
      const pendingDeletions = new Set((await listPendingPageDeletions()).map((item) => item.pageId));
      for (const pageId of pendingDeletions) {
        try {
          const deletion = await fetch(`/api/pages?id=${encodeURIComponent(pageId)}`, { method: "DELETE" });
          if (deletion.ok || deletion.status === 404) {
            await clearPendingPageDeletion(pageId);
            pendingDeletions.delete(pageId);
          }
        } catch { /* Keep the deletion queued and hide the page until connectivity returns. */ }
      }
      const response = await fetch("/api/pages");
      if (!response.ok) return;
      const payload = await response.json() as { pages: KnowledgePageSummary[] };
      const mergedPages = mergeKnowledgePages(payload.pages.filter((item) => !pendingDeletions.has(item.id)), cachedSummaries);
      if (!cancelled) setPages(mergedPages);
      const selected = mergedPages.find((item) => item.id === lastPageId) ?? mergedPages[0];
      if (!selected) return;
      localStorage.setItem("supersophie:last-page", selected.id);
      if (!selected.synced && cached?.page.id === selected.id) return;
      const restored = { ...parseSophiePageMarkdown(selected.markdown), id: selected.id, revision: selected.revision, updatedAt: selected.updatedAt };
      let assets = (await readCachedSophiePackage(restored.id))?.assets ?? [];
      let cloudLoaded = false;
      if (selected.synced) {
        try { assets = await loadCloudPageAssets(restored.id); cloudLoaded = true; }
        catch { cloudLoaded = false; }
      }
      if (cancelled) return;
      setPage(restored);
      setPageAssets(assets);
      await cacheSophiePackage(restored, assets);
      setSaveState(cloudLoaded ? "saved" : "offline");
    };
    void load().catch(() => undefined);
    return () => { cancelled = true; };
  }, [applyImportedPackage]);

  useEffect(() => {
    const desktop = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
    if (!desktop) return;
    return desktop.onPackageAvailable(() => {
      void desktop.consumeOpenedPackage()
        .then((openedPackage) => openedPackage && applyImportedPackage(openedPackage.content))
        .catch((error) => alert(error instanceof Error ? error.message : "无法打开文件"));
    });
  }, [applyImportedPackage]);

  const updateBlock = (id: string, patch: Partial<SophieBlock>) => {
    setPage((current) => ({ ...current, blocks: current.blocks.map((block) => {
      if (block.id !== id) return block;
      const next = { ...block, ...patch } as SophieBlock;
      const nextContent = patch.content;
      if (next.type === "page-reference" && typeof nextContent === "string") next.url = pages.find((item) => item.title === nextContent.trim())?.id;
      return next;
    }), updatedAt: new Date().toISOString() }));
    setSaveState("offline");
  };

  const addBlock = (afterId?: string, type: SophieBlock["type"] = "text") => {
    const block: SophieBlock = { id: crypto.randomUUID(), type, content: "", ...(type === "todo" ? { checked: false } : {}), ...(type === "code" ? { language: "typescript" } : {}) };
    setPage((current) => {
      const blocks = [...current.blocks];
      const index = afterId ? blocks.findIndex((item) => item.id === afterId) + 1 : blocks.length;
      blocks.splice(Math.max(index, 0), 0, block);
      return { ...current, blocks };
    });
    setSlashBlock(undefined);
    setSaveState("offline");
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    setPage((current) => {
      const index = current.blocks.findIndex((block) => block.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      const [moved] = blocks.splice(index, 1);
      blocks.splice(nextIndex, 0, moved);
      return { ...current, blocks, updatedAt: new Date().toISOString() };
    });
    setSaveState("offline");
  };

  const dropBlockBefore = (targetId: string) => {
    if (!draggedBlock || draggedBlock === targetId) return;
    setPage((current) => {
      const blocks = [...current.blocks];
      const sourceIndex = blocks.findIndex((block) => block.id === draggedBlock);
      if (sourceIndex < 0) return current;
      const [moved] = blocks.splice(sourceIndex, 1);
      const targetIndex = blocks.findIndex((block) => block.id === targetId);
      blocks.splice(Math.max(0, targetIndex), 0, moved);
      return { ...current, blocks, updatedAt: new Date().toISOString() };
    });
    setDraggedBlock(undefined);
    setSaveState("offline");
  };

  const save = useCallback(async () => {
    setSaveState("saving");
    const nextPage = { ...page, updatedAt: new Date().toISOString() };
    try {
      await cacheSophiePackage(nextPage, pageAssets);
      localStorage.setItem("supersophie:last-page", nextPage.id);
      if (!navigator.onLine) { setSaveState("offline"); return; }
      const response = await fetch("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...nextPage, markdown: blocksToMarkdown(nextPage), baseRevision: nextPage.revision }),
      });
      if (response.status === 409) { setSaveState("conflict"); return; }
      if (!response.ok) throw new Error("save failed");
      const result = await response.json() as { revision: number; updatedAt: string };
      const savedPage = { ...nextPage, revision: result.revision, updatedAt: result.updatedAt };
      setPage(savedPage);
      await cacheSophiePackage(savedPage, pageAssets);
      await uploadCloudPageAssets(savedPage.id, pageAssets);
      const summary = knowledgePageSummary(savedPage, { cloud: true, synced: true });
      setPages((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
      setSaveState("saved");
    } catch {
      setSaveState("offline");
    }
  }, [page, pageAssets]);

  const exportPage = async () => downloadSophiePackage(await createSophiePackage(page, pageAssets), page.title);
  const importPage = async (file?: File) => {
    if (!file) return;
    try {
      await applyImportedPackage(await file.text());
    }
    catch (error) { alert(error instanceof Error ? error.message : "无法打开文件"); }
  };

  const attachFiles = async (fileList?: FileList | null) => {
    if (!fileList?.length) return;
    try {
      const created = await Promise.all([...fileList].map(async (file) => createSophieAsset({ name: file.name, mime: file.type || "application/octet-stream", bytes: await file.arrayBuffer() })));
      setPageAssets((current) => [...current, ...created]);
      setPage((current) => ({ ...current, updatedAt: new Date().toISOString(), blocks: [...current.blocks, ...created.map((asset) => ({ id: crypto.randomUUID(), type: asset.mime.startsWith("image/") ? "image" as const : "file" as const, content: asset.name, assetId: asset.id }))] }));
      setSaveState("offline");
    } catch (error) { alert(error instanceof Error ? error.message : "附件添加失败"); }
  };

  const downloadAsset = (asset: SophiePackageAsset) => {
    const anchor = document.createElement("a");
    anchor.href = sophieAssetDataUrl(asset);
    anchor.download = asset.name;
    anchor.click();
  };

  const openKnowledgePage = async (summary: KnowledgePageSummary, preserveCurrent = true) => {
    if (summary.id === page.id) return;
    try {
      if (preserveCurrent) {
        await cacheSophiePackage(page, pageAssets);
        const currentState = pages.find((item) => item.id === page.id);
        const currentSummary = knowledgePageSummary(page, { cloud: currentState?.cloud, synced: saveState === "saved" && currentState?.synced });
        setPages((current) => current.map((item) => item.id === currentSummary.id ? currentSummary : item));
      }
      const next = { ...parseSophiePageMarkdown(summary.markdown), id: summary.id, revision: summary.revision, updatedAt: summary.updatedAt };
      let assets = (await readCachedSophiePackage(next.id))?.assets ?? [];
      let cloudLoaded = false;
      if (navigator.onLine && summary.synced) {
        try { assets = await loadCloudPageAssets(next.id); cloudLoaded = true; }
        catch { cloudLoaded = false; }
      }
      setPage(next);
      setPageAssets(assets);
      localStorage.setItem("supersophie:last-page", next.id);
      await cacheSophiePackage(next, assets);
      setSaveState(summary.synced && cloudLoaded ? "saved" : "offline");
    } catch (error) { alert(error instanceof Error ? error.message : "页面打开失败"); }
  };

  const createKnowledgePage = async (preserveCurrent = true) => {
    if (preserveCurrent) await cacheSophiePackage(page, pageAssets).catch(() => undefined);
    const currentState = pages.find((item) => item.id === page.id);
    const currentSummary = knowledgePageSummary(page, { cloud: currentState?.cloud, synced: saveState === "saved" && currentState?.synced });
    const now = new Date().toISOString();
    const next: SophiePage = { id: crypto.randomUUID(), title: "无标题页面", icon: "📄", kind: "page", revision: 1, updatedAt: now, properties: {}, blocks: [{ id: crypto.randomUUID(), type: "text", content: "" }] };
    const summary = knowledgePageSummary(next, { cloud: false, synced: false });
    setPages((current) => [summary, ...current.map((item) => preserveCurrent && item.id === currentSummary.id ? currentSummary : item)]);
    setPage(next);
    setPageAssets([]);
    localStorage.setItem("supersophie:last-page", next.id);
    await cacheSophiePackage(next, []);
    setSaveState("offline");
  };

  const deleteKnowledgePage = async () => {
    if (!confirm(`确定删除「${page.title}」吗？OneDrive 会通过删除墓碑同步。`)) return;
    if (navigator.onLine) {
      try {
        const response = await fetch(`/api/pages?id=${encodeURIComponent(page.id)}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) { alert(await responseError(response)); return; }
      } catch { await queuePendingPageDeletion(page.id); }
    } else await queuePendingPageDeletion(page.id);
    const remaining = pages.filter((item) => item.id !== page.id);
    await deleteCachedSophiePackage(page.id).catch(() => undefined);
    setPages(remaining);
    if (remaining[0]) await openKnowledgePage(remaining[0], false);
    else await createKnowledgePage(false);
  };

  const filteredPages = useMemo(() => {
    const query = pageSearch.trim().toLocaleLowerCase();
    return query ? pages.filter((item) => `${item.title}\n${item.markdown}`.toLocaleLowerCase().includes(query)) : pages;
  }, [pageSearch, pages]);
  const backlinks = useMemo(() => pages.filter((item) => item.id !== page.id && (item.markdown.includes(`sophie-page:${page.id}`) || item.markdown.includes(`[[${page.title}]]`))), [page.id, page.title, pages]);

  return (
    <main className="notes-layout">
      <aside className="page-tree">
        <div className="tree-title"><span>知识库 · {pages.length}</span><button onClick={() => void createKnowledgePage()} aria-label="新建页面">＋</button></div>
        <label className="tree-search"><span>⌕</span><input value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="搜索页面与 Markdown" /></label>
        <div className="tree-pages">{filteredPages.map((item) => <button className={`tree-item ${item.id === page.id ? "active" : ""}`} key={item.id} onClick={() => void openKnowledgePage(item)}><span>{item.icon || "📄"}</span><strong>{item.title}</strong><i>{item.kind === "database-item" ? "▦" : ""}</i></button>)}{filteredPages.length === 0 && <p className="tree-empty">没有匹配的页面</p>}</div>
        <div className="tree-spacer" />
        <div className="tree-backlink-count"><span>↩</span><strong>{backlinks.length} 个反向链接</strong></div>
        <button className="tree-item muted tree-delete" onClick={() => void deleteKnowledgePage()}><span>⌫</span><strong>删除当前页面</strong></button>
      </aside>
      <section className="editor-shell">
        <div className="editor-actions">
          <div className={`save-indicator ${saveState}`}><StatusDot tone={saveState === "saved" ? "green" : saveState === "saving" ? "amber" : "red"} />{saveState === "saved" ? "已同步" : saveState === "saving" ? "保存中…" : saveState === "conflict" ? "发现同步冲突" : "已保存到本机"}</div>
          <div><button className="quiet-button" onClick={() => assetInput.current?.click()}>添加附件</button><button className="quiet-button" onClick={() => fileInput.current?.click()}>导入</button><button className="quiet-button" onClick={exportPage}>导出 .sophie</button><button className="primary-small" onClick={save}>保存</button></div>
          <input ref={fileInput} hidden type="file" accept=".sophie,application/x-sophie-page" onChange={(event) => { void importPage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <input ref={assetInput} hidden type="file" multiple onChange={(event) => { void attachFiles(event.target.files); event.currentTarget.value = ""; }} />
        </div>
        <article className="editor-page">
          <div className="page-cover"><span>SUPER SOPHIE · PRODUCT</span><i>✦</i></div>
          <div className="page-icon">✦</div>
          <input className="page-title-input" value={page.title} onChange={(event) => { setPage({ ...page, title: event.target.value, updatedAt: new Date().toISOString() }); setSaveState("offline"); }} aria-label="页面标题" />
          <div className="page-properties">
            <span><i>◉</i> 状态 <b className="tag purple">进行中</b></span><span><i>↑</i> 优先级 <b className="tag red">High</b></span><span><i>♙</i> 负责人 <b>Sophie</b></span><span><i>#</i> 标签 <b className="tag blue">Product</b></span>
          </div>
          <div className="block-editor">
            {page.blocks.map((block) => (
              <div className={`block-row type-${block.type} ${draggedBlock === block.id ? "dragging" : ""}`} key={block.id} onDragOver={(event) => event.preventDefault()} onDrop={() => dropBlockBefore(block.id)}>
                <div className="block-handle"><button aria-label="添加块" onClick={() => addBlock(block.id)}>＋</button><button draggable aria-label="拖动块" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedBlock(block.id); }} onDragEnd={() => setDraggedBlock(undefined)}>⋮⋮</button><button aria-label="上移块" onClick={() => moveBlock(block.id, -1)}>↑</button><button aria-label="下移块" onClick={() => moveBlock(block.id, 1)}>↓</button></div>
                {block.type === "todo" && <button className={`todo-box ${block.checked ? "checked" : ""}`} onClick={() => updateBlock(block.id, { checked: !block.checked })}>{block.checked ? "✓" : ""}</button>}
                {block.type === "callout" && <span className="callout-icon">✦</span>}
                {block.type === "quote" && <span className="quote-line" />}
                {block.type === "image" && (() => { const asset = pageAssets.find((item) => item.id === block.assetId); return asset ? <figure className="image-block"><Image unoptimized src={sophieAssetDataUrl(asset)} width={1200} height={800} alt={block.content} /><figcaption>{block.content} · {(asset.size / 1024).toFixed(1)} KB</figcaption></figure> : <div className="missing-asset">图片附件缺失</div>; })()}
                {block.type === "file" && (() => { const asset = pageAssets.find((item) => item.id === block.assetId); return asset ? <button className="file-block" onClick={() => downloadAsset(asset)}><span>⇩</span><strong>{asset.name}</strong><small>{asset.mime} · {(asset.size / 1024).toFixed(1)} KB</small></button> : <div className="missing-asset">文件附件缺失</div>; })()}
                {block.type === "page-reference" && <div className="page-reference-block"><span>↗</span><select value={block.url ?? ""} onChange={(event) => { const target = pages.find((item) => item.id === event.target.value); updateBlock(block.id, { url: target?.id, content: target?.title ?? "" }); }}><option value="">选择一个页面…</option>{pages.filter((item) => item.id !== page.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button disabled={!block.url} onClick={() => { const target = pages.find((item) => item.id === block.url); if (target) void openKnowledgePage(target); }}>打开</button></div>}
                {block.type === "divider" && <hr className="divider-block" />}
                {!(["image", "file", "page-reference", "divider"] as SophieBlock["type"][]).includes(block.type) && <textarea
                  className="block-input"
                  rows={block.type === "code" ? 3 : 1}
                  value={block.content}
                  spellCheck={block.type !== "code"}
                  placeholder={block.type === "text" ? "输入 ‘/’ 打开命令…" : blockLabels[block.type]}
                  onChange={(event) => { updateBlock(block.id, { content: event.target.value }); setSlashBlock(event.target.value === "/" ? block.id : undefined); }}
                  onKeyDown={(event) => {
                    if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); moveBlock(block.id, -1); }
                    if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); moveBlock(block.id, 1); }
                    if (event.key === "Enter" && !event.shiftKey && block.type !== "code") { event.preventDefault(); addBlock(block.id); }
                    if (event.key === "Backspace" && !block.content && page.blocks.length > 1) { setPage((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id), updatedAt: new Date().toISOString() })); setSaveState("offline"); }
                  }}
                />}
                {slashBlock === block.id && (
                  <div className="slash-menu">
                    <p>基础块</p>
                    {slashBlockTypes.map((type) => <button key={type} onClick={() => { updateBlock(block.id, { type, content: "", ...(type === "todo" ? { checked: false } : {}) } as Partial<SophieBlock>); setSlashBlock(undefined); }}><span>{type === "heading" ? "H" : type === "todo" ? "☑" : type === "code" ? "⌘" : type === "database" ? "▦" : "¶"}</span><b>{blockLabels[type]}</b><small>{type === "text" ? "普通文本块" : `转换为${blockLabels[type]}块`}</small></button>)}
                  </div>
                )}
              </div>
            ))}
            <button className="new-block" onClick={() => addBlock()}>＋ 添加一个块</button>
          </div>
          <section className="page-backlinks"><header><span>↩</span><div><strong>反向链接</strong><small>引用「{page.title}」的页面</small></div><b>{backlinks.length}</b></header>{backlinks.length ? backlinks.map((item) => <button key={item.id} onClick={() => void openKnowledgePage(item)}><span>{item.icon || "📄"}</span><div><strong>{item.title}</strong><small>{item.updatedAt.slice(0, 10)}</small></div><i>›</i></button>) : <p>还没有其他页面引用这里。使用「页面引用」块并输入当前标题即可建立连接。</p>}</section>
        </article>
      </section>
    </main>
  );
}

function TaskCard({ task, onOpen, conditionalColors = [] }: { task: Task; onOpen?: (task: Task) => void; conditionalColors?: ConditionalColorRule[] }) {
  return <article className="task-card" data-row-color={taskConditionalColor(task, conditionalColors)} draggable onClick={() => onOpen?.(task)}><div className="task-card-top"><span>{task.id}</span>{task.priority && <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>}</div><h4>{task.title}</h4><div className="task-tags">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="task-card-footer"><span className="mini-avatar blue">{task.owner || "—"}</span><span>{task.due ? `◷ ${task.due}` : "未设置日期"}</span></div></article>;
}

function taskPropertyValue(task: Task, propertyId: string) {
  const fixed: Record<string, unknown> = { status: task.status, priority: task.priority, owner: task.owner, due: task.due, tags: task.tags, progress: task.progress, day: task.day, x: task.x, y: task.y };
  return task.properties?.[propertyId] ?? fixed[propertyId];
}

function taskConditionalColor(task: Task, rules: ConditionalColorRule[]) {
  if (!rules.length) return undefined;
  return matchingConditionalColor({ id: task.id, title: task.title, properties: { ...task.properties, status: task.status, priority: task.priority, owner: task.owner, due: task.due, tags: task.tags, progress: task.progress } as Record<string, string | number | boolean | string[] | null | undefined> }, rules);
}

function groupTasksByProperty(tasks: Task[], propertyId?: string) {
  if (!propertyId) return new Map<string, Task[]>([["", tasks]]);
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const value = taskPropertyValue(task, propertyId);
    const keys = Array.isArray(value) ? (value.length ? value.map(String) : ["未填写"]) : [String(value ?? "未填写") || "未填写"];
    for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return groups;
}

function PropertyCell({ task, property }: { task: Task; property: DatabasePropertyDefinition }) {
  const value = taskPropertyValue(task, property.id);
  if (property.id === "status") return <span><i className={`state ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</i></span>;
  if (property.id === "priority") return <span><i className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</i></span>;
  if (property.id === "owner") return <span><i className="mini-avatar blue">{task.owner}</i></span>;
  if (property.id === "due") return <span>◷ {task.due}</span>;
  if (property.id === "progress") return <span><i className="row-progress"><b style={{ width: `${task.progress}%` }} /></i><small>{task.progress}%</small></span>;
  if (property.type === "checkbox") return <span>{value ? "☑" : "☐"}</span>;
  if (property.type === "relation") return <span>{Array.isArray(value) ? `${value.length} 个页面` : "—"}</span>;
  if (Array.isArray(value)) return <span>{value.join(" · ") || "—"}</span>;
  return <span className={property.type === "formula" || property.type === "rollup" || property.type === "id" ? "computed-property" : ""}>{value === null || value === undefined || value === "" ? "—" : String(value)}</span>;
}

function TableView({ tasks, schema, onOpen, hidden = [], conditionalColors = [] }: { tasks: Task[]; schema: DatabasePropertySchema; onOpen?: (task: Task) => void; hidden?: string[]; conditionalColors?: ConditionalColorRule[] }) {
  const columns = schema.properties.filter((property) => property.type !== "title" && !hidden.includes(property.id)).slice(0, 10);
  return <div className="data-table"><div className="table-row table-head" style={{ gridTemplateColumns: `42px minmax(250px,2fr) repeat(${columns.length}, minmax(105px,1fr))` }}><span><input type="checkbox" aria-label="全选" /></span><span>记录</span>{columns.map((property) => <span key={property.id}>{property.name}<small>{property.type}</small></span>)}</div>{tasks.map((task) => <div className="table-row" data-row-color={taskConditionalColor(task, conditionalColors)} style={{ gridTemplateColumns: `42px minmax(250px,2fr) repeat(${columns.length}, minmax(105px,1fr))` }} key={task.id} onDoubleClick={() => onOpen?.(task)}><span><input type="checkbox" aria-label={`选择 ${task.title}`} /></span><button className="table-title-button" onClick={() => onOpen?.(task)}><b>{task.title}</b><small>{task.id}</small></button>{columns.map((property) => <PropertyCell key={property.id} task={task} property={property} />)}</div>)}</div>;
}

function BoardView({ tasks, property, subGroupProperty, move, onOpen, conditionalColors = [] }: { tasks: Task[]; property?: DatabasePropertyDefinition; subGroupProperty?: DatabasePropertyDefinition; move: (id: string, propertyId: string, value: unknown) => void; onOpen?: (task: Task) => void; conditionalColors?: ConditionalColorRule[] }) {
  const descriptors = new Map<string, { label: string; value: unknown }>();
  if (property?.type === "checkbox") {
    descriptors.set("true", { label: "已勾选", value: true });
    descriptors.set("false", { label: "未勾选", value: false });
  } else {
    for (const option of property?.options ?? []) descriptors.set(option, { label: option, value: option });
    for (const task of tasks) {
      const value = property ? taskPropertyValue(task, property.id) : "全部记录";
      for (const item of Array.isArray(value) ? value : [value]) {
        const key = item === null || item === undefined || item === "" ? "__empty__" : String(item);
        descriptors.set(key, { label: key === "__empty__" ? "未填写" : key, value: key === "__empty__" ? null : item });
      }
    }
  }
  if (!descriptors.size) descriptors.set("__empty__", { label: "未填写", value: null });
  const belongsTo = (task: Task, key: string) => {
    if (!property) return true;
    const value = taskPropertyValue(task, property.id);
    if (property.type === "checkbox") return String(Boolean(value)) === key;
    if (Array.isArray(value)) return value.map(String).includes(key);
    return (value === null || value === undefined || value === "" ? "__empty__" : String(value)) === key;
  };
  const renderColumns = (records: Task[], prefix: string) => <div className="board-view">{[...descriptors].map(([key, descriptor]) => { const columnRecords = records.filter((task) => belongsTo(task, key)); return <section className="board-column" key={`${prefix}-${key}`} onDragOver={(event) => property && event.preventDefault()} onDrop={(event) => property && move(event.dataTransfer.getData("task"), property.id, descriptor.value)}><header><span className={`status-chip ${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>{descriptor.label}</span><b>{columnRecords.length}</b><button>＋</button></header>{columnRecords.map((task) => <div key={task.id} draggable={Boolean(property)} onDragStart={(event) => event.dataTransfer.setData("task", task.id)}><TaskCard task={task} onOpen={onOpen} conditionalColors={conditionalColors} /></div>)}<button className="column-add">＋ 新建</button></section>; })}</div>;
  if (!subGroupProperty) return renderColumns(tasks, "all");
  return <div className="board-swimlanes">{[...groupTasksByProperty(tasks, subGroupProperty.id)].map(([name, records]) => <section key={name}><header><strong>{name}</strong><span>{records.length}</span><small>{subGroupProperty.name}</small></header>{renderColumns(records, name)}</section>)}</div>;
}

function parseDatabaseDate(value: unknown, fallbackYear: number) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value ?? "").trim();
  const chinese = text.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (chinese) return new Date(fallbackYear, Number(chinese[1]) - 1, Number(chinese[2]));
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function TimelineView({ tasks, dateProperty }: { tasks: Task[]; dateProperty?: DatabasePropertyDefinition }) {
  const [fallbackDate] = useState(() => new Date());
  const dated = tasks.map((task) => ({ task, date: parseDatabaseDate(dateProperty ? taskPropertyValue(task, dateProperty.id) : task.due, fallbackDate.getFullYear()) }));
  const first = dated.map((item) => item.date?.getTime()).filter((item): item is number => item !== undefined).sort((left, right) => left - right)[0];
  const start = new Date(first ?? fallbackDate.getTime());
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 8 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  return <div className="timeline-view"><div className="timeline-header"><b>{dateProperty?.name ?? "日期"}</b>{days.map((date) => <span key={dayKey(date)}>{date.getDate()}<small>{date.toLocaleDateString("zh-CN", { month: "short" })}</small></span>)}</div>{dated.map(({ task, date }, index) => { const offset = date ? Math.round((date.getTime() - start.getTime()) / 86_400_000) : 0; return <div className="timeline-row" key={task.id}><strong>{task.title}</strong><div className="timeline-grid">{days.map((day) => <i key={dayKey(day)} />)}<span className={`timeline-bar bar-${index % 4}`} style={{ left: `${Math.max(0, Math.min(7, offset)) * 12.5}%`, width: `${Math.max(18, task.progress / 3)}%` }}>{task.owner} · {date ? date.toLocaleDateString("zh-CN") : "未填写日期"}</span></div></div>; })}</div>;
}

function CalendarView({ tasks, dateProperty, onOpen }: { tasks: Task[]; dateProperty?: DatabasePropertyDefinition; onOpen?: (task: Task) => void }) {
  const [fallbackDate] = useState(() => new Date());
  const dated = tasks.map((task) => ({ task, date: parseDatabaseDate(dateProperty ? taskPropertyValue(task, dateProperty.id) : task.due, fallbackDate.getFullYear()) }));
  const anchor = dated.find((item) => item.date)?.date ?? fallbackDate;
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - ((monthStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date; });
  const today = dayKey(fallbackDate);
  return <div className="calendar-view"><header className="calendar-title"><strong>{anchor.toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}</strong><span>{dateProperty?.name ?? "日期"}</span></header><div className="calendar-week">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}</div><div className="calendar-grid">{days.map((date) => <div className={`${dayKey(date) === today ? "today" : ""} ${date.getMonth() !== anchor.getMonth() ? "other" : ""}`} key={dayKey(date)}><b>{date.getDate()}</b>{dated.filter((item) => item.date && dayKey(item.date) === dayKey(date)).map(({ task }) => <button className={`calendar-task ${task.priority.toLowerCase()}`} key={task.id} onClick={() => onOpen?.(task)}>{task.title}</button>)}</div>)}</div></div>;
}

function GalleryView({ tasks, onOpen }: { tasks: Task[]; onOpen?: (task: Task) => void }) {
  return <div className="gallery-view">{tasks.map((task, index) => <article key={task.id} onClick={() => onOpen?.(task)}><div className={`gallery-cover cover-${index % 4}`}><span>{task.tags[0]}</span><i>{index % 2 ? "◫" : "✦"}</i></div><div><small>{task.id}</small><h3>{task.title}</h3><span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span><footer><span className="mini-avatar blue">{task.owner}</span><span>{task.due}</span></footer></div></article>)}</div>;
}

function ChartView({ tasks, groupProperty, numberProperty }: { tasks: Task[]; groupProperty?: DatabasePropertyDefinition; numberProperty?: DatabasePropertyDefinition }) {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const raw = groupProperty ? taskPropertyValue(task, groupProperty.id) : task.status;
    const values = Array.isArray(raw) ? (raw.length ? raw : ["未填写"]) : [String(raw ?? "未填写")];
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const groups = [...new Set([...(groupProperty?.options ?? []), ...counts.keys()])].slice(0, 10);
  const numbers = tasks.map((task) => Number(numberProperty ? taskPropertyValue(task, numberProperty.id) : task.progress)).filter(Number.isFinite);
  const average = numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : 0;
  const percent = Math.max(0, Math.min(100, average));
  return <div className="chart-view"><section className="chart-card"><header><div><small>按{groupProperty?.name ?? "状态"}</small><h3>记录分布</h3></div><button>{tasks.length} 条⌄</button></header><div className="bar-chart">{groups.map((group) => { const count = counts.get(group) ?? 0; return <div key={group}><span style={{ height: `${26 + count * 42}px` }}><i>{count}</i></span><small>{group}</small></div>; })}</div></section><section className="chart-card donut-card"><header><div><small>{numberProperty?.name ?? "总体完成度"}</small><h3>数值平均值</h3></div></header><div className="donut" style={{ background: `conic-gradient(var(--violet) ${percent}%, var(--panel-soft) 0)` }}><span><strong>{average}</strong><small>平均值</small></span></div><div className="legend"><span><i className="violet-bg" />{numberProperty?.name ?? "进度"} {average}</span><span><i className="soft-bg" />{numbers.length} 个数值</span></div></section></div>;
}

function mapPosition(task: Task, property?: DatabasePropertyDefinition) {
  const value = property ? taskPropertyValue(task, property.id) : undefined;
  const coordinates = String(value ?? "").match(/^\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!coordinates) return { x: task.x, y: task.y, label: String(value ?? "未填写坐标") };
  const first = Number(coordinates[1]);
  const second = Number(coordinates[2]);
  if (first >= 0 && first <= 100 && second >= 0 && second <= 100) return { x: first, y: second, label: `${first}, ${second}` };
  return { x: Math.max(3, Math.min(97, (second + 180) / 360 * 100)), y: Math.max(4, Math.min(94, (90 - first) / 180 * 100)), label: `${first}, ${second}` };
}

function MapView({ tasks, placeProperty, onOpen }: { tasks: Task[]; placeProperty?: DatabasePropertyDefinition; onOpen?: (task: Task) => void }) {
  return <div className="map-view"><div className="map-grid" />{tasks.map((task, index) => { const position = mapPosition(task, placeProperty); return <button className={`map-pin pin-${index % 4}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} key={task.id} onClick={() => onOpen?.(task)} title={position.label}><span>{task.owner}</span><b>{task.title}</b></button>; })}<div className="map-legend">{placeProperty?.name ?? "位置"} · 支持“纬度, 经度”或画布百分比坐标</div></div>;
}

function FeedView({ tasks }: { tasks: Task[] }) {
  return <div className="feed-view">{tasks.map((task, index) => <article key={task.id}><span className={`feed-avatar tone-${index % 4}`}>{task.owner}</span><div><p><strong>{task.owner}</strong> {index % 2 ? "更新了" : "创建了"} <b>{task.title}</b></p><small>{index * 13 + 4} 分钟前 · {task.id}</small><div className="feed-change"><span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span><i>→</i><span>{task.progress}% 完成</span></div></div><button>•••</button></article>)}</div>;
}

function DashboardView({ tasks, schema }: { tasks: Task[]; schema: DatabasePropertySchema }) {
  const groupProperty = schema.properties.find((property) => ["status", "select", "multi-select"].includes(property.type));
  const numberProperty = schema.properties.find((property) => property.type === "number");
  const firstGroup = groupProperty?.options?.[0];
  const groupedCount = firstGroup ? tasks.filter((task) => { const value = taskPropertyValue(task, groupProperty.id); return Array.isArray(value) ? value.includes(firstGroup) : value === firstGroup; }).length : 0;
  const numbers = tasks.map((task) => Number(numberProperty ? taskPropertyValue(task, numberProperty.id) : 0)).filter(Number.isFinite);
  const average = numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : 0;
  const filled = groupProperty ? tasks.filter((task) => { const value = taskPropertyValue(task, groupProperty.id); return value !== null && value !== undefined && value !== ""; }).length : 0;
  return <div className="dashboard-view"><div className="metric-card"><small>全部记录</small><strong>{tasks.length}</strong><span className="positive">当前视图</span></div><div className="metric-card"><small>{firstGroup ?? groupProperty?.name ?? "已分组"}</small><strong>{groupedCount}</strong><span>{groupProperty?.name ?? "无分组属性"}</span></div><div className="metric-card"><small>{numberProperty?.name ?? "数值"}平均</small><strong>{average}</strong><span className="positive">{numbers.length} 个数值</span></div><div className="metric-card"><small>{groupProperty?.name ?? "属性"}已填写</small><strong>{filled}</strong><span>{tasks.length - filled} 条未填写</span></div><div className="dashboard-wide"><ChartView tasks={tasks} groupProperty={groupProperty} numberProperty={numberProperty} /></div></div>;
}

function FormView({ schema, addTask, relationOptions }: { schema: DatabasePropertySchema; addTask: (title: string, properties?: Record<string, unknown>) => void; relationOptions: Record<string, RelationOption[]> }) {
  const [title, setTitle] = useState("");
  const [properties, setProperties] = useState<Record<string, unknown>>({});
  const formTask: Task = { id: "form-draft", title, status: "Inbox", priority: "Medium", due: "", day: 1, owner: "", tags: [], progress: 0, x: 50, y: 50, properties };
  const fields = schema.properties.filter((property) => property.type !== "title" && !derivedPropertyTypes.has(property.type) && property.type !== "button");
  return <div className="form-view"><div className="form-intro"><span>✦</span><div><h2>提交一条数据库记录</h2><p>表单字段来自当前动态属性 Schema，响应会直接进入同一数据源。</p></div></div><label>{schema.properties.find((property) => property.type === "title")?.name ?? "标题"} <b>*</b><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入记录标题" /></label><div className="dynamic-form-fields">{fields.map((property) => <DynamicPropertyInput key={property.id} property={property} task={formTask} relationOptions={property.relation ? relationOptions[property.relation.dataSourceId] : undefined} update={(id, value) => setProperties((current) => ({ ...current, [id]: value }))} />)}</div><button className="primary-button" onClick={() => { if (title.trim()) { addTask(title.trim(), properties); setTitle(""); setProperties({}); } }}>提交记录</button></div>;
}

const derivedPropertyTypes = new Set<DatabasePropertyType>(["created-time", "created-by", "last-edited-time", "last-edited-by", "formula", "rollup", "id"]);

function DynamicPropertyInput({ property, task, update, relationOptions = [] }: { property: DatabasePropertyDefinition; task: Task; update: (id: string, value: unknown) => void; relationOptions?: RelationOption[] }) {
  const value = taskPropertyValue(task, property.id);
  if (derivedPropertyTypes.has(property.type)) return <label className="computed-field"><span>{property.name}<small>{property.type}</small></span><output>{value === null || value === undefined || value === "" ? "—" : Array.isArray(value) ? value.join(" · ") : String(value)}</output></label>;
  if (property.type === "button") return <label className="computed-field"><span>{property.name}<small>button</small></span><button type="button" onClick={() => { if (property.button?.action === "open-url" && property.button.url) window.open(property.button.url, "_blank", "noopener,noreferrer"); else if (property.button?.propertyId) update(property.button.propertyId, property.button.value); }}>{property.button?.label || property.name}</button></label>;
  if (property.type === "checkbox") return <label className="checkbox-field"><span>{property.name}<small>checkbox</small></span><input type="checkbox" checked={Boolean(value)} onChange={(event) => update(property.id, event.target.checked)} /></label>;
  if (property.type === "select" || property.type === "status") return <label>{property.name}<select value={String(value ?? "")} onChange={(event) => update(property.id, event.target.value)}><option value="">未填写</option>{property.options?.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (property.type === "relation") return <label>{property.name}<select multiple value={Array.isArray(value) ? value.map(String) : []} onChange={(event) => update(property.id, [...event.currentTarget.selectedOptions].map((option) => option.value))}>{relationOptions.length ? relationOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>) : <option disabled>目标数据源暂无记录</option>}</select><small>按 Ctrl / ⌘ 可多选关联页面</small></label>;
  if (["multi-select", "files"].includes(property.type)) return <label>{property.name}<input value={Array.isArray(value) ? value.join(", ") : ""} onChange={(event) => update(property.id, event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="用逗号分隔" /></label>;
  if (property.type === "number") return <label>{property.name}<input type="number" value={Number(value ?? 0)} onChange={(event) => update(property.id, Number(event.target.value))} /></label>;
  return <label>{property.name}<input type={property.type === "email" ? "email" : property.type === "url" ? "url" : property.type === "phone" ? "tel" : property.type === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(event) => update(property.id, event.target.value)} placeholder={property.type === "place" ? "纬度, 经度或画布百分比坐标" : undefined} /></label>;
}

function DatabaseSchemaEditor({ schema, sources, currentSourceId, currentSourceName, saving, onClose, onSave }: { schema: DatabasePropertySchema; sources: DatabaseSourceSummary[]; currentSourceId: string; currentSourceName: string; saving: boolean; onClose: () => void; onSave: (schema: DatabasePropertySchema) => Promise<void> }) {
  const [draft, setDraft] = useState<DatabasePropertySchema>(() => structuredClone(schema));
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DatabasePropertyType>("text");
  const [error, setError] = useState("");
  const updateProperty = (id: string, patch: Partial<DatabasePropertyDefinition>) => setDraft((current) => ({ ...current, properties: current.properties.map((property) => property.id === id ? { ...property, ...patch } : property) }));
  const moveProperty = (id: string, direction: -1 | 1) => setDraft((current) => {
    const index = current.properties.findIndex((property) => property.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= current.properties.length) return current;
    const properties = [...current.properties];
    [properties[index], properties[destination]] = [properties[destination], properties[index]];
    return { ...current, properties };
  });
  const addProperty = () => {
    const name = newName.trim();
    if (!name) return;
    const base = name.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || `field_${draft.properties.length + 1}`;
    let id = /^[A-Za-z]/.test(base) ? base : `field_${base}`;
    let suffix = 2;
    while (draft.properties.some((property) => property.id === id)) id = `${base}_${suffix++}`;
    const property: DatabasePropertyDefinition = { id, name, type: newType };
    if (["select", "multi-select", "status"].includes(newType)) property.options = newType === "status" ? ["Not started", "In progress", "Done"] : ["Option 1", "Option 2"];
    if (newType === "formula") property.formula = "if(progress >= 100, \"Complete\", \"Active\")";
    if (newType === "relation") property.relation = { dataSourceId: currentSourceId, twoWay: false };
    if (newType === "rollup") property.rollup = { relationPropertyId: draft.properties.find((item) => item.type === "relation")?.id || "dependencies", targetPropertyId: "title", aggregation: "count" };
    if (newType === "id") property.idPrefix = "ID";
    if (newType === "button") property.button = { label: name, action: "set-property", propertyId: "status", value: "Done" };
    setDraft((current) => ({ ...current, properties: [...current.properties, property] }));
    setNewName("");
  };
  const save = async () => {
    setError("");
    try { await onSave(draft); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "属性 schema 保存失败"); }
  };
  const relationProperties = draft.properties.filter((property) => property.type === "relation");
  const writableTargets = draft.properties.filter((property) => !derivedPropertyTypes.has(property.type) && !["title", "button"].includes(property.type));
  const rollupTargets = (property: DatabasePropertyDefinition) => {
    const relation = relationProperties.find((candidate) => candidate.id === property.rollup?.relationPropertyId);
    if (!relation?.relation || relation.relation.dataSourceId === currentSourceId) return draft.properties;
    return sources.find((source) => source.id === relation.relation?.dataSourceId)?.schema.properties ?? [];
  };
  return (
    <div className="database-peek-backdrop" onMouseDown={onClose}>
      <aside className="database-page-peek schema-editor" onMouseDown={(event) => event.stopPropagation()}>
        <header><span>{currentSourceName} / 属性 Schema</span><div><button onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存 Schema"}</button><button onClick={onClose} aria-label="关闭属性编辑器">×</button></div></header>
        <div className="schema-editor-body">
          <div className="schema-intro"><span>◇</span><div><h2>动态属性</h2><p>属性定义、公式和关联配置会以 Markdown + JSON 同步到所有设备。</p></div></div>
          {draft.properties.map((property, index) => (
            <article key={property.id}>
              <div className="schema-property-main">
                <span className="schema-order"><button onClick={() => moveProperty(property.id, -1)} disabled={index === 0} aria-label={`上移 ${property.name}`}>↑</button><button onClick={() => moveProperty(property.id, 1)} disabled={index === draft.properties.length - 1} aria-label={`下移 ${property.name}`}>↓</button></span>
                <input value={property.name} onChange={(event) => updateProperty(property.id, { name: event.target.value })} aria-label={`${property.id} 名称`} />
                <code>{property.id}</code><span>{property.type}</span>
              </div>
              {["select", "multi-select", "status"].includes(property.type) && <input className="schema-config-input" value={property.options?.join(", ") ?? ""} onChange={(event) => updateProperty(property.id, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="选项，用逗号分隔" />}
              {property.type === "number" && <select className="schema-config-input" value={property.numberFormat ?? "number"} onChange={(event) => updateProperty(property.id, { numberFormat: event.target.value as DatabasePropertyDefinition["numberFormat"] })}><option value="number">数字</option><option value="percent">百分比</option><option value="currency">货币</option></select>}
              {property.type === "formula" && <input className="schema-config-input" value={property.formula ?? ""} onChange={(event) => updateProperty(property.id, { formula: event.target.value })} placeholder={'例如 if(progress >= 100, "Complete", "Active")'} />}
              {property.type === "relation" && <div className="schema-config-row"><select className="schema-config-input" value={property.relation?.dataSourceId ?? currentSourceId} onChange={(event) => updateProperty(property.id, { relation: { dataSourceId: event.target.value, twoWay: property.relation?.twoWay } })}>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><label><input type="checkbox" checked={Boolean(property.relation?.twoWay)} onChange={(event) => updateProperty(property.id, { relation: { dataSourceId: property.relation?.dataSourceId ?? currentSourceId, twoWay: event.target.checked } })} />双向关联</label></div>}
              {property.type === "rollup" && <div className="schema-config-row three"><select value={property.rollup?.relationPropertyId ?? ""} onChange={(event) => updateProperty(property.id, { rollup: { relationPropertyId: event.target.value, targetPropertyId: "title", aggregation: property.rollup?.aggregation ?? "count" } })}><option value="">选择关联</option>{relationProperties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select value={property.rollup?.targetPropertyId ?? "title"} onChange={(event) => updateProperty(property.id, { rollup: { relationPropertyId: property.rollup?.relationPropertyId ?? "", targetPropertyId: event.target.value, aggregation: property.rollup?.aggregation ?? "count" } })}>{rollupTargets(property).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select value={property.rollup?.aggregation ?? "count"} onChange={(event) => updateProperty(property.id, { rollup: { relationPropertyId: property.rollup?.relationPropertyId ?? "", targetPropertyId: property.rollup?.targetPropertyId ?? "title", aggregation: event.target.value as NonNullable<DatabasePropertyDefinition["rollup"]>["aggregation"] } })}>{["count", "count-values", "sum", "average", "min", "max", "percent-checked", "show-unique"].map((aggregation) => <option key={aggregation}>{aggregation}</option>)}</select></div>}
              {property.type === "button" && <div className="schema-config-row three"><input value={property.button?.label ?? property.name} onChange={(event) => updateProperty(property.id, { button: { ...property.button, label: event.target.value, action: property.button?.action ?? "set-property" } })} placeholder="按钮文字" /><select value={property.button?.action ?? "set-property"} onChange={(event) => updateProperty(property.id, { button: { label: property.button?.label ?? property.name, action: event.target.value as "set-property" | "open-url" } })}><option value="set-property">设置属性</option><option value="open-url">打开链接</option></select>{property.button?.action === "open-url" ? <input value={property.button.url ?? ""} onChange={(event) => updateProperty(property.id, { button: { ...property.button!, url: event.target.value } })} placeholder="https://" /> : <span className="schema-button-target"><select value={property.button?.propertyId ?? ""} onChange={(event) => updateProperty(property.id, { button: { ...property.button!, propertyId: event.target.value } })}><option value="">目标属性</option>{writableTargets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><input value={String(property.button?.value ?? "")} onChange={(event) => updateProperty(property.id, { button: { ...property.button!, value: event.target.value } })} placeholder="设置值" /></span>}</div>}
              {property.type === "id" && <input className="schema-config-input" value={property.idPrefix ?? "ID"} onChange={(event) => updateProperty(property.id, { idPrefix: event.target.value })} placeholder="ID 前缀" />}
              {property.type !== "title" && <button className="schema-delete" onClick={() => setDraft((current) => ({ ...current, properties: current.properties.filter((item) => item.id !== property.id) }))}>删除</button>}
            </article>
          ))}
          <div className="schema-add"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="新属性名称" /><select value={newType} onChange={(event) => setNewType(event.target.value as DatabasePropertyType)}>{DATABASE_PROPERTY_TYPES.filter((type) => type !== "title").map((type) => <option key={type} value={type}>{type}</option>)}</select><button onClick={addProperty}>添加属性</button></div>
          {error && <p className="schema-error">{error}</p>}
        </div>
      </aside>
    </div>
  );
}

function TaskPageDrawer({ task, schema, sourceName, relationOptions, onClose, onSave }: { task: Task; schema: DatabasePropertySchema; sourceName: string; relationOptions: Record<string, RelationOption[]>; onClose: () => void; onSave: (task: Task) => Promise<void> }) {
  const [draft, setDraft] = useState(task);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState("所有属性与正文都会保存为 Markdown");
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    addEventListener("keydown", closeOnEscape);
    return () => removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const save = async () => {
    setSaving(true);
    setSaveState("保存中…");
    try { await onSave(draft); setSaveState("已同步到数据源"); }
    catch { setSaveState("已保留本地修改，联网后重试"); }
    finally { setSaving(false); }
  };
  const updateDynamic = (id: string, value: unknown) => setDraft((current) => ({
    ...current,
    ...(id === "status" ? { status: String(value ?? "") } : {}),
    ...(id === "priority" ? { priority: String(value ?? "") } : {}),
    ...(id === "owner" ? { owner: String(value ?? "") } : {}),
    ...(id === "due" ? { due: String(value ?? "") } : {}),
    ...(id === "tags" ? { tags: Array.isArray(value) ? value.map(String) : [] } : {}),
    ...(id === "progress" ? { progress: Number(value ?? 0) } : {}),
    properties: { ...current.properties, [id]: value },
  }));
  return <div className="database-peek-backdrop" onMouseDown={onClose}><aside className="database-page-peek" onMouseDown={(event) => event.stopPropagation()}><header><span>{sourceName} / {draft.id}</span><div><button onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</button><button onClick={onClose} aria-label="关闭页面">×</button></div></header><div className="peek-body"><span className="peek-icon">▦</span><input className="peek-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="记录标题" /><div className="peek-properties">{schema.properties.filter((property) => property.type !== "title").map((property) => <DynamicPropertyInput key={property.id} property={property} task={draft} relationOptions={property.relation ? relationOptions[property.relation.dataSourceId] : undefined} update={updateDynamic} />)}</div><div className="peek-divider" /><label className="peek-markdown"><span>页面正文 · Markdown</span><textarea rows={12} value={draft.body ?? ""} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="记录背景、成功标准、资料和执行结果…" /></label><footer>{saveState}</footer></div></aside></div>;
}

const filterOperatorLabels: Record<FilterCondition["operator"], string> = {
  equals: "等于", not_equals: "不等于", contains: "包含", not_contains: "不包含",
  starts_with: "开头是", ends_with: "结尾是", greater_than: "大于", less_than: "小于",
  on_or_after: "不早于", on_or_before: "不晚于", is_empty: "为空", is_not_empty: "不为空",
};

function filterOperators(property?: DatabasePropertyDefinition): FilterCondition["operator"][] {
  if (!property) return ["contains", "not_contains", "is_empty", "is_not_empty"];
  if (property.type === "number") return ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"];
  if (["formula", "rollup"].includes(property.type)) return ["equals", "not_equals", "contains", "not_contains", "greater_than", "less_than", "is_empty", "is_not_empty"];
  if (["date", "created-time", "last-edited-time"].includes(property.type)) return ["equals", "not_equals", "on_or_after", "on_or_before", "is_empty", "is_not_empty"];
  if (["select", "status", "checkbox"].includes(property.type)) return ["equals", "not_equals", "is_empty", "is_not_empty"];
  if (["multi-select", "relation", "files"].includes(property.type)) return ["contains", "not_contains", "is_empty", "is_not_empty"];
  return ["contains", "not_contains", "equals", "not_equals", "starts_with", "ends_with", "is_empty", "is_not_empty"];
}

function defaultFilterValue(property?: DatabasePropertyDefinition) {
  if (!property) return "";
  if (property.type === "number") return 0;
  if (property.type === "checkbox") return true;
  if (["select", "multi-select", "status"].includes(property.type)) return property.options?.[0] ?? "";
  return "";
}

function defaultFilterCondition(schema: DatabasePropertySchema): FilterCondition {
  const property = schema.properties[0];
  return { type: "condition", property: property?.id ?? "title", operator: filterOperators(property)[0], value: defaultFilterValue(property) };
}

function FilterConditionEditor({ condition, schema, onChange, onRemove }: { condition: FilterCondition; schema: DatabasePropertySchema; onChange: (next: FilterCondition) => void; onRemove: () => void }) {
  const property = schema.properties.find((item) => item.id === condition.property) ?? schema.properties[0];
  const operators = filterOperators(property);
  const needsValue = !["is_empty", "is_not_empty"].includes(condition.operator);
  const updateProperty = (propertyId: string) => {
    const nextProperty = schema.properties.find((item) => item.id === propertyId);
    onChange({ type: "condition", property: propertyId, operator: filterOperators(nextProperty)[0], value: defaultFilterValue(nextProperty) });
  };
  return <div className="filter-condition-row"><select value={condition.property} onChange={(event) => updateProperty(event.target.value)} aria-label="筛选属性">{schema.properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as FilterCondition["operator"] })} aria-label="筛选运算符">{operators.map((operator) => <option key={operator} value={operator}>{filterOperatorLabels[operator]}</option>)}</select>{needsValue && property?.options?.length ? <select value={String(condition.value ?? "")} onChange={(event) => onChange({ ...condition, value: event.target.value })} aria-label="筛选值">{property.options.map((option) => <option key={option}>{option}</option>)}</select> : needsValue && property?.type === "checkbox" ? <select value={String(Boolean(condition.value))} onChange={(event) => onChange({ ...condition, value: event.target.value === "true" })} aria-label="筛选值"><option value="true">已勾选</option><option value="false">未勾选</option></select> : needsValue ? <input type={property?.type === "number" ? "number" : ["date", "created-time", "last-edited-time"].includes(property?.type ?? "") ? "date" : "text"} value={String(condition.value ?? "")} onChange={(event) => onChange({ ...condition, value: property?.type === "number" ? Number(event.target.value) : event.target.value })} placeholder="值" aria-label="筛选值" /> : <span className="filter-no-value">无需值</span>}<button className="filter-remove" onClick={onRemove} aria-label="删除筛选条件">×</button></div>;
}

function FilterGroupEditor({ group, schema, depth = 1, onChange, onRemove }: { group: FilterGroup; schema: DatabasePropertySchema; depth?: number; onChange: (next: FilterGroup) => void; onRemove?: () => void }) {
  const updateChild = (index: number, child: FilterCondition | FilterGroup) => onChange({ ...group, filters: group.filters.map((item, itemIndex) => itemIndex === index ? child : item) });
  const removeChild = (index: number) => onChange({ ...group, filters: group.filters.filter((_, itemIndex) => itemIndex !== index) });
  return <section className={`filter-group-editor depth-${depth}`}><header><span>{depth === 1 ? "满足" : `条件组 ${depth}`}</span><select value={group.operator} onChange={(event) => onChange({ ...group, operator: event.target.value as FilterGroup["operator"] })}><option value="and">全部条件（AND）</option><option value="or">任一条件（OR）</option></select>{onRemove && <button onClick={onRemove}>删除组</button>}</header><div className="filter-group-children">{group.filters.map((child, index) => child.type === "condition" ? <FilterConditionEditor key={`${depth}-condition-${index}`} condition={child} schema={schema} onChange={(next) => updateChild(index, next)} onRemove={() => removeChild(index)} /> : <FilterGroupEditor key={`${depth}-group-${index}`} group={child} schema={schema} depth={depth + 1} onChange={(next) => updateChild(index, next)} onRemove={() => removeChild(index)} />)}{group.filters.length === 0 && <p>还没有筛选条件，所有记录都会显示。</p>}</div><footer><button onClick={() => onChange({ ...group, filters: [...group.filters, defaultFilterCondition(schema)] })}>＋ 条件</button>{depth < 3 && <button onClick={() => onChange({ ...group, filters: [...group.filters, { type: "group", operator: "and", filters: [defaultFilterCondition(schema)] }] })}>＋ 条件组</button>}</footer></section>;
}

function SortEditor({ sorts, schema, onChange }: { sorts: ViewSort[]; schema: DatabasePropertySchema; onChange: (next: ViewSort[]) => void }) {
  const available = schema.properties.find((property) => !sorts.some((sort) => sort.property === property.id));
  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= sorts.length) return;
    const next = [...sorts];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  };
  return <div className="database-control-popover sort-editor"><strong>多重排序 · 从上到下优先</strong>{sorts.map((sort, index) => <div className="sort-editor-row" key={`${sort.property}-${index}`}><span><button onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button onClick={() => move(index, 1)} disabled={index === sorts.length - 1}>↓</button></span><select value={sort.property} onChange={(event) => onChange(sorts.map((item, itemIndex) => itemIndex === index ? { ...item, property: event.target.value } : item))}>{schema.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><select value={sort.direction} onChange={(event) => onChange(sorts.map((item, itemIndex) => itemIndex === index ? { ...item, direction: event.target.value as ViewSort["direction"] } : item))}><option value="ascending">升序</option><option value="descending">降序</option></select><button className="filter-remove" onClick={() => onChange(sorts.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}{sorts.length === 0 && <small>未设置排序，保留数据源顺序。</small>}<button className="sort-add" disabled={!available} onClick={() => available && onChange([...sorts, { property: available.id, direction: "ascending" }])}>＋ 添加排序</button></div>;
}

const conditionalColorLabels: Record<ConditionalColorRule["color"], string> = {
  gray: "灰", brown: "棕", orange: "橙", yellow: "黄", green: "绿", blue: "蓝", purple: "紫", pink: "粉", red: "红",
};

function ConditionalColorEditor({ rules, schema, onChange }: { rules: ConditionalColorRule[]; schema: DatabasePropertySchema; onChange: (rules: ConditionalColorRule[]) => void }) {
  const add = () => {
    const condition = defaultFilterCondition(schema);
    onChange([...rules, { property: condition.property, operator: condition.operator, value: condition.value, color: "purple" }]);
  };
  return <div className="database-control-popover conditional-color-editor"><strong>条件着色 · 第一条匹配规则生效</strong>{rules.map((rule, index) => <div className="conditional-color-row" key={`${rule.property}-${index}`} data-rule-color={rule.color}><FilterConditionEditor condition={{ type: "condition", property: rule.property, operator: rule.operator, value: rule.value }} schema={schema} onChange={(condition) => onChange(rules.map((item, itemIndex) => itemIndex === index ? { ...item, property: condition.property, operator: condition.operator, value: condition.value } : item))} onRemove={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))} /><select value={rule.color} onChange={(event) => onChange(rules.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value as ConditionalColorRule["color"] } : item))}>{DATABASE_CONDITIONAL_COLORS.map((color) => <option key={color} value={color}>{conditionalColorLabels[color]}</option>)}</select></div>)}{rules.length === 0 && <small>没有规则，记录使用当前主题背景。</small>}<button className="sort-add" disabled={rules.length >= 20} onClick={add}>＋ 添加颜色规则</button></div>;
}

function DatabaseTemplatesModal({ sourceId, sourceName, schema, templates, relationOptions, onClose, onChanged }: { sourceId: string; sourceName: string; schema: DatabasePropertySchema; templates: DatabaseTemplateSummary[]; relationOptions: Record<string, RelationOption[]>; onClose: () => void; onChanged: () => void }) {
  const emptyDraft = { id: "", name: "", icon: "✦", description: "", title: "未命名", body: "", properties: {} as Record<string, unknown>, baseRevision: undefined as number | undefined };
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("模板正文和预设属性都会进入 Markdown 工作区快照。");
  const templateTask: Task = { id: "template-draft", title: draft.title, status: String(draft.properties.status ?? ""), priority: String(draft.properties.priority ?? ""), due: String(draft.properties.due ?? ""), day: 1, owner: String(draft.properties.owner ?? ""), tags: Array.isArray(draft.properties.tags) ? draft.properties.tags.map(String) : [], progress: Number(draft.properties.progress ?? 0), x: 50, y: 50, properties: draft.properties };
  const edit = (template: DatabaseTemplateSummary) => setDraft({ id: template.id, name: template.name, icon: template.icon, description: template.description, title: template.title, body: template.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+(?:# .*?\r?\n+)?/, "").trim(), properties: { ...template.properties }, baseRevision: template.revision });
  const save = async () => {
    if (!draft.name.trim() || !draft.title.trim()) return;
    setBusy("save"); setFeedback("保存中…");
    try {
      const response = await fetch("/api/database", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save-template", sourceId, template: { ...draft, id: draft.id || undefined } }) });
      if (!response.ok) throw new Error(await responseError(response));
      setDraft(emptyDraft); setFeedback("模板已保存并同步。"); onChanged();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "模板保存失败"); }
    finally { setBusy(""); }
  };
  const createFromTemplate = async (template: DatabaseTemplateSummary) => {
    setBusy(template.id); setFeedback(`正在使用「${template.name}」创建记录…`);
    try {
      const response = await fetch("/api/database", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-from-template", sourceId, templateId: template.id }) });
      if (!response.ok) throw new Error(await responseError(response));
      setFeedback("已从模板创建记录。"); onChanged();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "创建记录失败"); }
    finally { setBusy(""); }
  };
  const remove = async (template: DatabaseTemplateSummary) => {
    setBusy(template.id);
    try {
      const response = await fetch(`/api/database?target=template&sourceId=${encodeURIComponent(sourceId)}&id=${encodeURIComponent(template.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      if (draft.id === template.id) setDraft(emptyDraft);
      setFeedback("模板已删除；删除墓碑会同步到其他设备。"); onChanged();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "模板删除失败"); }
    finally { setBusy(""); }
  };
  const editableProperties = schema.properties.filter((property) => property.type !== "title" && !derivedPropertyTypes.has(property.type) && property.type !== "button");
  return <div className="database-peek-backdrop" onMouseDown={onClose}><aside className="database-page-peek database-template-modal" onMouseDown={(event) => event.stopPropagation()}><header><span>{sourceName} / 数据库模板</span><div><button onClick={onClose}>完成</button><button onClick={onClose} aria-label="关闭模板">×</button></div></header><div className="template-manager-body"><section className="template-list"><div><strong>可用模板</strong><small>{templates.length} 个</small></div>{templates.map((template) => <article key={template.id}><span>{template.icon}</span><div><strong>{template.name}</strong><small>{template.description || template.title}</small></div><button disabled={Boolean(busy)} onClick={() => void createFromTemplate(template)}>使用</button><button disabled={Boolean(busy)} onClick={() => edit(template)}>编辑</button><button className="danger-text" disabled={Boolean(busy)} onClick={() => void remove(template)}>删除</button></article>)}</section><section className="template-editor"><header><div><strong>{draft.id ? "编辑模板" : "新建模板"}</strong><small>预设标题、属性与 Markdown 正文</small></div>{draft.id && <button onClick={() => setDraft(emptyDraft)}>新建另一个</button>}</header><div className="template-grid"><input value={draft.icon} maxLength={16} onChange={(event) => setDraft({ ...draft, icon: event.target.value })} aria-label="模板图标" /><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="模板名称" /><input className="wide" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="说明" /><input className="wide" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="新记录默认标题" /></div><div className="peek-properties">{editableProperties.map((property) => <DynamicPropertyInput key={property.id} property={property} task={templateTask} relationOptions={property.relation ? relationOptions[property.relation.dataSourceId] : undefined} update={(id, value) => setDraft((current) => ({ ...current, properties: { ...current.properties, [id]: value } }))} />)}</div><textarea rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="模板 Markdown 正文" /><button className="primary-button" disabled={busy === "save" || !draft.name.trim() || !draft.title.trim()} onClick={() => void save()}>{busy === "save" ? "保存中…" : "保存模板"}</button></section></div><footer>{feedback}</footer></aside></div>;
}

function DatabaseView() {
  const [view, setView] = useState<ViewType>("table");
  const [sourceId, setSourceId] = useState("product-tasks");
  const [sourceName, setSourceName] = useState("产品任务");
  const [sources, setSources] = useState<DatabaseSourceSummary[]>([]);
  const [templates, setTemplates] = useState<DatabaseTemplateSummary[]>([]);
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [sourceCreatorOpen, setSourceCreatorOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [databaseRefresh, setDatabaseRefresh] = useState(0);
  const [tasks, setTasks] = useState(initialTasks);
  const [propertySchema, setPropertySchema] = useState<DatabasePropertySchema>(defaultProductTaskPropertySchema);
  const [schemaRevision, setSchemaRevision] = useState(1);
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [viewMenu, setViewMenu] = useState(false);
  const [toolMenu, setToolMenu] = useState<"filter" | "sort" | "group" | "properties" | "colors" | undefined>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState<FilterGroup>({ type: "group", operator: "and", filters: [] });
  const [sorts, setSorts] = useState<ViewSort[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [subGroupBy, setSubGroupBy] = useState("");
  const [conditionalColors, setConditionalColors] = useState<ConditionalColorRule[]>([]);
  const [hiddenProperties, setHiddenProperties] = useState<string[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task>();
  const [syncState, setSyncState] = useState<"loading" | "synced" | "offline" | "saving">("loading");
  const viewRevisionsRef = useRef<Record<string, number>>({});
  const [remoteViewConfigs, setRemoteViewConfigs] = useState<Record<string, DatabaseViewConfig>>({});

  useEffect(() => {
    fetch(`/api/database?sourceId=${encodeURIComponent(sourceId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("database unavailable");
        return response.json() as Promise<{
          source: { id: string; name: string; schema: DatabasePropertySchema; schemaRevision: number };
          sources: DatabaseSourceSummary[];
          templates: DatabaseTemplateSummary[];
          relationOptions: Record<string, RelationOption[]>;
          views: Array<{ id: string; type: ViewType; revision: number; config: DatabaseViewConfig }>;
          records: Array<{ id: string; title: string; markdown: string; revision: number; properties: Record<string, unknown>; rawProperties: Record<string, unknown> }>;
        }>;
      })
      .then((payload) => {
        const nextSchema = payload.source.schema ?? defaultProductTaskPropertySchema;
        setSourceId(payload.source.id);
        setSourceName(payload.source.name);
        setSources(payload.sources);
        setTemplates(payload.templates);
        setRelationOptions(payload.relationOptions ?? {});
        setPropertySchema(nextSchema);
        setSchemaRevision(payload.source.schemaRevision ?? 1);
        const configs = Object.fromEntries(payload.views.map((item) => [item.type, item.config]));
        setRemoteViewConfigs(configs);
        viewRevisionsRef.current = Object.fromEntries(payload.views.map((item) => [item.type, item.revision]));
        const tableConfig = configs.table ?? {};
        setFilterGroup(tableConfig.filters ?? { type: "group", operator: "and", filters: [] });
        setSorts(tableConfig.sorts ?? []);
        setGroupBy(tableConfig.groupBy ?? "");
        setSubGroupBy(tableConfig.subGroupBy ?? "");
        setConditionalColors(tableConfig.conditionalColors ?? []);
        const propertyIds = nextSchema.properties.filter((property) => property.type !== "title").map((property) => property.id);
        const defaultVisible = propertyIds.slice(0, 8);
        setHiddenProperties(propertyIds.filter((property) => !(tableConfig.visibleProperties ?? defaultVisible).includes(property)));
        const nextTasks = payload.records.map((record) => {
          const marker = record.markdown.match(/<!-- sophie:block=.*?-->\n([\s\S]*)$/);
          const properties = { ...record.rawProperties, ...record.properties };
          if (!properties.place && Number.isFinite(Number(properties.x)) && Number.isFinite(Number(properties.y))) properties.place = `${properties.x},${properties.y}`;
          return {
            id: record.id,
            title: record.title,
            status: String(record.properties.status ?? ""),
            priority: String(record.properties.priority ?? ""),
            due: String(record.properties.due ?? ""),
            day: Number(record.properties.day ?? 1),
            owner: String(record.properties.owner ?? ""),
            tags: Array.isArray(record.properties.tags) ? record.properties.tags : [],
            progress: Number(record.properties.progress ?? 0),
            x: Number(record.properties.x ?? 50),
            y: Number(record.properties.y ?? 50),
            body: marker?.[1]?.trim() ?? "",
            revision: record.revision,
            properties,
          } as Task;
        });
        setTasks(nextTasks);
        setSelectedTask((current) => current ? nextTasks.find((task) => task.id === current.id) : undefined);
        setSyncState("synced");
      })
      .catch(() => setSyncState("offline"));
  }, [databaseRefresh, sourceId]);

  const selectView = (next: ViewType) => {
    setView(next);
    setToolMenu(undefined);
    const config = remoteViewConfigs[next] ?? {};
    setFilterGroup(config.filters ?? { type: "group", operator: "and", filters: [] });
    setSorts(config.sorts ?? []);
    setGroupBy(config.groupBy ?? (next === "board" ? "status" : ""));
    setSubGroupBy(config.subGroupBy ?? "");
    setConditionalColors(config.conditionalColors ?? []);
    const visible = config.visibleProperties ?? propertySchema.properties.filter((property) => property.type !== "title").slice(0, 8).map((property) => property.id);
    setHiddenProperties(propertySchema.properties.filter((property) => property.type !== "title").map((property) => property.id).filter((property) => !visible.includes(property)));
  };

  const filter = filterGroup.filters.length ? filterGroup : undefined;

  const visibleTasks = useMemo(() => applyViewQuery(tasks.map((task) => ({ ...task, properties: {
    ...task.properties,
    status: task.status, priority: task.priority, due: task.due, day: task.day, owner: task.owner,
    tags: task.tags, progress: task.progress, x: task.x, y: task.y,
  } as Record<string, string | number | boolean | string[] | null | undefined> })), { search, filter, sorts }), [filter, search, sorts, tasks]);

  useEffect(() => {
    if (syncState === "loading") return;
    const timeout = setTimeout(() => {
      const visibleProperties = propertySchema.properties.filter((property) => property.type !== "title" && !hiddenProperties.includes(property.id)).map((property) => property.id);
      fetch("/api/database", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-view", view: {
          id: `${sourceId}:${view}`,
          sourceId,
          name: view,
          type: view,
          config: { visibleProperties, filters: filter ?? null, sorts, groupBy: groupBy || null, subGroupBy: subGroupBy || null, openPagesIn: "side-peek", conditionalColors },
          baseRevision: viewRevisionsRef.current[view],
        } }),
      }).then(async (response) => {
        if (!response.ok) throw new Error("view save failed");
        const payload = await response.json() as { revision: number };
        viewRevisionsRef.current[view] = payload.revision;
        setRemoteViewConfigs((current) => ({ ...current, [view]: { visibleProperties, filters: filter ?? null, sorts, groupBy: groupBy || null, subGroupBy: subGroupBy || null, conditionalColors } }));
      }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timeout);
  }, [conditionalColors, filter, groupBy, hiddenProperties, propertySchema, sorts, sourceId, subGroupBy, syncState, view]);

  const saveTask = useCallback(async (task: Task) => {
    setSyncState("saving");
    const response = await fetch("/api/database", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "upsert-record", sourceId, record: {
        id: task.id,
        title: task.title,
        body: task.body ?? "",
        properties: { ...task.properties, status: task.status, priority: task.priority, due: task.due, day: task.day, owner: task.owner, tags: task.tags, progress: task.progress, x: task.x, y: task.y },
        baseRevision: task.revision,
      } }),
    });
    if (!response.ok) { setSyncState("offline"); throw new Error(response.status === 409 ? "revision_conflict" : "save_failed"); }
    const payload = await response.json() as { revision: number };
    const raw = { ...task.properties, status: task.status, priority: task.priority, due: task.due, day: task.day, owner: task.owner, tags: task.tags, progress: task.progress, x: task.x, y: task.y };
    const recordsById = new Map(tasks.map((item) => [item.id, { title: item.title, properties: item.properties ?? {} }]));
    const properties = computeDatabaseProperties({ schema: propertySchema, raw, record: { id: task.id, title: task.title }, recordsById });
    const saved = { ...task, revision: payload.revision, properties };
    setTasks((current) => current.map((item) => item.id === saved.id ? saved : item));
    setSelectedTask((current) => current?.id === saved.id ? saved : current);
    setSyncState("synced");
    setDatabaseRefresh((current) => current + 1);
  }, [propertySchema, sourceId, tasks]);

  const savePropertySchema = useCallback(async (schema: DatabasePropertySchema) => {
    setSchemaSaving(true);
    try {
      const response = await fetch("/api/database", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-schema", sourceId, schema, baseRevision: schemaRevision }),
      });
      const payload = await response.json() as { error?: string; schema?: DatabasePropertySchema; revision?: number };
      if (!response.ok || !payload.schema || !payload.revision) throw new Error(payload.error || "属性 schema 保存失败");
      setPropertySchema(payload.schema);
      setSchemaRevision(payload.revision);
      const propertyIds = new Set(payload.schema.properties.map((property) => property.id));
      setHiddenProperties((current) => current.filter((id) => propertyIds.has(id)));
      setTasks((current) => {
        const recordsById = new Map(current.map((item) => [item.id, { title: item.title, properties: item.properties ?? {} }]));
        return current.map((task) => ({ ...task, properties: computeDatabaseProperties({ schema: payload.schema!, raw: task.properties ?? {}, record: { id: task.id, title: task.title }, recordsById }) }));
      });
      setSyncState("synced");
      setDatabaseRefresh((current) => current + 1);
    } finally { setSchemaSaving(false); }
  }, [schemaRevision, sourceId]);

  const move = (id: string, propertyId: string, value: unknown) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const property = propertySchema.properties.find((item) => item.id === propertyId);
    const propertyValue = property?.type === "multi-select" ? (value === null ? [] : [String(value)]) : value;
    const next: Task = { ...task, properties: { ...task.properties, [propertyId]: propertyValue } };
    if (propertyId === "status") next.status = String(value ?? "") as Task["status"];
    if (propertyId === "priority") next.priority = String(value ?? "") as Task["priority"];
    if (propertyId === "owner") next.owner = String(value ?? "");
    if (propertyId === "due") next.due = String(value ?? "");
    if (propertyId === "tags") next.tags = Array.isArray(propertyValue) ? propertyValue.map(String) : [];
    if (propertyId === "progress") next.progress = Number(value ?? 0);
    setTasks((current) => current.map((item) => item.id === id ? next : item));
    void saveTask(next).catch(() => undefined);
  };
  const addTask = (title: string, formProperties: Record<string, unknown> = {}) => {
    const statusProperty = propertySchema.properties.find((property) => property.type === "status");
    const priorityProperty = propertySchema.properties.find((property) => property.id === "priority");
    const task: Task = { id: `record-${crypto.randomUUID()}`, title, status: String(formProperties.status ?? statusProperty?.options?.[0] ?? ""), priority: String(formProperties.priority ?? priorityProperty?.options?.[0] ?? ""), due: String(formProperties.due ?? ""), day: new Date().getDate(), owner: String(formProperties.owner ?? ""), tags: Array.isArray(formProperties.tags) ? formProperties.tags.map(String) : [], progress: Number(formProperties.progress ?? 0), x: 50, y: 50, body: "", properties: formProperties };
    setTasks((current) => [...current, task]);
    setSelectedTask(task);
    void saveTask(task).catch(() => undefined);
  };
  const createSource = async () => {
    const name = newSourceName.trim();
    if (!name) return;
    setSyncState("saving");
    try {
      const response = await fetch("/api/database", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-source", name }) });
      const payload = await response.json() as { source?: DatabaseSourceSummary; error?: string };
      if (!response.ok || !payload.source) throw new Error(payload.error || "数据源创建失败");
      setNewSourceName("");
      setSourceCreatorOpen(false);
      setView("table");
      setSourceId(payload.source.id);
      setSelectedTask(undefined);
    } catch { setSyncState("offline"); }
  };

  const groupedTasks = useMemo(() => {
    return groupTasksByProperty(visibleTasks, groupBy);
  }, [groupBy, visibleTasks]);

  const boardProperty = propertySchema.properties.find((property) => property.id === groupBy)
    ?? propertySchema.properties.find((property) => ["status", "select", "multi-select", "checkbox"].includes(property.type));
  const boardSubGroupProperty = propertySchema.properties.find((property) => property.id === subGroupBy);
  const dateProperty = propertySchema.properties.find((property) => property.type === "date")
    ?? propertySchema.properties.find((property) => ["created-time", "last-edited-time"].includes(property.type));
  const placeProperty = propertySchema.properties.find((property) => property.type === "place");
  const chartGroupProperty = propertySchema.properties.find((property) => property.id === groupBy)
    ?? propertySchema.properties.find((property) => ["status", "select", "multi-select"].includes(property.type));
  const chartNumberProperty = propertySchema.properties.find((property) => property.type === "number");
  const filterCount = useMemo(() => {
    const count = (node: FilterCondition | FilterGroup): number => node.type === "condition" ? 1 : node.filters.reduce((sum, child) => sum + count(child), 0);
    return count(filterGroup);
  }, [filterGroup]);
  return (
    <main className="database-content">
      <header className="database-title"><div><span className="database-icon">▦</span><div><span className="database-source-picker"><select value={sourceId} onChange={(event) => { setSyncState("loading"); setView("table"); setSourceId(event.target.value); setSelectedTask(undefined); }}>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><button onClick={() => setSourceCreatorOpen((open) => !open)}>＋ 数据源</button></span><h1>{sourceName}</h1><p>{visibleTasks.length} / {tasks.length} 条记录 · {propertySchema.properties.length} 个属性 · {sources.length} 个数据源 · {syncState === "synced" ? "云端已同步" : syncState === "saving" ? "保存中…" : syncState === "loading" ? "正在加载数据源…" : "离线副本"}</p>{sourceCreatorOpen && <span className="database-source-creator"><input autoFocus value={newSourceName} onChange={(event) => setNewSourceName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createSource()} placeholder="新数据源名称" /><button onClick={() => void createSource()}>创建</button></span>}</div></div><div><button className="quiet-button" onClick={() => setTemplateEditorOpen(true)}>模板 {templates.length}</button><button className="quiet-button" onClick={() => setSchemaEditorOpen(true)}>编辑属性</button><button className="primary-small" onClick={() => addTask("未命名")}>＋ 新建</button></div></header>
      <div className="view-tabs"><div className="visible-tabs">{viewOptions.slice(0, 6).map((option) => <button className={view === option.id ? "active" : ""} key={option.id} onClick={() => selectView(option.id)}><span>{option.icon}</span>{option.label}</button>)}</div><div className="view-more"><button onClick={() => setViewMenu(!viewMenu)}>更多视图⌄</button>{viewMenu && <div className="view-menu">{viewOptions.slice(6).map((option) => <button key={option.id} onClick={() => { selectView(option.id); setViewMenu(false); }}><span>{option.icon}</span><div><b>{option.label}</b><small>{option.id === "form" ? "收集信息" : option.id === "map" ? "按位置展示" : "分析与组织数据"}</small></div></button>)}</div>}</div><div className="view-tools"><button className={searchOpen ? "active" : ""} onClick={() => setSearchOpen(!searchOpen)}>⌕</button><button className={toolMenu === "filter" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "filter" ? undefined : "filter")}>筛选 {filterCount > 0 && <b>{filterCount}</b>}</button><button className={toolMenu === "sort" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "sort" ? undefined : "sort")}>排序 {sorts.length > 0 && <b>{sorts.length}</b>}</button><button className={toolMenu === "group" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "group" ? undefined : "group")}>分组</button><button className={toolMenu === "colors" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "colors" ? undefined : "colors")}>颜色 {conditionalColors.length > 0 && <b>{conditionalColors.length}</b>}</button><button className={toolMenu === "properties" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "properties" ? undefined : "properties")}>属性</button></div></div>
      {(searchOpen || toolMenu) && <div className="database-controls">
        {searchOpen && <label className="database-search"><span>⌕</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索当前数据源…" /><button onClick={() => { setSearch(""); setSearchOpen(false); }}>×</button></label>}
        {toolMenu === "filter" && <div className="database-control-popover filter-builder"><strong>高级筛选 · 最多三层</strong><FilterGroupEditor group={filterGroup} schema={propertySchema} onChange={setFilterGroup} /><button className="filter-clear" disabled={filterCount === 0} onClick={() => setFilterGroup({ type: "group", operator: "and", filters: [] })}>清空全部筛选</button></div>}
        {toolMenu === "sort" && <SortEditor sorts={sorts} schema={propertySchema} onChange={setSorts} />}
        {toolMenu === "colors" && <ConditionalColorEditor rules={conditionalColors} schema={propertySchema} onChange={setConditionalColors} />}
        {toolMenu === "group" && <div className="database-control-popover"><strong>分组与子分组</strong><label>分组<select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option value="">不分组</option>{propertySchema.properties.filter((property) => property.type !== "title").map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label>子分组<select value={subGroupBy} onChange={(event) => setSubGroupBy(event.target.value)}><option value="">无</option>{propertySchema.properties.filter((property) => property.type !== "title" && property.id !== groupBy).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label></div>}
        {toolMenu === "properties" && <div className="database-control-popover property-control"><strong>属性可见性</strong>{propertySchema.properties.filter((property) => property.type !== "title").map((property) => <label key={property.id}><input type="checkbox" checked={!hiddenProperties.includes(property.id)} onChange={() => setHiddenProperties((current) => current.includes(property.id) ? current.filter((item) => item !== property.id) : [...current, property.id])} /><span>{property.name}<small>{property.type}</small></span></label>)}<button className="schema-manage-button" onClick={() => { setToolMenu(undefined); setSchemaEditorOpen(true); }}>管理属性 Schema</button></div>}
      </div>}
      <section className={`view-canvas view-${view}`}>
        {view === "table" && <div className="grouped-database">{[...groupedTasks].map(([name, group]) => <section key={name || "all"}>{name && <header><strong>{name}</strong><span>{group.length}</span></header>}{subGroupBy ? <div className="database-subgroups">{[...groupTasksByProperty(group, subGroupBy)].map(([subName, subRecords]) => <section key={subName}><header><strong>{subName}</strong><span>{subRecords.length}</span><small>{propertySchema.properties.find((property) => property.id === subGroupBy)?.name ?? subGroupBy}</small></header><TableView tasks={subRecords} schema={propertySchema} onOpen={setSelectedTask} hidden={hiddenProperties} conditionalColors={conditionalColors} /></section>)}</div> : <TableView tasks={group} schema={propertySchema} onOpen={setSelectedTask} hidden={hiddenProperties} conditionalColors={conditionalColors} />}</section>)}</div>}
        {view === "board" && <BoardView tasks={visibleTasks} property={boardProperty} subGroupProperty={boardSubGroupProperty} move={move} onOpen={setSelectedTask} conditionalColors={conditionalColors} />}
        {view === "timeline" && <TimelineView tasks={visibleTasks} dateProperty={dateProperty} />}
        {view === "calendar" && <CalendarView tasks={visibleTasks} dateProperty={dateProperty} onOpen={setSelectedTask} />}
        {view === "list" && <div className="simple-list">{visibleTasks.map((task) => <button key={task.id} data-row-color={taskConditionalColor(task, conditionalColors)} onClick={() => setSelectedTask(task)}><span className={`task-check ${task.status === "Done" || task.status === "已完成" ? "done" : ""}`}>{task.status === "Done" || task.status === "已完成" ? "✓" : ""}</span><strong>{task.title}</strong>{task.status && <span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span>}<small>{task.due}</small><i>›</i></button>)}</div>}
        {view === "gallery" && <GalleryView tasks={visibleTasks} onOpen={setSelectedTask} />}
        {view === "chart" && <ChartView tasks={visibleTasks} groupProperty={chartGroupProperty} numberProperty={chartNumberProperty} />}
        {view === "map" && <MapView tasks={visibleTasks} placeProperty={placeProperty} onOpen={setSelectedTask} />}
        {view === "feed" && <FeedView tasks={visibleTasks} />}
        {view === "dashboard" && <DashboardView tasks={visibleTasks} schema={propertySchema} />}
        {view === "form" && <FormView schema={propertySchema} addTask={addTask} relationOptions={relationOptions} />}
      </section>
      {selectedTask && <TaskPageDrawer key={selectedTask.id} task={selectedTask} schema={propertySchema} sourceName={sourceName} relationOptions={relationOptions} onClose={() => setSelectedTask(undefined)} onSave={saveTask} />}
      {schemaEditorOpen && <DatabaseSchemaEditor key={`${sourceId}-${schemaRevision}`} schema={propertySchema} sources={sources} currentSourceId={sourceId} currentSourceName={sourceName} saving={schemaSaving} onClose={() => setSchemaEditorOpen(false)} onSave={savePropertySchema} />}
      {templateEditorOpen && <DatabaseTemplatesModal sourceId={sourceId} sourceName={sourceName} schema={propertySchema} templates={templates} relationOptions={relationOptions} onClose={() => setTemplateEditorOpen(false)} onChanged={() => setDatabaseRefresh((current) => current + 1)} />}
    </main>
  );
}

type AgentWorkResult = {
  id: string;
  status: string;
  modelId: string;
  team?: { summary: string; strategy: string; agents: Array<{ name: string; role: string; modelId: string; deliverable: string }> };
  specialists?: Array<{ id: string; name: string; role: string; modelId: string; deliverable: string; status: string; output: string }>;
};

function ModelSettingsModal({ settings, onClose, onChanged }: { settings?: PublicModelSettings; onClose: () => void; onChanged: () => Promise<void> }) {
  const [providerValues, setProviderValues] = useState({ openai: "", openrouter: "", ollama: "" });
  const [custom, setCustom] = useState({ id: "", label: "", provider: "Custom", model: "", baseURL: "", capabilities: "", apiKey: "", useResponses: false });
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState(settings?.vaultAvailable ? "已保存的密钥不会再次显示。" : "部署管理员需要先设置 CONNECTOR_ENCRYPTION_KEY。 ");
  const request = async (url: string, init: RequestInit, key: string) => {
    setBusy(key); setFeedback("");
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(await responseError(response));
      await onChanged();
      setFeedback("模型配置已安全保存；新请求会立即使用。 ");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "模型配置失败"); }
    finally { setBusy(""); }
  };
  const saveProvider = async (provider: "openai" | "openrouter" | "ollama") => {
    const value = providerValues[provider].trim();
    if (!value) return;
    await request("/api/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-provider", provider, value }) }, provider);
    setProviderValues((current) => ({ ...current, [provider]: "" }));
  };
  const removeProvider = (provider: "openai" | "openrouter" | "ollama") => request(`/api/models?target=${provider}`, { method: "DELETE" }, provider);
  const saveCustom = async () => {
    const profile: Record<string, unknown> = {
      id: custom.id.trim(), label: custom.label.trim(), provider: custom.provider.trim(), model: custom.model.trim(),
      baseURL: custom.baseURL.trim(), capabilities: custom.capabilities.split(",").map((item) => item.trim()).filter(Boolean), useResponses: custom.useResponses,
    };
    if (custom.apiKey.trim()) profile.apiKey = custom.apiKey.trim();
    await request("/api/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "upsert-custom", profile }) }, "custom");
    setCustom({ id: "", label: "", provider: "Custom", model: "", baseURL: "", capabilities: "", apiKey: "", useResponses: false });
  };
  const editCustom = (profile: PublicModelSettings["customModels"][number]) => setCustom({ id: profile.id, label: profile.label, provider: profile.provider, model: profile.model, baseURL: profile.baseURL, capabilities: profile.capabilities.join(", "), apiKey: "", useResponses: profile.useResponses });
  return <div className="secret-modal-backdrop" onMouseDown={onClose}><section className="secret-modal model-secret-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>MODEL VAULT</span><h2>工作区模型与密钥</h2><p>AES-256-GCM 加密保存；浏览器只能读取“是否已配置”。</p></div><button onClick={onClose}>×</button></header><div className="secret-modal-body"><section className="provider-secret-list">{(["openai", "openrouter", "ollama"] as const).map((provider) => { const status = settings?.providers[provider]; const isUrl = provider === "ollama"; return <article key={provider}><div><strong>{provider === "openrouter" ? "OpenRouter" : provider === "openai" ? "OpenAI" : "Ollama / 自托管"}</strong><small>{status?.configured ? `已配置 · ${status.source === "workspace" ? "当前工作区" : "部署环境"}` : "未配置"}</small></div><input type={isUrl ? "url" : "password"} autoComplete="new-password" value={providerValues[provider]} onChange={(event) => setProviderValues((current) => ({ ...current, [provider]: event.target.value }))} placeholder={isUrl ? "公开 HTTPS OpenAI-compatible 地址" : "粘贴新的 API key"} /><button disabled={busy === provider || !providerValues[provider].trim() || !settings?.vaultAvailable} onClick={() => void saveProvider(provider)}>保存</button>{status?.source === "workspace" && <button className="danger-text" disabled={busy === provider} onClick={() => void removeProvider(provider)}>移除</button>}</article>; })}</section><section className="custom-model-editor"><header><div><strong>自定义 OpenAI-compatible 模型</strong><small>只允许公开 HTTPS endpoint，阻止本机和私有网段地址。</small></div></header>{settings?.customModels.map((profile) => <article className="custom-model-row" key={profile.id}><div><strong>{profile.label}</strong><small>{profile.id} · {profile.model} · {profile.hasKey ? "有密钥" : "无密钥"}</small></div><button onClick={() => editCustom(profile)}>编辑</button><button className="danger-text" disabled={busy === profile.id} onClick={() => void request(`/api/models?target=custom&id=${encodeURIComponent(profile.id)}`, { method: "DELETE" }, profile.id)}>删除</button></article>)}<div className="custom-model-form"><input value={custom.id} onChange={(event) => setCustom({ ...custom, id: event.target.value })} placeholder="ID，例如 my:model" /><input value={custom.label} onChange={(event) => setCustom({ ...custom, label: event.target.value })} placeholder="显示名称" /><input value={custom.provider} onChange={(event) => setCustom({ ...custom, provider: event.target.value })} placeholder="提供商" /><input value={custom.model} onChange={(event) => setCustom({ ...custom, model: event.target.value })} placeholder="模型名" /><input className="wide" type="url" value={custom.baseURL} onChange={(event) => setCustom({ ...custom, baseURL: event.target.value })} placeholder="https://example.com/v1" /><input className="wide" value={custom.capabilities} onChange={(event) => setCustom({ ...custom, capabilities: event.target.value })} placeholder="能力标签，用逗号分隔" /><input className="wide" type="password" autoComplete="new-password" value={custom.apiKey} onChange={(event) => setCustom({ ...custom, apiKey: event.target.value })} placeholder="API key（编辑时留空会保留原密钥）" /><label className="wide"><input type="checkbox" checked={custom.useResponses} onChange={(event) => setCustom({ ...custom, useResponses: event.target.checked })} />使用 Responses API</label><button className="primary-small" disabled={busy === "custom" || !settings?.vaultAvailable || !custom.id.trim() || !custom.label.trim() || !custom.model.trim() || !custom.baseURL.trim()} onClick={() => void saveCustom()}>保存自定义模型</button></div></section></div><footer><span>{feedback}</span><button onClick={onClose}>完成</button></footer></section></div>;
}

function AgentsView() {
  const [goal, setGoal] = useState("调研并制定 SuperSophie 下一阶段的可靠实施计划");
  const [runState, setRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [result, setResult] = useState<AgentWorkResult>();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const { models, defaultModelId, settings, refresh } = useModelCatalog();
  const [modelId, setModelId] = useState("");
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const activeModelId = modelId || defaultModelId;

  const runTeam = async () => {
    if (!goal.trim() || runState === "running") return;
    setRunState("running");
    setResult(undefined);
    setAnswer("");
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: goal, mode: "team", modelId: activeModelId }),
      });
      const payload = await response.json() as { error?: string; message?: { content: string }; run?: AgentWorkResult };
      if (!response.ok || !payload.run || !payload.message) throw new Error(payload.error || "Agent 团队运行失败");
      setResult(payload.run);
      setAnswer(payload.message.content);
      setRunState("completed");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Agent 团队运行失败");
      setRunState("failed");
    }
  };

  const teamMembers = result?.specialists ?? [];
  return (
    <main className="agents-content">
      <header className="section-title">
        <div><span className="large-section-icon">✦</span><div><p className="eyebrow">MULTI-AGENT WORKSPACE</p><h1>Agent Work</h1><p>描述目标，Sophie 会先规划，再动态创建最合适的专家团队。</p></div></div>
        <button className="primary-button" onClick={runTeam} disabled={runState === "running"}>{runState === "running" ? "团队执行中…" : result ? "重新运行" : "运行 Agent 团队"}</button>
      </header>
      <section className="goal-composer">
        <div className="composer-glow">✦</div>
        <div><label>团队目标</label><textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={2} /></div>
        <div className="composer-settings"><span>协调模型</span><select value={activeModelId} onChange={(event) => setModelId(event.target.value)}>{(models.length ? models : [{ id: activeModelId, label: "GPT-5.6", available: false } as ModelProfile]).map((model) => <option key={model.id} value={model.id} disabled={!model.available}>{model.label}{model.available ? "" : " · 未配置"}</option>)}</select><button type="button">策略：并行专家⌄</button></div>
      </section>
      <section className="agent-work-grid">
        <div className="team-panel">
          <div className="panel-heading"><div><span className="section-kicker">TEAM</span><h3>执行团队</h3></div><span className="live-pill"><StatusDot tone={runState === "failed" ? "amber" : runState === "idle" ? "gray" : "green"} />{{ idle: "等待目标", running: "组建并执行中", completed: "已完成", failed: "运行失败" }[runState]}</span></div>
          <div className="agent-list">
            <article><span className="agent-avatar violet">SO<i className={runState === "idle" ? "waiting" : ""} /></span><div><h4>Sophie<b>LEAD</b></h4><p>规划团队并汇总最终结果</p><small>{models.find((model) => model.id === activeModelId)?.label ?? activeModelId}</small></div><span className="agent-state state-0">{runState === "running" ? "协调中" : runState === "completed" ? "已完成" : "待命"}</span></article>
            {teamMembers.map((member, index) => <article key={member.id}><span className={`agent-avatar ${["blue", "amber", "mint", "violet"][index % 4]}`}>{member.name.slice(0, 2).toUpperCase()}<i className={member.status === "failed" ? "waiting" : ""} /></span><div><h4>{member.name}</h4><p>{member.role}</p><small>{models.find((model) => model.id === member.modelId)?.label ?? member.modelId}</small></div><span className={`agent-state state-${Math.min(index + 1, 3)}`}>{member.status === "completed" ? "已完成" : "失败"}</span></article>)}
            {runState === "running" && [0, 1, 2].map((index) => <article className="agent-skeleton" key={index}><span className="agent-avatar gray">…</span><div><h4>正在创建专家</h4><p>由规划结果决定职责与模型</p><small>动态 Agent</small></div><span className="agent-state">规划中</span></article>)}
          </div>
          <p className="agent-team-note">子 Agent 不是预设演示卡片：职责、数量和模型由每次目标的规划结果动态生成。</p>
        </div>
        <div className="run-panel">
          <div className="panel-heading"><div><span className="section-kicker">EXECUTION</span><h3>执行脉络</h3></div><span>{result ? `Run ${result.id.slice(0, 8)}` : "Markdown 日志"}</span></div>
          <div className="run-timeline">
            {runState === "idle" && <div className="agent-empty"><Robot /><h4>还没有运行</h4><p>输入一个真实目标，Sophie 会创建团队并把过程保存为 Markdown。</p></div>}
            {runState === "running" && <div className="run-step active"><span>1</span><div><small>进行中</small><h4>分析目标并创建专家团队</h4><p>正在调用已配置模型；复杂目标可能需要一些时间。</p><i className="step-progress"><b style={{ width: "58%" }} /></i></div></div>}
            {teamMembers.map((member, index) => <div className={`run-step ${member.status === "completed" ? "done" : "waiting"}`} key={member.id}><span>{member.status === "completed" ? "✓" : "!"}</span><div><small>{member.status === "completed" ? "已完成" : "失败"}</small><h4>{member.deliverable}</h4><p>{member.name} · {member.output.slice(0, 100)}</p></div><i>{index + 1}</i></div>)}
            {answer && <div className="agent-final-output"><span className="section-kicker">SOPHIE SYNTHESIS</span><h4>最终汇总</h4><p>{answer}</p></div>}
            {error && <div className="agent-run-error"><strong>运行未完成</strong><p>{error}</p></div>}
          </div>
        </div>
      </section>
      <section className="model-strip"><div><span className="section-kicker">MODEL ROUTER</span><h3>多模型路由</h3><p>内置 OpenAI、OpenRouter、Ollama，并支持工作区自定义 OpenAI-compatible 模型。</p></div>{models.slice(0, 4).map((model) => <article key={model.id}><span className={`provider-mark ${model.provider.toLowerCase()}`}>{model.provider[0]}</span><div><strong>{model.label}</strong><small>{model.capabilities.join(" · ")}</small></div><StatusDot tone={model.available ? "green" : "gray"} /></article>)}<button className="model-settings" onClick={() => setModelSettingsOpen(true)}>管理模型与加密密钥</button></section>
      {modelSettingsOpen && <ModelSettingsModal settings={settings} onClose={() => setModelSettingsOpen(false)} onChanged={refresh} />}
    </main>
  );
}

type CodeFileState = { id: string; path: string; language: string; content: string; revision: number; hash?: string };

function clientLanguage(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({ ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", json: "json", md: "markdown", css: "css", html: "html", py: "python" } as Record<string, string>)[extension || ""] || "text";
}

function CodeView() {
  const [mode, setMode] = useState<"cloud" | "local">("cloud");
  const [projectName, setProjectName] = useState("SuperSophie Cloud Code");
  const [files, setFiles] = useState<CodeFileState[]>([]);
  const [file, setFile] = useState("");
  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkCommand, setCheckCommand] = useState<"test" | "typecheck" | "lint">("test");
  const [logs, setLogs] = useState(["● 正在读取 App Cloud 代码项目…"]);

  const loadCloud = useCallback(async () => {
    const response = await fetch("/api/code");
    if (!response.ok) throw new Error(await responseError(response));
    const payload = await response.json() as { project: { name: string }; files: CodeFileState[]; execution: { reason: string } };
    setMode("cloud");
    setProjectName(payload.project.name);
    setFiles(payload.files);
    const first = payload.files[0];
    if (first) { setFile(first.path); setCode(first.content); setOriginalCode(first.content); }
    setDirty(false);
    setLogs(["✓ 云端代码项目已载入", `● ${payload.execution.reason}`]);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void loadCloud().catch((error) => setLogs([`✕ ${error instanceof Error ? error.message : "代码项目读取失败"}`])); });
    return () => cancelAnimationFrame(frame);
  }, [loadCloud]);

  const select = async (next: string) => {
    if (next === file) return;
    if (dirty && !confirm("当前文件有未保存改动，确定切换吗？")) return;
    try {
      if (mode === "cloud") {
        const selected = files.find((item) => item.path === next);
        if (!selected) return;
        setFile(next); setCode(selected.content); setOriginalCode(selected.content); setDirty(false);
      } else {
        const bridge = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
        if (!bridge) throw new Error("桌面文件桥接不可用");
        const selected = await bridge.readCodeFile(next);
        setFiles((current) => current.map((item) => item.path === next ? { ...item, content: selected.content, hash: selected.hash } : item));
        setFile(next); setCode(selected.content); setOriginalCode(selected.content); setDirty(false);
      }
    } catch (error) { setLogs([`✕ ${error instanceof Error ? error.message : "文件读取失败"}`]); }
  };

  const save = async () => {
    const current = files.find((item) => item.path === file);
    if (!current) return;
    setBusy(true);
    try {
      if (mode === "cloud") {
        const response = await fetch("/api/code", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", file: { id: current.id, content: code, baseRevision: current.revision } }),
        });
        if (!response.ok) throw new Error(await responseError(response));
        const result = await response.json() as { revision: number };
        setFiles((items) => items.map((item) => item.id === current.id ? { ...item, content: code, revision: result.revision } : item));
        setLogs([`✓ 已保存到 App Cloud · revision ${result.revision}`, "● Markdown 包装真相源已同步更新"]);
      } else {
        const bridge = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
        if (!bridge) throw new Error("桌面文件桥接不可用");
        const result = await bridge.saveCodeFile({ path: current.path, content: code, expectedHash: current.hash || null });
        setFiles((items) => items.map((item) => item.path === current.path ? { ...item, content: code, hash: result.hash } : item));
        setLogs([`✓ 已原子写入本地文件 ${current.path}`, `● SHA-256 ${result.hash.slice(0, 12)}…`]);
      }
      setOriginalCode(code); setDirty(false);
    } catch (error) { setLogs([`✕ ${error instanceof Error ? error.message : "保存失败"}`]); }
    finally { setBusy(false); }
  };

  const createFile = async () => {
    const path = prompt("输入新文件路径，例如 src/feature.ts");
    if (!path?.trim()) return;
    setBusy(true);
    try {
      if (mode === "cloud") {
        const response = await fetch("/api/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", path, content: "" }) });
        if (!response.ok) throw new Error(await responseError(response));
        const result = await response.json() as { file: CodeFileState };
        setFiles((current) => [...current, result.file].sort((a, b) => a.path.localeCompare(b.path)));
        setFile(result.file.path); setCode(""); setOriginalCode(""); setDirty(false);
      } else {
        const bridge = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
        if (!bridge) throw new Error("桌面文件桥接不可用");
        const result = await bridge.saveCodeFile({ path, content: "", expectedHash: null });
        const created = { id: path, path, language: clientLanguage(path), content: "", revision: 1, hash: result.hash };
        setFiles((current) => [...current, created].sort((a, b) => a.path.localeCompare(b.path)));
        setFile(path); setCode(""); setOriginalCode(""); setDirty(false);
      }
      setLogs([`✓ 已创建 ${path}`]);
    } catch (error) { setLogs([`✕ ${error instanceof Error ? error.message : "创建失败"}`]); }
    finally { setBusy(false); }
  };

  const deleteCloudFile = async () => {
    const current = files.find((item) => item.path === file);
    if (mode !== "cloud" || !current || !confirm(`删除云端代码文件 ${current.path}？`)) return;
    const response = await fetch(`/api/code?id=${encodeURIComponent(current.id)}`, { method: "DELETE" });
    if (!response.ok) { setLogs([`✕ ${await responseError(response)}`]); return; }
    const remaining = files.filter((item) => item.id !== current.id);
    setFiles(remaining);
    const next = remaining[0];
    setFile(next?.path || ""); setCode(next?.content || ""); setOriginalCode(next?.content || ""); setDirty(false);
    setLogs([`✓ 已删除 ${current.path}`]);
  };

  const chooseLocalProject = async () => {
    const bridge = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
    if (!bridge) { setLogs(["● 本地项目只能在 SuperSophie 桌面应用中打开"]); return; }
    const project = await bridge.chooseCodeProject();
    if (!project) return;
    const localFiles = project.files.map((item) => ({ id: item.path, path: item.path, language: clientLanguage(item.path), content: "", revision: 1 }));
    setMode("local"); setProjectName(project.name); setFiles(localFiles); setLogs([`✓ 已授权本地目录 ${project.name}`, `● 已发现 ${localFiles.length} 个代码文件`]);
    if (localFiles[0]) await selectLocalFirst(localFiles[0].path, bridge, localFiles);
  };

  const selectLocalFirst = async (path: string, bridge: SophieDesktopBridge, localFiles: CodeFileState[]) => {
    const selected = await bridge.readCodeFile(path);
    setFiles(localFiles.map((item) => item.path === path ? { ...item, content: selected.content, hash: selected.hash } : item));
    setFile(path); setCode(selected.content); setOriginalCode(selected.content); setDirty(false);
  };

  const reviewChanges = () => {
    const before = originalCode.split("\n");
    const after = code.split("\n");
    let changed = 0;
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) if (before[index] !== after[index]) changed += 1;
    setLogs([`● ${file || "当前文件"}`, `✓ ${changed} 行发生变化 · ${after.length - before.length >= 0 ? "+" : ""}${after.length - before.length} 行`]);
  };

  const runCheck = async () => {
    if (mode !== "local") { setLogs(["● 网页端不会执行代码。请在桌面应用选择本地项目后运行。"]); return; }
    const bridge = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
    if (!bridge) return;
    setBusy(true); setLogs([`> pnpm ${checkCommand === "typecheck" ? "exec tsc --noEmit" : checkCommand}`, "● 正在本地项目中运行…"]);
    try {
      const result = await bridge.runCodeCheck(checkCommand);
      setLogs([`> ${result.command}`, ...result.output.split(/\r?\n/).filter(Boolean).slice(-70), `${result.exitCode === 0 ? "✓" : "✕"} 进程退出码 ${result.exitCode}`]);
    } catch (error) { setLogs([`✕ ${error instanceof Error ? error.message : "运行失败"}`]); }
    finally { setBusy(false); }
  };

  const askAgent = async () => {
    if (!file) return;
    setBusy(true); setLogs(["● 正在把当前文件交给 Agent 团队审阅…"]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "team", message: `请审阅代码文件 ${file}，指出正确性、维护性与安全问题，并给出可执行修改建议。不要声称已经修改文件。\n\n${code.slice(0, 12_000)}` }),
      });
      const payload = await response.json() as { error?: string; message?: { content: string }; run?: { id: string } };
      if (!response.ok) throw new Error(payload.error || "Agent 审阅失败");
      setLogs([`✓ Agent Run ${payload.run?.id?.slice(0, 8) || "completed"}`, payload.message?.content || "审阅完成"]);
    } catch (error) { setLogs([`✕ ${error instanceof Error ? error.message : "Agent 审阅失败"}`]); }
    finally { setBusy(false); }
  };

  const current = files.find((item) => item.path === file);
  const logLines = logs.flatMap((line) => line.split(/\r?\n/)).slice(-80);
  return (
    <main className="code-content">
      <header className="code-toolbar"><div><span>{mode === "cloud" ? "☁" : "⌘"}</span><span>{projectName}</span><i>/</i><strong>{file || "未选择文件"}{dirty ? " •" : ""}</strong></div><div><button className="quiet-button" onClick={reviewChanges}>审阅改动</button><button className="quiet-button" onClick={() => void chooseLocalProject()}>{mode === "local" ? "切换本地目录" : "打开本地项目"}</button>{mode === "local" && <button className="quiet-button" onClick={() => void loadCloud()}>返回云端</button>}<select className="code-check-select" value={checkCommand} onChange={(event) => setCheckCommand(event.target.value as typeof checkCommand)}><option value="test">test</option><option value="typecheck">typecheck</option><option value="lint">lint</option></select><button className="quiet-button" disabled={busy} onClick={() => void runCheck()}>▶ 运行</button><button className="primary-small" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "处理中" : "保存"}</button></div></header>
      <div className="ide"><aside className="file-explorer"><header>EXPLORER <button onClick={() => void createFile()} aria-label="新建代码文件">＋</button></header><strong>⌄ {projectName.toUpperCase()}</strong><div className="file-group"><span>⌄ FILES</span>{files.map((item) => <button className={file === item.path ? "active" : ""} key={item.id} onClick={() => void select(item.path)}><i>{item.language.slice(0, 2).toUpperCase()}</i>{item.path}</button>)}</div>{mode === "cloud" && current && <button className="code-delete-action" onClick={() => void deleteCloudFile()}>删除当前云端文件</button>}<button className="agent-code-action" disabled={busy || !file} onClick={() => void askAgent()}>✦ 让 Agent 审阅当前文件</button></aside><section className="code-editor"><div className="editor-tabs"><span><i>{current?.language.slice(0, 2).toUpperCase() || "--"}</i>{file.split("/").pop() || "No file"} <b>{dirty ? "●" : `r${current?.revision || 0}`}</b></span></div><div className="code-area"><div className="line-numbers">{code.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea value={code} onChange={(event) => { setCode(event.target.value); setDirty(event.target.value !== originalCode); }} spellCheck={false} aria-label="代码编辑器" disabled={!file} /></div><div className="terminal"><header><span className="active">TERMINAL</span><span>{mode === "cloud" ? "APP CLOUD" : "LOCAL"}</span><span>STATUS <b>{busy ? "…" : "0"}</b></span><button>⌃</button></header><pre>{logLines.map((log, index) => <span className={log.startsWith("✓") ? "success" : log.startsWith("✕") ? "failure" : ""} key={`${index}-${log.slice(0, 12)}`}>{log}</span>)}</pre></div></section></div>
    </main>
  );
}

type ConnectorId = "appcloud" | "onedrive" | "wechat" | "qq" | "telegram";
type SocialChannel = "wechat" | "qq" | "telegram";
type ConnectorState = { configured: boolean; connected: boolean; source?: "workspace" | "environment" | null; label?: string; accountLabel?: string | null; openConflicts?: number; lastSync?: { status: string; remotePath: string; createdAt: string } | null };
type OutboxMessage = { id: string; channel: SocialChannel; target: string; payloadMarkdown: string; status: string; createdAt: string; lastAttemptMarkdown?: string | null };
type SyncConflict = { id: string; entityKind: string; entityId: string; detailsMarkdown: string; createdAt: string };

const connectorCards: Array<{ id: ConnectorId; name: string; icon: string; desc: string; tone: string }> = [
  { id: "appcloud", name: "App Cloud", icon: "S", desc: "D1 + R2 跨设备托管同步", tone: "violet" },
  { id: "onedrive", name: "OneDrive", icon: "☁", desc: "Microsoft OAuth 双向 Markdown 同步", tone: "blue" },
  { id: "wechat", name: "微信", icon: "微", desc: "企业微信官方群机器人", tone: "green" },
  { id: "qq", name: "QQ", icon: "Q", desc: "QQ 官方群聊与单聊机器人", tone: "blue" },
  { id: "telegram", name: "Telegram", icon: "T", desc: "官方 Bot API 与频道", tone: "sky" },
];

const statusLabels: Record<string, string> = {
  review: "待审核", approved: "已批准", sending: "发送中", sent: "已发送", failed: "发送失败", rejected: "已驳回",
};

async function responseError(response: Response) {
  try { return ((await response.json()) as { error?: string }).error || `请求失败（${response.status}）`; }
  catch { return `请求失败（${response.status}）`; }
}

function SocialSecretModal({ provider, state, onClose, onChanged }: { provider: SocialChannel; state?: ConnectorState; onClose: () => void; onChanged: () => Promise<void> }) {
  const [telegramToken, setTelegramToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [qqAppId, setQqAppId] = useState("");
  const [qqSecret, setQqSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(state?.source === "workspace" ? "已保存的凭据不会再次显示。" : state?.source === "environment" ? "当前使用部署环境凭据；保存后会仅为此工作区覆盖。" : "输入官方机器人凭据。 ");
  const save = async () => {
    setBusy(true); setFeedback("");
    try {
      const credentials = provider === "telegram" ? { token: telegramToken } : provider === "wechat" ? { webhookUrl } : { appId: qqAppId, clientSecret: qqSecret };
      const response = await fetch("/api/connectors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, credentials }) });
      if (!response.ok) throw new Error(await responseError(response));
      setTelegramToken(""); setWebhookUrl(""); setQqAppId(""); setQqSecret("");
      await onChanged(); setFeedback("凭据已加密保存到当前工作区。 ");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "连接器凭据保存失败"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm("删除当前工作区保存的连接凭据？部署环境凭据不会被删除。")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/connectors?provider=${provider}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      await onChanged(); setFeedback("工作区凭据已删除。 ");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "连接器凭据删除失败"); }
    finally { setBusy(false); }
  };
  const ready = provider === "telegram" ? telegramToken.trim() : provider === "wechat" ? webhookUrl.trim() : qqAppId.trim() && qqSecret.trim();
  const title = provider === "telegram" ? "Telegram Bot" : provider === "wechat" ? "企业微信机器人" : "QQ 官方机器人";
  return <div className="secret-modal-backdrop" onMouseDown={onClose}><section className="secret-modal social-secret-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>SOCIAL VAULT</span><h2>{title}</h2><p>AES-256-GCM 加密；不会进入消息回执、Markdown 或 OneDrive。</p></div><button onClick={onClose}>×</button></header><div className="secret-modal-body">{provider === "telegram" && <label>Bot Token<input type="password" autoComplete="new-password" value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} placeholder="123456789:AA…" /></label>}{provider === "wechat" && <label>官方群机器人 Webhook<input type="password" autoComplete="new-password" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…" /></label>}{provider === "qq" && <><label>Bot App ID<input value={qqAppId} onChange={(event) => setQqAppId(event.target.value)} /></label><label>Bot Client Secret<input type="password" autoComplete="new-password" value={qqSecret} onChange={(event) => setQqSecret(event.target.value)} /></label></>}<div className="secret-safety-note"><strong>{state?.connected ? `当前已连接 · ${state.source === "workspace" ? "工作区凭据" : "部署环境"}` : "尚未连接"}</strong><span>发送仍需进入审核队列并由人类批准。</span></div></div><footer><span>{feedback}</span><div>{state?.source === "workspace" && <button className="danger-text" disabled={busy} onClick={() => void remove()}>删除工作区凭据</button>}<button className="primary-small" disabled={busy || !ready} onClick={() => void save()}>{busy ? "处理中…" : "加密保存"}</button></div></footer></section></div>;
}

function ConnectorsView() {
  const [connectors, setConnectors] = useState<Partial<Record<ConnectorId, ConnectorState>>>({});
  const [messages, setMessages] = useState<OutboxMessage[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [channel, setChannel] = useState<SocialChannel>("telegram");
  const [target, setTarget] = useState("");
  const [qqTargetKind, setQqTargetKind] = useState<"group" | "user">("group");
  const [message, setMessage] = useState("SuperSophie 工作区已经就绪，这条消息需要人工批准后才会发送。");
  const [feedback, setFeedback] = useState("尚未加入队列");
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [credentialEditor, setCredentialEditor] = useState<SocialChannel>();

  const refresh = useCallback(async () => {
    try {
      const [connectorResponse, outboxResponse, conflictResponse] = await Promise.all([
        fetch("/api/connectors"),
        fetch("/api/outbox"),
        fetch("/api/connectors/onedrive/conflicts"),
      ]);
      if (!connectorResponse.ok || !outboxResponse.ok || !conflictResponse.ok) throw new Error("连接器状态读取失败");
      const connectorPayload = await connectorResponse.json() as { connectors: Record<ConnectorId, ConnectorState> };
      const outboxPayload = await outboxResponse.json() as { messages: OutboxMessage[] };
      const conflictPayload = await conflictResponse.json() as { conflicts: SyncConflict[] };
      setConnectors(connectorPayload.connectors);
      setMessages(outboxPayload.messages);
      setConflicts(conflictPayload.conflicts);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "连接器状态读取失败");
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void refresh();
      const oneDriveResult = new URLSearchParams(location.search).get("onedrive");
      if (oneDriveResult === "connected") setFeedback("OneDrive 已安全连接");
      if (oneDriveResult === "error") setFeedback("OneDrive 授权未完成，请重试");
      if (oneDriveResult === "unconfigured") setFeedback("请先配置 OneDrive OAuth 环境变量");
    });
    return () => cancelAnimationFrame(frame);
  }, [refresh]);

  const configure = async (id: ConnectorId) => {
    const state = connectors[id];
    if (id === "appcloud") { setFeedback("App Cloud 已由 D1 与 R2 提供"); return; }
    if (id === "onedrive") {
      if (!state?.configured) { setFeedback("需要 ONEDRIVE_CLIENT_ID、ONEDRIVE_CLIENT_SECRET 与 CONNECTOR_ENCRYPTION_KEY"); return; }
      if (!state.connected) { location.assign("/api/connectors/onedrive/authorize"); return; }
      if (!confirm("断开 OneDrive？这只会删除本应用保存的加密 OAuth 凭据，不会删除 OneDrive 文件。")) return;
      const response = await fetch("/api/connectors/onedrive", { method: "DELETE" });
      setFeedback(response.ok ? "OneDrive 已断开" : await responseError(response));
      await refresh();
      return;
    }
    setCredentialEditor(id);
  };

  const queue = async () => {
    setBusy("queue");
    try {
      const response = await fetch("/api/outbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, target, markdown: message, metadata: channel === "qq" ? { targetKind: qqTargetKind } : {} }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setFeedback("已进入审核队列；尚未发送到外部平台");
      await refresh();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "加入队列失败"); }
    finally { setBusy(null); }
  };

  const review = async (id: string, action: "approve" | "reject", sendAfterApproval = false) => {
    setBusy(id);
    try {
      const reviewResponse = await fetch("/api/outbox", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!reviewResponse.ok) throw new Error(await responseError(reviewResponse));
      if (action === "approve" && sendAfterApproval) {
        const sendResponse = await fetch("/api/connectors/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!sendResponse.ok) throw new Error(await responseError(sendResponse));
        setFeedback("消息已批准并发送");
      } else setFeedback(action === "approve" ? "消息已批准，尚未发送" : "消息已驳回");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "审核操作失败"); }
    finally { setBusy(null); await refresh(); }
  };

  const sendApproved = async (id: string) => {
    setBusy(id);
    try {
      const response = await fetch("/api/connectors/send", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setFeedback("消息已发送");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "发送失败"); }
    finally { setBusy(null); await refresh(); }
  };

  const removeMessage = async (id: string) => {
    if (!confirm("删除这条尚未发送的审核记录？")) return;
    setBusy(id);
    try {
      const response = await fetch(`/api/outbox?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setFeedback("审核记录已删除");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "删除失败"); }
    finally { setBusy(null); await refresh(); }
  };

  const syncOneDrive = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/connectors/onedrive/sync", { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as { status: string; merge: { inserted: number; updated: number; deleted: number; conflicts: number } };
      const pulled = payload.merge.inserted + payload.merge.updated + payload.merge.deleted;
      setFeedback(payload.merge.conflicts
        ? `双向同步完成：拉取 ${pulled} 项，保留 ${payload.merge.conflicts} 个冲突待核对`
        : `双向同步完成：拉取 ${pulled} 项，OneDrive 与 App Cloud 已一致`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "OneDrive 同步失败"); }
    finally { setSyncing(false); await refresh(); }
  };

  const resolveConflict = async (id: string, resolution: "keep-local" | "use-remote") => {
    setBusy(id);
    try {
      const response = await fetch("/api/connectors/onedrive/conflicts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, resolution }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setFeedback(resolution === "keep-local" ? "已保留 App Cloud 版本" : "已采用 OneDrive 版本");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "冲突解决失败"); }
    finally { setBusy(null); await refresh(); }
  };

  const targetLabel = channel === "telegram" ? "chat_id 或 @频道名" : channel === "qq" ? "QQ 目标 openid" : "目标群备注（审核用）";
  const oneDrive = connectors.onedrive;
  return (
    <main className="connectors-content">
      <header className="section-title"><div><span className="large-section-icon">◎</span><div><p className="eyebrow">CONNECTIONS & SYNC</p><h1>让工作流抵达真实世界</h1><p>真实连接状态、人工审核、可追踪投递；默认不会自动向外发送。</p></div></div><a className="quiet-button" href="https://core.telegram.org/bots/api" target="_blank" rel="noreferrer">连接器文档 ↗</a></header>
      <section className="connector-grid">
        {connectorCards.map((item) => {
          const state = connectors[item.id];
          const connected = Boolean(state?.connected);
          const stateText = connected ? (state?.accountLabel || state?.label || "已连接") : state?.configured ? "等待授权" : "需要配置";
          return <article key={item.id}><span className={`connector-logo ${item.tone}`}>{item.icon}</span><div><h3>{item.name}</h3><p>{item.desc}</p><span className={connected ? "connected" : "needs-config"}><StatusDot tone={connected ? "green" : "gray"} />{stateText}</span></div><button onClick={() => void configure(item.id)}>{item.id === "appcloud" ? "已启用" : item.id === "onedrive" && connected ? "断开" : connected ? "管理" : "配置"}</button></article>;
        })}
      </section>
      <section className="connector-lower">
        <div className="message-composer">
          <div className="panel-heading"><div><span className="section-kicker">OUTBOX</span><h3>发送一条消息</h3></div><span className="review-pill">需要人工审核</span></div>
          <div className="connector-form-row"><label>发送到<select value={channel} onChange={(event) => setChannel(event.target.value as SocialChannel)}><option value="wechat">微信（企业微信）</option><option value="qq">QQ</option><option value="telegram">Telegram</option></select></label>{channel === "qq" && <label>目标类型<select value={qqTargetKind} onChange={(event) => setQqTargetKind(event.target.value as "group" | "user")}><option value="group">群聊</option><option value="user">单聊</option></select></label>}</div>
          <label>{targetLabel}<input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={channel === "telegram" ? "例如：123456789 或 @my_channel" : channel === "qq" ? "从 QQ 机器人事件中取得" : "例如：产品发布群"} /></label>
          <label>Markdown 消息<textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
          <footer><span>{feedback}</span><button className="primary-button" disabled={busy === "queue" || !target.trim() || !message.trim()} onClick={() => void queue()}>{busy === "queue" ? "正在加入…" : "加入审核队列 →"}</button></footer>
        </div>
        <div className="sync-settings">
          <div className="panel-heading"><div><span className="section-kicker">STORAGE</span><h3>同步策略</h3></div></div>
          <div className="storage-choice active"><span className="connector-logo violet">S</span><div><strong>App Cloud</strong><small>当前主存储 · D1 Markdown + R2 资源</small></div><i>✓</i></div>
          <div className={`storage-choice ${oneDrive?.connected ? "active" : ""}`}><span className="connector-logo blue">☁</span><div><strong>OneDrive</strong><small>{oneDrive?.connected ? `${oneDrive.accountLabel || "已连接"} · ${oneDrive.openConflicts ? `${oneDrive.openConflicts} 个冲突待核对` : oneDrive.lastSync ? `最近 ${oneDrive.lastSync.status}` : "尚未同步"}` : "OAuth 连接后双向合并 Markdown 工作区"}</small></div><button disabled={!oneDrive?.connected || syncing} onClick={() => void syncOneDrive()}>{syncing ? "同步中" : "双向同步"}</button></div>
          <div className="sync-rule"><span><b>离线优先</b><small>先保存到设备，联网后同步 App Cloud</small></span><button className="toggle on" aria-label="离线优先已开启"><i /></button></div>
          <div className="sync-rule"><span><b>冲突保留双方</b><small>不静默覆盖任何版本</small></span><button className="toggle on" aria-label="冲突保留已开启"><i /></button></div>
        </div>
      </section>
      {conflicts.length > 0 && <section className="sync-conflict-review">
        <div className="panel-heading"><div><span className="section-kicker">SYNC CONFLICTS</span><h3>需要你核对的版本</h3></div><span>{conflicts.length} 项</span></div>
        <p>同步没有静默覆盖任何一方。选择保留 App Cloud，或明确采用 OneDrive 副本。</p>
        {conflicts.map((conflict) => <article key={conflict.id}>
          <div><strong>{conflict.entityKind}</strong><small>{conflict.entityId}</small></div>
          <details><summary>查看冲突说明</summary><pre>{conflict.detailsMarkdown}</pre></details>
          <footer><button disabled={busy === conflict.id} onClick={() => void resolveConflict(conflict.id, "keep-local")}>保留 App Cloud</button><button className="primary-small" disabled={busy === conflict.id} onClick={() => void resolveConflict(conflict.id, "use-remote")}>采用 OneDrive</button></footer>
        </article>)}
      </section>}
      <section className="outbox-review">
        <div className="panel-heading"><div><span className="section-kicker">REVIEW QUEUE</span><h3>审核队列</h3></div><span>{messages.length} 条</span></div>
        {messages.length === 0 && <p className="empty-state">还没有待审核消息。</p>}
        {messages.map((item) => <article key={item.id}><div className="outbox-meta"><strong>{item.channel.toUpperCase()}</strong><span>{item.target}</span><i className={`outbox-status ${item.status}`}>{statusLabels[item.status] || item.status}</i></div><p>{item.payloadMarkdown}</p>{item.lastAttemptMarkdown && item.status === "failed" && <details><summary>查看失败记录</summary><pre>{item.lastAttemptMarkdown}</pre></details>}<footer>{item.status === "review" && <><button onClick={() => void review(item.id, "reject")}>驳回</button><button className="primary-small" disabled={busy === item.id} onClick={() => void review(item.id, "approve", true)}>批准并发送</button></>}{item.status === "approved" && <button className="primary-small" disabled={busy === item.id} onClick={() => void sendApproved(item.id)}>发送</button>}{item.status === "failed" && <button className="primary-small" disabled={busy === item.id} onClick={() => void review(item.id, "approve", true)}>重新批准并发送</button>}{item.status === "rejected" && <button disabled={busy === item.id} onClick={() => void removeMessage(item.id)}>删除记录</button>}</footer></article>)}
      </section>
      {credentialEditor && <SocialSecretModal provider={credentialEditor} state={connectors[credentialEditor]} onClose={() => setCredentialEditor(undefined)} onChanged={refresh} />}
    </main>
  );
}

function SearchPalette({ close, go }: { close: () => void; go: (section: Section) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => [
    { label: "SuperSophie 发布计划", meta: "页面", section: "notes" as Section, icon: "✦" },
    { label: "产品任务", meta: "数据库 · 11 个视图", section: "database" as Section, icon: "▦" },
    { label: "Agent Work", meta: "3 个子 Agent 运行中", section: "agents" as Section, icon: "✦" },
    { label: ".sophie 文件规范", meta: "架构文档", section: "notes" as Section, icon: "◫" },
    { label: "连接器", meta: "微信 · QQ · Telegram", section: "connectors" as Section, icon: "◎" },
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.meta.toLowerCase().includes(query.toLowerCase())), [query]);
  return <div className="palette-backdrop" onMouseDown={close}><div className="search-palette" onMouseDown={(event) => event.stopPropagation()}><div className="palette-input"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索页面、数据库、Agent 或命令…" /><kbd>ESC</kbd></div><p>最佳匹配</p>{results.map((item) => <button key={item.label} onClick={() => { go(item.section); close(); }}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.meta}</small></div><i>↵</i></button>)}<footer><span><kbd>↑↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>ESC</kbd> 关闭</span></footer></div></div>;
}

export function SophieWorkspace() {
  const [section, setSection] = useState<Section>("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const desktop = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
    if (!desktop) return;
    void desktop.pendingPackage().then((name) => { if (name) setSection("notes"); }).catch(() => undefined);
    return desktop.onPackageAvailable(() => setSection("notes"));
  }, []);
  useEffect(() => {
    const requestedSection = new URLSearchParams(location.search).get("section");
    const frame = requestAnimationFrame(() => {
      if (["home", "notes", "database", "agents", "code", "connectors"].includes(requestedSection || "")) setSection(requestedSection as Section);
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    addEventListener("online", onOnline); addEventListener("offline", onOffline); addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(frame); removeEventListener("online", onOnline); removeEventListener("offline", onOffline); removeEventListener("keydown", onKey); };
  }, []);
  const go = (next: Section) => { setSection(next); setSidebarOpen(false); };
  if (section === "home") return <><ConversationHome go={go} /><div className="home-identity"><WorkspaceMenu compact /></div></>;
  return <div className="workspace-shell"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button><aside className={`sidebar ${sidebarOpen ? "open" : ""}`}><WorkspaceMenu /><nav>{navItems.map((item) => <button className={section === item.id ? "active" : ""} key={item.id} onClick={() => go(item.id)}><span className="nav-icon">{item.icon}</span><strong>{item.label}</strong>{item.hint && <i>{item.hint}</i>}</button>)}</nav><div className="sidebar-section"><p>空间</p><button onClick={() => go("notes")}><span className="space-dot violet" />产品与架构</button><button onClick={() => go("database")}><span className="space-dot amber" />项目与任务</button><button onClick={() => go("notes")}><span className="space-dot blue" />研究与灵感</button><button><span>＋</span>新建空间</button></div><div className="sidebar-bottom"><button><span>?</span><strong>帮助与快捷键</strong></button><div className="sync-card"><span className="cloud-mark">☁</span><div><strong>{online ? "云端已同步" : "当前离线"}</strong><small>{online ? "App Cloud · 当前工作区" : "修改保存在此设备"}</small></div><StatusDot tone={online ? "green" : "amber"} /></div></div></aside><div className="workspace-main"><TopBar section={section} onSearch={() => setSearchOpen(true)} />{section === "notes" && <NotesView />}{section === "database" && <DatabaseView />}{section === "agents" && <AgentsView />}{section === "code" && <CodeView />}{section === "connectors" && <ConnectorsView />}</div>{searchOpen && <SearchPalette close={() => setSearchOpen(false)} go={go} />}<nav className="mobile-nav">{navItems.slice(0, 5).map((item) => <button className={section === item.id ? "active" : ""} key={item.id} onClick={() => go(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav></div>;
}
