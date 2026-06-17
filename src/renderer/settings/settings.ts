import "../ui/base.css";
import "./settings.css";

// Inline modal (to avoid Vite tree-shaking)
let _cyModalOverlay: HTMLElement | null = null;
function _initModalOverlay(): void {
  if (_cyModalOverlay) return;
  _cyModalOverlay = document.createElement("div");
  _cyModalOverlay.id = "cy-modal-overlay";
  _cyModalOverlay.className = "cy-modal-overlay is-hidden";
  _cyModalOverlay.innerHTML = [
    '<div class="cy-modal" role="alertdialog" aria-modal="true">',
    '  <div class="cy-modal__head">',
    '    <span class="cy-modal__icon" id="cy-modal-icon">📌</span>',
    '    <h3 class="cy-modal__title" id="cy-modal-title">提示</h3>',
    '  </div>',
    '  <hr class="cy-modal__divider">',
    '  <p class="cy-modal__body" id="cy-modal-message">确认执行此操作吗？</p>',
    '  <div class="cy-modal__actions">',
    '    <button type="button" class="ghost-btn" id="cy-modal-cancel">取消</button>',
    '    <button type="button" class="btn-primary" id="cy-modal-confirm">确定</button>',
    '  </div>',
    '</div>',
  ].join("\n");
  document.body.appendChild(_cyModalOverlay);
}

function showModal (options: { title: string; message: string; icon?: string; confirmText?: string; cancelText?: string }): Promise<boolean> {
  _initModalOverlay();
  if (!_cyModalOverlay) return Promise.resolve(false);
  var iconEl = _cyModalOverlay.querySelector("#cy-modal-icon") as HTMLElement;
  var titleEl = _cyModalOverlay.querySelector("#cy-modal-title") as HTMLElement;
  var msgEl = _cyModalOverlay.querySelector("#cy-modal-message") as HTMLElement;
  var cancelBtn = _cyModalOverlay.querySelector("#cy-modal-cancel") as HTMLButtonElement;
  var confirmBtn = _cyModalOverlay.querySelector("#cy-modal-confirm") as HTMLButtonElement;
  iconEl.textContent = options.icon || "📌";
  titleEl.textContent = options.title;
  msgEl.textContent = options.message;
  cancelBtn.textContent = options.cancelText || "取消";
  confirmBtn.textContent = options.confirmText || "确定";
  _cyModalOverlay.classList.remove("is-hidden");
  return new Promise(function (resolve) {
    var cleanup = function (result: boolean) {
      _cyModalOverlay?.classList.add("is-hidden");
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      resolve(result);
    };
    var onCancel = function () { cleanup(false); };
    var onConfirm = function () { cleanup(true); };
    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
  });
}


interface ModelSettings {
  mode: "auto" | "manual";
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  runtimeSync: "off" | "local" | "llm";
  stickerEnabled: boolean;
  stickerSize: "small" | "standard" | "large";
}

interface ModelPreset {
  providerName: string;
  baseUrl: string;
  mainModels: string[];
  iconUrl: string;
}

interface GeneralSettings {
  musicEnabled: boolean;
  musicVolume: number;
  soundEnabled: boolean;
  soundVolume: number;
  petAlwaysOnTop: boolean;
  petVisible: boolean;
  launchAtLogin: boolean;
  language: "zh-CN";
}

interface UserApi {
  getProfile: () => Promise<{ nickname: string; callPreference: string; birthday: string; timezone: string; avatarPath: string }>;
  saveProfile: (profile: Record<string, unknown>) => Promise<unknown>;
  uploadAvatar: () => Promise<{ avatarPath: string } | null>;
  getAvatar: () => Promise<string | null>;
}

interface MemoryPanelPayload {
  l0: {
    preferredName: string;
    occupation: string;
    longTermInterests: string;
    language: string;
    permanentNote: string;
  };
  l1: {
    recentGoals: string;
    recentPreferences: string;
    currentProject: string;
  };
  l2: Array<{
    id: string;
    content: string;
    triggerText: string;
    status: "active" | "aging" | "archived";
    weight: number;
    createdAt: number;
  }>;
  importedDocs: Array<{
    importId: string | null;
    fileName: string;
    chunkCount: number;
    lastImportedAt: number;
  }>;
  reflections: Array<{
    id: string;
    title: string;
    body: string;
    meta: string;
  }>;
}

interface MemoryPanelApi {
  getData: () => Promise<MemoryPanelPayload>;
  deleteImportedDoc: (importId: string, fileName?: string) => Promise<{ ok: boolean; deleted: number }>;
}

interface SettingsApi {
  minimize: () => void;
  close: () => void;
  getConfig: () => Promise<ModelSettings>;
  saveConfig: (config: Partial<ModelSettings>) => Promise<ModelSettings>;
  getGeneral: () => Promise<GeneralSettings>;
  saveGeneral: (config: Partial<GeneralSettings>) => Promise<GeneralSettings>;
  openSidebar: () => void;
  closeSidebar: () => void;
  openTasks: () => void;
  closeTasks: () => void;
  setPetAlwaysOnTop: (value: boolean) => void;
  setPetVisible: (value: boolean) => void;
  previewRuntimeSync: (value: "off" | "local" | "llm") => void;
  openStickerManager: () => Promise<{ ok: boolean; error?: string }>;
  getEmbeddingStatus?: () => Promise<Record<string, { installed: boolean; sizeBytes: number }>>;
  downloadEmbeddingModel?: (model: string, mirror: string) => Promise<{ ok: boolean; error?: string }>;
  deleteEmbeddingModel?: (model: string) => Promise<{ ok: boolean; error?: string }>;
  embeddingSetModel?: (model: string) => Promise<{ ok: boolean; clearedEntries?: number; error?: string }>;
  rerankerSetMode?: (mode: string) => Promise<boolean>;
}

