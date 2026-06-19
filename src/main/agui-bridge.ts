// AG-UI IPC 桥：把 CyreneAgent 的事件流透传给渲染进程。
//
// 架构：
//   渲染进程  ──invoke(AGUI_RUN, input)──>  本桥  ──>  CyreneAgent.runWithEvents()
//     ▲                                        │ 订阅 Observable<BaseEvent>
//     └── send(AGUI_EVENT, baseEvent) ─────────┘ 每个 AG-UI 事件转发给渲染进程
//
// Observable 是内存流、跨不过进程边界，所以必须这层桥：
// 主进程订阅 agent 的 events$，每个 BaseEvent 通过 webContents.send 推给渲染进程。
//
// 本桥只管"跑 agent + 转发事件 + 跑完后做副作用"。
// 上下文构建和副作用由调用方（index.ts）注入回调，保持本模块不依赖 index.ts 内部函数。
import { ipcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { IPC } from "../shared/ipc-channels";
import { Subscription } from "rxjs";
import {
  CyreneAgent,
  type CyreneRunOptions,
  type CyreneRunResult,
} from "./orchestrator/cyrene-agent";

/** 渲染进程发起 run 时传的输入。 */
export interface AguiRunInput {
  messages: unknown[];   // 原始 {role, content}[]，主进程会 normalize
  style: string;         // 人格 style 文件名
}

/** 调用方（index.ts）注入：把输入转成 agent 需要的 options（含 system prompt 拼接）。 */
export type BuildOptionsFn = (input: AguiRunInput) => Promise<{
  options: CyreneRunOptions;
  /** 跑完后副作用需要的信息。 */
  latestUserText: string;
}>;

/** 调用方注入：agent 跑完后的副作用（记忆/sticker/表情/广播）。 */
export type OnRunFinishedFn = (result: CyreneRunResult, latestUserText: string) => Promise<void> | void;

/** 调用方注入：拿聊天窗口（广播副作用用，可空）。 */
export type GetChatWindowFn = () => { webContents: WebContents; isDestroyed(): boolean } | null;

/** 单次对话的活跃订阅（用于取消）。键 = runId。 */
const activeRuns = new Map<string, Subscription>();

let buildOptionsFn: BuildOptionsFn | null = null;
let getChatWindowFn: GetChatWindowFn = () => null;

/**
 * 注册 AG-UI IPC。由 index.ts 在 app.whenReady() 调一次。
 *
 * @param buildOptions 把渲染进程输入转成 agent options（含上下文构建）
 * @param onRunFinished agent 跑完的副作用（记忆/sticker 等）
 * @param getChatWindow 聊天窗口（事件要发到这里）
 */
export function registerAgUiIpc(
  buildOptions: BuildOptionsFn,
  onRunFinished: OnRunFinishedFn,
  getChatWindow: GetChatWindowFn,
): void {
  buildOptionsFn = buildOptions;
  getChatWindowFn = getChatWindow;

  const onFinished = onRunFinished;
  ipcMain.handle(IPC.AGUI_RUN, async (event: IpcMainInvokeEvent, rawInput: unknown) => {
    if (!buildOptionsFn || !onFinished) {
      throw new Error("AG-UI 桥未初始化");
    }
    const input = rawInput as AguiRunInput;
    const { options, latestUserText } = await buildOptionsFn(input);

    const threadId = `thread-${Date.now()}`;
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agent = new CyreneAgent({ threadId, description: "Cyrene 主聊天" });

    // 事件转发目标：优先用 invoke 的 sender（发起 run 的窗口），兜底用聊天窗口
    const sender = event.sender;

    const send = (baseEvent: unknown): void => {
      const targets: WebContents[] = [];
      if (!sender.isDestroyed()) targets.push(sender);
      const chatWin = getChatWindowFn();
      if (chatWin && !chatWin.isDestroyed() && chatWin.webContents !== sender) {
        targets.push(chatWin.webContents);
      }
      for (const t of targets) {
        try {
          t.send(IPC.AGUI_EVENT, baseEvent);
        } catch {
          // 窗口可能已销毁，忽略
        }
      }
    };

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const sub = agent.runWithEvents(options).subscribe({
        next: (baseEvent) => {
          send(baseEvent);
        },
        error: (err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[AgUiBridge] run 失败:", message);
          activeRuns.delete(runId);
          resolve({ success: false, error: message });
        },
        complete: async () => {
          activeRuns.delete(runId);
          try {
            if (agent.lastResult) {
              await onFinished(agent.lastResult, latestUserText);
            }
          } catch (err) {
            console.warn("[AgUiBridge] 副作用失败（不影响结果）:", err);
          }
          resolve({ success: true });
        },
      });
      activeRuns.set(runId, sub);
    });
  });

  ipcMain.handle(IPC.AGUI_CANCEL, () => {
    for (const sub of activeRuns.values()) {
      sub.unsubscribe();
    }
    activeRuns.clear();
    return true;
  });
}
