// iLink Protocol Client —— 直接打微信 iLink Bot API 的 HTTP 协议客户端。
// 零依赖（只用 Node 22 内置 fetch + crypto.randomUUID），不走任何 ESM SDK。
//
// 参考实现：
//   - weclaw (Go): github.com/fastclaw-ai/weclaw
//   - 协议文档:    https://www.wechatbot.dev/zh/protocol
//
// Base URL: https://ilinkai.weixin.qq.com + /ilink/bot/...
// weclaw (Go): github.com/fastclaw-ai/weclaw
// 协议文档:    https://www.wechatbot.dev/zh/protocol
const BASE_URL = "https://ilinkai.weixin.qq.com";
const LONG_POLL_TIMEOUT_MS = 35_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ItemType = 1 | 2 | 3 | 4 | 5;  // text|image|voice|file|video
export type MessageType = 1;               // 摘要只描述了 user→bot 类型

export interface Credentials {
  botToken: string;
  ilinkBotId: string;
  baseUrl: string;            // 一般就是 BASE_URL
  ilinkUserId: string;
  /** 显示用的账号 id（用 ilinkBotId @ 之前的一段，或完整） */
  accountId?: string;
}

/** 入站消息（已展开成单一形状） */
export interface WeixinMessage {
  msgId: string;
  fromUserId: string;
  toUserId: string;
  msgType: number;
  content: string;
  contextToken: string;       // ⚠️ 回复时原样带回
  /** 媒体数据（type=2/3/4/5 时填充） */
  media?: {
    encryptQueryParam?: string;
    aesKey?: string;
    encryptType?: number;
    fileName?: string;
    playtime?: number;        // 语音
    sampleRate?: number;
  };
  raw: unknown;
}

/** getupdates 响应 */
interface GetUpdatesResponse {
  ret: number;
  errcode?: number;
  errmsg?: string;
  messages?: WeixinMessage[];
  get_updates_buf?: string;
}

interface SendMessageItem {
  type: ItemType;
  text_item?: { text: string };
  image_item?: any;
  voice_item?: any;
  file_item?: any;
  video_item?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export interface ILinkClientOptions {
  /** 注入的随机 wechat-uin 生成器（测试时可固定） */
  wechatUin?: string;
}

export class ILinkClient {
  private baseUrl: string;
  private botToken: string;
  private botId: string;
  private wechatUin: string;

  constructor(creds: Credentials, opts: ILinkClientOptions = {}) {
    this.baseUrl = creds.baseUrl || BASE_URL;
    this.botToken = creds.botToken;
    this.botId = creds.ilinkBotId;
    this.wechatUin = opts.wechatUin ?? randomWechatUin();
  }

  botUserId(): string {
    return this.botId;
  }

  // ── Long poll loop ────────────────────────────────────────────────────────

  /**
   * Long-poll for new messages.
   * 后端最长挂 35 秒；如果返回就立刻拿新 get_updates_buf 再次请求。
   * 收到会话过期（ret=-14）抛 SessionExpired。
   */
  async getUpdates(buf = ""): Promise<{ messages: WeixinMessage[]; buf: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LONG_POLL_TIMEOUT_MS + 5_000);

