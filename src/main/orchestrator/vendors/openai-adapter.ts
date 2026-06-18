// OpenAI 兼容 transport —— 覆盖 火山 AgentPlan / DeepSeek / GLM / Kimi / Qwen / ChatGPT
// 请求体协议：POST {baseUrl}/chat/completions，messages + tools[].type=function
import {
  ChatMessage, ChatRequest, ChatResponse, ChatVendorAdapter,
  HttpRequest, ProviderCapability, TestConnectionResult, ToolCall,
  ToolExecutionResult, VendorConfig,
} from "./types";

function buildUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** 把统一消息翻译成 OpenAI wire messages。 */
function toWireMessages(messages: ChatMessage[]): unknown[] {
  return messages.map(m => {
    if (m.role === "system") return { role: "system", content: m.content ?? "" };
    if (m.role === "user") return { role: "user", content: m.content ?? "" };
    if (m.role === "tool") {
      const wire: Record<string, unknown> = {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content ?? "",
      };
      if (m.name) wire.name = m.name;
      return wire;
    }
    // assistant：回传 content + tool_calls（OpenAI 多轮要求 assistant 消息带 tool_calls）
    const wire: Record<string, unknown> = { role: "assistant", content: m.content || null };
    if (m.toolCalls && m.toolCalls.length > 0) {
      wire.tool_calls = m.toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    return wire;
  });
}

function toWireTools(tools?: ChatRequest["tools"]): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export class OpenAICompatAdapter implements ChatVendorAdapter {
  readonly transport = "openai" as const;
  constructor(public readonly id: string, public capability: ProviderCapability) {}

  buildRequest(req: ChatRequest, cfg: VendorConfig): HttpRequest {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toWireMessages(req.messages),
      stream: req.stream ?? false,
    };
    // temperature 只在调用方显式传时才塞进 body。
    // 不传时让厂商用默认值——不同型号约束不同（如 Kimi k2.6 只允许 1），
    // 硬编码兜底值会在某些模型上报错。
    if (req.temperature !== undefined) body.temperature = req.temperature;
    const tools = toWireTools(req.tools);
    if (tools) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    if (req.extraBody) Object.assign(body, req.extraBody);
    return {
      url: buildUrl(cfg.baseUrl),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    };
  }

  parseResponse(raw: unknown): ChatResponse {
    const data = raw as {
      choices?: Array<{
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          reasoning_content?: string;
          thinking?: string;
        };
        finish_reason?: string;
      }>;
    };
    const choice = data.choices?.[0];
    const msg = choice?.message;
    const text = msg?.content ?? "";
    const thinking = msg?.reasoning_content || msg?.thinking || undefined;

    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: text,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(thinking ? { thinking } : {}),
    };

    return {
      assistantMessage,
      text,
      thinking,
      toolCalls,
      finishReason: choice?.finish_reason ?? "stop",
      raw,
    };
  }

  appendToolResults(messages: ChatMessage[], results: ToolExecutionResult[]): ChatMessage[] {
    const next = messages.slice();
    for (const r of results) {
      next.push({
        role: "tool",
        toolCallId: r.toolCall.id,
        name: r.toolCall.name,
        content: r.output,
      });
    }
    return next;
  }

  // Kimi：多轮 Agent 强烈建议传 prompt_cache_key（命中后 usage.cached_tokens 体现）。
  // v1 用"厂商+模型"稳定 key 缓存 system/工具定义；v2 可换成会话级 key。
  applyCacheHints(req: ChatRequest, _cfg: VendorConfig): ChatRequest {
    if (this.capability.cacheStrategy !== "prompt_cache_key") return req;
    const extraBody = { ...(req.extraBody ?? {}), prompt_cache_key: `cyrene:${this.id}` };
    return { ...req, extraBody };
  }

  async testConnection(cfg: VendorConfig): Promise<TestConnectionResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const req: ChatRequest = {
        model: cfg.model,
        messages: [{ role: "user", content: "ping，请只回复两个字符：ok" }],
        // 不传 temperature：某些模型（如 Kimi k2.6）只允许特定值，传 0 会报错
        stream: false,
      };
      const http = this.buildRequest(req, cfg);
      const res = await fetch(http.url, {
        method: "POST",
        signal: controller.signal,
        headers: http.headers,
        body: http.body,
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, latency, error: `HTTP ${res.status} ${t.slice(0, 200)}` };
      }
      const data = await res.json();
      const parsed = this.parseResponse(data);
      return { ok: true, latency, sample: parsed.text.slice(0, 80) || "(空回复)" };
    } catch (e) {
      return { ok: false, latency: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(timer);
    }
  }
}
