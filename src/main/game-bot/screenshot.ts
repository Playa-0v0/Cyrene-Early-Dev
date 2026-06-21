// screenshot —— desktopCapturer 截主屏 → PNG base64 + 实际尺寸。
// Electron 内置，免装库。返回的 width/height 用于 VLM 坐标归一化转像素。

import { desktopCapturer, screen } from "electron";
import type { ImgData } from "./vlm-locator";

export interface ScreenshotResult extends ImgData {
  width: number;
  height: number;
}

/** 截取主屏幕，返回 PNG base64 + 实际像素尺寸。失败返回 null。 */
export async function captureScreen(): Promise<ScreenshotResult | null> {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });
  if (sources.length === 0) return null;
  const thumb = sources[0].thumbnail;
  const size = thumb.getSize();
  const png = thumb.toPNG();
  return {
    base64: png.toString("base64"),
    mime: "image/png",
    width: size.width,
    height: size.height,
  };
}
