import { memoryStore } from "./memory-store"
import { MemoryCandidate, L2Memory } from "./memory-types"
import { addMemory } from "../rag/index"

type L0Field = "occupation" | "longTermInterests" | "preferredName" | "language" | "permanentNote"
type L1Field = "recentGoals" | "recentPreferences"

function preview(content: string, maxLength: number): string {
  return content.slice(0, maxLength)
}

function getL0Field(content: string): L0Field {
  if (/职业|工作|engineer|设计|程序/.test(content)) return "occupation"
  if (/兴趣|爱好|喜欢|热爱/.test(content)) return "longTermInterests"
  if (/称呼|叫我|我叫/.test(content)) return "preferredName"
  if (/语言|中文|英文|日语/.test(content)) return "language"
  return "permanentNote"
}

function getL1Field(content: string): L1Field {
  if (/目标|想要|计划|打算/.test(content)) return "recentGoals"
  return "recentPreferences"
}

export class MemoryManager {
  async writeMemory(candidates: MemoryCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      if (candidate.layer === "L0") {
        const l0 = await memoryStore.getL0()
        if (l0.isPinned) {
          console.log("[MemoryManager] L0 已锁定，跳过自动更新")
          continue
        }

        const field = getL0Field(candidate.content)
        const value =
          field === "permanentNote" && l0.permanentNote
            ? `${l0.permanentNote}; ${candidate.content}`
            : candidate.content

        await memoryStore.updateL0({ [field]: value })
        console.log(`[MemoryManager] L0 更新字段: ${field} = "${preview(candidate.content, 20)}"`)
      } else if (candidate.layer === "L1") {
        const field = getL1Field(candidate.content)
        await memoryStore.updateL1({ [field]: candidate.content })
        console.log(`[MemoryManager] L1 更新字段: ${field}`)
      } else if (candidate.layer === "L2") {
        await this.writeL2(candidate)
      }
    }
  }

  private async writeL2(candidate: MemoryCandidate): Promise<void> {
    const ragId = await addMemory(candidate.content, "user_memory", {
      triggerText: candidate.triggerText,
      confidence: candidate.confidence,
    })

    const l2Input: Omit<L2Memory, "id" | "createdAt" | "lastAccessedAt" | "accessCount" | "weight" | "status"> = {
      content: candidate.content,
      triggerText: candidate.triggerText,
      sourceConversationId: "",
      ragId,
      embedding: [],
      isPinned: false,
    }

    await memoryStore.addL2(l2Input)

    console.log(`[MemoryManager] L2 写入: "${preview(candidate.content, 30)}"（ragId: ${ragId}）`)
  }

  async runDecay(): Promise<void> {
    console.log("[MemoryManager] 权重衰减由 RAG 系统自动处理，跳过")
  }

  async onL2Recalled(ids: string[]): Promise<void> {
    void ids
  }
}

export const memoryManager = new MemoryManager()
