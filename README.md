<div align="center">

<img src="./preview.png" alt="Cyrene Agent" width="800">

# Cyrene-Agent

[English](./README.en.md) | **中文**

</div>

**Cyrene-Agent 是一个 Windows 桌面 Live2D AI 伴侣，支持聊天、记忆、语音、工具调用和多平台接入。**

> 基于 Electron + TypeScript 开发的桌面端 Live2D 智能对话 Agent，
> 搭载《崩坏：星穹铁道》昔涟（Cyrene）人设，支持日常聊天、情感交互
> 与个性化记忆引擎。

---

## ⚠️ 免责声明

本项目为**非官方粉丝同人作品**，与 HoYoverse / 米哈游**无任何关联、
背书或赞助关系**。

《崩坏：星穹铁道》、"昔涟"角色及其相关美术、世界观、商标等知识产权
归 **HoYoverse / 米哈游**所有。

**关于授权范围的说明**：

- **源代码**采用 [MIT License](./LICENSE)，仅约束本仓库的源代码。
- **角色 IP、Live2D 模型、美术资产** 不属于 MIT 授权范围，分别遵循
  [MODEL_LICENSE.md](./MODEL_LICENSE.md) 与米哈游同人创作规范处理。
- 因底层角色 IP 涉及米哈游同人创作规范，**本项目及其衍生物严禁任何
  商业用途**（售卖、付费社群、含广告变现、打包销售等）。

---

## 📊 当前状态

| 模块 | 状态 |
| --- | --- |
| 🪟 桌宠 / 多窗口 / 表情互动 | ✅ 可用 |
| 💬 日常聊天 / 语音通话 / 多会话历史 / 贴纸 | ✅ 可用 |
| 🧠 记忆系统（L0/L1/L2 + 自研 DMAE Worldbook 引擎） | ✅ 可用 |
| 🔊 TTS / ASR / 文档生成 / 联网搜索 / 文件操作 | ✅ 可用 |
| 💼 飞书 Lark 长连接 | 🧪 实验性 |
| 💬 微信 iLink Bot | 🧪 实验性 |
| 🤖 Game Bot 游戏自动化 | 🧪 实验性 |
| 🔌 MCP（Model Context Protocol）生态 | 🧪 实验性 |
| ✨ Skill 系统 | 🧪 实验性 |
| 📚 RAG 文档知识库（含混合检索 / reranker） | 🧪 实验性 |

> ✅ 可用：日常使用体验稳定；🧪 实验性：功能已实现但边角 / 兼容性 / 用户体验仍在打磨。

---

## 🚀 快速开始

### 前置条件
- Node.js 18+
- npm 9+
- Windows 10/11（飞书 / 微信 / nut-js 键鼠自动化依赖 Win32 API）
- macOS / Linux 理论上可运行，但桌面集成仅在 Windows 上完整测试过

### 1. 克隆仓库

```bash
git clone https://github.com/Playa-0v0/Cyrene-Agent.git
cd Cyrene-Agent
```

### 2. 安装依赖

```bash
npm install
```

首次安装会下载 Electron 二进制（约 100 MB）与 Pixi.js / Live2D 等渲染依赖，
耗时 3–10 分钟，取决于网络。

### 3. 构建并启动

```bash
npm install
npm run build
npm start
```

或者直接开发模式：

```bash
npm run dev
```

同时运行 `tsc`（主进程 / preload）+ `vite` + Electron，主进程改动自动
重启 Electron，渲染层改动 Vite HMR 热更新。

---

## 🔑 配置 API Key

应用启动后，**点系统托盘图标 → 打开设置**，完成以下基础配置：

1. **🔑 API 设置**：选 LLM 厂商 preset（OpenAI / Anthropic / MiniMax / ...），
   填写 API Key（**必填**，Agent 才能工作）。
2. **🎙️ TTS 设置**：选语音合成引擎（默认 MiniMax，或 GPT-SoVITS /
   自定义云端 / MiMo）。
3. **🎧 ASR 设置**：如需语音通话，填阿里云实时 ASR 的 AppKey / AccessKey。
4. **📱 连接手机**（可选）：要接入飞书 / 微信 iLink 时配置。

配置保存在 `<userData>/settings.json`，无需重启应用。

---

## ❓ 常见问题

<!-- TODO: 你之后在这里填入你想回答的常见问题 -->

占位符：你准备的 FAQ 内容替换这里。建议覆盖：
- 首次启动打不开 / 黑屏 / 没桌宠怎么办？
- Live2D 模型怎么换 / 怎么放？
- 不用 ASR 能用语音通话吗？
- macOS / Linux 能不能跑？
- API Key 安全吗？
- 出现 OOM / 内存泄漏怎么办？

---

## ✨ 功能

### 核心功能

#### 🪟 桌面伴侣
- **Live2D 桌宠** — 基于 `pixi-live2d-display` + Cubism 引擎的置顶桌宠，
  表情切换、嘴型同步、点击交互、自然待机动画。
