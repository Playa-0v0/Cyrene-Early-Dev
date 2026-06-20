import * as fs from "fs"
import * as path from "path"
import { buildVendorUrl } from "../orchestrator/vendors"
import { app } from "electron"
import { MemoryCandidate, L0_FIELD_DESCRIPTIONS } from "./memory-types"
import { recordUsage } from "../token-usage-store"

interface ModelSettings {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
}

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: "DeepSeek（深度求索）",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-pro",
  apiKey: "",
};

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
      provider: typeof parsed.provider === "string" && parsed.provider.trim() ? parsed.provider.trim() : DEFAULT_MODEL_SETTINGS.provider,
      baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl.trim() ? parsed.baseUrl.trim() : DEFAULT_MODEL_SETTINGS.baseUrl,
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL_SETTINGS.model,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
    };
  } catch {
    return DEFAULT_MODEL_SETTINGS
  }
}



function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim()
}

function extractJsonArray(raw: string): unknown[] | null {
  // 第一步：去掉 markdown 代码块包裹 + think 块
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  // 第二步：截取从第一个 [ 开始的内容（不要求结尾有 ]，防 max_tokens 截断）
  const start = text.indexOf('[')
  if (start === -1) return null
  text = text.slice(start)

  // 第三步：直接尝试解析（完整数组的情况）
  try {
    const parsed = JSON.parse(text) as unknown[]
    if (Array.isArray(parsed)) return parsed
  } catch (_) {}

  // 第四步：截断救场 —— 即使末尾 ] 缺失，把已完整的 {...} 对象逐个捞出来。
  // 关键：用栈匹配大括号深度，避免把对象内部的 } 当成对象结束。
  const results: unknown[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] !== '{') { i++; continue }
    // 找匹配的 } —— 跟踪引号和嵌套深度
    let depth = 0
    let inStr = false
    let esc = false
    let j = i
    for (; j < text.length; j++) {
      const c = text[j]
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) break  // 找到匹配的闭合
      }
    }
    if (depth !== 0) break  // 这个对象被截断了，后面也不可能有完整的了
    const objStr = text.slice(i, j + 1)
    try {
      const obj = JSON.parse(objStr)
      if (obj && typeof obj === "object") results.push(obj)
    } catch (_) {
      // 单个对象解析失败，跳过继续找下一个
    }
    i = j + 1
  }

  if (results.length > 0) {
    console.log('[MemoryJudge] 截断救场提取成功，条数:', results.length)
    return results
  }

  // 第五步：修复嵌套英文引号问题（针对完整数组的情况再试一次）
  try {
    // 给 text 补上缺失的 ] 让 JSON.parse 有机会成功
    const fixedText = text.replace(/("content"|"triggerText"):\s*"([\s\S]*?)(?<!\\)"/g,
      (match: string, key: string, value: string) => {
        let k = 0
        const cleaned = value.replace(/"/g, () => k++ % 2 === 0 ? '「' : '」')
        return key + ': "' + cleaned + '"'
      }
    )
    // 尝试找最后一个完整对象后补 ]
    const lastBrace = fixedText.lastIndexOf('}')
    if (lastBrace > 0) {
      const candidate = fixedText.slice(0, lastBrace + 1) + ']'
      const parsed = JSON.parse(candidate) as unknown[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch (_) {}

  return null
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
    field: typeof record.field === 'string' ? record.field : undefined,
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
    const response = await fetch(buildVendorUrl(settings.provider, settings.baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        // 不传 temperature：不同型号约束不同（如 Kimi k2.6 只允许 1），传固定值会报错
        max_tokens: 800,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>
      const errMsg = (errorData as { error?: { message?: string } }).error?.message
      throw new Error(errMsg || `模型请求失败：HTTP ${response.status}`)
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }
    // 记录 MemoryJudge 的 token 用量
    if (data.usage) {
      recordUsage(data.usage.prompt_tokens ?? 0, data.usage.completion_tokens ?? 0, 1)
    }
    const content = data.choices?.[0]?.message?.content ?? ""
    return stripThinkBlocks(content)
  } finally {
    clearTimeout(timer)
  }
}

export class MemoryJudge {
  private buildL0FieldPrompt(): string {
    return Object.entries(L0_FIELD_DESCRIPTIONS)
      .map(([field, description]) => `  · ${field}：${description}`)
      .join('\n')
  }
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
        "- L0：用户的稳定身份信息。",
        "  识别到 L0 信息时，必须同时在 field 字段里指定要写入哪个格子。",
        "  可用的 field 值如下（只能用这些，不能自己发明）：",
        this.buildL0FieldPrompt(),
        "",
        "  重要：field 的值必须严格是上方列出的英文字段名，",
        "  例如 preferredName、occupation，",
        "  不能用 nickname、name、job 等其他词。",
        "- L1：用户近期目标或阶段性偏好（最近想做什么、近期关注什么）",
        "- L2：具体事件或情绪经历（今天发生了什么、某件具体的事）",
        "",
        "判断原则：",
        "- 宁可漏记，不要误记",
        "- 纯日常问候、闲聊、情绪发泄（无信息量）→ 返回空数组",
        "- 必须是用户主动表达的信息，不是 AI 说的",
        "- 提炼信息，不要复制原文",
        "",
        "重要格式规则：",
        "- content 和 triggerText 字段的值里，禁止出现英文双引号 \"",
        "- 如果内容里有引号，统一用中文引号「」替代，例如：用户希望被称为「宝宝」",
        "- 不要用 markdown 代码块包裹 JSON，直接输出裸 JSON",
        "- 数组第一个字符必须是 [，最后一个字符必须是 ]",
        "",
        "输出格式为 JSON 数组，禁止用 markdown 代码块包裹，直接输出裸 JSON。",
        "",
        "L0 候选（必须包含 field）：",
        "{",
        "  \"layer\": \"L0\",",
        "  \"field\": \"preferredName\",",
        "  \"content\": \"提炼后的内容，用「」代替引号\",",
        "  \"confidence\": 0.0~1.0,",
        "  \"triggerText\": \"原始触发文本，不超过50字，用「」代替引号\"",
        "}",
        "",
        "L1 候选（不需要 field）：",
        "{",
        "  \"layer\": \"L1\",",
        "  \"content\": \"提炼后的内容\",",
        "  \"confidence\": 0.0~1.0,",
        "  \"triggerText\": \"原始触发文本\"",
        "}",
        "",
        "L2 候选（不需要 field）：",
        "{",
        "  \"layer\": \"L2\",",
        "  \"content\": \"提炼后的内容\",",
        "  \"confidence\": 0.0~1.0,",
        "  \"triggerText\": \"原始触发文本\"",
        "}",
        "",
        "没有值得记录的信息时，输出：[]",
        "content 和 triggerText 里禁止出现英文双引号，用「」替代。",
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
        console.error("[MemoryJudge] JSON 解析失败，原始内容：\n", raw.slice(0, 200))
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
        `[MemoryJudge] 候选详情: ${candidates.map((item) => item.layer === "L0" && item.field ? `${item.layer}.${item.field}(\"${item.content.slice(0, 20)}\", ${item.confidence.toFixed(2)})` : `${item.layer}(\"${item.content.slice(0, 20)}\", ${item.confidence.toFixed(2)})`).join(" ")}`,
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