declare global {
  interface Window {
    settings?: SettingsApi;
    user?: UserApi;
    memoryPanel?: MemoryPanelApi;
  }
}

const MODEL_PRESETS: ModelPreset[] = [
  {
    providerName: "豆包（火山方舟）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    mainModels: ["doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-2.0-code"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doubao.svg",
  },  {
    providerName: "火山 Agent-Plan",
    baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
    mainModels: ["ark-code-latest"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doubao.svg",
  },
  {
    providerName: "通义千问（DashScope）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    mainModels: ["qwen-max", "qwen-plus", "qwen-turbo"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qwen.svg",
  },
  {
    providerName: "文心 ERNIE（百度千帆）",
    baseUrl: "https://qianfan.baiducbce.com/v2",
    mainModels: ["ERNIE-5.1", "ERNIE-5.0", "ERNIE-4.5-Turbo-128K"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/wenxin.svg",
  },
  {
    providerName: "腾讯混元",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    mainModels: ["hunyuan-turbos-latest", "hunyuan-pro"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hunyuan.svg",
  },
  {
    providerName: "Kimi（月之暗面）",
    baseUrl: "https://api.moonshot.ai/v1",
    mainModels: ["kimi-k2.6", "kimi-k2.5", "kimi-k2-thinking"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/moonshot.svg",
  },
  {
    providerName: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    mainModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek.svg",
  },
  {
    providerName: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    mainModels: ["glm-5.1", "glm-5-turbo", "glm-4.7"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zhipu.svg",
  },
  {
    providerName: "科大讯飞星火",
    baseUrl: "https://spark-api-open.xf-yun.com/v1",
    mainModels: ["Spark4.0 Ultra", "Spark Max", "Spark Pro-128K"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xinghuo.svg",
  },
  {
    providerName: "百川智能",
    baseUrl: "https://api.baichuan-ai.com/v1",
    mainModels: ["Baichuan4-Turbo", "Baichuan4-Air", "Baichuan4"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baichuan.svg",
  },
  {
    providerName: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    mainModels: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.5"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/minimax.svg",
  },
  {
    providerName: "小米 MiMo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    mainModels: ["mimo-v2.5-pro", "mimo-v2-pro", "mimo-v2-omni"],
    iconUrl: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xiaomi.svg",
  },
];

if (!window.settings) {
  (window as unknown as { settings: SettingsApi }).settings = {
    minimize: () => {},
    close: () => {},
    getConfig: () =>
      Promise.resolve({
        mode: "auto",
        provider: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        apiKey: "",
        runtimeSync: "off",
        stickerEnabled: true,
        stickerSize: "standard",
      }),
    saveConfig: (c) => Promise.resolve(c as ModelSettings),
    getGeneral: () => Promise.resolve({ musicEnabled: false, musicVolume: 60, soundEnabled: true, soundVolume: 70, petAlwaysOnTop: true, petVisible: true, launchAtLogin: false, language: "zh-CN" }),
    saveGeneral: (c) => Promise.resolve(c as GeneralSettings),
    openSidebar: () => {},
    closeSidebar: () => {},
    openTasks: () => {},
    closeTasks: () => {},
    setPetAlwaysOnTop: () => {},
    setPetVisible: () => {},
    openStickerManager: async () => ({ ok: false, error: "settings api unavailable" }),
  };
}

const minBtn = document.getElementById("min-btn") as HTMLButtonElement;
const closeBtn = document.getElementById("close-btn") as HTMLButtonElement;
const clickSound = new Audio("/audio/click.mp3");
clickSound.preload = "auto";

const bgmAudio = new Audio("/audio/bgm.mp3");
bgmAudio.preload = "auto";
bgmAudio.loop = true;
const apiForm = document.getElementById("api-form") as HTMLFormElement;
const generalForm = document.getElementById("general-form") as HTMLFormElement;
const sectionTitle = document.getElementById("section-title") as HTMLElement;
const sectionHint = document.getElementById("section-hint") as HTMLElement;
const placeholderPanel = document.getElementById("placeholder-panel") as HTMLElement;
const cyrenePanel = document.getElementById("cyrene-panel") as HTMLFormElement;
const disclaimerPanel = document.getElementById("disclaimer-panel") as HTMLElement;
const pluginsPanel = document.getElementById("plugins-panel") as HTMLElement;
const placeholderIcon = document.getElementById("placeholder-icon") as HTMLElement;
const placeholderTitle = document.getElementById("placeholder-title") as HTMLElement;
const placeholderCopy = document.getElementById("placeholder-copy") as HTMLElement;
const saveStatus = document.getElementById("save-status") as HTMLElement;
const generalSaveStatus = document.getElementById("general-save-status") as HTMLElement;
const cyreneSaveStatus = document.getElementById("cyrene-save-status") as HTMLElement;

const presetSelect = document.getElementById("preset-select") as HTMLSelectElement;
const modeSelect = document.getElementById("mode") as HTMLSelectElement;
const providerInput = document.getElementById("provider") as HTMLInputElement;
const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
const modelSelect = document.getElementById("model") as HTMLSelectElement;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const runtimeSyncSelect = document.getElementById("runtime-sync") as HTMLElement;
const runtimeSyncNote = document.getElementById("runtime-sync-note") as HTMLElement;
const stickerEnabledInput = document.getElementById("sticker-enabled") as HTMLInputElement;
const stickerSizeSelect = document.getElementById("sticker-size") as HTMLElement;
const musicEnabledInput = document.getElementById("music-enabled") as HTMLInputElement;
const musicVolumeInput = document.getElementById("music-volume") as HTMLInputElement;
const soundEnabledInput = document.getElementById("sound-enabled") as HTMLInputElement;
const soundVolumeInput = document.getElementById("sound-volume") as HTMLInputElement;
const petAlwaysOnTopInput = document.getElementById("pet-always-on-top") as HTMLInputElement;
const petVisibleInput = document.getElementById("pet-visible") as HTMLInputElement;
const launchAtLoginInput = document.getElementById("launch-at-login") as HTMLInputElement;
const languageSelect = document.getElementById("language-select") as HTMLElement;
const sidebarVisibleInput = document.getElementById("sidebar-visible") as HTMLInputElement;
const tasksVisibleInput = document.getElementById("tasks-visible") as HTMLInputElement;
const clearChatHistoryBtn = document.getElementById("clear-chat-history-btn") as HTMLButtonElement;
const openStickerManagerBtn = document.getElementById("open-sticker-manager-btn") as HTMLButtonElement;

const NAV_LABELS: Record<string, { emoji: string; title: string; hint: string }> = {
  memory: { emoji: "🧠", title: "记忆", hint: "管理长期记忆与画像" },
  gallery: { emoji: "🖼️", title: "图库", hint: "管理角色表情与素材" },
  user: { emoji: "👤", title: "用户信息", hint: "编辑你的个人资料" },
  tasks: { emoji: "⏰", title: "定时任务", hint: "管理定时提醒与日程" },
  skills: { emoji: "✨", title: "技能 Skill", hint: "管理昔涟的能力插件" },
  plugins: { emoji: "🔌", title: "插件", hint: "扩展功能与第三方集成" },
  general: { emoji: "⚙️", title: "设置", hint: "通用偏好与外观" },
  api: { emoji: "🔑", title: "API 设置", hint: "选择预设后只需要填写 API Key。" },
  cyrene: { emoji: "🌸", title: "昔涟设置", hint: "管理 Agent 行为、记忆、RAG 与权限" },
  tts: { emoji: "🎙️", title: "TTS 设置", hint: "语音合成与朗读偏好" },
  tokens: { emoji: "📊", title: "Token 用量", hint: "查看 API 调用统计与消耗" },
  disclaimer: { emoji: "📜", title: "免责声明", hint: "使用条款与隐私说明" },
};

minBtn.addEventListener("click", () => window.settings?.minimize());
closeBtn.addEventListener("click", () => window.settings?.close());

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest("button, input, select, .switch, .option-block, .language-option, .nav-item")) {
    playSettingsClickSound();
  }
}, true);

function setSaveStatus(text: string, cls?: string): void {
  saveStatus.textContent = text;
  saveStatus.className = "save-status";
  if (cls) saveStatus.classList.add(cls);
}

function setCyreneSaveStatus(text: string, cls?: string): void {
  cyreneSaveStatus.textContent = text;
  cyreneSaveStatus.className = "save-status";
  if (cls) cyreneSaveStatus.classList.add(cls);
}

function playSettingsClickSound(): void {
  if (!soundEnabledInput.checked) return;
  clickSound.pause();
  clickSound.currentTime = 0;
  clickSound.volume = Math.max(0, Math.min(1, Number(soundVolumeInput.value) / 100));
  void clickSound.play().catch(() => {});
}

function syncMusicPlayback(): void {
  bgmAudio.volume = Math.max(0, Math.min(1, Number(musicVolumeInput.value) / 100));
  if (musicEnabledInput.checked) {
    void bgmAudio.play().catch(() => {});
  } else {
    bgmAudio.pause();
  }
}

function getRuntimeSyncValue(): "off" | "local" | "llm" {
  const v = runtimeSyncSelect.querySelector<HTMLButtonElement>(".option-block.is-active")?.dataset.value; return v === "llm" ? "llm" : v === "local" ? "local" : "off";
}

function applyRuntimeSyncSelection(value: "off" | "local" | "llm"): void {
  runtimeSyncSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  syncRuntimeNote();
}

function syncRuntimeNote(): void {
  runtimeSyncNote.classList.toggle("is-hidden", getRuntimeSyncValue() !== "llm");
}

function getStickerSizeValue(): "small" | "standard" | "large" {
  const value = stickerSizeSelect.querySelector<HTMLButtonElement>(".option-block.is-active")?.dataset.value;
  return value === "small" || value === "large" ? value : "standard";
}

function applyStickerSizeSelection(value: "small" | "standard" | "large"): void {
  stickerSizeSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyLanguageSelection(language: "zh-CN"): void {
  languageSelect.querySelectorAll<HTMLButtonElement>(".language-option").forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setGeneralSaveStatus(text: string, cls?: string): void {
  generalSaveStatus.textContent = text;
  generalSaveStatus.className = "save-status";
  if (cls) generalSaveStatus.classList.add(cls);
}

function fillPresetOptions(): void {
  presetSelect.replaceChildren();
  for (const preset of MODEL_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.providerName;
    option.textContent = preset.providerName;
    presetSelect.appendChild(option);
  }
}

function findPreset(providerName: string): ModelPreset {
  return MODEL_PRESETS.find((preset) => preset.providerName === providerName) ?? MODEL_PRESETS[5];
}

function fillModelOptions(preset: ModelPreset, preferredModel?: string): void {
  modelSelect.replaceChildren();
  for (const model of preset.mainModels) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  }
  modelSelect.value = preset.mainModels.includes(preferredModel ?? "")
    ? preferredModel!
    : preset.mainModels[0];
}

function applyPreset(providerName: string, preferredModel?: string): void {
  const preset = findPreset(providerName);
  presetSelect.value = preset.providerName;
  providerInput.value = preset.providerName;
  baseUrlInput.value = preset.baseUrl;
  fillModelOptions(preset, preferredModel);
}

async function loadConfig(): Promise<void> {
  try {
    fillPresetOptions();
    const cfg = await window.settings!.getConfig();
    modeSelect.value = cfg.mode;
    applyPreset(cfg.provider, cfg.model);
    apiKeyInput.value = cfg.apiKey;
    applyRuntimeSyncSelection(cfg.runtimeSync);
    stickerEnabledInput.checked = cfg.stickerEnabled !== false;
    applyStickerSizeSelection(cfg.stickerSize);
    setSaveStatus("等待保存");
    setCyreneSaveStatus("等待保存");
  } catch {
    fillPresetOptions();
    applyPreset("DeepSeek");
    setSaveStatus("读取配置失败", "is-error");
    setCyreneSaveStatus("读取配置失败", "is-error");
  }
}

async function loadGeneralSettings(): Promise<void> {
  try {
    const cfg = await window.settings!.getGeneral();
    musicEnabledInput.checked = cfg.musicEnabled;
    musicVolumeInput.value = String(cfg.musicVolume);
    syncMusicPlayback();
    soundEnabledInput.checked = cfg.soundEnabled;
    soundVolumeInput.value = String(cfg.soundVolume);
    petAlwaysOnTopInput.checked = cfg.petAlwaysOnTop;
    petVisibleInput.checked = cfg.petVisible;
    launchAtLoginInput.checked = cfg.launchAtLogin;
    applyLanguageSelection("zh-CN");
    setGeneralSaveStatus("等待保存");
  } catch {
    setGeneralSaveStatus("读取设置失败", "is-error");
  }
}

runtimeSyncSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.value as "off" | "local" | "llm";
    applyRuntimeSyncSelection(value);
    window.settings?.previewRuntimeSync(value);
    setCyreneSaveStatus("有未保存的更改");
  });
});

stickerEnabledInput.addEventListener("change", () => {
  setCyreneSaveStatus("有未保存的更改");
});

stickerSizeSelect.querySelectorAll<HTMLButtonElement>(".option-block").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.value;
    applyStickerSizeSelection(value === "small" || value === "large" ? value : "standard");
    setCyreneSaveStatus("有未保存的更改");
  });
});

