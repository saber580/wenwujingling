/* =========================================================
   文物精灵 · 构建服务端知识索引
   ---------------------------------------------------------
   为什么要有这一步：
     真 MCP server 自己得能查资料。如果它只是把前端算好的结果转发回来，
     那不叫 server，叫回声。这里把 js/data.js 与 js/content-pack.js 里的
     站内知识导出成一份与语言无关的 JSON，Python 侧据此独立实现 6 个工具
     和双路召回，前端与服务端共用同一份事实来源。

   用法：node tools/build_kb_index.js
   产物：mcp/kb_index.json
   ========================================================= */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function load(file, ctx) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
}

const ctx = {
  console,
  window: {},
  document: {},
  localStorage: { getItem: () => null, setItem: () => {} },
  performance: { now: () => Date.now() }
};
ctx.window = ctx;
vm.createContext(ctx);
load("js/data.js", ctx);
load("js/content-pack.js", ctx);

const SPIRITS = ctx.SPIRITS || ctx.window.SPIRITS;
const CONTENT = ctx.CONTENT || ctx.window.CONTENT;
const ATTR = ctx.ATTRIBUTES || ctx.window.ATTRIBUTES;
if (!SPIRITS || !CONTENT) throw new Error("数据没加载成功，检查 data.js / content-pack.js 的导出");

const clip = (s, n) => {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

/* ---------- 片段切片：与前端 kb-rag.js 的 addDoc 保持同一套切法 ----------
   这样「服务端检索」和「页面内检索」给出的片段可以逐条对照，
   答辩时可以直接说：两条通道共用一套语料与字段权重。 */
const documents = [];
let seq = 0;
function addDoc(sid, sname, field, text) {
  text = String(text || "").trim();
  if (!text) return;
  documents.push({
    id: "D" + (++seq).toString().padStart(5, "0"),
    sid, sname, field, text: clip(text, 800)
  });
}

const relics = [];
for (const id of Object.keys(SPIRITS)) {
  const s = SPIRITS[id];
  if (!s || !s.name) continue;
  relics.push({
    id: s.id || id,
    name: s.name || s.relicName || "",
    alias: s.alias || "",
    relicName: s.relicName || "",
    era: s.era || "",
    primary: s.primary || "",
    secondary: s.secondary || "",
    intro: s.intro || "",
    history: s.history || "",
    comic: Array.isArray(s.comic) ? s.comic : [],
    knowledge: (s.knowledge || []).map(k => ({ keys: k.keys || [], a: k.a || "" })),
    quiz: (s.quiz || []).map(q => ({ q: q.q || "", tip: q.tip || "" }))
  });

  addDoc(id, s.name, "intro", s.intro);
  addDoc(id, s.name, "history", s.history);
  addDoc(id, s.name, "alias", [s.alias, s.relicName, s.era].filter(Boolean).join(" "));
  (s.knowledge || []).forEach(k => {
    addDoc(id, s.name, "knowledge", ((k.keys || []).join(" ") + " " + (k.a || "")).trim());
  });
  (s.quiz || []).forEach(q => addDoc(id, s.name, "quiz", (q.q || "") + " " + (q.tip || "")));
  (s.comic || []).forEach(c => addDoc(id, s.name, "comic", c));
}

/* 工艺、辨析、语料各自也进检索池，让「失蜡法是什么」这类问题能命中 */
(CONTENT.craft || []).forEach((c, i) => {
  addDoc("craft:" + i, "工艺·" + c.n, "craft",
    [c.n, c.aka, c.era, c.how, "代表作：" + c.rep, "辨析：" + c.vs].filter(Boolean).join("。"));
});
(CONTENT.confuse || []).forEach((c, i) => {
  addDoc("confuse:" + i, "辨析·" + (c.n || c.name || ""), "confuse",
    JSON.stringify(c).replace(/[{}"]/g, " ").replace(/:/g, "：").slice(0, 600));
});
(CONTENT.cmp || []).forEach((g, i) => {
  addDoc("cmp:" + i, "对比·" + (g.title || ""), "compare",
    [g.title, g.axis, (g.items || []).map(x => x.name + "：" + x.edge).join("；"),
      g.verdict].filter(Boolean).join("。").slice(0, 700));
});

const out = {
  schema: "relic-kb-index/1.0",
  builtAt: new Date().toISOString(),
  source: ["js/data.js", "js/content-pack.js"],
  counts: {
    relics: relics.length,
    documents: documents.length,
    crafts: (CONTENT.craft || []).length,
    comparisons: (CONTENT.cmp || []).length,
    confusions: (CONTENT.confuse || []).length
  },
  attributes: {
    primary: Object.keys((ATTR && ATTR.primary) || {}).reduce((o, k) => {
      o[k] = (ATTR.primary[k] || {}).name || k;
      return o;
    }, {})
  },
  relics,
  crafts: CONTENT.craft || [],
  comparisons: CONTENT.cmp || [],
  confusions: CONTENT.confuse || [],
  corpus: CONTENT.corpus || [],
  documents
};

const dest = path.join(ROOT, "mcp", "kb_index.json");
fs.writeFileSync(dest, JSON.stringify(out), "utf8");
console.log("已生成 " + dest);
console.log("  " + JSON.stringify(out.counts));
console.log("  " + (fs.statSync(dest).size / 1024).toFixed(0) + " KB");
