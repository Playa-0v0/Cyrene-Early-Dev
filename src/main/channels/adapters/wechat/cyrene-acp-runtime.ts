// Cyrene ACP Runtime —— 实现 OpenClaw 的 AcpRuntime 接口。
//
// 注册方式（深度集成时使用）：
//   import { registerAcpRuntimeBackend } from "openclaw/dist/plugin-sdk/acp-runtime";
//   registerAcpRuntimeBackend({ id: "cyrene", runtime: new CyreneAcpRuntime(deps) });
import type {
  AcpRuntime,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeStatus,
  AcpRuntimeTurnInput,
} from "openclaw/dist/plugin-sdk/packages/acp-core/src/runtime/types";

export interface CyreneAcpDeps {
  buildAndRunAgent: (params: {
    sessionKey: string;
    text: string;
    attachments?: Array<{ mediaType: string; data: string }>;
  }) => Promise<{
    reply: string;
    toolResults: Array<{ toolId: string; args: unknown; output: string }>;
  }>;
}

interface Session {
  handle: AcpRuntimeHandle;
  createdAt: number;
}

const sessions = new Map<string, Session>();

export class CyreneAcpRuntime implements AcpRuntime {
  readonly #id = "cyrene";
  readonly #deps: CyreneAcpDeps;

  constructor(deps: CyreneAcpDeps) {
    this.#deps = deps;
  }

  async ensureSession(input: AcpRuntimeEnsureInput): Promise<AcpRuntimeHandle> {
    const { sessionKey } = input;
    const existing = sessions.get(sessionKey);
    if (existing) return existing.handle;

    const handle: AcpRuntimeHandle = {
      sessionKey,
      backend: this.#id,
      runtimeSessionName: `cyrene:${sessionKey}`,
    };
    sessions.set(sessionKey, { handle, createdAt: Date.now() });
    console.log(`[CyreneAcpRuntime] ensureSession: ${sessionKey}`);
    return handle;
  }

  // async generator = 天然 AsyncIterable，不需要手动构造
  async *runTurn(input: AcpRuntimeTurnInput): AsyncGenerator<AcpRuntimeEvent> {
    const sessionKey = input.handle.sessionKey;
    const { text, attachments = [] } = input;

    yield { type: "status", text: "Thinking..." };

    try {
      const result = await this.#deps.buildAndRunAgent({ sessionKey, text, attachments });

      const sentences = result.reply.split(/(?<=[。！？；\n])/);
      for (const s of sentences) {
        if (s.trim()) yield { type: "text_delta", text: s, stream: "output" };
      }

      for (const tr of result.toolResults) {
        yield {
          type: "tool_call",
          text: `${tr.toolId}: ${tr.output.slice(0, 200)}`,
          tag: "tool_call",
          toolCallId: tr.toolId,
          status: "completed",
        };
      }

      yield { type: "done", stopReason: "stop" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", message: msg };
      yield { type: "done", stopReason: "failed" };
    }
  }

  getCapabilities(): { controls: Array<"session/set_mode" | "session/set_config_option" | "session/status"> } {
    return { controls: ["session/set_mode", "session/status"] };
  }

  async getStatus(input: { handle: AcpRuntimeHandle }): Promise<AcpRuntimeStatus> {
    const session = sessions.get(input.handle.sessionKey);
    const elapsed = session ? ((Date.now() - session.createdAt) / 1000).toFixed(0) : "0";
    return { summary: `Active ${elapsed}s`, details: { backend: this.#id } };
  }

  async cancel(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void> {
    console.log(`[CyreneAcpRuntime] cancel: ${input.handle.sessionKey} reason=${input.reason ?? ""}`);
  }

  async close(input: { handle: AcpRuntimeHandle; reason: string; discardPersistentState?: boolean }): Promise<void> {
    console.log(`[CyreneAcpRuntime] close: ${input.handle.sessionKey} reason=${input.reason}`);
    if (input.discardPersistentState) sessions.delete(input.handle.sessionKey);
  }
}
