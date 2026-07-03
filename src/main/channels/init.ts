// init-channels —— channels 模块的主入口。由 index.ts 在 app.whenReady() 调一次。
//
// 当前阶段：
//   - Phase 0: 骨架 + dispatcher + inbound-server
//   - Phase 2: 接入 FeishuAdapter（自建飞书应用 + 事件订阅）
//
// 注意：initChannels 必须晚于 initRAG / initMcpManager / loadModelSettings。
import { app, BrowserWindow, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import {
  loadChannelsSettings,
  saveChannelsSettings,
} from "./settings-store";
import { channelManager } from "./manager";
import { channelDispatcher } from "./dispatcher";
import { startInboundServer, stopInboundServer } from "./inbound-server";
import { FeishuAdapter } from "./adapters/feishu";
import { getRecentLog, clearLog } from "./message-log";

const LOG = "[ChannelsInit]";

let initialized = false;

/** app.whenReady() 调一次。idempotent。 */
export async function initChannels(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // 注入 dispatcher 到 manager
  channelManager.setDispatcher(async (msg) => {
    return await channelDispatcher.handleIncoming(msg);
  });

  // 注册全局 IPC
  registerChannelsIpc();

  // 启动 inbound-server
  try {
    const handle = await startInboundServer();
    console.log(LOG, `入站 server 监听 http://127.0.0.1:${handle.port}`);
  } catch (err) {
    console.error(LOG, "入站 server 启动失败:", err);
  }

  // 注册 adapter：Phase 2 实装 FeishuAdapter（Phase 1 才加 WechatAdapter）
  const feishuAdapter = new FeishuAdapter();
  channelManager.register(feishuAdapter);

  // 启动所有已注册 adapter
  await channelManager.startAll();

  console.log(LOG, "channels 模块就绪");
  broadcastChannelsStatus();
}

/** app.on('before-quit') 调 */
export async function shutdownChannels(): Promise<void> {
  await channelManager.stopAll();
  await stopInboundServer();
  initialized = false;
}

/** IPC 注册 */
function registerChannelsIpc(): void {
  ipcMain.handle(IPC.CHANNELS_GET_CONFIG, () => loadChannelsSettings());

  ipcMain.handle(IPC.CHANNELS_SAVE_CONFIG, (_e, patch: unknown) => {
    return saveChannelsSettings(patch as Parameters<typeof saveChannelsSettings>[0]);
  });

  ipcMain.handle(IPC.CHANNELS_LIST, () => channelManager.listChannels());

  ipcMain.handle(IPC.CHANNELS_GET_STATUS, () => channelManager.getAllStatus());

  ipcMain.handle(IPC.CHANNELS_RESTART, async () => {
    await channelManager.stopAll();
    await channelManager.startAll();
    broadcastChannelsStatus();
    return { ok: true };
  });

  // Phase 1 占位（微信未实装）
  const notImplWechat = (_e: unknown, ..._args: unknown[]) => ({
    ok: false,
    error: "微信渠道功能开发中 (Phase 1)",
  });
  ipcMain.handle(IPC.CHANNELS_WECHAT_INSTALL, notImplWechat);
  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGIN_START, notImplWechat);
  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGIN_CANCEL, notImplWechat);
  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGIN_RESULT, () => ({ running: false }));
  ipcMain.handle(IPC.CHANNELS_WECHAT_PAIRING_LIST, () => []);
  ipcMain.handle(IPC.CHANNELS_WECHAT_PAIRING_APPROVE, notImplWechat);
  ipcMain.handle(IPC.CHANNELS_WECHAT_LOGOUT, notImplWechat);
  ipcMain.handle(IPC.CHANNELS_WECHAT_RUNTIME_DETECT, () => null);
  ipcMain.handle(IPC.CHANNELS_WECHAT_RUNTIME_INSTALL, notImplWechat);
  ipcMain.handle(IPC.CHANNELS_WECHAT_RUNTIME_UPDATE, notImplWechat);

  // Phase 2 长连接：测试连接 = 重建 LarkChannel（SDK 内部会自动跑 WSS handshake）
  ipcMain.handle(IPC.CHANNELS_FEISHU_TEST_CONNECTION, async () => {
    const adapter = channelManager.getAdapter("feishu") as FeishuAdapter | undefined;
    if (!adapter) return { ok: false, error: "飞书 adapter 未注册" };
    const status = adapter.getStatus();
    if (!status.enabled) return { ok: false, error: "飞书渠道未启用" };
    if (!loadChannelsSettings().feishu.appId || !loadChannelsSettings().feishu.appSecret) {
      return { ok: false, error: "App ID / App Secret 未配置" };
    }
    try {
      await adapter.rebuild();
      const s = adapter.getStatus();
      if (s.phase === "running") {
        return { ok: true, message: "WSS 长连接已建立" };
      }
      return { ok: false, error: s.message ?? "握手未完成" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 长连接模式不需要 webhook URL —— 这个 IPC 保留但返回 ok 提示用户用长连接
  ipcMain.handle(IPC.CHANNELS_FEISHU_TEST_WEBHOOK_REACHABLE, async () => {
    return {
      ok: true,
      message: "长连接模式不需要公网 URL — SDK 已自动建立 WSS 连接",
    };
  });

  // Phase 3.4：消息日志
  ipcMain.handle(IPC.CHANNELS_LOG_GET, (_e, limit: unknown) => {
    const n = typeof limit === "number" && limit > 0 ? limit : 100;
    return getRecentLog(n);
  });
  ipcMain.handle(IPC.CHANNELS_LOG_CLEAR, () => {
    clearLog();
    return { ok: true };
  });
}

/** 工具：把所有 BrowserWindow 广播 channels 状态变更（UI 轮询用）。 */
export function broadcastChannelsStatus(): void {
  const status = channelManager.getAllStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(IPC.CHANNELS_STATUS_CHANGED, status);
    } catch (err) {
      console.warn(LOG, "广播失败:", err);
    }
  }
}

/** 工具：把所有 BrowserWindow 广播安装进度。 */
export function broadcastChannelsInstallProgress(progress: {
  channel: string;
  phase: string;
  pct: number;
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(IPC.CHANNELS_INSTALL_PROGRESS, progress);
    } catch (err) {
      console.warn(LOG, "广播安装进度失败:", err);
    }
  }
}

void app;