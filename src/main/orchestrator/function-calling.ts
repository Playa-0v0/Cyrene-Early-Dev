// Function Calling —— 厂商无关的 function calling 循环
// 调度层只依赖 vendors adapter 的统一返回结构（buildRequest / parseResponse / appendToolResults），
// 绝不出现 if (provider === "xxx")。新厂商扩展只需在 capabilities.ts + 对应 transport adapter 里加一条。
import { toolRegistry, ToolDefinition } from "./tool-registry";
import { ToolCallResult } from "./types";
import { checkPermission, ToolRiskLevel } from "../permission";
import {
  getAdapter,
  getCapability,
  type ChatMessage,
  type ChatRequest,
  type ToolExecutionResult,
  type ToolSpec,
} from "./vendors";

const LOG_PREFIX = "[FunctionCalling]";
const MAX_TOOL_ROUNDS = 5; // 最多 5 轮工具调用，防止死循环

/**
 * 工具能力门控：列出"需要当前模型具备某种能力才允许执行"的工具。
 * 模型能力不足时直接返回 [错误]，不真正执行——
 * 让它落进 system.md 已覆盖的"工具报错"分支，触发如实告知，杜绝编造。
 * 将来给别的工具加能力要求，只需在这里加一行映射。
 */
const TOOL_CAPABILITY_GATE: Record<string, { capability: "vision"; reason: string }> = {
  read_image: {
    capability: "vision",
    reason: "当前模型不支持查看图片，无法使用 read_image。遇到图片问题请如实告诉用户你看不了。",
  },
};

/** 检查某工具在当前模型下是否被能力门控拦截。返回 null=放行，字符串=拒绝原因。 */
function gateByCapability(toolId: string, provider: string): string | null {
  const gate = TOOL_CAPABILITY_GATE[toolId];
  if (!gate) return null;
  const cap = getCapability(provider);
  const supportsVision = cap?.supportsVision ?? false;
  if (gate.capability === "vision" && !supportsVision) {
    return gate.reason;
  }
  return null;
}

/** 调度层传入的厂商配置（结构兼容 main/index.ts 的 ModelSettings，避免循环依赖）。 */
interface LoopSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 把 ToolRegistry 里的工具转成统一 ToolSpec（与 wire 格式解耦）。 */
function buildToolSpecs(): ToolSpec[] {
  return toolRegistry.getEnabledTools().map(t => ({
    name: t.id,
    description: t.description,
    parameters: {
      type: "object",
      properties: t.inputSchema.properties,
      required: t.inputSchema.required,
    },
  }));
}

/**
 * 执行一轮 function calling 循环（厂商无关）。
 *
 * 流程：
 * 1. adapter.buildRequest(messages + tools) → 发到 LLM
 * 2. adapter.parseResponse → 若有 toolCalls → 执行工具 → adapter.appendToolResults → 回到 1
 * 3. 若无 toolCalls → 返回最终文本 + 所有工具执行结果
 *
 * @returns { reply, toolResults }
 */
