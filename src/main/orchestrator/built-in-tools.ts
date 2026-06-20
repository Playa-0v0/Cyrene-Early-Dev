// 内置高危工具 — 给 agent 装上 fetch_url / run_shell / install_mcp_server 三件武器
// 全部走权限网关：fetch_url=network, run_shell=shell, install_mcp_server=fs-write

import { spawn } from "child_process";
import { toolRegistry } from "./tool-registry";
import { addMcpServer } from "./mcp-manager";

const LOG_PREFIX = "[BuiltinTools]";

// ── 工具 1：fetch_url ─────────────────────────────────────
// 拉一个 URL 的纯文本 / Markdown 形式的 body，给 agent 读 README 用

const FETCH_TIMEOUT_MS = 20_000;
const FETCH_MAX_BYTES = 512 * 1024; // 单次最多 512KB，防止 LLM 上下文爆炸

// HTML → Markdown 清洗：用 turndown 转成 LLM 最易理解的 markdown 格式
// 保留标题层级/列表/代码块/表格/链接，比纯 strip 标签信息量大得多
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",        // <h1>→# <h2>→##
  codeBlockStyle: "fenced",   // <pre><code>→```围栏代码块（LLM 更认）
  bulletListMarker: "-",
  emDelimiter: "*",           // <em>→*斜体*
});

function stripHtml(html: string): string {
  // 先去 script/style/注释（turndown 不会自动去这些，留着会污染 markdown）
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // 转 markdown（保留结构），失败则退回纯 strip 标签
  try {
    const md = turndown.turndown(s);
    // 压缩多余空行（turndown 有时会留连续空行）
    return md.replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    // turndown 解析失败（畸形 HTML），退回原来的纯标签剥离
    s = s.replace(/<[^>]+>/g, " ");
    s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  }
}

async function executeFetchUrl(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return "[错误] url 必须以 http:// 或 https:// 开头";
  }
  const asMarkdown = args.format === "markdown" || args.format === undefined;
  console.log(LOG_PREFIX, "fetch_url:", url, "format=" + (asMarkdown ? "markdown" : "raw"));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Cyrene Agent) Chrome/120 Safari/537.36",
        Accept: "text/html,text/markdown,text/plain,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!resp.ok) {
      return "[错误] HTTP " + resp.status + " " + resp.statusText;
    }
    const ctype = resp.headers.get("content-type") || "";
    const buf = await resp.arrayBuffer();
    const truncated = buf.byteLength > FETCH_MAX_BYTES;
    const slice = truncated ? buf.slice(0, FETCH_MAX_BYTES) : buf;
    let text = new TextDecoder("utf-8").decode(slice);
    if (asMarkdown && /text\/html|application\/xhtml/i.test(ctype)) {
      text = stripHtml(text);
    }
    const meta = "URL: " + url + "\nContent-Type: " + ctype + (truncated ? "\n[已截断到 " + FETCH_MAX_BYTES + " 字节]" : "") + "\n\n";
    return meta + text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] fetch 失败: " + msg;
  } finally {
    clearTimeout(timer);
  }
}

toolRegistry.register({
  id: "fetch_url",
  name: "读取网页",
  description:
    "下载指定 URL 的内容并返回正文。支持 http/https，HTML 会用 turndown 转成结构化 markdown" +
    "（保留标题/列表/代码块/表格），便于阅读。适合给 agent 读 README、GitHub 仓库说明、MCP 安装文档等。" +
    "参数：url (必填，完整 http(s) 地址)，format (可选 markdown|raw，默认 markdown)。",
  enabled: true,
  risk: "network",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "要拉取的完整 URL（必须包含 https:// 或 http://）" },
      format: { type: "string", description: "markdown=自动清洗 HTML 为纯文本（默认）；raw=原文不处理" },
    },
    required: ["url"],
  },
  execute: executeFetchUrl,
});

// ── 工具 2：run_shell ─────────────────────────────────────
// 在用户机器上跑一行命令，给 agent 装 MCP 时跑 git/npm/pip 等用
// 注意：不开 shell（spawn shell:false），命令必须是真正的可执行文件，避免 shell 注入

const SHELL_TIMEOUT_MS = 5 * 60_000; // 5 分钟兜底
const SHELL_MAX_OUTPUT = 16 * 1024;  // 单次最多 16KB stdout/stderr

interface ShellResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

