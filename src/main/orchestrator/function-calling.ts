// Function Calling — OpenAI 兼容的 function calling 循环
// 替代 LLM Router：模型自己决定调不调工具、调哪个、传什么参数
import { toolRegistry, ToolDefinition } from "./tool-registry";
import { ToolCallResult } from "./types";
import { checkPermission, ToolRiskLevel } from "../permission";

const LOG_PREFIX = "[FunctionCalling]";
const MAX_TOOL_ROUNDS = 5; // 最多 5 轮工具调用，防止死循环

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
}

/**
 * 将 ToolRegistry 中的工具转换为 OpenAI function calling 格式。
 */
function buildOpenAITools(): OpenAITool[] {
  const tools = toolRegistry.getEnabledTools();
  return tools.map(t => ({
    type: "function" as const,
    function: {
      name: t.id,
      description: t.description,
      parameters: {
        type: "object" as const,
        properties: t.inputSchema.properties,
        required: t.inputSchema.required,
      },
    },
  }));
}

/**
 * 执行一轮 function calling 循环。
 *
 * 流程：
 * 1. 发送 messages + tools 到 LLM
 * 2. 如果 LLM 返回 tool_calls → 执行工具 → 结果追加到 messages → 回到步骤 1
 * 3. 如果 LLM 返回文本 → 返回最终回复 + 所有工具执行结果
 *
 * @returns { reply, toolResults } — reply 是 LLM 的最终文本回复，toolResults 是本轮所有工具执行结果
 */
export async function runFunctionCallingLoop(
  settings: {
    baseUrl: string;
    model: string;
    apiKey: string;
  },
  messages: ChatMessage[],
  timeoutMs: number = 60000,
): Promise<{
  reply: string;
  toolResults: ToolCallResult[];
}> {
  const tools = buildOpenAITools();
  const allToolResults: ToolCallResult[] = [];
  const startTime = Date.now();

  console.log(LOG_PREFIX, "开始 Function Calling 循环");
  console.log(LOG_PREFIX, "可用工具:", tools.map(t => t.function.name).join(", ") || "(无)");
  console.log(LOG_PREFIX, "消息数:", messages.length, "最后一角色:", messages[messages.length - 1]?.role);

  // 深拷贝 messages，避免修改原始数组
  const conversation: ChatMessage[] = messages.map(m => ({ ...m }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const roundStart = Date.now();

    // 检查超时
    if (Date.now() - startTime > timeoutMs) {
      console.warn(LOG_PREFIX, "Function Calling 超时，在第 " + (round + 1) + " 轮退出");
      break;
    }

    console.log(LOG_PREFIX, "第 " + (round + 1) + " 轮 LLM 调用...");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs - (Date.now() - startTime));

    let response: Response;
    try {
      response = await fetch(buildUrl(settings.baseUrl), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: conversation,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? "auto" : undefined,
          temperature: 0.7,
          stream: false,
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(LOG_PREFIX, "LLM 请求失败 HTTP " + response.status + ":", errorText.slice(0, 300));
      throw new Error("模型请求失败：HTTP " + response.status + (errorText ? " — " + errorText.slice(0, 200) : ""));
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice) {
      console.error(LOG_PREFIX, "LLM 返回空 choices:", JSON.stringify(data).slice(0, 300));
      throw new Error("模型返回为空");
    }

    const msg = choice.message;
    const finishReason = choice.finish_reason;

    console.log(LOG_PREFIX, "第 " + (round + 1) + " 轮完成 finish_reason=" + finishReason + " 耗时=" + (Date.now() - roundStart) + "ms");

    // 情况1: 模型要调工具
    if (finishReason === "tool_calls" && msg?.tool_calls && msg.tool_calls.length > 0) {
      console.log(LOG_PREFIX, "模型请求调用 " + msg.tool_calls.length + " 个工具:", msg.tool_calls.map(tc => tc.function.name).join(", "));

      // 把 assistant 的 tool_calls 消息加入对话
      conversation.push({
        role: "assistant",
        content: msg.content || undefined,
        tool_calls: msg.tool_calls,
      });

      // 执行每个工具
      for (const tc of msg.tool_calls) {
        const toolId = tc.function.name;
        const tool = toolRegistry.getById(toolId);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          console.warn(LOG_PREFIX, "工具参数 JSON 解析失败:", tc.function.arguments?.slice(0, 100));
        }

        console.log(LOG_PREFIX, "执行工具:", toolId, JSON.stringify(args).slice(0, 200));

        let output: string;
        if (!tool || !tool.enabled) {
          output = "[错误] 工具不可用: " + toolId;
          console.warn(LOG_PREFIX, output);
        } else {
          // 权限网关：内置工具默认 safe，MCP 工具按其 risk 字段判定
          const risk: ToolRiskLevel = (tool as ToolDefinition & { risk?: ToolRiskLevel }).risk || "safe";
          const perm = await checkPermission({
            toolId,
            toolName: tool.name,
            toolDescription: tool.description,
            args,
            risk,
          });
          if (!perm.allowed) {
            output = "[已拒绝] " + (perm.reason || "权限不足");
            console.warn(LOG_PREFIX, "权限拒绝 [" + toolId + "]:", perm.reason);
          } else {
            try {
              output = await tool.execute(args);
              console.log(LOG_PREFIX, "工具返回 [" + toolId + "]:", output.slice(0, 200));
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              output = "[工具执行失败] " + errMsg;
              console.error(LOG_PREFIX, "工具执行失败 [" + toolId + "]:", errMsg);
            }
          }
        }

        allToolResults.push({ toolId, args, output });

        // 把 tool 结果加入对话
        conversation.push({
          role: "tool",
          tool_call_id: tc.id,
          name: toolId,
          content: output,
        });
      }

      // 继续下一轮
      continue;
    }

    // 情况2: 模型正常返回文本（可能 content 为 null 但 finish_reason 是 stop）
    const content = msg?.content || "";
    console.log(LOG_PREFIX, "Function Calling 完成，最终回复长度=" + content.length);
    return { reply: content, toolResults: allToolResults };
  }

  // 超过最大轮数，强制要求模型总结
  console.warn(LOG_PREFIX, "达到最大轮数 " + MAX_TOOL_ROUNDS + "，强制要求模型回复");
  conversation.push({
    role: "user",
    content: "请基于以上所有工具返回的信息，给出最终回复。不要继续调用工具。",
  });

  // 最后一轮不带 tools
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(buildUrl(settings.baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: conversation,
        temperature: 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error("最终回复请求失败：HTTP " + response.status);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || "";
    console.log(LOG_PREFIX, "强制回复完成，长度=" + content.length);
    return { reply: content, toolResults: allToolResults };
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed + "/chat/completions";
  return trimmed + "/v1/chat/completions";
}

