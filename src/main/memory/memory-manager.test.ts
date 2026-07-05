import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryCandidate } from "./memory-types"

const electronMock = vi.hoisted(() => ({
  userDataDir: "",
}))

const ragMock = vi.hoisted(() => ({
  addMemory: vi.fn(),
  searchMemory: vi.fn(),
}))

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir,
  },
}))

vi.mock("../rag/index", () => ragMock)

function readTraceEvents(): Array<Record<string, unknown>> {
  const tracePath = path.join(electronMock.userDataDir, "memory-trace.log")
  if (!fs.existsSync(tracePath)) return []
  return fs.readFileSync(tracePath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("MemoryManager L2 sync", () => {
  beforeEach(() => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-manager-"))
    ragMock.addMemory.mockReset()
    ragMock.searchMemory.mockReset()
    ragMock.searchMemory.mockResolvedValue([])
    vi.resetModules()
  })

  it("creates L2 first, syncs it to RAG with l2Id metadata, then marks it synced", async () => {
    ragMock.addMemory.mockResolvedValue("rag_synced")
    const { memoryManager } = await import("./memory-manager")
    const { memoryStore } = await import("./memory-store")
    const candidate: MemoryCandidate = {
      layer: "L2",
      content: "用户喜欢香菇",
      confidence: 0.91,
      triggerText: "我喜欢香菇",
    }

    await memoryManager.writeMemory([candidate])

    const allL2 = await memoryStore.getAllL2()
    const traceEvents = readTraceEvents()
    const addIndex = traceEvents.findIndex((event) => event.op === "l2.add" && event.l2Id === allL2[0].id)
    const syncIndex = traceEvents.findIndex((event) => event.op === "l2.sync.success" && event.l2Id === allL2[0].id)
    const reflectionLogs = await memoryStore.getReflectionLogs()

    expect(allL2).toHaveLength(1)
    expect(allL2[0].syncStatus).toBe("synced")
    expect(allL2[0].ragId).toBe("rag_synced")
    expect(addIndex).toBeGreaterThanOrEqual(0)
    expect(syncIndex).toBeGreaterThan(addIndex)
    expect(traceEvents[syncIndex].ragId).toBe("rag_synced")
    expect(reflectionLogs.some((log) => log.type === "conflict_detected")).toBe(false)
    expect(ragMock.addMemory).toHaveBeenCalledWith(
      candidate.content,
      "user_memory",
      expect.objectContaining({ l2Id: allL2[0].id, confidence: candidate.confidence }),
    )
  })

  it("keeps L2 as sync_failed when RAG write fails", async () => {
    ragMock.addMemory.mockRejectedValue(new Error("RAG down"))
    const { memoryManager } = await import("./memory-manager")
    const { memoryStore } = await import("./memory-store")
    const candidate: MemoryCandidate = {
      layer: "L2",
      content: "用户正在重构记忆系统",
      confidence: 0.95,
      triggerText: "我们继续重构记忆系统",
    }

    await memoryManager.writeMemory([candidate])

    const allL2 = await memoryStore.getAllL2()
    const traceEvents = readTraceEvents()
    const addIndex = traceEvents.findIndex((event) => event.op === "l2.add" && event.l2Id === allL2[0].id)
    const failureIndex = traceEvents.findIndex((event) => event.op === "l2.sync.failure" && event.l2Id === allL2[0].id)

    expect(allL2).toHaveLength(1)
    expect(allL2[0].syncStatus).toBe("sync_failed")
    expect(allL2[0].ragId).toBeUndefined()
    expect(addIndex).toBeGreaterThanOrEqual(0)
    expect(failureIndex).toBeGreaterThan(addIndex)
    expect(traceEvents[failureIndex].status).toBe("error")
    expect(traceEvents[failureIndex].error).toBe("RAG down")
  })
})