- **多窗口架构** — 7 个独立 BrowserWindow：聊天、侧栏、任务、设置、
  贴纸管理、通话、桌宠本体。
- **AG-UI 表情广播** — Agent 调 `play_live2d_action` 工具把「表情 +
  动作 + 气泡」推到桌宠，随对话情绪同步表演。

#### 💬 对话
- **日常聊天 + 语音通话** — 桌面 / 手机 / 通话三种人格风格切换，
  状态机 `IDLE → LISTENING → THINKING → SPEAKING → ENDED`，
  24 轮滑动窗口上下文。
- **多会话历史** — 每会话独立 JSON 持久化，自动派生标题、`updatedAt`
  排序、双击重命名。
- **AG-UI 事件流** — 标准化事件（RUN_STARTED / TEXT_MESSAGE / TOOL_CALL /
  RUN_FINISHED），逐字 delta 流式渲染。
- **拖拽文件摄入** — 拖入 PDF/MD/DOCX/XLSX... 直接进 RAG 知识库。
- **贴纸面板** — 内置贴纸选择器，AI 按相似度自动匹配最合适的贴纸。

#### 🧠 记忆系统
- **L0 核心画像 / L1 近期状态 / L2 长期记忆** — 完整证据链，
  权重自动衰减（60/30/10 阈值 active/aging/archived）。
- **冲突检测与解决** — 词法候选 → RAG 召回 → 评分 → resolver，
  解决类型覆盖无关/语境差异/偏好演变/直接冲突。
- **🧬 自研 DMAE Worldbook 引擎** — 词条格式（触发词/常驻/优先级/
  内在价值/连带触发词），`Ru = Bu × (1 + γ·ln(1+U_old))` 激活公式，
  Active / Dormant / Archived 三态状态机，One-Shot 连带触发。

#### 🔊 语音
- **多 TTS 引擎** — MiniMax / GPT-SoVITS / 自定义云端 / MiMo / off。
- **多 ASR 引擎** — 阿里云实时语音识别，token 自动获取 + JSON 协议 +
  纯 PCM。
- **VAD 静默检测** — 通话期间检测用户停顿自动触发回复。

#### 🛠 工具调用
- **文档生成** — Excel (`exceljs`)、Word (`docx`)、PDF (`pdfkit`)、
  Markdown。
- **联网搜索 / 网页抓取** — `web_search` + `fetch_url`（turndown 转 Markdown）。
- **文件操作** — `read_file` / `list_dir` / `write_file` / `read_image`。
- **生活小工具** — 记账、汇率、翻译、行程规划、unified diff 应用。
- **任务委派** — `delegate_task`（sub-agent）、`todo_write`（任务清单）、
  `ask_user_choice`（用户选择卡片）。

<details>
<summary><b>🧩 高级功能</b>（点击展开）</summary>

#### 📚 RAG 文档知识库
- 支持 txt/md/pdf/docx/xlsx/pptx/csv/json 多格式导入，`source: imported_doc` 可追溯。
- 混合检索：向量 + BM25 + reranker（light / standard / none 三档）。
- 双 embedding 后端：本地 `@xenova/transformers` + 云端 OpenAI 兼容。
- 实体关系图谱，jieba 词典注入防止"昔涟/小鹿"等被错误切分。

#### 🔌 MCP（Model Context Protocol）
- 支持 stdio / SSE / HTTP 三种 transport。
- 内置 servers 自动同步，`install_mcp_server` 工具让 Agent 自动装新 server。
- 自带 Playwright + Firecrawl hosted MCP 配置。

#### 💬 外部渠道
- **飞书 Lark 长连接** — 官方 SDK + WebSocket（无需公网 / 域名 / 内网穿透），
  p2p 私聊，多模态 text / image / audio / video / file / sticker。
- **微信 iLink Bot** — `@tencent-weixin/openclaw-weixin` + CLI，扫码登录 →
  long-poll 35s 拉取 → 自动 sendText。

#### 🤖 Game Bot 游戏自动化
- `engine.ts` 步骤解释器：`launch / wait / key / click / vlm_click /
  vlm_select / vlm_check / branch` 等指令。
- 配合 GameRecipe 格式描述自动化流程，VLM 视觉定位 + nut-js 键鼠输入。
- 暴露为 `game_bot_start` 工具，可被 Agent 调用。

#### ✨ Skill 系统
- 双源扫描：`prompts/skills/` 内置 + `<userData>/skills/` 用户覆盖，
  目录级整体覆盖。
- Meta 工具 `invoke_skill` / `read_skill_reference`，路径穿越防护 + 读
  重放拦截 + 大文本截断。
- 支持 `/skill_id ...` slash 命令。

</details>

<details>
<summary><b>🔧 开发功能</b>（点击展开）</summary>

#### 🧪 单元测试
- Vitest 4 覆盖 asr / tts / channels / chats / game-bot / memory /
  opener / orchestrator / rag / scheduler / skills 等核心模块。
