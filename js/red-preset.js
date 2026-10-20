/* =========================================================
   文物精灵 · 红版主页预设
   只替换首页视图;扉页 / 开场画卷 / 登录 / AI 小答 / 存档全部沿用原版
   入口:red-preset.html
   ========================================================= */
(function () {
  "use strict";

  const DECKS = {
    a: {
      label: "初始七友",
      start: 1,
      ids: ["wuzhuqian", "qinghuaci", "yuzhui", "jinqi", "yinqi", "xuanzhi", "xiangqi"]
    },
    b: {
      label: "镇馆七珍",
      start: 1,
      ids: ["tielion", "changxin", "longfengfan", "yuzhulong", "lianhuazun", "houmuwuding", "jituiping"]
    }
  };

  const SHORT_NAME = {
    wuzhuqian: "五铢钱",
    qinghuaci: "青花瓷",
    yuzhui: "玉坠",
    jinqi: "金器",
    yinqi: "银器",
    xuanzhi: "宣纸",
    xiangqi: "象棋",
    tielion: "铁狮子",
    changxin: "长信宫灯",
    longfengfan: "四龙四凤",
    yuzhulong: "玉猪龙",
    lianhuazun: "莲花尊",
    houmuwuding: "后母戊鼎",
    jituiping: "鸡腿瓶"
  };

  const SHORT_ERA = {
    wuzhuqian: "西汉",
    qinghuaci: "元 · 明",
    yuzhui: "新石器至今",
    jinqi: "商周至今",
    yinqi: "战国至今",
    xuanzhi: "唐代",
    xiangqi: "宋代",
    tielion: "后周 · 953",
    changxin: "西汉",
    longfengfan: "战国 · 中山",
    yuzhulong: "红山文化",
    lianhuazun: "北齐",
    houmuwuding: "商代后期",
    jituiping: "辽代"
  };

  const AI_TOOLS = [
    { no: "01", em: "📸", title: "AI 打卡海报", desc: "把精灵与博物馆,变成一张可以分享的海报。", href: "#/poster" },
    { no: "02", em: "🧩", title: "AI 文物修复", desc: "去划痕、补缺口、恢复原色,再认一遍。", href: "#/restore" },
    { no: "03", em: "🍵", title: "AI 精灵茶话会", desc: "挑 3~6 只精灵,跨时空聊一场。", href: "#/tea" },
    { no: "04", em: "🎨", title: "AI 赋彩", desc: "把 36 幅黑白文物稿,亲手还上颜色。", href: "#/dye" },
    { no: "05", em: "🔍", title: "AI 文物识别", desc: "拍一张照片,报出名字、年代与来历。", href: "#/ident" }
  ];

  let deck = "a";
  let idx = DECKS.a.start;
  let cards = [];
  let ro = null;
  let mo = null;
  let dragStart = null;
  let dragMoved = false;
  let dragCaptured = false;
  let lastDrag = 0;
  let layoutTries = 0;
  let layoutTimer = null;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function retryLayout() {
    if (layoutTimer || layoutTries >= 40) return;
    layoutTries++;
    layoutTimer = setTimeout(function () {
      layoutTimer = null;
      layoutCards();
    }, 180);
  }

  function isGot(id) {
    try {
      return typeof isCaptured === "function" ? !!isCaptured(id) : false;
    } catch (e) {
      return false;
    }
  }

  function stationOf(id) {
    if (typeof STATIONS === "undefined") return null;
    return STATIONS.find(function (st) { return (st.spiritIds || []).indexOf(id) >= 0; }) || null;
  }

  function stationShort(st) {
    if (!st) return "";
    return String(st.name || "").split("·").pop().trim();
  }

  function allSpirits() {
    return typeof SPIRITS === "undefined" ? [] : Object.values(SPIRITS).filter(function (s) { return !s.custom; });
  }

  function deckSpirits() {
    return DECKS[deck].ids.map(function (id) { return SPIRITS[id]; }).filter(Boolean);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function mineList() {
    const all = allSpirits();
    const starters = all.filter(function (s) { return s.starter; });
    const others = all.filter(function (s) { return !s.starter && isGot(s.id); });
    return starters.concat(others);
  }

  function doneStationCount() {
    return STATIONS.filter(function (st) {
      return (st.spiritIds || []).length > 0 && st.spiritIds.every(isGot);
    }).length;
  }

  function avatarSrc(s) {
    try {
      if (typeof customById === "function") {
        const c = customById(s.id);
        if (c && c.img) return c.img;
      }
      return "精灵/透明/" + s.id + ".webp";
    } catch (e) {
      return "精灵/透明/" + s.id + ".webp";
    }
  }

  /* ---------------- 首页 HTML ---------------- */
  function homeHTML() {
    const all = allSpirits();
    const mine = mineList();
    const done = doneStationCount();
    const pct = all.length ? Math.min(100, Math.round(mine.length / all.length * 100)) : 0;
    const avatars = mine.slice(0, 7).map(function (s) {
      return '<a class="rh-ava" href="#/spirit/' + esc(s.id) + '" title="' + esc(s.name) + '">' +
        '<img src="' + esc(avatarSrc(s)) + '" alt="' + esc(s.name) + '" loading="lazy"></a>';
    }).join("");
    const more = mine.length > 7 ? '<a class="rh-ava-more" href="#/codex" title="还有 ' + (mine.length - 7) + ' 只">+' + (mine.length - 7) + '</a>' : "";

    const marks = (typeof MAP_MARKS !== "undefined" && MAP_MARKS.stations ? MAP_MARKS.stations : []).map(function (m) {
      const st = STATIONS.find(function (x) { return x.id === m.id; });
      if (!st) return "";
      const got = (st.spiritIds || []).filter(isGot).length;
      const total = (st.spiritIds || []).length;
      const ok = total > 0 && got >= total;
      return '<a class="rh-mark' + (ok ? " done" : "") + '" style="left:' + m.x + '%;top:' + m.y + '%" href="#/station/' + esc(st.id) + '" title="' + esc(st.name) + '">' +
        "<i></i><span>" + esc(stationShort(st)) + "</span></a>";
    }).join("");

    const stationRows = STATIONS.map(function (st, i) {
      const got = (st.spiritIds || []).filter(isGot).length;
      const total = (st.spiritIds || []).length;
      const ava = (typeof CITY_AVATARS !== "undefined" && CITY_AVATARS[st.id]) ? CITY_AVATARS[st.id] : "";
      const avaHTML = ava
        ? '<span class="rh-st-ava"><img src="' + esc(ava) + '" alt="" loading="lazy"></span>'
        : '<span class="rh-st-ava rh-st-ava-no">' + pad2(i + 1) + "</span>";
      return '<a class="rh-station" href="#/station/' + esc(st.id) + '">' +
        avaHTML +
        '<span class="rh-st-no">' + pad2(i + 1) + "</span>" +
        '<span class="rh-st-main"><b>' + esc(stationShort(st)) + "</b><small>" + esc(st.subtitle || st.place || "") + "</small></span>" +
        '<span class="rh-st-prog">' + got + "/" + total + "</span></a>";
    }).join("");

    const tools = AI_TOOLS.map(function (t) {
      const href = t.href;
      return '<a class="rh-tool" href="' + esc(href) + '">' +
        '<span class="rh-tool-no">' + t.no + "</span>" +
        '<span class="rh-tool-em">' + t.em + "</span>" +
        "<b>" + esc(t.title) + "</b>" +
        "<small>" + esc(t.desc) + "</small>" +
        '<span class="rh-tool-go">进入 →</span></a>';
    }).join("");

    const primaryAttrs = Object.keys(ATTRIBUTES.primary).map(function (k) {
      const a = ATTRIBUTES.primary[k];
      return '<span class="rh-attr-chip" title="' + esc(a.desc) + '"><img src="' + esc(attrIcon("primary", k)) + '" alt=""><b>' + esc(a.name) + "</b></span>";
    }).join("");
    const secondaryAttrs = Object.keys(ATTRIBUTES.secondary).map(function (k) {
      const a = ATTRIBUTES.secondary[k];
      return '<span class="rh-attr-chip" title="' + esc(a.desc) + '"><img src="' + esc(attrIcon("secondary", k)) + '" alt=""><b>' + esc(a.name) + "</b></span>";
    }).join("");

    return `
    <section class="rh-hero" id="rhHero">
      <i class="rh-sun" aria-hidden="true"></i>
      <i class="rh-seal" aria-hidden="true">冀</i>
      <div class="rh-hero-in">
        <div class="rh-eyebrow">燕 赵 拾 遗 · HEBEI RELIC SOUL</div>
        <h1 class="rh-title">文物精灵<span class="rh-title-seal" aria-hidden="true">冀</span></h1>
        <div class="rh-en">A HERITAGE OF CHINA</div>
        <p class="rh-sub">${all.length} 只文物精灵,${STATIONS.length} 站燕赵风华。<br class="rh-br">拖拽牌阵,听它们讲自己的故事。</p>

        <div class="rh-tabs" role="tablist" aria-label="牌阵分组">
          <button type="button" class="active" data-rh-deck="a" role="tab" aria-selected="true">初始七友 <i>07</i></button>
          <button type="button" data-rh-deck="b" role="tab" aria-selected="false">镇馆七珍 <i>07</i></button>
        </div>

        <div class="rh-feature" id="rhFeature">
          <div class="rh-feature-k"><span id="rhCount">02 / 07</span><i></i>当前牌面</div>
          <h2 id="rhName">青花瓷</h2>
          <div class="rh-full" id="rhFull"></div>
          <div class="rh-tags" id="rhTags"></div>
          <p class="rh-desc" id="rhDesc"></p>
          <div class="rh-actions">
            <a class="rh-btn rh-btn-main" id="rhGo" href="#/spirit/qinghuaci">查看档案 <span>→</span></a>
            <a class="rh-btn rh-btn-ghost" id="rhStation" href="#/codex">翻图鉴</a>
          </div>
        </div>

        <div class="rh-stage" id="rhStage" aria-label="文物精灵牌阵,可左右拖拽">
          <i class="rh-halo" aria-hidden="true"></i>
          <div class="rh-ring" id="rhRing"></div>
          <button type="button" class="rh-arrow rh-prev" id="rhPrev" aria-label="上一张">←</button>
          <button type="button" class="rh-arrow rh-next" id="rhNext" aria-label="下一张">→</button>
        </div>
        <div class="rh-hint"><span>拖拽牌阵</span><i></i><span>点选读档</span><i></i><span>← → 换牌</span><i></i><span>Enter 进入</span></div>
      </div>
    </section>

    <div class="rh-body">
      <section class="rh-sec rh-mine" id="home-mine">
        <div class="rh-sec-head">
          <div>
            <span class="rh-kicker">01 · MY SPIRITS</span>
            <h2>我的精灵</h2>
            <p>起始七友已经在你身边。去博物馆拍下文物,答对它出的题,就能唤醒更多伙伴。</p>
          </div>
          <a class="rh-sec-link" href="#/codex">全部图鉴 →</a>
        </div>
        <div class="rh-mine-grid">
          <div class="rh-avas">${avatars}${more}</div>
          <div class="rh-stat">
            <div class="rh-stat-num"><b>${mine.length}</b><span>/ ${all.length} 已唤醒</span></div>
            <div class="rh-bar"><i style="width:${pct}%"></i></div>
            <p>已点亮 <b>${done}</b> / ${STATIONS.length} 站 · 还有 ${Math.max(0, all.length - mine.length)} 只精灵等你唤醒</p>
            <button type="button" class="rh-text-link" onclick="openPhoto()">📷 去打卡唤醒 →</button>
          </div>
        </div>
      </section>

      <section class="rh-sec rh-explore">
        <div class="rh-sec-head">
          <div>
            <span class="rh-kicker">02 · EXPLORE</span>
            <h2>一张地图,走完十三站</h2>
            <p>从沧州的铁狮子,到满城汉墓的长信宫灯;从张家口的红山玉龙,到国博的后母戊鼎。每点亮一站,就多一段燕赵故事。</p>
          </div>
        </div>
        <div class="rh-explore-grid">
          <div class="rh-map-card" id="home-map">
            <div class="rh-card-head"><b>河北地图</b><span>已点亮 ${done} / ${STATIONS.length} 站</span></div>
            <div class="rh-map">
              <img src="装饰/河北地图.webp" alt="河北地图">
              <div class="rh-marks">${marks}</div>
            </div>
            <div class="rh-map-foot">点一枚站点标记,直达那一站 →</div>
          </div>
          <div class="rh-stations" id="home-stations">
            <div class="rh-card-head"><b>打卡站点</b><span>${STATIONS.length} 站 · 按年代走</span></div>
            <div class="rh-station-list">${stationRows}</div>
          </div>
        </div>
      </section>

      <section class="rh-ai">
        <div class="rh-ai-in">
          <div class="rh-sec-head rh-sec-head-light">
            <div>
              <span class="rh-kicker">03 · AI WORKSHOP</span>
              <h2>让文物,陪你玩起来</h2>
              <p>拍海报、修文物、办茶话会、给黑白稿上色、识别一件器物。五件 AI 工具,都能从一只精灵开始。</p>
            </div>
            <a class="rh-ai-cfg" href="#/" onclick="return aiCfgOpen()">☁️ 云端 AI →</a>
          </div>
          <div class="rh-tools">${tools}</div>
        </div>
      </section>

      <section class="rh-sec rh-attr" id="home-attr">
        <div class="rh-sec-head">
          <div>
            <span class="rh-kicker">04 · ATTRIBUTES</span>
            <h2>二十种属性,认出每一只精灵</h2>
            <p>主属性看材质,副属性看用途。青铜、金银、陶瓷、玉器、书画……每只精灵都有自己的来处。</p>
          </div>
        </div>
        <div class="rh-attr-grid">
          <div class="rh-attr-col"><b>主属性 · 材质</b><div class="rh-attr-list">${primaryAttrs}</div></div>
          <div class="rh-attr-col"><b>副属性 · 用途</b><div class="rh-attr-list">${secondaryAttrs}</div></div>
        </div>
      </section>

      <section class="rh-final">
        <div class="rh-final-in">
          <span class="rh-kicker">START YOUR JOURNEY</span>
          <h2>下一次去博物馆,<br>拍一张照片,唤醒它。</h2>
          <div class="rh-final-actions">
            <button type="button" class="rh-btn rh-btn-main" onclick="openPhoto()">📷 打卡拍照 · 唤醒文物</button>
            <a class="rh-btn rh-btn-ghost" href="#/codex">📖 翻一翻文物图鉴</a>
          </div>
        </div>
      </section>
    </div>`;
  }

  /* ---------------- 牌阵 ---------------- */
  function buildCards() {
    const ring = $("#rhRing");
    if (!ring) return;
    const list = deckSpirits();
    ring.innerHTML = list.map(function (s, i) {
      const short = SHORT_NAME[s.id] || s.name;
      const long = short.length > 6 ? " long" : "";
      return '<button type="button" class="rh-card" data-i="' + i + '" aria-label="' + esc(s.name) + '">' +
        '<span class="rh-card-top"><span>' + esc(DECKS[deck].label) + "</span><i>" + pad2(i + 1) + "</i></span>" +
        '<span class="rh-card-art"><img src="精灵/透明/' + esc(s.id) + '.webp" alt="' + esc(s.name) + '" draggable="false"></span>' +
        '<span class="rh-card-name' + long + '">' + esc(short) + "</span>" +
        '<span class="rh-card-era">' + esc(SHORT_ERA[s.id] || s.era || "") + "</span></button>";
    }).join("");
    cards = $$(".rh-card", ring);
    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        if (Date.now() - lastDrag < 300) return;
        const i = Number(card.getAttribute("data-i"));
        if (!Number.isNaN(i)) selectCard(i);
      });
    });
  }

  function layoutCards() {
    const stage = $("#rhStage");
    if (!stage || !cards.length) return;
    const width = stage.clientWidth;
    if (!width) { retryLayout(); return; }
    layoutTries = 0;
    const compact = width < 720;
    const step = compact
      ? Math.max(120, Math.min(158, width * 0.42))
      : Math.max(196, Math.min(272, width * 0.245));
    const n = cards.length;

    cards.forEach(function (card, i) {
      let d = i - idx;
      const half = n / 2;
      if (d > half) d -= n;
      if (d < -half) d += n;
      const abs = Math.abs(d);
      const x = d * step;
      const y = abs * (compact ? 13 : 30);
      const scale = abs === 0 ? 1 : Math.max(compact ? 0.72 : 0.6, 1 - abs * 0.15);
      const rotate = -d * (compact ? 10 : 18);
      const z = 120 - abs * 22;
      const visible = abs <= (compact ? 1 : 2);
      card.style.transform = "translate(-50%,-50%) translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px," + z + "px) rotateY(" + rotate + "deg) scale(" + scale.toFixed(3) + ")";
      card.style.zIndex = String(60 - abs);
      card.style.opacity = abs === 0 ? "1" : (abs === 1 ? (compact ? "0.72" : "0.9") : (abs === 2 ? "0.36" : "0"));
      card.style.pointerEvents = visible ? "auto" : "none";
      card.style.filter = abs === 0 ? "none" : "saturate(.88) brightness(.96)";
      card.classList.toggle("is-sel", abs === 0);
      card.setAttribute("aria-hidden", visible ? "false" : "true");
      card.tabIndex = visible ? 0 : -1;
    });
  }

  function paintFeature() {
    const list = deckSpirits();
    const s = list[idx] || list[0];
    if (!s) return;
    const st = stationOf(s.id);
    const short = SHORT_NAME[s.id] || s.name;
    const full = s.name && s.name !== short ? s.name : "";
    const tags = [
      ATTRIBUTES.primary[s.primary] && ATTRIBUTES.primary[s.primary].name,
      ATTRIBUTES.secondary[s.secondary] && ATTRIBUTES.secondary[s.secondary].name,
      deck === "b" ? (stationShort(st) || "镇馆七珍") : "初始七友"
    ].filter(Boolean);

    const nameEl = $("#rhName");
    const fullEl = $("#rhFull");
    const countEl = $("#rhCount");
    const tagsEl = $("#rhTags");
    const descEl = $("#rhDesc");
    const goEl = $("#rhGo");
    const stEl = $("#rhStation");
    if (nameEl) nameEl.textContent = short;
    if (fullEl) fullEl.textContent = full;
    if (countEl) countEl.textContent = pad2(idx + 1) + " / 07";
    if (tagsEl) tagsEl.innerHTML = tags.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    if (descEl) descEl.textContent = s.intro || s.history || "";
    if (goEl) goEl.setAttribute("href", "#/spirit/" + s.id);
    if (stEl) {
      if (st) {
        stEl.setAttribute("href", "#/station/" + st.id);
        stEl.textContent = "去这一站";
      } else {
        stEl.setAttribute("href", "#/codex");
        stEl.textContent = "翻图鉴";
      }
    }
  }

  function paintTabs() {
    $$(".rh-tabs button").forEach(function (b) {
      const on = b.getAttribute("data-rh-deck") === deck;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function selectCard(i) {
    const n = cards.length;
    if (!n) return;
    idx = ((i % n) + n) % n;
    layoutCards();
    paintFeature();
  }

  function stepCard(dir) {
    selectCard(idx + dir);
  }

  function switchDeck(next) {
    if (!DECKS[next] || next === deck) return;
    deck = next;
    idx = DECKS[next].start;
    buildCards();
    paintTabs();
    paintFeature();
    layoutCards();
  }

  function bindCarousel() {
    const stage = $("#rhStage");
    if (!stage) return;

    $$(".rh-tabs button").forEach(function (b) {
      b.addEventListener("click", function () { switchDeck(b.getAttribute("data-rh-deck")); });
    });
    const prev = $("#rhPrev");
    const next = $("#rhNext");
    if (prev) prev.addEventListener("click", function (e) { e.stopPropagation(); stepCard(-1); });
    if (next) next.addEventListener("click", function (e) { e.stopPropagation(); stepCard(1); });

    stage.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest(".rh-arrow")) return;
      dragStart = e.clientX;
      dragMoved = false;
      dragCaptured = false;
      stage.classList.add("dragging");
    });
    stage.addEventListener("pointermove", function (e) {
      if (dragStart == null) return;
      if (Math.abs(e.clientX - dragStart) > 10) {
        dragMoved = true;
        if (!dragCaptured) {
          dragCaptured = true;
          try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        }
        if (e.cancelable) e.preventDefault();
      }
    });
    stage.addEventListener("pointerup", function (e) {
      if (dragStart == null) return;
      const dx = e.clientX - dragStart;
      dragStart = null;
      stage.classList.remove("dragging");
      if (dragCaptured) {
        try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
        dragCaptured = false;
      }
      if (dragMoved && Math.abs(dx) > 46) {
        lastDrag = Date.now();
        stepCard(dx < 0 ? 1 : -1);
      }
    });
    stage.addEventListener("pointercancel", function () {
      dragStart = null;
      dragMoved = false;
      dragCaptured = false;
      stage.classList.remove("dragging");
    });

    if (ro) ro.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () { layoutCards(); });
      ro.observe(stage);
    }
    if (mo) mo.disconnect();
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(function () {
        if (!document.body.classList.contains("flyleaf-on") && !document.body.classList.contains("intro-on")) {
          layoutCards();
          setTimeout(layoutCards, 220);
        }
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
  }

  function initCarousel() {
    buildCards();
    paintTabs();
    paintFeature();
    bindCarousel();
    layoutCards();
    setTimeout(layoutCards, 60);
    setTimeout(layoutCards, 420);
    setTimeout(layoutCards, 1000);
    setTimeout(layoutCards, 2200);
    setTimeout(layoutCards, 3400);
  }

  /* ---------------- 顶栏高亮 ---------------- */
  function paintNav() {
    const items = $$(".rh-topbar .nav-item");
    if (!items.length) return;
    const page = location.hash.replace(/^#\/?/, "").split("/")[0];
    const ai = ["poster", "restore", "tea", "dye", "ident"];
    let key = "";
    if (!page) key = "mine";
    else if (page === "codex") key = "codex";
    else if (ai.indexOf(page) >= 0) key = "poster";
    else if (page === "museums" || page === "creative") key = "more";
    items.forEach(function (a) {
      if (!a.dataset.nav) return;
      a.classList.toggle("active", a.dataset.nav === key);
    });
  }

  /* ---------------- 替换首页 ---------------- */
  function renderHome() {
    if (document.body.dataset.page !== "home") return;
    const app = document.getElementById("app");
    if (!app) return;
    if (!app.querySelector(".rh-hero")) {
      app.innerHTML = homeHTML();
      initCarousel();
    } else {
      layoutCards();
    }
    paintNav();
  }

  window.addEventListener("hashchange", renderHome);

  const originalRender = window.render;
  if (typeof originalRender === "function") {
    window.render = function () {
      const result = originalRender.apply(this, arguments);
      renderHome();
      return result;
    };
  }

  document.addEventListener("keydown", function (e) {
    const stage = $("#rhStage");
    if (!stage) return;
    if (document.body.dataset.page !== "home") return;
    if (document.body.classList.contains("flyleaf-on") || document.body.classList.contains("intro-on")) return;
    const tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepCard(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepCard(1);
    } else if (e.key === "Enter") {
      const active = document.activeElement && document.activeElement.tagName;
      if (active === "BUTTON" || active === "A" || active === "INPUT" || active === "TEXTAREA") return;
      const go = $("#rhGo");
      if (go) location.hash = go.getAttribute("href");
    }
  });

  window.addEventListener("resize", function () {
    if ($("#rhStage")) layoutCards();
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      layoutTries = 0;
      setTimeout(layoutCards, 80);
    }
  });

  window.addEventListener("load", function () {
    if ($("#rhStage")) setTimeout(layoutCards, 180);
  });

  renderHome();
})();
