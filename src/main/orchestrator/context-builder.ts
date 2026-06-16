// Orchestrator Context Builder — executes retrieval per OrchestratorPlan
import { OrchestratorPlan, RuleContext } from "./types";
import { searchWorldbook, getPermanentWorldbookEntries, getAllWorldbookTriggerWords } from "../rag";
import { getReranker } from "../rag/reranker";
import { memoryStore } from "../memory/memory-store";
import { memoryJudge } from "../memory/memory-judge";
import { memoryManager } from "../memory/memory-manager";
import { searchMemory } from "../rag/index";

// ── Topic state (module-level, not persisted) ──────────
// key: recentInput that triggered a match
// value: rounds since last direct hit (0 = hit this round)
interface TopicState {
  topics: Map<string, number>;
  maxRounds: number;
}

let topicState: TopicState = {
  topics: new Map(),
  maxRounds: 5,
};

const TOPIC_CLEAR_WORDS = ["换个话题", "算了", "好了不说了", "先不聊"];

async function rerankResults(query: string, results: string[], topK: number): Promise<string[]> {
  const reranker = getReranker();
  if (!reranker || results.length <= 1) return results;

  const reranked = await reranker.rerank(query, results);
  return reranked.slice(0, topK).map((r) => r.text);
}

function formatMemoryResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";

  const record = result as { text?: unknown; entry?: { text?: unknown } };
  if (typeof record.entry?.text === "string") return record.entry.text;
  if (typeof record.text === "string") return record.text;
  return "";
}

export async function buildOrchestratedContext(
  userInput: string,
  plan: OrchestratorPlan,
  ctx: RuleContext
): Promise<string> {
  const parts: string[] = [];

  // 0. Permanent worldbook entries (always included)
  const permanentWb = getPermanentWorldbookEntries();
  if (permanentWb.length > 0) {
    parts.push("【常驻背景】\n" + permanentWb.join("\n\n"));
  }

  // 1. Worldbook — always runs every round (keyword-triggered, not controlled by Plan)
  try {
    // Build expanded matching window (last 3 user messages)
    const recentUserMessages = ctx.recentMessages
      .filter(msg => msg.role === "user")
      .slice(-3)
      .map(msg => msg.content);
    if (!recentUserMessages.includes(userInput)) {
      recentUserMessages.push(userInput);
    }
    const recentInput = recentUserMessages.join(" ");

    // Check clear-topic signals
    if (TOPIC_CLEAR_WORDS.some(s => userInput.includes(s))) {
      topicState.topics.clear();
      console.log("[Worldbook] 用户主动切换话题，状态已清除");
    }

    // Step 0: Scan last AI output for trigger words
    const lastAssistantMessage = ctx.recentMessages
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

    // Step 1: Direct search with expanded window
    const directResults = await searchWorldbook(recentInput);
    const directHit = directResults.length > 0;

    if (directHit) {
      console.log("[Worldbook] 本轮直接命中（" + directResults.length + "条）");
      topicState.topics.set(recentInput, 0);
    }

    // Step 2: Increment non-current topics
    for (const [key, count] of topicState.topics) {
      if (key !== recentInput) {
        topicState.topics.set(key, count + 1);
      }
    }

    // Step 3: Remove expired topics
    for (const [key, count] of topicState.topics) {
      if (count >= topicState.maxRounds) {
        topicState.topics.delete(key);
        console.log("[Worldbook] 话题过期移除：" + key.slice(0, 30));
      }
    }

    // Step 4: Carryover search with non-current topics
    const carryoverKeys = [...topicState.topics.keys()].filter(k => k !== recentInput);
    let carryoverResults: string[] = [];
    if (carryoverKeys.length > 0) {
      const carryoverInput = carryoverKeys.join(" ");
      carryoverResults = await searchWorldbook(carryoverInput);
      if (carryoverResults.length > 0) {
        console.log("[Worldbook] 话题保持注入（" + carryoverKeys.length + "个话题），" + carryoverResults.length + "条");
      }
    }

    // Step 5: Merge and deduplicate
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
    console.warn("[ContextBuilder] worldbook search failed:", err);
  }

  // 2. Three-layer memory
  const l0 = await memoryStore.getL0();
  const l1 = await memoryStore.getL1();

  let l2Context = "";
  if (plan.useUserMemory) {
    try {
      const l2Results = await searchMemory(userInput, "user_memory", 5);
      if (l2Results && l2Results.length > 0) {
        l2Context = l2Results
          .map((result: unknown) => formatMemoryResult(result))
          .filter(Boolean)
          .map((text) => "- " + text)
          .join("\n");
        console.log(`[Memory] L2 召回 ${l2Results.length} 条记忆`);
      }
    } catch (e) {
      console.error("[Memory] L2 检索失败，跳过", e);
    }
  }

  let memoryContext = "";

  const l0Lines = [
    l0.preferredName && `称呼：${l0.preferredName}`,
    l0.occupation && `职业：${l0.occupation}`,
    l0.longTermInterests && `长期兴趣：${l0.longTermInterests}`,
    l0.language && `常用语言：${l0.language}`,
    l0.permanentNote && `备注：${l0.permanentNote}`,
  ].filter(Boolean);

  if (l0Lines.length > 0) {
    memoryContext += `[用户画像]\n${l0Lines.join("\n")}\n\n`;
  }

  const l1Lines = [
    l1.recentGoals && `最近目标：${l1.recentGoals}`,
    l1.recentPreferences && `近期偏好：${l1.recentPreferences}`,
    l1.currentProject && `当前项目：${l1.currentProject}`,
  ].filter(Boolean);

  if (l1Lines.length > 0) {
    memoryContext += `[近期状态]\n${l1Lines.join("\n")}\n\n`;
  }

  if (l2Context) {
    memoryContext += `[相关记忆]\n${l2Context}\n\n`;
  }

  if (memoryContext.trim()) {
    parts.push(memoryContext.trim());
  }

  // 3. Imported Docs — only if plan says so
  if (plan.useImportedDocs && ctx.hasImportedDocs) {
    try {
      const docResults = await searchMemory(userInput, "imported_doc", 5);
      if (docResults.length > 0) {
        parts.push("【相关文件片段】\n" + docResults.map((m) => "- " + m).join("\n"));
      }
    } catch (err) {
      console.warn("[ContextBuilder] imported docs search failed:", err);
    }
  }

  return parts.join("\n\n");
}

export function scheduleMemoryWrite(userInput: string, assistantReply: string): void {
  setImmediate(async () => {
    try {
      const candidates = await memoryJudge.judge(
        userInput,
        assistantReply,
        "default",
      );

      if (candidates.length > 0) {
        await memoryManager.writeMemory(candidates);
      }

      const l1 = await memoryStore.getL1();
      const newCount = (l1.roundCount || 0) + 1;
      await memoryStore.updateL1({ roundCount: newCount });

      if (newCount % 20 === 0) {
        console.log("[Memory] 达到 20 轮，Reflection 待实现");
      }
    } catch (e) {
      console.error("[Memory] 记忆写入失败，不影响主流程", e);
    }
  });
}
