/**
 * cloud-ai.js —— 云端 AI 统一接入层 类型声明
 * 职责：统一 identFetchCloud、SSE 流式、tools 透传、tool_calls 分片拼装、失败切模型。
 * 该模块是前端唯一访问云端大模型的入口，屏蔽了多模型适配与流式解析细节。
 */

export interface CloudMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: CloudToolCall[];
}

export interface CloudToolCall {
  index?: number;
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface CloudToolResult {
  tool_call_id: string;
  name: string;
  content: string;
}

/** 一次流式对话的完整返回 */
export interface CloudChatResult {
  ok: boolean;
  text: string;
  model: string;
  error?: string;
  /** 分段拼接后的工具调用（按 index 归位） */
  toolCalls?: CloudToolCall[];
  /** 推理/思考过程（若模型返回） */
  reasoning?: string;
}

export interface CloudStreamOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** 透传给模型的工具定义列表 */
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  /** 流式增量回调 */
  onDelta?: (delta: string, full: string) => void;
  signal?: AbortSignal;
}

declare global {
  interface Window {
    /** 云端 AI 核心对象（含模型列表、能力探测、连接状态） */
    WorkBuddyCloud: WorkBuddyCloudInstance;
    /** 云端 Agent 流式对话（返回完整结果） */
    cloudAgentStream: (payload: unknown, opts?: CloudStreamOptions) => Promise<CloudChatResult>;
    /** 云端普通对话流式 */
    cloudChatStream: (payload: unknown, opts?: CloudStreamOptions) => Promise<CloudChatResult>;
    /** 探测云端桥接是否在线 */
    identCloudPing: () => Promise<boolean>;
    /** 统一云端请求入口（非流式） */
    identFetchCloud: (payload: unknown) => Promise<unknown>;
    /** 云端桥接预热 */
    wjCloudWarm: () => void;
    /** 轻提示 */
    wjToast: (msg: string, type?: "info" | "ok" | "warn" | "err") => void;
    /** 打字机效果渲染 */
    wjTypewriter: (el: Element, text: string, speed?: number) => void;
  }
}

export interface WorkBuddyCloudInstance {
  models: Array<{
    id: string;
    name: string;
    supportsImages?: boolean;
    capabilities?: { vision?: boolean; images?: boolean };
  }>;
  /** 当前可用模型 id */
  activeModel: string;
  /** 连接状态 */
  connected: boolean;
  /** 切换模型 */
  setModel: (id: string) => void;
}