export async function runFunctionCallingLoop(
  settings: LoopSettings,
  messages: ChatMessage[],
  timeoutMs: number = 60000,
): Promise<{
  reply: string;
  toolResults: ToolCallResult[];
}> {
  const adapter = getAdapter(settings.provider);
  const tools = buildToolSpecs();
  const allToolResults: ToolCallResult[] = [];
  const startTime = Date.now();

  console.log(LOG_PREFIX, `provider=${settings.provider} transport=${adapter.transport} model=${settings.model}`);
  console.log(LOG_PREFIX, "可用工具:", tools.map(t => t.name).join(", ") || "(无)");
  console.log(LOG_PREFIX, "消息数:", messages.length, "最后一角色:", messages[messages.length - 1]?.role);

  let conversation: ChatMessage[] = messages.map(m => ({ ...m }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const roundStart = Date.now();

    if (Date.now() - startTime > timeoutMs) {
      console.warn(LOG_PREFIX, "Function Calling 超时，在第 " + (round + 1) + " 轮退出");
      break;
    }

    console.log(LOG_PREFIX, "第 " + (round + 1) + " 轮 LLM 调用...");

    let req: ChatRequest = {
      model: settings.model,
      messages: conversation,
      ...(tools.length > 0 ? { tools } : {}),
      temperature: 0.7,
      stream: false,
    };
    if (adapter.applyCacheHints) req = adapter.applyCacheHints(req, settings);

    const http = adapter.buildRequest(req, settings);
    console.log(LOG_PREFIX, "请求:", http.url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs - (Date.now() - startTime));
    let response: Response;
    try {
      response = await fetch(http.url, {
        method: "POST",
        signal: controller.signal,
        headers: http.headers,
        body: http.body,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(LOG_PREFIX, "LLM 请求失败 HTTP " + response.status + ":", errorText.slice(0, 300));
      throw new Error("模型请求失败：HTTP " + response.status + (errorText ? " — " + errorText.slice(0, 200) : ""));
    }

    const data = await response.json();
    const chat = adapter.parseResponse(data);

    console.log(
      LOG_PREFIX,
      "第 " + (round + 1) + " 轮完成 finish=" + chat.finishReason +
      " toolCalls=" + chat.toolCalls.length + " thinking=" + (chat.thinking ? "有" : "无") +
      " 耗时=" + (Date.now() - roundStart) + "ms",
    );

    // 把 assistant 消息加入对话（adapter 已保留 thinking / rawAssistant 供下轮回传）
    conversation.push(chat.assistantMessage);

    // 情况1：模型要调工具（按 toolCalls 数量判断，与 transport 无关）
    if (chat.toolCalls.length > 0) {
      console.log(
        LOG_PREFIX,
        "模型请求调用 " + chat.toolCalls.length + " 个工具:",
        chat.toolCalls.map(tc => tc.name).join(", "),
      );

      const execResults: ToolExecutionResult[] = [];
      for (const tc of chat.toolCalls) {
        const tool = toolRegistry.getById(tc.name);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments || "{}");
        } catch {
          console.warn(LOG_PREFIX, "工具参数 JSON 解析失败:", tc.arguments?.slice(0, 100));
        }

        console.log(LOG_PREFIX, "执行工具:", tc.name, JSON.stringify(args).slice(0, 200));

        let output: string;
        if (!tool || !tool.enabled) {
          output = "[错误] 工具不可用: " + tc.name;
          console.warn(LOG_PREFIX, output);
        } else {
          // 权限网关：内置工具默认 safe，MCP 工具按其 risk 字段判定
          const risk: ToolRiskLevel = (tool as ToolDefinition & { risk?: ToolRiskLevel }).risk || "safe";
          const perm = await checkPermission({
            toolId: tc.name,
            toolName: tool.name,
            toolDescription: tool.description,
            args,
            risk,
          });
          if (!perm.allowed) {
            output = "[已拒绝] " + (perm.reason || "权限不足");
            console.warn(LOG_PREFIX, "权限拒绝 [" + tc.name + "]:", perm.reason);
          } else {
            // 能力门控：某些工具需要当前模型具备特定能力（如视觉）。
            // 能力不足直接返回 [错误]，不执行——让 system.md 的"工具报错如实告知"规则接管。
            const gateReason = gateByCapability(tc.name, settings.provider);
            if (gateReason) {
              output = "[错误] " + gateReason;
              console.warn(LOG_PREFIX, "能力门控拦截 [" + tc.name + "]:", gateReason);
            } else {
              try {
                output = await tool.execute(args);
                console.log(LOG_PREFIX, "工具返回 [" + tc.name + "]:", output.slice(0, 200));
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                output = "[工具执行失败] " + errMsg;
                console.error(LOG_PREFIX, "工具执行失败 [" + tc.name + "]:", errMsg);
              }
            }
          }
        }

        allToolResults.push({ toolId: tc.name, args, output });
        execResults.push({ toolCall: tc, output });
      }

      // adapter 负责把 tool result 按各自协议回灌
      // （OpenAI: 多条 role:tool；Anthropic: 合并进 user 的 tool_result block）
      conversation = adapter.appendToolResults(conversation, execResults);
      continue;
    }

    // 情况2：模型正常返回文本
    const content = chat.text || "";
    console.log(LOG_PREFIX, "Function Calling 完成，最终回复长度=" + content.length);
    return { reply: content, toolResults: allToolResults };
  }

  // 超过最大轮数，强制要求模型总结（不带 tools）
  console.warn(LOG_PREFIX, "达到最大轮数 " + MAX_TOOL_ROUNDS + "，强制要求模型回复");
  conversation.push({
    role: "user",
    content: "请基于以上所有工具返回的信息，给出最终回复。不要继续调用工具。",
  });

  let finalReq: ChatRequest = {
    model: settings.model,
    messages: conversation,
    temperature: 0.7,
    stream: false,
  };
  if (adapter.applyCacheHints) finalReq = adapter.applyCacheHints(finalReq, settings);
  const http = adapter.buildRequest(finalReq, settings);
  console.log(LOG_PREFIX, "请求:", http.url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(http.url, {
      method: "POST",
      signal: controller.signal,
      headers: http.headers,
      body: http.body,
    });

    if (!response.ok) {
      throw new Error("最终回复请求失败：HTTP " + response.status);
    }

    const data = await response.json();
    const chat = adapter.parseResponse(data);
    console.log(LOG_PREFIX, "强制回复完成，长度=" + chat.text.length);
    return { reply: chat.text, toolResults: allToolResults };
  } finally {
    clearTimeout(timer);
  }
}
