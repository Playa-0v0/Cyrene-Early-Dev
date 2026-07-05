// Transport detection —— 根据 baseUrl 启发式判断走 OpenAI 还是 Anthropic 协议。
//
// 设计动机：之前 transport 由 provider 名 → capabilities 表硬编码，
// 用户在 settings 改 baseUrl 不会影响 dispatch 行为（典型 bug：MiniMax 填 /v1 时仍走 anthropic 端点）。
// 现在三段优先级：
//   1. 用户显式 explicitTransport（settings UI 高级选项）
//   2. baseUrl 启发式（detectTransport）
//   3. capabilities 表默认（旧 fallback，兼容现有 8 家预设）
//
// 启发式规则：
//   - 路径含 /anthropic 或 /v1/messages → anthropic
//   - 路径含 /chat/completions 或 /completions → openai
//   - 仅以 /v1 结尾 → openai（绝大多数 OpenAI 兼容入口用这个后缀）
//   - 其他 → null，让调用方 fallback

import type { Transport } from "./types";
import { getCapabilityOrOpenAI } from "./capabilities";

/**
 * 根据 baseUrl 路径形态判断 transport；无法判断时返回 null。
 * 纯函数，便于单测。
 */
export function detectTransport(baseUrl: string): Transport | null {
  const t = baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  if (!t) return null;
  // Anthropic 端点路径关键字
  if (/\/anthropic($|\/)|\/v1\/messages($|\?)/.test(t)) return "anthropic";
  // OpenAI 端点路径关键字
  if (/\/chat\/completions($|\?)|\/completions($|\?)|\/v1\/chat/.test(t)) return "openai";
  // 仅以 /v1 结尾 → 启发式判为 openai
  if (t.endsWith("/v1")) return "openai";
  return null;
}

/**
 * 三段优先级解析 transport。调用方（getAdapterForConfig）使用。
 *  - explicitTransport = "openai" | "anthropic" → 用户强制
 *  - explicitTransport = "auto" | undefined → 走 detectTransport → fallback capabilities
 */
export function resolveTransport(cfg: {
  baseUrl: string;
  explicitTransport?: Transport | "auto" | undefined;
  provider: string;
}): Transport {
  if (cfg.explicitTransport === "openai" || cfg.explicitTransport === "anthropic") {
    return cfg.explicitTransport;
  }
  // auto 或 undefined 都走检测 + fallback
  return detectTransport(cfg.baseUrl) ?? getCapabilityOrOpenAI(cfg.provider).transport;
}