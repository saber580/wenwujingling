/**
 * tools/bench_latency.js —— 延迟与稳定性量化测量（可复现）
 *
 * 用法：  node tools/bench_latency.js
 * 说明：  复用 run_eval.js 的最小 window 环境，真实加载 data.js →
 *         content-pack.js → kb-rag.js，对「确定层」做多轮采样测量：
 *          1) RAG 检索延迟：BM25 单路 vs 双路 RRF，采样 N 轮取
 *             均值 / 标准差（稳定性）/ P50 / P95
 *          2) KB.search 的耗时分布（冷启动 vs 热查询）
 *        云端大模型的端到端延迟依赖真实密钥与网络，不在本脚本内
 *        伪造，由 docs/输出稳定性与延迟量化报表.md 用实测方法说明。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const fakeDocument = {
  body: { classList: { contains: () => false } },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, getContext: () => null }),
  addEventListener: () => {}
};

const sandbox = {
  window: null,
  document: fakeDocument,
  console,
  setTimeout,
  clearTimeout,
  Promise,
  JSON,
  Math,
  Date,
  RegExp,
  parseInt,
  parseFloat,
  isNaN,
  Array,
  Object,
  String,
  Number,
  Boolean
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.requestIdleCallback = (fn) => { try { fn({ didTimeout: false }); } catch (e) {} return 1; };
sandbox.window.cancelIdleCallback = () => {};
sandbox.window.addEventListener = () => {};
sandbox.window.dispatchEvent = () => {};
sandbox.window.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };

const ctx = vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  vm.runInContext(code, ctx, { filename: file });
}

load("js/data.js");
load("js/content-pack.js");
load("js/kb-rag.js");

const KB = sandbox.window.KB;
if (!KB) { console.error("✗ window.KB 未挂载"); process.exit(1); }

// 采样问题集：覆盖短词 / 长句 / 语义改写 / 英文词 / 数字
const QUERIES = [
  "铁狮子",
  "长信宫灯",
  "错金银博山炉",
  "满城汉墓出土了什么",
  "青铜器的失蜡法",
  "who made the changxin lamp",
  "48厘米 15公斤",
  "燕赵",
  "汝窑天青釉",
  "中山王"
];

function stats(arr) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const n = a.length;
  const mean = a.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) * (x - mean), 0) / n);
  const p = (q) => a[Math.min(n - 1, Math.floor(q * n))];
  return { n, mean, sd, p50: p(0.5), p95: p(0.95), min: a[0], max: a[n - 1] };
}

function bench(fn, rounds) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6); // ms
  }
  return stats(samples);
}

// 预热：触发 KB 索引构建（首次 rebuild 会一次性建 BM25 + LSA）
console.log("预热索引构建中…");
const warm0 = process.hrtime.bigint();
KB.rebuild();
const warm1 = process.hrtime.bigint();
console.log("索引构建耗时:", (Number(warm1 - warm0) / 1e6).toFixed(2), "ms\n");

const ROUNDS = 20;

console.log("========== 文物精灵 · 延迟与稳定性量化测量 ==========\n");

// 1) 热查询单轮（BM25 单路，k=5）
const singleLat = [];
for (const q of QUERIES) {
  const s = bench(() => KB.search(q, 5, { channel: "bm25" }), ROUNDS);
  singleLat.push({ q, s });
}
const allSingle = [].concat(...singleLat.map(x => x.s ? [x.s.mean] : []));
console.log("【RAG 检索 · BM25 单路】k=5，每问采样", ROUNDS, "轮");
singleLat.forEach(x => {
  console.log("  " + x.q.padEnd(18) + "  均值 " + x.s.mean.toFixed(3) + "ms  σ=" + x.s.sd.toFixed(3) + "ms  P95=" + x.s.p95.toFixed(3) + "ms");
});
console.log("  汇总:", stats(allSingle).mean.toFixed(3), "ms（均值）  σ=" + stats(allSingle).sd.toFixed(3), "ms\n");

// 2) 双路 RRF（默认，bm25 + lsa-dense）
const dualLat = [];
for (const q of QUERIES) {
  const s = bench(() => KB.search(q, 5, {}), ROUNDS);
  dualLat.push({ q, s });
}
const allDual = [].concat(...dualLat.map(x => x.s ? [x.s.mean] : []));
console.log("【RAG 检索 · 双路 RRF】k=5，每问采样", ROUNDS, "轮");
dualLat.forEach(x => {
  console.log("  " + x.q.padEnd(18) + "  均值 " + x.s.mean.toFixed(3) + "ms  σ=" + x.s.sd.toFixed(3) + "ms  P95=" + x.s.p95.toFixed(3) + "ms");
});
console.log("  汇总:", stats(allDual).mean.toFixed(3), "ms（均值）  σ=" + stats(allDual).sd.toFixed(3), "ms\n");

// 3) 稳定性：同题多轮重测的答案一致性（返回结果条数 / top1 是否稳定）
console.log("【输出稳定性 · 同题重测】每问重测", ROUNDS, "轮，看 top1 是否一致");
QUERIES.forEach(q => {
  const tops = [];
  for (let i = 0; i < ROUNDS; i++) {
    const r = KB.search(q, 1, {});
    tops.push(r && r[0] ? (r[0].id || r[0].name || r[0].sid || "hit") : "miss");
  }
  const uniq = new Set(tops);
  const stable = uniq.size === 1;
  console.log("  " + q.padEnd(18) + " top1 稳定 " + (stable ? "✓" : "✗") + "  唯一结果数=" + uniq.size);
});

console.log("\n========================================================");
console.log("说明：以上为「确定层」（本地检索/索引）的真实延迟，可离线复现。");
console.log("云端大模型端到端延迟见 docs/输出稳定性与延迟量化报表.md 的方法与说明。");

// 输出 JSON 供报表引用
const out = {
  generated_at: new Date().toISOString(),
  index_build_ms: Number(warm1 - warm0) / 1e6,
  bm25_single: stats(allSingle),
  dual_rrf: stats(allDual),
  per_query: QUERIES.map((q, i) => ({
    q,
    bm25_ms: singleLat[i].s.mean,
    bm25_sd: singleLat[i].s.sd,
    dual_ms: dualLat[i].s.mean,
    dual_sd: dualLat[i].s.sd
  }))
};
fs.writeFileSync(path.join(ROOT, "docs", "latency_results.json"), JSON.stringify(out, null, 2), "utf8");
console.log("\n已写入 docs/latency_results.json");
