/* =============================================================================
 * js/aw-craft.js · 微交互增强层（取自 Amicro 微交互库的创意，纯 vanilla 复刻）
 * -----------------------------------------------------------------------------
 *  共 9 组微交互，**主页常开、无开关按钮**（⑦⑧ 只活在 #/arc 独立页）：
 *   ① 国风思考气泡：对话/判定等待时，朱红三点呼吸（aw-typing / mys-d-typing）
 *   ② 声波条 Waveform：换牌 / 排布时的通用加载条（.craft-wave）
 *   ③ 磁吸按钮 Magnetic：按钮随鼠标微调吸附
 *   ④ 点击涟漪 Ripple：朱红涟漪从按下点扩散
 *   ⑤ 悬停散牌 Scatter Deal：首页「我的精灵」印章行 hover 散成手牌
 *   ⑥ 逐字浮现 Text Reveal：区块大标题逐字升起
 *   ⑨ 卡片悬停提亮：主页 AI 工具卡 / 图鉴卡 hover 上浮 + 金边
 *   —— 仅 #/arc ——
 *   ⑦ 卡牌展开 Card Spreads：三种排版（弧线/邮票弧/平铺）
 *   ⑧ 数据图表 Mono Charts：页底「精灵谱系」真实统计横条图
 *  约束：不改动任何既有 css/js；自注入 style#aw-craft-css；路由用 hashchange
 *        覆盖模式（注册在 app.js 之后）。
 * =========================================================================== */