    try {
      const resp = await this.doJson<unknown>("POST", "/ilink/bot/getupdates", {
        get_updates_buf: buf,
        base_info: { channel_version: "1.0.0" },
      }, { signal: ctrl.signal });

      const data = resp as GetUpdatesResponse;
      if (data.ret === -14) {
        throw new SessionExpiredError("iLink session expired (ret=-14)");
      }
      if (data.ret !== 0) {
        throw new Error(`iLink getupdates failed: ret=${data.ret} ${data.errmsg ?? ""}`);
      }
      return {
        messages: data.messages ?? [],
        buf: data.get_updates_buf ?? "",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Send ────────────────────────────────────────────────────────────────

  /** 发文本消息（最常用） */
  async sendText(toUserId: string, text: string, contextToken: string): Promise<{ ok: boolean; error?: string }> {
    return this.sendMessage(toUserId, [{ type: 1, text_item: { text } }], contextToken);
  }

  /**
   * 通用 sendmessage。
   * @param toUserId 收信人 user id（从入站消息的 from_user_id 拿）
   * @param itemList 包含 1 个或多个 item（text/image/voice/file/video）
   * @param contextToken 从入站消息原样带回
   */
  async sendMessage(
    toUserId: string,
    itemList: SendMessageItem[],
    contextToken: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await this.doJson<unknown>("POST", "/ilink/bot/sendmessage", {
        context_token: contextToken,
        msg_type: itemList[0]?.type ?? 1,
        to_user_id: toUserId,
        item_list: itemList,
      });
      const data = resp as { ret?: number; errmsg?: string };
      if (data.ret === -14) throw new SessionExpiredError("session expired on send");
      if (data.ret !== 0 && data.ret !== undefined) {
        return { ok: false, error: data.errmsg ?? `ret=${data.ret}` };
      }
      return { ok: true };
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      return { ok: false, error: String(err) };
    }
  }

  // ── Typing ──────────────────────────────────────────────────────────────

  /** 拉 typing_ticket（per-user） */
  async getConfig(userId: string, contextToken: string): Promise<{ typingTicket?: string }> {
    try {
      const resp = await this.doJson<unknown>("POST", "/ilink/bot/getconfig", {
        ilink_user_id: userId,
        context_token: contextToken,
      });
      const data = resp as { ret?: number; typing_ticket?: string; errmsg?: string };
      if (data.ret === 0) {
        return { typingTicket: data.typing_ticket };
      }
      return {};
    } catch {
      return {};
    }
  }

  /** 发送"正在输入" */
  async sendTyping(userId: string, typingTicket: string, status: 1 | 2 = 1): Promise<void> {
      await this.doJson<unknown>("POST", "/ilink/bot/sendtyping", {
      ilink_user_id: userId,
      typing_ticket: typingTicket,
      status,
    });
  }

  // ── Low level ───────────────────────────────────────────────────────────

  private async doJson<T>(method: string, path: string, body: unknown, init?: RequestInit): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: this.headers(),
      body: JSON.stringify(body),
      ...init,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${method} ${path}: ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Non-JSON response from ${method} ${path}: ${text.slice(0, 200)}`);
    }
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "AuthorizationType": "ilink_bot_token",
      "Authorization": `Bearer ${this.botToken}`,
      "X-WECHAT-UIN": this.wechatUin,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Login flow (anonymous client)
// ─────────────────────────────────────────────────────────────────────────────

export interface QrCodeResp {
  qrcode: string;
  qrcode_img_content: string;   // base64 PNG
}

export interface QrStatusResp {
  status: "init" | "scanned" | "confirmed" | "expired" | string;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

/** 拿登录二维码 */
export async function fetchQrCode(): Promise<QrCodeResp> {
  const uin = randomWechatUin();
  const url = `${BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
  const res = await fetch(url, { headers: { "X-WECHAT-UIN": uin } });
  const text = await res.text();
  if (!res.ok) throw new Error(`qrcode fetch failed: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as QrCodeResp;
}

/** 轮询扫码状态（long-poll 40s） */
export async function pollQrStatus(qrcode: string, signal?: AbortSignal): Promise<QrStatusResp> {
  const uin = randomWechatUin();
  const url = `${BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
  const res = await fetch(url, {
    headers: { "X-WECHAT-UIN": uin },
    signal,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`qrcode status failed: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as QrStatusResp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export class SessionExpiredError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SessionExpiredError";
  }
}

function randomWechatUin(): string {
  // weclaw 实现：随 uint32 → 字符串 → base64
  const n = (Math.random() * 0xffffffff) >>> 0;
  const s = String(n);
  return Buffer.from(s, "utf8").toString("base64");
}
