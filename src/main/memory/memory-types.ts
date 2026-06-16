export interface L0Profile {
  nickname: string
  preferredName: string
  occupation: string
  longTermInterests: string
  language: string
  permanentNote: string
  isPinned: boolean
  updatedAt: number
}

export interface L1Profile {
  recentGoals: string
  recentPreferences: string
  currentProject: string
  generatedAt: number
  roundCount: number
}

export interface L2Memory {
  id: string
  content: string
  triggerText: string
  sourceConversationId: string
  createdAt: number
  lastAccessedAt: number
  accessCount: number
  weight: number
  isPinned: boolean
  status: "active" | "aging" | "archived"
  embedding?: number[]
  ragId?: string
}

export interface MemoryCandidate {
  layer: "L0" | "L1" | "L2"
  content: string
  confidence: number
  triggerText: string
}

export interface MemoryStore {
  l0: L0Profile
  l1: L1Profile
  l2: L2Memory[]
  version: number
}
