// bot-tools —— 引擎依赖注入的工具集合接口。
// 引擎不直接 import screenshot/input/vlm/refs，而通过此接口调用，便于单测 mock。
// 实际实现由 index.ts 组装（screenshot + input + vlm-locator + refs-store）。

export interface BotTools {
  /** 启动 exe。 */
  launch(exe: string): Promise<void>;
  /** 截当前屏幕，返回 base64 + 实际像素尺寸。 */
  screenshot(): Promise<{ base64: string; mime: string; width: number; height: number } | null>;
  /** 点击屏幕坐标。 */
  click(x: number, y: number): Promise<void>;
  /** 点击屏幕中心。 */
  clickCenter(): Promise<void>;
  /** 按组合键（如 "F4" / "Alt+F4"）。 */
  key(combo: string): Promise<void>;
  /** 视觉定位：参考图 + 描述 → 目标坐标。未找到返回 null。 */
  locate(refName: string, targetDesc?: string): Promise<{ x: number; y: number } | null>;
  /** 纯语义定位（无参考图，如"列表第一个"）→ 坐标。未找到返回 null。 */
  select(desc: string): Promise<{ x: number; y: number } | null>;
  /** 视觉判断 → 布尔。无法判断返回 null。 */
  check(ask: string, refName?: string): Promise<boolean | null>;
  /** 多图比对 → 匹配的参考图序号（0-based）。无法判断返回 null。 */
  compare(refNames: string[], ask: string): Promise<number | null>;
}

/** 进度回调：每个顶层步骤执行前调用。 */
export type ProgressCb = (info: { index: number; total: number; desc: string }) => void;
