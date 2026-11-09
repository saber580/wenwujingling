/* 校验 aw-vn.js 主线完整性：断链 / 精灵 id / 站点 id / 坐标重叠 / 三分支 */
const fs = require("fs");
const vm = require("vm");

const files = ["js/data.js", "js/data-deep.js", "js/aw-vn.js"];
const code = files.map(f => fs.readFileSync(f, "utf8")).join("\n;\n");

const sandbox = {
  console,
  window: {},
  document: { getElementById: () => null, addEventListener: () => {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  setTimeout: () => {},
  fetch: undefined,
  SPIRITS: undefined,
  STATIONS: undefined,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

const test = `
;(function(){
  const VN = window.VN;
  if (!VN) { console.log("FAIL: window.VN 未挂载"); return; }
  const M = VN._main, S = VN._stations;
  const idSet = new Set(M.map(n => n.id));
  const out = [];
  let bad = 0;

  out.push("节点总数 " + M.length + " ｜ 站点数 " + S.length);

  // 1. 断链
  M.forEach(n => {
    if (n.next && !idSet.has(n.next)) { out.push("断链 next: " + n.id + " -> " + n.next); bad++; }
    (n.choices || []).forEach(c => {
      if (c.to && !idSet.has(c.to)) { out.push("断链 choice: " + n.id + " -> " + c.to); bad++; }
    });
  });

  // 2. 精灵 id
  const spMiss = {};
  M.forEach(n => {
    const ids = [];
    if (n.speaker) ids.push(n.speaker);
    (n.lines || []).forEach(l => { if (l.id) ids.push(l.id); });
    ids.forEach(id => { if (!SPIRITS[id]) spMiss[id] = (spMiss[id] || 0) + 1; });
  });
  const miss = Object.keys(spMiss);
  if (miss.length) { out.push("SPIRITS 缺失: " + miss.join(", ")); bad++; }

  // 3. 站点 id
  S.forEach(s => { if (!STATIONS.find(x => x.id === s.id)) { out.push("STATIONS 缺失: " + s.id); bad++; } });

  // 4. 每站三分支 + 三个结局
  S.forEach(s => {
    const caps = M.filter(n => n.station === s.id && n.kind === "capture");
    if (caps.length !== 3) { out.push("站点三方向不足: " + s.id + " = " + caps.length); bad++; }
    const ends = caps.map(c => c.choices && c.choices[0] && c.choices[0].ending).filter(Boolean);
    if (new Set(ends).size !== 3) { out.push("结局不唯一: " + s.id + " -> " + ends.join(",")); bad++; }
  });

  // 5. 可达性（从 open 出发）
  const seen = new Set(["open"]); const q = ["open"];
  while (q.length) {
    const id = q.shift(); const n = M.find(x => x.id === id); if (!n) continue;
    const nx = [];
    if (n.next) nx.push(n.next);
    (n.choices || []).forEach(c => c.to && nx.push(c.to));
    nx.forEach(t => { if (!seen.has(t)) { seen.add(t); q.push(t); } });
  }
  const unreach = M.filter(n => !seen.has(n.id)).map(n => n.id);
  if (unreach.length) { out.push("从 open 不可达: " + unreach.slice(0, 12).join(", ")); bad++; }

  // 6. 终点
  const ends2 = M.filter(n => n.kind === "end");
  out.push("终点节点 " + ends2.map(n => n.id).join(","));

  // 7. 坐标重叠（同一站内相邻节点卡片 132x60）
  let ov = 0;
  for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
    const a = M[i], b = M[j];
    if (Math.abs(a.x - b.x) < 120 && Math.abs(a.y - b.y) < 56) { ov++; if (ov <= 5) out.push("节点过近: " + a.id + " / " + b.id); }
  }
  if (ov) { out.push("重叠对数 " + ov); bad++; }

  // 8. 台词长度检查
  let tooLong = 0, empty = 0;
  M.forEach(n => (n.lines || []).forEach(l => {
    if (!l.x || !String(l.x).trim()) empty++;
    if (String(l.x).length > 120) { tooLong++; out.push("过长(" + String(l.x).length + "): " + n.id); }
  }));

  // 9. 统计
  let lineCnt = 0, charCnt = 0;
  M.forEach(n => (n.lines || []).forEach(l => { lineCnt++; charCnt += String(l.x).length; }));
  out.push("台词行 " + lineCnt + " ｜ 字数 " + charCnt + " ｜ 空行 " + empty + " ｜ 超长 " + tooLong);
  out.push(bad === 0 ? "✅ 全部通过" : "❌ 问题数 " + bad);
  console.log(out.join("\\n"));
})();
`;

try {
  vm.runInNewContext(code + test, sandbox, { filename: "bundle.js", timeout: 20000 });
} catch (e) {
  console.log("RUN ERROR:", e.message);
  console.log(String(e.stack || "").split("\n").slice(0, 6).join("\n"));
}
