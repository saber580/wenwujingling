/* =========================================================
   新手指引 · 分步聚光灯（第 N 步 / 共 N 步）
   用法：顶栏按钮 onclick="nbOpen()"；首次访问自动弹一次。
   每一步指定若干候选选择器，取第一个"真实可见"的元素开洞；
   找不到目标（比如手机端导航被收到下面）就退化成一张屏幕居中的说明卡。
   ========================================================= */
(function () {
  "use strict";

  var KEY = "relic_nb_v2";          /* 看过就记一笔，之后不再自动弹（v2：第 6 步换成「捕捉精灵」） */

  var STEPS = [
    {
      t: "先看这卷山河长卷",
      d: "这一屏是整站的门面：左边讲我们在做什么，右边飘着<em>精灵与文物</em>，点开能看它的档案。<br>往下滑，就是能动手玩的 AI 工坊。",
      sel: [".rh-hero"]
    },
    {
      t: "这里收着你的精灵与文物",
      d: "顶部<em>「精灵」</em>里分三块：我的精灵、文物图鉴、属性图鉴。<br>点开任意一件文物，能读它的来历与属性。",
      sel: ['[data-nav="codex"]', '.mtab [data-key="codex"]', ".rh-mine", ".rh-codex"]
    },
    {
      t: "AI 工坊 · 八个能动手的玩法",
      d: "海报、修复、茶话会、赋彩、识别、心仪卡、旅游攻略，还有一个<em>「向考古」</em>——<br>先当先民埋下一座墓，三千年后再亲手挖开。",
      sel: [".rh-tools"]
    },
    {
      t: "出去走走，实地打卡",
      d: "顶部<em>「探索」</em>里有河北地图、打卡站点和博物馆。<br>照着站点去实地，能解锁印章与纪念卡。",
      sel: ['[data-nav="more"]', '.mtab [data-key="more"]', ".rh-map", ".rh-explore-grid"]
    },
    {
      t: "卡住了就问小答",
      d: "右下角踩梅花桩的红舞狮就是<em>小答</em>：问玩法、问文物、让它带路都行。<br>想练手就说「考考我」，它出题考你。",
      sel: [".aq", "#aqBall"]
    },
    {
      t: "把野生的精灵收下来",
      d: "上面这些是已经跟着你的伙伴。想再收新的：去站点<em>📷 打卡拍照 · 唤醒文物</em>，收进图鉴后点它<em>「挑战捕捉」</em>——<br>答对题才掷得动骰子，把它打到<em>残血</em>（或直接打倒）就归你了。",
      sel: ["#home-mine .rh-mine-body", ".rh-mine-body", ".rh-mine .rh-seals"]
    }
  ];

  var W = null, card = null, hole = null, mask = null;
  var idx = 0, open = false, lastFocus = null;

  function el(tag, cls) { var d = document.createElement(tag); if (cls) d.className = cls; return d; }
  function seen() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(KEY, "1"); } catch (e) {} }

  /* 元素是否真的露在页面上（排除 display:none / 零尺寸 / 祖先隐藏） */
  function visible(node) {
    if (!node) return false;
    var r = node.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var cs = getComputedStyle(node);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return false;
    return true;
  }
  function pick(step) {
    for (var i = 0; i < step.sel.length; i++) {
      var list = document.querySelectorAll(step.sel[i]);
      for (var j = 0; j < list.length; j++) {
        var n = list[j];
        if (n.closest(".nb-wrap")) continue;
        if (visible(n)) return n;
      }
    }
    return null;
  }

  function build() {
    if (W) return;
    W = el("div", "nb-wrap");
    W.setAttribute("role", "dialog");
    W.setAttribute("aria-modal", "true");
    W.setAttribute("aria-label", "新手指引");

    mask = el("div", "nb-mask");
    hole = el("div", "nb-hole hide");

    card = el("div", "nb-card");
    card.innerHTML =
      '<div class="nb-step"><span>第</span><b data-nb="no">1</b><span>步</span><i data-nb="all">/ 共 6 步</i></div>' +
      '<h3 class="nb-title" data-nb="t"></h3>' +
      '<p class="nb-desc" data-nb="d"></p>' +
      '<div class="nb-dots" data-nb="dots"></div>' +
      '<div class="nb-foot">' +
        '<button type="button" class="nb-skip" data-nb="skip">跳过指引</button>' +
        '<button type="button" class="nb-prev" data-nb="prev">上一步</button>' +
        '<button type="button" class="nb-next" data-nb="next">下一步</button>' +
      "</div>";

    W.appendChild(mask);
    W.appendChild(hole);
    W.appendChild(card);
    document.body.appendChild(W);

    var dots = card.querySelector('[data-nb="dots"]');
    for (var i = 0; i < STEPS.length; i++) dots.appendChild(el("i"));

    card.querySelector('[data-nb="skip"]').onclick = function () { close(true); };
    card.querySelector('[data-nb="prev"]').onclick = function () { go(idx - 1); };
    card.querySelector('[data-nb="next"]').onclick = function () {
      if (idx >= STEPS.length - 1) { close(true); return; }
      go(idx + 1);
    };

    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { close(true); }
      else if (e.key === "ArrowRight") { if (idx < STEPS.length - 1) go(idx + 1); else close(true); }
      else if (e.key === "ArrowLeft") { if (idx > 0) go(idx - 1); }
    });

    var raf = 0;
    function onMove() {
      if (!open || raf) return;
      raf = requestAnimationFrame(function () { raf = 0; place(); });
    }
    addEventListener("scroll", onMove, { passive: true });
    addEventListener("resize", onMove);
  }

  /* 把目标滚进视野中部（只在它确实出屏时滚，避免平白晃一下） */
  function ensureVisible(node) {
    if (!node) return false;
    var r = node.getBoundingClientRect();
    var out = r.top < 70 || r.bottom > innerHeight - 40;
    if (!out) return false;
    try { node.scrollIntoView({ block: "center", behavior: "auto" }); } catch (e) { node.scrollIntoView(); }
    return true;
  }

  function place() {
    var step = STEPS[idx];
    var node = pick(step);
    var vh = innerHeight, vw = innerWidth;
    var narrow = vw <= 860;

    if (!node) {
      /* 找不到目标：整屏压暗，卡片居中 */
      hole.classList.add("hide");
      card.classList.remove("top");
      if (narrow) {
        card.style.left = ""; card.style.top = ""; card.style.bottom = "";
      } else {
        card.style.left = Math.round((vw - card.offsetWidth) / 2) + "px";
        card.style.top = Math.round((vh - card.offsetHeight) / 2) + "px";
      }
      return;
    }

    var r = node.getBoundingClientRect();
    var pad = narrow ? 6 : 8;
    /* 顶栏不参与高亮：洞的上沿压到顶栏下面，免得整条红栏亮着反而看不出框在哪 */
    var bar = document.querySelector(".topbar");
    var barB = bar ? Math.round(bar.getBoundingClientRect().bottom) : 0;
    var hx = Math.max(4, r.left - pad);
    var hy = Math.max(4, r.top - pad);
    if (barB > 4 && hy < barB && !(bar && bar.contains(node))) hy = barB + 2;
    var hw = Math.min(vw - hx - 4, r.width + pad * 2);
    var hh = Math.min(vh - hy - 4, (r.top + r.height + pad) - hy);
    if (hh < 26) hh = Math.min(vh - hy - 4, r.height + pad * 2);

    /* 太高的区块（整屏主视觉）只圈上半截，避免洞比屏幕还大 */
    if (hh > vh * 0.52) hh = Math.round(vh * 0.52);
    if (hw > vw - 16) hw = vw - 16, hx = 8;

    hole.classList.remove("hide");
    hole.style.left = Math.round(hx) + "px";
    hole.style.top = Math.round(hy) + "px";
    hole.style.width = Math.round(hw) + "px";
    hole.style.height = Math.round(hh) + "px";

    if (narrow) {
      /* 手机上：卡片贴底；下方不够高就把卡片翻到顶部（跟聚光洞让位） */
      card.style.left = ""; card.style.top = ""; card.style.bottom = "";
      var ch2 = card.offsetHeight || 220;
      var freeBelow = vh - (hy + hh) - 16;
      var freeAbove = hy - 16;
      card.classList.toggle("top", freeBelow < ch2 + 8 && freeAbove > freeBelow);
      return;
    }

    /* 桌面上：优先放目标下方，放不下就上方，再夹在视口内 */
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var below = vh - (hy + hh) - 14;
    var above = hy - 14;
    var top = (below >= ch || below >= above) ? (hy + hh + 14) : (hy - ch - 14);
    top = Math.min(Math.max(12, top), vh - ch - 12);
    var left = Math.min(Math.max(12, hx + hw / 2 - cw / 2), vw - cw - 12);
    card.style.left = Math.round(left) + "px";
    card.style.top = Math.round(top) + "px";
  }

  function render() {
    var step = STEPS[idx];
    card.querySelector('[data-nb="no"]').textContent = String(idx + 1);
    card.querySelector('[data-nb="all"]').textContent = "/ 共 " + STEPS.length + " 步";
    card.querySelector('[data-nb="t"]').textContent = step.t;
    card.querySelector('[data-nb="d"]').innerHTML = step.d;
    var dots = card.querySelectorAll('[data-nb="dots"] i');
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === idx);
    var prev = card.querySelector('[data-nb="prev"]');
    var next = card.querySelector('[data-nb="next"]');
    prev.disabled = idx === 0;
    next.textContent = (idx === STEPS.length - 1) ? "开始探索" : "下一步";
    card.querySelector('[data-nb="skip"]').style.display = (idx === STEPS.length - 1) ? "none" : "";
  }

  function go(i) {
    idx = Math.min(Math.max(0, i), STEPS.length - 1);
    render();
    var node = pick(STEPS[idx]);
    if (node) {
      ensureVisible(node);
      /* 滚动后稍等一帧再定位，避免洞和卡片对不上 */
      setTimeout(place, 30);
      setTimeout(place, 180);
    } else {
      place();
    }
  }

  function nbOpen(fromAuto) {
    build();
    if (open) return;
    lastFocus = document.activeElement;
    open = true;
    idx = 0;
    render();
    W.classList.add("on");
    document.documentElement.classList.add("nb-on");
    go(0);
    setTimeout(function () { try { card.querySelector('[data-nb="next"]').focus({ preventScroll: true }); } catch (e) {} }, 120);
  }

  function close(mark) {
    if (!open) return;
    open = false;
    W.classList.remove("on");
    document.documentElement.classList.remove("nb-on");
    if (mark) {
      markSeen();
      var btn = document.getElementById("nbBtn");
      if (btn) btn.classList.remove("new");
    }
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  /* 首次进入：等开场画卷/扉页演完再弹，别和长卷抢注意力 */
  function maybeAuto() {
    if (seen()) return;
    var intro = document.querySelector(".sc-intro");
    if (intro && !intro.classList.contains("fade")) { setTimeout(maybeAuto, 1200); return; }
    if (document.body.classList.contains("flyleaf-on")) { setTimeout(maybeAuto, 1200); return; }
    if (!document.querySelector("#app .rh-hero, .rh-hero")) { setTimeout(maybeAuto, 600); return; }
    nbOpen(true);
  }

  addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("nbBtn");
    if (btn) btn.classList.toggle("new", !seen());
    setTimeout(maybeAuto, 1600);
  });

  window.nbOpen = function () { nbOpen(false); };
  window.nbClose = close;
})();
