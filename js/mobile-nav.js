/* =========================================================
   文物精灵 · 手机导航（MOBILE ONLY）
   ---------------------------------------------------------
   只在窄屏（<=860px）把顶栏里的五个入口搬到底部标签栏：
   首页 / 精灵 / 探索 / AI 工坊 / 我的
   「功能不变」：底部栏点下去调用的是原顶栏同一批链接与函数，
   顶栏 DOM 一行未改，只是窄屏时被 CSS 隐藏。
   若脚本未加载，body 不会带 .mnav-on，顶栏导航照常显示（自动降级）。
   ========================================================= */
(function () {
  "use strict";

  /* ---- 换页回顶部（全宽度通用）----
     站内是 hash 路由，换页本身不会复位滚动：
     在首页往下翻很多再点任一入口，新页面会停在半截，看着像"跳错了地方"。
     这里只处理页面级路由（#/codex、#/station/xxx…），回首页交给 navGo 的定位逻辑。 */
  function fixScrollOnRoute() {
    var h = location.hash || "";
    if (/^#\/[\w-]+/.test(h)) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
    }
  }
  window.addEventListener("hashchange", fixScrollOnRoute);

  var MQ = window.matchMedia("(max-width: 860px)");
  var built = false, mask = null, sheet = null, sheetBody = null, sheetTitle = null, curKey = "";

  var ICONS = {
    home: '<path d="M3.5 10.7 12 3.8l8.5 6.9"/><path d="M5.6 9.6V20h12.8V9.6"/><path d="M9.6 20v-5.3h4.8V20"/>',
    spirit: '<path d="M12 3.4l1.9 5.3 5.5.3-4.3 3.5 1.4 5.4L12 14.8l-4.5 3.1 1.4-5.4L4.6 9l5.5-.3z"/>',
    explore: '<circle cx="12" cy="12" r="8.4"/><path d="M15.3 8.7l-1.9 4.7-4.7 1.9 1.9-4.7z"/>',
    studio: '<path d="M12 3.6a8.4 8.4 0 100 16.8c1.5 0 2-.9 1.4-2.1-.6-1.3.2-2.5 1.7-2.5h1.6a3.7 3.7 0 003.7-3.7C20.4 6.6 16.7 3.6 12 3.6z"/><circle cx="8.2" cy="10.2" r="1.05"/><circle cx="12" cy="7.6" r="1.05"/><circle cx="15.6" cy="10.2" r="1.05"/>',
    me: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20c.6-3.8 3.5-6 7.2-6s6.6 2.2 7.2 6"/>'
  };

  function svg(k) {
    return '<svg class="mt-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + "</svg>";
  }
  function q(sel) { return document.querySelector(sel); }

  /* 当前路由 → 该点亮哪个标签 */
  function keyForHash() {
    var h = (location.hash || "#/").replace(/^#/, "");
    if (/^\/(alive|mystery|poster|restore|tea|dye|ident|heart|guide|spirit\/)/.test(h)) {
      return h.indexOf("/spirit/") === 0 ? "codex" : "poster";
    }
    if (/^\/(codex|attr)/.test(h)) return "codex";
    if (/^\/(station|museums|creative)/.test(h)) return "more";
    if (h === "/" || h === "") return "mine";
    return "";
  }

  function mark() {
    var k = keyForHash();
    var btns = document.querySelectorAll(".mtab > button");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-key") === k;
      btns[i].classList.toggle("on", on);
      btns[i].setAttribute("aria-current", on ? "page" : "false");
    }
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("on");
    mask.classList.remove("on");
    document.body.style.overflow = "";
  }

  function openSheet(key, label, srcSel) {
    var src = q(srcSel + " .nav-drop");
    if (!src) return;
    curKey = key;
    sheetTitle.textContent = label;
    sheetBody.innerHTML = src.innerHTML;
    mask.classList.add("on");
    sheet.classList.add("on");
    document.body.style.overflow = "hidden";
  }

  function build() {
    if (built || !MQ.matches) return;
    if (!q(".topnav")) return;
    built = true;
    document.body.classList.add("mnav-on");

    var TABS = [
      { key: "mine",   label: "首页",   icon: "home",    act: "link",  sel: '.topnav a[data-nav="mine"]' },
      { key: "codex",  label: "精灵",   icon: "spirit",  act: "sheet", sel: '.topnav [data-nav="codex"]' },
      { key: "more",   label: "探索",   icon: "explore", act: "sheet", sel: '.topnav [data-nav="more"]' },
      { key: "poster", label: "AI 工坊", icon: "studio",  act: "sheet", sel: '.topnav [data-nav="poster"]' },
      { key: "me",     label: "我的",   icon: "me",      act: "auth" }
    ];

    var bar = document.createElement("nav");
    bar.className = "mtab";
    bar.setAttribute("aria-label", "主导航");

    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-key", t.key);
      b.innerHTML = svg(t.icon) + "<span>" + t.label + "</span>";
      b.addEventListener("click", function () {
        if (t.act === "link") {
          var a = q(t.sel);
          if (a) a.click();
          mark();
        } else if (t.act === "sheet") {
          openSheet(t.key, t.label, t.sel);
        } else if (t.act === "auth") {
          if (typeof window.authOpen === "function") window.authOpen();
          else { var ab = q("#authBtn"); if (ab) ab.click(); }
        }
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);

    mask = document.createElement("div");
    mask.className = "msheet-mask";
    mask.addEventListener("click", closeSheet);
    document.body.appendChild(mask);

    sheet = document.createElement("div");
    sheet.className = "msheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.innerHTML =
      '<div class="msheet-t"><b></b><i></i><button type="button" aria-label="关闭">✕</button></div>' +
      '<div class="msheet-body"></div>';
    document.body.appendChild(sheet);

    sheetTitle = sheet.querySelector(".msheet-t b");
    sheetBody = sheet.querySelector(".msheet-body");
    sheet.querySelector(".msheet-t button").addEventListener("click", closeSheet);
    /* 点抽屉里的任何入口后自动收起 */
    sheetBody.addEventListener("click", function (e) {
      if (e.target.closest("a")) setTimeout(closeSheet, 60);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSheet();
    });

    window.addEventListener("hashchange", mark);
    mark();
  }

  /* ---- 滑动时给舞狮「歇一歇」----
     舞狮那几层动效（光晕呼吸 / 星星闪 / 踩桩跳）是常驻动画，
     手指滑动时它们和滚动抢 GPU，手机上就会一顿一顿。
     滑动期间给 body 加 .is-scrolling，由 mobile.css 暂停那几组动画，
     停手 160ms 后自动恢复。只挂 passive 监听，不干扰滚动本身。
     注意：必须放在 MQ 定义之后（var 提升会让这里拿到 undefined）。 */
  function pauseFxWhileScrolling() {
    if (!MQ || !MQ.matches) return;          /* 桌面不需要，一行不多跑 */
    var timer = null, CLS = "is-scrolling";
    function off() { document.body.classList.remove(CLS); timer = null; }
    function mark() {
      document.body.classList.add(CLS);
      if (timer) clearTimeout(timer);
      timer = setTimeout(off, 160);
    }
    window.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
  }

  function start() {
    pauseFxWhileScrolling();
    build();
    if (!built && MQ.matches) setTimeout(build, 400); /* 等主脚本把 DOM 铺好再试一次 */
    if (MQ.addEventListener) MQ.addEventListener("change", function (e) { if (e.matches) build(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    setTimeout(start, 0);
  }
})();
