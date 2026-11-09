/**
 * kb-rag.js —— 站内本地检索 + 引用溯源 类型声明
 * 职责：前端本地知识库（74 件文物 / 1484 段档案）的检索与引用核验，
 * 与后端 mcp/hybrid_rag.py 的双路召回互补。前端兜底，保障离线可用。
 */

export interface KbHit {
  sid: string;
  name: string;
  alias?: string;
  score: number;
  field?: string;
  snippet?: string;
}

export interface KbEvidence {
  docId: string;
  name: string;
  /** 命中字段（自述/问答/考点/来历等） */
  field: string;
  /** 出处原文摘录 */
  text: string;
}

export interface KbSearchResult {
  hits: KbHit[];
  took: number;
}

export interface KbCheckResult {
  ok: boolean;
  /** 是否需要站内档案兜底（grounding） */
  ground: boolean;
  reason?: string;
}

export interface KBInstance {
  version: "kb3";
  build: () => void;
  rebuild: () => void;
  search: (q: string, k?: number, opt?: Record<string, unknown>) => KbSearchResult;
  searchSpirits: (q: string, k?: number) => KbHit[];
  evidence: (hit: KbHit) => KbEvidence;
  /** 判断问题是否应落到站内档案 */
  shouldGround: (q: string) => boolean;
  check: (q: string) => KbCheckResult;
  verifyQuestion: (q: string) => unknown;
  gradeOpen: (q: string) => unknown;
  followUp: (q: string) => unknown;
  gradeMerged: (q: string) => unknown;
  compare: (a: string, b: string) => unknown;
  compareEvidence: (a: string, b: string) => unknown;
  craftEvidence: (name: string) => unknown;
  craftList: (material?: string) => unknown;
  confuseHint: (name: string) => unknown;
  openQuestion: (q: string) => unknown;
  coreName: (q: string) => string;
  openPoints: (q: string) => unknown;
  histFacts: (era: string) => unknown;
  histText: (era: string) => unknown;
  eraName: (era: string) => string;
  subjectOk: (q: string) => boolean;
  describeCheck: (q: string) => unknown;
  selfTest: () => unknown;
  stats: () => Record<string, unknown>;
}

export interface ContentInstance {
  [key: string]: unknown;
}

declare global {
  interface Window {
    KB: KBInstance;
    CONTENT: ContentInstance;
  }
}
