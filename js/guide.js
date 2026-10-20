/* =========================================================
   文物精灵 · AI 旅游攻略 & 打卡路线
   ---------------------------------------------------------
   设计原则：
   1. 就算没网、没密钥，也要立刻排出一条能用的路线
      —— 本地「兴趣打分 + 最近邻路径」负责排，AI 只负责润色
   2. 生成是秒出的：先本地渲染，云端文案回来了再替换那几段话
   3. 地图点位复用 MAP_MARKS，底图复用 装饰/河北地图.webp
   ========================================================= */
(function () {
  "use strict";

  /* ---------- 词表 ---------- */
  var TASTES = [
    { k: "bronze", t: "青铜重器" },
    { k: "ceramic", t: "陶瓷" },
    { k: "jade", t: "玉器" },
    { k: "painting", t: "书画" },
    { k: "stone", t: "石雕古建" },
    { k: "gold", t: "金银工艺" }
  ];
  var WHOS = [
    { k: "solo", t: "一个人" },
    { k: "couple", t: "两个人" },
    { k: "kid", t: "带孩子" },
    { k: "elder", t: "陪长辈" }
  ];
  var PACES = [
    { k: "easy", t: "悠闲" },
    { k: "packed", t: "紧凑" }
  ];

  var KEY = "relic_guide_v1";

  /* ---------- 站点整理 ---------- */
  function buildStops() {
    var out = [];
    (typeof STATIONS === "undefined" ? [] : STATIONS).forEach(function (st) {
      var spirits = (st.spiritIds || []).map(function (id) {
        return (typeof SPIRITS !== "undefined" && SPIRITS[id]) ? SPIRITS[id] : null;
      }).filter(Boolean);
      var tags = [];
      spirits.forEach(function (s) {
        if (tags.indexOf(s.primary) < 0) tags.push(s.primary);
      });
      var mark = null;
      var marks = (typeof MAP_MARKS !== "undefined" && MAP_MARKS.stations) ? MAP_MARKS.stations : [];
      marks.forEach(function (m) { if (m.id === st.id) mark = m; });
      var museum = null;
      (typeof MUSEUMS === "undefined" ? [] : MUSEUMS).forEach(function (mu) {
        if (mu.station === st.id) museum = mu;
      });
      out.push({
        id: st.id, name: st.name, place: st.place, subtitle: st.subtitle,
        intro: st.intro, spirits: spirits, tags: tags, museum: museum,
        secret: !!st.secret,
        x: mark ? mark.x : 50, y: mark ? mark.y : 50
      });
    });
    return out;
  }

  var STOPS = buildStops();

  /* ---------- 工具 ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function uniq(a) {
    var o = [];
    a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); });
    return o;
  }
  /* 「河北 · 张家口」→张家口；「北京 · 中国国家博物馆」→北京 */
  function cityOf(st) {
    var segs = String((st && st.place) || "").split("·").map(function (x) { return x.trim(); })
      .filter(function (x) { return !!x; });
    if (!segs.length) return String((st && st.name) || "").replace(/^第.+站\s*·\s*/, "");
    if (segs.length === 1) return segs[0].replace(/(省|市|自治区)$/, "");
    var first = segs[0].replace(/(省|市|自治区)$/, "");
    if (/^(北京|天津|上海|重庆|香港|澳门)$/.test(first)) return first;
    return segs[segs.length - 1].replace(/市$/, "");
  }

  /* 地图坐标 → 公里（河北南北约 750km、东西约 620km，粗算足够排线） */
  function km(a, b) {
    var dx = (a.x - b.x) * 6.2, dy = (a.y - b.y) * 7.6;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function transit(d) {
    if (d < 6) return "步行 " + Math.max(6, Math.round(d * 12)) + " 分钟";
    if (d < 45) return "打车约 " + Math.round(d / 28 * 60) + " 分钟";
    if (d < 220) return "自驾约 " + Math.round(d / 75 * 60) + " 分钟";
    return "高铁约 " + Math.round(d / 190 * 60) + " 分钟";
  }

  /* ---------- 偏好 ---------- */
  function defaultPrefs() {
    return { days: 2, tastes: [], who: "couple", pace: "easy", start: "shijiazhuang" };
  }
  function loadPrefs() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultPrefs();
      var p = JSON.parse(raw);
      var d = defaultPrefs();
      return {
        days: Math.min(4, Math.max(1, +p.days || d.days)),
        tastes: Array.isArray(p.tastes) ? p.tastes : [],
        who: p.who || d.who,
        pace: p.pace || d.pace,
        start: p.start || d.start
      };
    } catch (e) { return defaultPrefs(); }
  }
  function savePrefs(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  }

  var P = loadPrefs();
  var PLAN = null;
  var ALT = 0;      /* 「换一条」的候选池偏移 */
  var AI_STATE = "idle";   /* idle | asking | done | off */

  /* ---------- 打分与排线 ---------- */
  function scoreOf(st, from) {
    var sc = 0;
    /* 兴趣命中：主力属性权重高 */
    if (P.tastes.length) {
      st.spirits.forEach(function (s) {
        if (P.tastes.indexOf(s.primary) >= 0) sc += 4;
        if (P.tastes.indexOf(s.secondary) >= 0) sc += 1.5;
      });
    } else {
      sc += st.spirits.length * 0.8;          /* 没选偏好：看的多的站靠前 */
    }
    /* 起点近一点，路上省时间 */
    sc -= km(from, st) * 0.035;
    /* 同行偏好 */
    if (P.who === "kid") {
      st.spirits.forEach(function (s) {
        if (s.secondary === "household" || s.secondary === "instrument" || s.secondary === "currency") sc += 1.2;
      });
      if (st.museum) sc += 1.5;
    }
    if (P.who === "elder") sc -= km(from, st) * 0.02;   /* 长辈：更要少奔波 */
    if (st.secret) sc -= 12;                             /* 隐藏站不进常规路线 */
    return sc;
  }

  /* alt：换一条时把候选池往后挪一层，排出来就是另一条 */
  function buildPlan(alt) {
    alt = alt || 0;
    var startStop = null;
    STOPS.forEach(function (s) { if (s.id === P.start) startStop = s; });
    if (!startStop) startStop = STOPS[0];

    var perDay = P.pace === "packed" ? 3 : 2;
    var need = Math.min(STOPS.length - 1, P.days * perDay);

    var scored = STOPS.filter(function (s) { return s.id !== P.start && !s.secret; })
      .map(function (s) { return { st: s, sc: scoreOf(s, startStop) }; })
      .sort(function (a, b) { return b.sc - a.sc; })
      .map(function (o) { return o.st; });

    var pool = scored.slice(alt, alt + Math.max(need, 2) + 2);
    if (pool.length < Math.min(need, scored.length)) pool = scored.slice(0, Math.max(need, 2) + 2);

    /* 最近邻串线：从起点出发，每次挑最近的一站 */
    var route = [];
    var cur = startStop;
    var left = pool.slice();
    while (route.length < need && left.length) {
      var bi = 0, bd = 1e9;
      left.forEach(function (s, i) {
        var d = km(cur, s);
        if (d < bd) { bd = d; bi = i; }
      });
      var nx = left.splice(bi, 1)[0];
      route.push({ st: nx, from: cur, dist: bd });
      cur = nx;
    }

    /* 切分成天；站数不够时留「机动日」，天数一定和用户选的一致 */
    var days = [];
    for (var i = 0; i < P.days; i++) {
      var chunk = route.slice(i * perDay, (i + 1) * perDay);
      days.push(chunk.length ? chunk : null);
    }
    var totalKm = route.reduce(function (a, r) { return a + r.dist; }, 0);
    return {
      start: startStop, days: days, dayCount: days.length,
      route: route, km: Math.round(totalKm), perDay: perDay
    };
  }

  /* ---------- 本地文案 ---------- */
  var FLAVOR = {
    bronze: "青铜的绿锈里，藏着礼乐与征伐。",
    ceramic: "瓷土走过一千三百度的窑火，才有了这身釉色。",
    jade: "玉的温润要贴着手看，才看得出那层光。",
    painting: "纸绢怕光，真迹难得露面，遇上就是运气。",
    stone: "石上的刀痕比纸上的墨更耐时间。",
    gold: "金银器最见手上功夫，一根错金线要走几十遍。",
    glass: "玻璃器是丝路上带来的稀罕物。",
    wood: "竹木牙角，雕的是手上分寸。",
    lacquer: "一层漆一道荫，器物是慢慢长出来的。",
    textile: "经纬之间，是当年的织机与配色。"
  };
  /* 个别器物的属性词不准，单独给一句 */
  var NAME_FLAVOR = {
    "沧州铁狮子": "铁铸的身骨，千年雨打风吹，怒吼的姿态一点没改。",
    "青釉仰覆莲花尊": "盖是花、腹是花，层层莲瓣一路开到足底。"
  };

  function localIntro(plan) {
    var names = [];
    plan.route.forEach(function (r) {
      var short = r.st.name.replace(/^第.+站\s*·\s*/, "");
      if (names.indexOf(short) < 0) names.push(short);
    });
    var tasteTxt = P.tastes.length
      ? P.tastes.map(function (k) {
          var t = null;
          TASTES.forEach(function (x) { if (x.k === k) t = x.t; });
          return t || k;
        }).join("、")
      : "综合馆藏";
    var whoTxt = "";
    WHOS.forEach(function (w) { if (w.k === P.who) whoTxt = w.t; });

    return "从" + cityOf(plan.start) + "出发，" + P.days + " 天串起 " +
      names.length + " 站，路程约 " + plan.km + " 公里。偏重" + tasteTxt +
      "，节奏" + (P.pace === "packed" ? "紧一些、一天多看一站" : "松一些、一天两站留出看展的时间") +
      (whoTxt ? "，适合" + whoTxt + "出行" : "") + "。";
  }

  function localTips(plan) {
    var t = [];
    t.push("多数省级、市级博物馆免费，凭身份证或提前在小程序预约；周一常闭馆，排行程时避开。");
    if (P.who === "kid") t.push("带孩子建议每站只主攻一个展厅，留 40 分钟在文创区或互动区收尾。");
    if (P.who === "elder") t.push("长辈同行：把爬楼、长距离步行的展线放在上午，午后安排坐下来的讲解或茶歇。");
    if (P.days >= 2) t.push("跨市移动尽量放在早上第一班高铁，到了正好赶上午开馆。");
    if (P.pace === "packed") t.push("紧凑节奏下，午飯就近解决，别为吃饭绕路。");
    else t.push("悠闲节奏下，每天留一段空白：街边旧书店、老城墙、当地小吃都算行程。");
    return t;
  }

  function stopLine(st) {
    var pick = st.spirits[0];
    if (!pick) return st.subtitle || "";
    var nm = /^「/.test(pick.name) ? pick.name : "「" + pick.name + "」";
    var byName = NAME_FLAVOR[pick.name];
    if (byName) return "看" + nm + "——" + byName;
    var f = FLAVOR[pick.primary] || "";
    return "看" + nm + "——" + f;
  }

  /* ---------- AI 润色 ---------- */
  function aiMessages(plan) {
    var brief = plan.route.map(function (r) {
      return {
        station: r.st.name.replace(/^第.+站\s*·\s*/, ""),
        place: r.st.place,
        relics: r.st.spirits.slice(0, 3).map(function (s) { return s.name; })
      };
    });
    var tasteTxt = P.tastes.length ? P.tastes.join(",") : "综合";
    return [
      {
        role: "system",
        content: "你是河北文博旅行策划，说话克制、具体，不堆形容词。只输出 JSON，不要代码块，不要解释。"
      },
      {
        role: "user",
        content:
          "行程：" + JSON.stringify(brief) +
          "。天数：" + P.days + "，节奏：" + (P.pace === "packed" ? "紧凑" : "悠闲") +
          "，同行：" + P.who + "，兴趣：" + tasteTxt + "。\n" +
          "请返回 JSON：{\"intro\":\"一段 80 字以内的路线总述，说清为什么这样排\",\"stops\":{站点名:\"一句话亮点，40 字内，写具体的一件器物或一个看点\"},\"tips\":[\"两条实用提醒\"]}"
      }
    ];
  }

  function parseJSON(text) {
    if (!text) return null;
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    var i = s.indexOf("{"), j = s.lastIndexOf("}");
    if (i < 0 || j <= i) return null;
    try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
  }

  async function aiPolish(plan) {
    AI_STATE = "asking";
    paintAiState();
    var msgs = aiMessages(plan);
    var text = "";

    /* 1) 本机小桥 */
    try {
      var bridgeOk = typeof IDENT !== "undefined" && IDENT.cloud === "on" &&
        !(IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false);
      if (bridgeOk && typeof identFetchCloud === "function" && typeof IDENT_CLOUD_API !== "undefined") {
        var r = await identFetchCloud(IDENT_CLOUD_API + "/api/chat",
          { messages: msgs, temperature: 0.8, max_tokens: 1200 }, 45000);
        if (r && r.ok && r.text) text = r.text;
      }
    } catch (e) {}

    /* 2) 网页直连（智谱免费 / 方舟） */
    if (!text && typeof identDirectKey === "function" && identDirectKey() &&
        typeof teaCloudDirect === "function") {
      try {
        var d = await teaCloudDirect(msgs, 45000);
        if (d && d.text) text = d.text;
      } catch (e) {}
    }

    var j = parseJSON(text);
    if (!j) { AI_STATE = "off"; paintAiState(); return; }

    PLAN.ai = {
      intro: j.intro || "",
      stops: j.stops || {},
      tips: Array.isArray(j.tips) ? j.tips.slice(0, 3) : []
    };
    AI_STATE = "done";
    paint();
  }

  /* ---------- 渲染：表单 ---------- */
  function chip(act, v, label, on) {
    return '<button type="button" class="gd-chip' + (on ? " on" : "") +
      '" data-act="' + act + '" data-v="' + esc(v) + '">' + esc(label) + "</button>";
  }

  function formHTML() {
    var startOpts = STOPS.filter(function (s) { return !s.secret; }).map(function (s) {
      return '<option value="' + s.id + '"' + (P.start === s.id ? " selected" : "") + ">" +
        esc(cityOf(s) || s.name) + "</option>";
    }).join("");

    return ''
      + '<div class="gd-form">'
      + '  <div class="gd-row">'
      + '    <span class="gd-label">几天</span>'
      + '    <div class="gd-chips">'
      + [1, 2, 3, 4].map(function (d) { return chip("days", d, d + " 天", P.days === d); }).join("")
      + '    </div>'
      + '  </div>'
      + '  <div class="gd-row">'
      + '    <span class="gd-label">爱看什么<small>可多选</small></span>'
      + '    <div class="gd-chips">'
      + TASTES.map(function (t) { return chip("taste", t.k, t.t, P.tastes.indexOf(t.k) >= 0); }).join("")
      + '    </div>'
      + '  </div>'
      + '  <div class="gd-row">'
      + '    <span class="gd-label">和谁去</span>'
      + '    <div class="gd-chips">'
      + WHOS.map(function (w) { return chip("who", w.k, w.t, P.who === w.k); }).join("")
      + '    </div>'
      + '  </div>'
      + '  <div class="gd-row">'
      + '    <span class="gd-label">节奏</span>'
      + '    <div class="gd-chips">'
      + PACES.map(function (p) { return chip("pace", p.k, p.t, P.pace === p.k); }).join("")
      + '    </div>'
      + '  </div>'
      + '  <div class="gd-row">'
      + '    <span class="gd-label">从哪里出发</span>'
      + '    <select class="gd-select" data-act="start">' + startOpts + "</select>"
      + '    <button type="button" class="btn gd-go" data-act="gen">排一条路线 →</button>'
      + '  </div>'
      + "</div>";
  }

  /* ---------- 渲染：路线图 ---------- */
  function mapHTML(plan) {
    var order = {};
    var pts = [];
    plan.route.forEach(function (r, i) {
      order[r.st.id] = i + 1;
      pts.push({ x: r.st.x, y: r.st.y, no: i + 1, st: r.st });
    });
    var startPt = { x: plan.start.x, y: plan.start.y };

    /* 折线：起点 → 依次各站 */
    var d = "M" + startPt.x + " " + startPt.y;
    pts.forEach(function (p) { d += " L" + p.x + " " + p.y; });

    var lines = '<path class="gd-path" d="' + d + '" fill="none"/>';

    var dots = '<span class="gd-dot start" style="left:' + startPt.x + "%;top:" + startPt.y +
      '%" title="' + esc(cityOf(plan.start)) + '"><i>起</i></span>';

    dots += pts.map(function (p) {
      return '<span class="gd-dot" style="left:' + p.x + "%;top:" + p.y + '%" title="' +
        esc(p.st.name.replace(/^第.+站\s*·\s*/, "")) + '"><i>' + p.no + "</i></span>";
    }).join("");

    /* 图下列站名，比密密麻麻贴在图上好读 */
    var legend = '<span class="st"><i>起</i>' + esc(cityOf(plan.start)) + "</span>"
      + pts.map(function (p) {
        return "<span><i>" + p.no + "</i>" + esc(p.st.name.replace(/^第.+站\s*·\s*/, "")) + "</span>";
      }).join("");

    return '<div class="gd-map-box">'
      + '<div class="gd-map">'
      + '<img src="装饰/河北地图.webp" alt="河北地图">'
      + '<svg class="gd-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' + lines + "</svg>"
      + dots
      + '<span class="gd-map-cap">' + pts.length + " 站 · 约 " + plan.km + " 公里</span>"
      + "</div>"
      + '<div class="gd-legend">' + legend + "</div>"
      + "</div>";
  }

  /* ---------- 渲染：每日 ---------- */
  function dayHTML(chunk, idx, plan) {
    var firstSt = chunk[0].st;
    var lastSt = chunk[chunk.length - 1].st;
    var cities = [];
    chunk.forEach(function (r) {
      var c = cityOf(r.st);
      if (cities.indexOf(c) < 0) cities.push(c);
    });
    var head = cities.length > 1
      ? cities.join(" → ") + "　一日两城"
      : cities[0] + " · " + (firstSt.subtitle || "");
    var rows = chunk.map(function (r, i) {
      var slot = i === 0 ? "上午" : (i === 1 ? "午后" : "傍晚");
      var time = i === 0 ? "09:30" : (i === 1 ? "13:30" : "16:00");
      var relics = r.st.spirits.slice(0, 2).map(function (s) { return s.name; }).join(" · ");
      var aiLine = plan.ai && plan.ai.stops ? plan.ai.stops[r.st.name.replace(/^第.+站\s*·\s*/, "")] : "";
      var line = aiLine || stopLine(r.st);
      /* 转场说明：真按上一站算，避免第二天又「从起点出发」 */
      var fromCity = cityOf(r.from);
      var move;
      if (i > 0) move = "由上一站 " + fromCity + " 过来 · " + transit(r.dist);
      else if (r.from.id === plan.start.id) move = "从 " + fromCity + " 出发 · " + transit(r.dist);
      else move = "由 " + fromCity + " 隔夜过来 · " + transit(r.dist);
      return ''
        + '<li class="gd-stop">'
        + '  <span class="gd-time">' + time + "</span>"
        + '  <div class="gd-stop-body">'
        + '    <div class="gd-stop-head"><b>' + esc(r.st.name.replace(/^第.+站\s*·\s*/, "")) + "</b>"
        + '      <span class="gd-slot">' + slot + "</span>"
        + '      <span class="gd-stay">' + (P.pace === "packed" ? "1.5" : "2.5") + " 小时</span>"
        + "    </div>"
        + '    <p class="gd-line">' + esc(line) + "</p>"
        + (relics ? '<p class="gd-relics">必看：' + esc(relics) + "</p>" : "")
        + (r.st.museum ? '<p class="gd-museum">馆：' + esc(r.st.museum.name) + "</p>" : "")
        + '<p class="gd-move">' + esc(move) + "</p>"
        + "  </div>"
        + "</li>";
    }).join("");

    var sleepCity = cityOf(lastSt);
    var nextCity = (plan.days[idx + 1] && plan.days[idx + 1][0]) ? cityOf(plan.days[idx + 1][0].st) : "";
    var isLast = idx === plan.days.length - 1;
    var sleepTxt = "落脚建议：" + sleepCity + "城区，"
      + (isLast
          ? "最后一晚把行李收好，返程票别买太早，留一顿早饭的时间。"
          : (nextCity && nextCity !== sleepCity
              ? "次日一早转 " + nextCity + "，别把出发时间排在 8 点前。"
              : "靠近次日第一站，省掉早高峰。"));

    return '<div class="gd-day">'
      + '<div class="gd-day-tag"><span>DAY</span><b>' + pad(idx + 1) + "</b></div>"
      + '<div class="gd-day-main">'
      + '  <h3>' + esc(head) + "</h3>"
      + '  <ol class="gd-stops">' + rows + "</ol>"
      + '  <p class="gd-sleep">' + esc(sleepTxt) + "</p>"
      + "</div></div>";
  }

  /* 机动日：站数不够分满天数时，留一天给人自己逛 */
  function restHTML(idx) {
    return '<div class="gd-day gd-day-rest">'
      + '<div class="gd-day-tag"><span>DAY</span><b>' + pad(idx + 1) + "</b></div>"
      + '<div class="gd-day-main">'
      + '  <h3>机动 · 就近再看一处</h3>'
      + '  <p class="gd-line">这一天先空着。可以回看最想看的那一站，也可以去落脚城市的古玩街、旧书店、城墙根转转；返程安排在午后更从容。</p>'
      + '  <p class="gd-sleep">落脚建议：仍住城区，返程当天留足 2 小时到车站。</p>'
      + "</div></div>";
  }

  /* ---------- 渲染：结果 ---------- */
  function titleOf(plan) {
    var counts = {};
    plan.route.forEach(function (r) {
      r.st.spirits.forEach(function (s) { counts[s.primary] = (counts[s.primary] || 0) + 1; });
    });
    var best = null;
    Object.keys(counts).forEach(function (k) { if (!best || counts[k] > counts[best]) best = k; });
    var tasteName = {
      bronze: "青铜", ceramic: "瓷", jade: "玉", painting: "丹青",
      stone: "石刻", gold: "金银", wood: "竹木", lacquer: "漆", textile: "织绣", glass: "琉璃"
    }[best] || "燕赵";
    return (plan.dayCount || P.days) + " 天 · " + tasteName + "与城";
  }

  function resultHTML(plan) {
    var dayCount = plan.dayCount || P.days;
    var nights = Math.max(0, dayCount - 1);
    var budgetLo = Math.round((nights * 260 + dayCount * 90 + plan.km * 0.42) / 50) * 50;
    var budgetHi = budgetLo + Math.round((nights * 180 + dayCount * 60) / 50) * 50;

    var stopsCount = plan.route.length;
    var tips = (plan.ai && plan.ai.tips && plan.ai.tips.length) ? plan.ai.tips : localTips(plan);
    var intro = (plan.ai && plan.ai.intro) ? plan.ai.intro : localIntro(plan);

    return ''
      + '<div class="gd-result">'
      + '  <div class="gd-head">'
      + '    <h2>' + esc(titleOf(plan)) + "</h2>"
      + '    <p class="gd-intro">' + esc(intro) + "</p>"
      + '    <div class="gd-facts">'
      + '      <span><b>' + stopsCount + "</b>站</span>"
      + '      <span><b>' + plan.km + "</b>公里</span>"
      + '      <span><b>' + nights + "</b>晚住宿</span>"
      + '      <span><b>¥' + budgetLo + "–" + budgetHi + "</b>每人</span>"
      + '      <span class="gd-ai-flag" id="gdAiFlag"></span>'
      + "    </div>"
      + "  </div>"
      + mapHTML(plan)
      + '<div class="gd-days">' + plan.days.map(function (c, i) {
          return c ? dayHTML(c, i, plan) : restHTML(i);
        }).join("") + "</div>"
      + '<div class="gd-tips"><h4>路上提醒</h4><ul>' +
        tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>"
      + '<div class="gd-acts">'
      + '  <button type="button" class="btn ghost" data-act="copy">复制行程</button>'
      + '  <button type="button" class="btn ghost" data-act="print">打印 / 存 PDF</button>'
      + '  <button type="button" class="btn gold" data-act="again">换一条 ↻</button>'
      + "  </div>"
      + "</div>";
  }

  function paintAiState() {
    var el = document.getElementById("gdAiFlag");
    if (!el) return;
    if (AI_STATE === "asking") el.textContent = "AI 正在润色行程…";
    else if (AI_STATE === "done") el.textContent = "✓ 已由 AI 润色";
    else if (AI_STATE === "off") el.textContent = "本机排线（未接云端）";
    else el.textContent = "";
  }

  /* ---------- 主渲染 ---------- */
  var root = null;

  function paint() {
    if (!root) return;
    var out = root.querySelector("#gdOut");
    if (!out) return;
    if (!PLAN) {
      out.innerHTML = '<div class="gd-empty">选好上面的偏好，点「排一条路线」，几秒就有一条能走的行程。</div>';
      return;
    }
    out.innerHTML = resultHTML(PLAN);
    paintAiState();
  }

  function generate(useAi) {
    PLAN = buildPlan(ALT);
    if (!PLAN.days.length) {
      PLAN = null;
      paint();
      return;
    }
    PLAN.ai = null;
    AI_STATE = "idle";
    savePrefs(P);
    paint();
    if (useAi !== false) aiPolish(PLAN);
  }

  function copyText() {
    if (!PLAN) return;
    var lines = [];
    lines.push("【" + titleOf(PLAN) + "】");
    lines.push((PLAN.ai && PLAN.ai.intro) ? PLAN.ai.intro : localIntro(PLAN));
    lines.push("共 " + PLAN.route.length + " 站 · 约 " + PLAN.km + " 公里");
    PLAN.days.forEach(function (c, i) {
      lines.push("");
      lines.push("DAY " + pad(i + 1));
      if (!c) { lines.push("  机动日 · 就近再看一处，返程安排在午后"); return; }
      c.forEach(function (r, k) {
        var slot = k === 0 ? "上午" : (k === 1 ? "午后" : "傍晚");
        var relics = r.st.spirits.slice(0, 2).map(function (s) { return s.name; }).join("、");
        var aiLine = PLAN.ai && PLAN.ai.stops ? PLAN.ai.stops[r.st.name.replace(/^第.+站\s*·\s*/, "")] : "";
        lines.push("  " + slot + " · " + r.st.name.replace(/^第.+站\s*·\s*/, "") +
          "（" + transit(r.dist) + "）" + (relics ? "｜必看：" + relics : ""));
        lines.push("      " + (aiLine || stopLine(r.st)));
      });
    });
    lines.push("");
    lines.push("—— 由文物精灵 · AI 旅游攻略生成");
    var txt = lines.join("\n");

    var ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    if (navigator.clipboard) { try { navigator.clipboard.writeText(txt); } catch (e) {} }

    var btn = root.querySelector('[data-act="copy"]');
    if (btn) {
      btn.textContent = ok ? "✓ 已复制" : "请手动复制";
      setTimeout(function () { btn.textContent = "复制行程"; }, 1800);
    }
  }

  /* ---------- 事件 ---------- */
  function bind(el) {
    el.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act]");
      if (!t || t.tagName === "SELECT") return;
      var act = t.dataset.act;

      /* 改偏好即时重排（本地算，不花云端额度）；按钮才是「带 AI 润色」那一次 */
      if (act === "days") { P.days = +t.dataset.v; renderForm(el); ALT = 0; generate(false); }
      else if (act === "taste") {
        var k = t.dataset.v, i = P.tastes.indexOf(k);
        if (i >= 0) P.tastes.splice(i, 1); else P.tastes.push(k);
        renderForm(el); ALT = 0; generate(false);
      }
      else if (act === "who") { P.who = t.dataset.v; renderForm(el); ALT = 0; generate(false); }
      else if (act === "pace") { P.pace = t.dataset.v; renderForm(el); ALT = 0; generate(false); }
      else if (act === "gen") { ALT = 0; generate(true); }
      else if (act === "again") { ALT = (ALT + 1) % 4; generate(true); }
      else if (act === "copy") copyText();
      else if (act === "print") window.print();
    });

    el.addEventListener("change", function (e) {
      var s = e.target.closest('[data-act="start"]');
      if (s) { P.start = s.value; ALT = 0; generate(false); }
    });
  }

  function renderForm(el) {
    var f = el.querySelector("#gdForm");
    if (f) f.innerHTML = formHTML();
  }

  function paintShell(host) {
    root = host;
    host.innerHTML = ''
      + '<div class="gd-wrap">'
      + '  <div class="page-head">'
      + '    <h2>AI 旅游攻略</h2>'
      + '    <p>说清几天、爱看什么、和谁去——从河北十三站里排一条走得通的文博打卡路线：每天几点到哪、看哪几件、怎么转场，都写明白。</p>'
      + '  </div>'
      + '  <div class="gd-form-wrap" id="gdForm">' + formHTML() + "</div>"
      + '  <div id="gdOut"></div>'
      + "</div>";
    bind(host);
    /* 首屏直接给一条，省得空着 */
    generate(true);
  }

  /* 挂到 #app 里：页面自己接管这一屏 */
  function mountInto(app) {
    var box = app.querySelector(".ri-guide");
    if (!box) {
      app.innerHTML = "";
      box = document.createElement("div");
      box.className = "ri-guide";
      app.appendChild(box);
    }
    if (box.dataset.mounted === "1") { root = box; return; }
    box.dataset.mounted = "1";
    paintShell(box);
  }

  function onRoute() {
    if (location.hash.indexOf("#/guide") !== 0) return;
    var app = document.getElementById("app");
    if (app) mountInto(app);
  }

  window.RelicGuide = { mount: mountInto, route: onRoute };

  /* 路由接管：hashchange / 首次进入 / 站内重新 render 都算 */
  window.addEventListener("hashchange", onRoute);
  var prevRender = window.render;
  if (typeof prevRender === "function") {
    window.render = function () {
      var r = prevRender.apply(this, arguments);
      onRoute();
      return r;
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onRoute);
  } else {
    onRoute();
  }
})();
