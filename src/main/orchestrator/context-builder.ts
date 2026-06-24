// Orchestrator Context Builder — post-chat 副作用（记忆写入）
import { memoryStore } from "../memory/memory-store";
import { memoryJudge } from "../memory/memory-judge";
import { memoryManager } from "../memory/memory-manager";
import { enqueueLLMTask } from "../llm-queue";

export function scheduleMemoryWrite(userInput: string, assistantReply: string): void {
  // 入 LLM 后台队列：FIFO 串行执行，避免和心情观察并发触发限流；
  // 限流错误自动退避 5s 重试 1 次。
  // .catch 吞掉，不影响主流程（与原 setImmediate 行为一致）。
  enqueueLLMTask("MemoryJudge", async () => {
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
  }).catch((e) => {
    console.error("[Memory] 记忆写入失败，不影响主流程", e);
  });
}
