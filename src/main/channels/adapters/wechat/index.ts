// WeChat ChannelAdapter —— 对接 OpenClaw Gateway ACP 协议。
//
// 架构：
//   微信用户发消息
//     └─ OpenClaw Gateway（weixin plugin 长轮询）
//           └─ GatewayACPClient（onInbound 事件）
//                 └─ manager.handleIncoming(msg) → dispatcher → buildAndRunAgent
//                       └─ 返回 OutgoingMessage
//                             └─ adapter.send(outgoing) → sendWeixinMessage()
//                               → Gateway message.action → weixin plugin → 微信
//
// Session 隔离（同飞书）：channel:wechat:<sha256(wechat:senderId).slice(0,16)>
// 历史拼接：Phase A + loadRecentHistory，dispatcher 内部处理。
import { createHash } from "node:crypto";
import type {
  ChannelCapability,
  ChannelId,
  ChannelStatus,
  IncomingMessage,
  MessageHandler,
  OutgoingMessage,
} from "../../types";
import type { ChannelAdapter } from "../base";
import { setAdapterHandler } from "../base";
import { GatewayACPClient, type GatewayACPClientOptions } from "./gateway-acp-client";

const LOG_PREFIX = "[WeChatAdapter]";

// ─────────────────────────────────────────────────────────────────
// Capability
// ─────────────────────────────────────────────────────────────────

const CAPABILITY: ChannelCapability = {
  text: true,
  image: true,
  audio: true,   // weixin 支持语音（silk 格式，需 silk-wasm 转）
  file: false,
  video: false,
  markdown: false,
  card: false,
  sticker: false,
  maxTextLength: 2048,
};

// ─────────────────────────────────────────────────────────────────
// WeChatChannelAdapter
// ─────────────────────────────────────────────────────────────────

export interface WeChatAdapterOptions {
  gatewayUrl?: string;
  gatewayToken?: string;
}

/** @deprecated use WeChatChannelAdapter */
export class WeChatChannelAdapter implements ChannelAdapter {
  readonly id: ChannelId = "wechat";
  readonly displayName = "微信";
  readonly capability = CAPABILITY;

  onMessage: MessageHandler | null = null;

  private opts: WeChatAdapterOptions;
  private client: GatewayACPClient | null = null;
  private status: ChannelStatus = { enabled: false, phase: "offline" };

  constructor(opts: WeChatAdapterOptions = {}) {
    this.opts = opts;
  }

  // ── ChannelAdapter ──────────────────────────────────────────────

  async start(): Promise<void> {
    this.status = { enabled: true, phase: "starting" };
    console.log(LOG_PREFIX, "Starting...");

    const gatewayUrl = this.opts.gatewayUrl ?? "ws://127.0.0.1:18789";
    const gatewayToken = this.opts.gatewayToken ?? "";

    const clientOpts: GatewayACPClientOptions = {
      gatewayUrl,
      token: gatewayToken,
      clientName: "Cyrene",
      clientVersion: "1.0.0",
      onInbound: (wxMsg) => this.#handleInbound(wxMsg),
    };

    this.client = new GatewayACPClient(clientOpts);

    try {
      const features = await this.client.connect();
      const channelsStatus = await this.client.getChannelsStatus();

      console.log(LOG_PREFIX, "Gateway connected. methods:", features?.methods?.length ?? 0);
      console.log(LOG_PREFIX, "Channels status:", JSON.stringify(channelsStatus).slice(0, 300));

      this.status = {
        enabled: true,
        phase: "running",
        message: "已连接 OpenClaw Gateway",
        detail: { gatewayUrl, methods: features?.methods?.length ?? 0 },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(LOG_PREFIX, "Gateway 连接失败:", msg);
      this.status = {
        enabled: true,
        phase: "error",
        message: "Gateway 连接失败: " + msg,
      };
    }
  }

  async stop(): Promise<void> {
    console.log(LOG_PREFIX, "Stopping...");
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.status = { enabled: false, phase: "offline" };
  }

  async send(msg: OutgoingMessage): Promise<{ ok: boolean; error?: string }> {
    if (!this.client) return { ok: false, error: "Gateway 未连接" };

    // 文本
    const textParts = msg.parts.filter((p) => p.kind === "text");
    const imageParts = msg.parts.filter((p) => p.kind === "image");
    const audioParts = msg.parts.filter((p) => p.kind === "audio");

    if (textParts.length > 0) {
      const text = textParts.map((p) => p.text).join("");
      const result = await this.client.sendWeixinMessage(msg.targetId, text);
      if (!result.ok) return result;
    }

    // 图片
    for (const p of imageParts) {
      const mediaUrl = p.filePath ?? p.url ?? "";
      if (!mediaUrl) continue;
      const result = await this.client.sendWeixinMedia(msg.targetId, mediaUrl, p.caption);
      if (!result.ok) return result;
    }

    // 语音（weixin 语音消息，用本地文件路径）
    for (const p of audioParts) {
      const result = await this.client.sendWeixinMedia(msg.targetId, p.filePath);
      if (!result.ok) return result;
    }

    return { ok: true };
  }

  getStatus(): ChannelStatus {
    return this.status;
  }

  // ── Internal ───────────────────────────────────────────────────

  #handleInbound(wxMsg: {
    senderId: string;
    senderName?: string;
    text: string;
    attachments?: Array<{ mediaType: string; url: string; filename?: string }>;
    sessionKey: string;
  }): void {
    if (!wxMsg.text?.trim() && !wxMsg.attachments?.length) return;
    if (!this.onMessage) return;

    const incoming: IncomingMessage = {
      channel: "wechat",
      senderId: wxMsg.senderId,
      senderName: wxMsg.senderName,
      chatId: wxMsg.senderId,
      text: wxMsg.text ?? "",
      at: new Date(),
      _raw: wxMsg,
    };

    if (wxMsg.attachments?.length) {
      incoming.attachments = wxMsg.attachments.map((a) => ({
        kind: this.#mediaKind(a.mediaType),
        url: a.url,
        mime: a.mediaType,
      }));
    }

    // 调用 manager → dispatcher → buildAndRunAgent → 返回 OutgoingMessage → adapter.send()
    void this.onMessage(incoming);
  }

  #mediaKind(mime: string): "image" | "audio" | "file" | "video" {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    return "file";
  }
}
