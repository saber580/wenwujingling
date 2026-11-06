/* =========================================================
   文物精灵 · 反馈闭环（👍 / 👎 → 坏例库）
   ---------------------------------------------------------
   为什么要有：
     站内所有 AI 输出此前都是一次性的：答完就散，错在哪没人知道。
     这样一来「系统怎么变好」只能回答「我们改代码」，不是闭环。

   这条链路的四步：
     收集（本文件）→ 归集（坏例库）→ 标注（人工挑真错的）→ 回流（进评测集）
     前两步在浏览器里完成，后两步给出入口（导出 JSON / 一键复制成用例骨架），
     不假装能自动变好——那不真实。

   存储：
     默认写 localStorage（纯静态站也能用，跨刷新保留）；
     若页面设了 window.FB_ENDPOINT，会额外 POST 一份到服务端，失败不影响本地记录。
   ========================================================= */
(function () {
  "use strict";

  var KEY = "relic.fb.v1";
  var MAX = 300;
  var REG = {};          /* 临时暂存：id -> 该条回答的上下文（不落盘，只活在本页） */
  var SEQ = 0;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) {}
  }

  /* ---------------- 徽章：给一条回答挂上「有用 / 没用」 ---------------- */
  /* kind: aq(小答) / ident(识别) / open(判卷) / tea(茶话会)
     meta: {q, a, model, light} —— 存下来的是差评时能复现的最小信息集 */
  function foot(kind, meta) {
    var id = "f" + (++SEQ) + "_" + Date.now().toString(36);
    REG[id] = meta || {};
    var light = (meta && meta.light) ? meta.light : "";
    return '<div class="fb-foot" id="' + id + '" data-kind="' + kind + '" data-light="' + light + '">' +
      '<span class="fb-q">这条回答有用吗</span>' +
      '<button type="button" class="fb-b" onclick="FB.vote(\'' + id + '\',1)">👍 有用</button>' +
      '<button type="button" class="fb-b" onclick="FB.vote(\'' + id + '\',-1)">👎 不对</button>' +
      '</div>';
  }

  function el(id) { return document.getElementById(id); }

  /* 点了 👎 才问原因：三个选项覆盖绝大多数情况，不让用户打字 */
  function vote(id, v) {
    var box = el(id);
    var meta = REG[id] || {};
    if (!box || box.dataset.done) return;
    if (v > 0) {
      record(id, box.dataset.kind, meta, 1, "");
      box.dataset.done = "1";
      box.innerHTML = '<span class="fb-done">✅ 记下了，谢谢</span>';
      return;
    }
    box.dataset.vote = "-1";
    box.innerHTML = '<span class="fb-q">哪里不对</span>' +
      ['说得不对', '没答到点上', '太啰嗦'].map(function (r) {
        return '<button type="button" class="fb-b" onclick="FB.voteWhy(\'' + id + '\',\'' + r + '\')">' + r + '</button>';
      }).join("");
  }

  function voteWhy(id, why) {
    var box = el(id);
    if (!box) return;
    record(id, box.dataset.kind, REG[id] || {}, -1, why);
    box.dataset.done = "1";
    box.innerHTML = '<span class="fb-done">✅ 已进坏例库，会在评测台里汇总</span>';
  }

  function record(id, kind, meta, v, why) {
    var list = load();
    list.push({
      t: new Date().toISOString().slice(0, 16).replace("T", " "),
      kind: kind || "aq", v: v, why: why || "",
      q: String(meta.q || "").slice(0, 200),
      a: String(meta.a || "").slice(0, 400),
      model: String(meta.model || ""),
      light: String(meta.light || "")
    });
    save(list);
    /* 有服务端就顺手上报一份；没有也不报错，纯本地照样能导出 */
    try {
      if (window.FB_ENDPOINT && window.fetch) {
        fetch(window.FB_ENDPOINT, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(list[list.length - 1])
        }).catch(function () {});
      }
    } catch (e) {}
    paint();
  }

  /* ---------------- 坏例库面板（挂在评测台里） ---------------- */
  function stats() {
    var list = load(), bad = 0, good = 0;
    list.forEach(function (x) { if (x.v > 0) good++; else bad++; });
    return { total: list.length, bad: bad, good: good };
  }

  function paint() {
    var box = document.getElementById("evalFb");
    if (!box) return;
    var list = load(), st = stats();
    var bad = list.filter(function (x) { return x.v < 0; }).slice(-8).reverse();
    var rows = bad.length ? bad.map(function (x) {
      return '<li><b>' + esc(x.why || "差评") + '</b> · ' + esc(x.t) +
        '<div class="fb-q2">问：' + esc(x.q || "—") + '</div>' +
        '<div class="fb-a2">答：' + esc(x.a || "—") + '</div></li>';
    }).join("") : '<li class="fb-empty">还没有差评。用一段时间后，答错的会攒在这里。</li>';
    box.innerHTML =
      '<div class="eval-scope" style="margin-top:18px">' +
      '<b>📕 反馈回流：坏例库（本机 ' + st.total + ' 条 · 差评 ' + st.bad + ' 条）</b>' +
      '<ul>' + rows + '</ul>' +
      '<p class="fb-note">这些是玩家当场点「👎」的回答，连同问题、模型名、可核等级一起存下来。' +
      '下一步不是自动变好，而是人工挑出真错的，补成评测用例——所以下面给的是「导出」，不是「一键修复」。</p>' +
      '<div class="eval-bar"><button type="button" class="btn ghost" onclick="FB.export()">⬇ 导出坏例 JSON</button>' +
      '<button type="button" class="btn ghost" onclick="FB.copyCase()">📋 复制成评测用例骨架</button>' +
      '<button type="button" class="btn ghost" onclick="FB.clear()">🗑 清空本机记录</button></div>' +
      '</div>';
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function exportJSON() {
    var list = load();
    var blob = new Blob([JSON.stringify({ at: new Date().toISOString(), count: list.length, items: list }, null, 2)],
      { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "文物精灵-坏例库-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  /* 把差评转成 eval-bench.js 里能直接粘的用例骨架：{q, want} */
  function copyCase() {
    var bad = load().filter(function (x) { return x.v < 0 && x.q; });
    if (!bad.length) { if (window.wjToast) wjToast("还没有差评可转"); return; }
    var lines = bad.map(function (x) {
      var sid = "";
      try {
        if (window.KB && KB.searchSpirits) {
          var r = KB.searchSpirits(x.q, 1);
          if (r && r[0]) sid = r[0].sid;
        }
      } catch (e) {}
      return '  { q: "' + String(x.q).replace(/"/g, "'") + '", want: "' + (sid || "待定") + '" },  // ' + (x.why || "差评");
    }).join("\n");
    var txt = "/* 坏例转用例（粘进 eval-bench.js 的 retrieval/gate 组，先人工确认 want 是否正确） */\n" + lines;
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      if (window.wjToast) wjToast("已复制 " + bad.length + " 条用例骨架，粘进评测集后要人工确认答案");
    } catch (e) {}
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    paint();
  }

  window.FB = {
    version: "fb1",
    foot: foot,
    vote: vote,
    voteWhy: voteWhy,
    list: load,
    stats: stats,
    paint: paint,
    export: exportJSON,
    copyCase: copyCase,
    clear: clear
  };
})();
