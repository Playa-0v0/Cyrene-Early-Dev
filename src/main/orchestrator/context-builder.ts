// Orchestrator Context Builder — post-chat 副作用（记忆写入 + Reflection）
import { memoryStore } from "../memory/memory-store";
import { memoryJudge } from "../memory/memory-judge";
import { memoryManager } from "../memory/memory-manager";
import { entityGraph } from "../memory/entity-graph";
import { enqueueLLMTask } from "../llm-queue";
import { runReflectionAndCompression } from "../memory/memory-compressor";

export function scheduleMemoryWrite(userInput: string, assistantReply: string): void {
  // 实体图谱提取（轻量启发式，不走 LLM，不入队列）
  try {
    entityGraph.ingest(userInput);
    entityGraph.ingest(assistantReply);
  } catch (err) {
    console.warn("[Memory] 实体图谱提取失败:", err);
  }

  // 入 LLM 后台队列：FIFO 串行执行，避免和心情观察并发触发限流；
  // 限流错误自动退避 5s 重试 1 次。
  // .catch 吞掉，不影响主流程（与原 setImmediate 行为一致）。
  enqueueLLMTask("MemoryJudge", async () => {
    try {
      const candidates = await memoryJudge.judge(
        userInput,
        assistantReply,
        "default",
      );

      if (candidates.length > 0) {
        await memoryManager.writeMemory(candidates);
      }
    } catch (err) {
      console.error("[Memory] MemoryJudge/Manager 执行失败，本轮仍会计数", err);
    }

    const l1 = await memoryStore.getL1();
    const newCount = (l1.roundCount || 0) + 1;
    await memoryStore.replaceL1Field("roundCount", newCount);

    if (newCount % 20 === 0) {
      console.log("[Memory] 达到 20 轮，触发 Reflection + 记忆压缩");
      await runReflectionAndCompression();
    }
  }).catch((e) => {
    console.error("[Memory] 记忆写入失败，不影响主流程", e);
  });
}