sidebarVisibleInput.addEventListener("change", () => {
  if (sidebarVisibleInput.checked) window.settings?.openSidebar();
  else window.settings?.closeSidebar();
});

tasksVisibleInput.addEventListener("change", () => {
  if (tasksVisibleInput.checked) window.settings?.openTasks();
  else window.settings?.closeTasks();
});

musicEnabledInput.addEventListener("change", () => {
  syncMusicPlayback();
  setGeneralSaveStatus("有未保存的更改");
});

musicVolumeInput.addEventListener("input", () => {
  syncMusicPlayback();
  setGeneralSaveStatus("有未保存的更改");
});

soundEnabledInput.addEventListener("change", () => setGeneralSaveStatus("有未保存的更改"));
soundVolumeInput.addEventListener("input", () => setGeneralSaveStatus("有未保存的更改"));

petAlwaysOnTopInput.addEventListener("change", () => window.settings?.setPetAlwaysOnTop(petAlwaysOnTopInput.checked));
petVisibleInput.addEventListener("change", () => window.settings?.setPetVisible(petVisibleInput.checked));

openStickerManagerBtn.addEventListener("click", async () => {
  console.log("[settings] open sticker manager clicked");
  try {
    const result = await window.settings?.openStickerManager();
    if (!result?.ok) {
      console.error("[settings] open sticker manager failed", result?.error);
      window.alert("表情包管理窗口打开失败，请查看终端日志。" + (result?.error ? `\n${result.error}` : ""));
    }
  } catch (error) {
    console.error("[settings] open sticker manager error", error);
    window.alert("表情包管理窗口打开失败，请查看终端日志。");
  }
});

