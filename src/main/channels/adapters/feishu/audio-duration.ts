// 计算本地音频文件的时长（毫秒）。
// 用于飞书 SDK 的 LarkChannel.send({ audio: { source, duration } }) —— SDK 内部
// MediaUploader.resolveDuration 只对 Opus 自动解析，对 MP3 必须显式传 duration。
//
// 我们用的 TTS (MiniMax / GPT-SoVITS) 输出 mp3，所以需要这个 helper。
import * as fs from "fs";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mm = require("music-metadata");

/** 读本地音频文件时长（毫秒）。失败返回 undefined（调用方决定 fallback）。 */
export async function getAudioDurationMs(filePath: string): Promise<number | undefined> {
  try {
    // parseFile 用 stream，不会一次把整个文件加载到内存
    const meta = await mm.parseFile(filePath, { duration: true, skipCovers: true });
    if (typeof meta.format.duration === "number" && Number.isFinite(meta.format.duration) && meta.format.duration > 0) {
      return Math.round(meta.format.duration * 1000);
    }
    return undefined;
  } catch (err) {
    console.warn(
      "[FeishuAudio] getAudioDurationMs 失败:",
      filePath,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}