function runShellOnce(command: string, args: string[], cwd?: string): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: cwd || undefined,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const timeoutTimer = setTimeout(() => {
      console.warn(LOG_PREFIX, "run_shell 超时，kill:", command);
      child.kill("SIGKILL");
    }, SHELL_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < SHELL_MAX_OUTPUT) {
        stdout += chunk.toString("utf8");
        if (stdout.length > SHELL_MAX_OUTPUT) {
          stdout = stdout.slice(0, SHELL_MAX_OUTPUT);
          truncated = true;
        }
      } else {
        truncated = true;
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < SHELL_MAX_OUTPUT) {
        stderr += chunk.toString("utf8");
        if (stderr.length > SHELL_MAX_OUTPUT) {
          stderr = stderr.slice(0, SHELL_MAX_OUTPUT);
          truncated = true;
        }
      } else {
        truncated = true;
      }
    });
    child.on("error", (err) => {
      clearTimeout(timeoutTimer);
      resolve({
        exitCode: -1,
        stdout,
        stderr: stderr + "\n[spawn error] " + err.message,
        truncated,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeoutTimer);
      resolve({ exitCode: code, stdout, stderr, truncated });
    });
  });
}

async function executeRunShell(args: Record<string, unknown>): Promise<string> {
  const cmd = String(args.command || "").trim();
  const cmdArgs = Array.isArray(args.args) ? (args.args as unknown[]).map((x) => String(x)) : [];
  const cwd = args.cwd ? String(args.cwd) : undefined;
  if (!cmd) return "[错误] command 不能为空";

  console.log(LOG_PREFIX, "run_shell:", cmd, JSON.stringify(cmdArgs), cwd ? "cwd=" + cwd : "");
  const result = await runShellOnce(cmd, cmdArgs, cwd);
  console.log(LOG_PREFIX, "run_shell 完成 exitCode=" + result.exitCode + " stdout.len=" + result.stdout.length + " stderr.len=" + result.stderr.length);

  const lines: string[] = [];
  lines.push("$ " + cmd + (cmdArgs.length ? " " + cmdArgs.join(" ") : ""));
  if (cwd) lines.push("(cwd: " + cwd + ")");
  lines.push("exitCode: " + result.exitCode);
  if (result.stdout) lines.push("--- stdout ---\n" + result.stdout.trimEnd());
  if (result.stderr) lines.push("--- stderr ---\n" + result.stderr.trimEnd());
  if (result.truncated) lines.push("[输出已截断]");
  return lines.join("\n");
}

toolRegistry.register({
  id: "run_shell",
  name: "执行命令",
  description:
    "在用户电脑上执行一条命令（不通过 shell，按 argv 数组传参）。" +
    "适合给 agent 跑 git clone / npm install / pip install / node --version 等。" +
    "参数：command (可执行文件名或绝对路径)，args (字符串数组)，cwd (可选工作目录)。" +
    "返回 exitCode + stdout + stderr。危险命令需用户在权限档位中授权或单次同意。",
  enabled: true,
  risk: "shell",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "可执行文件名（如 'git'、'npm'）或绝对路径" },
      args: { type: "array", description: "命令行参数，按 argv 数组形式给，例如 ['clone', 'https://...']" },
      cwd: { type: "string", description: "工作目录绝对路径，可选" },
    },
    required: ["command"],
  },
  execute: executeRunShell,
});

// ── 工具 3：install_mcp_server ────────────────────────────
// 把一个 {command, args, env} 注册成新的 MCP server。
// agent 读完 README 的 mcpServers 配置后，调这个工具一次性写盘 + 启动 + 发现工具

async function executeInstallMcp(args: Record<string, unknown>): Promise<string> {
  const id = (String(args.id || "").trim()) || ("mcp-" + Date.now());
  const name = String(args.name || "").trim() || id;
  const command = String(args.command || "").trim();
  if (!command) return "[错误] command 不能为空";

  const cmdArgs = Array.isArray(args.args) ? (args.args as unknown[]).map((x) => String(x)) : [];
  let env: Record<string, string> | undefined;
  if (args.env && typeof args.env === "object") {
    env = {};
    for (const [k, v] of Object.entries(args.env as Record<string, unknown>)) {
      env[k] = String(v);
    }
  }
  const cwd = args.cwd ? String(args.cwd) : undefined;

  console.log(LOG_PREFIX, "install_mcp_server:", id, name, command, JSON.stringify(cmdArgs).slice(0, 200));
  if (env) console.log(LOG_PREFIX, "  env keys:", Object.keys(env).join(","));
  if (cwd) console.log(LOG_PREFIX, "  cwd:", cwd);

  try {
    const result = await addMcpServer({
      id,
      name,
      transport: "stdio",
      command,
      args: cmdArgs,
      env,
      cwd,
    });
    if (!result.ok) {
      return "[错误] 安装失败: " + (result.error || "未知错误");
    }
    const tools = result.toolIds || [];
    return (
      "✅ MCP server \"" + name + "\" 已连接\n" +
      "id: " + id + "\n" +
      "command: " + command + (cmdArgs.length ? " " + cmdArgs.join(" ") : "") + "\n" +
      "发现 " + tools.length + " 个工具" + (tools.length ? "：\n  - " + tools.join("\n  - ") : "") + "\n" +
      "你现在可以让我用这些工具帮你做事。"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] 安装异常: " + msg;
  }
}

