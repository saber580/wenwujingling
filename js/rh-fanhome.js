(function () {
  "use strict";
  /* 扇形牌阵首页 · 预设驱动
     只做一件事：把 red-v2.js 算好的「一条横排」改成「一柄摊开的扇」。
     不改数据、不改选牌逻辑，牌组的 z-index / 透明度 / is-sel 全部沿用原逻辑。 */

  var body = document.body;
  if (!body || !body.classList.contains("rh-fanhome")) return;

  var fan = null;
  var cards = [];
  var open = false;      // 指针在扇面上 → 整把张开
  var hoverI = -1;       // 指针停在哪一张
  var pending = 0;

  function grab() {
    var f = document.getElementById("rhFan");
    if (!f) { fan = null; cards = []; return false; }
    if (f !== fan) {
      fan = f; open = false; hoverI = -1;
      if (ro) { try { ro.disconnect(); } catch (e) {} f.dataset.fhRo = ""; }
    }
    cards = [].slice.call(f.querySelectorAll(".rh-fancard"));
    return cards.length > 0;
  }

  function selIdx() {
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].classList.contains("is-sel")) return i;
    }
    return 0;
  }

  function layout() {
    pending = 0;
    if (!cards.length || !fan) return;
    var n = cards.length;
    var si = selIdx();
    var boxW = fan.clientWidth || 1000;
    var cw = cards[0].offsetWidth || 150;
    var ch = cards[0].offsetHeight || 200;
    /* 整把扇的视觉宽度（含牌自身的投影外框）：左右各留一块浮层的宽度 */
    var W = boxW < 700 ? boxW * 0.94 : Math.max(520, Math.min(boxW - 560, 880));

    /* 每张牌的转角：牌少就得转得多才像扇 */
    var baseStep = W >= 820 ? 11.2 : W >= 700 ? 10.4 : 9.2;
    var step = open ? baseStep * 1.12 : baseStep;

    /* 由目标宽度反解圆心深度：2*(R·sin a + 牌宽/2·cos a + 牌高/2·sin a) = W
       这样不论几张牌，扇的外框宽度都锁在 W，两侧浮层不会被顶到 */
    var a0 = (n - 1) / 2 * baseStep * Math.PI / 180;
    var sa = Math.sin(a0), ca = Math.cos(a0);
    var R = Math.max(220, (W / 2 - cw / 2 * ca - ch / 2 * sa) / sa);
    fan.style.setProperty("--fh-r", R.toFixed(0) + "px");

    cards.forEach(function (c, i) {
      var d = i - si;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;

      var abs = Math.abs(d);
      var rot = d * step;
      var lift = 0;
      var sc = 1;

      if (i === hoverI) { lift = 30; sc = 1.06; }
      else if (abs === 0) { lift = 6; sc = 1.02; }
      else if (open) { lift = 2 + (3 - Math.min(3, abs)) * 1.5; }

      c.style.setProperty("--fh-rot", rot.toFixed(2) + "deg");
      c.style.setProperty("--fh-yaw", (rot * -0.22).toFixed(2) + "deg");
      c.style.setProperty("--fh-rise", lift.toFixed(1) + "px");
      c.style.setProperty("--fh-sc", sc.toFixed(3));
    });
  }

  function queue() {
    if (pending) return;
    pending = window.requestAnimationFrame(layout);
  }

  /* ---- 指针交互 ---- */
  function bind() {
    if (!fan || fan.dataset.fhBound) return;
    fan.dataset.fhBound = "1";

    fan.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "touch") return;
      open = true; queue();
    });
    fan.addEventListener("pointerleave", function () {
      open = false; hoverI = -1; queue();
    });
    fan.addEventListener("pointerover", function (e) {
      var c = e.target && e.target.closest ? e.target.closest(".rh-fancard") : null;
      if (!c) return;
      var i = cards.indexOf(c);
      if (i < 0 || i === hoverI) return;
      hoverI = i; queue();
    });
    fan.addEventListener("pointerout", function (e) {
      var c = e.target && e.target.closest ? e.target.closest(".rh-fancard") : null;
      if (!c) return;
      if (e.relatedTarget && c.contains(e.relatedTarget)) return;
      if (cards.indexOf(c) === hoverI) { hoverI = -1; queue(); }
    });
  }

  function sync() {
    var ok = grab();
    if (!ok) return;
    bind();
    watchSize();
    queue();
  }

  /* #app 会被重新渲染（切页 / 换组），用观察器跟着重建 */
  var mo = new MutationObserver(function () { sync(); });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  /* 视口/容器变化时重排；只盯当前这把扇，换牌阵后由 sync 重新挂 */
  var ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(function () { if (fan) queue(); });
  }
  function watchSize() {
    if (!ro || !fan || fan.dataset.fhRo) return;
    fan.dataset.fhRo = "1";
    try { ro.disconnect(); ro.observe(fan); } catch (e) {}
  }
  window.addEventListener("resize", queue);
  window.addEventListener("hashchange", function () { setTimeout(sync, 30); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
