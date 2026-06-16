// Orchestrator — unified entry point
import { RuleContext } from "./types";
import { route as ruleRoute, logPlan } from "./rule-router";
import { buildOrchestratedContext } from "./context-builder";
import { llmRouter } from "./llm-router";
import { toolRegistry } from "./tool-registry";
import { getRAGStats, getPermanentWorldbookEntries } from "../rag";

export { OrchestratorPlan, RuleContext, Rule, createDefaultPlan } from "./types";
export { registerRule, clearRules } from "./rule-router";
export { scheduleMemoryWrite } from "./context-builder";

export async function buildOrchestratedMemoryContext(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
  settings: { baseUrl: string; model: string; apiKey: string },
  callLLM: (
    settings: { baseUrl: string; model: string; apiKey: string },
    messages: Array<{ role: "system" | "user"; content: string }>,
    temperature: number,
    timeoutMs: number,
    label: string,
  ) => Promise<string>,
): Promise<string> {
  const stats = getRAGStats();
  const sources = (stats as { sources?: Record<string, number> }).sources ?? {};

  const ctx: RuleContext = {
    userInput,
    recentMessages,
    hasImportedDocs: (sources["imported_doc"] ?? 0) > 0,
    hasWorldbook: getPermanentWorldbookEntries().length > 0 || (sources["worldbook"] ?? 0) > 0,
    hasUserMemory: (sources["user_memory"] ?? 0) > 0,
  };

  // 打印当前启用的工具列表
  const enabledTools = toolRegistry.getEnabledTools();
  console.log("[Orchestrator] Enabled tools: " + enabledTools.map(t => t.id).join(", "));

  // 优先使用 LLM Router，失败时 fallback 到 Rule Router
  let plan;
  try {
    plan = await llmRouter.route(userInput, settings, callLLM);
  } catch (e) {
    console.error("[Orchestrator] LLM Router 失败，fallback 到 Rule Router", e);
    plan = ruleRoute(ctx);
  }

  logPlan(plan, userInput);

  return buildOrchestratedContext(userInput, plan, ctx);
}
