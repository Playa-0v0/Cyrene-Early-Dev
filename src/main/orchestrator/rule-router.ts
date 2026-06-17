// Orchestrator Rule Router — Rule-first, registered rules, priority-sorted
import { Rule, RuleContext } from "./types";

const rules: Rule[] = [];

export function registerRule(rule: Rule): void {
  rules.push(rule);
  rules.sort((a, b) => b.priority - a.priority);
}

export function clearRules(): void {
  rules.length = 0;
}

// ─── Rule: daily_chat (p=10) — 日常闲聊，不触发文档检索 ───
registerRule({
  name: "daily_chat",
  priority: 10,
  match(_ctx: RuleContext): boolean {
    return true; // always matches as fallback
  },
  apply(_ctx: RuleContext) {
    return []; // 日常闲聊，不调用任何工具
  },
});

// ─── Rule: explicit_document_question (p=90) — 明确提到文件/文档/小说 ───
registerRule({
  name: "explicit_document_question",
  priority: 90,
  match(ctx: RuleContext): boolean {
    if (!ctx.hasImportedDocs) return false;
    const patterns = /文件|文档|小说|总结|分析|内容|里面|上传|导入|读了|看了/;
    return patterns.test(ctx.userInput);
  },
  apply(ctx: RuleContext) {
    return [{ toolId: 'imported_docs', args: { query: ctx.userInput, topK: 5 } }];
  },
});

// ─── Rule: entity_plot_question (p=85) — 专有名词 + 情节/因果问题 ───
registerRule({
  name: "entity_plot_question",
  priority: 85,
  match(ctx: RuleContext): boolean {
    if (!ctx.hasImportedDocs) return false;
    const entityPattern = /[A-Z\u4e00-\u9fff]{2,4}(?:怎么|为什么|是谁|结局|死了|活着|关系|喜欢|爱)/;
    return entityPattern.test(ctx.userInput);
  },
  apply(ctx: RuleContext) {
    return [{ toolId: 'imported_docs', args: { query: ctx.userInput, topK: 5 } }];
  },
});

// ─── Rule: user_memory_question (p=80) — 询问用户记忆 ───
registerRule({
  name: "user_memory_question",
  priority: 80,
  match(ctx: RuleContext): boolean {
    if (!ctx.hasUserMemory) return false;
    const patterns = /你还记得|我之前说|你记不记得|以前|上次|之前|告诉过你|跟你说过|我的|我喜欢|我讨厌|我是/;
    return patterns.test(ctx.userInput);
  },
  apply(ctx: RuleContext) {
    return [{ toolId: 'user_memory', args: { query: ctx.userInput, topK: 5 } }];
  },
});

// ─── Route ───
export function route(ctx: RuleContext): Array<{ toolId: string; args: Record<string, unknown> }> {
  const toolCalls: Array<{ toolId: string; args: Record<string, unknown> }> = [];

  for (const rule of rules) {
    if (rule.match(ctx)) {
      const calls = rule.apply(ctx);
      for (const call of calls) {
        // 去重：同一个 toolId 只加一次
        if (!toolCalls.some(tc => tc.toolId === call.toolId)) {
          toolCalls.push(call);
        }
      }
    }
  }

  return toolCalls;
}

// ── Debug logger ──
export function logToolCalls(toolCalls: Array<{ toolId: string; args: Record<string, unknown> }>, input: string): void {
  console.log("[Rule Router]");
  console.log("Input:", JSON.stringify(input.slice(0, 80)));
  console.log("Tool calls:", toolCalls.length > 0 ? toolCalls.map(tc => tc.toolId).join(", ") : "none");
  for (const tc of toolCalls) {
    console.log("  - " + tc.toolId + ": " + JSON.stringify(tc.args));
  }
}