clearChatHistoryBtn.addEventListener("click", () => {
  if (!window.confirm("清空当前聊天记录？")) return;
  localStorage.removeItem("cyrene.chat.history.v1");
  setGeneralSaveStatus("聊天记录已清空", "is-ok");
});

presetSelect.addEventListener("change", () => {
  applyPreset(presetSelect.value);
  setSaveStatus("已应用预设，填写 API Key 后保存");
});

generalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setGeneralSaveStatus("保存中…");
  try {
    await window.settings!.saveGeneral({
      musicEnabled: musicEnabledInput.checked,
      musicVolume: Number(musicVolumeInput.value),
      soundEnabled: soundEnabledInput.checked,
      soundVolume: Number(soundVolumeInput.value),
      petAlwaysOnTop: petAlwaysOnTopInput.checked,
      petVisible: petVisibleInput.checked,
      launchAtLogin: launchAtLoginInput.checked,
      language: "zh-CN",
    });
    setGeneralSaveStatus("已保存", "is-ok");
  } catch {
    setGeneralSaveStatus("保存失败", "is-error");
  }
});

cyrenePanel.addEventListener("submit", async (e) => {
  e.preventDefault();
  setCyreneSaveStatus("保存中…");
  try {
    await window.settings!.saveConfig({ runtimeSync: getRuntimeSyncValue(), stickerEnabled: stickerEnabledInput.checked, stickerSize: getStickerSizeValue() });
    setCyreneSaveStatus("已保存", "is-ok");
  } catch {
    setCyreneSaveStatus("保存失败", "is-error");
  }
});

apiForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setSaveStatus("保存中…");
  try {
    await window.settings!.saveConfig({
      mode: modeSelect.value as "auto" | "manual",
      provider: providerInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      model: modelSelect.value.trim(),
      apiKey: apiKeyInput.value.trim(),
    });
    setSaveStatus("已保存", "is-ok");
  } catch {
    setSaveStatus("保存失败", "is-error");
  }
});

function switchSection(section: string): void {
  const label = NAV_LABELS[section] ?? NAV_LABELS.api;
  sectionTitle.textContent = label.title;
  sectionHint.textContent = label.hint;

  const isApi = section === "api";
  const isGeneral = section === "general";
  const isCyrene = section === "cyrene";
  const isDisclaimer = section === "disclaimer";
  const isMemory = section === "memory";
  const isUser = section === "user";
  const isIdentity = section === "identity";
  const isPlugins = section === "plugins";
  apiForm.classList.toggle("is-hidden", !isApi);
  generalForm.classList.toggle("is-hidden", !isGeneral);
  cyrenePanel.classList.toggle("is-hidden", !isCyrene);
  disclaimerPanel.classList.toggle("is-hidden", !isDisclaimer);
  const memoryPanel = document.getElementById("memory-panel");
  if (memoryPanel) memoryPanel.classList.toggle("is-hidden", !isMemory);
  const userPanel = document.getElementById("user-panel");
  if (userPanel) userPanel.classList.toggle("is-hidden", !isUser);
  const identityPanel = document.getElementById("identity-panel");
  if (identityPanel) identityPanel.classList.toggle("is-hidden", !isIdentity);
  pluginsPanel.classList.toggle("is-hidden", !isPlugins);
  placeholderPanel.classList.toggle("is-hidden", isApi || isGeneral || isCyrene || isDisclaimer || isMemory || isUser || isIdentity || isPlugins);

  if (!isApi && !isGeneral && !isCyrene && !isDisclaimer && !isMemory && !isUser && !isIdentity && !isPlugins) {
    placeholderIcon.textContent = label.emoji;
    placeholderTitle.textContent = label.title;
    placeholderCopy.textContent = "这个模块先占位，等核心聊天与 API 接通后再继续扩展。";
  }

  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("is-active", (el as HTMLElement).dataset.section === section);
  });
}

document.querySelectorAll(".nav-item").forEach((el) => {
  el.addEventListener("click", () => {
    const section = (el as HTMLElement).dataset.section;
    if (section) switchSection(section);
  });
});

void loadConfig();
switchSection("general");
/* ===== RAG model card toggle (embedding only) ===== */
(function () {
  const cards = document.querySelectorAll<HTMLButtonElement>(".rag-model-card:not([data-reranker])");
  const KEY = "cyrene.rag.model";
  const saved = localStorage.getItem(KEY) || "minilm";
  cards.forEach((card) => {
    const value = card.dataset.value;
    if (!value) return;
    card.classList.toggle("is-active", value === saved);
    card.addEventListener("click", async () => {
      const previousActive = document.querySelector(".rag-model-card.is-active:not([data-reranker])") as HTMLElement | null;
      const previousValue = previousActive?.dataset.value;

      // Optimistic UI update
      cards.forEach((c) => c.classList.remove("is-active"));
      card.classList.add("is-active");
      localStorage.setItem(KEY, value);

      // Call IPC to hot-switch the embedding model
      try {
        const result = await (window as any).settings?.embeddingSetModel?.(value);
        if (result?.ok) {
          console.log("[settings] embedding switched to", value, "cleared:", result.clearedEntries);
          if (result.clearedEntries && result.clearedEntries > 0) {
            window.alert("已切换至 " + (value === "bgem3" ? "BGE-M3" : "MiniLM") + "。由于向量维度不同，已清除 " + result.clearedEntries + " 条旧向量记忆。");
          }
        } else {
          // Rollback on failure
          cards.forEach((c) => c.classList.remove("is-active"));
          if (previousValue) {
            const prevCard = document.querySelector('.rag-model-card[data-value="' + previousValue + '"]:not([data-reranker])');
            prevCard?.classList.add("is-active");
            localStorage.setItem(KEY, previousValue);
          }
          window.alert("切换失败：" + (result?.error || "未知错误"));
        }
      } catch (err) {
        // Rollback on error
        cards.forEach((c) => c.classList.remove("is-active"));
        if (previousValue) {
          const prevCard = document.querySelector('.rag-model-card[data-value="' + previousValue + '"]:not([data-reranker])');
          prevCard?.classList.add("is-active");
          localStorage.setItem(KEY, previousValue);
        }
        console.error("[settings] embedding switch error:", err);
      }
    });
  });
})();
/* ===== Reranker mode toggle ===== */
(function () {
  const cards = document.querySelectorAll<HTMLButtonElement>(".rag-model-card[data-reranker]");
  const KEY = "cyrene.reranker.mode";
  const saved = localStorage.getItem(KEY) || "light";
  cards.forEach((card) => {
    const value = card.dataset.value;
    if (!value) return;
    card.classList.toggle("is-active", value === saved);
    card.addEventListener("click", async () => {
      const previousActive = document.querySelector(".rag-model-card.is-active[data-reranker]") as HTMLElement | null;
      const previousValue = previousActive?.dataset.value;

      cards.forEach((c) => c.classList.remove("is-active"));
      card.classList.add("is-active");
      localStorage.setItem(KEY, value);
      try {
        await (window as any).settings?.rerankerSetMode?.(value);
      } catch (err) {
        // Rollback on failure
        cards.forEach((c) => c.classList.remove("is-active"));
        if (previousValue) {
          const prevCard = document.querySelector('.rag-model-card[data-value="' + previousValue + '"][data-reranker]');
          prevCard?.classList.add("is-active");
          localStorage.setItem(KEY, previousValue);
        }
        console.warn("[Reranker] set mode failed:", err);
      }
    });
  });
})();

