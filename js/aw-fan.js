/* =============================================================================
 * js/aw-fan.js · 首页「真·中国风动态折扇」展示层
 * -----------------------------------------------------------------------------
 *  把首页下方 14 张文物卡片（初始七友 7 + 镇馆七珍 7）重构为一把真正的折扇：
 *   · 真实扇形几何：以扇轴为铰接点，14 片扇叶沿扇轴放射状分布，共用同一扇形
 *     path（上指扇形环段），各自绕扇轴旋转到目标角度，外缘成连续圆弧。
 *   · 扇骨与扇叶联动：每片扇叶中心一根扇骨，从扇轴向外、方向与扇叶中心一致，
 *     与扇叶共用同一旋转角度（同一个旋转组），严格对齐不错位。
 *   · 收拢 / 展开动画：扇轴固定，扇叶绕轴旋转；中央扇叶先动、两侧依次展开，
 *     收拢反向；缓动 + 错相，可反复执行（rAF 驱动，角度即状态，绝不错乱）。
 *   · 文物可读性：扇叶随扇形倾斜，但「图 + 名称 + 编号」反向旋转保持水平，
 *     始终落在本扇叶可视区内，不溢出相邻扇叶。
 *   · 交互完整保留：点扇叶 → 跳该文物原有详情页 #/spirit/{id}（路由不变）；
 *     键盘 Tab 聚焦 + Enter/Space 打开；点扇轴 / 按钮收展，与扇叶互不干扰。
 *  约定：上方圆窗展示不改动；red-v2.js 的 buildFan/layoutFan/selectCard 已加
 *        __AW_FAN_ON__ 守卫，本模块接管扇区（#rhFan），数据源读 __RH_FAN_SRC__。
 * =========================================================================== */
