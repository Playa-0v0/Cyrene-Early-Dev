// 主进程内的 TTS 引擎分发。仅 call-manager 调用（不经 IPC）。
// chat/main.ts 走两个独立 IPC 通道，不用这个 dispatcher。

import { synthesize as minimaxSynthesize } from "./minimax-engine";
import { synthesize as gptsovitsSynthesize } from "./gptsovits-engine";
import type { TtsEngine } from "../../shared/tts-types";

export interface SynthesizeByEnginePayload {
  text: string;
  speed?: number;
  volume?: number;
  // minimax 专用
  apiKey?: string;
  voiceId?: string;
  model?: string;
  // gptsovits 专用
  baseUrl?: string;
  refAudioPath?: string;
  promptText?: string;
  format?: "wav" | "mp3";
}

export interface SynthesizeByEngineResult {
  audio: Buffer;
  format: "wav" | "mp3";
}

/**
 * 按 engine 分发到对应引擎合成。
 * 通话 TTS 不走缓存（实时性优先）。
 * engine === "off" 时抛错。
 */
export async function synthesizeByEngine(
  engine: TtsEngine,
  payload: SynthesizeByEnginePayload,
): Promise<SynthesizeByEngineResult> {
  if (engine === "minimax") {
    if (!payload.apiKey || !payload.voiceId) {
      throw new Error("MiniMax TTS 未配置 apiKey/voiceId");
    }
    const audio = await minimaxSynthesize({
      apiKey: payload.apiKey,
      voiceId: payload.voiceId,
      text: payload.text,
      speed: payload.speed,
      volume: payload.volume,
      model: payload.model ?? "speech-2.8-turbo",
      format: "mp3",
    });
    return { audio, format: "mp3" };
  }

  if (engine === "gptsovits") {
    if (!payload.baseUrl || !payload.refAudioPath || !payload.promptText) {
      throw new Error("GPT-SoVITS TTS 未配置 baseUrl/refAudioPath/promptText");
    }
    const result = await gptsovitsSynthesize({
      baseUrl: payload.baseUrl,
      refAudioPath: payload.refAudioPath,
      promptText: payload.promptText,
      text: payload.text,
      speed: payload.speed,
      format: payload.format ?? "wav",
    });
    return { audio: result.audio, format: result.format };
  }

  throw new Error(`TTS 引擎未启用（engine=${engine}）`);
}
