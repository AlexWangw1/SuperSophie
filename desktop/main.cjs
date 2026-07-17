/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } = require("electron");
const path = require("node:path");

const PRODUCT_URL = "https://supersophie-workspace.shijiewang0310.chatgpt.site";
let mainWindow;
let petWindow;
let tray;
let petEnabled = true;
let isQuitting = false;

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
  petWindow.loadFile(path.join(__dirname, "pet.html"));
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

  app.on("activate", showMain);
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
