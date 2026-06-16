import { toolRegistry, ToolDefinition } from './tool-registry';
import { OrchestratorPlan, createDefaultPlan } from './types';

// ── 缓存条目 ───────────────────────────────────────────
interface CacheEntry {
  plan: OrchestratorPlan;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const QUICKCHECK_MIN_LENGTH = 15;
const QUICKCHECK_TRIGGER_WORDS = [
  '文件', '文档', '小说', '总结', '分析', '上传',
  '你还记得', '我之前', '以前',
];

// ── LLM Router ──────────────────────────────────────────
export class LlmRouter {
  private cache: Map<string, CacheEntry> = new Map();

  // ── 清空缓存 ─────────────────────────────────────────
  clearCache(): void {
    this.cache.clear();
  }

  // ── 快速预判 ─────────────────────────────────────────
  private quickCheck(input: string): OrchestratorPlan | null {
    const trimmed = input.trim();
    if (trimmed.length >= QUICKCHECK_MIN_LENGTH) return null;

    const hasTrigger = QUICKCHECK_TRIGGER_WORDS.some(w => trimmed.includes(w));
    if (hasTrigger) return null;

    const plan = createDefaultPlan();
    plan.reasons = ['快速预判：短消息且无触发词，跳过 LLM Router'];
    return plan;
  }

  // ── 动态 Prompt 构建 ─────────────────────────────────
  private buildRouterPrompt(): string {
    const tools = toolRegistry.getEnabledTools();
    const toolLines = tools
      .map(t => '- ' + t.id + ': ' + t.description)
      .join('\n');

    return [
      '你是一个意图路由器，只负责判断需要调用哪些工具，不生成任何回复内容。',
      '',
      '【当前可用工具】',
      toolLines || '（无可用工具）',
      '',
      '【判断规则】',
      '- 用户提到「文件」「文档」「小说」，或消息包含「已上传文件」标记 → imported_docs',
      '- 用户提到「你还记得」「我之前说过」「以前」 → user_memory',
      '- 纯粹的日常聊天、问候、情绪表达，不需要查任何资料 → tools 为空列表',
      '- 只能使用上方工具列表中存在的工具 id',
      '',
      '只返回 JSON，禁止输出任何其他文字：',
      '{"tools": ["工具id"], "complexity": "simple|light|complex", "reason": "简短理由"}',
      '',
      'complexity 定义：',
      '- simple：日常闲聊，不需要查任何工具',
      '- light：需要查 1-2 个工具，内容明确',
      '- complex：需要多工具组合或复杂推理',
    ].join('\n');
  }

  // ── Plan 构建辅助 ────────────────────────────────────
  private buildPlanFromTools(
    toolIds: string[],
    complexity: string,
    reason: string,
  ): OrchestratorPlan {
    const plan = createDefaultPlan();
    plan.reasons = [reason];

    for (const id of toolIds) {
      const tool = toolRegistry.getById(id);
      if (!tool) continue;
      switch (tool.planKey) {
        case 'useImportedDocs': plan.useImportedDocs = true; break;
        case 'useUserMemory': plan.useUserMemory = true; break;
        case 'useWebSearch': plan.useWebSearch = true; break;
        case 'useFileParser': plan.useFileParser = true; break;
      }
    }

    return plan;
  }

  // ── 提取 JSON ────────────────────────────────────────
  private extractJson(text: string): { tools: string[]; complexity: string; reason: string } | null {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  // ── 主路由方法 ───────────────────────────────────────
  async route(
    input: string,
    settings: {
      baseUrl: string;
      model: string;
      apiKey: string;
    },
    callLLM: (
      settings: { baseUrl: string; model: string; apiKey: string },
      messages: Array<{ role: 'system' | 'user'; content: string }>,
      temperature: number,
      timeoutMs: number,
      label: string,
    ) => Promise<string>,
  ): Promise<OrchestratorPlan> {
    const trimmed = input.trim();

    // a. 检查缓存
    const cacheKey = trimmed.slice(0, 80);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('[LLM Router] Input: "' + trimmed.slice(0, 30) + '"');
      console.log('[LLM Router] Tools selected: ' + this.planToolsSummary(cached.plan));
      console.log('[LLM Router] Complexity: (cached)');
      console.log('[LLM Router] Reason: ' + cached.plan.reasons.join(', '));
      console.log('[LLM Router] Source: cache');
      return cached.plan;
    }

    // b. 快速预判
    const quickPlan = this.quickCheck(trimmed);
    if (quickPlan) {
      this.cache.set(cacheKey, { plan: quickPlan, timestamp: Date.now() });
      console.log('[LLM Router] Input: "' + trimmed.slice(0, 30) + '"');
      console.log('[LLM Router] Tools selected: none');
      console.log('[LLM Router] Complexity: simple');
      console.log('[LLM Router] Reason: ' + quickPlan.reasons.join(', '));
      console.log('[LLM Router] Source: quickcheck');
      return quickPlan;
    }

    // c. 调用 LLM API
    try {
      const systemPrompt = this.buildRouterPrompt();
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '用户说：' + trimmed },
      ];

      const raw = await callLLM(settings, messages, 0.1, 10000, 'LLM Router');

      // d. 解析 JSON
      const parsed = this.extractJson(raw);
      if (!parsed || !Array.isArray(parsed.tools)) {
        console.warn('[LLM Router] JSON 解析失败，返回空 Plan。原始返回: ' + raw.slice(0, 200));
        const fallback = createDefaultPlan();
        fallback.reasons = ['LLM Router JSON 解析失败'];
        this.cache.set(cacheKey, { plan: fallback, timestamp: Date.now() });
        return fallback;
      }

      // e. 构建 Plan
      const plan = this.buildPlanFromTools(
        parsed.tools,
        parsed.complexity || 'simple',
        parsed.reason || 'LLM Router 判断',
      );

      // f. 写入缓存
      this.cache.set(cacheKey, { plan, timestamp: Date.now() });

      // 日志
      console.log('[LLM Router] Input: "' + trimmed.slice(0, 30) + '"');
      console.log('[LLM Router] Tools selected: ' + this.planToolsSummary(plan));
      console.log('[LLM Router] Complexity: ' + (parsed.complexity || 'simple'));
      console.log('[LLM Router] Reason: ' + (parsed.reason || 'LLM Router 判断'));
      console.log('[LLM Router] Source: llm');

      return plan;
    } catch (err: unknown) {
      // g. 失败兜底
      const e = err as Error;
      console.error('[LLM Router] LLM 调用失败: ' + (e?.message || String(err)));
      const fallback = createDefaultPlan();
      fallback.reasons = ['LLM Router 调用异常: ' + (e?.message || 'unknown')];
      this.cache.set(cacheKey, { plan: fallback, timestamp: Date.now() });
      return fallback;
    }
  }

  // ── 日志辅助 ─────────────────────────────────────────
  private planToolsSummary(plan: OrchestratorPlan): string {
    const active: string[] = [];
    if (plan.useImportedDocs) active.push('imported_docs');
    if (plan.useUserMemory) active.push('user_memory');
    if (plan.useWebSearch) active.push('web_search');
    return active.length > 0 ? active.join(', ') : 'none';
  }
}

// 全局单例
export const llmRouter = new LlmRouter();
