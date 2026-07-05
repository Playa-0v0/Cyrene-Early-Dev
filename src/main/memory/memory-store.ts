import * as fs from "fs"
import * as path from "path"
import { app } from "electron"
import { L0Profile, L1Profile, L2Memory, MemoryStore, ReflectionLog } from "./memory-types"

const DEFAULT_L0: L0Profile = {
  nickname: "",
  preferredName: "",
  occupation: "",
  longTermInterests: "",
  language: "zh-CN",
  permanentNote: "",
  isPinned: false,
  updatedAt: 0,
}

const DEFAULT_L1: L1Profile = {
  recentGoals: "",
  recentPreferences: "",
  currentProject: "",
  generatedAt: 0,
  roundCount: 0,
}

const DEFAULT_STORE: MemoryStore = {
  l0: { ...DEFAULT_L0 },
  l1: { ...DEFAULT_L1 },
  l2: [],
  reflectionLogs: [],
  version: 1,
}

function getMemoryPath(): string {
  return path.join(app.getPath("userData"), "memory.json")
}

class MemoryStoreManager {
  private cache: MemoryStore | null = null

  async load(): Promise<MemoryStore> {
    if (this.cache) return this.cache
    const filePath = getMemoryPath()
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8")
        const parsed = JSON.parse(raw) as Partial<MemoryStore>
        this.cache = {
          l0: { ...DEFAULT_L0, ...parsed.l0 },
          l1: { ...DEFAULT_L1, ...parsed.l1 },
          l2: Array.isArray(parsed.l2) ? parsed.l2 : [],
          reflectionLogs: Array.isArray(parsed.reflectionLogs) ? parsed.reflectionLogs : [],
          version: typeof parsed.version === "number" ? parsed.version : 1,
        }
      } else {
        this.cache = { ...DEFAULT_STORE, l0: { ...DEFAULT_L0 }, l1: { ...DEFAULT_L1 } }
        await this.save(this.cache)
      }
    } catch {
      this.cache = { ...DEFAULT_STORE, l0: { ...DEFAULT_L0 }, l1: { ...DEFAULT_L1 } }
      await this.save(this.cache)
    }
    return this.cache
  }

  async save(store: MemoryStore): Promise<void> {
    const filePath = getMemoryPath()
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8")
    this.cache = store
  }

  async getL0(): Promise<L0Profile> {
    const store = await this.load()
    return store.l0
  }

  async updateL0(patch: Partial<L0Profile>): Promise<void> {
    const store = await this.load()
    store.l0 = { ...store.l0, ...patch, updatedAt: Date.now() }
    await this.save(store)
  }

  async getL1(): Promise<L1Profile> {
    const store = await this.load()
    return store.l1
  }

  async updateL1(patch: Partial<L1Profile>): Promise<void> {
    const store = await this.load()
    store.l1 = { ...store.l1, ...patch }
    await this.save(store)
  }

  async addL2(input: Omit<L2Memory, "id" | "createdAt" | "lastAccessedAt" | "accessCount" | "weight" | "status">): Promise<L2Memory> {
    const store = await this.load()
    const memory: L2Memory = {
      ...input,
      id: `l2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      weight: 0,
      status: "active",
    }
    store.l2.push(memory)
    await this.save(store)
    return memory
  }

  async updateL2Weight(id: string, delta: number): Promise<void> {
    const store = await this.load()
    const mem = store.l2.find((m) => m.id === id)
    if (!mem) return
    mem.weight = Math.max(0, Math.min(100, mem.weight + delta))
    mem.lastAccessedAt = Date.now()
    mem.accessCount += 1
    if (mem.isPinned) {
      mem.status = "active"
    } else if (mem.weight > 60) {
      mem.status = "active"
    } else if (mem.weight >= 30) {
      mem.status = "active"
    } else if (mem.weight >= 10) {
      mem.status = "aging"
    } else {
      mem.status = "archived"
    }
    await this.save(store)
  }

  async pinL2(id: string, pinned: boolean): Promise<void> {
    const store = await this.load()
    const mem = store.l2.find((m) => m.id === id)
    if (!mem) return
    mem.isPinned = pinned
    if (pinned) {
      mem.status = "active"
    } else if (mem.weight > 60) {
      mem.status = "active"
    } else if (mem.weight >= 30) {
      mem.status = "active"
    } else if (mem.weight >= 10) {
      mem.status = "aging"
    } else {
      mem.status = "archived"
    }
    await this.save(store)
  }

  async deleteL2(id: string): Promise<void> {
    const store = await this.load()
    store.l2 = store.l2.filter((m) => m.id !== id)
    await this.save(store)
  }

  async markL2Conflict(id: string, conflictRagId: string): Promise<L2Memory | null> {
    const store = await this.load()
    const mem = store.l2.find((m) => m.id === id)
    if (!mem) return null
    const conflicts = mem.conflictWith ?? []
    if (conflicts.includes(conflictRagId)) return null

    mem.conflictWith = [...conflicts, conflictRagId]
    if (!mem.isPinned && mem.status === "active") {
      mem.status = "aging"
    }

    await this.save(store)
    return mem
  }

  async getAllL2(): Promise<L2Memory[]> {
    const store = await this.load()
    return store.l2
  }

  async addReflectionLog(log: Omit<ReflectionLog, "id" | "createdAt">): Promise<void> {
    const store = await this.load()
    const entry: ReflectionLog = {
      ...log,
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    }
    if (!store.reflectionLogs) store.reflectionLogs = []
    store.reflectionLogs.push(entry)
    // 最多保留 50 条日志，防止文件膨胀
    if (store.reflectionLogs.length > 50) {
      store.reflectionLogs = store.reflectionLogs.slice(-50)
    }
    await this.save(store)
  }

  async getReflectionLogs(): Promise<ReflectionLog[]> {
    const store = await this.load()
    return store.reflectionLogs ?? []
  }

  /** 批量更新 L2 条目的 status */
  async updateL2Status(ids: string[], status: L2Memory["status"]): Promise<void> {
    const store = await this.load()
    for (const mem of store.l2) {
      if (ids.includes(mem.id)) {
        mem.status = status
      }
    }
    await this.save(store)
  }

  async decayL2Weights(delta = 1): Promise<number> {
    const store = await this.load()
    let changed = 0

    for (const mem of store.l2) {
      if (mem.isPinned || mem.status === "archived" || mem.weight <= 0) continue

      mem.weight = Math.max(0, mem.weight - delta)
      if (mem.weight >= 30) {
        mem.status = "active"
      } else if (mem.weight >= 10) {
        mem.status = "aging"
      } else {
        mem.status = "archived"
      }
      changed += 1
    }

    if (changed > 0) {
      await this.save(store)
    }
    return changed
  }

  /** 批量插入新的 L2 条目（压缩总结用） */
  async addL2Batch(inputs: Array<Omit<L2Memory, "id" | "createdAt" | "lastAccessedAt" | "accessCount" | "weight" | "status">>): Promise<L2Memory[]> {
    const store = await this.load()
    const results: L2Memory[] = []
    for (const input of inputs) {
      const memory: L2Memory = {
        ...input,
        id: `l2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        weight: 0,
        status: "active",
      }
      store.l2.push(memory)
      results.push(memory)
    }
    await this.save(store)
    return results
  }
}

export const memoryStore = new MemoryStoreManager()
