// 厂商适配器工厂：按 provider 显示名返回对应 transport 的 adapter 实例。
// 调度层只需 getAdapter(provider)，不关心 transport 细节。
import { OpenAICompatAdapter } from "./openai-adapter";
import { AnthropicAdapter } from "./anthropic-adapter";
import { getCapability, getCapabilityOrOpenAI, PROVIDER_CAPABILITIES } from "./capabilities";
import type {
  ChatMessage, ChatRequest, ChatResponse, ChatVendorAdapter, HttpRequest,
  ProviderCapability, TestConnectionResult, ToolCall, ToolExecutionResult,
  ToolSpec, VendorConfig,
} from "./types";

export type {
  ChatMessage, ChatRequest, ChatResponse, ChatVendorAdapter, HttpRequest,
  ProviderCapability, TestConnectionResult, ToolCall, ToolExecutionResult,
  ToolSpec, VendorConfig,
};
export { getCapability, getCapabilityOrOpenAI, PROVIDER_CAPABILITIES };

const cache = new Map<string, ChatVendorAdapter>();

/** 按 provider 显示名取适配器实例（同一 provider 复用同一实例）。 */
export function getAdapter(provider: string): ChatVendorAdapter {
  const existing = cache.get(provider);
  if (existing) return existing;
  const cap = getCapabilityOrOpenAI(provider);
  const adapter: ChatVendorAdapter =
    cap.transport === "anthropic"
      ? new AnthropicAdapter(cap.id, cap)
      : new OpenAICompatAdapter(cap.id, cap);
  cache.set(provider, adapter);
  return adapter;
}

/**
 * 厂商无关的 URL 构建器 —— 替代所有散落的 buildChatCompletionsUrl。
 * - OpenAI transport → {baseUrl}/chat/completions
 * - Anthropic transport → {baseUrl}/v1/messages（baseUrl 已含 /v1 时只加 /messages）
 */
export function buildVendorUrl(provider: string, baseUrl: string): string {
  const cap = getCapabilityOrOpenAI(provider);
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (cap.transport === "anthropic") {
    if (trimmed.endsWith("/messages")) return trimmed;
    if (trimmed.endsWith("/v1")) return `${trimmed}/messages`;
    return `${trimmed}/v1/messages`;
  }
  // OpenAI transport
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}
