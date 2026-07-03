// Gateway ACP Client —— 通过 WebSocket 连接 OpenClaw Gateway，处理协议通信。
//
// 协议帧格式（JSON-RPC over WebSocket）：
//   入站: { type: "event", event: "...", payload: {...} }
//   出站: { type: "req", id: "...", method: "...", params: {...} }
//   响应: { type: "res", id: "...", ok: true|false, payload: {...} }
//
// 连接流程：
//   1. connect.challenge 事件（nonce + ts）
//   2. 发送 connect req
//   3. 收到 hello-ok，features.methods 包含所有可用 RPC
//   4. 注册 ACP runtime backend
//   5. 正常 RPC 调用 / 事件订阅
//
// 本模块不依赖 electron，只做 WebSocket + JSON-RPC。
import { randomUUID } from "node:crypto";
import type { CyreneAcpRuntime } from "./cyrene-acp-runtime";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName: string;
    version: string;
    platform: string;
    mode: "backend" | "cli" | "node" | "ui" | "webchat" | "test" | "probe";
    instanceId?: string;
  };
  caps?: string[];
  auth?: { token?: string; bootstrapToken?: string; password?: string; deviceToken?: string };
  scopes?: string[];
}

interface HelloOk {
  type: "hello-ok";
  protocol: number;
  server: { version: string; connId: string };
  features: { methods: string[]; events: string[] };
}

interface RpcRequest {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

interface RpcResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

interface GatewayEvent {
  type: "event";
  event: string;
  payload?: unknown;
}

type IncomingFrame = RpcResponse | GatewayEvent | { type: "connect.challenge"; payload: { nonce: string; ts: number } };

// ─────────────────────────────────────────────────────────────────
// GatewayACPClient
// ─────────────────────────────────────────────────────────────────

export interface GatewayACPClientOptions {
  gatewayUrl: string;
  token: string;
  clientName?: string;
  clientVersion?: string;
  /** 收到 weixin 入站消息时回调（channel + senderId + text + attachments） */
  onInbound?: (msg: {
    channel: string;
    accountId: string;
    senderId: string;
    senderName?: string;
    text: string;
    attachments?: Array<{ mediaType: string; url: string; filename?: string }>;
    sessionKey: string;
  }) => void;
}

export class GatewayACPClient {
  private ws: WebSocket | null = null;
  private opts: GatewayACPClientOptions;
  private reqId = 0;
  private pending = new Map<string, (res: RpcResponse) => void>();
  private connected = false;
  private methods: string[] = [];
  private events: string[] = [];
  private acpRuntime: CyreneAcpRuntime | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(opts: GatewayACPClientOptions) {
    this.opts = opts;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * 连接 Gateway，发送 connect 帧，等待 hello-ok。
   * 连接成功后返回 hello-ok 中的 features。
   */
  async connect(): Promise<HelloOk["features"]> {
    const { gatewayUrl, token, clientName = "Cyrene", clientVersion = "1.0.0" } = this.opts;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(gatewayUrl);

      this.ws.addEventListener("open", () => {
        // Step 1: 发送 connect req
        this.#sendReq("connect", {
          minProtocol: 1,
          maxProtocol: 20,
          client: {
            id: "gateway-client",
            displayName: clientName,
            version: clientVersion,
            platform: "win32",
            mode: "backend",
          },
          auth: { token },
          caps: ["agent", "sessions.send", "channels.message_action", "operator.write"],
        });
      });

      this.ws.addEventListener("message", (ev) => {
        let frame: IncomingFrame;
        try {
          frame = JSON.parse(ev.data as string) as IncomingFrame;
        } catch {
          return;
        }

        // Step 2: connect.challenge（无需响应，由 auth.token 处理）
        if (frame.type === "connect.challenge") return;

        // Step 3: hello-ok
        if (frame.type === "res" && frame.id === String(this.reqId) && frame.ok && (frame.payload as HelloOk)?.type === "hello-ok") {
          const hello = frame.payload as HelloOk;
          this.methods = hello.features?.methods ?? [];
          this.events = hello.features?.events ?? [];
          this.connected = true;
          console.log(`[GatewayACP] Connected! methods=${this.methods.length} events=${this.events.length}`);
          this.#startHeartbeat();
          resolve(hello.features);
          return;
        }

        // RPC 响应
        if (frame.type === "res" && frame.id) {
          const cb = this.pending.get(frame.id);
          if (cb) {
            this.pending.delete(frame.id);
            cb(frame);
          }
          return;
        }

        // Gateway 事件（session.message = weixin inbound）
        if (frame.type === "event") {
          const evt = frame as GatewayEvent;
          this.#handleEvent(evt.event, evt.payload);
        }
      });

      this.ws.addEventListener("error", (e) => {
        console.error("[GatewayACP] WebSocket error:", e);
        if (!this.connected) reject(new Error("Connection failed"));
      });

