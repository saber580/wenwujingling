/* 随机走通主线：验证每个分支都走得到终点、不会卡死 */
const fs = require("fs");
const vm = require("vm");
const code = ["js/data.js", "js/data-deep.js", "js/aw-vn.js"].map(f => fs.readFileSync(f, "utf8")).join("\n;\n");
const sb = { console, window: {}, document: { getElementById: () => null, addEventListener: () => {} }, localStorage: { getItem: () => null, setItem: () => {} }, setTimeout: () => {} };
sb.window = sb;

const test = `
;(function(){
  const VN = window.VN, M = VN._main;
  const byId = {}; M.forEach(n => byId[n.id] = n);
  let ok = 0, fail = 0, maxStep = 0, endingsAll = new Set();
  for (let t = 0; t < 300; t++) {
    let cur = "open", step = 0, guard = 0;
    while (guard++ < 400) {
      const n = byId[cur]; if (!n) break;
      step++;
      if (n.kind === "end") break;
      if (n.choices && n.choices.length) {
        const c = n.choices[Math.floor(Math.random() * n.choices.length)];
        if (c.ending) endingsAll.add(c.ending);
        cur = c.to; continue;
      }
      if (!n.next) break;
      cur = n.next;
    }
    if (byId[cur] && byId[cur].kind === "end") ok++; else fail++;
    maxStep = Math.max(maxStep, step);
  }
  console.log("走通 " + ok + "/300 ｜ 失败 " + fail + " ｜ 最长步数 " + maxStep);
  console.log("一次遍历覆盖结局 " + endingsAll.size + " 个");
  // 期望：open(1) + 22站*(hub+cap+win=3) + 终点(1) = 68 步左右
})();
`;
vm.runInNewContext(code + test, sb, { filename: "bundle.js", timeout: 30000 });
