// 厂商能力表 —— vendor adapter 的唯一事实来源。
// 每条字段以 docs/vendors/tool-calling-matrix.md 为准；matrix 没核实的留保守默认值。
// displayName 必须与 renderer settings.ts 的 MODEL_PRESETS.providerName 完全一致。
import { ProviderCapability } from "./types";

export const PROVIDER_CAPABILITIES: ProviderCapability[] = [
  {
    id: "minimax",
    displayName: "MiniMax（稀宇科技）",
    // 主推 Anthropic 兼容入口；多轮 tool_calls 必须完整回传 thinking/reasoning_details
    transport: "anthropic",
    baseUrl: "https://api.minimaxi.com/anthropic",
    authStyle: "x-api-key",
    defaultModel: "MiniMax-M3",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "thinking",
    cacheStrategy: "cache_control",
    testStrategy: "text",
  },
  {
    id: "deepseek",
    displayName: "DeepSeek（深度求索）",
    transport: "openai",
    baseUrl: "https://api.deepseek.com",
    authStyle: "bearer",
    defaultModel: "deepseek-v4-pro",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "reasoning_content",
    cacheStrategy: "auto",
    testStrategy: "text",
  },
  {
    id: "volcengine",
    displayName: "火山 AgentPlan（火山引擎）",
    // OpenAI 兼容 + 专属 baseUrl + 可选 reasoning_content；不为它单独写 transport
    transport: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
    authStyle: "bearer",
    defaultModel: "ark-code-latest",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "reasoning_content",
    cacheStrategy: "none",
    testStrategy: "text",
  },
  {
    id: "glm",
    displayName: "GLM（智谱）",
    transport: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    authStyle: "bearer",
    defaultModel: "glm-5.2",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "reasoning_content",
    cacheStrategy: "auto",
    testStrategy: "text",
  },
  {
    id: "kimi",
    displayName: "Kimi（月之暗面）",
    // OpenAI 兼容 + prompt_cache_key + function.name 正则限制；baseUrl 必须是 .cn
    transport: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    authStyle: "bearer",
    defaultModel: "kimi-k2.7-code",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "thinking",
    cacheStrategy: "prompt_cache_key",
    testStrategy: "text",
  },
  {
    id: "qwen",
    displayName: "Qwen（通义千问）",
    transport: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    authStyle: "bearer",
    defaultModel: "qwen-max",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "reasoning_content",
    cacheStrategy: "auto",
    testStrategy: "text",
  },
  {
    id: "chatgpt",
    displayName: "ChatGPT（OpenAI）",
    transport: "openai",
    baseUrl: "https://api.openai.com/v1",
    authStyle: "bearer",
    defaultModel: "",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "reasoning_content",
    cacheStrategy: "auto",
    testStrategy: "text",
  },
  {
    id: "claude",
    displayName: "Claude（Anthropic）",
    transport: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authStyle: "x-api-key",
    defaultModel: "",
    supportsTools: true,
    supportsThinking: true,
    thinkingField: "thinking",
    cacheStrategy: "cache_control",
    testStrategy: "text",
    disabled: true,
  },
];

const byDisplayName = new Map(PROVIDER_CAPABILITIES.map(c => [c.displayName, c]));

export function getCapability(provider: string): ProviderCapability | undefined {
  return byDisplayName.get(provider);
}

/** 兜底：未知厂商按 OpenAI 兼容处理（保守可用），避免直接崩。 */
export function getCapabilityOrOpenAI(provider: string): ProviderCapability {
  return byDisplayName.get(provider) ?? {
    id: "unknown",
    displayName: provider,
    transport: "openai",
    baseUrl: "",
    authStyle: "bearer",
    defaultModel: "",
    supportsTools: true,
    supportsThinking: false,
    thinkingField: null,
    cacheStrategy: "none",
    testStrategy: "text",
  };
}
