import "../ui/base.css";
import "./sidebar.css";

interface ModelConfig {
  mode: "auto" | "manual";
  provider: string;
  displayName?: string;
  shortName: string;
  model: string;
  connected: boolean;
  runtimeSync: "off" | "local" | "llm";
}

interface ModelConfigApi {
  get: () => Promise<ModelConfig>;
  onChanged: (callback: (config: ModelConfig) => void) => () => void;
}

type RuntimeStatus = "陪伴中" | "思考中" | "工作中" | "聆听中" | "提醒中" | "离线";
type RuntimeFeeling = "平静" | "开心" | "温柔" | "激动" | "撒娇" | "担心" | "难过" | "感动" | "害羞";

interface RuntimeState {
  status: RuntimeStatus;
  feeling: RuntimeFeeling;
  expression: number;
}

interface RuntimeStateApi {
  get: () => Promise<RuntimeState>;
  onChanged: (callback: (state: RuntimeState) => void) => () => void;
}

interface SidebarApi {
  minimize: () => void;
  close: () => void;
  toggleCollapse: () => void;
  isCollapsed: () => Promise<boolean>;
  openTasks: () => void;
  openSettings: (section?: string) => void;
}

declare global {
  interface Window {
    sidebar?: SidebarApi;
    modelConfig?: ModelConfigApi;
    runtimeState?: RuntimeStateApi;
  }
}

// 没有 preload 时给浏览器跑留个 no-op，方便 vite 单独打开 sidebar 调试
if (!window.sidebar) {
  (window as unknown as { sidebar: SidebarApi }).sidebar = {
    minimize: () => {},
    close: () => {},
    toggleCollapse: () => {},
    isCollapsed: () => Promise.resolve(false),
    openTasks: () => {},
    openSettings: (_section?: string) => {},
  };
}

const root = document.querySelector(".sidebar") as HTMLElement | null;
const collapseBtn = document.getElementById("collapse-btn") as HTMLButtonElement;
const minBtn = document.getElementById("min-btn") as HTMLButtonElement;
const closeBtn = document.getElementById("close-btn") as HTMLButtonElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const modelSwitchBtn = document.getElementById("model-switch-btn") as HTMLButtonElement;
const onlineStatusLabel = document.getElementById("online-status-label") as HTMLElement;
const statusEmojiEl = document.getElementById("status-emoji") as HTMLElement;
const statusLabelEl = document.getElementById("status-label") as HTMLElement;
const feelingEmojiEl = document.getElementById("feeling-emoji") as HTMLElement;
const feelingLabelEl = document.getElementById("feeling-label") as HTMLElement;
const feedingModelEl = document.getElementById("feeding-model") as HTMLElement;
const onlineBadge = onlineStatusLabel.closest(".profile__online") as HTMLElement | null;
let runtimeSyncEnabled = false;
let latestRuntimeState: RuntimeState | null = null;

const STATUS_EMOJI: Record<RuntimeStatus, string> = {
  陪伴中: "🌸",
  思考中: "💭",
  工作中: "⚡",
  聆听中: "🫧",
  提醒中: "🔔",
  离线: "💤",
};

const FEELING_EMOJI: Record<RuntimeFeeling, string> = {
  平静: "🌿",
  开心: "✨",
  温柔: "🌸",
  激动: "🎉",
  撒娇: "🥺",
  担心: "💙",
  难过: "💧",
  感动: "🥹",
  害羞: "🌹",
};

function applyRuntimeDisabled(): void {
  statusEmojiEl.textContent = "⚙️";
  statusLabelEl.textContent = "请到设置里开启";
  feelingEmojiEl.textContent = "⚙️";
  feelingLabelEl.textContent = "请到设置里开启";
}

function applyRuntimeState(state: RuntimeState | null): void {
  latestRuntimeState = state;
  if (!runtimeSyncEnabled) {
    applyRuntimeDisabled();
    return;
  }
  const status = state?.status ?? "陪伴中";
  const feeling = state?.feeling ?? "平静";
  statusEmojiEl.textContent = STATUS_EMOJI[status] ?? "💬";
  statusLabelEl.textContent = status;
  feelingEmojiEl.textContent = FEELING_EMOJI[feeling] ?? "🌿";
  feelingLabelEl.textContent = feeling;
}

async function initRuntimeState(): Promise<void> {
  try {
    const state = await window.runtimeState?.get();
    applyRuntimeState(state ?? null);
  } catch {
    applyRuntimeState(null);
  }
  window.runtimeState?.onChanged((state) => applyRuntimeState(state));
}

function applyModelConfig(config: ModelConfig | null): void {
  const connected = Boolean(config?.connected);
  const wasRuntimeSyncEnabled = runtimeSyncEnabled;
  runtimeSyncEnabled = config?.runtimeSync === "local" || config?.runtimeSync === "llm";
  onlineStatusLabel.textContent = connected ? "在线" : "离线";
  onlineBadge?.classList.toggle("is-offline", !connected);
  // "正在喂养"显示优先级：用户昵称 > 厂商短名 > model id > 兜底
  feedingModelEl.textContent = config?.displayName || config?.shortName || config?.model || "未选择模型";
  if (!runtimeSyncEnabled) applyRuntimeDisabled();
  else if (!wasRuntimeSyncEnabled) applyRuntimeState(latestRuntimeState);
}

async function initModelConfig(): Promise<void> {
  try {
    const config = await window.modelConfig?.get();
    applyModelConfig(config ?? null);
  } catch {
    applyModelConfig(null);
  }
  window.modelConfig?.onChanged((config) => applyModelConfig(config));
}
async function syncCollapseUI(): Promise<void> {
  const collapsed = await window.sidebar!.isCollapsed();
  if (root) root.classList.toggle("is-collapsed", collapsed);
  collapseBtn.textContent = collapsed ? "›" : "‹";
  collapseBtn.setAttribute("aria-label", collapsed ? "展开" : "收起");
  collapseBtn.setAttribute("title", collapsed ? "展开" : "收起");
}

collapseBtn.addEventListener("click", () => {
  window.sidebar?.toggleCollapse();
  setTimeout(() => { void syncCollapseUI(); }, 100);
});

minBtn.addEventListener("click", () => {
  window.sidebar?.minimize();
});

closeBtn.addEventListener("click", () => {
  window.sidebar?.close();
});

settingsBtn.addEventListener("click", () => {
  window.sidebar?.openSettings();
});

modelSwitchBtn.addEventListener("click", () => {
  // "切换模型"直奔 API 配置标签，而不是默认的通用标签
  window.sidebar?.openSettings("api");
});

void syncCollapseUI();
void initModelConfig();
void initRuntimeState();
