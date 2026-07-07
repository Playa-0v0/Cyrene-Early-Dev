<div align="center">

<img src="./preview.png" alt="Cyrene Agent" width="800">

# Cyrene-Agent

**English** | [中文](./README.md)

</div>

**Cyrene-Agent is a Windows desktop Live2D AI companion with chat, memory, voice, tool calling, and multi-platform integration.**

> A desktop Live2D conversational agent built with Electron + TypeScript,
> featuring the Cyrene character from *Honkai: Star Rail*. Supports daily
> chat, emotional interaction, and a personalized memory engine.

---

## ⚠️ Disclaimer

This is an **unofficial fan-made project**. It is **NOT** affiliated with,
endorsed by, or sponsored by HoYoverse / miHoYo in any way.

"Honkai: Star Rail", "Cyrene" (昔涟), and all related character designs,
artwork, story content, and trademarks are the intellectual property of
**HoYoverse / miHoYo**.

**On the scope of licensing**:

- **Source code** is released under [MIT License](./LICENSE), which covers
  this repository's source code only.
- **Character IP, Live2D model, and art assets** are NOT covered by the
  MIT License; they are subject to [MODEL_LICENSE.md](./MODEL_LICENSE.md)
  and miHoYo's fan-content policy respectively.
- Because the underlying character IP is governed by miHoYo's fan policy,
  **this project and any derivatives are strictly prohibited from any
  commercial use** (selling, paid communities, ad-monetization, packaged
  resale, etc.).

---

## 📊 Project Status

| Module | Status |
| --- | --- |
| 🪟 Live2D pet / multi-window / expression interaction | ✅ Stable |
| 💬 Daily chat / voice call / multi-chat history / stickers | ✅ Stable |
| 🧠 Memory system (L0/L1/L2 + custom DMAE Worldbook engine) | ✅ Stable |
| 🔊 TTS / ASR / document generation / web search / file ops | ✅ Stable |
| 💼 Lark / Feishu long-connection | 🧪 Experimental |
| 💬 WeChat iLink Bot | 🧪 Experimental |
| 🤖 Game Bot automation | 🧪 Experimental |
| 🔌 MCP (Model Context Protocol) ecosystem | 🧪 Experimental |
| ✨ Skill system | 🧪 Experimental |
| 📚 RAG document knowledge base (hybrid retrieval / reranker) | 🧪 Experimental |

> ✅ Stable = usable for daily use; 🧪 Experimental = implemented but edge cases / compatibility / UX still being polished.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Windows 10/11 (Feishu / WeChat / nut-js key-mouse automation depend on
  Win32 APIs)
- macOS / Linux may run, but desktop integration is only fully tested on
  Windows

### 1. Clone the repository

```bash
git clone https://github.com/Playa-0v0/Cyrene-Agent.git
cd Cyrene-Agent
```

### 2. Install dependencies

```bash
npm install
```

The first install downloads the Electron binary (~100 MB) along with
Pixi.js / Live2D and other rendering deps; takes 3–10 minutes depending
on network.

### 3. Build and start

```bash
npm install
npm run build
npm start
```

Or jump straight to dev mode:

```bash
npm run dev
```

Runs `tsc` (main / preload) + `vite` + Electron concurrently. Main-process
changes auto-restart Electron; renderer changes are picked up via
Vite HMR.

---

## 🔑 Configure API Key

After launch, **click the system tray icon → Open Settings** and complete
the basics:

1. **🔑 API Settings**: Pick an LLM vendor preset (OpenAI / Anthropic /
   MiniMax / ...) and fill in your API Key (**required** — the agent won't
   work without it).
2. **🎙️ TTS Settings**: Pick a TTS engine (default MiniMax, or switch to
   GPT-SoVITS / Custom Cloud / MiMo).
3. **🎧 ASR Settings**: If you need voice calls, fill in Aliyun realtime
   ASR AppKey / AccessKey.
4. **📱 Phone connection** (optional): For Lark / WeChat iLink integration.

Settings are saved to `<userData>/settings.json` — no restart needed.

---

## ❓ FAQ

<!-- TODO: replace this placeholder with your FAQ content -->

