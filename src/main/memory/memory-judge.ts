import * as fs from "fs"
import * as path from "path"
import { app } from "electron"
import { MemoryCandidate } from "./memory-types"

interface ModelSettings {
  baseUrl: string
  model: string
  apiKey: string
}

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-pro",
  apiKey: "",
}

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "model-settings.json")
}

function loadModelSettings(): ModelSettings {
  try {
    const filePath = getSettingsPath()
    if (!fs.existsSync(filePath)) return DEFAULT_MODEL_SETTINGS
    const raw = fs.readFileSync(filePath, "utf8")
    const parsed = JSON.parse(raw) as Partial<ModelSettings>
    return {
      baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl.trim() ? parsed.baseUrl.trim() : DEFAULT_MODEL_SETTINGS.baseUrl,
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL_SETTINGS.model,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
    }
  } catch {
    return DEFAULT_MODEL_SETTINGS
  }
}

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`
}

function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim()
}

function extractJsonArray(text: string): unknown[] | null {
  const cleaned = stripThinkBlocks(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    const start = cleaned.indexOf("[")
    const end = cleaned.lastIndexOf("]")
    if (start < 0 || end <= start) return null
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}

function normalizeCandidate(input: unknown): MemoryCandidate | null {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const layer = record.layer
  const content = record.content
  const confidence = record.confidence
  const triggerText = record.triggerText
  if (layer !== "L0" && layer !== "L1" && layer !== "L2") return null
  if (typeof content !== "string" || !content.trim()) return null
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null
  if (typeof triggerText !== "string" || !triggerText.trim()) return null
  return {
    layer,
    content: content.trim(),
    confidence,
    triggerText: triggerText.trim(),
  }
}

async function callChatCompletions(
  settings: ModelSettings,
  messages: Array<{ role: "system" | "user"; content: string }>,
  timeoutMs: number,
  label: string,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: 0.2,
        max_tokens: 300,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>
      const errMsg = (errorData as { error?: { message?: string } }).error?.message
      throw new Error(errMsg || `模型请求失败：HTTP ${response.status}`)
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ""
    return stripThinkBlocks(content)
  } finally {
    clearTimeout(timer)
  }
}

export class MemoryJudge {
  async judge(
    userMessage: string,
    assistantMessage: string,
    conversationId: string,
  ): Promise<MemoryCandidate[]> {
    console.log("[MemoryJudge] 分析本轮对话...")

    try {
      const settings = loadModelSettings()
      if (!settings.apiKey) {
        console.error("[MemoryJudge] LLM 调用失败: missing api key")
        console.log("[MemoryJudge] 本轮无值得记录的信息")
        return []
      }

      const systemPrompt = [
        "你是一个记忆提取器，分析对话内容，判断是否有值得长期记住的信息。",
        "",
        "记忆层级定义：",
        "- L0：用户的稳定身份信息（职业、长期兴趣、称呼偏好、语言习惯）",
        "- L1：用户近期目标或阶段性偏好（最近想做什么、近期关注什么）",
        "- L2：具体事件或情绪经历（今天发生了什么、某件具体的事）",
        "",
        "判断原则：",
        "- 宁可漏记，不要误记",
        "- 纯日常问候、闲聊、情绪发泄（无信息量）→ 返回空数组",
        "- 必须是用户主动表达的信息，不是 AI 说的",
        "- 提炼信息，不要复制原文",
        "",
        "只返回 JSON 数组，禁止输出任何其他文字：",
        "[",
        "  {",
        "    \"layer\": \"L0\"|\"L1\"|\"L2\",",
        "    \"content\": \"提炼后的记忆内容\",",
        "    \"confidence\": 0.0~1.0,",
        "    \"triggerText\": \"原始触发文本（原文片段，不超过50字）\"",
        "  }",
        "]",
        "如果没有值得记住的信息，返回空数组：[]",
      ].join("\n")

      const userPrompt = [
        `conversationId: ${conversationId}`,
        `用户说：${userMessage}`,
        `AI回复：${assistantMessage}`,
      ].join("\n")

      const raw = await callChatCompletions(
        settings,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        30000,
        "MemoryJudge",
      )

      const parsed = extractJsonArray(raw)
      if (!parsed) {
        console.error("[MemoryJudge] JSON 解析失败:", raw)
        console.log("[MemoryJudge] 本轮无值得记录的信息")
        return []
      }

      const candidates = parsed
        .map(normalizeCandidate)
        .filter((item): item is MemoryCandidate => item !== null)
        .filter((item) => item.confidence >= 0.7)

      if (candidates.length === 0) {
        console.log("[MemoryJudge] 本轮无值得记录的信息")
        return []
      }

      console.log(`[MemoryJudge] 提取候选: ${candidates.length} 条（过滤后）`)
      console.log(
        `[MemoryJudge] 候选详情: ${candidates.map((item) => `${item.layer}(\"${item.content}\", ${item.confidence.toFixed(2)})`).join(" ")}`,
      )
      return candidates
    } catch (error) {
      console.error("[MemoryJudge] LLM 调用失败:", error)
      console.log("[MemoryJudge] 本轮无值得记录的信息")
      return []
    }
  }
}

export const memoryJudge = new MemoryJudge()
