// MCP Manager — 管理多个 MCP server 的生命周期、配置持久化、启动自动连接
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { connectMcpServer, disconnectMcpServer, getMcpServerStates, McpServerConfig } from "./mcp-adapter";

const LOG_PREFIX = "[MCP Manager]";

function getConfigPath(): string {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "mcp-servers.json");
}

function loadConfigs(): McpServerConfig[] {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    const configs = JSON.parse(raw);
    if (Array.isArray(configs)) {
      console.log(LOG_PREFIX, "加载了 " + configs.length + " 个 MCP server 配置");
      return configs;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(LOG_PREFIX, "读取配置失败:", (err as Error).message);
    }
  }
  return [];
}

function saveConfigs(configs: McpServerConfig[]): void {
  try {
    const dir = path.dirname(getConfigPath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getConfigPath(), JSON.stringify(configs, null, 2), "utf-8");
    console.log(LOG_PREFIX, "已保存 " + configs.length + " 个 MCP server 配置");
  } catch (err) {
    console.error(LOG_PREFIX, "保存配置失败:", (err as Error).message);
  }
}

/**
 * 启动时自动连接所有已保存的 MCP server。
 */
export async function initMcpManager(): Promise<void> {
  console.log(LOG_PREFIX, "初始化 MCP Manager...");
  const configs = loadConfigs();

  if (configs.length === 0) {
    console.log(LOG_PREFIX, "没有已配置的 MCP server，跳过");
    return;
  }

  let connected = 0;
  let failed = 0;

  for (const config of configs) {
    try {
      await connectMcpServer(config);
      connected++;
    } catch (err) {
      failed++;
      console.error(LOG_PREFIX, "自动连接失败 [" + config.name + "]:", (err as Error).message);
    }
  }

  console.log(LOG_PREFIX, "初始化完成: " + connected + " 个成功, " + failed + " 个失败");
}

/**
 * 添加一个新的 MCP server 配置，连接并持久化。
 */
export async function addMcpServer(config: McpServerConfig): Promise<{
  ok: boolean;
  toolIds?: string[];
  error?: string;
}> {
  console.log(LOG_PREFIX, "添加 MCP server:", config.name);

  // 检查是否已存在
  const configs = loadConfigs();
  if (configs.some(c => c.id === config.id)) {
    return { ok: false, error: "已存在相同 ID 的 MCP server: " + config.id };
  }

  try {
    const toolIds = await connectMcpServer(config);
    configs.push(config);
    saveConfigs(configs);
    return { ok: true, toolIds };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * 移除一个 MCP server，断开连接并持久化。
 */
export async function removeMcpServer(serverId: string): Promise<{ ok: boolean; error?: string }> {
  console.log(LOG_PREFIX, "移除 MCP server:", serverId);

  const disconnected = await disconnectMcpServer(serverId);
  if (!disconnected) {
    return { ok: false, error: "未找到 MCP server: " + serverId };
  }

  const configs = loadConfigs().filter(c => c.id !== serverId);
  saveConfigs(configs);
  return { ok: true };
}

/**
 * 获取所有 MCP server 的状态列表。
 */
export function listMcpServers(): Array<{
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  toolIds: string[];
}> {
  return getMcpServerStates();
}
