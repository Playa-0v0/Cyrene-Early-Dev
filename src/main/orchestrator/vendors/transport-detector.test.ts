import { describe, it, expect } from "vitest";
import { detectTransport, resolveTransport } from "./transport-detector";

describe("detectTransport", () => {
  it("路径含 /anthropic 走 anthropic", () => {
    expect(detectTransport("https://api.minimaxi.com/anthropic")).toBe("anthropic");
  });

  it("trailing slash 容错", () => {
    expect(detectTransport("https://api.minimaxi.com/anthropic/")).toBe("anthropic");
  });

  it("/anthropic 后面跟其他路径仍判 anthropic", () => {
    expect(detectTransport("https://example.com/anthropic/v1/something")).toBe("anthropic");
  });

  it("路径含 /v1/messages 走 anthropic（无 query）", () => {
    expect(detectTransport("https://api.example.com/v1/messages")).toBe("anthropic");
  });

  it("路径含 /v1/messages 带 query 仍判 anthropic", () => {
    expect(detectTransport("https://api.example.com/v1/messages?beta=true")).toBe("anthropic");
  });

  it("路径仅以 /v1 结尾 → openai 启发式", () => {
    expect(detectTransport("https://api.minimaxi.com/v1")).toBe("openai");
  });

  it("路径含 /chat/completions 走 openai", () => {
    expect(detectTransport("https://api.deepseek.com/chat/completions")).toBe("openai");
  });

  it("路径仅 /completions 走 openai", () => {
    expect(detectTransport("https://api.example.com/completions")).toBe("openai");
  });

  it("空字符串 → null（无法判断）", () => {
    expect(detectTransport("")).toBe(null);
  });

  it("纯域名无路径 → null（capability fallback）", () => {
    expect(detectTransport("https://api.deepseek.com")).toBe(null);
  });

  it("全大写 URL 也工作（lowercase 容错）", () => {
    expect(detectTransport("HTTPS://API.MINIMAXI.COM/ANTHROPIC")).toBe("anthropic");
  });
});

describe("resolveTransport（三层优先级）", () => {
  it("用户显式 anthropic 优先于 baseUrl", () => {
    // baseUrl 是 /v1（启发式为 openai），但 explicitTransport="anthropic" 必须胜出
    expect(
      resolveTransport({
        baseUrl: "https://api.minimaxi.com/v1",
        explicitTransport: "anthropic",
        provider: "MiniMax（稀宇科技）",
      }),
    ).toBe("anthropic");
  });

  it("用户显式 openai 优先于 baseUrl", () => {
    // baseUrl 是 /anthropic（启发式为 anthropic），但 explicitTransport="openai" 必须胜出
    expect(
      resolveTransport({
        baseUrl: "https://api.minimaxi.com/anthropic",
        explicitTransport: "openai",
        provider: "MiniMax（稀宇科技）",
      }),
    ).toBe("openai");
  });

  it("explicitTransport=auto → 走 detectTransport", () => {
    expect(
      resolveTransport({
        baseUrl: "https://api.minimaxi.com/v1",
        explicitTransport: "auto",
        provider: "MiniMax（稀宇科技）",
      }),
    ).toBe("openai");
  });

  it("explicitTransport=undefined → 走 detectTransport → fallback capabilities", () => {
    // DeepSeek baseUrl 无路径线索 → null → capabilities 表 fallback（DeepSeek 是 openai）
    expect(
      resolveTransport({
        baseUrl: "https://api.deepseek.com",
        provider: "DeepSeek（深度求索）",
      }),
    ).toBe("openai");
  });

  it("explicitTransport=undefined + baseUrl 启发式命中 → 用启发式（覆盖 capabilities）", () => {
    // MiniMax capabilities 默认 anthropic，但 baseUrl /v1 启发式 openai → openai 胜出
    expect(
      resolveTransport({
        baseUrl: "https://api.minimaxi.com/v1",
        provider: "MiniMax（稀宇科技）",
      }),
    ).toBe("openai");
  });
});