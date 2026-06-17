// 测试 MCP Server — 提供两个简单工具用于验证 MCP 链路
// 用法: node test-mcp-server.js
// 昔涟设置中心 → 插件 → ＋ → 输入: node C:\Users\13575\Documents\live2D-Cyrene\test-mcp-server.js

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "cyrene-test-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 注册 tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "回显你发送的消息，用于测试 MCP 连接是否正常",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "要回显的消息" },
        },
        required: ["message"],
      },
    },
    {
      name: "get_time",
      description: "获取当前服务器时间",
      inputSchema: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "时区，例如 Asia/Shanghai，默认本地时区" },
        },
      },
    },
  ],
}));

// 注册 tools/call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "echo") {
    const msg = String(args?.message || "");
    return {
      content: [{ type: "text", text: "[Echo] " + msg }],
    };
  }

  if (name === "get_time") {
    const tz = String(args?.timezone || "Asia/Shanghai");
    const now = new Date().toLocaleString("zh-CN", { timeZone: tz });
    return {
      content: [{ type: "text", text: "当前时间 (" + tz + "): " + now }],
    };
  }

  throw new Error("未知工具: " + name);
});

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);

// 向 stderr 输出启动日志（stdout 被 MCP 协议占用）
console.error("[Test MCP Server] 已启动，提供工具: echo, get_time");
