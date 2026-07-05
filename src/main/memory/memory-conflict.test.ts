import { describe, expect, it } from "vitest"
import { judgeLocalMemoryConflict } from "./memory-conflict"

describe("judgeLocalMemoryConflict", () => {
  it("detects contradictions on the same concrete topic", () => {
    const verdict = judgeLocalMemoryConflict("用户不喜欢香菇", "用户喜欢香菇")

    expect(verdict.isConflict).toBe(true)
    expect(verdict.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it("does not mark unrelated negative experiences as contradictions", () => {
    const verdict = judgeLocalMemoryConflict(
      "用户对 AI 有强烈心意，因无法触碰而难过",
      "用户曾因食用见手青而有过不好经历",
    )

    expect(verdict.isConflict).toBe(false)
  })

  it("requires a shared topic before applying contradiction pairs", () => {
    const verdict = judgeLocalMemoryConflict("用户不喜欢香菇", "用户喜欢平菇")

    expect(verdict.isConflict).toBe(false)
  })
})
