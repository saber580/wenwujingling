/* =========================================================
   文物精灵 · 全国分省地图（首页地图卡）
   ---------------------------------------------------------
   底图：CHINA_MAP（js/china-map-data.js，省级行政边界，含河北/台湾/海南/南海诸岛）
   点位：MAP_MARKS.stations 的 lng/lat，用 CHINA_MAP.project() 投影进 viewBox
   两级视图：
     cn —— 全国：11 个全国站出标签，河北只留入口
     hb —— 放大到河北：11 个城市逐个出标签
   图钉 + 路牌：形制照 Uiverse.io by SnyDeTreves / white-newt-65「Map card」
     https://uiverse.io/SnyDeTreves/white-newt-65
     图钉 = 圆头（径向渐变）+ 锥形针脚 + 落点椭圆影；
     标签 = 原件的 .map-city__sign 路牌（实底牌面 + 浅色描边 + data-icon 图标），
     悬停时图标照原件的 grow 关键帧从地里长出来、牌面微微抬起。
   标签排布：候选位置（8 方向 × 4 距离）+ 牌面矩形碰撞检测，
             排不下就藏标签留圆点 —— 桌面、手机都不会糊成一团
   尺寸：--k = 当前 viewBox 宽 ÷ 卡片宽（1 屏幕像素 = k 个 viewBox 单位），
         字号、圆点、线宽都乘 k，缩放与换设备时屏幕观感恒定；
         牌面内部几何一律按「屏幕像素」定义，再由 scale(k) 换算
   ========================================================= */
