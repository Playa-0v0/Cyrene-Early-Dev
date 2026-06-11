import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc-channels";

const api = {
  minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  hide: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
  quit: () => ipcRenderer.send(IPC.APP_QUIT),
  screenshot: () => ipcRenderer.invoke("debug:screenshot"),
};

contextBridge.exposeInMainWorld("cyrene", api);
