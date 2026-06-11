import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from "electron";
import * as path from "path";
import * as fs from "fs";
import { IPC } from "../shared/ipc-channels";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = process.env.VITE_DEV === "1";

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "renderer", "index.html"));
  }

  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show/Hide",
      click: () => {
        if (mainWindow) {
          mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Cyrene");
  tray.setContextMenu(contextMenu);
}

// Screenshot IPC for debugging
ipcMain.handle("debug:screenshot", async () => {
  if (!mainWindow) return null;
  const image = await mainWindow.webContents.capturePage();
  const png = image.toPNG();
  const outPath = path.join(app.getPath("temp"), "cyrene-screenshot.png");
  fs.writeFileSync(outPath, png);
  return outPath;
});

ipcMain.on(IPC.WINDOW_MINIMIZE, () => {
  mainWindow?.minimize();
});

ipcMain.on(IPC.WINDOW_CLOSE, () => {
  mainWindow?.hide();
});

ipcMain.on(IPC.APP_QUIT, () => {
  app.quit();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