toolRegistry.register({
  id: "install_mcp_server",
  name: "安装 MCP",
  description:
    "把一个 MCP server 加到昔涟的工具盘里：写入配置 → 启动 → 发现工具。" +
    "通常先用 fetch_url 读 README，找到 mcpServers 配置块（command/args/env），再用本工具一次性安装。" +
    "参数：id (可选，唯一标识，留空则用时间戳)，name (展示名)，command (可执行命令)，" +
    "args (字符串数组)，env (键值对，环境变量)，cwd (可选工作目录)。",
  enabled: true,
  risk: "fs-write",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "唯一标识，留空则自动生成" },
      name: { type: "string", description: "展示名，比如 'mail-mcp'" },
      command: { type: "string", description: "可执行命令，例如 'node' / 'pythonw' / 'npx'" },
      args: { type: "array", description: "命令行参数数组，例如 ['C:/.../bridging_mail_mcp.py']" },
      env: { type: "object", description: "环境变量键值对" },
      cwd: { type: "string", description: "工作目录绝对路径，可选" },
    },
    required: ["command"],
  },
  execute: executeInstallMcp,
});

console.log(LOG_PREFIX, "已注册：fetch_url / run_shell / install_mcp_server");

// ── 工具 4：weather（天气查询）─────────────────────────────
// 查指定城市的实时天气。城市参数可选——没传就读用户信息的默认城市。
// 支持两个天气源：
//   - open-meteo（免配置默认，海外开源 API）
//   - amap（高德天气，国内数据准，需填 key）
// 默认城市/天气源/高德key 通过 setWeatherConfig 注入（避免 import index.ts 造成循环依赖）。

const WEATHER_TIMEOUT_MS = 15_000;

/** 注入的配置获取器（由 index.ts 启动时调 setWeatherConfig 设置）。 */
let weatherCityGetter: (() => string) | null = null;
let weatherSourceGetter: (() => string) | null = null;
let amapKeyGetter: (() => string) | null = null;

/**
 * index.ts 启动时调用，注入默认城市/天气源/高德key 的读取器。
 * source: "open-meteo"（免配置默认）| "amap"（高德）
 */
export function setWeatherConfig(
  cityGetter: () => string,
  sourceGetter: () => string,
  amapKeyFn: () => string,
): void {
  weatherCityGetter = cityGetter;
  weatherSourceGetter = sourceGetter;
  amapKeyGetter = amapKeyFn;
}

// ── Open-Meteo 实现（免 key 免配置）──

interface OMCity { name: string; latitude: number; longitude: number; country: string; admin1?: string }

/** Open-Meteo 城市查询（Geocoding API，免费免 key）。 */
async function omResolveCity(city: string): Promise<OMCity | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WEATHER_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return null;
    const data = await resp.json() as { results?: OMCity[] };
    if (!data.results || data.results.length === 0) return null;
    return data.results[0];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Open-Meteo 实时天气查询（免费免 key）。 */
async function omFetchWeather(city: string): Promise<string> {
  const loc = await omResolveCity(city);
  if (!loc) {
    return `[错误] 找不到城市"${city}"，请确认城市名（支持中文/拼音）。`;
  }
  const params = [
    "temperature_2m", "relative_humidity_2m", "apparent_temperature",
    "precipitation", "weather_code", "wind_speed_10m", "wind_direction_10m",
    "surface_pressure",
  ].join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=${params}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WEATHER_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return `[错误] 天气查询失败：HTTP ${resp.status}`;
    const data = await resp.json() as {
      current?: {
        temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number;
        precipitation: number; weather_code: number; wind_speed_10m: number;
        wind_direction_10m: number; surface_pressure: number;
      };
    };
    const c = data.current;
    if (!c) return "[错误] 天气查询失败：Open-Meteo 未返回数据";
    const wmoText = omWeatherCodeText(c.weather_code);
    const windDir = omWindDir(c.wind_direction_10m);
    const adm = loc.admin1 ? `${loc.admin1}` : loc.country;
    return [
      `城市：${loc.name}（${adm}）`,
      `天气：${wmoText}`,
      `温度：${c.temperature_2m}°C（体感 ${c.apparent_temperature}°C）`,
      `风向风速：${windDir} ${c.wind_speed_10m}km/h`,
      `湿度：${c.relative_humidity_2m}%`,
      `降水量：${c.precipitation}mm`,
      `气压：${c.surface_pressure}hPa`,
    ].join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] 天气查询失败：" + msg;
  } finally {
    clearTimeout(timer);
  }
}

