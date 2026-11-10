/* 主线新机制冒烟测试：支线入口 / 对战结算回写 / 随机事件接续
   不依赖浏览器，用假 DOM 跑 VN 的真实流程。 */
const fs = require("fs");
const vm = require("vm");

const host = { innerHTML: "", clientWidth: 1280, clientHeight: 800, style: {} };
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 1280, height: 800, top: 0, left: 0 }) });

const sandbox = {
  console,
  document: {
    getElementById: (id) => (id === "vn-host" ? host : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: el,
    addEventListener() {},
    body: { appendChild() {}, style: {} },
  },
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } },
  setTimeout: () => {},
  clearTimeout: () => {},
  requestAnimationFrame: () => {},
  fetch: undefined,
  Math: Object.create(Math),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.host = host;

const code = ["js/data.js", "js/data-deep.js", "js/aw-vn.js"].map(f => fs.readFileSync(f, "utf8")).join("\n;\n");

const test = `
;(function(){
  const VN = window.VN, S = VN._state, M = VN._main;
  let bad = 0;
  const ok = (cond, msg) => { if (!cond) { console.log("❌ " + msg); bad++; } else console.log("✅ " + msg); };
  const readAll = (n) => { for (let i = 0; i < n; i++) VN.advance(); };
  const btnCount = () => (host.innerHTML.match(/class="vn-choice[ "]/g) || []).length;

  // 1) 到站节点：三方向 + 支线 = 4 个入口
  VN.open("bd_hub"); readAll(40);
  ok(btnCount() === 3, "保定到站仍是 3 个方向（支线移到顶栏，不挤选项），实际 " + btnCount());
  ok(host.innerHTML.indexOf('onclick="VN.side()"') >= 0, "顶栏支线入口存在");

  // 2) 支线：进入 → 读完后自动回 hub，且本次收起入口
  VN.side();
  ok(S.sideMode === "bd_hub", "支线进入后记住返回点");
  ok(S.quests.baoding === 1, "支线完成写入 quests.baoding");
  readAll(30);
  ok(S.current === "bd_hub" && !S.sideMode, "支线读完回到 bd_hub");
  ok(host.innerHTML.indexOf('onclick="VN.side()"') < 0, "回到 hub 后支线入口收起");

  // 3) 捕捉节点：按钮文案是「迎战 · 捕捉」，且带 battle 标记
  VN.open("bd_c1"); readAll(30);
  ok(host.innerHTML.indexOf("迎战 · 捕捉") >= 0, "捕捉节点出现「迎战 · 捕捉」");
  ok(M.find(n => n.id === "bd_c1").choices[0].battle === "changxin", "捕捉节点绑定精灵 id");

  // 4) 没有对战模块时的降级：直接结缘，主线不断
  const beforeEnd = Object.keys(S.endings).length;
  VN.choose(0);
  ok(S.current === "bd_win", "对战成功后进入结缘节点，实际 " + S.current);
  ok(Object.keys(S.endings).length === beforeEnd + 1, "结局解锁 +1");

  // 5) 战败：留在原地补两句，再给一次机会
  VN.open("bd_c2");
  const baseLen = M.find(n => n.id === "bd_c2").lines.length;
  S.pending = { to: "bd_win", ending: "bd_e2", sp: "jinyuyi" };
  VN.battleDone(false);
  ok(S.current === "bd_c2", "战败后仍停在原节点");
  ok(S.nodeLines.length === baseLen + 2, "战败后追加两句（" + baseLen + " → " + S.nodeLines.length + "）");
  ok(btnCount() === 1, "战败后仍可再次迎战，实际 " + btnCount());

  // 6) 随机事件：必触发时，走完节点先进事件，事件读完接回原路线
  const rnd = Math.random;
  Math.random = () => 0;
  VN.open("bd_win");
  let seenEv = false, g1 = 0;
  while (g1++ < 60) { VN.advance(); if (String(S.current).indexOf("_ev") > 0) { seenEv = true; break; } }
  ok(seenEv, "节点结束后自动插入随机事件，实际 " + S.current);
  let g2 = 0;
  while (g2++ < 60 && String(S.current).indexOf("_ev") > 0) VN.advance();
  ok(S.current === "zjk_hub", "事件读完接回下一站，实际 " + S.current);
  Math.random = rnd;

  console.log(bad === 0 ? "\\n✅ 全部通过" : "\\n❌ 问题数 " + bad);
})();
`;

try {
  vm.runInNewContext(code + test, sandbox, { filename: "vn-flow.js", timeout: 20000 });
} catch (e) {
  console.log("RUN ERROR:", e.message);
  console.log(String(e.stack || "").split("\n").slice(0, 8).join("\n"));
}
