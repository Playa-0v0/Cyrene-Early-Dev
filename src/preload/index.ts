import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc-channels";

const cyreneApi = {
  minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  hide: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
  quit: () => ipcRenderer.send(IPC.APP_QUIT),
  setInteractive: (interactive: boolean) =>
    ipcRenderer.invoke(IPC.WINDOW_SET_INTERACTIVE, interactive),
  moveBy: (dx: number, dy: number) =>
    ipcRenderer.send(IPC.WINDOW_MOVE, dx, dy),
  moveTo: (x: number, y: number) =>
    ipcRenderer.send(IPC.WINDOW_MOVE_TO, x, y),
  setDragging: (isDragging: boolean) =>
    ipcRenderer.send(IPC.WINDOW_SET_DRAGGING, isDragging),
  captureFrame: () => ipcRenderer.invoke(IPC.WINDOW_CAPTURE_FRAME),
  getCursorPosition: () => ipcRenderer.invoke(IPC.WINDOW_GET_CURSOR_POSITION),
};

const chatApi = {
  minimize: () => ipcRenderer.send(IPC.CHAT_MINIMIZE),
  close: () => ipcRenderer.send(IPC.CHAT_CLOSE),
  toggleMaximize: () => ipcRenderer.send(IPC.CHAT_TOGGLE_MAXIMIZE),
  isMaximized: () => ipcRenderer.invoke(IPC.CHAT_IS_MAXIMIZED),
  sendMessage: (messages: unknown[], style: string) => ipcRenderer.invoke(IPC.CHAT_SEND_MESSAGE, messages, style),
  importDocument: (fileName: string, content: string) => ipcRenderer.invoke(IPC.CHAT_IMPORT_DOCUMENT, { fileName, content }),
  onStreamChunk: (cb: (chunk: string) => void) => { ipcRenderer.on(IPC.CHAT_STREAM_CHUNK, (_e: unknown, chunk: string) => cb(chunk)); },
  onStreamDone: (cb: (payload: unknown) => void) => { ipcRenderer.on(IPC.CHAT_STREAM_DONE, (_e: unknown, payload: unknown) => cb(payload)); },
  removeStreamListeners: () => { ipcRenderer.removeAllListeners(IPC.CHAT_STREAM_CHUNK); ipcRenderer.removeAllListeners(IPC.CHAT_STREAM_DONE); },
};

contextBridge.exposeInMainWorld("cyrene", cyreneApi);
contextBridge.exposeInMainWorld("chat", chatApi);

const sidebarApi = {
  minimize: () => ipcRenderer.send(IPC.SIDEBAR_MINIMIZE),
  close: () => ipcRenderer.send(IPC.SIDEBAR_CLOSE),
  toggleCollapse: () => ipcRenderer.send(IPC.SIDEBAR_TOGGLE_COLLAPSE),
  isCollapsed: () => ipcRenderer.invoke(IPC.SIDEBAR_IS_COLLAPSED),
  openTasks: () => ipcRenderer.send(IPC.SIDEBAR_OPEN_TASKS),
  openSettings: () => ipcRenderer.send(IPC.SIDEBAR_OPEN_SETTINGS),
};

const tasksApi = {
  minimize: () => ipcRenderer.send(IPC.TASKS_MINIMIZE),
  close: () => ipcRenderer.send(IPC.TASKS_CLOSE),
};

contextBridge.exposeInMainWorld("sidebar", sidebarApi);
contextBridge.exposeInMainWorld("tasks", tasksApi);
const settingsApi = {
  minimize: () => ipcRenderer.send(IPC.SETTINGS_MINIMIZE),
  close: () => ipcRenderer.send(IPC.SETTINGS_CLOSE),
  getConfig: () => ipcRenderer.invoke(IPC.SETTINGS_GET_CONFIG),
  saveConfig: (config: unknown) => ipcRenderer.invoke(IPC.SETTINGS_SAVE_CONFIG, config),
  getGeneral: () => ipcRenderer.invoke(IPC.SETTINGS_GET_GENERAL),
  saveGeneral: (config: unknown) => ipcRenderer.invoke(IPC.SETTINGS_SAVE_GENERAL, config),
  openSidebar: () => ipcRenderer.send(IPC.SETTINGS_OPEN_SIDEBAR),
  closeSidebar: () => ipcRenderer.send(IPC.SETTINGS_CLOSE_SIDEBAR),
  openTasks: () => ipcRenderer.send(IPC.SETTINGS_OPEN_TASKS),
  closeTasks: () => ipcRenderer.send(IPC.SETTINGS_CLOSE_TASKS),
  setPetAlwaysOnTop: (value: boolean) => ipcRenderer.send(IPC.SETTINGS_SET_PET_ALWAYS_ON_TOP, value),
  setPetVisible: (value: boolean) => ipcRenderer.send(IPC.SETTINGS_SET_PET_VISIBLE, value),
  previewRuntimeSync: (value: "off" | "local" | "llm") => ipcRenderer.send(IPC.SETTINGS_PREVIEW_RUNTIME_SYNC, value),
  openStickerManager: () => ipcRenderer.invoke(IPC.SETTINGS_OPEN_STICKER_MANAGER),
  getEmbeddingStatus: () => ipcRenderer.invoke(IPC.EMBEDDING_GET_STATUS),
  downloadEmbeddingModel: (model: string, mirror: string) => ipcRenderer.invoke(IPC.EMBEDDING_DOWNLOAD, { model, mirror }),
  deleteEmbeddingModel: (model: string) => ipcRenderer.invoke(IPC.EMBEDDING_DELETE, { model }),
  embeddingSetModel: (model: string) => ipcRenderer.invoke(IPC.EMBEDDING_SET_MODEL, model),
  rerankerSetMode: (mode: string) => ipcRenderer.invoke(IPC.RERANKER_SET_MODE, mode),
};

contextBridge.exposeInMainWorld("settings", settingsApi);

const stickerManagerApi = {
  minimize: () => ipcRenderer.send(IPC.STICKERS_MINIMIZE),
  close: () => ipcRenderer.send(IPC.STICKERS_CLOSE),
  getConfig: () => ipcRenderer.invoke(IPC.STICKERS_GET_CONFIG),
  setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke(IPC.STICKERS_SET_ENABLED, { id, enabled }),
};

contextBridge.exposeInMainWorld("stickerManager", stickerManagerApi);

const modelConfigApi = {
  get: () => ipcRenderer.invoke(IPC.MODEL_CONFIG_GET),
  onChanged: (callback: (config: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: unknown) => callback(config);
    ipcRenderer.on(IPC.MODEL_CONFIG_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.MODEL_CONFIG_CHANGED, listener);
  },
};

contextBridge.exposeInMainWorld("modelConfig", modelConfigApi);
const runtimeStateApi = {
  get: () => ipcRenderer.invoke(IPC.RUNTIME_STATE_GET),
  onChanged: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on(IPC.RUNTIME_STATE_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.RUNTIME_STATE_CHANGED, listener);
  },
};

const userApi = {
  getProfile: () => ipcRenderer.invoke(IPC.USER_GET_PROFILE),
  saveProfile: (profile: unknown) => ipcRenderer.invoke(IPC.USER_SAVE_PROFILE, profile),
  uploadAvatar: () => ipcRenderer.invoke(IPC.USER_UPLOAD_AVATAR),
  getAvatar: () => ipcRenderer.invoke(IPC.USER_GET_AVATAR),
};

contextBridge.exposeInMainWorld("user", userApi);
contextBridge.exposeInMainWorld("runtimeState", runtimeStateApi);
