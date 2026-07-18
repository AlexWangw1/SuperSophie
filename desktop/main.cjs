/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage, screen } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const PRODUCT_URL = "https://supersophie-workspace.shijiewang0310.chatgpt.site";
let mainWindow;
let petWindow;
let tray;
let petEnabled = true;
let isQuitting = false;
let codeProjectRoot;

const CODE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".html", ".java", ".js", ".json", ".jsx",
  ".kt", ".md", ".mjs", ".cjs", ".php", ".ps1", ".py", ".rb", ".rs", ".sh", ".sql", ".swift",
  ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml",
]);
const IGNORED_DIRECTORIES = new Set([".git", ".next", ".vinext", ".wrangler", "build", "coverage", "dist", "node_modules", "out"]);

function assertTrustedRenderer(event) {
  const senderUrl = event.senderFrame?.url || "";
  const origin = new URL(senderUrl).origin;
  const productOrigin = new URL(process.env.SUPERSOPHIE_URL || PRODUCT_URL).origin;
  if (origin !== productOrigin && origin !== "http://localhost:3000") throw new Error("Untrusted renderer");
}

function resolveCodeProjectPath(relativePath) {
  if (!codeProjectRoot) throw new Error("请先选择本地项目目录");
  if (typeof relativePath !== "string" || !relativePath.trim() || path.isAbsolute(relativePath)) throw new Error("文件路径无效");
  const target = path.resolve(codeProjectRoot, relativePath);
  const boundary = `${path.resolve(codeProjectRoot)}${path.sep}`;
  if (!target.startsWith(boundary)) throw new Error("文件路径超出已选择项目");
  return target;
}

function fileHash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isWithinRoot(root, target) {
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const normalizedTarget = process.platform === "win32" ? target.toLowerCase() : target;
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

async function assertRealPathWithinProject(target, allowMissing) {
  const realRoot = await fs.realpath(codeProjectRoot);
  let probe = target;
  while (true) {
    try {
      const realTarget = await fs.realpath(probe);
      if (!isWithinRoot(realRoot, realTarget)) throw new Error("文件路径通过符号链接超出已选择项目");
      return;
    } catch (error) {
      if (error.code !== "ENOENT" || !allowMissing) throw error;
      const parent = path.dirname(probe);
      if (parent === probe) throw new Error("无法验证文件目录");
      probe = parent;
    }
  }
}

async function listProjectFiles(root, relative = "", output = []) {
  if (output.length >= 500) return output;
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    if (output.length >= 500) break;
    const next = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) await listProjectFiles(root, next, output);
      continue;
    }
    if (!entry.isFile() || !CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const stats = await fs.stat(path.join(root, next));
    if (stats.size <= 2 * 1024 * 1024) output.push({ path: next.split(path.sep).join("/"), size: stats.size });
  }
  return output;
}

async function readProjectFile(relativePath) {
  const target = resolveCodeProjectPath(relativePath);
  await assertRealPathWithinProject(target, false);
  const content = await fs.readFile(target, "utf8");
  if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error("文件超过 2 MB 限制");
  return { path: relativePath, content, hash: fileHash(content) };
}