/* ===== Embedding download / delete ===== */
(function () {
  const downloadBtn = document.getElementById("embedding-download-btn") as HTMLButtonElement | null;
  const deleteBtn = document.getElementById("embedding-delete-btn") as HTMLButtonElement | null;
  const mirrorGroup = document.getElementById("embedding-mirror") as HTMLElement | null;

  function getSelectedMirror(): string {
    const active = mirrorGroup?.querySelector(".option-block.is-active") as HTMLElement | null;
    return active?.dataset.value || "official";
  }

  function getSelectedModel(): string {
    const active = document.querySelector(".rag-model-card.is-active:not([data-reranker])") as HTMLElement | null;
    return active?.dataset.value || "minilm";
  }

  downloadBtn?.addEventListener("click", async () => {
    const model = getSelectedModel();
    const mirror = getSelectedMirror();
    downloadBtn.disabled = true;
    downloadBtn.textContent = "\u4E0B\u8F7D\u4E2D\u2026";
    try {
      const result = await window.settings?.downloadEmbeddingModel?.(model, mirror);
      if (result?.ok) {
        downloadBtn.textContent = "\u2705 \u5B8C\u6210";
        setTimeout(() => location.reload(), 800);
      } else {
        downloadBtn.textContent = "\u274C \u5931\u8D25";
        downloadBtn.disabled = false;
        window.alert("\u4E0B\u8F7D\u5931\u8D25\uFF1A" + (result?.error || "\u672A\u77E5\u9519\u8BEF"));
      }
    } catch (err) {
      downloadBtn.textContent = "\u274C \u5931\u8D25";
      downloadBtn.disabled = false;
    }
  });


  // Inline modal helper
  function _showModal(opts: { title: string; message: string; icon?: string; confirmText?: string; cancelText?: string }): Promise<boolean> {
    var ov = document.getElementById("cy-modal-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "cy-modal-overlay";
      ov.className = "cy-modal-overlay is-hidden";
      ov.innerHTML = '<div class="cy-modal" role="alertdialog" aria-modal="true"><div class="cy-modal__head"><span class="cy-modal__icon" id="cy-modal-icon">📌</span><h3 class="cy-modal__title" id="cy-modal-title">提示</h3></div><hr class="cy-modal__divider"><p class="cy-modal__body" id="cy-modal-message">确认执行此操作吗？</p><div class="cy-modal__actions"><button type="button" class="ghost-btn" id="cy-modal-cancel">取消</button><button type="button" class="btn-primary" id="cy-modal-confirm">确定</button></div></div>';
      document.body.appendChild(ov);
    }
    var iconEl = ov.querySelector("#cy-modal-icon") as HTMLElement;
    var titleEl = ov.querySelector("#cy-modal-title") as HTMLElement;
    var msgEl = ov.querySelector("#cy-modal-message") as HTMLElement;
    var cancelBtn = ov.querySelector("#cy-modal-cancel") as HTMLButtonElement;
    var confirmBtn = ov.querySelector("#cy-modal-confirm") as HTMLButtonElement;
    iconEl.textContent = opts.icon || "📌";
    titleEl.textContent = opts.title;
    msgEl.textContent = opts.message;
    cancelBtn.textContent = opts.cancelText || "取消";
    confirmBtn.textContent = opts.confirmText || "确定";
    ov.classList.remove("is-hidden");
    return new Promise(function (resolve) {
      var cleanup = function (result: boolean) {
        ov?.classList.add("is-hidden");
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        resolve(result);
      };
      var onCancel = function () { cleanup(false); };
      var onConfirm = function () { cleanup(true); };
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);
    });
  }
  deleteBtn?.addEventListener("click", async () => {
    const model = getSelectedModel();
    const name = model === "minilm" ? "MiniLM" : "BGE-M3";
    var confirmed = await _showModal({ title: "删 除 模 型", message: "确 定 删 除 " + name + " 模 型 缓 存？下 次 使 用 需 重 新 下 载。", icon: "⚠️", confirmText: "删 除", cancelText: "取 消" });
    if (!confirmed) return;
    deleteBtn.disabled = true;
    deleteBtn.textContent = "\u5220\u9664\u4E2D\u2026";
    try {
      const result = await window.settings?.deleteEmbeddingModel?.(model);
      if (result?.ok) {
        deleteBtn.textContent = "\u2705 \u5DF2\u5220\u9664";
        setTimeout(() => location.reload(), 800);
      } else {
        deleteBtn.textContent = "\u274C \u5931\u8D25";
        deleteBtn.disabled = false;
      }
    } catch (err) {
      deleteBtn.textContent = "\u274C \u5931\u8D25";
      deleteBtn.disabled = false;
    }
  });

  // Mirror source toggle
  mirrorGroup?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-value]") as HTMLElement | null;
    if (!btn) return;
    const value = btn.dataset.value;
    if (!value) return;
    mirrorGroup.querySelectorAll(".option-block").forEach((b) => {
      const v = b.getAttribute("data-value");
      b.classList.toggle("is-active", v === value);
      b.setAttribute("aria-pressed", v === value ? "true" : "false");
    });
    localStorage.setItem("cyrene.rag.mirror", value);
  });

  // Restore saved mirror on load
  const savedMirror = localStorage.getItem("cyrene.rag.mirror") || "official";
  mirrorGroup?.querySelectorAll(".option-block").forEach((b) => {
    const v = b.getAttribute("data-value");
    b.classList.toggle("is-active", v === savedMirror);
    b.setAttribute("aria-pressed", v === savedMirror ? "true" : "false");
  });
})();
(function () {
  const updateBtn = document.getElementById("embedding-update-btn") as HTMLButtonElement | null;
  updateBtn?.addEventListener("click", () => {
    updateBtn.textContent = "已是最新版本";
    updateBtn.disabled = true;
    setTimeout(() => {
      updateBtn.textContent = "检查更新";
      updateBtn.disabled = false;
    }, 2000);
  });
})();
// ── 用户信息面板 ──
const avatarEl = document.querySelector(".user-avatar") as HTMLElement | null;
const avatarImg = avatarEl?.querySelector("img") as HTMLImageElement | null;
const avatarPlaceholder = avatarEl?.querySelector("span") as HTMLElement | null;
const uploadAvatarBtn = document.getElementById("upload-avatar-btn") as HTMLButtonElement | null;
const nicknameInput = document.getElementById("user-nickname") as HTMLInputElement | null;
const callPrefInput = document.getElementById("user-call-pref") as HTMLInputElement | null;
const birthdayInput = document.getElementById("user-birthday") as HTMLInputElement | null;
const timezoneInput = document.getElementById("user-timezone") as HTMLInputElement | null;
const userSaveBtn = document.getElementById("user-save-btn") as HTMLButtonElement | null;
const memoryL0NameInput = document.getElementById("memory-l0-name") as HTMLInputElement | null;
const memoryL0OccupationInput = document.getElementById("memory-l0-occupation") as HTMLInputElement | null;
const memoryL0InterestsInput = document.getElementById("memory-l0-interests") as HTMLInputElement | null;
const memoryL0LanguageInput = document.getElementById("memory-l0-language") as HTMLInputElement | null;
const memoryL0NoteInput = document.getElementById("memory-l0-note") as HTMLTextAreaElement | null;
const memoryL1GoalsInput = document.getElementById("memory-l1-goals") as HTMLTextAreaElement | null;
const memoryL1PreferencesInput = document.getElementById("memory-l1-preferences") as HTMLTextAreaElement | null;
const memoryL1ProjectInput = document.getElementById("memory-l1-project") as HTMLTextAreaElement | null;
const memoryL2SearchInput = document.getElementById("memory-l2-search") as HTMLInputElement | null;
const memoryL2List = document.getElementById("memory-l2-list") as HTMLElement | null;
const memoryImportedList = document.getElementById("memory-imported-list") as HTMLElement | null;
const memoryReflectionList = document.getElementById("memory-reflection-list") as HTMLElement | null;

