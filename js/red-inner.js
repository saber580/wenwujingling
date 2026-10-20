/* =========================================================
   文物精灵 · 红版预设 V2 —— 内页点缀脚本
   只做两件小事：① 去掉页头标题里的表情符号，题额更庄重
                ② 给「精灵档案 / 站点」页补一条返回用的题签
   不改任何业务逻辑，首页完全不受影响
   ========================================================= */
(function () {
  "use strict";

  var EMOJI = /^[\uFE0F\u200D\s\u2600-\u27BF\u2B00-\u2BFF\uE000-\uF8FF\uD800-\uDBFF\uDC00-\uDFFF]+/;

  function stripEmoji(el) {
    if (!el) return;
    var t = el.textContent || "";
    var s = t.replace(EMOJI, "").trim();
    if (s && s !== t.trim()) el.textContent = s;
  }

  function currentPage() {
    return document.body.dataset.page || "";
  }

  function decorateHead() {
    var heads = document.querySelectorAll("#app .page-head h2");
    for (var i = 0; i < heads.length; i++) stripEmoji(heads[i]);
  }

  function decorateCrumb() {
    var app = document.getElementById("app");
    if (!app || app.querySelector(".ri-crumb")) return;
    var page = currentPage();
    if (page !== "spirit" && page !== "station") return;
    var first = app.firstElementChild;
    if (!first) return;

    var box = document.createElement("div");
    box.className = "ri-crumb";
    if (page === "spirit") {
      box.innerHTML = '<a href="#/codex">文物图鉴</a><i>／</i><b>精灵档案</b>';
    } else {
      box.innerHTML = '<a href="#/">燕赵十三站</a><i>／</i><b>站内文物</b>';
    }
    app.insertBefore(box, first);
  }

  /* 卷轴右上角落一枚闲章 */
  function decorateSeal() {
    var app = document.getElementById("app");
    if (!app || app.querySelector(".ri-seal")) return;
    if (currentPage() === "home") return;
    var seal = document.createElement("div");
    seal.className = "ri-seal";
    seal.setAttribute("aria-hidden", "true");
    seal.innerHTML = "<i>文</i><i>物</i><i>精</i><i>靈</i>";
    app.appendChild(seal);
  }

  /* 心仪卡工坊：站内一页，嵌「白相」卡片编辑器 */
  var HEART_HTML = ''
    + '<div class="ri-heart">'
    + '  <div class="page-head">'
    + '    <h2>心仪卡工坊</h2>'
    + '    <p>在白相工作室里，把喜欢的文物调成一张属于自己的全息典藏卡：卡面比例、景深、光影、材质与正反面都能自己定，满意了直接保存成图片。</p>'
    + '  </div>'
    + '  <div class="ri-heart-bar">'
    + '    <span class="ri-heart-badge">白相 · WHITE ATELIER</span>'
    + '    <span class="ri-heart-acts">'
    + '      <button type="button" class="btn ghost" onclick="riHeartReload()">↻ 重新载入</button>'
    + '      <button type="button" class="btn gold" onclick="riHeartOpen()">↗ 新窗口打开</button>'
    + '    </span>'
    + '  </div>'
    + '  <div class="ri-heart-frame">'
    + '    <iframe id="riHeartFrame" src="心仪卡/index.html" title="心仪卡工坊 · 白相" allow="fullscreen"></iframe>'
    + '  </div>'
    + '  <p class="ri-heart-note">卡面在框内可直接调整，右侧滑块改细节，拖动能换角度；想看得更清楚就点「新窗口打开」全屏编辑，调好后按右上角 ↓ 保存卡片图片。</p>'
    + '</div>';

  /* 把「我收集到的精灵」告诉内嵌的心仪卡：它会把这些排到最前并盖一枚小印 */
  function bindHeartFrame() {
    var fr = document.getElementById("riHeartFrame");
    if (!fr || fr.dataset.bound === "1") return;
    fr.dataset.bound = "1";
    fr.addEventListener("load", function () {
      try {
        var ids = (typeof captured !== "undefined" && captured) ? captured : [];
        fr.contentWindow.postMessage({ type: "relics", ids: ids }, "*");
      } catch (e) {}
    });
  }

  function ensureHeart() {
    if (location.hash.indexOf("#/heart") !== 0) return;
    var app = document.getElementById("app");
    if (!app) return;
    if (app.querySelector(".ri-heart")) { bindHeartFrame(); return; }
    app.innerHTML = HEART_HTML;
    bindHeartFrame();
  }

  window.riHeartReload = function () {
    var f = document.getElementById("riHeartFrame");
    if (f) f.src = "心仪卡/index.html?t=" + Date.now();
  };
  window.riHeartOpen = function () {
    window.open("心仪卡/index.html", "_blank");
  };

  /* AI 旅游攻略：#/guide 由 js/guide.js 自己接管路由与挂载 */
  function decorate() {
    if (currentPage() === "home") return;
    ensureHeart();
    decorateHead();
    decorateCrumb();
    decorateSeal();
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; decorate(); }, 40);
  }

  window.addEventListener("hashchange", function () { setTimeout(decorate, 20); });
  document.addEventListener("DOMContentLoaded", function () {
    decorate();
    var app = document.getElementById("app");
    if (app && window.MutationObserver) {
      new MutationObserver(schedule).observe(app, { childList: true });
    }
  });
})();
