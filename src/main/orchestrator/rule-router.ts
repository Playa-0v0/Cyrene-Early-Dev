// Orchestrator Rule Router — Rule-first, registered rules, priority-sorted
import { OrchestratorPlan, Rule, RuleContext, createDefaultPlan } from "./types";

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
  match(ctx: RuleContext): boolean {
    return true; // always matches as fallback
  },
  apply(plan: OrchestratorPlan, _ctx: RuleContext): void {
    plan.useImportedDocs = false;
    plan.reasons.push("日常闲聊：不检索导入文档");
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
  apply(plan: OrchestratorPlan, _ctx: RuleContext): void {
    plan.useImportedDocs = true;
    plan.reasons.push("明确提到文档/文件/小说内容");
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
  apply(plan: OrchestratorPlan, _ctx: RuleContext): void {
    plan.useImportedDocs = true;
    plan.reasons.push("专有名词+情节/因果问题：检索导入文档");
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
  apply(plan: OrchestratorPlan, _ctx: RuleContext): void {
    plan.useUserMemory = true;
    plan.reasons.push("命中用户记忆规则");
  },
});

// ─── Rule: worldbook_trigger (p=75) — 询问昔涟自身背景 ───
registerRule({
  name: "worldbook_trigger",
  priority: 75,
  match(ctx: RuleContext): boolean {
    if (!ctx.hasWorldbook) return false;
    const patterns = /昔涟|星灵|背景|经历|你是谁|你的故事|你的过去|你的设定|Cyrene/;
    return patterns.test(ctx.userInput);
  },
  apply(plan: OrchestratorPlan, _ctx: RuleContext): void {
    plan.useWorldbook = true;
    plan.reasons.push("命中世界书规则");
  },
});

// ─── Rule: web_search_trigger (p=70) — 预留，v1 不启用 ───
registerRule({
  name: "web_search_trigger",
  priority: 70,
  match(_ctx: RuleContext): boolean {
    return false; // v1 not enabled
  },
  apply(plan: OrchestratorPlan, _ctx: RuleContext): void {
    plan.useWebSearch = true;
    plan.reasons.push("命中网络搜索规则（预留）");
  },
});

// ─── Route ───
export function route(ctx: RuleContext): OrchestratorPlan {
  const plan = createDefaultPlan();

  for (const rule of rules) {
    if (rule.match(ctx)) {
      rule.apply(plan, ctx);
    }
  }

  return plan;
}

// ─── Debug logger ───
export function logPlan(plan: OrchestratorPlan, input: string): void {
  console.log("[Orchestrator]");
  console.log("Input:", JSON.stringify(input.slice(0, 80)));
  console.log("");
  console.log("Plan:");
  console.log(plan.useImportedDocs ? "\u2713 useImportedDocs" : "\u2717 useImportedDocs");
  console.log(plan.useWorldbook ? "\u2713 useWorldbook" : "\u2717 useWorldbook");
  console.log(plan.useWebSearch ? "\u2713 useWebSearch" : "\u2717 useWebSearch");
  console.log(plan.useUserMemory ? "\u2713 useUserMemory" : "\u2717 useUserMemory");
  console.log("");
  console.log("Reason:");
  for (const r of plan.reasons) {
    console.log("- " + r);
  }
  console.log("");
}
