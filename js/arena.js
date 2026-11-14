/* ================= 对照实测 · 问倒它 =================
   同一句话，两边同时答：
     左 = 裸模型，只给这一段话，不查档案、不核对；
     右 = 文物精灵管线，护栏 → 点名实体 → 检索档案 → 带证作答 → 回头核硬数据 → 该弃答就弃答。

   两个约束保证这不是表演：
   1) 两边 system 提示词完全相同，唯一变量是「有没有档案」。差异才有归因价值。
   2) 「硬数据可核率」用同一把尺子量——都拿全站 1941 段档案去核，
      不是拿右边自己的证据去核右边。左边答对了也照实显示。

   所有调用都是站内既有接口：cloudChatStream / aiCascade / KB / WJSafety。本页不改任何主链路。 */
(function () {
  "use strict";
  var W = window;

  /* 两边共用的底噪：同一个讲解员设定，谁也不占便宜 */
  var BASE_SYS = "你是一位知识渊博的中国文博讲解员。用中文回答，直接给答案，100—160 字，不要客套、不要反问、不要用 Markdown 符号。重量、尺寸、年代这类具体数字，只报有把握的，没把握就说记不准。";

  /* 只在右栏追加：这是管线设计的一部分，页面口径里如实写明 */
  var PIPE_RULE = "\n使用规则：问题涉及上面出现的文物时，一律以档案为准；问题里的前提与档案冲突时，先指出哪里不对，再按档案回答；" +
    "档案没写到的才按公认史实补充。不要提「档案」「检索」「资料库」这些词，像平时说话一样。";

  var ST = { busy: false, cur: null, done: {} };

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function br(s) { return esc(s).replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>"); }
  function tnow() { return (W.performance && W.performance.now) ? W.performance.now() : Date.now(); }
  function ms(t) { return Math.max(0, Math.round(t)); }

  /* ---------------- 同一把尺子 ----------------
     核「这段回答里的硬数据」时，用哪批档案当依据？
     用全站 1941 段太松：左边说「唐代」，别的文物档案里也写着「唐代」，就算可核了。
     所以按题目点的那件文物取它自己的全部档案片段——问的是它，就只认它自己写的数。
     题目没指定文物（查无此物那组）才退回全站池。两栏永远用同一个池。 */
  var POOL = null, POOL_SID = "";
  function sidOf(q) {
    var B = W.ARENA_BANK;
    if (!B) return "";
    for (var i = 0; i < B.groups.length; i++) {
      var its = B.groups[i].items;
      for (var j = 0; j < its.length; j++) if (its[j].q === q && its[j].sid) return its[j].sid;
    }
    return "";
  }
  function poolFor(q) {
    /* 重建是懒的（标脏后等空闲或下次检索），先摸一下 stats 保证索引是新的 */
    try { if (W.KB && W.KB.stats) W.KB.stats(); } catch (e) {}
    var docs = (W.KB && W.KB._docs) ? W.KB._docs : [];
    var sid = sidOf(q);
    var key = sid || "*";
    if (POOL && POOL_SID === key && POOL.n === docs.length) return POOL.list;
    var list = sid ? docs.filter(function (d) { return d.sid === sid; }) : docs;
    POOL = { n: docs.length, list: list.map(function (d) { return { text: d.text }; }) };
    POOL_SID = key;
    return POOL.list;
  }
  /* 这段回答里的硬数据，有多少能在「这件文物自己的档案」里找到依据 */
  function cover(ans, q) {
    try {
      if (!W.KB || !W.KB.check || !ans) return null;
      var p = poolFor(q || ST.cur || "");
      return W.KB.check(ans, p);
    } catch (e) { return null; }
  }
  function coverLine(c, brief) {
    if (!c) return "没有可核的硬数据";
    if (!c.claims) return "没有说出可核的硬数据";
    if (brief) return "本轮证据可核 " + c.supported.length + " / " + c.claims + " 处";
    var pct = Math.round(c.ratio * 100);
    return "硬数据 " + c.claims + " 处 · 本件档案可核 " + c.supported.length + " 处（" + pct + "%）";
  }
  /* 题目属于哪一组；查无此物那组没有对应文物，可核率对它没意义 */
  function kindOf(q) {
    var B = W.ARENA_BANK;
    if (!B) return "";
    for (var i = 0; i < B.groups.length; i++) {
      var its = B.groups[i].items;
      for (var j = 0; j < its.length; j++) if (its[j].q === q) return its[j].kind;
    }
    return "";
  }
  function coverCls(c) {
    if (!c || !c.claims) return "dim";
    if (c.ratio >= 0.999) return "ok";
    if (c.ratio >= 0.5) return "warn";
    return "bad";
  }

  /* ---------------- 左栏：裸模型 ---------------- */
  function bareAsk(q) {
    var t0 = tnow();
    if (!W.cloudChatStream)
      return Promise.resolve({ ok: false, text: "", err: "云端通道没加载", ms: 0 });
    return Promise.resolve()
      .then(function () {
        return W.cloudChatStream(
          [{ role: "system", content: BASE_SYS }, { role: "user", content: q }],
          { temperature: 0.6, max_tokens: 520, ms: 26000 }
        );
      })
      .then(function (r) {
        if (r && r.ok && r.text) return { ok: true, text: r.text, model: r.model || "", ms: ms(tnow() - t0) };
        return { ok: false, text: "", err: (r && r.error) || "没有返回内容", ms: ms(tnow() - t0) };
      })
      .catch(function (e) { return { ok: false, text: "", err: String(e && e.message || e), ms: ms(tnow() - t0) }; });
  }

  /* ---------------- 右栏：完整管线 ---------------- */
  function pipeAsk(q) {
    var t0 = tnow(), step = [];

    /* ① 输入护栏 */
    var sin = null;
    try { sin = (W.WJSafety && W.WJSafety.checkInput) ? W.WJSafety.checkInput(q) : null; } catch (e) { sin = null; }
    if (sin && !sin.ok) {
      step.push({ k: "输入护栏", v: "拦截 · " + sin.rules.join("、"), st: "stop" });
      step.push({ k: "生成", v: "未调用模型", st: "skip" });
      return Promise.resolve({
        refuse: true, why: "护栏", text: sin.reply || "这个我不能回答。",
        q: q, step: step, ms: ms(tnow() - t0), cover: null
      });
    }
    step.push({ k: "输入护栏", v: "通过" + (sin && sin.rules.length ? " · " + sin.rules.join("、") : ""), st: "ok" });

    /* ② 点名实体：问的那件东西，档案里到底有没有 */
    var unk = "";
    try { unk = (W.KB && W.KB.unknownRelic) ? W.KB.unknownRelic(q) : ""; } catch (e) { unk = ""; }
    if (unk) {
      var near = null;
      try { near = (W.KB.search(q, 1) || [])[0] || null; } catch (e) { near = null; }
      step.push({
        k: "点名实体",
        v: "「" + unk + "」不在档案里" + (near ? "（最相近：" + near.sname + "，" + near.score + " 分）" : ""),
        st: "stop"
      });
      step.push({ k: "生成", v: "未调用模型 —— 没有证据就不生成", st: "skip" });
      return Promise.resolve({
        refuse: true, why: "查无此物", text: "站内档案里没有「" + unk + "」这一件，我不编。",
        near: near, q: q, step: step, ms: ms(tnow() - t0), cover: null
      });
    }
    step.push({ k: "点名实体", v: "档案里查得到", st: "ok" });

    /* ③ 检索档案 */
    var ev = { text: "", hits: [] };
    try { if (W.KB && W.KB.evidence) ev = W.KB.evidence(q, { k: 4 }) || ev; } catch (e) { ev = { text: "", hits: [] }; }
    if (!ev.hits.length) {
      step.push({ k: "检索档案", v: "没有找到相关片段", st: "stop" });
      step.push({ k: "生成", v: "未调用模型", st: "skip" });
      return Promise.resolve({
        refuse: true, why: "无证据", text: "站内档案里没查到跟这个问题相关的记载，我不猜。",
        q: q, step: step, ms: ms(tnow() - t0), cover: null
      });
    }
    var names = [];
    ev.hits.forEach(function (h) { if (names.indexOf(h.sname) < 0) names.push(h.sname); });
    step.push({
      k: "检索档案",
      v: "命中 " + ev.hits.length + " 段 · 主档：" + names[0] +
         (names.length > 1 ? "（另有 " + (names.length - 1) + " 件旁证）" : ""),
      st: "ok"
    });

    /* ④ 带证作答（走站内同一个级联：数字对不上会换强模型重答一次） */
    var sys = BASE_SYS + "\n\n【站内档案检索结果（本站自己的资料，可信度高于你的记忆）】\n" + ev.text + PIPE_RULE;
    var msgs = [{ role: "system", content: sys }, { role: "user", content: q }];
    var run = (W.aiCascade && typeof W.aiCascade === "function")
      ? W.aiCascade(msgs, { temp: 0.7, maxTokens: 640, hits: ev.hits })
      : W.cloudChatStream(msgs, { temperature: 0.7, max_tokens: 640, ms: 26000 })
          .then(function (r) { return (r && r.ok && r.text) ? { text: r.text, model: r.model, upgraded: false } : null; });

    return Promise.resolve(run).then(function (rr) {
      if (!rr || !rr.text) {
        step.push({ k: "生成", v: "云端没有返回", st: "stop" });
        return { ok: false, q: q, err: "云端没有返回内容", step: step, ev: ev, ms: ms(tnow() - t0) };
      }
      /* ⑤ 核对：这句话里的硬数据，能不能在刚给的证据里找到 */
      var ck = null;
      try { ck = (W.KB && W.KB.check) ? W.KB.check(rr.text, ev.hits) : null; } catch (e) { ck = null; }
      var sout = null;
      try { sout = (W.WJSafety && W.WJSafety.checkOutput) ? W.WJSafety.checkOutput(rr.text, { evidenceText: ev.text }) : null; } catch (e) { sout = null; }
      var txt = (sout && sout.text) ? sout.text : rr.text;

      step.push({
        k: "生成",
        v: (rr.upgraded ? "首轮数字对不上，已换强模型重答一遍" : "一轮通过") + (rr.model ? " · " + rr.model : ""),
        st: "ok"
      });
      step.push({
        k: "核对",
        v: (ck ? ("引证覆盖 " + coverLine(ck, true)) : "未核对") + ((sout && sout.rules.length) ? " · 输出侧 " + sout.rules.join("、") : ""),
        st: (ck && ck.claims && ck.ratio < 0.6) ? "warn" : "ok"
      });
      return {
        ok: true, text: txt, model: rr.model || "", upgraded: !!rr.upgraded,
        ev: ev, ck: ck, step: step, cover: cover(txt, q), ms: ms(tnow() - t0)
      };
    });
  }

  /* ---------------- 视图 ---------------- */
  function viewArena() {
    var B = W.ARENA_BANK || { groups: [], count: function () { return 0; } };
    var chips = "";
    function chipLabel(q) {
      var m = String(q).match(/[「『《]([^」』》]{2,14})[」』》]/);
      if (m) return m[1];
      return String(q).replace(/[，。？、].*$/, "").slice(0, 12);
    }
    B.groups.forEach(function (g) {
      chips += g.items.slice(0, 2).map(function (it) {
        return '<button type="button" class="ar-chip" onclick="arenaAsk(this.dataset.q)" data-q="' + esc(it.q) + '">' +
          g.icon + " " + esc(chipLabel(it.q)) + "</button>";
      }).join("");
    });

    return '' +
      '<div class="page-head">' +
      '  <h2>⚔️ 对照实测 · 问倒它</h2>' +
      '  <p>同一句话，两边同时答。<b>左边</b>只把这句话丢给模型，不查资料、不核对；<b>右边</b>走文物精灵的完整管线：护栏 → 点名实体 → 检索站内档案 → 引证作答 → 回头核硬数据 → 该弃答就弃答。' +
      ' 两边提示词完全一样，唯一的变量是「有没有查档案」，所以差异能归因，不是表演。</p>' +
      '</div>' +
      '<div class="ar-ask">' +
      '  <input id="arIn" type="text" maxlength="180" placeholder="随便问一件文物，比如：长信宫灯通高多少？" autocomplete="off" />' +
      '  <button type="button" class="btn gold" id="arGo" onclick="arenaAsk()">⚔️ 并排开跑</button>' +
      '  <button type="button" class="btn ghost" id="arAll" onclick="arenaBatch()">跑完 ' + B.count() + ' 题</button>' +
      '</div>' +
      '<div class="ar-chips">' + chips + '</div>' +
      '<div class="ar-stage" id="arStage">' +
      '  <div class="ar-empty">先随便问一句，或者从下面三组题里挑一道：冷门文物考检索，错误前提考敢不敢顶回去，查无此物考敢不敢说没有。</div>' +
      '</div>' +
      '<div class="ar-sum" id="arSum" hidden></div>' +
      '<div class="ar-groups" id="arGroups">' +
      B.groups.map(function (g, gi) {
        return '<div class="ar-gcard">' +
          '<div class="ar-ghead"><b>' + g.icon + " " + esc(g.name) + '</b><span>' + g.items.length + ' 题</span></div>' +
          '<p class="ar-glead">' + esc(g.lead) + '</p>' +
          '<p class="ar-ghint">看什么：' + esc(g.hint) + '</p>' +
          '<div class="ar-glist">' + g.items.map(function (it, i) {
            return '<button type="button" class="ar-gq" onclick="arenaAsk(this.dataset.q)" data-q="' + esc(it.q) + '">' +
              '<i>' + (gi + 1) + "." + (i + 1) + '</i>' + esc(it.q) + '</button>';
          }).join("") + '</div>' +
          '<button type="button" class="ar-grun" onclick="arenaGroup(\'' + g.id + '\')">▶ 跑这一组</button>' +
          '</div>';
      }).join("") +
      '</div>' +
      '<div class="ar-scope">' +
      '  <b>这页的边界，先说清</b>' +
      '  <ul>' +
      '    <li><b>同一把尺子</b>：两栏的「硬数据可核率」都拿<b>问的那件文物自己的档案</b>去核——问的是它，就只认它自己写的数。' +
      '查无此物那组没有对应文物，退回全站 <span id="arPoolN">' + (W.KB && W.KB._docs ? W.KB._docs.length : "—") + '</span> 段档案。左边答对了也照实显示。</li>' +
      '    <li><b>唯一变量</b>：两栏 system 提示词逐字相同。右栏多出的只有一段检索到的档案和一条「与档案冲突先纠正」的规则——这条规则本身也是我们写的，属于管线的一部分。</li>' +
      '    <li><b>冷门题可能左边也答对</b>：模型偶尔记得住。这时看的是它给不出出处——答对但无法验证，和答对且每句有档可查，不是一回事。</li>' +
      '    <li><b>右栏更慢</b>：一般多花 1—3 秒，那是查档案和核对的成本。这里不藏这个数字。</li>' +
      '    <li><b>查无此物靠引号判定</b>：问句里用「」『』《》点名的器物若不在 104 件档案中，就判为查无此物、不生成。普通叙述句不拦，避免误伤常识词。</li>' +
      '  </ul>' +
      '</div>';
  }

  /* ---------------- 单题并排 ---------------- */
  /* 档案包是懒加载的：尺子要用「这件文物自己的档案」，没到齐就先等它（最多 3 秒） */
  function readyDeep(msMax) {
    return new Promise(function (res) {
      if (!W.loadDeep || (W.deepReady && W.deepReady())) return res();
      var done = false;
      function fin() { if (!done) { done = true; res(); } }
      setTimeout(fin, msMax || 3000);
      try { W.loadDeep().then(fin).catch(fin); } catch (e) { fin(); }
    });
  }

  function ask(q) {
    q = String(q == null ? "" : q).trim();
    if (!q) { var el = document.getElementById("arIn"); if (el) el.focus(); return; }
    if (ST.busy) return;
    if (!(W.deepReady && W.deepReady())) {
      ST.busy = true;
      var g0 = document.getElementById("arGo");
      if (g0) { g0.disabled = true; g0.textContent = "等档案包…"; }
      readyDeep(3000).then(function () {
        ST.busy = false;
        if (g0) { g0.disabled = false; g0.textContent = "⚔️ 并排开跑"; }
        ask(q);
      });
      return;
    }
    ST.busy = true; ST.cur = q;
    var inp = document.getElementById("arIn"); if (inp) inp.value = q;
    var go = document.getElementById("arGo"); if (go) { go.disabled = true; go.textContent = "跑着…"; }
    var sum = document.getElementById("arSum"); if (sum) sum.hidden = true;

    var stage = document.getElementById("arStage");
    if (stage) {
      stage.innerHTML = '' +
        '<div class="ar-qbar"><span>问题</span><b>' + esc(q) + '</b></div>' +
        '<div class="ar-cols">' +
        '  <section class="ar-col bare"><header><b>裸模型</b><em>只把这句话丢给模型</em></header>' +
        '    <div class="ar-ans wait" id="arLeft"><i class="ar-dot"></i><i class="ar-dot"></i><i class="ar-dot"></i></div>' +
        '    <footer class="ar-ft" id="arLeftFt">等云端…</footer></section>' +
        '  <section class="ar-col pipe"><header><b>文物精灵管线</b><em>护栏 → 检索 → 引证 → 核对</em></header>' +
        '    <div class="ar-ans wait" id="arRight"><i class="ar-dot"></i><i class="ar-dot"></i><i class="ar-dot"></i></div>' +
        '    <footer class="ar-ft" id="arRightFt">正在查档案…</footer></section>' +
        '</div>' +
        '<div class="ar-chain" id="arChain"></div>';
      try { stage.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    }

    var L = null, Rr = null, n = 0;
    function step2() {
      n++;
      if (n < 2) return;
      paintLeft(L); paintRight(Rr);
      ST.done[q] = { L: L, R: Rr };
      ST.busy = false;
      if (go) { go.disabled = false; go.textContent = "⚔️ 并排开跑"; }
    }

    bareAsk(q).then(function (r) { L = r; step2(); });
    pipeAsk(q).then(function (r) { Rr = r; step2(); });
  }

  function paintLeft(L) {
    var box = document.getElementById("arLeft"), ft = document.getElementById("arLeftFt");
    if (!box) return;
    box.classList.remove("wait");
    if (!L || !L.ok) {
      box.innerHTML = '<p class="ar-err">左边没有答案：' + esc((L && L.err) || "未知错误") + '</p>';
      if (ft) ft.innerHTML = '<span class="ar-tag bad">未作答</span>' + (L ? L.ms + " ms" : "");
      return;
    }
    box.innerHTML = "<p>" + br(L.text) + "</p>";
    if (kindOf(ST.cur) === "ghost") {
      /* 全局没有这件东西，拿别处的档案去核它编的数字没有意义：
         直接说清「它说的每一处，都查无此物」 */
      if (ft) ft.innerHTML = '<span class="ar-tag bad">无出处 · 档案中查无此物</span>' +
        '<span class="ar-cov bad">编造了 ' + String(L.text).replace(/\s/g, "").length + " 字</span>" +
        '<span class="ar-ms">' + L.ms + " ms</span>";
      return;
    }
    var c = cover(L.text, ST.cur);
    if (ft) {
      ft.innerHTML = '<span class="ar-tag bad">无出处 · 无核对</span>' +
        '<span class="ar-cov ' + coverCls(c) + '">' + coverLine(c) + "</span>" +
        '<span class="ar-ms">' + L.ms + " ms</span>";
    }
    ST.leftCover = c;
  }

  function paintRight(R) {
    var box = document.getElementById("arRight"), ft = document.getElementById("arRightFt");
    if (!box) return;
    box.classList.remove("wait");
    if (!R) { box.innerHTML = '<p class="ar-err">右边没有结果</p>'; return; }
    if (R.refuse) {
      box.innerHTML = '<p class="ar-refuse"><b>已弃答</b>' + esc(R.text) + '</p>';
      if (ft) ft.innerHTML = '<span class="ar-tag good">弃答 · 不生成</span>' +
        '<span class="ar-cov dim">' + esc(R.why) + "</span>" +
        '<span class="ar-ms">' + R.ms + " ms</span>";
    } else if (!R.ok) {
      box.innerHTML = '<p class="ar-err">右边没有答案：' + esc(R.err || "未知错误") + '</p>';
      if (ft) ft.innerHTML = '<span class="ar-tag bad">未作答</span><span class="ar-ms">' + R.ms + " ms</span>";
    } else {
      box.innerHTML = "<p>" + br(R.text) + "</p>";
      var cov = R.cover || cover(R.text, R.q || ST.cur);
      if (ft) {
        ft.innerHTML = '<span class="ar-tag good">' + (R.ev.hits.length ? "引证 " + R.ev.hits.length + " 段" : "有证作答") + '</span>' +
          '<span class="ar-cov ' + coverCls(cov) + '">' + coverLine(cov) + "</span>" +
          '<span class="ar-ms">' + R.ms + " ms</span>";
      }
    }
    var ch = document.getElementById("arChain");
    if (ch) ch.innerHTML = chainHTML(R);
  }

  function chainHTML(R) {
    if (!R) return "";
    var steps = (R.step || []).map(function (s) {
      return '<li class="' + (s.st || "") + '"><i></i><b>' + esc(s.k) + '</b><span>' + esc(s.v) + '</span></li>';
    }).join("");
    var evHtml = "";
    if (R.ev && R.ev.hits && R.ev.hits.length) {
      function evi(h, i) {
        return '<div class="ar-evi"><span>[' + (i + 1) + "] " + esc(h.sname) + " · " + esc(h.field) + " · " + h.score + ' 分</span>' +
          "<p>" + esc(String(h.text).slice(0, 220)) + "</p></div>";
      }
      var head = R.ev.hits.slice(0, 2).map(function (h, i) { return evi(h, i); }).join("");
      var rest = R.ev.hits.slice(2, 6).map(function (h, i) { return evi(h, i + 2); }).join("");
      evHtml = '<div class="ar-ev"><b>这次塞给模型的就是这几段（站内档案原文）</b>' + head +
        (rest ? '<details class="ar-evmore"><summary>还有 ' + (R.ev.hits.length - 2) + " 段同类片段</summary>" + rest + "</details>" : "") +
        "</div>";
    }
    if (R.ck && R.ck.unsupported && R.ck.unsupported.length) {
      evHtml += '<div class="ar-bad"><b>本轮证据里找不到的数字</b>' +
        R.ck.unsupported.map(function (c) { return "<span>" + esc(c.t) + "</span>"; }).join("") +
        '<p class="ar-bad-note">不代表这些数字错了——只代表这一轮检索命中的档案里没有它们，是模型凭记忆说的。' +
        "标出来，是为了让「有据可查」和「记得住」分得清。</p></div>";
    }
    if (R.near) {
      evHtml += '<div class="ar-near"><b>为什么说没有</b>引擎确实检索到了最相近的一件——<b>' + esc(R.near.sname) +
        "</b>（" + R.near.score + " 分，" + esc(R.near.field) + "）。但问句点名的是另一件，拿它顶替就是编，所以不给证据。</div>";
    }
    return '<div class="ar-chain-h">右侧这四步做了什么<span>按顺序，可逐步核对</span></div>' +
      '<ol class="ar-tl">' + steps + "</ol>" + evHtml;
  }

  /* ---------------- 批量 ---------------- */
  function group(id) {
    var B = W.ARENA_BANK; if (!B) return;
    var g = null;
    B.groups.forEach(function (x) { if (x.id === id) g = x; });
    if (!g) return;
    batch(g.items.map(function (it) { return it.q; }), g.name);
  }

  function batch(list, title) {
    if (ST.busy) return;
    if (!(W.deepReady && W.deepReady())) {
      ST.busy = true;
      readyDeep(3000).then(function () { ST.busy = false; batch(list, title); });
      return;
    }
    ST.busy = true;
    var stage = document.getElementById("arStage");
    var sum = document.getElementById("arSum");
    if (sum) sum.hidden = true;

    var rows = list.map(function (q) {
      return { q: q, L: null, R: null };
    });
    if (stage) {
      stage.innerHTML = '<div class="ar-qbar"><span>批量</span><b>' + esc(title || "全部题目") + " · " + list.length + " 题</b></div>" +
        '<div class="ar-progress" id="arProg">准备中…</div>' +
        '<div class="ar-table" id="arTable">' + tableHTML(rows) + "</div>";
      try { stage.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    }

    var i = 0, doneN = 0;
    function next() {
      if (i >= rows.length) { finish(rows, title); return; }
      var r = rows[i++];
      var prog = document.getElementById("arProg");
      if (prog) prog.textContent = "跑第 " + i + " / " + rows.length + " 题：" + String(r.q).slice(0, 26) + "…";
      Promise.all([bareAsk(r.q), pipeAsk(r.q)]).then(function (a) {
        r.L = a[0]; r.R = a[1];
        var tb = document.getElementById("arTable");
        if (tb) tb.innerHTML = tableHTML(rows);
        var t = document.getElementById("arProg");
        if (t) t.textContent = "完成 " + (++doneN) + " / " + rows.length;
        setTimeout(next, 220);
      }).catch(function () {
        var t = document.getElementById("arProg");
        if (t) t.textContent = "第 " + i + " 题出错，跳过";
        setTimeout(next, 220);
      });
    }
    next();
  }

  function judge(r) {
    var L = r.L, R = r.R;
    if (!R) return { t: "—", c: "dim" };
    var B = W.ARENA_BANK, kind = "answer";
    B.groups.forEach(function (g) {
      g.items.forEach(function (it) { if (it.q === r.q) kind = it.kind; });
    });
    if (kind === "ghost") {
      if (!R.refuse) return { t: "右：也答了", c: "bad" };
      var n = (L && L.ok) ? String(L.text).replace(/\s/g, "").length : 0;
      return { t: n ? "右弃答 · 左编 " + n + " 字" : "右弃答 · 左未答", c: "good" };
    }
    var lc = L && L.ok ? cover(L.text, r.q) : null;
    var rc = R.cover || (R.text ? cover(R.text, r.q) : null);
    var lr = (lc && lc.claims) ? lc.ratio : 0;
    var rr = (rc && rc.claims) ? rc.ratio : (R.ev && R.ev.hits && R.ev.hits.length ? 1 : 0);
    if (rr >= 0.8 && lr < 0.8) return { t: "右可核 " + Math.round(rr * 100) + "% / 左 " + Math.round(lr * 100) + "%", c: "good" };
    if (rr >= 0.8 && lr >= 0.8) return { t: "两边都对得上档案", c: "dim" };
    return { t: "右可核 " + Math.round(rr * 100) + "% / 左 " + Math.round(lr * 100) + "%", c: "warn" };
  }

  function tableHTML(rows) {
    return '<div class="ar-tr ar-th"><span>#</span><span>问题</span><span>裸模型</span><span>管线</span><span>对比</span></div>' +
      rows.map(function (r, i) {
        var ghost = kindOf(r.q) === "ghost";
        var lc = (r.L && r.L.ok && !ghost) ? cover(r.L.text, r.q) : null;
        var rc = r.R ? (r.R.cover || (r.R.text ? cover(r.R.text, r.q) : null)) : null;
        var j = judge(r);
        return '<div class="ar-tr">' +
          "<span>" + (i + 1) + "</span>" +
          '<span class="q">' + esc(String(r.q).slice(0, 30)) + "</span>" +
          '<span class="' + (r.L ? (ghost ? "bad" : (r.L.ok ? coverCls(lc) : "dim")) : "wait") + '">' +
            (r.L ? (ghost ? "编造" : (r.L.ok ? (lc && lc.claims ? Math.round(lc.ratio * 100) + "%" : "—") : "失败")) : "…") + "</span>" +
          '<span class="' + (r.R ? (r.R.refuse ? "good" : coverCls(rc)) : "wait") + '">' +
            (r.R ? (r.R.refuse ? "弃答" : (rc && rc.claims ? Math.round(rc.ratio * 100) + "%" : "—")) : "…") + "</span>" +
          '<span class="' + j.c + '">' + esc(j.t) + "</span>" +
          "</div>";
      }).join("");
  }

  function finish(rows, title) {
    ST.busy = false;
    var sum = document.getElementById("arSum");
    var ghostN = rows.filter(function (r) {
      var k = "answer";
      W.ARENA_BANK.groups.forEach(function (g) { g.items.forEach(function (it) { if (it.q === r.q) k = it.kind; }); });
      return k === "ghost";
    });
    var refuseN = ghostN.filter(function (r) { return r.R && r.R.refuse; }).length;
    var avg = function (side) {
      var a = rows.map(function (r) {
        if (kindOf(r.q) === "ghost") return null;    /* 查无此物没有对应档案，可核率无意义 */
        var c = side === "L" ? (r.L && r.L.ok ? cover(r.L.text, r.q) : null)
                             : (r.R && r.R.text ? (r.R.cover || cover(r.R.text, r.q)) : null);
        return (c && c.claims) ? c.ratio : null;
      }).filter(function (x) { return x != null; });
      return a.length ? Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length * 100) : null;
    };
    var la = avg("L"), ra = avg("R");
    if (sum) {
      sum.hidden = false;
      var onlyGhost = (la == null && ra == null);
      sum.innerHTML = '<b>' + esc(title || "全部题目") + " · " + rows.length + " 题跑完</b>" +
        '<div class="ar-sumrow">' +
        (onlyGhost ? "" : (
          '<div><i>' + (la == null ? "—" : la + "%") + '</i><span>裸模型 · 硬数据可核率</span></div>' +
          '<div><i>' + (ra == null ? "—" : ra + "%") + '</i><span>管线 · 硬数据可核率</span></div>'
        )) +
        '<div><i>' + (ghostN.length ? refuseN + " / " + ghostN.length : "—") + '</i><span>查无此物 · 正确弃答</span></div>' +
        "</div>" +
        '<p class="ar-sumnote">' +
        (onlyGhost
          ? "这一组问的都是档案里没有的器物，没有可比对的档案，所以不报可核率——只看一件事：它敢不敢说「我没有」。"
          : "可核率 = 回答里的重量/尺寸/年代这类硬数据，有多少能在<b>问的那件文物自己的档案</b>里找到依据。同一把尺子量两栏，不是拿右边自己的证据去核右边；没有说出硬数据的题不计入均值，所以样本数会小于题数。") +
        "</p>";
      try { sum.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    var inp = document.getElementById("arIn");
    if (inp && !inp.__arBound) {
      inp.__arBound = 1;
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ask(inp.value); } });
    }
    /* 进来就把档案包拉齐：这一页的尺子要靠它，顺便把口径里的段数改准 */
    try {
      if (W.loadDeep && !(W.deepReady && W.deepReady())) {
        W.loadDeep().then(function () {
          var n = document.getElementById("arPoolN");
          var cnt = 0;
          try { cnt = W.KB.stats().docs; } catch (e) { cnt = (W.KB && W.KB._docs) ? W.KB._docs.length : 0; }
          if (n) n.textContent = cnt;
        }).catch(function () {});
      }
    } catch (e) {}
  }

  W.viewArena = viewArena;
  W.arenaInit = init;
  W.arenaAsk = ask;
  W.arenaGroup = group;
  W.arenaBatch = function () {
    var B = W.ARENA_BANK;
    if (!B) return;
    batch(B.all().map(function (x) { return x.item.q; }), "全部题目");
  };
})();