let memoryPanelCache: MemoryPanelPayload | null = null;

function showAvatar(dataUrl: string | null): void {
  if (!dataUrl || !avatarEl) return;
  if (!avatarEl) return;
  let img = avatarEl.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    avatarEl.appendChild(img);
  }
  img.src = dataUrl;
  if (avatarPlaceholder) avatarPlaceholder.style.display = "none";
}

function formatDateTime(timestamp: number): string {
  if (!timestamp) return "暂无时间";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmptyState(container: HTMLElement | null, title: string, hint: string): void {
  if (!container) return;
  container.innerHTML = [
    '<div class="memory-list__empty">',
    '  <span>📭</span>',
    `  <p>${escapeHtml(title)}</p>`,
    `  <p class="memory-list__hint">${escapeHtml(hint)}</p>`,
    '</div>',
  ].join("\n");
}

function renderInfoList(
  container: HTMLElement | null,
  items: Array<{ title: string; body: string; meta?: string }>,
  emptyTitle: string,
  emptyHint: string,
): void {
  if (!container) return;
  if (items.length === 0) {
    renderEmptyState(container, emptyTitle, emptyHint);
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const meta = item.meta ? `<p class="memory-record__meta">${escapeHtml(item.meta)}</p>` : "";
      return [
        '<article class="memory-record">',
        `  <h3 class="memory-record__title">${escapeHtml(item.title)}</h3>`,
        `  <p class="memory-record__body">${escapeHtml(item.body)}</p>`,
        `  ${meta}`,
        '</article>',
      ].join("\n");
    })
    .join("\n");
}

function renderL2List(query = ""): void {
  const list = memoryPanelCache?.l2 ?? [];
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? list.filter((item) => {
        const haystack = [item.content, item.triggerText, item.status].join(" ").toLowerCase();
        return haystack.includes(normalized);
      })
    : list;

  renderInfoList(
    memoryL2List,
    filtered.map((item) => ({
      title: item.content,
      body: item.triggerText ? `触发片段：${item.triggerText}` : "无触发片段",
      meta: `状态：${item.status} · 权重：${item.weight.toFixed(1)} · 创建于：${formatDateTime(item.createdAt)}`,
    })),
    normalized ? "没有匹配的事件记忆" : "暂无事件记忆",
    normalized ? "换个关键词试试" : "聊天后昔涟会自动提炼重要信息",
  );
}

