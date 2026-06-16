// 工具注册表 — 统一管理所有可被 LLM Router 调度的工具
// Worldbook 不在此注册，它走独立常驻检索路径

export interface ToolDefinition {
  id: string;           // 工具唯一标识，如 "imported_docs"
  name: string;         // 展示名，如 "导入文档"
  description: string;  // 一句话描述，供 LLM Router 的 Prompt 使用
  enabled: boolean;     // 用户是否启用（对应设置面板的开关）
  planKey: string;      // 对应 OrchestratorPlan 里的字段名
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  setEnabled(id: string, enabled: boolean): void {
    const tool = this.tools.get(id);
    if (tool) {
      tool.enabled = enabled;
    }
  }

  getEnabledTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.enabled);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getById(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }
}

// 全局单例
export const toolRegistry = new ToolRegistry();

// 注册内置工具（worldbook 不在此，走独立路径）
toolRegistry.register({
  id: 'imported_docs',
  name: '导入文档',
  description: '查询用户上传导入的文档、小说、文件的具体内容。当用户提到「文件」「文档」「小说」，或消息中包含「已上传文件」标记时使用。',
  enabled: true,
  planKey: 'useImportedDocs',
});

toolRegistry.register({
  id: 'user_memory',
  name: '用户记忆',
  description: '查询用户的历史记忆、个人信息、过往对话提到的内容。当用户说「你还记得」「我之前说过」「以前」等时使用。',
  enabled: true,
  planKey: 'useUserMemory',
});

toolRegistry.register({
  id: 'web_search',
  name: '网络搜索',
  description: '搜索互联网上的实时信息，如新闻、天气、最新数据等。',
  enabled: false,
  planKey: 'useWebSearch',
});
