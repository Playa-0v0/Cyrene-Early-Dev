// coords 单测 —— VLM 文本 → 坐标/布尔/匹配索引 解析。
import { describe, it, expect } from "vitest";
import { parseClickCoord, parseBoolAnswer, parseMatchIndex } from "./coords";

describe("parseClickCoord", () => {
  it("解析 {x,y} 0-1000 归一化 → 像素", () => {
    expect(parseClickCoord('{"x":500,"y":250}', 1920, 1080)).toEqual({ x: 960, y: 270 });
  });
  it("带 ```json 围栏", () => {
    expect(parseClickCoord('```json\n{"x":100,"y":100}\n```', 1000, 1000)).toEqual({ x: 100, y: 100 });
  });
  it("文本里夹 JSON", () => {
    expect(parseClickCoord('目标在 {"x":800,"y":600} 位置', 1000, 1000)).toEqual({ x: 800, y: 600 });
  });
  it("越界 clamp 到屏幕内", () => {
    expect(parseClickCoord('{"x":1500,"y":-100}', 1000, 1000)).toEqual({ x: 1000, y: 0 });
  });
  it("无 JSON 返回 null", () => {
    expect(parseClickCoord("没找到目标", 1000, 1000)).toBeNull();
  });
  it("JSON 缺 x/y 返回 null", () => {
    expect(parseClickCoord('{"x":500}', 1000, 1000)).toBeNull();
  });
});

describe("parseBoolAnswer", () => {
  it('{"answer":true} → true', () => {
    expect(parseBoolAnswer('{"answer":true}')).toBe(true);
  });
  it('{"answer":false} → false', () => {
    expect(parseBoolAnswer('{"answer":false}')).toBe(false);
  });
  it("文字 是/有 → true", () => {
    expect(parseBoolAnswer("是的，有更新弹窗")).toBe(true);
  });
  it("文字 没/无 → false", () => {
    expect(parseBoolAnswer("没有，无弹窗")).toBe(false);
  });
  it("无法判断 → null", () => {
    expect(parseBoolAnswer("也许吧")).toBeNull();
  });
});

describe("parseMatchIndex", () => {
  it('{"match":1} → 1', () => {
    expect(parseMatchIndex('{"match":1}', 2)).toBe(1);
  });
  it("索引越界 → null", () => {
    expect(parseMatchIndex('{"match":5}', 2)).toBeNull();
  });
  it("无 match 字段 → null", () => {
    expect(parseMatchIndex("不确定匹配哪个", 2)).toBeNull();
  });
});