(function () {
  "use strict";
  if (window.__AW_FAN__) return;
  window.__AW_FAN__ = 1;
  window.__AW_FAN_ON__ = 1;                 // 通知 red-v2.js 的旧扇阵让位

  var REDUCED = false;
  try { REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function S(id) { return (typeof SPIRITS !== "undefined" && SPIRITS[id]) ? SPIRITS[id] : null; }

  /* ------------------------- 14 件文物（读 red-v2 数据源，兜底硬编码同序） ------------------------- */
  var FALLBACK_IDS = ["wuzhuqian", "qinghuaci", "yuzhui", "jinqi", "yinqi", "xuanzhi", "xiangqi",
                      "tielion", "changxin", "longfengfan", "yuzhulong", "lianhuazun", "houmuwuding", "jituiping"];
  var SRC = window.__RH_FAN_SRC__ || {};
  var IDS = (SRC.DECKS && SRC.DECKS.a && SRC.DECKS.b)
    ? SRC.DECKS.a.ids.concat(SRC.DECKS.b.ids)
    : FALLBACK_IDS;
  function nameOf(id) {
    if (SRC.SHORT_NAME && SRC.SHORT_NAME[id]) return SRC.SHORT_NAME[id];
    var s = S(id); return s ? s.name : id;
  }

  /* ============================ 扇形几何参数（统一模型） ============================ */
  var VB_X = 184, VB_W = 832, VB_H = 500;   // 收紧到扇面包围盒，移动端缩放更大
  var CX = 600, CYP = 430;                  // 扇轴（铰接点）
  var R0 = 72, R1 = 415;                    // 扇面内 / 外半径
  var SPREAD = 156;                         // 总展开角
  var N = IDS.length;                       // 14
  var GAP = 0.9;                            // 相邻扇叶缝隙角
  var step = SPREAD / N;
  var half = (step - GAP) / 2;              // 扇叶半角
  var RC = 310;                             // 内容锚点半径：图/名/号直立块的中心，精确落在扇叶中心线上

  function rad(d) { return d * Math.PI / 180; }
  function pt(r, a) { return [CX + r * Math.sin(rad(a)), CYP - r * Math.cos(rad(a))]; }
  function f(p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }
  function leafAngle(i) { return -SPREAD / 2 + (i + 0.5) * step; }

  /* 上指扇形环段（所有扇叶共用同一形状，仅旋转角度不同） */
  function wedgePath() {
    var il = pt(R0, -half), ol = pt(R1, -half), orr = pt(R1, half), ir = pt(R0, half);
    return "M" + f(il) + " L" + f(ol) +
           " A" + R1 + "," + R1 + " 0 0 1 " + f(orr) +
           " L" + f(ir) +
           " A" + R0 + "," + R0 + " 0 0 0 " + f(il) + " Z";
  }

  /* ============================ 注入样式 ============================ */
  var CSS = [
    ".rh-decks{display:none!important}",      // 14 叶全量折扇已含两套牌阵，符牌切换钮隐藏
    ".rh-fan{height:clamp(330px,38vw,520px)!important}",
    ".rh-fan::before,.rh-fan::after{display:none!important}",
    ".rh-cards{position:static!important;inset:auto!important;height:100%!important}",
    ".aw-fan-svg{display:block;width:100%;height:100%;overflow:visible}",
    "@media (max-width:760px){.rh-fan{height:76vw!important}.leaf-name{font-size:23px}.leaf-no{font-size:14px}}",
    ".fan-node{cursor:pointer;outline:none}",
    ".leaf-paper{fill:url(#awFanPaper);stroke:#C89A52;stroke-width:1.1;stroke-linejoin:round;transition:fill .3s,stroke .3s,filter .3s}",
    ".fan-leaf:nth-child(even) .leaf-paper{fill:url(#awFanPaper2)}",
    ".fan-leaf:hover .leaf-paper,.fan-leaf:focus-visible .leaf-paper,.fan-leaf.is-hover .leaf-paper{stroke:#FFDFA0;stroke-width:1.6;filter:brightness(1.06) drop-shadow(0 6px 14px rgba(60,10,4,.35))}",
    ".fan-leaf:focus-visible{outline:none}",
    ".fan-leaf:focus-visible .leaf-paper{stroke:#FFE9B8;stroke-width:2}",
    ".leaf-bone{stroke:url(#awFanBone);stroke-width:2.6;stroke-linecap:round;opacity:.5}",
    ".fan-edge line{stroke:url(#awFanBone);stroke-width:5;stroke-linecap:round;opacity:.9}",
    ".leaf-name{font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;font-size:15px;font-weight:700;fill:#7C0A0D;text-anchor:middle;letter-spacing:1px;paint-order:stroke;stroke:rgba(255,250,238,.9);stroke-width:3px}",
    ".leaf-no{font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;font-size:10px;font-weight:800;fill:#A50F17;text-anchor:middle;letter-spacing:1px;paint-order:stroke;stroke:rgba(255,250,238,.85);stroke-width:2.4px}",
    ".leaf-content{cursor:pointer}",
    ".fan-pivot{cursor:pointer}",
    ".aw-fan-toggle{position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);z-index:60;",
    "  font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;font-size:12.5px;letter-spacing:2px;cursor:pointer;",
    "  padding:6px 18px;border-radius:999px;color:#FFE9B8;",
    "  background:linear-gradient(180deg,#C0392F,#A5181C);border:1px solid rgba(255,214,150,.75);",
    "  box-shadow:0 6px 16px rgba(60,10,6,.4);transition:transform .2s,box-shadow .2s}",
    ".aw-fan-toggle:hover{transform:translateX(-50%) translateY(-2px);box-shadow:0 10px 22px rgba(60,10,6,.5)}",
    "@media (prefers-reduced-motion:reduce){.leaf-paper{transition:none}}"
  ].join("\n");
  (function injectCss() {
    var st = document.createElement("style");
    st.id = "aw-fan-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ============================ 构建 SVG ============================ */
  function buildSVG() {
    var wedge = wedgePath();
    var i, id, nm, ang;
    var ribs = "", leaves = "", edgeL, edgeR;

    // 中央扇轴阴影底
    var shadow = '<ellipse class="fan-shadow" cx="' + CX + '" cy="' + (CYP + 8) + '" rx="430" ry="34" fill="rgba(40,4,6,.28)"/>';

    // 14 片扇叶
    var leafArr = [];
    for (i = 0; i < N; i++) {
      id = IDS[i]; nm = nameOf(id); ang = leafAngle(i);
      var imgS = 52, imgX = CX - imgS / 2, imgY = CYP - 350 - imgS / 2;
      var nameY = CYP - 300, noY = CYP - 264;
      leafArr.push(
        '<g class="fan-node fan-leaf" data-ang="' + ang.toFixed(3) + '" data-id="' + esc(id) + '" tabindex="0" role="button" aria-label="' + esc(nm) + '，查看档案" transform="rotate(0 ' + CX + ' ' + CYP + ')">' +
          '<path class="leaf-paper" d="' + wedge + '"/>' +
          '<line class="leaf-bone" x1="' + CX + '" y1="' + (CYP - 28) + '" x2="' + CX + '" y2="' + (CYP - R1 + 3) + '"/>' +
          '<g class="leaf-content" transform="rotate(0 ' + CX + ' ' + CYO + ')">' +
            '<image class="leaf-img" href="精灵/透明/' + esc(id) + '.webp" x="' + imgX + '" y="' + imgY + '" width="' + imgS + '" height="' + imgS + '"/>' +
            '<text class="leaf-name" x="' + CX + '" y="' + nameY + '">' + esc(nm) + '</text>' +
            '<text class="leaf-no" x="' + CX + '" y="' + noY + '">' + ('0' + (i + 1)).slice(-2) + '</text>' +
          '</g>' +
        '</g>'
      );
    }

    // 两根大骨（左右外缘，最粗）
    var eAng = SPREAD / 2;
    edgeL = '<g class="fan-node fan-edge" data-ang="' + (-eAng).toFixed(3) + '" transform="rotate(0 ' + CX + ' ' + CYP + ')">' +
            '<line x1="' + CX + '" y1="' + (CYP - 24) + '" x2="' + CX + '" y2="' + (CYP - R1 - 2) + '"/></g>';
    edgeR = '<g class="fan-node fan-edge" data-ang="' + (eAng).toFixed(3) + '" transform="rotate(0 ' + CX + ' ' + CYP + ')">' +
            '<line x1="' + CX + '" y1="' + (CYP - 24) + '" x2="' + CX + '" y2="' + (CYP - R1 - 2) + '"/></g>';

    // 扇轴（铰接 + 扇钉）+ 扇柄 + 流苏
    var pivot =
      '<g class="fan-pivot" id="awFanPivot" tabindex="0" role="button" aria-label="收拢或展开折扇">' +
        '<rect x="' + (CX - 7) + '" y="' + CYP + '" width="14" height="34" rx="6" fill="url(#awFanBone)"/>' +
        '<circle cx="' + CX + '" cy="' + CYP + '" r="17" fill="url(#awFanPivotG)" stroke="#8A5B2A" stroke-width="1.5"/>' +
        '<circle cx="' + CX + '" cy="' + CYP + '" r="7" fill="#7C0F13"/>' +
        '<circle cx="' + CX + '" cy="' + (CYP - 2) + '" r="2.4" fill="#FFDFA0"/>' +
      '</g>';
    var tassel =
      '<g class="fan-tassel" aria-hidden="true">' +
        '<circle cx="' + CX + '" cy="' + (CYP + 40) + '" r="4" fill="#C0392F"/>' +
        '<line x1="' + CX + '" y1="' + (CYP + 44) + '" x2="' + (CX - 7) + '" y2="' + (CYP + 78) + '" stroke="#A5181C" stroke-width="2.2" stroke-linecap="round"/>' +
        '<line x1="' + CX + '" y1="' + (CYP + 44) + '" x2="' + CX + '" y2="' + (CYP + 82) + '" stroke="#C0392F" stroke-width="2.6" stroke-linecap="round"/>' +
        '<line x1="' + CX + '" y1="' + (CYP + 44) + '" x2="' + (CX + 7) + '" y2="' + (CYP + 78) + '" stroke="#A5181C" stroke-width="2.2" stroke-linecap="round"/>' +
      '</g>';

    return '<svg class="aw-fan-svg" viewBox="' + VB_X + ' 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="xMidYMid meet" role="group" aria-label="文物折扇，共十四件文物">' +
      '<defs>' +
        '<linearGradient id="awFanPaper" x1="0" y1="1" x2="0" y2="0">' +
          '<stop offset="0" stop-color="#F3E4C2"/><stop offset=".55" stop-color="#FBF3E0"/><stop offset="1" stop-color="#FFFDF6"/></linearGradient>' +
        '<linearGradient id="awFanPaper2" x1="0" y1="1" x2="0" y2="0">' +
          '<stop offset="0" stop-color="#EFDCB6"/><stop offset=".55" stop-color="#F7EBD2"/><stop offset="1" stop-color="#FCF6E8"/></linearGradient>' +
        '<linearGradient id="awFanBone" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0" stop-color="#7A2E1A"/><stop offset=".5" stop-color="#A0502A"/><stop offset="1" stop-color="#6A2413"/></linearGradient>' +
        '<radialGradient id="awFanPivotG" cx=".4" cy=".35" r=".8">' +
          '<stop offset="0" stop-color="#FFE9B8"/><stop offset=".6" stop-color="#D9A75A"/><stop offset="1" stop-color="#9A6A2E"/></radialGradient>' +
      '</defs>' +
      shadow +
      edgeL + leafArr.join("") + edgeR +
      pivot + tassel +
    '</svg>';
  }

  /* ============================ 动画状态与驱动 ============================ */
  var nodes = [];        // {el, content, angle}
  var cur = [];          // 当前角度
  var isOpen = false, rafId = 0;

  function collectNodes(fan) {
    nodes = []; cur = [];
    var els = fan.querySelectorAll(".fan-node");
    var arr = Array.prototype.slice.call(els);
    arr.sort(function (a, b) { return parseFloat(a.getAttribute("data-ang")) - parseFloat(b.getAttribute("data-ang")); });
    arr.forEach(function (el) {
      nodes.push({
        el: el,
        content: el.querySelector(".leaf-content"),
        angle: parseFloat(el.getAttribute("data-ang"))
      });
      cur.push(0);
    });
  }
  function setAng(i, a) {
    cur[i] = a;
    var nd = nodes[i];
    nd.el.setAttribute("transform", "rotate(" + a.toFixed(3) + " " + CX + " " + CYP + ")");
    if (nd.content) nd.content.setAttribute("transform", "rotate(" + (-a).toFixed(3) + " " + CX + " " + CYO + ")");
  }
  function snapTo(open) {                       // 无动画直接到位（reduced-motion / 初始化）
    cancelAnimationFrame(rafId);
    for (var i = 0; i < nodes.length; i++) setAng(i, open ? nodes[i].angle : 0);
    isOpen = open;
  }
  function animate(open) {
    cancelAnimationFrame(rafId);
    isOpen = open;                              // 启动即置状态，按钮文字立刻正确
    updateToggle();
    if (REDUCED) { snapTo(open); return; }
    var DUR = 700, STAG = 34, mid = (nodes.length - 1) / 2;
    var from = cur.slice();
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    function frame(now) {
      var t = now - t0, done = true, i, dist, delay, p, e, target;
      for (i = 0; i < nodes.length; i++) {
        dist = Math.abs(i - mid);
        delay = open ? dist * STAG : (mid - dist) * STAG;   // 展开：中央先动；收拢：两侧先动
        p = (t - delay) / DUR; if (p < 0) p = 0; if (p > 1) p = 1;
        e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;   // easeInOutCubic
        target = open ? nodes[i].angle : 0;
        setAng(i, from[i] + (target - from[i]) * e);
        if (p < 1) done = false;
      }
      if (!done) rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
  }

  /* ============================ 交互 ============================ */
  var toggleBtn = null;
  function updateToggle() {
    if (!toggleBtn) return;
    toggleBtn.textContent = isOpen ? "收拢折扇" : "展开折扇";
    toggleBtn.setAttribute("aria-pressed", isOpen ? "true" : "false");
  }
  function toggle() { animate(!isOpen); }

  function bindInteractions(fan) {
    var svg = fan.querySelector(".aw-fan-svg");
    // 拖拽抑制：拖动时不触发扇叶点击
    var pdX = 0, pdY = 0, moved = false;
    if (svg) {
      svg.addEventListener("pointerdown", function (e) { pdX = e.clientX; pdY = e.clientY; moved = false; });
      svg.addEventListener("pointermove", function (e) {
        if (Math.abs(e.clientX - pdX) + Math.abs(e.clientY - pdY) > 12) moved = true;
      });
    }
    // 扇叶点击 → 打开原有详情页（路由不变）
    fan.querySelectorAll(".fan-leaf").forEach(function (leaf) {
      var id = leaf.getAttribute("data-id");
      function open() { if (moved) return; if (id) location.hash = "#/spirit/" + id; }
      leaf.addEventListener("click", function (e) { e.stopPropagation(); open(); });
      leaf.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); e.stopPropagation(); open(); }
      });
    });
    // 扇轴点击 → 收拢 / 展开
    var pivot = fan.querySelector("#awFanPivot");
    if (pivot) {
      pivot.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
      pivot.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); e.stopPropagation(); toggle(); }
      });
    }
    // 展开按钮
    toggleBtn = fan.querySelector("#awFanToggle");
    if (toggleBtn) toggleBtn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
  }

  /* ============================ 注入与重渲染看守 ============================ */
  function inject() {
    var fan = document.getElementById("rhFan");
    if (!fan) return false;
    if (fan.querySelector(".aw-fan-svg")) return true;        // 已注入
    fan.innerHTML =
      '<div class="rh-cards" id="rhCards">' + buildSVG() + '</div>' +
      '<button type="button" class="aw-fan-toggle" id="awFanToggle" aria-pressed="true">收拢折扇</button>';
    collectNodes(fan);
    bindInteractions(fan);
    if (REDUCED) { snapTo(true); updateToggle(); }
    else { snapTo(false); updateToggle(); setTimeout(function () { animate(true); }, 420); }
    return true;
  }

  function watch() {
    if (typeof MutationObserver === "undefined") return;
    var app = document.getElementById("app") || document.body;
    var mo = new MutationObserver(function () {
      var fan = document.getElementById("rhFan");
      if (fan && !fan.querySelector(".aw-fan-svg")) inject();
    });
    mo.observe(app, { childList: true, subtree: true });
  }

  function boot() {
    inject();
    watch();
    // 首屏多试几次，等 red-v2 渲染完扇区
    setTimeout(inject, 120);
    setTimeout(inject, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.AWFan = { open: function () { animate(true); updateToggle(); }, close: function () { animate(false); updateToggle(); }, toggle: toggle };
})();
