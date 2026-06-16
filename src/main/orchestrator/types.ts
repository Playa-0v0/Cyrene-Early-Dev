// Orchestrator types
export interface OrchestratorPlan {
  useUserMemory: boolean;
  useWorldbook: boolean;
  useImportedDocs: boolean;
  useFileParser: boolean;
  useWebSearch: boolean;
  shouldWriteMemory: boolean;
  shouldReflect: boolean;
  reasons: string[];
  confidence: number;
}

export interface RuleContext {
  userInput: string;
  recentMessages: Array<{ role: string; content: string }>;
  hasImportedDocs: boolean;
  hasWorldbook: boolean;
  hasUserMemory: boolean;
}

export interface Rule {
  name: string;
  priority: number;
  match(ctx: RuleContext): boolean;
  apply(plan: OrchestratorPlan, ctx: RuleContext): void;
}

export function createDefaultPlan(): OrchestratorPlan {
  return {
    useUserMemory: false,
    useWorldbook: false,
    useImportedDocs: false,
    useFileParser: false,
    useWebSearch: false,
    shouldWriteMemory: false,
    shouldReflect: false,
    reasons: [],
    confidence: 1,
  };
}
