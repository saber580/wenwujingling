/* =========================================================
   心仪卡 · 精灵选卡（接「白相」全息卡片）
   思路：不动原程序的渲染，只替换它暴露出来的贴图
        window.__holo.uniforms.tSubject / tText / tLine
        - tSubject ← 精灵 PNG 合成到 1024×1536 画布（居中 + 落影）
        - tText    ← canvas 现场绘制的金色描边字（名字 / 别名 / 属性 / 编号）
        - tLine    ← 全白（原卡线稿不适用于新主体）
   同时更新页面上的标题、副标题、描述与编号。
   ========================================================= */
(function () {
  "use strict";

  var SP = window.__CARD_SPIRITS__ || [];
  if (!SP.length) return;

  var W = 1024, H = 1536;
  var GOLD = "#D9BA84";
  var SERIF = '"Songti SC","Noto Serif SC","STSong",SimSun,serif';
  var currentId = null;

  /* 四字一般用「材质」的词；只有语义极强的几类（钱、兵、印、书）改用用途词 */
  var FOUR_BY_USE = {
    "货币": "通宝流泉", "兵器": "金戈铁马", "印章": "方寸信印", "文献档案": "纸上千年"
  };

  /* ---------- 纹理工具 ---------- */
  function cloneTex(old, image) {
    var T = old.constructor;
    var t = new T(image);
    try {
      if (old.colorSpace !== undefined) t.colorSpace = old.colorSpace;
      if (old.wrapS !== undefined) t.wrapS = old.wrapS;
      if (old.wrapT !== undefined) t.wrapT = old.wrapT;
      if (old.magFilter !== undefined) t.magFilter = old.magFilter;
      if (old.minFilter !== undefined) t.minFilter = old.minFilter;
      if (old.anisotropy !== undefined) t.anisotropy = old.anisotropy;
      t.generateMipmaps = old.generateMipmaps;
      t.flipY = old.flipY;
    } catch (e) {}
    t.needsUpdate = true;
    return t;
  }

  function whiteCanvas() {
    var c = document.createElement("canvas");
    c.width = c.height = 4;
    var x = c.getContext("2d");
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, 4, 4);
    return c;
  }

  /* ---------- 主体层：精灵居中 + 一点落影 ---------- */
  function drawSubject(img) {
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var x = c.getContext("2d");

    var target = 880;                                  /* 主体高度：占卡片约 57%，更接近原卡体量 */
    var r = Math.min(target / img.width, target / img.height);
    var w = img.width * r, h = img.height * r;
    var cx = (W - w) / 2;
    var cy = (H - h) / 2 - 112;

    var gy = cy + h * 0.93;
    var g = x.createRadialGradient(W / 2, gy, 4, W / 2, gy, w * 0.62);
    g.addColorStop(0, "rgba(0,0,0,.34)");
    g.addColorStop(0.55, "rgba(0,0,0,.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(W / 2, gy, w * 0.52, h * 0.055, 0, 0, Math.PI * 2);
    x.fill();

    x.drawImage(img, cx, cy, w, h);
    return c;
  }

  /* ---------- 文字层：金色描边字 ---------- */
  function nameSize(name) {
    var n = (name || "").length;
    if (n <= 2) return 168;
    if (n === 3) return 152;
    if (n === 4) return 124;
    if (n === 5) return 102;
    return 84;
  }

  function drawText(sp) {
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var x = c.getContext("2d");
    x.clearRect(0, 0, W, H);
    x.lineJoin = "round";
    x.lineCap = "round";
    x.strokeStyle = GOLD;
    x.shadowColor = "rgba(230,196,140,.5)";
    x.textBaseline = "alphabetic";

    function setFont(px) {
      x.font = px + "px " + SERIF;
      if ("letterSpacing" in x) x.letterSpacing = "0px";
    }

    /* 金色细线 */
    function rule(y, x1, x2, w, a) {
      x.save();
      x.shadowBlur = 0;
      x.strokeStyle = "rgba(201,164,106," + (a || 0.7) + ")";
      x.lineWidth = w || 1.6;
      x.beginPath();
      x.moveTo(x1, y);
      x.lineTo(x2, y);
      x.stroke();
      x.restore();
    }

    function strokeText(text, px, left, top, spacing, align) {
      setFont(px);
      x.lineWidth = Math.max(2, px * 0.024);
      x.shadowBlur = Math.min(14, px * 0.12);
      if ("letterSpacing" in x) x.letterSpacing = (spacing || 0) + "px";
      x.textAlign = align || "left";
      x.strokeText(text, left, top);
    }

    var nm = sp.name || "";
    var alias = sp.alias || "";
    var kind = (sp.p || "文物") + " · 全息典藏";
    var four = FOUR_BY_USE[sp.s] || sp.four || "燕赵遗珍";
    var era = (sp.era || "")
      .replace(/[(（][^)）]*[)）]/g, "")
      .replace(/\s*[,，].*$/, "")
      .trim();
    if (era.length > 14) era = era.slice(0, 13) + "…";
    var meta = era || (sp.s || "典藏");

    /* 左上：别名 / 名字 / 品类，随字号自动下排 */
    var ns = nameSize(nm);
    if (alias) strokeText(alias, 33, 58, 118, 5);
    var nameY = 118 + Math.round(ns * 0.92);
    strokeText(nm, ns, 58, nameY, 8);
    var kindY = nameY + 84;
    strokeText(kind, 29, 58, kindY, 3);
    rule(kindY + 38, 58, 966, 1.6, 0.62);

    /* 右下 */
    rule(1236, 58, 966, 1.6, 0.62);
    strokeText(meta, 34, 512, 1296, 4, "center");
    strokeText(four, 112, 512, 1412, 12, "center");

    /* 页脚 */
    strokeText(sp.no || "", 23, 58, 1478, 2);
    strokeText("HOLOGRAPHIC", 21, 966, 1478, 3, "right");

    if ("letterSpacing" in x) x.letterSpacing = "0px";
    return c;
  }

  /* ---------- 应用到 3D 卡片 ---------- */
  function apply(sp) {
    var holo = window.__holo;
    if (!holo || !holo.uniforms) return;

    var img = new Image();
    img.onload = function () {
      var u = holo.uniforms;
      var sub = drawSubject(img);
      var txt = drawText(sp);

      u.tSubject.value = cloneTex(u.tSubject.value, sub);
      u.tText.value = cloneTex(u.tText.value, txt);
      if (u.tLine && u.tLine.value) u.tLine.value = cloneTex(u.tLine.value, whiteCanvas());

      if (holo.config) {
        holo.config.title = sp.name;
        holo.config.description = (sp.era ? sp.era + "｜" : "") + (sp.p || "") + " · " + (sp.s || "");
      }
      syncDom(sp);
      currentId = sp.id;
      paintActive();
    };
    img.src = sp.img;
  }

  function syncDom(sp) {
    var set = function (id, v) {
      var el = document.getElementById(id);
      if (el && v != null) el.textContent = v;
    };
    set("card-title", sp.name);
    set("subtitle", sp.alias || "");
    set("description", (sp.era ? sp.era + "｜" : "") + (sp.p || "") + " · " + (sp.s || ""));
    set("edition", sp.no || "STUDY 001");
    set("about-edition", sp.no || "STUDY 001");
    set("about-title", sp.name + (sp.alias ? " / " + sp.alias : ""));
    document.title = sp.name + " · 白相";
  }

  /* ---------- 底部选卡条 ---------- */
  function buildBar() {
    var bar = document.createElement("div");
    bar.className = "cs-bar";
    bar.innerHTML =
      '<div class="cs-head">' +
      '  <span class="cs-title">从图鉴挑一只</span>' +
      '  <span class="cs-sub">74 件文物精灵 · 点一下即可换卡</span>' +
      '  <button type="button" class="cs-fold" id="csFold">收起 ▾</button>' +
      "</div>" +
      '<div class="cs-list" id="csList"></div>';

    var list = bar.querySelector(".cs-list");
    SP.forEach(function (sp) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cs-item";
      b.dataset.id = sp.id;
      b.title = sp.name + (sp.alias ? " · " + sp.alias : "");
      b.innerHTML = '<img src="' + sp.img + '" alt=""><span>' + sp.name + "</span>";
      b.addEventListener("click", function () {
        if (currentId === sp.id) return;
        b.classList.add("loading");
        apply(sp);
        setTimeout(function () { b.classList.remove("loading"); }, 400);
      });
      list.appendChild(b);
    });

    document.body.appendChild(bar);
    document.body.classList.add("cs-on");

    bar.querySelector("#csFold").addEventListener("click", function () {
      var folded = bar.classList.toggle("folded");
      document.body.classList.toggle("cs-folded", folded);
      this.textContent = folded ? "展开 ▴" : "收起 ▾";
    });
  }

  /* 主站会把「我收集到的精灵」传进来：排到最前，并盖一枚小印 */
  function markMine(ids) {
    var set = {};
    (ids || []).forEach(function (id) { set[id] = 1; });
    var list = document.getElementById("csList");
    if (!list) return;
    var items = Array.prototype.slice.call(list.children);
    if (!items.length) return;
    items.sort(function (a, b) {
      return (set[b.dataset.id] ? 1 : 0) - (set[a.dataset.id] ? 1 : 0);
    });
    items.forEach(function (el) {
      list.appendChild(el);
      if (set[el.dataset.id]) el.classList.add("mine");
    });
    var sub = document.querySelector(".cs-sub");
    if (sub && ids.length) sub.textContent = "已收藏 " + ids.length + " 件在前 · 其余 74 件可任选";
  }

  var pendingIds = null;

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.type !== "relics" || !d.ids) return;
    pendingIds = d.ids;
    if (document.getElementById("csList")) markMine(pendingIds);
  });

  function paintActive() {
    var items = document.querySelectorAll(".cs-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("on", items[i].dataset.id === currentId);
    }
  }

  /* ---------- 样式 ---------- */
  function injectStyle() {
    var css = ''
      + '.cs-bar{position:fixed;left:0;right:0;bottom:0;z-index:60;'
      + '  background:rgba(250,250,248,.94);backdrop-filter:blur(14px);'
      + '  border-top:1px solid rgba(20,20,20,.10);'
      + '  box-shadow:0 -12px 34px rgba(20,20,20,.08);'
      + '  transition:transform .28s cubic-bezier(.2,.7,.3,1)}'
      + '.cs-bar.folded{transform:translateY(calc(100% - 46px))}'
      + '.cs-head{display:flex;align-items:center;gap:12px;padding:11px 22px 8px;max-width:1280px;margin:0 auto}'
      + '.cs-title{font-size:12px;letter-spacing:3px;color:#1a1a1a;font-weight:700}'
      + '.cs-title::before{content:"";display:inline-block;width:9px;height:9px;margin-right:8px;'
      + '  background:#1a1a1a;transform:rotate(45deg) translateY(-1px)}'
      + '.cs-sub{font-size:11px;color:#8a8a86;letter-spacing:.5px}'
      + '.cs-fold{margin-left:auto;border:1px solid rgba(20,20,20,.14);background:#fff;'
      + '  color:#4a4a46;font-size:11px;padding:5px 12px;border-radius:2px;cursor:pointer;font-family:inherit}'
      + '.cs-fold:hover{border-color:#1a1a1a;color:#111}'
      + '.cs-list{display:flex;gap:10px;overflow-x:auto;padding:6px 22px 14px;max-width:1280px;margin:0 auto;'
      + '  scrollbar-width:thin;scrollbar-color:rgba(20,20,20,.2) transparent}'
      + '.cs-list::-webkit-scrollbar{height:5px}'
      + '.cs-list::-webkit-scrollbar-thumb{background:rgba(20,20,20,.18);border-radius:3px}'
      + '.cs-item{flex:0 0 68px;border:1px solid rgba(20,20,20,.12);background:#fff;border-radius:3px;'
      + '  padding:6px 4px 5px;cursor:pointer;text-align:center;transition:.16s;font-family:inherit;'
      + '  display:flex;flex-direction:column;align-items:center;gap:3px}'
      + '.cs-item img{width:46px;height:46px;object-fit:contain;display:block;'
      + '  filter:drop-shadow(0 2px 4px rgba(0,0,0,.10))}'
      + '.cs-item span{font-size:9.5px;color:#5a5a56;letter-spacing:.2px;white-space:nowrap;'
      + '  overflow:hidden;text-overflow:ellipsis;max-width:60px}'
      + '.cs-item:hover{transform:translateY(-2px);box-shadow:0 8px 16px rgba(0,0,0,.08)}'
      + '.cs-item.on{border-color:#1a1a1a;background:#fdfcf8;box-shadow:0 0 0 1px #1a1a1a inset}'
      + '.cs-item.on span{color:#111;font-weight:700}'
      + '.cs-item.mine{border-color:rgba(165,15,23,.35)}'
      + '.cs-item.mine::after{content:"藏";position:absolute;top:-1px;right:-1px;'
      + '  width:13px;height:13px;line-height:13px;text-align:center;font-size:8px;color:#fff;'
      + '  background:#A50F17;border-radius:0 2px 0 2px}'
      + '.cs-item{position:relative}'
      + '.cs-item.loading{opacity:.55}'
      + 'body.cs-on{padding-bottom:150px!important}'
      + 'body.cs-folded{padding-bottom:64px!important}'
      + '@media (max-width:760px){'
      + '  .cs-head{padding:9px 12px 6px;gap:8px}'
      + '  .cs-sub{display:none}'
      + '  .cs-list{padding:4px 12px 10px;gap:8px}'
      + '  .cs-item{flex:0 0 60px}'
      + '  .cs-item img{width:40px;height:40px}'
      + '  body.cs-on{padding-bottom:138px!important}'
      + '}';

    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- 启动 ---------- */
  function boot() {
    injectStyle();
    buildBar();
    if (pendingIds) markMine(pendingIds);
    var tries = 0;
    (function wait() {
      if (window.__holo && window.__holo.ready && window.__holo.uniforms) {
        /* 首屏那张「象棋·将」就是象棋精灵，直接对上号，方便对照 */
        var pre = SP.filter(function (s) { return s.id === "xiangqi"; })[0];
        if (pre) { currentId = pre.id; paintActive(); }
        return;
      }
      if (++tries > 300) return;
      setTimeout(wait, 80);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