      this.ws.addEventListener("close", (ev) => {
        console.log(`[GatewayACP] Closed code=${ev.code} reason=${ev.reason}`);
        this.#cleanup();
        if (!this.closed) {
          // 非主动关闭则自动重连（5s 后）
          setTimeout(() => {
            if (!this.closed) this.connect().catch(console.error);
          }, 5000);
        }
      });
    });
  }

  /**
   * 注册 Cyrene ACP Runtime 到 OpenClaw。
   * Gateway 收到 weixin 消息后会路由到注册的 backend。
   */
  registerAcpRuntime(runtime: CyreneAcpRuntime): void {
    this.acpRuntime = runtime;
  }

  /**
   * 发送消息到微信。
   * @param to 目标用户/群 id
   * @param text 文本内容
   * @param accountId 微信账号 id（可选，默认用第一个已配置的）
   */
  async sendWeixinMessage(to: string, text: string, accountId?: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const params: Record<string, unknown> = {
      channel: "openclaw-weixin",
      action: "send",
      params: { to, message: text },
      idempotencyKey: randomUUID(),
      ...(accountId ? { accountId } : {}),
    };

    try {
      const res = await this.#callRpc("message.action", params);
      if (res.ok) {
        return { ok: true, messageId: (res.payload as { messageId?: string })?.messageId };
      }
      return { ok: false, error: (res.error as { message?: string })?.message ?? "Unknown error" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /**
   * 发送图片/文件到微信。
   * @param to 目标用户/群 id
   * @param mediaUrl 本地文件路径或远程 URL
   * @param text 可选的文本 caption
   */
  async sendWeixinMedia(
    to: string,
    mediaUrl: string,
    text?: string,
    accountId?: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const params: Record<string, unknown> = {
      channel: "openclaw-weixin",
      action: "send",
      params: {
        message: text ?? "",
        mediaUrl,
        to,
        ...(accountId ? { accountId } : {}),
      },
      idempotencyKey: randomUUID(),
    };

    try {
      const res = await this.#callRpc("message.action", params);
      if (res.ok) {
        return { ok: true, messageId: (res.payload as { messageId?: string })?.messageId };
      }
      return { ok: false, error: (res.error as { message?: string })?.message ?? "Unknown error" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /** 查询渠道状态 */
  async getChannelsStatus(): Promise<unknown> {
    const res = await this.#callRpc("channels.status", {});
    return res.payload;
  }

  /** 主动关闭连接 */
  async disconnect(): Promise<void> {
    this.closed = true;
    this.#cleanup();
    if (this.ws) {
      this.ws.close(1000, "client disconnect");
      this.ws = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────

  #sendReq(method: string, params: unknown, id?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const req: RpcRequest = {
      type: "req",
      id: id ?? String(++this.reqId),
      method,
      params,
    };
    this.ws.send(JSON.stringify(req));
  }

  async #callRpc(method: string, params: unknown): Promise<RpcResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { type: "res", id: "", ok: false, error: { code: "NOT_CONNECTED", message: "Not connected" } };
    }
    const id = String(++this.reqId);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.#sendReq(method, params, id);
      // 10s 超时
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ type: "res", id, ok: false, error: { code: "TIMEOUT", message: "Request timeout" } });
        }
      }, 10000);
    });
  }

  #startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.#callRpc("health", {}).catch(() => {});
    }, 30000);
  }

  #cleanup(): void {
    this.connected = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const cb of this.pending.values()) {
      cb({ type: "res", id: "", ok: false, error: { code: "CLOSED", message: "Connection closed" } });
    }
    this.pending.clear();
  }

  #handleEvent(event: string, payload?: unknown): void {
    if (event === "agent" || event === "session.message") {
      this.#handleAgentEvent(payload as Record<string, unknown>);
    }
  }

  /** 处理 agent/session.message 事件——这些包含 weixin 入站消息 */
  #handleAgentEvent(payload: Record<string, unknown>): void {
    const msg = payload as {
      channel?: string;
      accountId?: string;
      from?: string;
      sender?: string;
      senderName?: string;
      text?: string;
      message?: string;
      content?: string;
      attachments?: Array<{ mediaType: string; url: string; filename?: string }>;
      sessionKey?: string;
    };

    // 只处理 weixin 消息
    if (msg.channel !== "openclaw-weixin") return;

    const text = msg.text ?? msg.message ?? msg.content ?? "";
    const sessionKey = msg.sessionKey ?? `agent:main:wechat:${msg.from ?? msg.sender ?? ""}`;

    console.log(`[GatewayACP] WeChat inbound: from=${msg.sender ?? msg.from} text=${text.slice(0, 100)}`);

    this.opts.onInbound?.({
      channel: "wechat",
      accountId: msg.accountId ?? "",
      senderId: msg.from ?? msg.sender ?? "",
      senderName: msg.senderName,
      text,
      attachments: msg.attachments,
      sessionKey,
    });
  }
}
