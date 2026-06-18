// 文件系统工具组 — 给 agent 装上"读文件 / 列目录 / 写文件 / 读图片"四件武器
// 不绕 run_shell，直接用 fs API。每个工具都有 risk 字段交给权限网关判定。

import * as fs from "fs";
import * as path from "path";
import { toolRegistry } from "./tool-registry";

const LOG_PREFIX = "[FsTools]";

const READ_MAX_BYTES = 256 * 1024;       // 单文件最多读 256KB
const LIST_MAX_ENTRIES = 200;            // 单次目录列举最多 200 项
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 图片最多 5MB

function ensureAbsolute(p: string): string | null {
  if (!p) return null;
  if (!path.isAbsolute(p)) return null;
  return path.normalize(p);
}

function safeStat(p: string): fs.Stats | null {
  try { return fs.statSync(p); } catch { return null; }
}

function humanBytes(n: number): string {
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + "MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + "GB";
}

// ── 工具 1：read_file ─────────────────────────────────────

async function executeReadFile(args: Record<string, unknown>): Promise<string> {
  const raw = String(args.path || "").trim();
  const filePath = ensureAbsolute(raw);
  if (!filePath) return "[错误] path 必须是绝对路径";

  const stat = safeStat(filePath);
  if (!stat) return "[错误] 文件不存在或无法访问: " + filePath;
  if (!stat.isFile()) return "[错误] 不是文件（是目录或其它）: " + filePath;

  const startLine = Math.max(1, Number(args.startLine) || 1);
  const maxLines = Math.max(1, Math.min(2000, Number(args.maxLines) || 500));

  console.log(LOG_PREFIX, "read_file:", filePath, "size=" + humanBytes(stat.size), "lines=" + startLine + "..+" + maxLines);

  let buf: Buffer;
  try {
    buf = fs.readFileSync(filePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] 读取失败: " + msg;
  }

  const truncatedSize = buf.length > READ_MAX_BYTES;
  const slice = truncatedSize ? buf.subarray(0, READ_MAX_BYTES) : buf;

  // 二进制启发：前 4KB 出现大量 \0 → 当作二进制
  const head = slice.subarray(0, Math.min(slice.length, 4096));
  let nullCount = 0;
  for (let i = 0; i < head.length; i++) if (head[i] === 0) nullCount++;
  if (nullCount > head.length * 0.05) {
    return "[错误] 这看起来是二进制文件，read_file 只支持文本。如果是图片，请改用 read_image。\n" +
      "path: " + filePath + "\nsize: " + humanBytes(stat.size);
  }

  const text = slice.toString("utf8");
  const lines = text.split(/\r?\n/);
  const total = lines.length;
  const sliceLines = lines.slice(startLine - 1, startLine - 1 + maxLines);

  const head2 = "path: " + filePath + "\nsize: " + humanBytes(stat.size) +
    "\ntotal_lines: ~" + total + (truncatedSize ? "  [文件已按 256KB 截断]" : "") +
    "\nshowing: line " + startLine + " ~ " + (startLine + sliceLines.length - 1) + "\n\n";

  // 带行号方便 agent 后续精确引用
  const numbered = sliceLines.map((line, i) => {
    const ln = startLine + i;
    return String(ln).padStart(5, " ") + " | " + line;
  }).join("\n");

  return head2 + numbered;
}

toolRegistry.register({
  id: "read_file",
  name: "读取文件",
  description:
    "读取本地文本文件（小说、笔记、代码、配置、日志等）。" +
    "返回带行号的文本内容。文件超过 256KB 会自动截断；可用 startLine/maxLines 翻页。" +
    "用户提到任何本地文件路径时优先调此工具，不要凭记忆或编造内容。" +
    "参数：path (必填，绝对路径)，startLine (可选，从第几行开始，默认 1)，maxLines (可选，最多多少行，默认 500)。",
  enabled: true,
  risk: "fs-read",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "要读的文件绝对路径，例如 'C:\\\\Users\\\\me\\\\notes.txt'" },
      startLine: { type: "number", description: "起始行号，默认 1" },
      maxLines: { type: "number", description: "最多读多少行，默认 500，最大 2000" },
    },
    required: ["path"],
  },
  execute: executeReadFile,
});

// ── 工具 2：list_dir ──────────────────────────────────────