(function () {
  "use strict";

  /* china-map-data.js 用 const 声明，是全局词法变量而非 window 属性 */
  var MAP = (typeof CHINA_MAP !== "undefined") ? CHINA_MAP
    : (typeof window !== "undefined" ? window.CHINA_MAP : null);
  if (!MAP) return;

  var VB = MAP.vb;                              /* [1000, 979] 全幅 */
  /* 主图用完整版图（含南海诸岛）——地图必须画全，不裁切 */
  var MAIN = [0, 0, VB[0], VB[1]];
  var HZ = MAP.hb || [640, 262, 120, 152];      /* 河北包围盒 x,y,w,h */
  var ZPAD = 0.06;

  /* 有站点的省（adcode）——用于给省区加一层淡底 */
  var PROV_HAS = {
    "110000": 1, "130000": 1, "210000": 1, "310000": 1, "320000": 1,
    "410000": 1, "420000": 1, "430000": 1, "510000": 1, "610000": 1
  };

  /* ---------- 站点 ---------- */
  function shortName(st) {
    if (typeof stationShort === "function") return stationShort(st);
    var n = String(st.name || "");
    return (n.split("·").pop() || n).trim();
  }

  function stations() {
    if (typeof MAP_MARKS === "undefined" || !MAP_MARKS.stations) return [];
    if (typeof STATIONS === "undefined") return [];
    var out = [];
    MAP_MARKS.stations.forEach(function (m) {
      var st = null;
      for (var i = 0; i < STATIONS.length; i++) {
        if (STATIONS[i].id === m.id) { st = STATIONS[i]; break; }
      }
      if (!st) return;
      var p = (m.lng != null && m.lat != null)
        ? MAP.project(m.lng, m.lat)
        : [m.x / 100 * VB[0], m.y / 100 * VB[1]];
      var ids = st.spiritIds || [];
      var got = 0;
      ids.forEach(function (id) {
        if (typeof isCaptured === "function" && isCaptured(id)) got++;
      });
      out.push({
        id: st.id, name: SHORT[st.id] || shortName(st), place: st.place || "",
        x: p[0], y: p[1], got: got, total: ids.length,
        done: ids.length > 0 && got >= ids.length,
        hb: /河北/.test(st.place || "") || /河北/.test(String(st.name || ""))
      });
    });
    return out;
  }

  /* 地图上的简称：全称在图上太长，挤成一团 */
  var SHORT = {
    gugong: "故宫", guobo: "国博", shaanxi: "陕历博", henan: "河南博物院",
    nanjing: "南京博物院", shanghai: "上海博物馆", suzhou: "苏州博物馆",
    hubei: "湖北省博", hunan: "湖南博物院", sanxingdui: "三星堆", liaoning: "辽宁省博"
  };

  /* 路牌图标：原件 .map-city__sign 的 data-icon（每城一个 emoji）。
     全部取自该站真实镇馆器物，不编来历：
     沧州铁狮子、保定长信宫灯、张家口红山玉猪龙、石家庄中山王陵、
     邢台商代铜爵、承德外八庙、唐山北方瓷都、秦皇岛渤海碣石、
     廊坊长明灯楼、邯郸赵都骑射、衡水青瓷莲花尊 */
  var ICON = {
    cangzhou: "🦁", baoding: "🏮", zhangjiakou: "🐉", shijiazhuang: "🏯",
    xingtai: "🍶", chengde: "🛕", tangshan: "🏺", qinhuangdao: "🌊",
    langfang: "🕯", handan: "🏹", hengshui: "🪷",
    gugong: "🏛", guobo: "⚱", shaanxi: "🐫", henan: "🦉", nanjing: "🎋",
    shanghai: "🥂", suzhou: "🖌", hubei: "🔔", hunan: "🪶",
    sanxingdui: "👁", liaoning: "🐎"
  };

  /* 首选方向（屏幕像素）：[dx, dy, text-anchor]
     长三角三站（苏/沪/宁）挤在一小片，京津也是一个小口袋，
     所以这几站的首选偏移拉得比别处远，给图钉留出位置 */
  var OFF = {
    /* 京津是河北怀里的小口袋，标签往外拉，别糊在河北的红底上 */
    guobo:      [ 20,  15, "start"],
    gugong:     [-20, -19, "end"],
    shanghai:   [ 15,  14, "start"],
    suzhou:     [ 13, -19, "start"],
    nanjing:    [-13, -15, "end"],
    liaoning:   [ 9,   9, "start"],
    shaanxi:    [-8,  10, "end"],
    henan:      [ 8,  11, "start"],
    hubei:      [ 9,  11, "start"],
    hunan:      [ 9,  11, "start"],
    sanxingdui: [-9,  -9, "end"]
  };
  var OFF_HB = {
    zhangjiakou:  [-7, -12, "end"],
    chengde:      [ 8, -10, "start"],
    qinhuangdao:  [ 9,  -7, "start"],
    tangshan:     [ 9,   5, "start"],
    langfang:     [-8,  -8, "end"],
    baoding:      [-8,   3, "end"],
    cangzhou:     [ 9,   7, "start"],
    hengshui:     [-8,  10, "end"],
    shijiazhuang: [-8,   3, "end"],
    xingtai:      [-8,   4, "end"],
    handan:       [ 9,   4, "start"]
  };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function N(n) { return Math.round(n * 10) / 10; }

  /* ---------- 候选位置 ---------- */
  function candidates(base) {
    var out = [base];
    var dirs = [
      [1, 0, "start"], [-1, 0, "end"], [0, -1, "middle"], [0, 1, "middle"],
      [1, -1, "start"], [-1, -1, "end"], [1, 1, "start"], [-1, 1, "end"]
    ];
    [10, 21, 34, 50].forEach(function (r) {
      dirs.forEach(function (d) {
        out.push([d[2] === "middle" ? 0 : d[0] * r, d[1] * r, d[2]]);
      });
    });
    return out;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var list = stations();
    if (!list.length) return "";

    var provHTML = MAP.provinces.map(function (p) {
      var cls = "cmp-p";
      if (p.c === "130000") cls += " cmp-p-home";
      else if (PROV_HAS[p.c]) cls += " cmp-p-st";
      return '<path class="' + cls + '" d="' + p.d + '" data-ad="' + p.c +
        '"><title>' + esc(p.n) + "</title></path>";
    }).join("");

    var pins = [], cnTxt = [], hbTxt = [];
    list.forEach(function (s) {
      /* 图钉造型照 Uiverse SnyDeTreves/white-newt-65「Map card」：
         圆头（径向渐变高光）+ 锥形针脚 + 落点椭圆影，针尖扎在站点坐标上。
         内部尺寸按「屏幕像素」定义，再由 sizeDots() 乘 k 换算成 viewBox 单位，
         所以全国视图和河北放大视图里图钉一样大。 */
      pins.push('<g class="cmp-pin' + (s.hb ? " is-hb" : " is-out") + '" data-id="' + esc(s.id) +
        '" data-x="' + N(s.x) + '" data-y="' + N(s.y) + '">' +
        '<circle class="cmp-hit" cx="' + N(s.x) + '" cy="' + N(s.y) + '" r="11"/>' +
        '<g class="cmp-pin-ink" transform="translate(' + N(s.x) + ',' + N(s.y) + ') scale(1)">' +
          '<ellipse class="cmp-pin-shadow" cx="0" cy="1" rx="3.2" ry="0.95"/>' +
          '<path class="cmp-pin-needle" d="M-1.8 0.6 L1.8 0.6 L0 -10.8 Z"/>' +
          '<circle class="cmp-pin-head' + (s.done ? " is-done" : "") + '" cx="0" cy="-16.3" r="5.6"/>' +
          '<circle class="cmp-pin-shine" cx="-2.1" cy="-18.3" r="1.8"/>' +
        "</g>" +
        "</g>");

      /* 全国视图只标河北以外的站；河北 11 城留到放大视图里标 */
      var cls = s.hb ? "only-hb" : "only-cn";
      var off = (s.hb ? OFF_HB[s.id] : OFF[s.id]) || [0, -10, "middle"];
      /* 标签 = 原件 .map-city__label > .map-city__sign 的形制：
         牌面（实底 + 浅色描边 + 投影）+ data-icon 图标 + 站名。
         位置与缩放在 placeLabels 里按 k 换算后写进 .cmp-sign 的 transform */
      var html = '<g class="cmp-cnl ' + cls + (s.done ? " is-done" : "") +
        '" data-id="' + esc(s.id) +
        '" data-x="' + N(s.x) + '" data-y="' + N(s.y) +
        '" data-dx="' + off[0] + '" data-dy="' + off[1] + '" data-ta="' + off[2] + '">' +
        '<line class="cmp-lead"/>' +
        '<g class="cmp-sign"><g class="cmp-sign-in">' +
          '<rect class="cmp-sign-sh" rx="2.4" ry="2.4"/>' +
          '<rect class="cmp-sign-bg" rx="2.4" ry="2.4"/>' +
          '<text class="cmp-ico" dominant-baseline="central">' + esc(ICON[s.id] || "🏛") + "</text>" +
          '<text class="cmp-txt" dominant-baseline="central">' + esc(s.name) + "</text>" +
        "</g></g></g>";
      if (s.hb) hbTxt.push(html); else cnTxt.push(html);
    });

    /* 南海诸岛：完整版图已画出，这里加一行标注，避免读者以为是空白 */
    var sea = "";
    (function () {
      var p1 = MAP.project(113.2, 8.6);
      sea = '<text class="cmp-sea" x="' + N(p1[0]) + '" y="' + N(p1[1]) +
        '" text-anchor="middle">南海诸岛</text>';
    })();

    return '' +
      '<div class="cmap" data-zoom="cn">' +
        '<svg class="cmap-svg" viewBox="' + MAIN.join(" ") +
          '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="全国分省地图">' +
          "<defs>" +
            '<radialGradient id="cmpPinGrad" cx="34%" cy="26%" r="80%">' +
              '<stop offset="0%" stop-color="#FFBCA4"/>' +
              '<stop offset="42%" stop-color="#D24A31"/>' +
              '<stop offset="100%" stop-color="#8B2114"/>' +
            "</radialGradient>" +
            '<radialGradient id="cmpPinGradDone" cx="34%" cy="26%" r="80%">' +
              '<stop offset="0%" stop-color="#A8E4C2"/>' +
              '<stop offset="42%" stop-color="#47966B"/>' +
              '<stop offset="100%" stop-color="#1E5133"/>' +
            "</radialGradient>" +
            '<g id="cmpAll">' + provHTML + "</g>" +
          "</defs>" +
          '<g class="cmp-prov"><use href="#cmpAll"/></g>' +
          '<rect class="cmp-hbhit" x="' + HZ[0] + '" y="' + HZ[1] + '" width="' + HZ[2] +
            '" height="' + HZ[3] + '" data-act="zoom"><title>河北 · 点开放大</title></rect>' +
          '<g class="cmp-pins">' + pins.join("") + "</g>" +
          /* 路牌压在针脚之上：牌面遮住半个图钉不叫遮挡，是「指示牌立在图钉旁」 */
          '<g class="cmp-lbl">' + cnTxt.join("") + hbTxt.join("") + "</g>" +
          sea +
        "</svg>" +
        '<button type="button" class="cmap-back" data-act="back">← 全国</button>' +
      "</div>";
  }

  /* ---------- 交互 ---------- */
  function bind(root) {
    var box = root && root.querySelector(".cmap");
    if (!box || box.dataset.bound === "1") return;
    box.dataset.bound = "1";

    var svg = box.querySelector(".cmap-svg");
    var cur = MAIN.slice();
    var raf = null;

    function cw() { return Math.max(1, box.clientWidth); }
    function ch() { return Math.max(1, box.clientHeight); }
    function kOf(vbw) { return vbw / cw(); }

    /* 圆点、命中区半径按屏幕像素恒定；图钉用 scale(k) 换算，保证大小不随缩放变 */
    function sizeDots(k) {
      box.querySelectorAll(".cmp-pin").forEach(function (g) {
        var x = g.getAttribute("data-x"), y = g.getAttribute("data-y");
        var ink = g.querySelector(".cmp-pin-ink");
        if (ink && x != null && y != null) {
          ink.setAttribute("transform", "translate(" + x + "," + y + ") scale(" + k.toFixed(4) + ")");
        }
      });
      box.querySelectorAll(".cmp-hit").forEach(function (c) {
        c.setAttribute("r", (11 * k).toFixed(2));
      });
    }

    /* 全部用 viewBox 单位比较；pad 由调用方按 k 换算 */
    function overlaps(a, list, P) {
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (a.x - P < b.x + b.w && a.x + a.w + P > b.x &&
            a.y - P < b.y + b.h && a.y + a.h + P > b.y) return true;
      }
      return false;
    }

    /* ---------- 路牌几何 ----------
       牌面内部尺寸一律按「屏幕像素」写死（和原件一样），
       再靠 .cmp-sign 的 scale(k) 换算成 viewBox 单位 ——
       全国视图和河北放大视图里，牌面上的字一样大 */
    var PADX = 5.5, GAP = 3.5, PLATEH = 18, ICOW = 12;

    function paintSign(g, w, compact) {
      var sh = g.querySelector(".cmp-sign-sh");
      var bg = g.querySelector(".cmp-sign-bg");
      var ico = g.querySelector(".cmp-ico");
      var txt = g.querySelector(".cmp-txt");
      var mid = PLATEH / 2 + 0.7;                 /* 视觉居中：字面略低于几何中线 */
      [bg, sh].forEach(function (r) {
        if (!r) return;
        r.setAttribute("width", N(w));
        r.setAttribute("height", PLATEH);
      });
      if (bg) { bg.setAttribute("x", 0); bg.setAttribute("y", 0); }
      if (sh) { sh.setAttribute("x", 0); sh.setAttribute("y", 1.2); }
      if (ico) { ico.setAttribute("x", PADX); ico.setAttribute("y", mid); }
      if (txt) {
        txt.setAttribute("x", PADX + (compact ? 0 : ICOW + GAP));
        txt.setAttribute("y", mid);
        txt.setAttribute("text-anchor", "start");
      }
    }

    /* 量一次就记住（字宽不会变）；缩放末尾再量一次，防止字体晚到把宽度量小了。
       窄屏（手机）底图缩得比牌面还小，收掉图标换 15px 宽度，多留住两个标签 */
    function signW(g, force) {
      var compact = box.classList.contains("cmp-compact");
      if (g._w && !force && g._cw === compact) return g._w;
      var txt = g.querySelector(".cmp-txt");
      var tw = 0;
      try { tw = txt.getComputedTextLength(); } catch (e) { tw = 0; }
      if (!tw) tw = (txt.textContent || "").length * 10.6;
      g._w = PADX * 2 + (compact ? 0 : ICOW + GAP) + tw;
      g._cw = compact;
      paintSign(g, g._w, compact);
      return g._w;
    }

    /* 先用首选方向摆一遍（便宜），再做碰撞避让（贵，只在动画结束后跑） */
    function placeLabels(k, resolve, vb) {
      var zoom = box.dataset.zoom || "cn";
      box.classList.toggle("cmp-compact", cw() < 520);
      var want = zoom === "hb" ? "only-hb" : "only-cn";
      var groups = [];
      box.querySelectorAll(".cmp-cnl").forEach(function (g) {
        g.style.display = "";
        if (g.classList.contains(want)) groups.push(g);
        else g.style.display = "none";
      });

      /* 标签不许出画：viewBox 之外会被裁掉 */
      var edge = 2;
      var bx0 = vb[0] + edge, by0 = vb[1] + edge;
      var bx1 = vb[0] + vb[2] - edge, by1 = vb[1] + vb[3] - edge;

      /* 图钉也当障碍物：标签压在自己的针脚或圆头上都会糊成一团。
         图钉是竖着的（球顶在落点上方约 21 屏幕像素），障碍框按整颗算 */
      var dots = [];
      box.querySelectorAll(".cmp-pin").forEach(function (pin) {
        /* 当前视野里看不见的点不参与避让 */
        if (zoom === "hb" && pin.classList.contains("is-out")) return;
        if (zoom === "cn" && pin.classList.contains("is-hb")) return;
        var px = +pin.getAttribute("data-x"), py = +pin.getAttribute("data-y");
        if (isNaN(px) || isNaN(py)) return;
        var dr = 4.6 * k;
        dots.push({
          id: pin.getAttribute("data-id"),
          x: px - dr, y: py - 22 * k,
          w: dr * 2, h: 23 * k
        });
      });

      var placed = [];
      groups.forEach(function (g) {
        var x = +g.getAttribute("data-x"), y = +g.getAttribute("data-y");
        var own = g.getAttribute("data-id");
        var base = [+g.getAttribute("data-dx"), +g.getAttribute("data-dy"), g.getAttribute("data-ta")];
        var sign = g.querySelector(".cmp-sign"), line = g.querySelector(".cmp-lead");
        var list = resolve ? candidates(base) : [base];
        var sw = signW(g, resolve);
        var wv = sw * k, hv = PLATEH * k;           /* 牌面宽高（viewBox 单位） */
        var win = null, winRect = null;

        /* 别人的圆点要躲，自己的圆点不必（标签本来就是给它做注脚的） */
        var avoid = placed;
        if (resolve) {
          avoid = placed.slice();
          for (var d = 0; d < dots.length; d++) {
            if (dots[d].id !== own) avoid.push(dots[d]);
          }
        }

        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          /* 原件里 data-ta 决定牌子往哪边长：start 左对齐在锚点、end 右对齐、middle 居中 */
          var ax = x + c[0] * k, ay = y + c[1] * k;
          var left = c[2] === "start" ? ax : (c[2] === "end" ? ax - wv : ax - wv / 2);
          var top = ay - hv / 2;
          var rect = { x: left, y: top, w: wv, h: hv };
          if (!resolve) { win = c; winRect = rect; break; }

          var inside = rect.x >= bx0 && rect.y >= by0 &&
                       rect.x + rect.w <= bx1 && rect.y + rect.h <= by1;
          if (inside && !overlaps(rect, avoid, 1.6 * k)) { win = c; winRect = rect; break; }
        }

        if (!win) { g.style.display = "none"; return; }
        if (winRect) placed.push(winRect);

        if (sign) {
          sign.setAttribute("transform", "translate(" + N(winRect.x) + "," + N(winRect.y) +
            ") scale(" + k.toFixed(4) + ")");
        }
        if (line) {
          line.setAttribute("x1", x); line.setAttribute("y1", y);
          line.setAttribute("x2", N(winRect.x + winRect.w / 2));
          line.setAttribute("y2", N(winRect.y + winRect.h / 2));
          line.style.opacity = (Math.abs(win[0]) + Math.abs(win[1])) > 12 ? 0.45 : 0;
        }
      });
    }

    function layout(vb, resolve) {
      var k = kOf(vb[2]);
      svg.setAttribute("viewBox", vb[0] + " " + vb[1] + " " + vb[2] + " " + vb[3]);
      box.style.setProperty("--k", k.toFixed(4));
      sizeDots(k);
      placeLabels(k, !!resolve, vb);
    }

    function target(which) {
      if (which === "hb") {
        var pad = Math.max(HZ[2], HZ[3]) * ZPAD;
        var w = HZ[2] + pad * 2, h = HZ[3] + pad * 2;
        var cx = HZ[0] + HZ[2] / 2, cy = HZ[1] + HZ[3] / 2;
        var ratio = ch() / cw();
        if (w / h < 1 / ratio) w = h / ratio; else h = w * ratio;
        return [cx - w / 2, cy - h / 2, w, h];
      }
      return MAIN.slice();
    }

    function zoomTo(which) {
      box.dataset.zoom = which;
      var card = box.closest ? box.closest(".rh-map-card") : null;
      if (card) card.dataset.zoom = which;
      var t = target(which);
      if (raf) cancelAnimationFrame(raf);
      var f = cur.slice(), t0 = performance.now(), T = 420;
      function step(now) {
        var p = Math.min(1, (now - t0) / T);
        var e = 1 - Math.pow(1 - p, 3);
        cur = [
          f[0] + (t[0] - f[0]) * e, f[1] + (t[1] - f[1]) * e,
          f[2] + (t[2] - f[2]) * e, f[3] + (t[3] - f[3]) * e
        ];
        layout(cur, false);
        if (p < 1) raf = requestAnimationFrame(step);
        else layout(cur, true);
      }
      raf = requestAnimationFrame(step);
    }

    /* 悬停联动：原件里 hover 的是同一个 .map-city，
       这里图钉和路牌是分开的两组，靠 data-id 互相点亮（牌面提亮 + 图标重播 grow） */
    function setHot(id) {
      box.querySelectorAll(".cmp-cnl.is-hot").forEach(function (g) {
        if (g.getAttribute("data-id") !== id) g.classList.remove("is-hot");
      });
      if (!id) return;
      box.querySelectorAll('.cmp-cnl[data-id="' + id.replace(/"/g, '\\"') + '"]')
        .forEach(function (g) { g.classList.add("is-hot"); });
    }
    root.addEventListener("mouseover", function (e) {
      var el = e.target.closest ? e.target.closest("[data-id]") : null;
      setHot(el ? el.getAttribute("data-id") : "");
    });
    root.addEventListener("mouseleave", function () { setHot(""); });

    root.addEventListener("click", function (e) {
      var act = e.target.closest("[data-act]");
      if (act) {
        e.preventDefault(); e.stopPropagation();
        if (act.getAttribute("data-act") === "zoom") zoomTo("hb");
        else zoomTo("cn");
        return;
      }
      var pin = e.target.closest("[data-id]");
      if (pin) {
        e.preventDefault();
        location.hash = "#/station/" + pin.getAttribute("data-id");
      }
    });

    if (window.ResizeObserver) {
      var lastW = 0;
      new ResizeObserver(function () {
        if (Math.abs(box.clientWidth - lastW) < 1) return;
        lastW = box.clientWidth;
        layout(cur, true);
      }).observe(box);
    } else {
      window.addEventListener("resize", function () { layout(cur, true); });
    }

    layout(cur, true);
  }

  window.ChinaMap = { render: render, bind: bind };
})();
