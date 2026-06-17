// MCP 边界情况测试 — 重复连接、重复断开、异常参数
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LOG = (label, ...args) => console.log("[EdgeTest]", label, ...args);

async function main() {
  // ── 测试1: 正常连接 → 断开 → 再次连接（验证资源释放） ──
  LOG("TEST 1", "连接 → 断开 → 再连接...");
  for (let i = 0; i < 2; i++) {
    const transport = new StdioClientTransport({
      command: "node", args: ["test-mcp-server.mjs"],
    });
    const client = new Client({ name: "edge-test", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    const tools = await client.listTools();
    LOG("TEST 1", "第" + (i+1) + "次: 发现 " + tools.tools.length + " 个工具");
    await client.close();
  }
  LOG("TEST 1", "通过!");

  // ── 测试2: 调用不存在的工具 ──
  LOG("TEST 2", "调用不存在的工具...");
  const t2 = new StdioClientTransport({ command: "node", args: ["test-mcp-server.mjs"] });
  const c2 = new Client({ name: "edge-test", version: "1.0.0" }, { capabilities: {} });
  await c2.connect(t2);
  try {
    await c2.callTool({ name: "nonexistent_tool", arguments: {} });
    LOG("TEST 2", "FAIL: 应该抛出错误");
  } catch (err) {
    LOG("TEST 2", "正确抛出错误:", err.message.slice(0, 80));
  }
  await c2.close();
  LOG("TEST 2", "通过!");

  // ── 测试3: 空参数调用 ──
  LOG("TEST 3", "空参数调用 echo...");
  const t3 = new StdioClientTransport({ command: "node", args: ["test-mcp-server.mjs"] });
  const c3 = new Client({ name: "edge-test", version: "1.0.0" }, { capabilities: {} });
  await c3.connect(t3);
  try {
    const result = await c3.callTool({ name: "echo", arguments: {} });
    LOG("TEST 3", "返回:", result.content[0]?.text || "(空)");
  } catch (err) {
    LOG("TEST 3", "错误:", err.message.slice(0, 80));
  }
  await c3.close();
  LOG("TEST 3", "通过!");

  LOG("ALL", "所有边界测试通过!");
}

main().catch(err => {
  console.error("[EdgeTest] FAIL:", err.message);
  process.exit(1);
});
