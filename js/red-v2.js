/* =========================================================
   文物精灵 · 红版预设 V2「朱墙 · 月洞 · 折扇」
   只替换首页视图；扉页 / 开场画卷 / 登录 / AI 小答 / 存档 全部沿用原版
   入口：红版预设-朱墙月洞.html
   ========================================================= */
(function () {
  "use strict";

  const DECKS = {
    a: {
      label: "初始七友",
      start: 0,
      ids: ["wuzhuqian", "qinghuaci", "yuzhui", "jinqi", "yinqi", "xuanzhi", "xiangqi"]
    },
    b: {
      label: "镇馆七珍",
      start: 0,
      ids: ["tielion", "changxin", "longfengfan", "yuzhulong", "lianhuazun", "houmuwuding", "jituiping"]
    }
  };

  const SHORT_NAME = {
    wuzhuqian: "五铢钱", qinghuaci: "青花瓷", yuzhui: "玉坠", jinqi: "金器",
    yinqi: "银器", xuanzhi: "宣纸", xiangqi: "象棋",
    tielion: "铁狮子", changxin: "长信宫灯", longfengfan: "四龙四凤",
    yuzhulong: "玉猪龙", lianhuazun: "莲花尊", houmuwuding: "后母戊鼎", jituiping: "鸡腿瓶"
  };

  const SHORT_ERA = {
    wuzhuqian: "西汉", qinghuaci: "元 · 明", yuzhui: "新石器至今", jinqi: "商周至今",
    yinqi: "战国至今", xuanzhi: "唐代", xiangqi: "宋代",
    tielion: "后周 · 953", changxin: "西汉", longfengfan: "战国 · 中山",
    yuzhulong: "红山文化", lianhuazun: "北齐", houmuwuding: "商代后期", jituiping: "辽代"
  };

  const AI_TOOLS = [
    { no: "01", big: "壹", em: "📸", title: "AI 打卡海报", desc: "把精灵与博物馆，做成一张可以分享的海报。", href: "#/poster" },
    { no: "02", big: "贰", em: "🧩", title: "AI 文物修复", desc: "去划痕、补缺口、恢复原色，再认一遍。", href: "#/restore" },
    { no: "03", big: "叁", em: "🍵", title: "AI 精灵茶话会", desc: "挑 3~6 只精灵，跨时空聊一场。", href: "#/tea" },
    { no: "04", big: "肆", em: "🎨", title: "AI 赋彩", desc: "把 36 幅黑白文物稿，亲手还上颜色。", href: "#/dye" },
    { no: "05", big: "伍", em: "🔍", title: "AI 文物识别", desc: "拍一张照片，报出名字、年代与来历。", href: "#/ident" },
    { no: "06", big: "陆", em: "🃏", title: "心仪卡工坊", desc: "把心头好调成一张全息典藏卡，可存图。", href: "#/heart" },
    { no: "07", big: "柒", em: "🗺", title: "AI 旅游攻略", desc: "几天、爱看什么、和谁去，排成一条路线。", href: "#/guide" },
    { no: "08", big: "捌", em: "⛏", title: "向考古", desc: "先当先民埋下一座墓，三千年后再亲手挖开。", href: "向考古-我埋下的三千年.html" }
  ];

  let deck = "a";
  let idx = 0;
  let fanCards = [];
  let dragStart = null;
  let dragMoved = false;
  let dragCaptured = false;
  let lastDrag = 0;
  let ro = null;
  let mo = null;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isGot(id) {
    try { return typeof isCaptured === "function" ? !!isCaptured(id) : false; }
    catch (e) { return false; }
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

  function pad2(n) { return String(n).padStart(2, "0"); }

  function mineList() {
    const all = allSpirits();
    const starters = all.filter(function (s) { return s.starter; });
    const others = all.filter(function (s) { return !s.starter && isGot(s.id); });
    return starters.concat(others);
  }

  function doneStationCount() {
    if (typeof STATIONS === "undefined") return 0;
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
    } catch (e) {}
    return "精灵/透明/" + s.id + ".webp";
  }

  /* ---------------- 首页 HTML ---------------- */
  function homeHTML() {
    const all = allSpirits();
    const mine = mineList();
    const done = doneStationCount();
    const total = all.length || 14;
    const stTotal = (typeof STATIONS === "undefined" ? 13 : STATIONS.length);
    const pct = Math.min(100, Math.round(mine.length / total * 100));
    const attrTotal = (typeof ATTRIBUTES !== "undefined")
      ? Object.keys(ATTRIBUTES.primary).length + Object.keys(ATTRIBUTES.secondary).length : 20;

    const avatars = mine.slice(0, 7).map(function (s) {
      return '<a class="rh-ava" href="#/spirit/' + esc(s.id) + '" title="' + esc(s.name) + '">' +
        '<img src="' + esc(avatarSrc(s)) + '" alt="' + esc(s.name) + '" loading="lazy"></a>';
    }).join("");
    const more = mine.length > 7
      ? '<a class="rh-ava-more" href="#/codex" title="还有 ' + (mine.length - 7) + ' 只">+' + (mine.length - 7) + '</a>' : "";

    const marks = (typeof MAP_MARKS !== "undefined" && MAP_MARKS.stations ? MAP_MARKS.stations : []).map(function (m) {
      const st = STATIONS.find(function (x) { return x.id === m.id; });
      if (!st) return "";
      const got = (st.spiritIds || []).filter(isGot).length;
      const totalSt = (st.spiritIds || []).length;
      const ok = totalSt > 0 && got >= totalSt;
      return '<a class="rh-mark' + (ok ? " done" : "") + '" style="left:' + m.x + '%;top:' + m.y + '%" href="#/station/' + esc(st.id) + '" title="' + esc(st.name) + '">' +
        "<i></i><span>" + esc(stationShort(st)) + "</span></a>";
    }).join("");

    const stationRows = (typeof STATIONS === "undefined" ? [] : STATIONS).map(function (st, i) {
      const got = (st.spiritIds || []).filter(isGot).length;
      const totalSt = (st.spiritIds || []).length;
      const ok = totalSt > 0 && got >= totalSt;
      return '<a class="rh-station' + (ok ? " done" : "") + '" href="#/station/' + esc(st.id) + '">' +
        '<span class="rh-st-no">' + pad2(i + 1) + "</span>" +
        '<span class="rh-st-main"><b>' + esc(stationShort(st)) + "</b><small>" + esc(st.subtitle || st.place || "") + "</small></span>" +
        '<span class="rh-st-prog">' + got + "/" + totalSt + "</span></a>";
    }).join("");

    const tools = AI_TOOLS.map(function (t) {
      return '<a class="rh-tool" href="' + esc(t.href) + '" data-big="' + t.no + '">' +
        '<span class="rh-tool-no">' + t.big + "</span>" +
        '<span class="rh-tool-em">' + t.em + "</span>" +
        "<b>" + esc(t.title) + "</b>" +
        "<small>" + esc(t.desc) + "</small>" +
        '<span class="rh-tool-go">进入 →</span></a>';
    }).join("");

    const primaryAttrs = Object.keys(ATTRIBUTES.primary).map(function (k) {
      const a = ATTRIBUTES.primary[k];
      return '<span class="rh-attr" title="' + esc(a.desc) + '"><img src="' + esc(attrIcon("primary", k)) + '" alt=""><b>' + esc(a.name) + "</b></span>";
    }).join("");
    const secondaryAttrs = Object.keys(ATTRIBUTES.secondary).map(function (k) {
      const a = ATTRIBUTES.secondary[k];
      return '<span class="rh-attr" title="' + esc(a.desc) + '"><img src="' + esc(attrIcon("secondary", k)) + '" alt=""><b>' + esc(a.name) + "</b></span>";
    }).join("");

    /* 首屏金粉：20 粒，尺寸 1.4~4.4px，越小的越慢，负延迟让页面一打开就是满场 */
    const goldDust = (function () {
      let out = "";
      for (let i = 0; i < 20; i++) {
        const sz = (1.4 + Math.random() * 3).toFixed(1);
        out += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;width:' + sz + "px;height:" + sz +
          "px;animation-duration:" + (13 + Math.random() * 15).toFixed(1) +
          "s;animation-delay:" + (-Math.random() * 26).toFixed(1) +
          "s;opacity:" + (0.28 + Math.random() * 0.42).toFixed(2) + '"></i>';
      }
      return out;
    })();

    const marquee = (function () {
      const one = [
        "讲 好 中 国 故 事", "让 文 物 活 起 来",
        "燕 赵 拾 遗", "十 四 件 国 宝", "一 扇 一 世 界", "十 三 站 打 卡",
        "拍 一 张 照 片", "唤 醒 一 只 精 灵"
      ].map(function (t) { return "<span>" + t + "<i>✦</i></span>"; }).join("");
      return one + one;
    })();

    return `
    <section class="rh-hero" id="rhHero">
      <i class="rh-hero-bg" aria-hidden="true"></i>
      <div class="rh-dunes" aria-hidden="true"><i class="d1"></i><i class="d2"></i><i class="d3"></i></div>
      <div class="rh-gold" aria-hidden="true">${goldDust}</div>
      <div class="rh-hero-wrap">
        <div class="rh-hero-copy">
          <div class="rh-rail" aria-hidden="true"><span>燕赵拾遗</span></div>
          <div class="rh-eyebrow">HEBEI · RELIC SOUL · 2026</div>
          <div class="rh-motto" role="img" aria-label="讲好中国故事，让文物活起来">
            <span class="rh-motto-t">讲好中国故事</span>
            <i class="rh-motto-sep" aria-hidden="true">·</i>
            <span class="rh-motto-t">让文物活起来</span>
          </div>
          <h1 class="rh-title"><span class="rh-title-cn">文物精灵</span><i class="rh-seal" aria-hidden="true">冀</i></h1>
          <div class="rh-en">A HERITAGE OF CHINA</div>
          <p class="rh-lede">沉睡千年的古物，在燕赵大地上一朝苏醒。<br>点开一只精灵，听它讲<b>自己那一千年</b>的故事。</p>
          <div class="rh-nums">
            <div><b>${total}</b><span>件 国 宝</span></div>
            <div><b>${stTotal}</b><span>个 打 卡 站</span></div>
            <div><b>${attrTotal}</b><span>种 属 性</span></div>
          </div>
          <div class="rh-hero-cta">
            <button type="button" class="btn starbtn" onclick="openPhoto()">
              <strong>📷 打卡唤醒文物</strong>
              <div class="stars-box"><div class="stars"></div></div>
              <div class="glow"><div class="circle"></div><div class="circle"></div></div>
            </button>
            <a class="btn starbtn is-ghost" href="#/codex">
              <strong>翻一翻图鉴 →</strong>
              <div class="stars-box"><div class="stars"></div></div>
              <div class="glow"><div class="circle"></div><div class="circle"></div></div>
            </a>
          </div>
        </div>

        <div class="rh-hero-window">
          <div class="rh-moon">
            <i class="rh-moon-ring" aria-hidden="true"></i>
            <div class="rh-moon-art"><img id="rhArt" src="精灵/透明/qinghuaci.webp" alt="文物精灵" draggable="false"></div>
            <i class="rh-moon-cloud" aria-hidden="true"></i>
          </div>
          <i class="rh-moon-side" aria-hidden="true">一扇一世界</i>
          <i class="rh-stamp s1" aria-hidden="true">精</i>
          <i class="rh-stamp s2" aria-hidden="true">靈</i>
          <i class="rh-stamp s3" aria-hidden="true">燕</i>
          <i class="rh-stamp s4" aria-hidden="true">趙</i>
          <div class="rh-plate" id="rhPlate">
            <div class="rh-plate-top">
              <span id="rhIdx">01 / 07</span>
              <span class="rh-plate-right">
                <em id="rhDeckName">初始七友</em>
                <button type="button" class="rh-plate-x" id="rhPlateX" aria-label="收起这张说明牌" title="收起说明牌（Esc）"></button>
              </span>
            </div>
            <h2 id="rhName">青花瓷</h2>
            <div class="rh-plate-sub" id="rhSub">元 · 明</div>
            <div class="rh-plate-tags" id="rhTags"></div>
            <p class="rh-plate-desc" id="rhDesc"></p>
            <a class="rh-plate-go" id="rhGo" href="#/spirit/qinghuaci">查看档案 <span>→</span></a>
          </div>
          <button type="button" class="rh-plate-open" id="rhPlateOpen">◈ 展开说明</button>
        </div>
      </div>

      <div class="rh-fanbar">
        <div class="rh-fanbar-in">
          <div class="rh-tickets-head" aria-label="牌阵分组">
            <i aria-hidden="true"></i><span>初始七友</span><b>07</b><i aria-hidden="true"></i>
          </div>
          <div class="rh-fan" id="rhFan" aria-label="初始七友 · 七张票券，可左右切换">
            <div class="rh-cards" id="rhCards"></div>
          </div>
          <div class="rh-fan-hint">点 一 张 票 · ← → 换 牌 · 读 它 的 档 案</div>
        </div>
      </div>
    </section>

    <div class="rh-band" aria-hidden="true"><div class="rh-band-track">${marquee}</div></div>

    <div class="rh-main">
      <section class="rh-sec rh-mine" id="home-mine">
        <div class="rh-head">
          <span class="rh-no" aria-hidden="true">壹</span>
          <div class="rh-head-txt">
            <span class="rh-kicker">MY SPIRITS · 我的精灵</span>
            <h2>起始七友，已经在你身边</h2>
            <p>去博物馆拍下文物，答对它出的题，就能唤醒更多伙伴。每一只精灵，都藏着一件国宝的来历。</p>
          </div>
          <a class="rh-more" href="#/codex">全部图鉴 →</a>
        </div>
        <div class="rh-mine-body">
          <div class="rh-seals">${avatars}${more}</div>
          <div class="rh-meter">
            <div class="rh-meter-num"><b>${mine.length}</b><span>/ ${total} 已唤醒</span></div>
            <div class="rh-track"><i style="width:${pct}%"></i></div>
            <p>已点亮 <b>${done}</b> / ${stTotal} 站 · 还有 ${Math.max(0, total - mine.length)} 只精灵等你唤醒</p>
            <button type="button" class="rh-link-btn" onclick="openPhoto()">📷 去打卡唤醒 →</button>
          </div>
        </div>
      </section>

      <div class="rh-divider" aria-hidden="true"></div>

      <section class="rh-sec">
        <div class="rh-explore-grid">
          <div class="rh-stations" id="home-stations">
            <div class="rh-head">
              <span class="rh-no" aria-hidden="true">贰</span>
              <div class="rh-head-txt">
                <span class="rh-kicker">EXPLORE · 十三站</span>
                <h2>一张地图，走完十三站</h2>
                <p>从沧州的铁狮子，到满城汉墓的长信宫灯；从红山玉龙，到后母戊鼎。点亮一站，就多一段燕赵故事。</p>
              </div>
            </div>
            <div class="rh-station-list">${stationRows}</div>
          </div>
          <div class="rh-map-card" id="home-map">
            <div class="rh-card-t"><b>河北地图</b><span>已点亮 ${done} / ${stTotal} 站</span></div>
            <div class="rh-map">
              <img src="装饰/河北地图.webp" alt="河北地图">
              <div class="rh-marks">${marks}</div>
            </div>
            <div class="rh-map-foot">点一枚站点标记，直达那一站 →</div>
          </div>
        </div>
      </section>

      <section class="rh-ai">
        <div class="rh-ai-in">
          <div class="rh-head">
            <span class="rh-no" aria-hidden="true">叁</span>
            <div class="rh-head-txt">
              <span class="rh-kicker">AI WORKSHOP · AI 工坊</span>
              <h2>让文物，陪你玩起来</h2>
              <p>拍海报、修文物、办茶话会、给黑白稿上色、识别一件器物、再做一张心仪卡、排一条文博路线。七件 AI 工具，都能从一只精灵开始。</p>
            </div>
            <a class="rh-ai-cfg" href="#/" onclick="return aiCfgOpen()">☁️ 云端 AI →</a>
          </div>
          <div class="rh-tools">${tools}</div>
        </div>
      </section>

      <section class="rh-sec" id="home-attr">
        <div class="rh-head">
          <span class="rh-no" aria-hidden="true">肆</span>
          <div class="rh-head-txt">
            <span class="rh-kicker">ATTRIBUTES · 属性图鉴</span>
            <h2>二十种属性，认出每一只精灵</h2>
            <p>主属性看材质，副属性看用途。青铜、金银、陶瓷、玉器、书画……每只精灵都有自己的来处。</p>
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
          <h2>下一次去博物馆，<br>拍一张照片，唤醒它。</h2>
          <div class="rh-final-actions">
            <button type="button" class="rh-btn-solid" onclick="openPhoto()">📷 打卡拍照 · 唤醒文物</button>
            <a class="rh-btn-line" href="#/codex">📖 翻一翻文物图鉴</a>
          </div>
        </div>
      </section>
    </div>`;
  }

  /* ---------------- 票券墙（造型取自 uiverse.io/cards 的 TICKET 卡） ----------------
     每张票：抬头 TICKET → 名字 → 撕票虚线 → 精灵 → 编号/条码，正好是「上名字、下精灵」 */
  function buildFan() {
    const wrap = $("#rhCards");
    if (!wrap) return;
    const list = deckSpirits();
    wrap.innerHTML = list.map(function (s, i) {
      const short = SHORT_NAME[s.id] || s.name;
      const long = short.length > 5 ? " long" : "";
      const era = SHORT_ERA[s.id] || s.era || "";
      return '<button type="button" class="rh-fancard rh-ticket" data-i="' + i + '" aria-label="' + esc(s.name) + '">' +
        '<span class="notes" aria-hidden="true">\u266a\u266a\u266a\u266a</span>' +
        '<span class="notes" aria-hidden="true">\u266a\u266a\u266a\u266a\u266a</span>' +
        '<span class="notes" aria-hidden="true">\u266a\u266a\u266a\u266a</span>' +
        '<span class="header">TICKET<span class="symbol" aria-hidden="true">\u2701</span></span>' +
        '<span class="body">' +
          '<span class="tk-name' + long + '">' + esc(short) + "</span>" +
          '<span class="tk-art fc-art"><img src="精灵/透明/' + esc(s.id) + '.webp" alt="' + esc(s.name) + '" draggable="false"></span>' +
        "</span>" +
        '<span class="footer"><span class="era">' + esc(era) + '</span><span class="barcode" aria-hidden="true"></span><span class="tk-no">NO.' + pad2(i + 1) + "</span></span>" +
        '<span class="bg" aria-hidden="true"></span>' +
        "</button>";
    }).join("");
    fanCards = $$(".rh-fancard", wrap);
    fanCards.forEach(function (card) {
      card.addEventListener("click", function () {
        if (Date.now() - lastDrag < 300) return;
        const i = Number(card.getAttribute("data-i"));
        if (!Number.isNaN(i)) { selectCard(i); plateShow(true); }
      });
      /* 3D 倾斜 + 高光跟随（只给真鼠标；触屏不做，免得跟横滑打架） */
      card.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty("--ry", ((px - 0.5) * 26).toFixed(2) + "deg");
        card.style.setProperty("--rx", ((0.5 - py) * 20).toFixed(2) + "deg");
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        card.style.setProperty("--gl", "0.45");
        card.style.setProperty("--sc", "1.045");
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
        card.style.setProperty("--gl", "0");
        card.style.setProperty("--sc", "1");
      });
    });
  }

  /* 七张票由 CSS 横排（flex），这里只负责选中态的同步，不再做扇面角度计算 */
  function layoutFan() {
    if (!fanCards.length) return;
    fanCards.forEach(function (card, i) {
      card.classList.toggle("is-sel", i === idx);
      card.style.transform = "";
      card.style.zIndex = "";
      card.style.opacity = "";
      card.style.pointerEvents = "";
      card.removeAttribute("aria-hidden");
      card.tabIndex = 0;
    });
  }

  function paintHero() {
    const list = deckSpirits();
    const s = list[idx] || list[0];
    if (!s) return;
    const st = stationOf(s.id);
    const short = SHORT_NAME[s.id] || s.name;
    const art = $("#rhArt");
    const nameEl = $("#rhName");
    const subEl = $("#rhSub");
    const tagsEl = $("#rhTags");
    const descEl = $("#rhDesc");
    const goEl = $("#rhGo");
    const idxEl = $("#rhIdx");
    const deckEl = $("#rhDeckName");

    if (art) {
      /* 圆窗用「基线对齐」版：所有立绘视觉等大，旧图兜底 */
      art.onerror = function () {
        this.onerror = null;
        this.src = "精灵/透明/" + s.id + ".webp";
      };
      art.src = "精灵/圆窗/" + s.id + ".webp";
      art.alt = s.name || short;
    }
    if (nameEl) nameEl.textContent = short;
    if (subEl) subEl.textContent = SHORT_ERA[s.id] || String(s.era || "").split("(")[0];
    if (idxEl) idxEl.textContent = pad2(idx + 1) + " / " + pad2(list.length);
    if (deckEl) deckEl.textContent = DECKS[deck].label;

    const tags = [
      ATTRIBUTES.primary[s.primary] && ATTRIBUTES.primary[s.primary].name,
      ATTRIBUTES.secondary[s.secondary] && ATTRIBUTES.secondary[s.secondary].name,
      deck === "b" ? (stationShort(st) || "镇馆七珍") : "初始七友"
    ].filter(Boolean);
    if (tagsEl) tagsEl.innerHTML = tags.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    if (descEl) descEl.textContent = s.intro || "";
    if (goEl) goEl.setAttribute("href", "#/spirit/" + s.id);
  }

  function paintTabs() {
    $$(".rh-decks button").forEach(function (b) {
      const on = b.getAttribute("data-rh-deck") === deck;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  /* 说明牌：鼠标移开自己淡出，移回来再淡入；触屏无悬停，仍留 ✕；Esc 同样可收起 */
  function plateShow(on) {
    const plate = $("#rhPlate");
    if (!plate) return;
    plate.classList.toggle("is-off", !on);
  }

  function bindPlate() {
    const plate = $("#rhPlate");
    if (!plate || plate.dataset.bound === "1") return;
    plate.dataset.bound = "1";
    const x = $("#rhPlateX");
    const open = $("#rhPlateOpen");
    if (x) x.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); plateShow(false); });
    if (open) open.addEventListener("click", function () { plateShow(true); });

    /* 只有真悬停设备（鼠标/触控板）才自动收起，触屏交给 ✕ */
    const win = plate.closest(".rh-hero-window");
    const hoverable = win && window.matchMedia &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (hoverable && win.dataset.hoverBound !== "1") {
      win.dataset.hoverBound = "1";
      let timer = 0;
      const stop = function () { if (timer) { clearTimeout(timer); timer = 0; } };
      /* 留 620ms 缓冲，鼠标只是掠过、或在窗与牌之间挪动时不会闪 */
      const arm = function () {
        stop();
        timer = setTimeout(function () {
          timer = 0;
          if (!win.matches(":hover")) plateShow(false);
        }, 620);
      };
      win.addEventListener("pointerenter", function () {
        stop();
        if (plate.classList.contains("is-off")) plateShow(true);
      });
      win.addEventListener("pointerleave", arm);
      win.addEventListener("pointercancel", arm);
      /* 鼠标停在牌面上不动时永远不收 */
      plate.addEventListener("pointerenter", stop);
      plate.addEventListener("pointermove", stop);
    }
    /* Esc 只挂一次，避免来回切页重复叠加监听 */
    if (!bindPlate.escBound) {
      bindPlate.escBound = true;
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        if (document.body.dataset.page !== "home") return;
        if (!document.getElementById("rhPlate")) return;
        plateShow(false);
      });
    }
  }

  function selectCard(i) {
    const n = fanCards.length;
    if (!n) return;
    idx = ((i % n) + n) % n;
    layoutFan();
    paintHero();
  }

  function stepCard(dir) { selectCard(idx + dir); }

  function switchDeck(next) {
    if (!DECKS[next] || next === deck) return;
    deck = next;
    idx = 0;
    buildFan();
    paintTabs();
    paintHero();
    layoutFan();
  }

  function bindFan() {
    const fan = $("#rhFan");
    if (!fan) return;

    $$(".rh-decks button").forEach(function (b) {
      b.addEventListener("click", function () { switchDeck(b.getAttribute("data-rh-deck")); });
    });

    fan.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      dragStart = e.clientX;
      dragMoved = false;
      dragCaptured = false;
    });
    fan.addEventListener("pointermove", function (e) {
      if (dragStart == null) return;
      if (Math.abs(e.clientX - dragStart) > 10) {
        dragMoved = true;
        if (!dragCaptured) { dragCaptured = true; try { fan.setPointerCapture(e.pointerId); } catch (err) {} }
        if (e.cancelable) e.preventDefault();
      }
    });
    fan.addEventListener("pointerup", function (e) {
      if (dragStart == null) return;
      const dx = e.clientX - dragStart;
      dragStart = null;
      if (dragCaptured) { try { fan.releasePointerCapture(e.pointerId); } catch (err) {} dragCaptured = false; }
      if (dragMoved && Math.abs(dx) > 42) { lastDrag = Date.now(); stepCard(dx < 0 ? 1 : -1); }
    });
    fan.addEventListener("pointercancel", function () {
      dragStart = null; dragMoved = false; dragCaptured = false;
    });

    if (ro) ro.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () { layoutFan(); });
      ro.observe(fan);
    }
    if (mo) mo.disconnect();
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(function () {
        if (!document.body.classList.contains("flyleaf-on") && !document.body.classList.contains("intro-on")) {
          requestAnimationFrame(layoutFan);
        }
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
  }

  function initFan() {
    buildFan();
    paintTabs();
    paintHero();
    bindPlate();
    bindFan();
    layoutFan();
    setTimeout(layoutFan, 80);
    setTimeout(layoutFan, 460);
  }

  /* ---------------- 滚动入场 ---------------- */
  function bindReveal() {
    if (typeof IntersectionObserver === "undefined") return;
    const blocks = $$(".rh-main > section, .rh-main > .rh-ai");
    if (!blocks.length) return;
    document.body.classList.add("rh-anim");
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("rh-in");
        io.unobserve(en.target);
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    blocks.forEach(function (b) { io.observe(b); });
  }

  /* ---------------- 顶栏高亮 ---------------- */
  function paintNav() {
    const items = $$(".rh-topbar .nav-item");
    if (!items.length) return;
    const page = location.hash.replace(/^#\/?/, "").split("/")[0];
    const ai = ["poster", "restore", "tea", "dye", "ident"];
    let key = "";
    if (!page) key = "mine";
    else if (page === "codex" || page === "spirit") key = "codex";
    else if (ai.indexOf(page) >= 0) key = "poster";
    else if (page === "museums" || page === "creative" || page === "station") key = "more";
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
      initFan();
      bindReveal();
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
    if (!document.getElementById("rhFan")) return;
    if (document.body.dataset.page !== "home") return;
    if (document.body.classList.contains("flyleaf-on") || document.body.classList.contains("intro-on")) return;
    const tag = ((e.target && e.target.tagName) || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); stepCard(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepCard(1); }
    else if (e.key === "Enter") {
      const active = document.activeElement && document.activeElement.tagName;
      if (active === "BUTTON" || active === "A" || active === "INPUT" || active === "TEXTAREA") return;
      const go = $("#rhGo");
      if (go) location.hash = go.getAttribute("href");
    }
  });

  window.addEventListener("resize", function () {
    if (document.getElementById("rhFan")) layoutFan();
  });

  renderHome();
})();