async function executeListDir(args: Record<string, unknown>): Promise<string> {
  const raw = String(args.path || "").trim();
  const dirPath = ensureAbsolute(raw);
  if (!dirPath) return "[错误] path 必须是绝对路径";

  const stat = safeStat(dirPath);
  if (!stat) return "[错误] 目录不存在或无法访问: " + dirPath;
  if (!stat.isDirectory()) return "[错误] 不是目录: " + dirPath;

  const showHidden = args.showHidden === true;
  console.log(LOG_PREFIX, "list_dir:", dirPath, "showHidden=" + showHidden);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] 读取目录失败: " + msg;
  }

  if (!showHidden) {
    entries = entries.filter(e => !e.name.startsWith("."));
  }

  // 文件夹在前，文件在后；同类按名字排序
  entries.sort((a, b) => {
    const da = a.isDirectory() ? 0 : 1;
    const db = b.isDirectory() ? 0 : 1;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  const truncated = entries.length > LIST_MAX_ENTRIES;
  const slice = truncated ? entries.slice(0, LIST_MAX_ENTRIES) : entries;

  const lines: string[] = [];
  lines.push("dir: " + dirPath);
  lines.push("count: " + entries.length + (truncated ? " (仅显示前 " + LIST_MAX_ENTRIES + " 项)" : ""));
  lines.push("");

  for (const ent of slice) {
    const full = path.join(dirPath, ent.name);
    if (ent.isDirectory()) {
      lines.push("[D] " + ent.name + "/");
    } else if (ent.isFile()) {
      const st = safeStat(full);
      const size = st ? "  " + humanBytes(st.size) : "";
      lines.push("[F] " + ent.name + size);
    } else if (ent.isSymbolicLink()) {
      lines.push("[L] " + ent.name);
    } else {
      lines.push("[?] " + ent.name);
    }
  }
  return lines.join("\n");
}

toolRegistry.register({
  id: "list_dir",
  name: "列出目录",
  description:
    "列出某个目录下的子目录和文件。用户问'我那里有什么文件''看看 D:/小说 下面'时调此工具。" +
    "参数：path (必填，绝对路径)，showHidden (可选，是否显示以 . 开头的隐藏项，默认 false)。",
  enabled: true,
  risk: "fs-read",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "要列举的目录绝对路径" },
      showHidden: { type: "boolean", description: "是否包含隐藏项（以 . 开头），默认 false" },
    },
    required: ["path"],
  },
  execute: executeListDir,
});

// ── 工具 3：write_file ────────────────────────────────────

async function executeWriteFile(args: Record<string, unknown>): Promise<string> {
  const raw = String(args.path || "").trim();
  const filePath = ensureAbsolute(raw);
  if (!filePath) return "[错误] path 必须是绝对路径";

  const content = typeof args.content === "string" ? args.content : "";
  const append = args.append === true;
  const createDirs = args.createDirs !== false; // 默认创建父目录

  console.log(LOG_PREFIX, "write_file:", filePath, "bytes=" + Buffer.byteLength(content, "utf8"), append ? "(append)" : "(overwrite)");

  if (createDirs) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return "[错误] 创建父目录失败: " + msg;
    }
  }

  try {
    if (append) {
      fs.appendFileSync(filePath, content, "utf8");
    } else {
      fs.writeFileSync(filePath, content, "utf8");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] 写入失败: " + msg;
  }

  const st = safeStat(filePath);
  return "[OK] 已" + (append ? "追加" : "写入") + ": " + filePath +
    (st ? "\nsize: " + humanBytes(st.size) : "");
}

toolRegistry.register({
  id: "write_file",
  name: "写入文件",
  description:
    "把文本内容写入本地文件，覆盖或追加。会自动创建父目录。" +
    "适合保存生成的笔记、改写后的文本、配置等。" +
    "参数：path (绝对路径)，content (要写的字符串)，append (可选，true=追加，默认 false=覆盖)，createDirs (可选，默认 true)。",
  enabled: true,
  risk: "fs-write",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "目标文件绝对路径" },
      content: { type: "string", description: "要写入的文本内容（UTF-8）" },
      append: { type: "boolean", description: "true=追加，false=覆盖（默认）" },
      createDirs: { type: "boolean", description: "是否自动创建父目录，默认 true" },
    },
    required: ["path", "content"],
  },
  execute: executeWriteFile,
});

// ── 工具 4：read_image ────────────────────────────────────
// 读图片转 base64 data URL；多模态模型可以直接看

async function executeReadImage(args: Record<string, unknown>): Promise<string> {
  const raw = String(args.path || "").trim();
  const filePath = ensureAbsolute(raw);
  if (!filePath) return "[错误] path 必须是绝对路径";

  const stat = safeStat(filePath);
  if (!stat) return "[错误] 文件不存在或无法访问: " + filePath;
  if (!stat.isFile()) return "[错误] 不是文件: " + filePath;
  if (stat.size > IMAGE_MAX_BYTES) {
    return "[错误] 图片过大（>" + humanBytes(IMAGE_MAX_BYTES) + "），当前 " + humanBytes(stat.size);
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  };
  const mime = mimeMap[ext];
  if (!mime) {
    return "[错误] 不支持的图片格式: " + ext + "（支持 png/jpg/jpeg/gif/webp/bmp/svg）";
  }

  console.log(LOG_PREFIX, "read_image:", filePath, "mime=" + mime, "size=" + humanBytes(stat.size));

  let buf: Buffer;
  try {
    buf = fs.readFileSync(filePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return "[错误] 读取失败: " + msg;
  }

  const dataUrl = "data:" + mime + ";base64," + buf.toString("base64");
  return "path: " + filePath + "\nmime: " + mime + "\nsize: " + humanBytes(stat.size) +
    "\ndata_url_length: " + dataUrl.length + "\n" +
    "data_url: " + dataUrl;
}

toolRegistry.register({
  id: "read_image",
  name: "读取图片",
  description:
    "读取本地图片文件，返回 data URL（base64）。仅在多模态模型下有意义。" +
    "支持 png/jpg/jpeg/gif/webp/bmp/svg。最大 5MB。" +
    "参数：path (必填，绝对路径)。",
  enabled: true,
  risk: "fs-read",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "图片文件绝对路径" },
    },
    required: ["path"],
  },
  execute: executeReadImage,
});

console.log(LOG_PREFIX, "已注册：read_file / list_dir / write_file / read_image");
