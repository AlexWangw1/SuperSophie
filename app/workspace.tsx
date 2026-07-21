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
import { cacheSophiePackage, readCachedPage, readCachedSophiePackage } from "../lib/offline-store";
import {
  blocksToMarkdown,
  createSophieAsset,
  createSophiePackage,
  downloadSophiePackage,
  readSophiePackageWithAssets,
  sophieAssetDataUrl,
  type SophieBlock,
  type SophiePackageAsset,
  type SophiePage,
} from "../lib/sophie-package";
import { applyViewQuery, type FilterGroup, type ViewSort } from "../lib/database/query";
import { WorkspaceMenu } from "./auth-gate";

type Section = "home" | "notes" | "database" | "agents" | "code" | "connectors";
type ViewType = "table" | "board" | "timeline" | "calendar" | "list" | "gallery" | "chart" | "map" | "feed" | "dashboard" | "form";
type Task = {
  id: string;
  title: string;
  status: "Inbox" | "In progress" | "Review" | "Done";
  priority: "High" | "Medium" | "Low";
  due: string;
  day: number;
  owner: string;
  tags: string[];
  progress: number;
  x: number;
  y: number;
  body?: string;
  revision?: number;
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

function useModelCatalog() {
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("openai:gpt-5.6");
  useEffect(() => {
    fetch("/api/models")
      .then(async (response) => {
        if (!response.ok) throw new Error("model catalog unavailable");
        return response.json() as Promise<{ models: ModelProfile[]; defaultModelId?: string }>;
      })
      .then((result) => {
        setModels(result.models);
        if (result.defaultModelId) setDefaultModelId(result.defaultModelId);
      })
      .catch(() => undefined);
  }, []);
  return { models, defaultModelId };
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
    const desktop = (window as typeof window & { sophieDesktop?: SophieDesktopBridge }).sophieDesktop;
    await desktop?.setPetEnabled(next);
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

function NotesView() {
  const [page, setPage] = useState(initialPage);
  const [pageAssets, setPageAssets] = useState<SophiePackageAsset[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline" | "conflict">("saved");
  const [slashBlock, setSlashBlock] = useState<string>();
  const [draggedBlock, setDraggedBlock] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const assetInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const lastPageId = localStorage.getItem("supersophie:last-page") || initialPage.id;
    readCachedSophiePackage(lastPageId).then((cached) => {
      if (cached) { setPage(cached.page); setPageAssets(cached.assets); return; }
      return readCachedPage(lastPageId).then((pageOnly) => pageOnly && setPage(pageOnly));
    }).catch(() => undefined);
  }, []);

  const updateBlock = (id: string, patch: Partial<SophieBlock>) => {
    setPage((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === id ? { ...block, ...patch } as SophieBlock : block), updatedAt: new Date().toISOString() }));
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
      setPage((current) => ({ ...current, revision: result.revision, updatedAt: result.updatedAt }));
      setSaveState("saved");
    } catch {
      setSaveState("offline");
    }
  }, [page, pageAssets]);

  const exportPage = async () => downloadSophiePackage(await createSophiePackage(page, pageAssets), page.title);
  const importPage = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await readSophiePackageWithAssets(await file.text());
      setPage(imported.page); setPageAssets(imported.assets);
      await cacheSophiePackage(imported.page, imported.assets);
      localStorage.setItem("supersophie:last-page", imported.page.id);
      setSaveState("offline");
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

  return (
    <main className="notes-layout">
      <aside className="page-tree">
        <div className="tree-title"><span>知识库</span><button>＋</button></div>
        <button className="tree-item active"><span>✦</span><strong>SuperSophie 发布计划</strong></button>
        <button className="tree-item"><span>◫</span><strong>产品与架构</strong><i>⌄</i></button>
        <button className="tree-item nested"><span>·</span><strong>同步架构</strong></button>
        <button className="tree-item nested"><span>·</span><strong>.sophie 文件规范</strong></button>
        <button className="tree-item"><span>⌘</span><strong>工程笔记</strong><i>›</i></button>
        <button className="tree-item"><span>◎</span><strong>连接器手册</strong><i>›</i></button>
        <div className="tree-spacer" />
        <button className="tree-item muted"><span>⌫</span><strong>回收站</strong></button>
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
          <input className="page-title-input" value={page.title} onChange={(event) => setPage({ ...page, title: event.target.value })} aria-label="页面标题" />
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
                {block.type === "divider" && <hr className="divider-block" />}
                {!(["image", "file", "divider"] as SophieBlock["type"][]).includes(block.type) && <textarea
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
                    if (event.key === "Backspace" && !block.content && page.blocks.length > 1) { setPage((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) })); }
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
        </article>
      </section>
    </main>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen?: (task: Task) => void }) {
  return <article className="task-card" draggable onClick={() => onOpen?.(task)}><div className="task-card-top"><span>{task.id}</span><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></div><h4>{task.title}</h4><div className="task-tags">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="task-card-footer"><span className="mini-avatar blue">{task.owner}</span><span>◷ {task.due}</span></div></article>;
}

