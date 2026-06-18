// 厂商工具调用适配层 —— 统一类型
// 调度层（function-calling.ts）只依赖这里的统一结构，绝不出现 if (provider === "xxx")。
// 协议事实来源：docs/vendors/tool-calling-matrix.md

export type Transport = "openai" | "anthropic";
export type AuthStyle = "bearer" | "x-api-key";
export type ThinkingField = "reasoning_content" | "thinking" | "reasoning_details" | null;
export type CacheStrategy = "prompt_cache_key" | "cache_control" | "auto" | "none";
export type TestStrategy = "text" | "text+tool";

/** 调度层传入适配器的厂商运行时配置（结构兼容 main/index.ts 的 ModelSettings）。 */
export interface VendorConfig {
  provider: string; // 厂商显示名，如 "MiniMax（稀宇科技）"，与 capability 表的 displayName 对齐
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 统一工具调用描述（项目内部），与 OpenAI/Anthropic wire 格式解耦。 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON 字符串，沿用 OpenAI 习惯
}

/**
 * 统一消息结构。两个 transport 各自只读自己需要的字段，调度层透传。
 * - OpenAI transport 读 content / toolCalls / toolCallId / name
 * - Anthropic transport 额外读 thinking / rawAssistant（多轮必须原样回传 content block 数组）
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  /** assistant 上的工具调用（统一结构，OpenAI wire 再转成 tool_calls[].function）。 */
  toolCalls?: ToolCall[];
  /** role:"tool" 的回填锚点（OpenAI: tool_call_id；Anthropic: tool_use_id）。 */
  toolCallId?: string;
  name?: string;
  /** 思考/推理纯文本（reasoning_content / thinking block 抽出来）。 */
  thinking?: string;
  /** Anthropic 多轮必须原样回传 assistant.content block 数组；OpenAI transport 不读。 */
  rawAssistant?: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: object; // JSON Schema
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  stream?: boolean;
  /** 透传到请求体顶层的厂商扩展字段（如 Kimi 的 prompt_cache_key）。 */
  extraBody?: Record<string, unknown>;
}

/** 适配器解析后的统一响应，调度层只看这个。 */
export interface ChatResponse {
  /** 要追加进对话的 assistant 消息（保留 thinking / rawAssistant 供下轮回传）。 */
  assistantMessage: ChatMessage;
  text: string;
  thinking?: string;
  toolCalls: ToolCall[];
  finishReason: string;
  raw: unknown;
}

export interface HttpRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface ToolExecutionResult {
  toolCall: ToolCall;
  output: string;
}

export interface TestConnectionResult {
  ok: boolean;
  latency: number;
  sample?: string;
  error?: string;
}

/**
 * 厂商能力表的一条记录。是 vendor adapter 的"事实来源"，
 * 避免 function-calling.ts 里散落 if (provider === "kimi")。
 */
export interface ProviderCapability {
  id: string;
  displayName: string;
  transport: Transport;
  baseUrl: string;
  authStyle: AuthStyle;
  defaultModel: string;
  supportsTools: boolean;
  supportsThinking: boolean;
  thinkingField: ThinkingField;
  cacheStrategy: CacheStrategy;
  testStrategy: TestStrategy;
  /** 是否支持视觉（图片）输入。非多模态模型禁止走 read_image。 */
  supportsVision: boolean;
  /**
   * 视觉模型的 OpenAI 兼容 baseUrl。仅当主聊天走 Anthropic 入口、视觉需走 OpenAI 入口时才需要标
   * （如 MiniMax 主配 /anthropic，视觉要走 /v1）。不标 = 视觉用主配置 baseUrl。
   */
  visionBaseUrl?: string;
  /** UI 是否允许选择（Claude 等 Anthropic adapter 未就绪前先禁用）。 */
  disabled?: boolean;
}

/** 调度层只看到这一层接口。 */
export interface ChatVendorAdapter {
  readonly id: string;
  readonly transport: Transport;
  capability: ProviderCapability;
  buildRequest(req: ChatRequest, cfg: VendorConfig): HttpRequest;
  parseResponse(raw: unknown): ChatResponse;
  appendToolResults(messages: ChatMessage[], results: ToolExecutionResult[]): ChatMessage[];
  applyCacheHints?(req: ChatRequest, cfg: VendorConfig): ChatRequest;
  testConnection(cfg: VendorConfig): Promise<TestConnectionResult>;
}