async function saveProjectFile(input) {
  if (!input || typeof input.content !== "string" || Buffer.byteLength(input.content) > 2 * 1024 * 1024) throw new Error("文件内容无效或超过 2 MB");
  const target = resolveCodeProjectPath(input.path);
  await assertRealPathWithinProject(target, true);
  let current;
  try { current = await fs.readFile(target, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (current !== undefined && input.expectedHash !== fileHash(current)) throw new Error("FILE_CHANGED: 文件已被其他程序修改，请重新载入");
  if (current === undefined && input.expectedHash) throw new Error("FILE_CHANGED: 文件已经不存在");
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.sophie-${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, input.content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return { path: input.path, hash: fileHash(input.content) };
}

function runProjectCommand(commandName) {
  if (!codeProjectRoot) throw new Error("请先选择本地项目目录");
  const commands = {
    test: ["test"],
    typecheck: ["exec", "tsc", "--noEmit"],
    lint: ["lint"],
  };
  const args = commands[commandName];
  if (!args) throw new Error("只允许 test、typecheck 或 lint");
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "pnpm";
    const childArgs = process.platform === "win32" ? ["/d", "/s", "/c", `pnpm ${args.join(" ")}`] : args;
    const child = spawn(executable, childArgs, { cwd: codeProjectRoot, windowsHide: true, shell: false, env: process.env });
    let output = "";
    const append = (chunk) => { if (output.length < 1_000_000) output += chunk.toString(); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", reject);
    child.on("close", (code) => resolve({ command: commandName, exitCode: code ?? -1, output: output.slice(0, 1_000_000) }));
    const timeout = setTimeout(() => child.kill(), 5 * 60_000);
    child.once("close", () => clearTimeout(timeout));
  });
}

function windowPreferences() {
  return {
    preload: path.join(__dirname, "preload.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: "#090716",
    icon: path.join(__dirname, "icon.png"),
    show: false,
    autoHideMenuBar: true,
    title: "SuperSophie",
    webPreferences: windowPreferences(),
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(process.env.SUPERSOPHIE_URL || (app.isPackaged ? PRODUCT_URL : "http://localhost:3000"));

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    if (petEnabled) {
      event.preventDefault();
      mainWindow.hide();
      showPet();
      return;
    }
    isQuitting = true;
    petWindow?.destroy();
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 300,
    height: 420,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: windowPreferences(),
  });

  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const petImagePath = app.isPackaged
    ? path.join(process.resourcesPath, "sophie-companion.png")
    : path.join(__dirname, "..", "public", "sophie-companion.png");
  petWindow.loadFile(path.join(__dirname, "pet.html"), {
    query: { image: pathToFileURL(petImagePath).href },
  });
  petWindow.on("closed", () => {
    petWindow = undefined;
  });
}

function placePet() {
  if (!petWindow) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  petWindow.setPosition(x + width - 320, y + height - 440, false);
}

function showPet() {
  if (!petEnabled) return;
  if (!petWindow) createPetWindow();
  placePet();
  petWindow.showInactive();
}

function showMain() {
  if (!mainWindow) createMainWindow();
  petWindow?.hide();
  mainWindow.show();
  mainWindow.focus();
}

function quitApplication() {
  isQuitting = true;
  app.quit();
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip("SuperSophie");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 SuperSophie", click: showMain },
    { label: "显示桌面陪伴", click: showPet },
    { type: "separator" },
    { label: "退出", click: quitApplication },
  ]));
  tray.on("double-click", showMain);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();
  createPetWindow();
  createTray();

  ipcMain.handle("sophie:set-pet-enabled", (_event, enabled) => {
    petEnabled = Boolean(enabled);
    if (!petEnabled) petWindow?.hide();
  });
  ipcMain.handle("sophie:show-main", showMain);
  ipcMain.handle("sophie:quit", quitApplication);
  ipcMain.handle("sophie:choose-code-project", async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"], title: "选择本地代码项目" });
    if (result.canceled || !result.filePaths[0]) return null;
    codeProjectRoot = path.resolve(result.filePaths[0]);
    return { name: path.basename(codeProjectRoot), files: await listProjectFiles(codeProjectRoot) };
  });
  ipcMain.handle("sophie:read-code-file", async (event, relativePath) => {
    assertTrustedRenderer(event);
    return readProjectFile(relativePath);
  });
  ipcMain.handle("sophie:save-code-file", async (event, input) => {
    assertTrustedRenderer(event);
    return saveProjectFile(input);
  });
  ipcMain.handle("sophie:run-code-check", async (event, commandName) => {
    assertTrustedRenderer(event);
    return runProjectCommand(commandName);
  });

  app.on("activate", showMain);
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