function TableView({ tasks, onOpen, hidden = [] }: { tasks: Task[]; onOpen?: (task: Task) => void; hidden?: string[] }) {
  const columns = ["status", "priority", "owner", "due", "progress"].filter((column) => !hidden.includes(column));
  return <div className="data-table"><div className="table-row table-head" style={{ gridTemplateColumns: `42px minmax(250px,2fr) repeat(${columns.length}, minmax(105px,1fr))` }}><span><input type="checkbox" aria-label="全选" /></span><span>任务</span>{columns.map((column) => <span key={column}>{{ status: "状态", priority: "优先级", owner: "负责人", due: "截止日期", progress: "进度" }[column]}</span>)}</div>{tasks.map((task) => <div className="table-row" style={{ gridTemplateColumns: `42px minmax(250px,2fr) repeat(${columns.length}, minmax(105px,1fr))` }} key={task.id} onDoubleClick={() => onOpen?.(task)}><span><input type="checkbox" aria-label={`选择 ${task.title}`} /></span><button className="table-title-button" onClick={() => onOpen?.(task)}><b>{task.title}</b><small>{task.id}</small></button>{columns.map((column) => column === "status" ? <span key={column}><i className={`state ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</i></span> : column === "priority" ? <span key={column}><i className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</i></span> : column === "owner" ? <span key={column}><i className="mini-avatar blue">{task.owner}</i></span> : column === "due" ? <span key={column}>◷ {task.due}</span> : <span key={column}><i className="row-progress"><b style={{ width: `${task.progress}%` }} /></i><small>{task.progress}%</small></span>)}</div>)}</div>;
}

function BoardView({ tasks, move, onOpen }: { tasks: Task[]; move: (id: string, status: Task["status"]) => void; onOpen?: (task: Task) => void }) {
  const statuses: Task["status"][] = ["Inbox", "In progress", "Review", "Done"];
  return <div className="board-view">{statuses.map((status) => <section className="board-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => move(event.dataTransfer.getData("task"), status)}><header><span className={`status-chip ${status.replace(" ", "-").toLowerCase()}`}>{status}</span><b>{tasks.filter((task) => task.status === status).length}</b><button>＋</button></header>{tasks.filter((task) => task.status === status).map((task) => <div key={task.id} draggable onDragStart={(event) => event.dataTransfer.setData("task", task.id)}><TaskCard task={task} onOpen={onOpen} /></div>)}<button className="column-add">＋ 新建</button></section>)}</div>;
}

function TimelineView({ tasks }: { tasks: Task[] }) {
  return <div className="timeline-view"><div className="timeline-header"><b>任务</b>{[17,18,19,20,21,22,23,24].map((day) => <span key={day}>{day}<small>JUL</small></span>)}</div>{tasks.map((task, index) => <div className="timeline-row" key={task.id}><strong>{task.title}</strong><div className="timeline-grid">{[17,18,19,20,21,22,23,24].map((day) => <i key={day} />)}<span className={`timeline-bar bar-${index % 4}`} style={{ left: `${Math.max(0, task.day - 17) * 12.5}%`, width: `${Math.max(18, task.progress / 3)}%` }}>{task.owner} · {task.progress}%</span></div></div>)}</div>;
}

function CalendarView({ tasks }: { tasks: Task[] }) {
  const days = Array.from({ length: 35 }, (_, index) => index + 1);
  return <div className="calendar-view"><div className="calendar-week">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}</div><div className="calendar-grid">{days.map((day) => <div className={day === 17 ? "today" : day > 31 ? "other" : ""} key={day}><b>{day > 31 ? day - 31 : day}</b>{tasks.filter((task) => task.day === day).map((task) => <span className={`calendar-task ${task.priority.toLowerCase()}`} key={task.id}>{task.title}</span>)}</div>)}</div></div>;
}

function GalleryView({ tasks, onOpen }: { tasks: Task[]; onOpen?: (task: Task) => void }) {
  return <div className="gallery-view">{tasks.map((task, index) => <article key={task.id} onClick={() => onOpen?.(task)}><div className={`gallery-cover cover-${index % 4}`}><span>{task.tags[0]}</span><i>{index % 2 ? "◫" : "✦"}</i></div><div><small>{task.id}</small><h3>{task.title}</h3><span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span><footer><span className="mini-avatar blue">{task.owner}</span><span>{task.due}</span></footer></div></article>)}</div>;
}

function ChartView({ tasks }: { tasks: Task[] }) {
  const groups = ["Inbox", "In progress", "Review", "Done"] as const;
  return <div className="chart-view"><section className="chart-card"><header><div><small>按状态</small><h3>任务分布</h3></div><button>本月⌄</button></header><div className="bar-chart">{groups.map((group) => { const count = tasks.filter((task) => task.status === group).length; return <div key={group}><span style={{ height: `${26 + count * 42}px` }}><i>{count}</i></span><small>{group}</small></div>; })}</div></section><section className="chart-card donut-card"><header><div><small>总体完成度</small><h3>发布进度</h3></div></header><div className="donut"><span><strong>64%</strong><small>已完成</small></span></div><div className="legend"><span><i className="violet-bg" />已完成 64%</span><span><i className="soft-bg" />剩余 36%</span></div></section></div>;
}

function MapView({ tasks }: { tasks: Task[] }) {
  return <div className="map-view"><div className="map-grid" />{tasks.map((task, index) => <button className={`map-pin pin-${index % 4}`} style={{ left: `${task.x}%`, top: `${task.y}%` }} key={task.id}><span>{task.owner}</span><b>{task.title}</b></button>)}<div className="map-legend">团队协作位置 · 演示数据</div></div>;
}

function FeedView({ tasks }: { tasks: Task[] }) {
  return <div className="feed-view">{tasks.map((task, index) => <article key={task.id}><span className={`feed-avatar tone-${index % 4}`}>{task.owner}</span><div><p><strong>{task.owner}</strong> {index % 2 ? "更新了" : "创建了"} <b>{task.title}</b></p><small>{index * 13 + 4} 分钟前 · {task.id}</small><div className="feed-change"><span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span><i>→</i><span>{task.progress}% 完成</span></div></div><button>•••</button></article>)}</div>;
}

function DashboardView({ tasks }: { tasks: Task[] }) {
  return <div className="dashboard-view"><div className="metric-card"><small>全部任务</small><strong>{tasks.length}</strong><span className="positive">↑ 12% 本周</span></div><div className="metric-card"><small>进行中</small><strong>{tasks.filter((task) => task.status === "In progress").length}</strong><span>2 个临近截止</span></div><div className="metric-card"><small>平均进度</small><strong>{Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)}%</strong><span className="positive">↑ 8%</span></div><div className="metric-card"><small>高优先级</small><strong>{tasks.filter((task) => task.priority === "High").length}</strong><span>需要关注</span></div><div className="dashboard-wide"><ChartView tasks={tasks} /></div></div>;
}

function FormView({ addTask }: { addTask: (title: string) => void }) {
  const [title, setTitle] = useState("");
  return <div className="form-view"><div className="form-intro"><span>✦</span><div><h2>提交一个产品任务</h2><p>表单响应会直接进入「产品任务」数据库。</p></div></div><label>任务名称 <b>*</b><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：完善移动端离线体验" /></label><label>任务说明<textarea placeholder="补充背景、成功标准和相关资料…" rows={4} /></label><div className="form-double"><label>优先级<select defaultValue="Medium"><option>High</option><option>Medium</option><option>Low</option></select></label><label>标签<select defaultValue="Product"><option>Product</option><option>Offline</option><option>Sync</option><option>Connector</option></select></label></div><button className="primary-button" onClick={() => { if (title.trim()) { addTask(title.trim()); setTitle(""); } }}>提交任务</button></div>;
}

function TaskPageDrawer({ task, onClose, onSave }: { task: Task; onClose: () => void; onSave: (task: Task) => Promise<void> }) {
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
  return <div className="database-peek-backdrop" onMouseDown={onClose}><aside className="database-page-peek" onMouseDown={(event) => event.stopPropagation()}><header><span>产品任务 / {draft.id}</span><div><button onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</button><button onClick={onClose} aria-label="关闭页面">×</button></div></header><div className="peek-body"><span className="peek-icon">▦</span><input className="peek-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="任务标题" /><div className="peek-properties"><label>状态<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Task["status"] })}><option>Inbox</option><option>In progress</option><option>Review</option><option>Done</option></select></label><label>优先级<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Task["priority"] })}><option>High</option><option>Medium</option><option>Low</option></select></label><label>负责人<input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} /></label><label>截止日期<input value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} /></label><label>标签<input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label><label>进度<span className="peek-progress"><input type="range" min="0" max="100" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} /><b>{draft.progress}%</b></span></label></div><div className="peek-divider" /><label className="peek-markdown"><span>页面正文 · Markdown</span><textarea rows={12} value={draft.body ?? ""} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="记录背景、成功标准、资料和执行结果…" /></label><footer>{saveState}</footer></div></aside></div>;
}

function DatabaseView() {
  const [view, setView] = useState<ViewType>("table");
  const [tasks, setTasks] = useState(initialTasks);
  const [viewMenu, setViewMenu] = useState(false);
  const [toolMenu, setToolMenu] = useState<"filter" | "sort" | "group" | "properties" | undefined>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [sorts, setSorts] = useState<ViewSort[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [subGroupBy, setSubGroupBy] = useState("");
  const [hiddenProperties, setHiddenProperties] = useState<string[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task>();
  const [syncState, setSyncState] = useState<"loading" | "synced" | "offline" | "saving">("loading");
  const viewRevisionsRef = useRef<Record<string, number>>({});
  const [remoteViewConfigs, setRemoteViewConfigs] = useState<Record<string, { visibleProperties?: string[]; sorts?: ViewSort[]; groupBy?: string | null; subGroupBy?: string | null; filters?: FilterGroup | null }>>({});

  useEffect(() => {
    fetch("/api/database?sourceId=product-tasks")
      .then(async (response) => {
        if (!response.ok) throw new Error("database unavailable");
        return response.json() as Promise<{
          views: Array<{ id: string; type: ViewType; revision: number; config: { visibleProperties?: string[]; sorts?: ViewSort[]; groupBy?: string | null; subGroupBy?: string | null; filters?: FilterGroup | null } }>;
          records: Array<{ id: string; title: string; markdown: string; revision: number; properties: Partial<Task> }>;
        }>;
      })
      .then((payload) => {
        const configs = Object.fromEntries(payload.views.map((item) => [item.type, item.config]));
        setRemoteViewConfigs(configs);
        viewRevisionsRef.current = Object.fromEntries(payload.views.map((item) => [item.type, item.revision]));
        const tableConfig = configs.table ?? {};
        setSorts(tableConfig.sorts ?? []);
        setGroupBy(tableConfig.groupBy ?? "");
        setSubGroupBy(tableConfig.subGroupBy ?? "");
        setHiddenProperties(["status", "priority", "owner", "due", "progress", "tags"].filter((property) => !(tableConfig.visibleProperties ?? ["status", "priority", "owner", "due", "progress", "tags"]).includes(property)));
        setTasks(payload.records.map((record) => {
          const marker = record.markdown.match(/<!-- sophie:block=.*?-->\n([\s\S]*)$/);
          return {
            id: record.id,
            title: record.title,
            status: record.properties.status ?? "Inbox",
            priority: record.properties.priority ?? "Medium",
            due: record.properties.due ?? "未设置",
            day: Number(record.properties.day ?? 1),
            owner: record.properties.owner ?? "SC",
            tags: Array.isArray(record.properties.tags) ? record.properties.tags : [],
            progress: Number(record.properties.progress ?? 0),
            x: Number(record.properties.x ?? 50),
            y: Number(record.properties.y ?? 50),
            body: marker?.[1]?.trim() ?? "",
            revision: record.revision,
          } as Task;
        }));
        setSyncState("synced");
      })
      .catch(() => setSyncState("offline"));
  }, []);

  const selectView = (next: ViewType) => {
    setView(next);
    setToolMenu(undefined);
    const config = remoteViewConfigs[next] ?? {};
    setSorts(config.sorts ?? []);
    setGroupBy(config.groupBy ?? (next === "board" ? "status" : ""));
    setSubGroupBy(config.subGroupBy ?? "");
    const visible = config.visibleProperties ?? ["status", "priority", "owner", "due", "progress", "tags"];
    setHiddenProperties(["status", "priority", "owner", "due", "progress", "tags"].filter((property) => !visible.includes(property)));
  };

  const filter = useMemo<FilterGroup | undefined>(() => {
    const filters: FilterGroup["filters"] = [];
    if (statusFilter !== "All") filters.push({ type: "condition", property: "status", operator: "equals", value: statusFilter });
    if (priorityFilter !== "All") filters.push({ type: "condition", property: "priority", operator: "equals", value: priorityFilter });
    return filters.length ? { type: "group", operator: "and", filters } : undefined;
  }, [priorityFilter, statusFilter]);

  const visibleTasks = useMemo(() => applyViewQuery(tasks.map((task) => ({ ...task, properties: {
    status: task.status, priority: task.priority, due: task.due, day: task.day, owner: task.owner,
    tags: task.tags, progress: task.progress, x: task.x, y: task.y,
  } })), { search, filter, sorts }), [filter, search, sorts, tasks]);

  useEffect(() => {
    if (syncState === "loading") return;
    const timeout = setTimeout(() => {
      const visibleProperties = ["status", "priority", "owner", "due", "progress", "tags"].filter((property) => !hiddenProperties.includes(property));
      fetch("/api/database", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-view", view: {
          id: `product-tasks:${view}`,
          sourceId: "product-tasks",
          name: view,
          type: view,
          config: { visibleProperties, filters: filter ?? null, sorts, groupBy: groupBy || null, subGroupBy: subGroupBy || null, openPagesIn: "side-peek" },
          baseRevision: viewRevisionsRef.current[view],
        } }),
      }).then(async (response) => {
        if (!response.ok) throw new Error("view save failed");
        const payload = await response.json() as { revision: number };
        viewRevisionsRef.current[view] = payload.revision;
        setRemoteViewConfigs((current) => ({ ...current, [view]: { visibleProperties, filters: filter ?? null, sorts, groupBy: groupBy || null, subGroupBy: subGroupBy || null } }));
      }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timeout);
  }, [filter, groupBy, hiddenProperties, sorts, subGroupBy, syncState, view]);

  const saveTask = useCallback(async (task: Task) => {
    setSyncState("saving");
    const response = await fetch("/api/database", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "upsert-record", sourceId: "product-tasks", record: {
        id: task.id,
        title: task.title,
        body: task.body ?? "",
        properties: { status: task.status, priority: task.priority, due: task.due, day: task.day, owner: task.owner, tags: task.tags, progress: task.progress, x: task.x, y: task.y },
        baseRevision: task.revision,
      } }),
    });
    if (!response.ok) { setSyncState("offline"); throw new Error(response.status === 409 ? "revision_conflict" : "save_failed"); }
    const payload = await response.json() as { revision: number };
    const saved = { ...task, revision: payload.revision };
    setTasks((current) => current.map((item) => item.id === saved.id ? saved : item));
    setSelectedTask((current) => current?.id === saved.id ? saved : current);
    setSyncState("synced");
  }, []);

  const move = (id: string, status: Task["status"]) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const next = { ...task, status };
    setTasks((current) => current.map((item) => item.id === id ? next : item));
    void saveTask(next).catch(() => undefined);
  };
  const addTask = (title: string) => {
    const nextNumber = Math.max(113, ...tasks.map((task) => Number(task.id.replace(/\D/g, "")) || 0)) + 1;
    const task: Task = { id: `T-${nextNumber}`, title, status: "Inbox", priority: "Medium", due: "未设置", day: new Date().getDate(), owner: "SC", tags: ["Product"], progress: 0, x: 50, y: 50, body: "" };
    setTasks((current) => [...current, task]);
    setSelectedTask(task);
    void saveTask(task).catch(() => undefined);
  };

  const groupedTasks = useMemo(() => {
    if (!groupBy) return new Map<string, typeof visibleTasks>([["", visibleTasks]]);
    const groups = new Map<string, typeof visibleTasks>();
    for (const task of visibleTasks) {
      const raw = (task.properties as Record<string, string | number | boolean | string[] | null | undefined>)[groupBy];
      const key = Array.isArray(raw) ? raw.join(", ") || "未填写" : String(raw ?? "未填写");
      groups.set(key, [...(groups.get(key) ?? []), task]);
    }
    return groups;
  }, [groupBy, visibleTasks]);

  const filterCount = Number(statusFilter !== "All") + Number(priorityFilter !== "All");
  return (
    <main className="database-content">
      <header className="database-title"><div><span className="database-icon">▦</span><div><h1>产品任务</h1><p>{visibleTasks.length} / {tasks.length} 条记录 · {syncState === "synced" ? "云端已同步" : syncState === "saving" ? "保存中…" : syncState === "loading" ? "正在加载数据源…" : "离线副本"}</p></div></div><div><button className="quiet-button">链接数据源</button><button className="primary-small" onClick={() => addTask("未命名任务")}>＋ 新建</button></div></header>
      <div className="view-tabs"><div className="visible-tabs">{viewOptions.slice(0, 6).map((option) => <button className={view === option.id ? "active" : ""} key={option.id} onClick={() => selectView(option.id)}><span>{option.icon}</span>{option.label}</button>)}</div><div className="view-more"><button onClick={() => setViewMenu(!viewMenu)}>更多视图⌄</button>{viewMenu && <div className="view-menu">{viewOptions.slice(6).map((option) => <button key={option.id} onClick={() => { selectView(option.id); setViewMenu(false); }}><span>{option.icon}</span><div><b>{option.label}</b><small>{option.id === "form" ? "收集信息" : option.id === "map" ? "按位置展示" : "分析与组织数据"}</small></div></button>)}</div>}</div><div className="view-tools"><button className={searchOpen ? "active" : ""} onClick={() => setSearchOpen(!searchOpen)}>⌕</button><button className={toolMenu === "filter" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "filter" ? undefined : "filter")}>筛选 {filterCount > 0 && <b>{filterCount}</b>}</button><button className={toolMenu === "sort" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "sort" ? undefined : "sort")}>排序 {sorts.length > 0 && <b>{sorts.length}</b>}</button><button className={toolMenu === "group" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "group" ? undefined : "group")}>分组</button><button className={toolMenu === "properties" ? "active" : ""} onClick={() => setToolMenu(toolMenu === "properties" ? undefined : "properties")}>属性</button></div></div>
      {(searchOpen || toolMenu) && <div className="database-controls">{searchOpen && <label className="database-search"><span>⌕</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索当前数据源…" /><button onClick={() => { setSearch(""); setSearchOpen(false); }}>×</button></label>}{toolMenu === "filter" && <div className="database-control-popover"><strong>高级筛选 · AND</strong><label>状态<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Inbox</option><option>In progress</option><option>Review</option><option>Done</option></select></label><label>优先级<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></label><small>查询引擎支持 AND / OR 最多三层嵌套；此面板显示常用条件。</small></div>}{toolMenu === "sort" && <div className="database-control-popover"><strong>排序</strong><label>属性<select value={sorts[0]?.property ?? ""} onChange={(event) => setSorts(event.target.value ? [{ property: event.target.value, direction: sorts[0]?.direction ?? "ascending" }] : [])}><option value="">不排序</option><option value="title">标题</option><option value="status">状态</option><option value="priority">优先级</option><option value="due">截止日期</option><option value="progress">进度</option></select></label><label>方向<select value={sorts[0]?.direction ?? "ascending"} onChange={(event) => setSorts((current) => current.length ? [{ ...current[0], direction: event.target.value as ViewSort["direction"] }] : [])}><option value="ascending">升序</option><option value="descending">降序</option></select></label></div>}{toolMenu === "group" && <div className="database-control-popover"><strong>分组与子分组</strong><label>分组<select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option value="">不分组</option><option value="status">状态</option><option value="priority">优先级</option><option value="owner">负责人</option><option value="tags">标签</option></select></label><label>子分组<select value={subGroupBy} onChange={(event) => setSubGroupBy(event.target.value)}><option value="">无</option><option value="priority">优先级</option><option value="owner">负责人</option></select></label></div>}{toolMenu === "properties" && <div className="database-control-popover property-control"><strong>属性可见性</strong>{["status", "priority", "owner", "due", "progress"].map((property) => <label key={property}><input type="checkbox" checked={!hiddenProperties.includes(property)} onChange={() => setHiddenProperties((current) => current.includes(property) ? current.filter((item) => item !== property) : [...current, property])} />{{ status: "状态", priority: "优先级", owner: "负责人", due: "截止日期", progress: "进度" }[property]}</label>)}</div>}</div>}
      <section className={`view-canvas view-${view}`}>
        {view === "table" && <div className="grouped-database">{[...groupedTasks].map(([name, group]) => <section key={name || "all"}>{name && <header><strong>{name}</strong><span>{group.length}</span>{subGroupBy && <small>子分组：{subGroupBy}</small>}</header>}<TableView tasks={group} onOpen={setSelectedTask} hidden={hiddenProperties} /></section>)}</div>}
        {view === "board" && <BoardView tasks={visibleTasks} move={move} onOpen={setSelectedTask} />}
        {view === "timeline" && <TimelineView tasks={visibleTasks} />}
        {view === "calendar" && <CalendarView tasks={visibleTasks} />}
        {view === "list" && <div className="simple-list">{visibleTasks.map((task) => <button key={task.id} onClick={() => setSelectedTask(task)}><span className={`task-check ${task.status === "Done" ? "done" : ""}`}>{task.status === "Done" ? "✓" : ""}</span><strong>{task.title}</strong><span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span><small>{task.due}</small><i>›</i></button>)}</div>}
        {view === "gallery" && <GalleryView tasks={visibleTasks} onOpen={setSelectedTask} />}
        {view === "chart" && <ChartView tasks={visibleTasks} />}
        {view === "map" && <MapView tasks={visibleTasks} />}
        {view === "feed" && <FeedView tasks={visibleTasks} />}
        {view === "dashboard" && <DashboardView tasks={visibleTasks} />}
        {view === "form" && <FormView addTask={addTask} />}
      </section>
      {selectedTask && <TaskPageDrawer key={selectedTask.id} task={selectedTask} onClose={() => setSelectedTask(undefined)} onSave={saveTask} />}
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

function AgentsView() {
  const [goal, setGoal] = useState("调研并制定 SuperSophie 下一阶段的可靠实施计划");
  const [runState, setRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [result, setResult] = useState<AgentWorkResult>();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const { models, defaultModelId } = useModelCatalog();
  const [modelId, setModelId] = useState("");
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
      <section className="model-strip"><div><span className="section-kicker">MODEL ROUTER</span><h3>多模型路由</h3><p>内置 OpenAI、OpenRouter、Ollama，并可通过环境配置添加 OpenAI-compatible 模型。</p></div>{models.slice(0, 4).map((model) => <article key={model.id}><span className={`provider-mark ${model.provider.toLowerCase()}`}>{model.provider[0]}</span><div><strong>{model.label}</strong><small>{model.capabilities.join(" · ")}</small></div><StatusDot tone={model.available ? "green" : "gray"} /></article>)}<button className="model-settings">密钥保存在环境变量中</button></section>
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
type ConnectorState = { configured: boolean; connected: boolean; label?: string; accountLabel?: string | null; openConflicts?: number; lastSync?: { status: string; remotePath: string; createdAt: string } | null };
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
    const requirements: Record<Exclude<ConnectorId, "appcloud" | "onedrive">, string> = {
      telegram: "在服务端设置 TELEGRAM_BOT_TOKEN；目标可填写 chat_id 或 @频道名。",
      wechat: "在服务端设置企业微信官方机器人 WECHAT_WORK_WEBHOOK_URL。",
      qq: "在服务端设置 QQ_BOT_APP_ID 与 QQ_BOT_CLIENT_SECRET。",
    };
    setFeedback(state?.connected ? `${id} 已通过服务端凭据连接` : requirements[id]);
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
          return <article key={item.id}><span className={`connector-logo ${item.tone}`}>{item.icon}</span><div><h3>{item.name}</h3><p>{item.desc}</p><span className={connected ? "connected" : "needs-config"}><StatusDot tone={connected ? "green" : "gray"} />{stateText}</span></div><button onClick={() => void configure(item.id)}>{item.id === "appcloud" ? "已启用" : item.id === "onedrive" && connected ? "断开" : connected ? "查看" : "配置"}</button></article>;
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
