// Orchestrator — unified entry point
// Function Calling 模式下，Orchestrator 只负责构建 always-on 上下文（世界书 + L0/L1）
// 工具的选择和执行由 function-calling.ts 的 runFunctionCallingLoop 处理
import { RuleContext } from "./types";
import { searchWorldbook, getPermanentWorldbookEntries, getAllWorldbookTriggerWords } from "../rag";
import { memoryStore } from "../memory/memory-store";
import { memoryJudge } from "../memory/memory-judge";
import { memoryManager } from "../memory/memory-manager";
import { toolRegistry } from "./tool-registry";

export { RuleContext, Rule, ToolCallResult } from "./types";
export { registerRule, clearRules } from "./rule-router";
export { scheduleMemoryWrite } from "./context-builder";
export { buildToneInjection } from "./tone-injector";
export { runFunctionCallingLoop } from "./function-calling";

// ── Topic state (module-level, not persisted) ──────────
interface TopicState {
  topics: Map<string, number>;
  maxRounds: number;
}

let topicState: TopicState = {
  topics: new Map(),
  maxRounds: 5,
};

const TOPIC_CLEAR_WORDS = ["换个话题", "算了", "好了不说了", "先不聊"];

/**
 * 构建 always-on 上下文：世界书 + L0/L1 画像。
 * 不涉及工具选择和执行——那些由 function calling 处理。
 */
export async function buildAlwaysOnContext(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
): Promise<string> {
  const parts: string[] = [];

  // ── 世界书 — 永远跑 ──────────────────────────────────
  const permanentWb = getPermanentWorldbookEntries();
  if (permanentWb.length > 0) {
    parts.push("【常驻背景】\n" + permanentWb.join("\n\n"));
  }

  try {
    const recentUserMessages = recentMessages
      .filter(msg => msg.role === "user")
      .slice(-3)
      .map(msg => msg.content);
    if (!recentUserMessages.includes(userInput)) {
      recentUserMessages.push(userInput);
    }
    const recentInput = recentUserMessages.join(" ");

    if (TOPIC_CLEAR_WORDS.some(s => userInput.includes(s))) {
      topicState.topics.clear();
      console.log("[Worldbook] 用户主动切换话题，状态已清除");
    }

    const lastAssistantMessage = recentMessages
      .filter(msg => msg.role === "assistant")
      .slice(-1)[0]?.content ?? "";

    if (lastAssistantMessage) {
      const allTriggerWords = getAllWorldbookTriggerWords();
      const assistantHitWords = allTriggerWords.filter(word => lastAssistantMessage.includes(word));
      for (const word of assistantHitWords) {
        if (!topicState.topics.has(word)) {
          topicState.topics.set(word, topicState.maxRounds - 2);
          console.log("[Worldbook] AI输出命中触发词：" + word + "，加入话题状态（2轮）");
        }
      }
    }

    const directResults = await searchWorldbook(recentInput);
    const directHit = directResults.length > 0;

    if (directHit) {
      console.log("[Worldbook] 本轮直接命中（" + directResults.length + "条）");
      topicState.topics.set(recentInput, 0);
    }

    for (const [key, count] of topicState.topics) {
      if (key !== recentInput) {
        topicState.topics.set(key, count + 1);
      }
    }

    for (const [key, count] of topicState.topics) {
      if (count >= topicState.maxRounds) {
        topicState.topics.delete(key);
        console.log("[Worldbook] 话题过期移除：" + key.slice(0, 30));
      }
    }

    const carryoverKeys = [...topicState.topics.keys()].filter(k => k !== recentInput);
    let carryoverResults: string[] = [];
    if (carryoverKeys.length > 0) {
      const carryoverInput = carryoverKeys.join(" ");
      carryoverResults = await searchWorldbook(carryoverInput);
      if (carryoverResults.length > 0) {
        console.log("[Worldbook] 话题保持注入（" + carryoverKeys.length + "个话题），" + carryoverResults.length + "条");
      }
    }

    const allResults = [...directResults, ...carryoverResults];
    const seen = new Set<string>();
    const deduped = allResults.filter(r => {
      const fp = r.slice(0, 100);
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    });

    console.log("[Worldbook] 最终注入条目数: " + deduped.length);

    if (deduped.length > 0) {
      parts.push("【相关背景】\n" + deduped.join("\n\n"));
    }
  } catch (err) {
    console.warn("[Orchestrator] worldbook search failed:", err);
  }

  // ── L0/L1 画像 — 永远跑 ──────────────────────────────
  try {
    const l0 = await memoryStore.getL0();
    const l1 = await memoryStore.getL1();

    const l0Lines = [
      l0.preferredName && `称呼：${l0.preferredName}`,
      l0.occupation && `职业：${l0.occupation}`,
      l0.longTermInterests && `长期兴趣：${l0.longTermInterests}`,
      l0.language && `常用语言：${l0.language}`,
      l0.permanentNote && `备注：${l0.permanentNote}`,
    ].filter(Boolean);

    const l1Lines = [
      l1.recentGoals && `最近目标：${l1.recentGoals}`,
      l1.recentPreferences && `近期偏好：${l1.recentPreferences}`,
      l1.currentProject && `当前项目：${l1.currentProject}`,
    ].filter(Boolean);

    if (l0Lines.length > 0 || l1Lines.length > 0) {
      let memoryContext = "";
      if (l0Lines.length > 0) {
        memoryContext += `[用户画像]\n${l0Lines.join("\n")}\n\n`;
      }
      if (l1Lines.length > 0) {
        memoryContext += `[近期状态]\n${l1Lines.join("\n")}\n\n`;
      }
      parts.push(memoryContext.trim());
    }
  } catch (err) {
    console.warn("[Orchestrator] memory load failed:", err);
  }

  // ── 日志 ──────────────────────────────────────────────
  const enabledTools = toolRegistry.getEnabledTools();
  console.log("[Orchestrator] Always-on context built, enabled tools: " + enabledTools.map(t => t.id).join(", "));

  return parts.join("\n\n");
}