Placeholder: replace this section with your FAQ. Suggested topics:
- First-launch issues (black screen, no pet, won't start)
- How to swap / add a Live2D model
- Can I use voice call without ASR?
- Will it run on macOS / Linux?
- Is my API key safe?
- OOM / memory leak troubleshooting

---

## ✨ Features

### Core Features

#### 🪟 Desktop Companion
- **Live2D pet** — Always-on-top desktop pet powered by `pixi-live2d-display`
  + Cubism, with expression switching, mouth sync, click interaction, and
  natural idle animations.
- **Multi-window architecture** — 7 independent BrowserWindows: chat,
  sidebar, tasks, settings, sticker manager, voice call, and the pet itself.
- **AG-UI expression broadcast** — Agent uses the `play_live2d_action` tool
  to push (expression + motion + bubble) events to the pet window so the
  pet performs along with the conversation mood.

#### 💬 Conversation
- **Daily chat + voice calls** — Three switchable personality styles
  (desktop / phone / call); state machine `IDLE → LISTENING → THINKING →
  SPEAKING → ENDED`; 24-turn sliding window context.
- **Multi-chat history** — Each chat persisted as its own JSON, with
  auto-derived titles, `updatedAt` sorting, double-click rename.
- **AG-UI event stream** — Standardized events (RUN_STARTED / TEXT_MESSAGE
  / TOOL_CALL / RUN_FINISHED), per-token delta rendering.
- **Drag-and-drop file ingestion** — Drop PDF/MD/DOCX/XLSX... into the chat
  window; chunks are auto-extracted into the RAG knowledge base.
- **Sticker panel** — Built-in sticker picker; AI auto-matches the best
  sticker by reply similarity.

#### 🧠 Memory System
- **L0 core profile / L1 recent state / L2 long-term memory** — Full
  evidence chain; automatic weight decay (thresholds 60/30/10 →
  active/aging/archived).
- **Conflict detection & resolution** — Lexical candidates → RAG recall →
  scoring → resolver; resolution types cover unrelated / context_difference
  / preference_evolution / direct_conflict.
- **🧬 Custom DMAE Worldbook engine** — Markdown entry format (trigger
  words / pinned / priority / intrinsic value / linked triggers);
  activation formula `Ru = Bu × (1 + γ·ln(1+U_old))`; Active / Dormant /
  Archived state machine; one-shot cascade trigger.

#### 🔊 Voice
- **Multi TTS engines** — MiniMax / GPT-SoVITS / Custom Cloud / MiMo / off.
- **Multi ASR engines** — Aliyun realtime ASR, auto token acquisition +
  JSON protocol + raw PCM.
- **VAD silence detection** — Detects user pause during voice calls and
  auto-triggers reply.

#### 🛠 Tool Calling
- **Document generation** — Excel (`exceljs`), Word (`docx`), PDF
  (`pdfkit`), Markdown.
- **Web search / fetch** — `web_search` + `fetch_url` (turndown
  HTML→Markdown).
- **File ops** — `read_file` / `list_dir` / `write_file` / `read_image`.
- **Life utilities** — Expense ledger, exchange rate, translate, trip
  planning, unified diff apply.
- **Task delegation** — `delegate_task` (sub-agent), `todo_write`
  checklist, `ask_user_choice` user choice cards.

<details>
<summary><b>🧩 Advanced Features</b> (click to expand)</summary>

#### 📚 RAG Document Knowledge Base
- Supports txt/md/pdf/docx/xlsx/pptx/csv/json; `source: imported_doc`
  traceable.
- Hybrid retrieval: vector + BM25 + reranker (three modes: light /
  standard / none).
- Dual embedding backend: local `@xenova/transformers` + cloud
  OpenAI-compatible.
- Entity relationship graph; jieba dictionary injection prevents
  "Cyrene / 小鹿" from being split wrong.

#### 🔌 MCP (Model Context Protocol)
- stdio / SSE / HTTP transports.
- Builtin servers auto-synced; `install_mcp_server` tool lets the agent
  auto-install new servers.
- Includes Playwright + Firecrawl hosted MCP configuration.

#### 💬 External Channels
- **Lark / Feishu long-connection** — Official SDK + WebSocket (no public
  domain / intranet penetration needed); p2p chat, multi-modal text /
  image / audio / video / file / sticker.
- **WeChat iLink Bot** — `@tencent-weixin/openclaw-weixin` + CLI, QR-code
  login → long-poll 35 s `getUpdates` → auto `sendText`.

#### 🤖 Game Bot Automation
- `engine.ts` step interpreter supports `launch / wait / key / click /
  vlm_click / vlm_select / vlm_check / branch` instructions.
- VLM visual localization + nut-js key-mouse input, exposed as the
  `game_bot_start` tool.

#### ✨ Skill System
- Dual-source scan: `prompts/skills/` builtin + `<userData>/skills/`
  user override (directory-level override).
- Meta tools `invoke_skill` / `read_skill_reference` with path traversal
  guard + read replay interceptor + large-text truncation.
- Supports `/skill_id ...` slash commands.

</details>

<details>
<summary><b>🔧 Developer Features</b> (click to expand)</summary>

#### 🧪 Unit Tests
- Vitest 4 covers asr / tts / channels / chats / game-bot / memory /
  opener / orchestrator / rag / scheduler / skills core modules.
- `npm test` for one-shot / `npm run test:watch` for watch mode.

#### 🎬 Scenario Simulation
- `npm run sim` default / `sim:coffee` / `sim:mix` / `sim:rescue` for
  single-scenario debug.
- `npm run sim:sweep --rewardGain=3,5,7,10` for Worldbook scoring
  parameter sweep.
- Output to `sim-result/`.

#### 🔧 Developer Experience
- Unified IPC bus: `shared/ipc-channels.ts` defines 90+ channel constants.
- Runtime state preview: settings panel previews emotion / status copy in
  real time.
- Embedding model hot-swap: auto-detects dimension mismatch and clears
  old stores.
- File watching / hot-reload: `watchWorldbookFile` and similar runtime
  hot-loaders.

</details>

---

## 🧱 Tech Stack

| Layer | Tech |
|---|---|
| Shell | Electron 33 |
| Renderer | Vite 5 + TypeScript 5 + Pixi.js 7 |
| Live2D | `pixi-live2d-display` 0.5.0-beta + Cubism Core |
| AI / MCP | `@modelcontextprotocol/sdk`, `@ag-ui/core`, `@ag-ui/client` |
| Integrations | Lark OpenAPI, WeChat iLink, Nodemailer, PDFKit, docx |
| Testing | Vitest 4 |

---

## 📦 Project Structure

```
src/
├── main/             # Electron main process
│   ├── asr/          # Automatic speech recognition (Aliyun realtime ASR)
│   ├── call/         # Voice call core logic
│   ├── channels/     # External channel adapters (Lark / WeChat iLink / ...)
│   ├── chats/        # Multi-chat history and persistence
│   ├── game-bot/     # Game automation (driven by game-recipes)
│   ├── memory/       # L0/L1/L2 memory engine + RAG
│   ├── opener/       # Launcher / tray / single-instance
│   ├── orchestrator/ # Agent main loop + tool dispatch
│   ├── rag/          # Retrieval-augmented generation + worldbook injection
│   ├── relationship/ # User relationship profile
│   ├── scheduler/    # Scheduled tasks (reminders / agenda)
│   ├── sim/          # Scenario simulation harness
│   ├── skills/       # Agent skill system
│   └── tts/          # Text-to-speech (multi-engine)
├── preload/          # Electron preload bridges (IPC exposure)
├── renderer/         # Vite renderer
│   ├── call/         # Voice call window
│   ├── chat/         # Main chat UI
│   ├── live2d/       # Live2D model rendering logic
│   ├── public/       # Static assets (audio / avatars / models / stickers)
│   ├── settings/     # Settings center
│   ├── sidebar/      # Sidebar
│   ├── sticker-manager/ # Sticker manager
│   ├── tasks/        # Task panel
│   ├── types/        # Shared type definitions
│   └── ui/           # Common UI components
└── shared/           # Code shared between main and renderer

dist/renderer/        # Vite build outputs (not tracked in git)
├── assets/           # Bundled JS/CSS (hashed filenames)
├── audio/            # Sound assets (BGM, SFX)
├── avatars/          # Avatar images
├── call/ chat/ settings/ sidebar/ sticker-manager/ tasks/  # HTML entries
├── models/cyrene/    # Live2D model — see MODEL_LICENSE.md
└── stickers/         # Sticker image assets
```

> **Note**: `dist/renderer/assets/`, `dist/renderer/*/index.html` and
> other Vite build outputs are **not** tracked in git (see
> `.gitignore`). Run `npm run build:renderer` to regenerate.

---

## 📄 Licensing

This repository's **source code** is released under [MIT License](./LICENSE),
Copyright (c) 2026 Playa. The MIT License covers the source code of this
repository only and does not apply to the character, Live2D model, or
art assets.

The character IP (*Honkai: Star Rail* "Cyrene" etc.), the Live2D model
(`models/cyrene/`), and art assets are governed by their respective
licenses:

- **Live2D model** — See [MODEL_LICENSE.md](./MODEL_LICENSE.md); used /
  modified / redistributed with permission from
  [@是依七哒](https://space.bilibili.com/457683484).
- **Character IP / art** — © **HoYoverse / miHoYo**.

Because the underlying character IP is governed by miHoYo's fan policy,
**this project and any derivatives are strictly prohibited from any
commercial use**.

---

## 🙏 Credits

- **Cyrene character**: © HoYoverse / miHoYo
- **Live2D model**: Created by [@是依七哒](https://space.bilibili.com/457683484)
  — see [MODEL_LICENSE.md](./MODEL_LICENSE.md)
- **Live2D Cubism SDK**: © Live2D Cubism

Special thanks to the original model creator for generously granting
permission to use, modify, and redistribute their work in this project.

---

## 💌 Contact

Issues and PRs welcome via GitHub. Please keep all discussions respectful
and on-topic.