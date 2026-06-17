// Function Calling 协议验证 — 测试 OpenAI 兼容 API 的 function calling 是否正常工作
// 用法: $env:CYRENE_API_KEY='sk-...' ; node test-fc-protocol.mjs

const settings = {
  baseUrl: (process.env.CYRENE_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
  model: process.env.CYRENE_MODEL || "deepseek-chat",
  apiKey: process.env.CYRENE_API_KEY || "",
};

if (!settings.apiKey) {
  console.log("[Test] 跳过: 未设置 CYRENE_API_KEY 环境变量");
  console.log("[Test] 设置方式: $env:CYRENE_API_KEY='sk-...' ; node test-fc-protocol.mjs");
  process.exit(0);
}

const LOG = (label, ...args) => console.log("[FCTest]", label, ...args);

async function callLLM(messages, tools) {
  const url = settings.baseUrl + "/v1/chat/completions";
  const body = { model: settings.model, messages, tools, tool_choice: tools ? "auto" : undefined, temperature: 0.7, stream: false };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.apiKey },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error("HTTP " + resp.status + ": " + err.slice(0, 200));
  }
  return resp.json();
}

async function main() {
  LOG("START", "baseUrl=" + settings.baseUrl + " model=" + settings.model);

  // ── 测试1: 带工具的消息，模型应该调用工具 ──
  LOG("");
  LOG("TEST 1", "带工具调用...");
  const tools = [{
    type: "function",
    function: {
      name: "get_time",
      description: "获取当前时间",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "时区，例如 Asia/Shanghai" },
        },
      },
    },
  }];

  const msgs1 = [
    { role: "system", content: "你是助手，可以使用 get_time 工具。" },
    { role: "user", content: "现在几点了？" },
  ];

  try {
    const r1 = await callLLM(msgs1, tools);
    const choice = r1.choices?.[0];
    LOG("TEST 1", "finish_reason:", choice?.finish_reason);

    if (choice?.message?.tool_calls) {
      LOG("TEST 1", "工具调用:", choice.message.tool_calls.map(tc => tc.function.name).join(", "));
      for (const tc of choice.message.tool_calls) {
        LOG("TEST 1", "  ", tc.function.name, "参数:", tc.function.arguments);

        // 模拟执行工具
        const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const toolResult = "当前时间: " + now;

        // 第二轮：把工具结果喂回去
        const msgs2 = [
          ...msgs1,
          { role: "assistant", content: null, tool_calls: [tc] },
          { role: "tool", tool_call_id: tc.id, name: tc.function.name, content: toolResult },
        ];
        const r2 = await callLLM(msgs2, null);
        LOG("TEST 1", "最终回复:", r2.choices?.[0]?.message?.content?.slice(0, 200));
      }
    } else {
      LOG("TEST 1", "直接回复:", choice?.message?.content?.slice(0, 200));
    }
  } catch (err) {
    console.error("[FCTest] TEST 1 失败:", err.message);
  }

  // ── 测试2: 纯闲聊，不应调工具 ──
  LOG("");
  LOG("TEST 2", "纯闲聊...");
  const msgs2 = [
    { role: "system", content: "你是助手。" },
    { role: "user", content: "你好呀！" },
  ];
  try {
    const r2 = await callLLM(msgs2, tools);
    const choice = r2.choices?.[0];
    LOG("TEST 2", "finish_reason:", choice?.finish_reason);
    LOG("TEST 2", "回复:", choice?.message?.content?.slice(0, 200));
    LOG("TEST 2", "tool_calls:", choice?.message?.tool_calls ? "有" : "无", "(应为无)");
  } catch (err) {
    console.error("[FCTest] TEST 2 失败:", err.message);
  }

  LOG("");
  LOG("DONE", "协议验证完成!");
}

main().catch(err => { console.error("[FCTest] FAIL:", err.message); process.exit(1); });
