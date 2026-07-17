"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cachePage, readCachedPage } from "../lib/offline-store";
import {
  blocksToMarkdown,
  createSophiePackage,
  downloadSophiePackage,
  readSophiePackage,
  type SophieBlock,
  type SophiePage,
} from "../lib/sophie-package";

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

function HomeView({ go }: { go: (section: Section) => void }) {
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

const blockLabels: Record<SophieBlock["type"], string> = { text: "正文", heading: "标题", todo: "待办", quote: "引用", callout: "提示", code: "代码" };

function NotesView() {
  const [page, setPage] = useState(initialPage);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline" | "conflict">("saved");
  const [slashBlock, setSlashBlock] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    readCachedPage(initialPage.id).then((cached) => cached && setPage(cached)).catch(() => undefined);
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

  const save = useCallback(async () => {
    setSaveState("saving");
    const nextPage = { ...page, updatedAt: new Date().toISOString() };
    try {
      await cachePage(nextPage);
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
  }, [page]);

  const exportPage = async () => downloadSophiePackage(await createSophiePackage(page), page.title);
  const importPage = async (file?: File) => {
    if (!file) return;
    try { const imported = await readSophiePackage(await file.text()); setPage(imported); await cachePage(imported); setSaveState("offline"); }
    catch (error) { alert(error instanceof Error ? error.message : "无法打开文件"); }
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
          <div><button className="quiet-button" onClick={() => fileInput.current?.click()}>导入</button><button className="quiet-button" onClick={exportPage}>导出 .sophie</button><button className="primary-small" onClick={save}>保存</button></div>
          <input ref={fileInput} hidden type="file" accept=".sophie,application/x-sophie-page" onChange={(event) => importPage(event.target.files?.[0])} />
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
              <div className={`block-row type-${block.type}`} key={block.id}>
                <div className="block-handle"><button aria-label="添加块" onClick={() => addBlock(block.id)}>＋</button><button aria-label="移动块">⋮⋮</button></div>
                {block.type === "todo" && <button className={`todo-box ${block.checked ? "checked" : ""}`} onClick={() => updateBlock(block.id, { checked: !block.checked })}>{block.checked ? "✓" : ""}</button>}
                {block.type === "callout" && <span className="callout-icon">✦</span>}
                {block.type === "quote" && <span className="quote-line" />}
                <textarea
                  className="block-input"
                  rows={block.type === "code" ? 3 : 1}
                  value={block.content}
                  spellCheck={block.type !== "code"}
                  placeholder={block.type === "text" ? "输入 ‘/’ 打开命令…" : blockLabels[block.type]}
                  onChange={(event) => { updateBlock(block.id, { content: event.target.value }); setSlashBlock(event.target.value === "/" ? block.id : undefined); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && block.type !== "code") { event.preventDefault(); addBlock(block.id); }
                    if (event.key === "Backspace" && !block.content && page.blocks.length > 1) { setPage((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) })); }
                  }}
                />
                {slashBlock === block.id && (
                  <div className="slash-menu">
                    <p>基础块</p>
                    {(Object.keys(blockLabels) as SophieBlock["type"][]).map((type) => <button key={type} onClick={() => { updateBlock(block.id, { type, content: "", ...(type === "todo" ? { checked: false } : {}) } as Partial<SophieBlock>); setSlashBlock(undefined); }}><span>{type === "heading" ? "H" : type === "todo" ? "☑" : type === "code" ? "⌘" : "¶"}</span><b>{blockLabels[type]}</b><small>{type === "text" ? "普通文本块" : `转换为${blockLabels[type]}块`}</small></button>)}
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

function TaskCard({ task }: { task: Task }) {
  return <article className="task-card" draggable><div className="task-card-top"><span>{task.id}</span><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span></div><h4>{task.title}</h4><div className="task-tags">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="task-card-footer"><span className="mini-avatar blue">{task.owner}</span><span>◷ {task.due}</span></div></article>;
}

function TableView({ tasks }: { tasks: Task[] }) {
  return <div className="data-table"><div className="table-row table-head"><span><input type="checkbox" aria-label="全选" /></span><span>任务</span><span>状态</span><span>优先级</span><span>负责人</span><span>截止日期</span><span>进度</span></div>{tasks.map((task) => <div className="table-row" key={task.id}><span><input type="checkbox" aria-label={`选择 ${task.title}`} /></span><span><b>{task.title}</b><small>{task.id}</small></span><span><i className={`state ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</i></span><span><i className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</i></span><span><i className="mini-avatar blue">{task.owner}</i></span><span>◷ {task.due}</span><span><i className="row-progress"><b style={{ width: `${task.progress}%` }} /></i><small>{task.progress}%</small></span></div>)}</div>;
}

function BoardView({ tasks, move }: { tasks: Task[]; move: (id: string, status: Task["status"]) => void }) {
  const statuses: Task["status"][] = ["Inbox", "In progress", "Review", "Done"];
  return <div className="board-view">{statuses.map((status) => <section className="board-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => move(event.dataTransfer.getData("task"), status)}><header><span className={`status-chip ${status.replace(" ", "-").toLowerCase()}`}>{status}</span><b>{tasks.filter((task) => task.status === status).length}</b><button>＋</button></header>{tasks.filter((task) => task.status === status).map((task) => <div key={task.id} draggable onDragStart={(event) => event.dataTransfer.setData("task", task.id)}><TaskCard task={task} /></div>)}<button className="column-add">＋ 新建</button></section>)}</div>;
}

function TimelineView({ tasks }: { tasks: Task[] }) {
  return <div className="timeline-view"><div className="timeline-header"><b>任务</b>{[17,18,19,20,21,22,23,24].map((day) => <span key={day}>{day}<small>JUL</small></span>)}</div>{tasks.map((task, index) => <div className="timeline-row" key={task.id}><strong>{task.title}</strong><div className="timeline-grid">{[17,18,19,20,21,22,23,24].map((day) => <i key={day} />)}<span className={`timeline-bar bar-${index % 4}`} style={{ left: `${Math.max(0, task.day - 17) * 12.5}%`, width: `${Math.max(18, task.progress / 3)}%` }}>{task.owner} · {task.progress}%</span></div></div>)}</div>;
}

function CalendarView({ tasks }: { tasks: Task[] }) {
  const days = Array.from({ length: 35 }, (_, index) => index + 1);
  return <div className="calendar-view"><div className="calendar-week">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}</div><div className="calendar-grid">{days.map((day) => <div className={day === 17 ? "today" : day > 31 ? "other" : ""} key={day}><b>{day > 31 ? day - 31 : day}</b>{tasks.filter((task) => task.day === day).map((task) => <span className={`calendar-task ${task.priority.toLowerCase()}`} key={task.id}>{task.title}</span>)}</div>)}</div></div>;
}

function GalleryView({ tasks }: { tasks: Task[] }) {
  return <div className="gallery-view">{tasks.map((task, index) => <article key={task.id}><div className={`gallery-cover cover-${index % 4}`}><span>{task.tags[0]}</span><i>{index % 2 ? "◫" : "✦"}</i></div><div><small>{task.id}</small><h3>{task.title}</h3><span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span><footer><span className="mini-avatar blue">{task.owner}</span><span>{task.due}</span></footer></div></article>)}</div>;
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

function DatabaseView() {
  const [view, setView] = useState<ViewType>("table");
  const [tasks, setTasks] = useState(initialTasks);
  const [viewMenu, setViewMenu] = useState(false);
  const move = (id: string, status: Task["status"]) => setTasks((current) => current.map((task) => task.id === id ? { ...task, status } : task));
  const addTask = (title: string) => setTasks((current) => [...current, { id: `T-${114 + current.length}`, title, status: "Inbox", priority: "Medium", due: "7月25日", day: 25, owner: "SC", tags: ["Product"], progress: 0, x: 50, y: 50 }]);
  return (
    <main className="database-content">
      <header className="database-title"><div><span className="database-icon">▦</span><div><h1>产品任务</h1><p>{tasks.length} 条记录 · 最后更新于刚刚</p></div></div><div><button className="quiet-button">分享</button><button className="primary-small" onClick={() => addTask("未命名任务")}>＋ 新建</button></div></header>
      <div className="view-tabs"><div className="visible-tabs">{viewOptions.slice(0, 6).map((option) => <button className={view === option.id ? "active" : ""} key={option.id} onClick={() => setView(option.id)}><span>{option.icon}</span>{option.label}</button>)}</div><div className="view-more"><button onClick={() => setViewMenu(!viewMenu)}>更多视图⌄</button>{viewMenu && <div className="view-menu">{viewOptions.slice(6).map((option) => <button key={option.id} onClick={() => { setView(option.id); setViewMenu(false); }}><span>{option.icon}</span><div><b>{option.label}</b><small>{option.id === "form" ? "收集信息" : option.id === "map" ? "按位置展示" : "分析与组织数据"}</small></div></button>)}</div>}</div><div className="view-tools"><button>⌕</button><button>筛选 <b>2</b></button><button>排序</button><button>分组</button><button>属性</button><button>•••</button></div></div>
      <section className={`view-canvas view-${view}`}>
        {view === "table" && <TableView tasks={tasks} />}
        {view === "board" && <BoardView tasks={tasks} move={move} />}
        {view === "timeline" && <TimelineView tasks={tasks} />}
        {view === "calendar" && <CalendarView tasks={tasks} />}
        {view === "list" && <div className="simple-list">{tasks.map((task) => <button key={task.id}><span className={`task-check ${task.status === "Done" ? "done" : ""}`}>{task.status === "Done" ? "✓" : ""}</span><strong>{task.title}</strong><span className={`status-chip ${task.status.replace(" ", "-").toLowerCase()}`}>{task.status}</span><small>{task.due}</small><i>›</i></button>)}</div>}
        {view === "gallery" && <GalleryView tasks={tasks} />}
        {view === "chart" && <ChartView tasks={tasks} />}
        {view === "map" && <MapView tasks={tasks} />}
        {view === "feed" && <FeedView tasks={tasks} />}
        {view === "dashboard" && <DashboardView tasks={tasks} />}
        {view === "form" && <FormView addTask={addTask} />}
      </section>
    </main>
  );
}

function AgentsView() {
  const [goal, setGoal] = useState("完成 SuperSophie 首个可运行版本并验证关键数据流");
  const [running, setRunning] = useState(true);
  const [model, setModel] = useState("GPT-5.6");
  return <main className="agents-content"><header className="section-title"><div><span className="large-section-icon">✦</span><div><p className="eyebrow">MULTI-AGENT WORKSPACE</p><h1>Agent Work</h1><p>描述目标，Sophie 会规划任务并组建最合适的团队。</p></div></div><button className="primary-button" onClick={() => setRunning(!running)}>{running ? "暂停任务" : "继续任务"}</button></header><section className="goal-composer"><div className="composer-glow">✦</div><div><label>当前目标</label><textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={2} /></div><div className="composer-settings"><span>主模型</span><select value={model} onChange={(event) => setModel(event.target.value)}><option>GPT-5.6</option><option>Claude 4.6 Opus</option><option>Gemini 3 Pro</option><option>OpenRouter · Auto</option><option>Ollama · Local</option></select><button>策略：平衡⌄</button></div></section><section className="agent-work-grid"><div className="team-panel"><div className="panel-heading"><div><span className="section-kicker">TEAM</span><h3>执行团队</h3></div><span className="live-pill"><StatusDot tone="green" />{running ? "运行中" : "已暂停"}</span></div><div className="agent-list">{agents.map((agent, index) => <article key={agent.name}><span className={`agent-avatar ${agent.tone}`}>{agent.initials}<i className={index === 3 || !running ? "waiting" : ""} /></span><div><h4>{agent.name}{index === 0 && <b>LEAD</b>}</h4><p>{agent.role}</p><small>{agent.model}</small></div><span className={`agent-state state-${index}`}>{!running ? "已暂停" : agent.status}</span><button>•••</button></article>)}</div><button className="add-agent">＋ 添加子 Agent</button></div><div className="run-panel"><div className="panel-heading"><div><span className="section-kicker">EXECUTION</span><h3>执行脉络</h3></div><button>查看完整日志</button></div><div className="run-timeline">{[
            ["已完成", "调研 Notion 数据库能力", "Scout · 8 分钟", "done"],
            ["已完成", "确定 Markdown-first 数据模型", "Sophie · 5 分钟", "done"],
            [running ? "进行中" : "已暂停", "实现工作台与离线数据流", "Maker · 64%", running ? "active" : "waiting"],
            ["等待", "执行构建与完整体验验证", "Critic · 依赖上一步", "waiting"],
          ].map(([state, title, meta, tone], index) => <div className={`run-step ${tone}`} key={title}><span>{tone === "done" ? "✓" : index + 1}</span><div><small>{state}</small><h4>{title}</h4><p>{meta}</p>{tone === "active" && <i className="step-progress"><b style={{ width: "64%" }} /></i>}</div><button>↗</button></div>)}</div></div></section><section className="model-strip"><div><span className="section-kicker">MODEL ROUTER</span><h3>多模型路由</h3><p>按任务能力、成本与隐私策略选择模型。</p></div>{[["OpenAI", "GPT-5.6", "推理与协调", "green"], ["Anthropic", "Claude 4.6", "实现与长文", "green"], ["Google", "Gemini 3 Pro", "检索与多模态", "green"], ["Local", "Ollama", "离线与隐私", "gray"]].map(([provider, name, use, tone]) => <article key={provider}><span className={`provider-mark ${provider.toLowerCase()}`}>{provider[0]}</span><div><strong>{name}</strong><small>{use}</small></div><StatusDot tone={tone} /></article>)}<button className="model-settings">配置模型 →</button></section></main>;
}

const codeFiles = ["app/workspace.tsx", "lib/sophie-package.ts", "db/schema.ts", "app/api/pages/route.ts"];
const snippets: Record<string, string> = {
  "app/workspace.tsx": `export function SophieWorkspace() {\n  const [section, setSection] = useState("home");\n\n  return (\n    <WorkspaceShell active={section}>\n      <MarkdownEditor offline sync />\n      <AgentWork modelRouter="balanced" />\n    </WorkspaceShell>\n  );\n}`,
  "lib/sophie-package.ts": `export const SOPHIE_MAGIC = "SOPHIE/1";\n\nexport async function createSophiePackage(page: SophiePage) {\n  const markdown = blocksToMarkdown(page);\n  const checksum = await sha256(markdown);\n  return serialize({ page, markdown, checksum });\n}`,
  "db/schema.ts": `export const documents = sqliteTable("documents", {\n  id: text("id").primaryKey(),\n  title: text("title").notNull(),\n  markdown: text("markdown").notNull(),\n  revision: integer("revision").notNull(),\n});`,
  "app/api/pages/route.ts": `export async function POST(request: Request) {\n  const page = await request.json();\n  await assertRevision(page.baseRevision);\n  return saveMarkdownDocument(page);\n}`,
};

function CodeView() {
  const [file, setFile] = useState(codeFiles[0]);
  const [code, setCode] = useState(snippets[codeFiles[0]]);
  const [logs, setLogs] = useState(["✓ Markdown schema valid", "✓ Offline package checksum valid", "● Development workspace ready"]);
  const select = (next: string) => { setFile(next); setCode(snippets[next]); };
  const run = () => setLogs(["> pnpm test", "✓ TypeScript compiled", "✓ 8 product checks passed", "Done in 4.2s"]);
  return <main className="code-content"><header className="code-toolbar"><div><button>‹</button><button>›</button><span>SuperSophie</span><i>/</i><strong>{file}</strong></div><div><button className="quiet-button">审阅改动</button><button className="primary-small" onClick={run}>▶ 运行验证</button></div></header><div className="ide"><aside className="file-explorer"><header>EXPLORER <button>•••</button></header><strong>⌄ SUPERSOPHIE</strong><div className="file-group"><span>⌄ app</span>{codeFiles.filter((item) => item.startsWith("app/")).map((item) => <button className={file === item ? "active" : ""} key={item} onClick={() => select(item)}><i>TS</i>{item.split("/").pop()}</button>)}<span>⌄ lib</span>{codeFiles.filter((item) => item.startsWith("lib/")).map((item) => <button className={file === item ? "active" : ""} key={item} onClick={() => select(item)}><i>TS</i>{item.split("/").pop()}</button>)}<span>⌄ db</span>{codeFiles.filter((item) => item.startsWith("db/")).map((item) => <button className={file === item ? "active" : ""} key={item} onClick={() => select(item)}><i>TS</i>{item.split("/").pop()}</button>)}</div><button className="agent-code-action">✦ 让 Agent 处理选中文件</button></aside><section className="code-editor"><div className="editor-tabs"><span><i>TS</i>{file.split("/").pop()} <b>×</b></span></div><div className="code-area"><div className="line-numbers">{code.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label="代码编辑器" /></div><div className="terminal"><header><span className="active">TERMINAL</span><span>OUTPUT</span><span>PROBLEMS <b>0</b></span><button>⌃</button></header><pre>{logs.map((log, index) => <span className={log.startsWith("✓") ? "success" : ""} key={index}>{log}</span>)}</pre></div></section></div></main>;
}

function ConnectorsView() {
  const connectorData = [
    { id: "app", name: "App Cloud", icon: "S", desc: "SuperSophie 托管同步", state: "已连接", tone: "violet" },
    { id: "onedrive", name: "OneDrive", icon: "☁", desc: "自定义云存储", state: "需要配置", tone: "blue" },
    { id: "wechat", name: "微信", icon: "微", desc: "发送消息与接收通知", state: "需要配置", tone: "green" },
    { id: "qq", name: "QQ", icon: "Q", desc: "群聊与私信机器人", state: "需要配置", tone: "blue" },
    { id: "telegram", name: "Telegram", icon: "T", desc: "Bot API 与频道", state: "需要配置", tone: "sky" },
  ];
  const [connected, setConnected] = useState(["app"]);
  const [channel, setChannel] = useState("telegram");
  const [message, setMessage] = useState("SuperSophie 首个工作台版本已经就绪，离线包和云端同步正在验证中。");
  const [outbox, setOutbox] = useState("尚未加入队列");
  const queue = async () => {
    try { const response = await fetch("/api/outbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, markdown: message }) }); if (!response.ok) throw new Error(); setOutbox("已进入审核队列"); }
    catch { setOutbox("已保存在本机，联网后重试"); }
  };
  return <main className="connectors-content"><header className="section-title"><div><span className="large-section-icon">◎</span><div><p className="eyebrow">CONNECTIONS & SYNC</p><h1>让工作流抵达真实世界</h1><p>选择存储位置，并把经过审核的信息发送到常用社交平台。</p></div></div><button className="quiet-button">连接器文档 ↗</button></header><section className="connector-grid">{connectorData.map((item) => { const isConnected = connected.includes(item.id); return <article key={item.id}><span className={`connector-logo ${item.tone}`}>{item.icon}</span><div><h3>{item.name}</h3><p>{item.desc}</p><span className={isConnected ? "connected" : "needs-config"}><StatusDot tone={isConnected ? "green" : "gray"} />{isConnected ? "已连接" : item.state}</span></div><button onClick={() => setConnected((current) => isConnected ? current.filter((id) => id !== item.id) : [...current, item.id])}>{isConnected ? "管理" : "配置"}</button></article>; })}</section><section className="connector-lower"><div className="message-composer"><div className="panel-heading"><div><span className="section-kicker">OUTBOX</span><h3>发送一条消息</h3></div><span className="review-pill">默认需要人工审核</span></div><label>发送到<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="wechat">微信</option><option value="qq">QQ</option><option value="telegram">Telegram</option></select></label><label>Markdown 消息<textarea rows={6} value={message} onChange={(event) => setMessage(event.target.value)} /></label><footer><span>{outbox}</span><button className="primary-button" onClick={queue}>加入审核队列 →</button></footer></div><div className="sync-settings"><div className="panel-heading"><div><span className="section-kicker">STORAGE</span><h3>同步策略</h3></div></div><div className="storage-choice active"><span className="connector-logo violet">S</span><div><strong>App Cloud</strong><small>当前主存储 · 端到端传输加密</small></div><i>✓</i></div><div className="storage-choice"><span className="connector-logo blue">☁</span><div><strong>OneDrive</strong><small>连接后可设为主存储或备份</small></div><i>＋</i></div><div className="sync-rule"><span><b>离线优先</b><small>先保存到设备，联网后自动同步</small></span><button className="toggle on"><i /></button></div><div className="sync-rule"><span><b>冲突保留双方</b><small>不静默覆盖任何版本</small></span><button className="toggle on"><i /></button></div></div></section></main>;
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
  const [online, setOnline] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    addEventListener("online", onOnline); addEventListener("offline", onOffline); addEventListener("keydown", onKey);
    return () => { removeEventListener("online", onOnline); removeEventListener("offline", onOffline); removeEventListener("keydown", onKey); };
  }, []);
  const go = (next: Section) => { setSection(next); setSidebarOpen(false); };
  return <div className="workspace-shell"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button><aside className={`sidebar ${sidebarOpen ? "open" : ""}`}><div className="workspace-switcher"><span className="brand-mark">S</span><div><strong>SuperSophie</strong><small>Personal workspace</small></div><button>⌄</button></div><nav>{navItems.map((item) => <button className={section === item.id ? "active" : ""} key={item.id} onClick={() => go(item.id)}><span className="nav-icon">{item.icon}</span><strong>{item.label}</strong>{item.hint && <i>{item.hint}</i>}</button>)}</nav><div className="sidebar-section"><p>空间</p><button onClick={() => go("notes")}><span className="space-dot violet" />产品与架构</button><button onClick={() => go("database")}><span className="space-dot amber" />项目与任务</button><button onClick={() => go("notes")}><span className="space-dot blue" />研究与灵感</button><button><span>＋</span>新建空间</button></div><div className="sidebar-bottom"><button><span>?</span><strong>帮助与快捷键</strong></button><div className="sync-card"><span className="cloud-mark">☁</span><div><strong>{online ? "云端已同步" : "当前离线"}</strong><small>{online ? "App Cloud · 刚刚" : "修改保存在此设备"}</small></div><StatusDot tone={online ? "green" : "amber"} /></div></div></aside><div className="workspace-main"><TopBar section={section} onSearch={() => setSearchOpen(true)} />{section === "home" && <HomeView go={go} />}{section === "notes" && <NotesView />}{section === "database" && <DatabaseView />}{section === "agents" && <AgentsView />}{section === "code" && <CodeView />}{section === "connectors" && <ConnectorsView />}</div>{searchOpen && <SearchPalette close={() => setSearchOpen(false)} go={go} />}<nav className="mobile-nav">{navItems.slice(0, 5).map((item) => <button className={section === item.id ? "active" : ""} key={item.id} onClick={() => go(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav></div>;
}