async function loadMemoryPanel(): Promise<void> {
  try {
    const payload = await window.memoryPanel?.getData();
    if (!payload) return;
    memoryPanelCache = payload;

    if (memoryL0NameInput) memoryL0NameInput.value = payload.l0.preferredName || "";
    if (memoryL0OccupationInput) memoryL0OccupationInput.value = payload.l0.occupation || "";
    if (memoryL0InterestsInput) memoryL0InterestsInput.value = payload.l0.longTermInterests || "";
    if (memoryL0LanguageInput) memoryL0LanguageInput.value = payload.l0.language || "";
    if (memoryL0NoteInput) memoryL0NoteInput.value = payload.l0.permanentNote || "";

    if (memoryL1GoalsInput) memoryL1GoalsInput.value = payload.l1.recentGoals || "";
    if (memoryL1PreferencesInput) memoryL1PreferencesInput.value = payload.l1.recentPreferences || "";
    if (memoryL1ProjectInput) memoryL1ProjectInput.value = payload.l1.currentProject || "";

    renderL2List(memoryL2SearchInput?.value || "");

        renderImportedDocs();;

    renderInfoList(
      memoryReflectionList,
      payload.reflections,
      "暂无阶段总结",
      "当前项目里 Reflection 还没真正生成落地",
    );
  } catch (err) {
    console.error("[settings] load memory panel failed", err);
    renderEmptyState(memoryL2List, "记忆读取失败", "请查看终端日志");
    renderEmptyState(memoryImportedList, "导入知识读取失败", "请查看终端日志");
    renderEmptyState(memoryReflectionList, "阶段总结读取失败", "请查看终端日志");
  }
}

async function loadUserProfile(): Promise<void> {
  try {
    const profile = await window.user?.getProfile();
    if (!profile) return;
    if (nicknameInput) nicknameInput.value = profile.nickname || "";
    if (callPrefInput) callPrefInput.value = profile.callPreference || "";
    if (birthdayInput) birthdayInput.value = profile.birthday || "";
    if (timezoneInput) timezoneInput.value = profile.timezone || "Asia/Shanghai";
    const avatarDataUrl = await window.user?.getAvatar();
    if (avatarDataUrl) showAvatar(avatarDataUrl);
    if (nicknameInput) nicknameInput.disabled = false;
    if (callPrefInput) callPrefInput.disabled = false;
    if (birthdayInput) birthdayInput.disabled = false;
    if (timezoneInput) timezoneInput.disabled = false;
    if (uploadAvatarBtn) uploadAvatarBtn.disabled = false;
    if (userSaveBtn) userSaveBtn.disabled = false;
  } catch {
    console.warn("[settings] load user profile failed");
  }
}

if (uploadAvatarBtn) {
  uploadAvatarBtn.addEventListener("click", async () => {
    try {
      const result = await window.user?.uploadAvatar();
      if (result?.avatarPath) {
        const avatarDataUrl = await window.user?.getAvatar();
        if (avatarDataUrl) showAvatar(avatarDataUrl);
      }
    } catch (err) {
      console.error("[settings] upload avatar failed", err);
    }
  });
}

if (userSaveBtn) {
  userSaveBtn.addEventListener("click", async () => {
    try {
      await window.user?.saveProfile({
        nickname: nicknameInput?.value || "",
        callPreference: callPrefInput?.value || "",
        birthday: birthdayInput?.value || "",
        timezone: timezoneInput?.value || "Asia/Shanghai",
      });
      alert("保存成功");
    } catch (err) {
      console.error("[settings] save profile failed", err);
      alert("保存失败");
    }
  });
}

memoryL2SearchInput?.addEventListener("input", () => {
  renderL2List(memoryL2SearchInput.value);
});

void loadMemoryPanel();

function renderImportedDocs(): void {
  const list = memoryPanelCache?.importedDocs ?? [];
  if (!memoryImportedList) return;

  if (list.length === 0) {
    renderEmptyState(memoryImportedList, "暂无导入文档", "在聊天窗口上传文件后会自动索引");
    return;
  }

  memoryImportedList.innerHTML = list
    .map((item) => {
      const importId = item.importId || "";
      const fileName = escapeHtml(item.fileName);
      const chunkInfo = "已索引 " + item.chunkCount + " 个片段";
      const timeInfo = "最近导入：" + formatDateTime(item.lastImportedAt);
      return [
        '<article class="memory-record memory-record--doc">',
        '  <div class="memory-record__main">',
        '    <h3 class="memory-record__title">' + fileName + '</h3>',
        '    <p class="memory-record__body">' + escapeHtml(chunkInfo) + '</p>',
        '    <p class="memory-record__meta">' + escapeHtml(timeInfo) + '</p>',
        '  </div>',
        '  <button type="button" class="memory-record__delete" data-import-id="' + escapeHtml(importId) + '" data-file-name="' + fileName + '" title="删除此导入文档">🗑️</button>',
        '</article>',
      ].join("\n");
    })
    .join("\n");
}

memoryImportedList?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement | null;
  const deleteBtn = target?.closest(".memory-record__delete") as HTMLElement | null;
  if (!deleteBtn) return;

  const importId = deleteBtn.dataset.importId || "";
  const fileName = deleteBtn.dataset.fileName || "未命名文档";

  const confirmed = await showModal({
    title: "删除导入知识",
    message: "确定删除导入知识？\n\n文件：\n《" + fileName + "》\n\n删除后不可恢复，如需使用请重新导入。",
    icon: "⚠️",
    confirmText: "删除",
    cancelText: "取消",
  });

  if (!confirmed) return;

  try {
    const result = await window.memoryPanel?.deleteImportedDoc(importId, fileName);
    if (result?.ok) {
      await loadMemoryPanel();
    }
  } catch (err) {
    console.error("[settings] delete imported doc failed", err);
  }
});


void loadUserProfile();
