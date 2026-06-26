// 火山引擎流式 ASR 引擎 —— WebSocket 客户端，仿 minimax-engine.ts 的 ws 模式。
//
// 火山引擎流式语音识别（大模型 ASR）协议：
// - WebSocket 连接 URL 拼鉴权参数（token + appid）
// - 首帧发 JSON 鉴权 + 音频配置
// - 后续发二进制 PCM 帧（16kHz/16bit/mono）
// - 收到 JSON 消息含识别结果（partial / final）
// - 结束时发停止帧
//
// 文档：https://www.volcengine.com/docs/6561/80818

import { WebSocket } from "ws";
import { createHash, createHmac } from "crypto";

const LOG_PREFIX = "[VolcanoASR]";
const ASR_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";

/** 火山 ASR 流式识别会话 */
export class VolcanoAsrStream {
  private ws: WebSocket | null = null;
  private stopped = false;
  private sequence = 1;

  constructor(
    private readonly onPartial: (text: string) => void,
    private readonly onFinal: (text: string) => void,
  ) {}

  /**
   * 开始识别会话：连 WebSocket，鉴权，发首帧配置。
   * appId/apiKey 来自 GeneralSettings，language: zh/en/auto。
   */
  start(appId: string, apiKey: string, language: string): void {
    const token = this.buildToken(appId, apiKey);
    const url = `${ASR_WS_URL}?token=${encodeURIComponent(token)}`;
    console.log(LOG_PREFIX, "连接 ASR WebSocket...", `appid=${appId}, lang=${language}`);

    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.on("open", () => {
      console.log(LOG_PREFIX, "WebSocket 已连接，发送配置帧");
      this.sendConfigFrame(appId, apiKey, language);
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        // 火山返回的是 JSON 文本消息
        const msg = JSON.parse(raw.toString()) as {
          // 识别结果
          result?: { text?: string; utterances?: Array<{ text?: string; definite?: boolean }> };
          // 是否是最终结果
          is_last?: boolean;
          // 错误
          code?: number;
          message?: string;
          // 事件类型
          event?: string;
        };

        if (msg.code && msg.code !== 0) {
          console.error(LOG_PREFIX, "ASR 错误:", msg.code, msg.message);
          return;
        }

        // 提取识别文本
        const text = msg.result?.text
          ?? msg.result?.utterances?.map(u => u.text ?? "").join("")
          ?? "";

        if (text) {
          const isFinal = msg.is_last === true;
          if (isFinal) {
            console.log(LOG_PREFIX, "最终识别:", text);
            this.onFinal(text);
          } else {
            this.onPartial(text);
          }
        }
      } catch (err) {
        console.error(LOG_PREFIX, "解析 ASR 消息失败:", err);
      }
    });

    this.ws.on("error", (err) => {
      console.error(LOG_PREFIX, "WebSocket 错误:", err.message);
    });

    this.ws.on("close", (code, reason) => {
      console.log(LOG_PREFIX, `WebSocket 关闭: ${code} ${reason?.toString() || ""}`);
    });
  }

  /** 发送一帧 PCM 音频（16kHz/16bit/mono，20ms=640字节） */
  sendAudio(pcmFrame: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.stopped) return;
    // 火山流式 ASR：二进制帧 = 4字节头(sequence) + payload
    // 使用纯二进制发送 PCM 数据
    this.ws.send(pcmFrame, { binary: true });
    this.sequence++;
  }

  /** 结束识别，发停止信号，关闭连接 */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 发结束帧（JSON）
      const endFrame = JSON.stringify({
        user: { uid: "cyrene" },
        audio: { data: "" },
        request: { last: true },
      });
      try {
        this.ws.send(endFrame);
      } catch { /* ignore */ }
    }
    setTimeout(() => {
      try { this.ws?.close(); } catch { /* ignore */ }
    }, 500);
  }

  /** 构建鉴权 token（HMAC-SHA256 签名） */
  private buildToken(appId: string, apiKey: string): string {
    // 火山引擎鉴权：appid + timestamp + HMAC-SHA256(apiKey, appid|timestamp)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const dataToSign = `${appId}:${timestamp}`;
    const signature = createHmac("sha256", apiKey).update(dataToSign).digest("hex");
    // 返回 base64 编码的鉴权信息
    const token = Buffer.from(JSON.stringify({ appid: appId, ts: timestamp, sign: signature })).toString("base64");
    return token;
  }

  /** 发送配置帧（音频格式 + 鉴权） */
  private sendConfigFrame(appId: string, _apiKey: string, language: string): void {
    const langMap: Record<string, string> = {
      zh: "zh-CN",
      en: "en-US",
      auto: "auto",
    };
    const config = {
      user: { uid: "cyrene" },
      audio: {
        format: "raw",
        rate: 16000,
        bits: 16,
        channel: 1,
        language: langMap[language] ?? "zh-CN",
      },
      request: {
        model_name: "bigmodel",
        enable_punc: true,
        result_format: "full",
        last: false,
      },
      // 鉴权信息
      x_app_id: appId,
    };
    try {
      this.ws?.send(JSON.stringify(config));
    } catch (err) {
      console.error(LOG_PREFIX, "发送配置帧失败:", err);
    }
  }
}

/** 配置注入 getter（由 index.ts 启动时注入）。 */
let asrConfigGetter: (() => { appId: string; apiKey: string; language: string; engine: string } | null) | null = null;

/** index.ts 启动时注入 ASR 配置获取器。 */
export function setAsrConfig(getter: () => { appId: string; apiKey: string; language: string; engine: string } | null): void {
  asrConfigGetter = getter;
}

/** 获取当前 ASR 配置（供 call-manager 使用）。 */
export function getAsrConfig(): { appId: string; apiKey: string; language: string; engine: string } | null {
  return asrConfigGetter?.() ?? null;
}