/** WMO 天气代码 → 中文描述（Open-Meteo 用 WMO 标准代码）。 */
function omWeatherCodeText(code: number): string {
  const map: Record<number, string> = {
    0: "晴", 1: "晴间多云", 2: "多云", 3: "阴",
    45: "雾", 48: "雾凇",
    51: "小雨", 53: "中雨", 55: "大雨",
    56: "冻雨", 57: "强冻雨",
    61: "小雨", 63: "中雨", 65: "大雨",
    66: "冻雨", 67: "强冻雨",
    71: "小雪", 73: "中雪", 75: "大雪",
    77: "雪粒",
    80: "阵雨", 81: "强阵雨", 82: "暴雨",
    85: "阵雪", 86: "强阵雪",
    95: "雷暴", 96: "雷暴伴冰雹", 99: "强雷暴伴冰雹",
  };
  return map[code] ?? `未知（代码${code}）`;
}

/** 风向角度 → 中文方位。 */
function omWindDir(deg: number): string {
  const dirs = ["北", "东北偏北", "东北", "东北偏东", "东", "东南偏东", "东南", "东南偏南",
    "南", "西南偏南", "西南", "西南偏西", "西", "西北偏西", "西北", "西北偏北"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ── 高德天气实现（需 key，国内数据准）──

interface AmapDistrict { adcode: string; name: string; level: string }

/** 高德行政区查询：城市名 → adcode。 */
async function amapResolveAdcode(city: string, key: string): Promise<AmapDistrict | null> {
  const url = `https://restapi.amap.com/v3/config/district?keywords=${encodeURIComponent(city)}&subdistrict=0&key=${key}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WEATHER_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return null;
    const data = await resp.json() as { status?: string; districts?: AmapDistrict[] };
    if (data.status !== "1" || !data.districts || data.districts.length === 0) return null;
    return data.districts[0];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 高德实时天气查询。 */
async function amapFetchWeather(city: string, key: string): Promise<string> {
  const district = await amapResolveAdcode(city, key);
  if (!district) {
    return `[错误] 找不到城市"${city}"，请确认城市名（支持中文，如"无锡"）。`;
  }
  const url = `https://restapi.amap.com/v3/weather/weatherInfo?city=${district.adcode}&extensions=base&key=${key}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WEATHER_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return `[错误] 天气查询失败：HTTP ${resp.status}`;
    const data = await resp.json() as { status?: string; lives?: Array<{
      province: string; city: string; weather: string; temperature: string;
      winddirection: string; windpower: string; humidity: string; reporttime: string;
    }> };
    if (data.status !== "1" || !data.lives || data.lives.length === 0) {
      return `[错误] 天气查询失败：高德返回 status=${data.status ?? "?"}`;
    }
    const w = data.lives[0];
    return [
      `城市：${w.city}（${w.province}）`,
      `天气：${w.weather}`,
      `温度：${w.temperature}°C`,
      `风向风速：${w.winddirection}风 ${w.windpower}级`,
      `湿度：${w.humidity}%`,
      `发布时间：${w.reporttime}`,
    ].join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] 天气查询失败：" + msg;
  } finally {
    clearTimeout(timer);
  }
}

async function executeWeather(args: Record<string, unknown>): Promise<string> {
  const source = weatherSourceGetter?.() ?? "open-meteo";

  // 城市：参数优先，没传读用户信息默认城市
  let city = String(args.city ?? "").trim();
  if (!city) {
    city = (weatherCityGetter?.() ?? "").trim();
  }
  if (!city) {
    return "[提示] 没有指定城市，也没设置默认城市。请告诉用户：在 设置 → 我的信息 填默认城市，或直接说出要查的城市名。";
  }

  // 按天气源分支
  if (source === "open-meteo") {
    return omFetchWeather(city);
  }
  if (source === "amap") {
    const amapKey = amapKeyGetter?.() ?? "";
    if (!amapKey) {
      return "[错误] 还没有配置高德天气 Key。请在 设置 → 插件 → 天气查询 填入高德 Key，或切换天气源为 Open-Meteo（免配置）。";
    }
    return amapFetchWeather(city, amapKey);
  }

  // 未知天气源
  return `[错误] 未知的天气源"${source}"。请在 设置 → 插件 → 天气查询 选择 Open-Meteo 或 高德天气。`;
}

toolRegistry.register({
  id: "weather",
  name: "查天气",
  description:
    "查询指定城市的实时天气（温度/体感/风/湿度/降水等）。数据准确。" +
    "参数：city（可选，城市名中文或拼音；不传则用用户设置的默认城市）。" +
    "适合用户问'今天天气怎样''外面冷不冷'等。",
  enabled: true,
  risk: "network",
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string", description: "要查询的城市名（中文或拼音），不传则用用户默认城市" },
    },
    required: [],
  },
  execute: executeWeather,
});

console.log(LOG_PREFIX, "已注册：fetch_url / run_shell / install_mcp_server / weather");
