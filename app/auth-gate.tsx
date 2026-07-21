"use client";

import Image from "next/image";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type WorkspaceSummary = { id: string; name: string; role: string };
type DeviceSummary = {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
};
type SessionPayload = {
  authenticated: true;
  user: { id: string; handle: string; displayName: string };
  activeWorkspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  devices: DeviceSummary[];
};

type AuthContextValue = SessionPayload & {
  reload: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  rotateKey: (currentKey: string, newKey: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function generatedAccessKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const value = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `SS-${value}`;
}

async function responseJson(response: Response) {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "request_failed");
  return payload;
}

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : "request_failed";
  const messages: Record<string, string> = {
    account_handle_taken: "这个账户名已经被使用。",
    invalid_credentials: "账户名或访问密钥不正确。",
    too_many_login_attempts: "尝试次数过多，请 15 分钟后再试。",
    invalid_registration: "请检查账户名、显示名称和访问密钥。",
    invalid_current_key: "当前访问密钥不正确。",
    workspace_access_denied: "你没有这个工作区的访问权限。",
  };
  return messages[code] || code;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthGate is required");
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("我的 SuperSophie");
  const [accessKey, setAccessKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const payload = await responseJson(response) as unknown as SessionPayload | { authenticated: false };
    setSession(payload.authenticated ? payload : null);
    setMode(payload.authenticated ? "login" : mode);
  }, [mode]);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(responseJson)
      .then((payload) => {
        if (!active) return;
        const candidate = payload as unknown as SessionPayload | { authenticated?: boolean };
        setSession(candidate.authenticated ? candidate as SessionPayload : null);
      })
      .catch((reason) => active && setError(friendlyError(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const sessionAction = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await responseJson(response) as unknown as SessionPayload;
    setSession(payload);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register"
        ? { handle, displayName, workspaceName, accessKey }
        : { handle, accessKey };
      await responseJson(await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      await reload();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="auth-loading"><span className="brand-mark">S</span><p>正在打开你的工作空间…</p></div>;

  if (!session) {
    return <main className="auth-shell">
      <div className="auth-ambient auth-ambient-one" /><div className="auth-ambient auth-ambient-two" />
      <section className="auth-character" aria-hidden="true">
        <Image unoptimized src="/sophie-companion.png" alt="" fill priority sizes="(max-width: 900px) 0px, 48vw" />
      </section>
      <section className="auth-card">
        <header><span className="brand-mark">S</span><div><strong>SuperSophie</strong><small>你的智能工作空间</small></div></header>
        <div className="auth-copy"><p>APP CLOUD · END-TO-END WORKSPACE</p><h1>{mode === "register" ? "创建你的云端空间" : "回到你的工作空间"}</h1><span>{mode === "register" ? "一个账户可在多台设备上安全访问 Markdown 笔记、Agent 运行和代码项目。" : "输入账户名和云端访问密钥；密钥不会保存在浏览器存储中。"}</span></div>
        <div className="auth-tabs"><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>创建账户</button><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>已有账户</button></div>
        <form onSubmit={submit}>
          {mode === "register" && <label>显示名称<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：Sophie" autoComplete="name" /></label>}
          <label>账户名<input required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="sophie" autoCapitalize="none" autoComplete="username" /></label>
          {mode === "register" && <label>工作区名称<input required maxLength={80} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></label>}
          <label>云端访问密钥<div className="auth-key-row"><input required minLength={mode === "register" ? 16 : 1} maxLength={128} type={showKey ? "text" : "password"} value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder={mode === "register" ? "至少 16 个字符" : "输入你的访问密钥"} autoComplete={mode === "register" ? "new-password" : "current-password"} /><button type="button" onClick={() => setShowKey(!showKey)}>{showKey ? "隐藏" : "显示"}</button></div></label>
          {mode === "register" && <div className="auth-key-actions"><button type="button" onClick={() => { const key = generatedAccessKey(); setAccessKey(key); setShowKey(true); }}>生成强密钥</button><button type="button" disabled={!accessKey} onClick={() => void navigator.clipboard.writeText(accessKey)}>复制</button><small>请保存在密码管理器中；服务器只保存不可逆派生值。</small></div>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={submitting}>{submitting ? "正在验证…" : mode === "register" ? "创建并进入" : "安全登录"}</button>
        </form>
        <footer><span>PBKDF2-HMAC-SHA256</span><span>HttpOnly Session</span><span>Markdown Audit</span></footer>
      </section>
    </main>;
  }

  const value: AuthContextValue = {
    ...session,
    reload,
    switchWorkspace: (workspaceId) => sessionAction({ action: "switch-workspace", workspaceId }),
    createWorkspace: (name) => sessionAction({ action: "create-workspace", name }),
    revokeSession: (sessionId) => sessionAction({ action: "revoke-session", sessionId }),
    rotateKey: async (currentKey, newKey) => {
      await responseJson(await fetch("/api/auth/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentKey, newKey }),
      }));
      await reload();
    },
    logout: async () => {
      await responseJson(await fetch("/api/auth/logout", { method: "POST" }));
      setSession(null);
      setAccessKey("");
      setMode("login");
    },
  };
  return <AuthContext.Provider value={value}><div key={session.activeWorkspace.id}>{children}</div></AuthContext.Provider>;
}

export function WorkspaceMenu({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [currentKey, setCurrentKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const run = async (action: () => Promise<void>, success = "") => {
    setBusy(true); setNotice("");
    try { await action(); setNotice(success); } catch (error) { setNotice(friendlyError(error)); } finally { setBusy(false); }
  };

  return <div className={`identity-menu ${compact ? "compact" : ""}`}>
    <button className="identity-trigger" onClick={() => setOpen(true)} aria-label="打开账户和工作区">
      <span className="brand-mark">S</span><div><strong>{auth.activeWorkspace.name}</strong><small>@{auth.user.handle} · {auth.activeWorkspace.role}</small></div><i>⌄</i>
    </button>
    {open && <div className="identity-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="identity-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p>账户与工作区</p><h2>{auth.user.displayName}</h2><span>@{auth.user.handle}</span></div><button onClick={() => setOpen(false)}>×</button></header>
        <div className="identity-section"><label>工作区</label>{auth.workspaces.map((workspace) => <button className={workspace.id === auth.activeWorkspace.id ? "selected" : ""} key={workspace.id} disabled={busy} onClick={() => void run(() => auth.switchWorkspace(workspace.id))}><span>{workspace.name.slice(0, 1).toUpperCase()}</span><div><strong>{workspace.name}</strong><small>{workspace.role}</small></div><i>{workspace.id === auth.activeWorkspace.id ? "✓" : "切换"}</i></button>)}<form onSubmit={(event) => { event.preventDefault(); const name = newWorkspace.trim(); if (name) void run(() => auth.createWorkspace(name), "工作区已创建").then(() => setNewWorkspace("")); }}><input value={newWorkspace} onChange={(event) => setNewWorkspace(event.target.value)} placeholder="新工作区名称" maxLength={80} /><button disabled={busy || !newWorkspace.trim()}>创建</button></form></div>
        <div className="identity-section"><label>登录设备</label>{auth.devices.map((device) => <div className="identity-device" key={device.id}><span>◫</span><div><strong>{device.current ? "当前设备" : device.deviceLabel}</strong><small>有效至 {new Date(device.expiresAt).toLocaleDateString("zh-CN")}</small></div>{!device.current && <button disabled={busy} onClick={() => void run(() => auth.revokeSession(device.id), "设备会话已撤销")}>撤销</button>}</div>)}</div>
        <div className="identity-section key-rotation"><label>创建新访问密钥</label><input type="password" value={currentKey} onChange={(event) => setCurrentKey(event.target.value)} placeholder="当前密钥" autoComplete="current-password" /><div><input value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder="新密钥（至少 16 字符）" autoComplete="new-password" /><button type="button" onClick={() => setNewKey(generatedAccessKey())}>生成</button></div><button disabled={busy || !currentKey || newKey.length < 16} onClick={() => void run(() => auth.rotateKey(currentKey, newKey), "新密钥已生效，其他设备已退出")}>轮换密钥</button></div>
        {notice && <p className="identity-notice">{notice}</p>}
        <footer><button disabled={busy} onClick={() => void run(auth.logout)}>退出当前设备</button><small>会话令牌不会写入 localStorage</small></footer>
      </section>
    </div>}
  </div>;
}