- `npm test` 一次性 / `npm run test:watch` 监听模式。

#### 🎬 场景模拟
- `npm run sim` 默认场景 / `sim:coffee` / `sim:mix` / `sim:rescue` 单场景调试。
- `npm run sim:sweep --rewardGain=3,5,7,10` 跑 Worldbook 评分参数 sweep。
- 产物输出到 `sim-result/`。

#### 🔧 开发者体验
- 统一 IPC 总线：`shared/ipc-channels.ts` 定义 90+ 通道常量。
- 运行时状态 preview：设置面板实时预览情绪 / 状态文案。
- Embedding 模型热切换：自动检测维度不匹配并清空旧库。
- 文件监视 / 热更新：`watchWorldbookFile` 等运行时热加载。

</details>

---

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| Shell | Electron 33 |
| 渲染层 | Vite 5 + TypeScript 5 + Pixi.js 7 |
| Live2D | `pixi-live2d-display` 0.5.0-beta + Cubism Core |
| AI / MCP | `@modelcontextprotocol/sdk`, `@ag-ui/core`, `@ag-ui/client` |
| 集成 | 飞书 OpenAPI、微信 iLink、Nodemailer、PDFKit、docx |
| 测试 | Vitest 4 |

---

## 📦 项目结构

```
src/
├── main/             # Electron 主进程
│   ├── asr/          # 语音识别（阿里云实时 ASR）
│   ├── call/         # 语音通话核心逻辑
│   ├── channels/     # 外部渠道适配层（飞书 / 微信 iLink / ...）
│   ├── chats/        # 多会话历史与持久化
│   ├── game-bot/     # 游戏自动化（game-recipes 驱动）
│   ├── memory/       # L0/L1/L2 记忆引擎 + RAG
│   ├── opener/       # 启动器 / 托盘 / 单实例
│   ├── orchestrator/ # Agent 主循环 + 工具调度
│   ├── rag/          # 检索增强生成 + worldbook 注入
│   ├── relationship/ # 用户关系画像
│   ├── scheduler/    # 定时任务（提醒 / 日程）
│   ├── sim/          # 场景模拟工具
│   ├── skills/       # Agent skill 系统
│   └── tts/          # 语音合成（多引擎）
├── preload/          # Electron preload 桥接
├── renderer/         # Vite 渲染层
│   ├── call/         # 语音通话窗口
│   ├── chat/         # 主聊天界面
│   ├── live2d/       # Live2D 模型渲染逻辑
│   ├── public/       # 静态资源（音频 / 头像 / 模型 / 贴纸）
│   ├── settings/     # 设置中心
│   ├── sidebar/      # 侧边栏
│   ├── sticker-manager/ # 贴纸管理
│   ├── tasks/        # 任务面板
│   ├── types/        # 共享类型定义
│   └── ui/           # 通用 UI 组件
└── shared/           # 主进程与渲染进程共享代码

dist/renderer/        # Vite 构建产物（不在 git 跟踪范围内）
├── assets/           # 打包后的 JS/CSS
├── audio/            # 音频资源
├── avatars/          # 头像图片
├── call/ chat/ settings/ sidebar/ sticker-manager/ tasks/   # HTML 入口
├── models/cyrene/    # Live2D 模型 — 见 MODEL_LICENSE.md
└── stickers/         # 贴纸图片资源
```

> **注意**：`dist/renderer/assets/`、`dist/renderer/*/index.html` 等
> Vite 构建产物不在 git 跟踪范围内。运行 `npm run build:renderer`
> 重新生成。

---

## 📄 许可证

本仓库的**源代码**遵循 [MIT License](./LICENSE)，Copyright (c) 2026 Playa。
MIT 仅约束本仓库的源代码，不适用于角色、Live2D 模型与美术资产。

角色 IP（《崩坏：星穹铁道》"昔涟" 等）、Live2D 模型（`models/cyrene/`）、
美术资产遵循各自对应的授权：

- **Live2D 模型** — 详见 [MODEL_LICENSE.md](./MODEL_LICENSE.md)，
  模型作者 [@是依七哒](https://space.bilibili.com/457683484) 授权使用、
  修改、再分发。
- **角色 IP / 美术** — 归 **HoYoverse / 米哈游**所有。

因底层角色 IP 涉及米哈游同人创作规范，**本项目及其任何衍生物严禁任何
商业用途**。

---

## 🙏 致谢

- **昔涟角色**：© HoYoverse / 米哈游
- **Live2D 模型**：由 [@是依七哒](https://space.bilibili.com/457683484) 制作 —
  详见 [MODEL_LICENSE.md](./MODEL_LICENSE.md)
- **Live2D Cubism SDK**：© Live2D Cubism

特别感谢模型原作者慷慨授权本项目使用、修改并再分发其作品。

---

## 💌 联系

欢迎通过 GitHub Issues / PR 交流。请保持讨论的礼貌与主题相关性。