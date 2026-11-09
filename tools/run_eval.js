/**
 * tools/run_eval.js —— 离线跑「AI 评测台」金标集，产出可复现指标
 *
 * 用法：  node tools/run_eval.js
 * 说明：  在 Node 里模拟最小 window 环境，按 index.html 顺序加载
 *         data.js → content-pack.js → kb-rag.js → eval-bench.js，
 *         真实执行 EVAL.run()，把 hit@1 / MRR / 门控 / 事实核验等
 *         确定层指标打印出来（不含云端大模型本身的端到端准确率）。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

// 最小 DOM mock
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
  try {
    vm.runInContext(code, ctx, { filename: file });
  } catch (e) {
    console.error("✗ 加载失败:", file, "→", e.message);
    process.exit(1);
  }
}

// 按 index.html 的加载顺序
load("js/data.js");
load("js/content-pack.js");
load("js/kb-rag.js");
load("js/eval-bench.js");

const EVAL = sandbox.window.EVAL;
if (!EVAL) {
  console.error("✗ window.EVAL 未挂载");
  process.exit(1);
}

const result = EVAL.run();

console.log("========== 文物精灵 · AI 评测台（离线金标集） ==========");
console.log("评测时间:", result.at);
console.log("总耗时:", result.ms, "ms");
console.log("用例总数:", result.total, " | 通过:", result.pass, " | 总通过率:", (result.rate * 100).toFixed(1) + "%");
console.log("----------------------------------------------------------");
result.groups.forEach((g) => {
  const pct = (g.rate * 100).toFixed(1);
  console.log(
    "[" + g.name + "]".padEnd(18) +
    String(g.pass + "/" + g.total).padStart(8) +
    "  通过率 " + pct.padStart(6) + "%"
  );
});
console.log("----------------------------------------------------------");
console.log("检索命中率 hit@1 / MRR 等细分指标见各分组 metrics：");
result.groups.forEach((g) => {
  if (g.metrics && g.metrics.length) {
    console.log("  · " + g.name + ": " + g.metrics.map((m) => m.k + "=" + m.v).join(", "));
  }
});
console.log("==========================================================");
console.log("说明：本指标仅覆盖「模型之外、我们自研的确定层」——检索、门控、");
console.log("事实核验、识别对账、出题校验、判卷等，可离线复现。云端大模型");
console.log("本身的端到端准确率不在此列（需联网与密钥，会随模型版本漂移）。");
