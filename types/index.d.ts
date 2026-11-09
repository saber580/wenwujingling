/**
 * 文物精灵 —— 核心 AI 链路 TypeScript 类型声明汇总
 *
 * 说明：本项目前端以「原生 HTML/CSS/JS、零构建」为设计约束，
 * 双击 index.html 即可运行，便于课堂演示与二开。为确保 AI 核心链路的
 * 可维护性与类型安全，以下四个模块提供手写 .d.ts 类型声明，供
 * TypeScript 项目引用与 IDE 智能提示：
 *
 *   - cloud-ai.d.ts  云端大模型统一接入层
 *   - agent.d.ts     Agent v2 规划/并行/反思编排
 *   - kb-rag.d.ts    站内本地检索 + 引用溯源
 *   - safety.d.ts    AI 输出安全与可控性护栏
 *
 * 引用方式（在任意 .ts 文件中）：
 *   import type { AgentResult } from "./types/agent";
 *   import type { KBInstance } from "./types/kb-rag";
 */

export {};