(function () {
  "use strict";
  if (window.__AW_CRAFT__) return;
  window.__AW_CRAFT__ = 1;

  var REDUCED = false;
  try { REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  var enabled = true;      /* 主页常开，不再提供开关 */

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function S(id) { return (typeof SPIRITS !== "undefined" && SPIRITS[id]) ? SPIRITS[id] : null; }

  /* 14 件文物（初始七友 7 + 镇馆七珍 7，顺序与原牌阵一致） */
  var IDS = ["wuzhuqian", "qinghuaci", "yuzhui", "jinqi", "yinqi", "xuanzhi", "xiangqi",
             "tielion", "changxin", "longfengfan", "yuzhulong", "lianhuazun", "houmuwuding", "jituiping"];
  var SHORT = {
    wuzhuqian: "五铢钱", qinghuaci: "青花瓷", yuzhui: "玉坠", jinqi: "金器", yinqi: "银器",
    xuanzhi: "宣纸", xiangqi: "象棋", tielion: "铁狮子", changxin: "长信宫灯",
    longfengfan: "龙凤方案", yuzhulong: "玉猪龙", lianhuazun: "莲花尊",
    houmuwuding: "后母戊鼎", jituiping: "鸡腿瓶"
  };
  function nameOf(id) {
    var s = S(id);
    return SHORT[id] || (s ? s.name : id);
  }

  /* ============================ ①~⑨ 样式 ============================ */
  var CSS = [
    "/* ---------- ① 国风思考气泡：朱红三点呼吸 ---------- */",
    "html.craft-on .aw-typing,html.craft-on .mys-d-typing{position:relative;padding-right:40px!important;",
    "  background:linear-gradient(180deg,#FFFCF3,#FBF1DC);border:1px solid rgba(200,154,82,.45);",
    "  border-radius:12px;color:#7C5A34;letter-spacing:.5px;animation:craftBreath 2.1s ease-in-out infinite}",
    "html.craft-on .aw-typing::after,html.craft-on .mys-d-typing::after{",
    "  content:\"\";position:absolute;right:12px;top:50%;width:6px;height:6px;border-radius:50%;",
    "  margin-top:-3px;background:#C0392F;",
    "  box-shadow:-11px 0 0 rgba(192,57,47,.55),11px 0 0 rgba(192,57,47,.55);",
    "  animation:craftThink 1.15s ease-in-out infinite}",
    "@keyframes craftThink{0%,100%{opacity:.35;transform:scale(.78)}45%{opacity:1;transform:scale(1.08)}}",
    "@keyframes craftBreath{0%,100%{box-shadow:0 0 0 0 rgba(192,57,47,0)}50%{box-shadow:0 0 14px 0 rgba(192,57,47,.16)}}",

    "/* ---------- ② 声波条 Waveform ---------- */",
    ".craft-wave{display:inline-flex;align-items:flex-end;gap:3px;height:14px}",
    ".craft-wave i{width:3px;height:100%;border-radius:2px;background:linear-gradient(180deg,#E6B25C,#C0392F);",
    "  transform-origin:50% 100%;animation:craftWave .9s ease-in-out infinite}",
    "@keyframes craftWave{0%,100%{transform:scaleY(.32)}50%{transform:scaleY(1)}}",
    "/* 声波条浮层（主页换牌 / #/arc 排布共用） */",
    ".craft-wave-box{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);z-index:80;",
    "  display:inline-flex;align-items:center;padding:8px 16px;border-radius:999px;pointer-events:none;",
    "  background:linear-gradient(180deg,#FFFDF6,#F6E9CE);border:1px solid rgba(200,154,82,.7);",
    "  color:#7C5A34;font-size:12.5px;letter-spacing:1px;box-shadow:0 8px 20px rgba(60,10,4,.22);",
    "  animation:craftWaveIn .26s ease-out both}",
    "@keyframes craftWaveIn{from{opacity:0;transform:translate(-50%,-46%)}to{opacity:1;transform:translate(-50%,-50%)}}",

    "/* ---------- ③ 磁吸按钮 ---------- */",
    "html.craft-on .rh-link-btn,html.craft-on .rh-plate-go,html.craft-on .rh-more,html.craft-on .aw-chip{",
    "  transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s}",
    "html.craft-on .craft-magnet{box-shadow:0 10px 24px rgba(70,10,6,.28)}",

    "/* ---------- ④ 点击涟漪 ---------- */",
    ".craft-ripple{position:absolute;border-radius:50%;pointer-events:none;",
    "  background:radial-gradient(circle,rgba(192,57,47,.42),rgba(192,57,47,0) 70%);",
    "  transform:translate(-50%,-50%) scale(0);animation:craftRipple .58s ease-out forwards}",
    "@keyframes craftRipple{to{transform:translate(-50%,-50%) scale(1);opacity:0}}",

    "/* ---------- ⑤ 悬停散牌 ---------- */",
    "html.craft-on .rh-seals .rh-ava{transition:transform .38s cubic-bezier(.2,.85,.2,1)}",

    "/* ---------- ⑥ 逐字浮现 ---------- */",
    "html.craft-on .craft-split i.craft-char{display:inline-block;opacity:0;transform:translateY(.4em)}",
    "html.craft-on .craft-in i.craft-char{animation:craftChar .5s cubic-bezier(.2,.85,.2,1) forwards}",
    "@keyframes craftChar{to{opacity:1;transform:none}}",

    "/* ---------- ⑨ 卡片悬停提亮（主页 AI 工具卡 + 图鉴卡） ---------- */",
    "html.craft-on .codex-card,html.craft-on .rh-tool{transition:transform .28s cubic-bezier(.2,.85,.2,1),box-shadow .28s,border-color .28s}",
    "html.craft-on .codex-card:hover{transform:translateY(-4px);box-shadow:0 16px 34px rgba(60,10,4,.3);border-color:#FFDFA0}",
    "html.craft-on .rh-tool:hover{transform:translateY(-5px);box-shadow:0 18px 34px rgba(60,10,4,.34);border-color:rgba(255,214,150,.9)}",
    "html.craft-on .rh-tool:hover .rh-tool-em{transform:translateY(-3px) scale(1.08)}",
    "html.craft-on .rh-tool-em{transition:transform .28s cubic-bezier(.2,.85,.2,1)}",
    ".craft-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;",
    "  font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;font-size:13px;letter-spacing:1px;",
    "  padding:9px 18px;border-radius:999px;color:#FFF3D6;",
    "  background:linear-gradient(180deg,#C0392F,#A5181C);border:1px solid rgba(255,214,150,.8);",
    "  box-shadow:0 10px 26px rgba(60,10,6,.35);animation:craftToast 4s ease forwards}",
    "@keyframes craftToast{0%{opacity:0;transform:translateX(-50%) translateY(-10px)}",
    "  12%,78%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0}}",

    "/* ---------- 无障碍：尊重系统减弱动效 ---------- */",
    "@media (prefers-reduced-motion:reduce){",
    "  html.craft-on .aw-typing,html.craft-on .aw-typing::after,",
    "  html.craft-on .mys-d-typing,html.craft-on .mys-d-typing::after{animation:none}",
    "  html.craft-on .craft-split i.craft-char{opacity:1;transform:none}}"
  ].join("\n");

  var stEl = null;
  function injectCss() {
    if (stEl) return;
    stEl = document.createElement("style");
    stEl.id = "aw-craft-css";
    stEl.textContent = CSS + scatterRules() + arcCSS();
    (document.head || document.documentElement).appendChild(stEl);
    document.documentElement.classList.add("craft-on");
  }
  function dropCss() {
    if (stEl && stEl.parentNode) stEl.parentNode.removeChild(stEl);
    stEl = null;
    document.documentElement.classList.remove("craft-on");
  }

  /* ⑤ 印章行 hover 散成手牌 */
  function scatterRules() {
    var out = [];
    for (var i = 1; i <= 8; i++) {
      var k = i - 4;
      out.push("html.craft-on .rh-seals:hover .rh-ava:nth-child(" + i + ")" +
        "{transform:translateX(" + (k * 13) + "px) translateY(" + (Math.abs(k) * 3) +
        "px) rotate(" + (k * 3.5) + "deg)}");
    }
    return out.join("\n");
  }

  /* ============================ ③④ 磁吸 + 涟漪 ============================ */
  var MAG = ".rh-link-btn,.rh-plate-go,.rh-more,.aw-chip,.btn";
  var curEl = null;

  function resetMag() {
    if (curEl) { curEl.style.transform = ""; curEl.classList.remove("craft-magnet"); curEl = null; }
  }
  function onMove(e) {
    if (!enabled || REDUCED) return;
    var t = (e.target && e.target.closest) ? e.target.closest(MAG) : null;
    if (t !== curEl) { resetMag(); curEl = t; if (t) t.classList.add("craft-magnet"); }
    if (!t) return;
    if (getComputedStyle(t).position === "static" && getComputedStyle(t).overflow !== "hidden") {
      t.style.position = "relative";
    }
    var r = t.getBoundingClientRect();
    var mx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
    var my = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    t.style.transform = "translate(" + (mx * 5).toFixed(2) + "px," + (my * 3.6).toFixed(2) + "px)";
  }
  function onDown(e) {
    if (!enabled || REDUCED) return;
    var t = (e.target && e.target.closest) ? e.target.closest(MAG) : null;
    if (!t) return;
    var r = t.getBoundingClientRect();
    var d = Math.max(r.width, r.height) * 2.1;
    var s = document.createElement("span");
    s.className = "craft-ripple";
    s.style.width = s.style.height = d + "px";
    s.style.left = (e.clientX - r.left) + "px";
    s.style.top = (e.clientY - r.top) + "px";
    t.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 620);
  }

  /* ============================ ⑥ 逐字浮现 ============================ */
  var REVEAL = ".rh-title-cn,.aw-hero h2,.mys-hero h2,.rh-head-txt h2,.section-title";
  var io = null, watched = [];
  function split(el) {
    if (el.__craftSplit) return;
    var txt = String(el.textContent || "");
    if (!txt.trim()) return;
    el.__craftText = txt;
    el.textContent = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < txt.length; i++) {
      var c = document.createElement("i");
      c.className = "craft-char";
      c.textContent = txt[i];
      c.style.animationDelay = (i * 0.042).toFixed(3) + "s";
      frag.appendChild(c);
    }
    el.appendChild(frag);
    el.__craftSplit = 1;
    el.classList.add("craft-split");
  }
  function unsplit(el) {
    if (!el.__craftSplit) return;
    el.textContent = el.__craftText || "";
    el.__craftSplit = 0;
    el.classList.remove("craft-split", "craft-in");
  }
  function scanReveal() {
    if (!io) return;                  // 没有观察器就绝不拆字，避免标题不可见
    var list = document.querySelectorAll(REVEAL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.__craftSplit || el.closest(".craft-arc")) continue;
      split(el);
      if (io) { try { io.observe(el); } catch (e) {} }
      watched.push(el);
    }
  }
  function clearReveal() {
    for (var i = 0; i < watched.length; i++) unsplit(watched[i]);
    watched = [];
  }

  /* ============================ ⑦⑧ 卡牌展开 + 数据图表 ============================ */
  function arcCSS() {
    return [
      ".craft-arc{max-width:1180px;margin:0 auto;padding:26px 18px 60px;font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;color:#3B2418}",
      ".craft-arc .ca-head{text-align:center;margin-bottom:26px}",
      ".craft-arc .ca-kick{display:inline-block;font-size:11.5px;letter-spacing:4px;color:#A50F17;",
      "  border:1px solid rgba(165,15,23,.4);border-radius:999px;padding:4px 14px;margin-bottom:10px}",
      ".craft-arc .ca-h2{font-size:clamp(22px,3.4vw,34px);margin:0 0 8px;color:#7C0A0D;letter-spacing:2px}",
      ".craft-arc .ca-sub{margin:0;color:#7A5B3C;font-size:13.5px;line-height:1.9}",
      ".craft-arc .ca-modes{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:16px 0 6px}",
      ".craft-arc .ca-mode{font-family:inherit;font-size:12.5px;letter-spacing:1px;cursor:pointer;padding:6px 16px;",
      "  border-radius:999px;color:#7C0A0D;background:linear-gradient(180deg,#FFFDF6,#F6E9CE);",
      "  border:1px solid rgba(200,154,82,.7);transition:all .2s}",
      ".craft-arc .ca-mode.on{color:#FFF3D6;background:linear-gradient(180deg,#C0392F,#A5181C);border-color:rgba(255,214,150,.8)}",
      ".craft-arc .ca-stage{position:relative;height:clamp(300px,34vw,420px);margin-top:10px}",
      ".craft-arc .ca-card{position:absolute;left:50%;top:100%;width:clamp(84px,9.2vw,110px);",
      "  padding:8px 6px 7px;border-radius:5px;cursor:pointer;outline:none;",
      "  background:linear-gradient(180deg,#FFFDF6,#F8EBD0);border:1px solid rgba(200,154,82,.75);",
      "  box-shadow:0 8px 18px rgba(60,10,4,.22);text-align:center;",
      "  transition:transform .34s cubic-bezier(.2,.85,.2,1),box-shadow .25s,border-color .25s}",
      ".craft-arc.is-stamp .ca-card::after{content:\"\";position:absolute;inset:2px;border-radius:3px;pointer-events:none;",
      "  background:",
      "    radial-gradient(circle at 4px 4px,rgba(122,40,16,.16) 2.6px,transparent 2.8px) 0 0/8px 8px repeat,",
      "    radial-gradient(circle at 4px 4px,rgba(122,40,16,.16) 2.6px,transparent 2.8px) 100% 0/8px 8px repeat-y;",
      "  opacity:.75}",
      ".craft-arc .ca-card:hover,.craft-arc .ca-card:focus-visible{border-color:#FFDFA0;",
      "  box-shadow:0 14px 30px rgba(60,10,4,.36);z-index:40}",
      ".craft-arc .ca-img{display:block;width:100%;height:auto;pointer-events:none}",
      ".craft-arc .ca-nm{display:block;font-size:13px;font-weight:700;color:#7C0A0D;line-height:1.35}",
      ".craft-arc .ca-er{display:block;font-size:9.5px;color:#8A6A44;letter-spacing:.5px}",
      ".craft-arc .ca-card:hover .ca-nm{color:#A50F17}",
      ".craft-arc .ca-wavebox{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}",
      ".craft-arc .craft-wave-box{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);",
      "  display:inline-flex;align-items:center;padding:8px 16px;border-radius:999px;",
      "  background:linear-gradient(180deg,#FFFDF6,#F6E9CE);border:1px solid rgba(200,154,82,.7);",
      "  color:#7C5A34;font-size:12.5px;letter-spacing:1px;box-shadow:0 8px 20px rgba(60,10,4,.22);z-index:80}",
      ".craft-arc .ca-no{position:absolute;left:5px;top:3px;font-size:9px;font-weight:800;color:#A50F17;opacity:.8}",
      "/* ⑧ 数据图表 */",
      ".craft-arc .ca-stats{margin-top:34px;display:grid;grid-template-columns:1fr 1fr;gap:24px}",
      "@media(max-width:820px){.craft-arc .ca-stats{grid-template-columns:1fr}}",
      ".craft-arc .ca-st{border:1px solid rgba(200,154,82,.5);border-radius:12px;padding:16px 18px;",
      "  background:linear-gradient(180deg,rgba(255,253,247,.94),rgba(250,241,222,.9))}",
      ".craft-arc .ca-st h5{margin:0 0 12px;font-size:14px;color:#7C0A0D;letter-spacing:1px}",
      ".craft-arc .ca-row{display:grid;grid-template-columns:74px 1fr 30px;align-items:center;gap:8px;margin-bottom:7px;font-size:12px}",
      ".craft-arc .ca-bar{height:7px;border-radius:99px;background:rgba(200,154,82,.2);overflow:hidden}",
      ".craft-arc .ca-bar i{display:block;height:100%;border-radius:99px;",
      "  background:linear-gradient(90deg,#E6B25C,#C0392F);width:0;transition:width .9s cubic-bezier(.2,.8,.2,1)}",
      ".craft-arc .ca-ct{text-align:right;color:#8A6A44}"
    ].join("\n");
  }

  function statsHTML() {
    if (typeof SPIRITS === "undefined") return "";
    var all = Object.keys(SPIRITS).map(function (k) { return SPIRITS[k]; });
    function tally(get) {
      var m = {};
      all.forEach(function (s) { var v = get(s) || "未录"; m[v] = (m[v] || 0) + 1; });
      return Object.keys(m).map(function (k) { return [k, m[k]]; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    }
    function block(title, rows) {
      var max = rows.length ? rows[0][1] : 1;
      return '<div class="ca-st"><h5>' + esc(title) + "</h5>" +
        rows.map(function (r) {
          return '<div class="ca-row"><span>' + esc(r[0]) + '</span>' +
            '<span class="ca-bar"><i data-w="' + (r[1] / max * 100).toFixed(1) + '"></i></span>' +
            '<span class="ca-ct">' + r[1] + "</span></div>";
        }).join("") + "</div>";
    }
    return '<div class="ca-stats">' +
      block("朝代谱系 · 各朝精灵数", tally(function (s) { return s.era; })) +
      block("材质谱系 · 主材质分布", tally(function (s) { return s.primary; })) +
      "</div>";
  }

  function arcHTML() {
    var cards = IDS.map(function (id, i) {
      var s = S(id), era = (s && s.era) || "";
      return '<div class="ca-card" data-id="' + esc(id) + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(nameOf(id)) + '，查看档案">' +
        '<span class="ca-no">' + ("0" + (i + 1)).slice(-2) + "</span>" +
        '<img class="ca-img" src="精灵/透明/' + esc(id) + '.webp" alt="' + esc(nameOf(id)) + '" loading="lazy">' +
        '<span class="ca-nm">' + esc(nameOf(id)) + "</span>" +
        '<span class="ca-er">' + esc(era) + "</span></div>";
    }).join("");

    return '<div class="craft-arc">' +
      '<div class="ca-head">' +
        '<span class="ca-kick">CARD SPREADS · 文 物 雅 集</span>' +
        '<h2 class="ca-h2">十四件文物，三种排布</h2>' +
        '<p class="ca-sub">弧形排布取自传统折扇的展开逻辑；邮票弧带齿孔边；平铺用于快速扫读。<br>点任意一件，查看它的完整档案。</p>' +
        '<div class="ca-modes">' +
          '<button type="button" class="ca-mode on" data-m="arc">弧线扇</button>' +
          '<button type="button" class="ca-mode" data-m="stamp">邮票弧</button>' +
          '<button type="button" class="ca-mode" data-m="line">平铺</button>' +
        "</div>" +
      "</div>" +
      '<div class="ca-stage" id="caStage">' + cards + "</div>" +
      statsHTML() +
    "</div>";
  }

  /* ② 声波加载条（通用） */
  function wave(host, text, done) {
    if (!host) return;
    var old = host.querySelector(".craft-wave-box");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var box = document.createElement("div");
    box.className = "craft-wave-box";
    var w = document.createElement("span"); w.className = "craft-wave";
    for (var i = 0; i < 7; i++) {
      var b = document.createElement("i");
      b.style.animationDelay = (i * 0.085).toFixed(3) + "s";
      w.appendChild(b);
    }
    var t = document.createElement("span");
    t.style.marginLeft = "8px";
    t.textContent = text || "正在准备…";
    box.appendChild(w); box.appendChild(t);
    host.appendChild(box);
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
      if (done) done();
    }, 520);
  }

  function layoutArc(mode) {
    var stage = document.getElementById("caStage");
    if (!stage) return;
    var cards = stage.querySelectorAll(".ca-card");
    var n = cards.length;
    var spread = 118, R = Math.min(stage.getBoundingClientRect().height - 46, 360);
    var step = spread / n;
    for (var i = 0; i < n; i++) {
      var a = -spread / 2 + (i + 0.5) * step;
      var t;
      if (mode === "line") {
        var w = stage.getBoundingClientRect().width;
        var gap = Math.min(96, w / (n + 0.6));
        t = "translate(-50%,-50%) translateX(" + ((i - (n - 1) / 2) * gap).toFixed(1) + "px) translateY(-" + (R * 0.92).toFixed(1) + "px)";
      } else {
        t = "translate(-50%,-50%) rotate(" + a.toFixed(2) + "deg) translateY(-" + R.toFixed(1) + "px) rotate(" + (-a).toFixed(2) + "deg)";
      }
      cards[i].style.transform = t;
      cards[i].style.zIndex = String(10 + Math.abs(i - (n - 1) / 2) * -1 + n);
    }
    stage.classList.toggle("is-stamp", mode === "stamp");
    stage.classList.toggle("is-line", mode === "line");
    // 图表入场
    var bars = stage.parentNode.querySelectorAll(".ca-bar i");
    for (var j = 0; j < bars.length; j++) {
      (function (b, k) {
        setTimeout(function () { b.style.width = b.getAttribute("data-w") + "%"; }, 120 + k * 60);
      })(bars[j], j);
    }
  }

  /* ============================ 路由 #/arc ============================ */
  var ARC = { mounted: false, mode: "arc" };

  function arcMount() {
    var host = document.getElementById("app") || document.querySelector(".rh-main") || document.body;
    if (!host || ARC.mounted) return;
    var wrap = document.createElement("section");
    wrap.className = "craft-arc-host";
    wrap.innerHTML = arcHTML();
    host.innerHTML = "";
    host.appendChild(wrap);
    ARC.mounted = true;

    var stage = document.getElementById("caStage");
    if (stage) {
      stage.addEventListener("click", function (e) {
        var c = e.target.closest ? e.target.closest(".ca-card") : null;
        if (c && c.getAttribute("data-id")) location.hash = "#/spirit/" + c.getAttribute("data-id");
      });
      stage.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
        var c = e.target.closest ? e.target.closest(".ca-card") : null;
        if (!c) return;
        e.preventDefault();
        if (c.getAttribute("data-id")) location.hash = "#/spirit/" + c.getAttribute("data-id");
      });
    }
    var modes = wrap.querySelectorAll(".ca-mode");
    for (var i = 0; i < modes.length; i++) {
      modes[i].addEventListener("click", function (e) {
        var b = e.currentTarget;
        for (var k = 0; k < modes.length; k++) modes[k].classList.remove("on");
        b.classList.add("on");
        ARC.mode = b.getAttribute("data-m") || "arc";
        wave(stage, ARC.mode === "stamp" ? "正在贴齿孔…" : "正在排布…", function () {
          layoutArc(ARC.mode);
        });
      });
    }
    layoutArc(ARC.mode);
    window.addEventListener("resize", function () { if (ARC.mounted) layoutArc(ARC.mode); });
  }
  function arcUnmount() { ARC.mounted = false; }

  function isArc() {
    return String(location.hash || "").replace(/^#\/?/, "").split("/")[0] === "arc";
  }
  function onHash() {
    if (isArc()) setTimeout(arcMount, 0);
    else arcUnmount();
  }
  window.addEventListener("hashchange", onHash);

  /* ============================ 启用 / 停用（内部用，无 UI） ============================ */
  function apply(on) {
    enabled = !!on;
    if (on) {
      injectCss();
      scanReveal();
    } else {
      dropCss();
      clearReveal();
      var mags = document.querySelectorAll(".craft-magnet");
      for (var i = 0; i < mags.length; i++) mags[i].style.transform = "";
    }
  }

  /* ============================ ② 主页换牌声波条 ============================ */
  var homeBound = false;
  function bindHome() {
    if (homeBound) return;
    homeBound = true;
    document.addEventListener("click", function (e) {
      if (!enabled) return;
      var t = e.target;
      var btn = (t && t.closest) ? t.closest(".rh-decks button") : null;
      if (!btn) return;
      var host = document.getElementById("rhFan") || btn.closest(".rh-fanbar") || btn.parentNode;
      if (!host) return;
      try { if (getComputedStyle(host).position === "static") host.style.position = "relative"; } catch (er) {}
      var txt = btn.getAttribute("data-rh-deck") === "b" ? "正在取镇馆七珍…" : "正在取初始七友…";
      wave(host, txt);
    }, true);
  }

  /* ============================ 启动 ============================ */
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "craft-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4200);
  }

  function boot() {
    if (typeof SPIRITS === "undefined") { setTimeout(boot, 400); return; }
    try {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("craft-in");
          try { io.unobserve(en.target); } catch (e) {}
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    } catch (e) { io = null; }
    try { localStorage.removeItem("aw_craft_off"); } catch (e) {}
    apply(true);
    bindHome();
    try {
      if (!sessionStorage.getItem("aw_craft_seen")) { toast("✨ 微交互已启用 · 主页七组，卡牌页三组"); }
      sessionStorage.setItem("aw_craft_seen", "1");
    } catch (e) {}
    setInterval(function () {
      if (enabled) { scanReveal(); if (isArc() && !ARC.mounted) arcMount(); }
    }, 1500);
    onHash();
  }

  window.AWCraft = {
    on: function (v) { apply(!!v); },
    isOn: function () { return enabled; },
    arc: function () { location.hash = "#/arc"; }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(boot, 60);
  else window.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 60); });
})();
