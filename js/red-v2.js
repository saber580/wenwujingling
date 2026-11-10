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
    { no: "02", big: "贰", em: "🍵", title: "AI 精灵茶话会", desc: "挑 3~6 只精灵，跨时空聊一场。", href: "#/tea" },
    { no: "03", big: "叁", em: "🔍", title: "AI 文物识别", desc: "拍一张照片，报出名字、年代与来历。", href: "#/ident" }
  ];

  const EDU_TOOLS = [
    { no: "01", big: "壹", em: "🖌", title: "文物拟人漫画", desc: "国宝化作萌系角色，讲自己的故事。", href: "#/shiyilu" },
    { no: "02", big: "贰", em: "🧩", title: "文物修复", desc: "去划痕、补缺口、恢复原色，再认一遍。", href: "#/restore" },
    { no: "03", big: "叁", em: "🎨", title: "文物赋彩", desc: "把 36 幅黑白文物稿，亲手还上颜色。", href: "#/dye" },
    { no: "04", big: "肆", em: "🗺", title: "文博旅游攻略", desc: "几天、爱看什么、和谁去，排成一条路线。", href: "#/guide" },
    { no: "05", big: "伍", em: "🃏", title: "心仪卡工坊", desc: "把心头好调成一张全息典藏卡，可存图。", href: "#/heart" },
    { no: "06", big: "陆", em: "⛏", title: "向考古", desc: "先当先民埋下一座墓，三千年后再亲手挖开。", href: "向考古-我埋下的三千年.html?v=1024" }
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

  /* 隐藏站（第零站 · 华夏）不计入首页站数，否则 "22 / 23" 会剧透它 */
  function shownStations() {
    if (typeof STATIONS === "undefined") return [];
    return STATIONS.filter(function (st) { return !st.secret; });
  }

  function doneStationCount() {
    return shownStations().filter(function (st) {
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

  /* ---------------- 成就册 ----------------
     一枚成就 = 一张小照 + 一行记事（形制照「一成就一照片，旁附文字」的册页排法）。
     解锁条件全部读站内真实进度，不另存一套状态：
     唤醒数 / 站点数 / 属性覆盖 / VN 结局、支线、问它一句的次数。
     照片用该成就对应的文物精灵立绘（精灵/透明/<id>.webp），不是另画的插图。 */
  function achievementList() {
    const mine = mineList();
    const total = allSpirits().length || 104;
    const sts = shownStations();
    const stTotal = sts.length || 22;
    const done = doneStationCount();
    const hbSts = sts.filter(function (st) { return /河北/.test(st.place || ""); });
    const hbDone = hbSts.filter(function (st) {
      const ids = st.spiritIds || [];
      return ids.length > 0 && ids.every(isGot);
    }).length;

    const attrs = {};
    mine.forEach(function (s) {
      if (s.primary) attrs[s.primary] = 1;
      if (s.secondary) attrs[s.secondary] = 1;
    });
    const attrGot = Object.keys(attrs).length;

    let ends = 0, asks = 0;
    /* 首页比 aw-vn.js 早一拍渲染，那时 window.VN 可能还没挂上；
       拿不到就跑存档（键名与 aw-vn.js 的 VN_SAVE_KEY / VN_PLAYER_KEY 对齐），
       这样首屏就能显示真实的结局数、问话数，不必等第二次进首页 */
    try {
      const vn = window.VN && window.VN._state;
      if (vn) {
        ends = Object.keys(vn.endings || {}).length;
        asks = vn.askCount || 0;
      } else {
        const pl = JSON.parse(localStorage.getItem("wjwl_vn_player_v2") || "null");
        if (pl && pl.askCount) asks = pl.askCount;
        const ed = JSON.parse(localStorage.getItem("wjwl_vn_endings_v4") || "null");
        if (ed && ed.endings) ends = Object.keys(ed.endings).length;
      }
    } catch (e) {}

    const list = [
      { id: "open",   img: "wuzhuqian",   n: "入册",       d: "你推开了这本册子，第一页写下了你的名字。", cur: 1, need: 1, unit: "页" },
      { id: "first",  img: "tielion",     n: "初入燕赵",   d: "拍下第一件文物，册上落了第一笔。",       cur: mine.filter(function (s) { return !s.starter; }).length, need: 1, unit: "件" },
      { id: "one",    img: "changxin",    n: "一站到底",   d: "把一站里的精灵全收齐，才算真的到过。",   cur: done, need: 1, unit: "站" },
      { id: "eleven", img: "jinyuyi",     n: "十一城记",   d: "河北十一个馆，一个不落。",               cur: hbDone, need: Math.max(1, hbSts.length), unit: "站" },
      { id: "nine",   img: "yuzhulong",   n: "九州行",     d: "十一个站亮起来，地图上开始有路可走。",   cur: done, need: 11, unit: "站" },
      { id: "attr",   img: "yubi",        n: "见器知性",   d: "十四种属性在手，看器物先看它是什么做的。", cur: attrGot, need: 14, unit: "种属性" },
      { id: "half",   img: "qinghuaci",   n: "半壁",       d: "过半的国宝，都跟着你回了家。",           cur: mine.length, need: Math.ceil(total / 2), unit: "只" },
      { id: "all",    img: "houmuwuding", n: "满架",       d: total + " 件国宝收齐，一架摆满。",        cur: mine.length, need: total, unit: "只" },
      { id: "story",  img: "yanyudeng",   n: "说书人",     d: "问它一句满十次，它们开始主动跟你搭话。", cur: asks, need: 10, unit: "次" },
      { id: "ends",   img: "hushilu",     n: "四种收梢",   d: "四条路都走到头，才知道哪个是自己选的。", cur: ends, need: 4, unit: "个结局" },
      { id: "all22",  img: "lianhuazun",  n: "走遍二十二站", d: "二十二站全亮，你的地图再没有暗处。",   cur: done, need: stTotal, unit: "站" }
    ];

    list.forEach(function (a) {
      a.on = a.cur >= a.need;
      a.pct = Math.max(0, Math.min(100, Math.round(a.cur / a.need * 100)));
      a.left = Math.max(0, a.need - a.cur);
    });
    return list;
  }

  /* ---------------- 成就册的九宫／十二格 ----------------
     一格一枚：编号 + 一张 16:10 小像 + 名字与一段记事（收集档案的排法）。
     小像是 成就/ach_<id>.jpg（站内文物立绘叠在朱红/青绿底纹上合成）；
     没解锁的同款画面压暗加印「未收录」，记事换成「还差多少」。
     首页不再放这一整块——它有自己的页面（#/achieve），这里只做拼装。 */
  function achGridHTML() {
    const list = achievementList();
    const on = list.filter(function (a) { return a.on; }).length;
    const cards = list.map(function (a, i) {
      const note = a.on ? a.d : "还差 " + a.left + " " + a.unit + " · " + a.d;
      const no = "No." + (i + 1 < 10 ? "0" : "") + (i + 1);
      const shot = '<img src="成就/ach_' + esc(a.id) + '.jpg?v=1" alt="' + esc(a.n) +
        '" loading="lazy" decoding="async" draggable="false">';
      return '<article class="rh-ach-card' + (a.on ? " is-on" : " is-off") + '">' +
        '<span class="rh-ach-no">' + no + "</span>" +
        '<span class="rh-ach-photo">' + shot + (a.on ? '<i class="rh-ach-seal">已</i>' : "") + "</span>" +
        '<div class="rh-ach-cap"><b>' + esc(a.n) + "</b><small>" + esc(note) + "</small></div>" +
        "</article>";
    }).join("");
    /* 十一枚在三列里会空出最后一格——补一枚「留白」的空格，
       把「灰着的格子，空着等你」这句话真的做成一个格子，不留突兀的破口 */
    const blank = (on < list.length)
      ? '<article class="rh-ach-card is-blank" aria-hidden="true">' +
          '<span class="rh-ach-no">No.——</span>' +
          '<span class="rh-ach-photo"><i>空</i></span>' +
          '<div class="rh-ach-cap"><b>还差 ' + (list.length - on) + ' 枚</b>' +
          "<small>这一格空着，等你回来落笔。</small></div>" +
        "</article>"
      : "";
    return { html: cards + blank, on: on, total: list.length };
  }

  /* ---------------- 成就册（独立页 #/achieve）---------------- */
  function achieveHTML() {
    const g = achGridHTML();
    const pct = g.total ? Math.round(g.on / g.total * 100) : 0;
    return '<div class="ach-page">' +
      '<div class="ach-top">' +
        '<a class="ach-back" href="#/">← 回到首页</a>' +
        '<div class="ach-kicker">ACHIEVEMENTS · 成就册</div>' +
        "<h1>走过的每一站，都在册上留了一笔</h1>" +
        "<p>一格一枚：一张小像，一段记事。小像里是那件文物的样子，旁边记着你是怎么把它领回来的。" +
          "没走到的格子里没有照片，只有编号——它还在路上等你。</p>" +
        '<div class="ach-meter"><span><b>' + g.on + "</b> / " + g.total + " 已解锁</span>" +
          '<i class="ach-meter-bar"><i style="width:' + pct + '%"></i></i>' +
          '<span class="ach-meter-pct">' + pct + "%</span></div>" +
      "</div>" +
      '<div class="rh-ach-grid ach-grid-page">' + g.html + "</div>" +
      "</div>";
  }

  /* ---------------- 首页 HTML ---------------- */
  function homeHTML() {
    const all = allSpirits();
    const mine = mineList();
    const done = doneStationCount();
    const total = all.length || 14;
    const stTotal = (typeof STATIONS === "undefined" ? 13 : (shownStations().length || 13));
    const pct = Math.min(100, Math.round(mine.length / total * 100));
    const attrTotal = (typeof ATTRIBUTES !== "undefined")
      ? Object.keys(ATTRIBUTES.primary).length + Object.keys(ATTRIBUTES.secondary).length : 20;
    const achList = achievementList();
    const achOn = achList.filter(function (a) { return a.on; }).length;


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
      /* 站点标记：Uiverse SnyDeTreves/white-newt-65「Map card」形制
         （图钉 + 悬停下压 + 标签牌），类名避开组件原 .map-city 与站内城市名重名 */
      return '<a class="rh-mark uiverse-pin' + (ok ? " done" : "") + '" style="left:' + m.x + '%;top:' + m.y + '%" href="#/station/' + esc(st.id) + '" title="' + esc(st.name) + '">' +
        '<span class="pin-label"><span class="pin-sign" data-icon="🏛">' + esc(stationShort(st)) + "</span></span></a>";
    }).join("");

    const stationRows = shownStations().map(function (st, i) {
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

    const eduTools = EDU_TOOLS.map(function (t) {
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

    /* 首屏金粉：14 粒，尺寸 1.4~4.4px，越小的越慢，负延迟让页面一打开就是满场 */
    const goldDust = (function () {
      let out = "";
      for (let i = 0; i < 14; i++) {
        const sz = (1.4 + Math.random() * 3).toFixed(1);
        out += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;width:' + sz + "px;height:" + sz +
          "px;animation-duration:" + (22 + Math.random() * 20).toFixed(1) +
          "s;animation-delay:" + (-Math.random() * 26).toFixed(1) +
          "s;opacity:" + (0.20 + Math.random() * 0.30).toFixed(2) + '"></i>';
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
            <a class="rh-num-go" href="#/achieve" title="打开成就册">
              <b>${achOn}</b><span>枚 成 就<i aria-hidden="true"> →</i></span>
            </a>
          </div>
          <div class="rh-hero-cta">
            <button type="button" class="btn starbtn" onclick="openPhoto()">
              <strong>📷 打卡唤醒文物</strong>
              <div class="stars-box"><div class="stars"></div></div>
              <div class="glow"><div class="circle"></div><div class="circle"></div></div>
            </button>
            <button type="button" class="btn starbtn is-ghost" onclick="openStory()">
              <strong>🗺 主线剧情 · 大地图</strong>
              <div class="stars-box"><div class="stars"></div></div>
              <div class="glow"><div class="circle"></div><div class="circle"></div></div>
            </button>
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
                <span class="rh-kicker">EXPLORE · 二十二站</span>
                <h2>一张地图，走完二十二站</h2>
                <p>河北 11 站落在燕赵，全国 11 馆散在九州：从沧州铁狮子到三星堆的纵目，点一枚标记，进一段故事。</p>
              </div>
            </div>
            <div class="rh-station-list">${stationRows}</div>
          </div>
          <div class="rh-map-card" id="home-map">
            <div class="rh-card-t"><b>全国地图</b><span>已点亮 ${done} / ${stTotal} 站</span></div>
            <div class="rh-map">
              ${(typeof ChinaMap !== "undefined") ? ChinaMap.render() : ""}
            </div>
            <div class="rh-map-foot">
              <span>点标记直达那一站 · 河北 11 城可放大</span>
              <button type="button" class="cmap-enter" data-act="zoom">放大河北 ▸</button>
            </div>
          </div>
        </div>
      </section>

      <section class="rh-ai">
        <div class="rh-ai-in">
          <div class="rh-head">
            <span class="rh-no" aria-hidden="true">叁</span>
            <div class="rh-head-txt">
              <span class="rh-kicker">AI WONDERLAND · AI 文物奇境</span>
              <h2>让文物，被 AI 唤醒</h2>
              <p>活态聊天、史事推演、溯源讲解、打卡海报、精灵茶话会、文物识别。AI 与文物文化深度相融，每一样都能从一只精灵开始。</p>
            </div>
            <a class="rh-ai-cfg" href="#/" onclick="return aiCfgOpen()">☁️ 云端 AI →</a>
          </div>
          <div class="rh-tools">${tools}</div>
        </div>
      </section>

      <section class="rh-ai rh-ai-edu">
        <div class="rh-ai-in">
          <div class="rh-head">
            <span class="rh-no" aria-hidden="true">叁乙</span>
            <div class="rh-head-txt">
              <span class="rh-kicker">PLAYGROUND · 文物新玩法</span>
              <h2>寓教于乐，边玩边懂</h2>
              <p>修文物、给黑白稿上色、看国宝漫画、排文博路线、做心仪卡、再亲手埋一座墓。不靠 AI，也能把文物文化玩进心里。</p>
            </div>
          </div>
          <div class="rh-tools">${eduTools}</div>
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

      <!-- 伍 · 文以载道（本机预设，未上线）：引文出自求是网《习近平：讲好中国故事，传播好中国声音》 -->
      <section class="rh-sec rh-verse" id="home-verse">
        <div class="rh-head">
          <span class="rh-no" aria-hidden="true">伍</span>
          <div class="rh-head-txt">
            <span class="rh-kicker">TELL CHINA'S STORY · 文以载道</span>
            <h2>让文物，替中国说话</h2>
            <p>一件器物，就是一段看得见的文明。把它的来处讲清楚，把它的话传出去——这是这卷长卷最想落下的一句。</p>
          </div>
        </div>
        <div class="rh-verse-card">
          <div class="rh-verse-side" aria-hidden="true">
            <span class="rh-verse-seal">文以载道</span>
            <i class="rh-verse-rule"></i>
          </div>
          <div class="rh-verse-body">
            <blockquote class="rh-verse-q">要向全世界讲好中国历史故事。要运用我国考古成果和历史研究成果，通过对外宣传、交流研讨等方式，向国际社会展示博大精深的中华文明，讲清楚中华文明的灿烂成就和对人类文明的重大贡献，让世界了解中国历史、了解中华民族精神，从而不断加深对当今中国的认知和理解。</blockquote>
            <div class="rh-verse-src">
              <b>—— 习近平</b>
              <span>2020 年 9 月 28 日 · 在十九届中央政治局第二十三次集体学习时的讲话</span>
              <a href="https://www.qstheory.cn/zhuanqu/2021-06/02/c_1127522386.htm" target="_blank" rel="noopener noreferrer">求是网原文 ↗</a>
            </div>
            <p class="rh-verse-also">“要更好推动中华文化走出去，<em>以文载道、以文传声、以文化人</em>，向世界阐释推介更多具有中国特色、体现中国精神、蕴藏中国智慧的优秀文化。”
              <span>—— 2021 年 5 月 31 日，在十九届中央政治局第三十次集体学习时的讲话</span>
            </p>
          </div>
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
     每张票：抬头 TICKET → 名字 → 撕票虚线 → 精灵 → 编号/条码，正好是「上名字、下精灵」。
     每张票下方垫一个发光的「井」（SVG 金盒，取自 uiverse great-starfish 的 bounce 动画），
     七张票七种井色；票浮在井上，随井一起上下漂浮，hover 时共同抬升。 */
  const WELL_COLORS = [
    "#e8b513",  // 五铢钱 · 铜金
    "#4f9fe8",  // 青花瓷 · 青蓝
    "#43d0b0",  // 玉坠 · 青玉
    "#f2a33a",  // 金器 · 橙金（与铜金拉开）
    "#b8c6e0",  // 银器 · 亮银
    "#c58fe0",  // 宣纸 · 紫檀（与金黄彻底区分）
    "#e2643f"   // 象棋 · 朱红
  ];
  function wellSvg(c) {
    /* 井口金盒：描边 + 金面走 var(--well)，粒子走 var(--well-bright)，深色底座不变 */
    return '<span class="tk-well" aria-hidden="true">' +
      '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
        '<g>' +
          '<polygon class="w-bounce" transform="rotate(45 100 100)" stroke-width="1" stroke="var(--well)" fill="none" points="70,70 148,50 130,130 50,150"></polygon>' +
          '<polygon class="w-bounce2" transform="rotate(45 100 100)" stroke-width="1" stroke="var(--well)" fill="none" points="70,70 148,50 130,130 50,150"></polygon>' +
          '<polygon transform="rotate(45 100 100)" stroke-width="2" fill="#414750" points="70,70 150,50 130,130 50,150"></polygon>' +
          '<polygon stroke-width="2" fill="url(#wg1' + c + ')" points="100,70 150,100 100,130 50,100"></polygon>' +
          '<defs><linearGradient id="wg1' + c + '" y2="100%" x2="10%" y1="0%" x1="0%">' +
            '<stop stop-color="#1e2026" offset="20%"></stop><stop stop-color="#414750" offset="60%"></stop>' +
          '</linearGradient></defs>' +
          '<polygon transform="translate(20, 31)" stroke-width="2" fill="var(--well)" points="80,50 80,75 80,99 40,75"></polygon>' +
          '<polygon transform="translate(20, 31)" stroke-width="2" fill="url(#wg2' + c + ')" points="40,-40 80,-40 80,99 40,75"></polygon>' +
          '<defs><linearGradient id="wg2' + c + '" y2="100%" x2="0%" y1="-17%" x1="10%">' +
            '<stop stop-color="var(--well)" stop-opacity="0" offset="20%"></stop>' +
            '<stop class="w-stop" stop-color="var(--well)" stop-opacity="0.5" offset="100%"></stop>' +
          '</linearGradient></defs>' +
          '<polygon transform="rotate(180 100 100) translate(20, 20)" stroke-width="2" fill="var(--well)" points="80,50 80,75 80,99 40,75"></polygon>' +
          '<polygon transform="rotate(0 100 100) translate(60, 20)" stroke-width="2" fill="url(#wg3' + c + ')" points="40,-40 80,-40 80,85 40,110.2"></polygon>' +
          '<defs><linearGradient id="wg3' + c + '" y2="100%" x2="10%" y1="0%" x1="0%">' +
            '<stop stop-color="var(--well)" stop-opacity="0" offset="20%"></stop>' +
            '<stop class="w-stop" stop-color="var(--well)" stop-opacity="0.5" offset="100%"></stop>' +
          '</linearGradient></defs>' +
          '<polygon class="w-part" transform="rotate(45 100 100) translate(80, 95)" stroke-width="2" fill="var(--well-bright)" points="5,0 5,5 0,5 0,0"></polygon>' +
          '<polygon class="w-part" transform="rotate(45 100 100) translate(80, 55)" stroke-width="2" fill="var(--well-bright)" points="6,0 6,6 0,6 0,0"></polygon>' +
          '<polygon class="w-part" transform="rotate(45 100 100) translate(70, 80)" stroke-width="2" fill="#fff" points="2,0 2,2 0,2 0,0"></polygon>' +
          '<polygon stroke-width="2" fill="#292d34" points="29.5,99.8 100,142 100,172 29.5,130"></polygon>' +
          '<polygon transform="translate(50, 92)" stroke-width="2" fill="#1f2127" points="50,50 120.5,8 120.5,35 50,80"></polygon>' +
        '</g>' +
      '</svg>' +
    '</span>';
  }
  function buildFan() {
    const wrap = $("#rhCards");
    if (!wrap) return;
    const list = deckSpirits();
    wrap.innerHTML = list.map(function (s, i) {
      const short = SHORT_NAME[s.id] || s.name;
      const long = short.length > 5 ? " long" : "";
      const era = SHORT_ERA[s.id] || s.era || "";
      const well = WELL_COLORS[i % WELL_COLORS.length];
      return '<span class="tk-cell" style="--well:' + well + '">' +
        '<button type="button" class="rh-fancard rh-ticket" data-i="' + i + '" aria-label="' + esc(s.name) + '">' +
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
        "</button>" +
        wellSvg(i) +
      "</span>";
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
    const ai = ["poster", "tea", "ident", "trace", "alive", "mystery"];
    const edu = ["restore", "dye", "shiyilu", "guide", "heart"];
    let key = "";
    if (!page) key = "mine";
    else if (page === "codex" || page === "spirit") key = "codex";
    else if (ai.indexOf(page) >= 0) key = "poster";
    else if (edu.indexOf(page) >= 0) key = "enlight";
    else if (page === "museums" || page === "creative" || page === "station" || page === "biz") key = "more";
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
      if (typeof ChinaMap !== "undefined") {
        const mapCard = document.getElementById("home-map");
        if (mapCard) ChinaMap.bind(mapCard);
      }
    }
    paintNav();
  }

  /* 成就册是一页独立的册子：app.js 的路由表里没有这条，
     它的 hashchange 直接调内部 render()（绕过 window.render），
     所以这里自己接一次——认的是 body[data-page]，谁先跑都不怕 */
  function renderAchieve() {
    if (document.body.dataset.page !== "achieve") return;
    const app = document.getElementById("app");
    if (!app || app.querySelector(".ach-page")) return;
    app.innerHTML = achieveHTML();
    window.scrollTo(0, 0);
    paintNav();
  }

  window.addEventListener("hashchange", renderAchieve);
  window.addEventListener("hashchange", renderHome);

  const originalRender = window.render;
  if (typeof originalRender === "function") {
    window.render = function () {
      const result = originalRender.apply(this, arguments);
      /* 成就册是一页独立的册子：app.js 里没有这条路由，这里接住 #/achieve */
      if (document.body.dataset.page === "achieve") {
        const app = document.getElementById("app");
        if (app) app.innerHTML = achieveHTML();
      }
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
  renderAchieve();
})();
