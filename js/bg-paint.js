(function () {
  "use strict";
  /* 动态山河背景层注入：只在 body.bg-paint 下生效（样式见 css/bg-paint.css） */
  function build() {
    if (!document.body || !document.body.classList.contains("bg-paint")) return;
    var art = document.querySelector(".bg-art");
    if (!art || art.querySelector(".bgp")) return;

    var wrap = document.createElement("div");
    wrap.className = "bgp";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="bgp-base"></div>' +
      '<div class="bgp-sky"></div>' +
      '<div class="bgp-mist m1"></div>' +
      '<div class="bgp-mist m2"></div>' +
      '<div class="bgp-glow"></div>';

    var anchor = art.querySelector(".bg-art-img") || art.firstChild;
    if (anchor && anchor.parentNode === art) art.insertBefore(wrap, anchor.nextSibling);
    else art.insertBefore(wrap, art.firstChild);

    /* 流沙层单独摆在 .bg-art 的最后：它在压暗层（.bg-art-veil）之上，
       才不会被暗角吃掉；它下面还有内容层，pointer-events 已关掉 */
    var sand = document.createElement("div");
    sand.className = "bgp-sand";
    sand.setAttribute("aria-hidden", "true");
    sand.innerHTML = '<i class="s1"></i><i class="s2"></i><i class="s3"></i>';
    var dust = document.createElement("div");
    dust.className = "bgp-dust";
    dust.setAttribute("aria-hidden", "true");
    art.appendChild(sand);
    art.appendChild(dust);

    /* 落花：随机大小 / 速度 / 起点，负延迟让一进页面就已经在飘 */
    var i, n = 7, p, s;
    for (i = 0; i < n; i++) {
      p = document.createElement("i");
      p.className = "bgp-petal";
      s = 6 + Math.random() * 7;
      p.style.width = s.toFixed(1) + "px";
      p.style.height = (s * 0.72).toFixed(1) + "px";
      p.style.left = (Math.random() * 108 - 4).toFixed(1) + "%";
      p.style.setProperty("--o", (0.24 + Math.random() * 0.32).toFixed(2));
      p.style.animationDuration = (38 + Math.random() * 34).toFixed(1) + "s";
      p.style.animationDelay = (-Math.random() * 46).toFixed(1) + "s";
      wrap.appendChild(p);
    }

    /* 沙粒：细小的金色尘点，斜着往上飘，跟着沙带一起走 */
    if (dust) {
      var dn = window.matchMedia("(max-width:860px)").matches ? 12 : 22;
      for (i = 0; i < dn; i++) {
        var d = document.createElement("i");
        s = 2.2 + Math.random() * 3.4;
        d.style.width = s.toFixed(1) + "px";
        d.style.height = s.toFixed(1) + "px";
        d.style.left = (Math.random() * 104 - 2).toFixed(1) + "%";
        d.style.setProperty("--o", (0.45 + Math.random() * 0.4).toFixed(2));
        d.style.setProperty("--dx", (Math.random() * 10 - 3).toFixed(1) + "vw");
        d.style.animationDuration = (26 + Math.random() * 26).toFixed(1) + "s";
        d.style.animationDelay = (-Math.random() * 44).toFixed(1) + "s";
        dust.appendChild(d);
      }
    }
  }
  /* 扉页（#flyleaf）的金线山河：会呼吸的一幅画 */
  function buildFlyleaf() {
    if (!document.body || !document.body.classList.contains("bg-paint")) return;
    var leaf = document.getElementById("flyleaf");
    if (!leaf || leaf.querySelector(".flbg")) return;

    var wrap = document.createElement("div");
    wrap.className = "flbg";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="flbg-base"></div>' +
      '<div class="flbg-mist"></div>' +
      '<div class="flbg-fog f1"></div>' +
      '<div class="flbg-fog f2"></div>' +
      '<div class="flbg-glow"></div>' +
      '<div class="flbg-sweep"></div>' +
      '<div class="flbg-veil"></div>';
    leaf.insertBefore(wrap, leaf.firstChild);

    var i, n = 12, m, s;
    for (i = 0; i < n; i++) {
      m = document.createElement("i");
      m.className = "flbg-mote";
      s = 2 + Math.random() * 3.4;
      m.style.width = s.toFixed(1) + "px";
      m.style.height = s.toFixed(1) + "px";
      m.style.left = (Math.random() * 104 - 2).toFixed(1) + "%";
      m.style.setProperty("--o", (0.28 + Math.random() * 0.5).toFixed(2));
      m.style.setProperty("--dx", (Math.random() * 8 - 4).toFixed(1) + "vw");
      m.style.animationDuration = (26 + Math.random() * 30).toFixed(1) + "s";
      m.style.animationDelay = (-Math.random() * 52).toFixed(1) + "s";
      wrap.appendChild(m);
    }
  }

  function boot() { build(); buildFlyleaf(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
