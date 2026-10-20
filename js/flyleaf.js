/* ================================================================
   扉页 · 双扇牌阵(进入正式版前的封面)
   上扇:初始七友 / 下扇:镇馆七珍 / 中央:冀印
   交互:指针微倾、悬停提牌、点选读档、收扇成叠、方向键换牌、Esc 收起
   入口:flyleafEnter() 撤掉扉页后强制先播开场画卷,画卷收场才进主页
   ================================================================ */
(function () {
  "use strict";

  var ASSET = "精灵/透明/";
  var DECK_A = [
    { name: "五铢钱", full: "五铢钱", era: "西汉", mat: "铜质", desc: "方孔圆钱,在中国流通了七百多年,是寿命最长的古钱之一。", img: "wuzhuqian.webp" },
    { name: "青花瓷", full: "青花瓷", era: "元 · 明", mat: "瓷质", desc: "白地蓝花,钴料入画,沿着海上丝路走向世界的中国名片。", img: "qinghuaci.webp" },
    { name: "玉坠", full: "玉坠", era: "新石器至今", mat: "玉质", desc: "温润的美石,佩在身上,也被古人当作品德的象征。", img: "yuzhui.webp" },
    { name: "金器", full: "金器", era: "商周至今", mat: "金质", desc: "锤揲、錾刻、鎏金,黄金千年不锈,盛唐的金光尤盛。", img: "jinqi.webp" },
    { name: "银器", full: "银器", era: "战国至今", mat: "银质", desc: "清冷的光泽,錾刻缠枝莲与卷草,唐人宴席上的雅器。", img: "yinqi.webp" },
    { name: "宣纸", full: "宣纸", era: "唐代起源", mat: "纸质", desc: "青檀皮与沙田稻草,上百道工序,润墨耐折,纸寿千年。", img: "xuanzhi.webp" },
    { name: "象棋", full: "象棋", era: "宋代定型", mat: "木质", desc: "九十个交叉点,三十二枚棋子,方寸之间演练攻守千年。", img: "xiangqi.webp" }
  ];
  var DECK_B = [
    { name: "铁狮子", full: "沧州铁狮子", era: "后周 · 953年", tag: "沧州", desc: "现存最大的古代铸铁艺术品之一,张口怒吼千年,镇守沧州。", img: "tielion.webp" },
    { name: "长信宫灯", full: "长信宫灯", era: "西汉", tag: "保定", desc: "通体鎏金的铜灯,跪坐宫女双手举灯,衣袖里藏着排烟的烟道。", img: "changxin.webp" },
    { name: "四龙四凤", full: "错金银四龙四凤铜方案座", era: "战国 · 中山", tag: "石家庄", desc: "四条龙、四只凤盘绕成的案座,通体错金银,底座由梅花鹿托起。", img: "longfengfan.webp" },
    { name: "玉猪龙", full: "红山文化玉猪龙", era: "红山文化", tag: "张家口", desc: "龙体蜷曲如环、首尾相衔,大耳圆眼,是红山文化的标志性玉礼器。", img: "yuzhulong.webp" },
    { name: "莲花尊", full: "青釉仰覆莲花尊", era: "北齐", tag: "衡水", desc: "像一朵立起来的大莲花:盖是花,腹是花,层层莲瓣开到足底。", img: "lianhuazun.webp" },
    { name: "后母戊鼎", full: "「后母戊」青铜鼎", era: "商代后期", tag: "国博", desc: "重八百多公斤,两条立耳如同巨门,是青铜时代的分量。", img: "houmuwuding.webp" },
    { name: "鸡腿瓶", full: "辽代茶叶末釉鸡腿瓶", era: "辽代", tag: "承德", desc: "契丹人马上携行的贮酒器:小口、长圆腹,釉色像茶叶末。", img: "jituiping.webp" }
  ];

  var stage = null, deck = null, fanA = null, fanB = null;
  var readout = null, roTitle = null, roDesc = null, toggle = null;
  var cards = [], closed = false, selected = null, dustDone = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function cardHTML(item, i, deckName) {
    var tag = deckName === "a" ? (item.mat || "初始七友") : (item.tag || "镇馆七珍");
    return '<article class="fl-card" data-deck="' + deckName + '" data-i="' + i + '" tabindex="0" role="button" aria-label="' + esc(item.name) + '">' +
      '<div class="fl-card-in">' +
        '<div class="fl-card-top"><span class="fl-tag">' + esc(tag) + "</span></div>" +
        '<div class="fl-art"><img src="' + ASSET + item.img + '" alt="' + esc(item.name) + '" draggable="false"><i class="fl-shine"></i></div>' +
        '<div class="fl-meta"><b class="' + (item.name.length > 5 ? "long" : "") + '">' + esc(item.name) + "</b><small>" + esc(item.era) + "</small></div>" +
      "</div></article>";
  }

  function build() {
    fanA.innerHTML = DECK_A.map(function (it, i) { return cardHTML(it, i, "a"); }).join("");
    fanB.innerHTML = DECK_B.map(function (it, i) { return cardHTML(it, i, "b"); }).join("");
    cards = Array.prototype.slice.call(document.querySelectorAll("#flyleaf .fl-card"));
    cards.forEach(function (c) {
      c.addEventListener("click", function (e) { e.stopPropagation(); select(c); });
      c.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(c); }
      });
    });
  }

  function layout() {
    if (!stage || !document.body.contains(stage)) return;
    var w = stage.clientWidth || 980;
    var cw = parseFloat(getComputedStyle(document.getElementById("flyleaf")).getPropertyValue("--fl-cw")) || 140;
    var gap = closed ? cw * 0.24 : Math.max(cw * 0.55, Math.min(cw * 0.9, w / 7.8));
    var curve = closed ? 0 : gap * 0.06;
    var rot = closed ? 1.8 : 6.2;
    [fanA, fanB].forEach(function (fan) {
      var dir = fan.dataset.dir === "b" ? -1 : 1;
      var list = fan.children, n = list.length;
      for (var i = 0; i < n; i++) {
        var t = i - (n - 1) / 2;
        var c = list[i];
        c.style.setProperty("--x", (t * gap).toFixed(2) + "px");
        c.style.setProperty("--y", (Math.pow(Math.abs(t), 1.55) * curve * dir).toFixed(2) + "px");
        c.style.setProperty("--r", (t * rot * dir).toFixed(2) + "deg");
        c.style.zIndex = String(10 + i);
      }
    });
  }

  function select(card) {
    if (selected) selected.classList.remove("sel");
    var same = selected === card;
    selected = (card && !same) ? card : null;
    if (selected) selected.classList.add("sel");
    deck.classList.toggle("has-sel", !!selected);
    readout.classList.toggle("on", !!selected);
    if (!selected) { resetReadout(); return; }
    var deckName = selected.dataset.deck, i = Number(selected.dataset.i);
    var item = deckName === "a" ? DECK_A[i] : DECK_B[i];
    var kind = deckName === "a" ? "上扇 · 初始七友" : "下扇 · 镇馆七珍";
    var nm = item.full || item.name;
    roTitle.innerHTML = esc(nm) + " <em>" + esc(item.era) + " · " + esc(kind) + "</em>";
    roDesc.textContent = item.desc;
  }

  function resetReadout() {
    readout.classList.remove("on");
    roTitle.innerHTML = "上扇 · 初始七友<em>下扇 · 镇馆七珍</em>";
    roDesc.textContent = "把十四件文物排成两把扇子:上面是随时能陪你的初始七友,下面是从十三站里挑出的七件国宝。点一张牌,读它的故事。";
  }

  function dust() {
    if (dustDone) return;
    dustDone = true;
    for (var i = 0; i < 26; i++) {
      var d = document.createElement("i");
      d.className = "fl-dust";
      var s = 1.5 + Math.random() * 3.4;
      d.style.width = s + "px";
      d.style.height = s + "px";
      d.style.left = (Math.random() * 100) + "%";
      d.style.top = (Math.random() * 100) + "%";
      d.style.animationDelay = (-Math.random() * 9).toFixed(1) + "s";
      d.style.animationDuration = (7 + Math.random() * 6).toFixed(1) + "s";
      stage.appendChild(d);
    }
  }

  function onKey(e) {
    if (!document.getElementById("flyleaf")) return;
    if (e.key === "Escape") { select(null); return; }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!cards.length) return;
    e.preventDefault();
    var idx = selected ? cards.indexOf(selected) : -1;
    var next = e.key === "ArrowRight" ? (idx + 1) % cards.length : (idx - 1 + cards.length) % cards.length;
    select(cards[next]);
  }

  function enterSite() {
    var fl = document.getElementById("flyleaf");
    if (!fl) return;
    document.removeEventListener("keydown", onKey);
    fl.classList.add("out");
    var done = function () {
      if (fl.parentNode) fl.parentNode.removeChild(fl);
      document.body.classList.remove("flyleaf-on");
      /* 扉页撤走后,开场画卷从第一帧开始演(进入正式版 = 必看开场画卷) */
      try { initIntro(); } catch (e) {
        try { document.body.classList.remove("intro-on"); } catch (e2) {}
      }
    };
    var rm = (typeof window !== "undefined" && window.matchMedia) ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    if (rm) done();
    else setTimeout(done, 560);
  }

  window.flyleafEnter = enterSite;

  function init() {
    stage = document.getElementById("flStage");
    if (!stage) return;
    deck = document.getElementById("flDeck");
    fanA = document.getElementById("flFanA");
    fanB = document.getElementById("flFanB");
    readout = document.getElementById("flReadout");
    roTitle = document.getElementById("flRoTitle");
    roDesc = document.getElementById("flRoDesc");
    toggle = document.getElementById("flToggle");

    build();
    layout();
    dust();

    stage.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" || !deck) return;
      var r = stage.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5;
      var dy = (e.clientY - r.top) / r.height - 0.5;
      deck.style.setProperty("--tx", (dy * -4).toFixed(2) + "deg");
      deck.style.setProperty("--ty", (dx * 5).toFixed(2) + "deg");
    });
    stage.addEventListener("pointerleave", function () {
      if (!deck) return;
      deck.style.setProperty("--tx", "0deg");
      deck.style.setProperty("--ty", "0deg");
    });

    stage.addEventListener("click", function (e) {
      if (e.target.closest(".fl-card") || e.target.closest(".fl-toggle")) return;
      select(null);
    });

    if (toggle) {
      toggle.addEventListener("click", function () {
        closed = !closed;
        stage.classList.toggle("closed", closed);
        toggle.textContent = closed ? "展 扇" : "收 扇";
        layout();
      });
    }

    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", layout);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
