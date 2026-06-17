// MCP 链路端到端测试 — 独立 Node 脚本，不依赖 Electron
// 用法: node test-mcp-client.mjs

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LOG = (label, ...args) => console.log("[Test]", label, ...args);

async function main() {
  LOG("START", "创建 MCP Client...");

  const transport = new StdioClientTransport({
    command: "node",
    args: ["test-mcp-server.mjs"],
  });

  transport.onerror = (err) => {
    console.error("[Test] transport error:", err.message);
  };

  const client = new Client(
    { name: "cyrene-test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  // 1. 连接
  LOG("STEP 1", "连接 MCP Server...");
  try {
    await client.connect(transport);
    LOG("STEP 1", "连接成功!");
  } catch (err) {
    console.error("[Test] 连接失败:", err.message);
    process.exit(1);
  }

  // 2. 发现工具
  LOG("STEP 2", "列出工具...");
  let tools = [];
  try {
    const result = await client.listTools();
    tools = result.tools;
    LOG("STEP 2", "发现 " + tools.length + " 个工具:");
    for (const t of tools) {
      LOG("  -", t.name, "|", t.description || "(无描述)");
      LOG("    inputSchema:", JSON.stringify(t.inputSchema).slice(0, 120));
    }
  } catch (err) {
    console.error("[Test] listTools 失败:", err.message);
    await client.close();
    process.exit(1);
  }

  if (tools.length === 0) {
    console.error("[Test] 没有发现任何工具!");
    await client.close();
    process.exit(1);
  }

  // 3. 调用 echo
  LOG("STEP 3", "调用 echo 工具...");
  try {
    const echoResult = await client.callTool({
      name: "echo",
      arguments: { message: "Hello from MCP test client!" },
    });
    LOG("STEP 3", "echo 返回:");
    for (const block of echoResult.content) {
      if (block.type === "text") {
        LOG("  ->", block.text);
      }
    }
  } catch (err) {
    console.error("[Test] echo 调用失败:", err.message);
  }

  // 4. 调用 get_time
  LOG("STEP 4", "调用 get_time 工具...");
  try {
    const timeResult = await client.callTool({
      name: "get_time",
      arguments: { timezone: "Asia/Shanghai" },
    });
    LOG("STEP 4", "get_time 返回:");
    for (const block of timeResult.content) {
      if (block.type === "text") {
        LOG("  ->", block.text);
      }
    }
  } catch (err) {
    console.error("[Test] get_time 调用失败:", err.message);
  }

  // 5. 关闭
  LOG("STEP 5", "关闭连接...");
  await client.close();
  LOG("DONE", "所有测试通过!");
}

main().catch((err) => {
  console.error("[Test] 未捕获错误:", err);
  process.exit(1);
});
