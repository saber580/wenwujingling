/**
 * safety.js —— AI 输出安全与可控性 类型声明
 * 职责：输入侧提示注入/越权/敏感/PII 过滤；输出侧悬空引用与无依据硬数字检查。
 * 每条拦截记入 stats，支持消融实验（关 input_guard / output_guard）。
 */

export type GuardAction = "pass" | "redact" | "block" | "clean";

export interface GuardInputResult {
  ok: boolean;
  action: GuardAction;
  /** 处理后的文本 */
  text: string;
  /** 命中的规则名列表 */
  rules: string[];
  /** 若拦截，返回给用户的兜底话术 */
  reply: string;
}

export interface GuardOutputResult {
  ok: boolean;
  text: string;
  rules: string[];
  action?: GuardAction;
  /** 移除的悬空引用数 */
  dangling?: string[];
  /** 标记的无依据硬数字 */
  unsupported?: string[];
}

export interface GuardStats {
  inputChecked: number;
  inputBlocked: number;
  inputRedacted: number;
  outputChecked: number;
  outputCleaned: number;
  danglingRefs: number;
  unsupportedNumbers: number;
  byRule: Record<string, number>;
}

export interface WJSafetyInstance {
  version: "guard-1.0";
  checkInput: (text: string) => GuardInputResult;
  checkOutput: (text: string, refs?: unknown) => GuardOutputResult;
  stats: () => GuardStats;
  reset: () => void;
  patterns: {
    injection: number;
    override: number;
    sensitive: number;
    leak: number;
    pii: number;
  };
}

declare global {
  interface Window {
    WJSafety: WJSafetyInstance;
  }
}
