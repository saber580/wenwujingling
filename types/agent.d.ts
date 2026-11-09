/**
 * agent.js —— 文物精灵 Agent v2 类型声明
 * 职责：规划(plan) → 并行执行(parallel) → 反思(reflect) → 收尾。
 * 引用角标跨多次检索统一重编号；上限 4 轮 / 9 次调用。
 */

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  note?: string;
}

export interface AgentPlan {
  goal: string;
  steps: AgentStep[];
  /** 是否并行预取 */
  parallel: boolean;
  source: string;
}

export interface AgentPhase {
  phase: "plan" | "act" | "reflect" | "finish";
  goal?: string;
  steps?: AgentStep[];
  round?: number;
  enough?: boolean;
  next_tool?: string;
}

export interface AgentTraceEntry {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  note?: string;
}

export interface AgentResult {
  ok: boolean;
  text: string;
  /** 实际执行轮数 */
  rounds: number;
  /** 用到的工具名列表 */
  toolsUsed: string[];
  model: string;
  trace: AgentTraceEntry[];
  /** 毫秒耗时 */
  ms: number;
  plan: AgentPlan;
  phases: AgentPhase[];
  reflections: Array<{ enough: boolean; next_tool: string }>;
  /** 引用角标统一重编号后的结果 */
  citations: Array<{ index: number; ref: string }>;
  guard?: unknown;
  prompt_version?: string;
  mcp?: { connected: boolean };
  /** 并行批次数 */
  parallelBatches: number;
  error?: string;
}

export interface AgentSelfTestResult {
  ok: boolean;
  passed: number;
  total: number;
  items: Array<{ tool: string; ok: boolean; note: string }>;
}

export interface WJAgentInstance {
  version: "agent2";
  ask: (q: string, opt?: { maxRounds?: number }) => Promise<AgentResult>;
  selfTest: () => Promise<AgentSelfTestResult>;
  toolNames: () => string[];
  limits: { maxRounds: number; maxCalls: number; maxReflect: number };
  config: () => Record<string, unknown>;
}

declare global {
  interface Window {
    WJAgent: WJAgentInstance;
  }
}
