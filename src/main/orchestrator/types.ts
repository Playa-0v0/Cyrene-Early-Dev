// Orchestrator types

// ToolCallResult: 单次工具调用的结果
export interface ToolCallResult {
  toolId: string;
  args: Record<string, unknown>;
  output: string;
}

export interface RuleContext {
  userInput: string;
  recentMessages: Array<{ role: string; content: string }>;
  hasImportedDocs: boolean;
  hasWorldbook: boolean;
  hasUserMemory: boolean;
}

// Rule 的 apply 不再接收 OrchestratorPlan，改为直接返回工具调用列表
export interface Rule {
  name: string;
  priority: number;
  match(ctx: RuleContext): boolean;
  apply(ctx: RuleContext): Array<{ toolId: string; args: Record<string, unknown> }>;
}
