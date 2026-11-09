/* ============================================================
   AI 微电影 · 六种工艺，一件文物
   选一件好画的精灵 → 从 17 种动态工艺里选 6 种 →
   连成一部带旁白的短片：每段先出一张统一标识卡（NO.xx / 工艺名 /
   两行说明 / 题材·工序），再放这件工艺真的在动的那 5 秒。
   全部由影棚的渲染器逐帧画出来，站里不存一个视频文件。
   ============================================================ */
(function () {
  "use strict";

  var W = 1280, H = 720;
  var COVER = 1.5, ART = 4.9, INTRO = 3.2, OUTRO = 4.4;
  var PICK = 6;

  /* 好画的 12 件：器形简单、剪影干净，六种工艺都撑得住 */
  var EASY = [
    ["wuzhuqian", "方孔圆钱，两笔就成"],
    ["yubi", "一枚圆璧，一圈就够"],
    ["wadang", "圆形瓦当，字在中心"],
    ["pianjiangjunyin", "方印，直线为主"],
    ["yuzhulong", "玉猪龙，一个勾就合上"],
    ["qinghuaci", "梅瓶，一条弧线立住"],
    ["jituiping", "鸡腿瓶，上下两个转"],
    ["mudanguan", "牡丹纹罐，圆肩直腹"],
    ["tongjue", "铜爵，三足两柱"],
    ["tongge", "铜戈，一条长线带刃"],
    ["taolou", "陶楼，全是横竖"],
    ["changxin", "长信宫灯，跪坐持灯的剪影"]
  ];

  var F = {
    cv: null, ctx: null, plan: [], total: 0,
    playing: false, raf: 0, t0: 0, cur: null, lastVoice: "",
    spiritId: "", segs: [], ready: false, grain: null, mute: false,
    built: false
  };

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function seg(p, a, b) { if (b <= a) return p >= b ? 1 : 0; return clamp((p - a) / (b - a), 0, 1); }
  function easeOut(x) { return 1 - Math.pow(1 - x, 2.2); }

  function styles() {
    return (window.STUDIO_STYLES || []).filter(function (s) { return s.key !== "chalk" || true; });
  }
  function styleOf(key) {
    var L = styles();
    for (var i = 0; i < L.length; i++) if (L[i].key === key) return L[i];
    return null;
  }
  function spiritOf(id) {
    return (window.SPIRITS && window.SPIRITS[id]) || {};
  }

  /* ---------------- 页面 ---------------- */
  window.viewFilm = function () {
    var L = styles();
    var spCards = EASY.map(function (e, i) {
      var s = spiritOf(e[0]);
      var img = (window.sdSpriteURL ? sdSpriteURL(e[0]) : ("精灵/透明/" + e[0] + ".webp"));
      return '' +
        '<button class="fm-spt' + (i === 0 ? " on" : "") + '" data-id="' + e[0] + '">' +
          '<span class="fm-spt-pic"><img src="' + img + '" alt="" loading="lazy"></span>' +
          '<b>' + (s.name || e[0]) + '</b>' +
          '<em>' + e[1] + '</em>' +
        '</button>';
    }).join("");

    var stChips = L.map(function (s) {
      return '<button class="fm-chip" data-key="' + s.key + '">' +
        '<i>' + s.no + '</i><b>' + s.cn + '</b><em>' + s.en + '</em>' +
        '<span class="fm-tick">✓</span></button>';
    }).join("");

    return '' +
    '<div class="fm-wrap">' +
      '<header class="fm-head">' +
        '<div class="fm-kick">AI 微电影 · MICRO FILM</div>' +
        '<h2>六种工艺，一件文物</h2>' +
        '<p>挑一件好画的精灵，再从 17 种动态工艺里选 6 种。点开始放映，它会自己演一部带旁白的短片 —— ' +
          '每一段都从一张统一标识卡起头，接着是这件工艺真的在动的 5 秒。</p>' +
      '</header>' +

      '<section class="fm-step">' +
        '<div class="fm-snum"><b>01</b><span>选精灵</span><em>器形越简单，六种工艺画出来越好看</em></div>' +
        '<div class="fm-spirits" id="fmSpirits">' + spCards + '</div>' +
      '</section>' +

      '<section class="fm-step">' +
        '<div class="fm-snum"><b>02</b><span>选 6 种工艺</span><em>按画面差别挑，别连着选三个同色的</em>' +
          '<div class="fm-count"><b id="fmCount">0</b> / 6</div>' +
        '</div>' +
        '<div class="fm-styles" id="fmStyles">' + stChips + '</div>' +
        '<div class="fm-row">' +
          '<button class="fm-mini" id="fmDice">帮我配一组</button>' +
          '<button class="fm-mini" id="fmClear">清空重选</button>' +
          '<label class="fm-switch"><input type="checkbox" id="fmMute"> 关掉旁白</label>' +
        '</div>' +
      '</section>' +

      '<section class="fm-stage">' +
        '<canvas id="fmCanvas" width="1280" height="720"></canvas>' +
        '<div class="fm-bar"><i id="fmProg"></i></div>' +
        '<div class="fm-ticks" id="fmTicks"></div>' +
        '<div class="fm-ctl">' +
          '<button class="fm-play" id="fmPlay">▶ 开始放映</button>' +
          '<button class="fm-mini" id="fmStop" disabled>停止</button>' +
          '<span class="fm-tip" id="fmTip">还要选 6 种工艺</span>' +
        '</div>' +
      '</section>' +

      '<p class="fm-note">' +
        '说明：这不是剪辑，是逐帧程序化渲染 —— 六段画面全部由 canvas 现算，旁白由站内的 edge-tts 现场合成。' +
        '同一件文物换个工艺，等于换一套算法，不需要重拍。' +
      '</p>' +
    '</div>';
  };

  /* ---------------- 装页面 ---------------- */
  window.filmInit = function () {
    F.cv = $("fmCanvas");
    if (!F.cv) return;
    F.ctx = F.cv.getContext("2d");
    F.spiritId = EASY[0][0];
    F.segs = [];
    F.playing = false;
    F.cur = null; F.built = false;
    F.grain = null;
    if (window.sdFilmAttach) sdFilmAttach(F.cv);

    /* 01 选精灵 */
    var spBox = $("fmSpirits");
    if (spBox) {
      spBox.addEventListener("click", function (ev) {
        var b = ev.target.closest(".fm-spt");
        if (!b) return;
        spBox.querySelectorAll(".fm-spt").forEach(function (x) { x.classList.toggle("on", x === b); });
        F.spiritId = b.dataset.id;
        F.built = false;
        stop(true);
        paintIdle();
        syncTip();
      });
    }

    /* 02 选工艺 */
    var stBox = $("fmStyles");
    if (stBox) {
      stBox.addEventListener("click", function (ev) {
        var b = ev.target.closest(".fm-chip");
        if (!b) return;
        var on = b.classList.contains("on");
        if (!on && F.segs.length >= PICK) { flash(b); return; }
        b.classList.toggle("on", !on);
        F.segs = Array.prototype.map.call(
          stBox.querySelectorAll(".fm-chip.on"), function (x) { return x.dataset.key; });
        F.built = false;
        syncCount();
        paintIdle();
      });
    }
    var dice = $("fmDice");
    if (dice) dice.addEventListener("click", function () { randomPick(); });
    var clr = $("fmClear");
    if (clr) clr.addEventListener("click", function () {
      stBox.querySelectorAll(".fm-chip").forEach(function (x) { x.classList.remove("on"); });
      F.segs = []; F.built = false; syncCount(); paintIdle();
    });
    var mute = $("fmMute");
    if (mute) mute.addEventListener("change", function () {
      F.mute = mute.checked;
      if (F.mute && window.Voice) Voice.stop();
    });

    var play = $("fmPlay");
    if (play) play.addEventListener("click", function () {
      if (F.playing) { stop(); return; }
      start();
    });
    var stp = $("fmStop");
    if (stp) stp.addEventListener("click", function () { stop(); });

    syncCount();
    paintIdle();
    syncTip();
  };

  function flash(b) {
    b.classList.add("nope");
    setTimeout(function () { b.classList.remove("nope"); }, 320);
  }

  function syncCount() {
    var c = $("fmCount");
    if (c) c.textContent = F.segs.length;
    var play = $("fmPlay");
    if (play) play.disabled = F.segs.length !== PICK;
    syncTip();
  }

  function syncTip() {
    var tip = $("fmTip");
    if (!tip) return;
    if (F.playing) { tip.textContent = "正在放映…"; return; }
    var n = F.segs.length;
    tip.textContent = n === PICK ? "可以开始了" : (n === 0 ? "还要选 6 种工艺" : "再选 " + (PICK - n) + " 种");
  }

  function randomPick() {
    var L = styles().slice();
    /* 先按色系分桶，再从不同桶里取，避免六段撞色 */
    var used = {}, out = [];
    while (out.length < PICK && L.length) {
      var i = Math.floor(Math.random() * L.length);
      var k = L[i].key;
      L.splice(i, 1);
      var fam = k === "chalk" || k === "sand" ? "a" : (k === "ink" || k === "rubbing" ? "b" :
                (k === "oil" || k === "foil" || k === "brick" ? "c" :
                (k === "riso" || k === "crayon" || k === "papercut" ? "d" :
                (k === "stitch" || k === "cloisonne" || k === "cobalt" ? "e" : "f"))));
      if (used[fam] && out.length < PICK - 1) continue;
      used[fam] = 1;
      out.push(k);
    }
    F.segs = out;
    var box = $("fmStyles");
    if (box) box.querySelectorAll(".fm-chip").forEach(function (x) {
      x.classList.toggle("on", out.indexOf(x.dataset.key) >= 0);
    });
    F.built = false;
    syncCount();
    paintIdle();
  }

  /* ---------------- 时间线 ---------------- */
  function buildPlan() {
    var items = [{ type: "intro", dur: INTRO }];
    F.segs.forEach(function (k) {
      items.push({ type: "cover", key: k, dur: COVER });
      items.push({ type: "art", key: k, dur: ART });
    });
    items.push({ type: "outro", dur: OUTRO });
    var t = 0;
    items.forEach(function (it) { it.at = t; t += it.dur; });
    F.total = t;
    return items;
  }

  function at(t) {
    for (var i = 0; i < F.plan.length; i++) {
      var it = F.plan[i];
      if (t < it.at + it.dur || i === F.plan.length - 1) return { it: it, lt: t - it.at, i: i };
    }
    return { it: F.plan[0], lt: 0, i: 0 };
  }

  function start() {
    if (F.playing || F.segs.length !== PICK) return;
    F.plan = buildPlan();
    var tip = $("fmTip");
    var play = $("fmPlay");
    if (play) { play.disabled = true; play.textContent = "准备中…"; }

    var go = function () {
      if (play) { play.disabled = false; play.textContent = "暂停"; }
      var stp = $("fmStop");
      if (stp) stp.disabled = false;
      F.playing = true; F.cur = null; F.t0 = performance.now();
      prefetchVoice();
      drawTicks();
      F.raf = requestAnimationFrame(loop);
      syncTip();
    };

    if (F.built) { go(); return; }
    if (tip) tip.textContent = "正在算 6 段工艺…";
    sdFilmBuild(F.spiritId, F.segs, function (n, all, key) {
      var s = styleOf(key);
      if (tip) tip.textContent = "正在算 " + n + "/" + all + " 段：" + (s ? s.cn : key);
    }, function () {
      F.built = true;
      go();
    });
  }

  function stop(silent) {
    F.playing = false;
    if (F.raf) cancelAnimationFrame(F.raf);
    F.raf = 0;
    if (window.Voice) Voice.stop();
    var play = $("fmPlay"), stp = $("fmStop");
    if (play) { play.disabled = F.segs.length !== PICK; play.textContent = "▶ 开始放映"; }
    if (stp) stp.disabled = true;
    var prog = $("fmProg");
    if (prog) prog.style.width = "0%";
    if (!silent) { paintIdle(); syncTip(); }
  }

  function finish() {
    F.playing = false;
    if (F.raf) cancelAnimationFrame(F.raf);
    F.raf = 0;
    var play = $("fmPlay"), stp = $("fmStop");
    if (play) { play.disabled = false; play.textContent = "↻ 再放一次"; }
    if (stp) stp.disabled = true;
    var prog = $("fmProg");
    if (prog) prog.style.width = "100%";
    var tip = $("fmTip");
    if (tip) tip.textContent = "放完了。换一件精灵或换一组工艺，就是另一部片子";
  }

  function loop(now) {
    if (!F.playing) return;
    if (!document.getElementById("fmCanvas")) { stop(true); return; }
    var t = (now - F.t0) / 1000;
    if (t >= F.total) { drawAt(F.total - 0.001); finish(); return; }
    drawAt(t);
    var prog = $("fmProg");
    if (prog) prog.style.width = (t / F.total * 100).toFixed(2) + "%";
    F.raf = requestAnimationFrame(loop);
  }

  function drawAt(t) {
    var r = at(t);
    var it = r.it, lt = clamp(r.lt, 0, it.dur), p = lt / it.dur;

    if (F.cur !== r.i) {
      F.cur = r.i;
      if (it.type === "cover" || it.type === "art") sdFilmUse(it.key);
      speak(it, p);
    }
    if (it.type === "intro") drawIntro(p);
    else if (it.type === "outro") drawOutro(p);
    else if (it.type === "cover") sdFilmCover(p);
    else sdFilmArt(lt);
  }

  /* ---------------- 旁白 ---------------- */
  function lines() {
    var s = spiritOf(F.spiritId);
    var out = [];
    out.push({ t: "《" + (s.name || "文物") + "》。六种工艺，把它重新画一遍。", o: {} });
    F.plan.forEach(function (it) {
      if (it.type === "cover") {
        var st = styleOf(it.key);
        out.push({ t: (st ? st.cn : "") + "。", o: {} });
      } else if (it.type === "art") {
        var st2 = styleOf(it.key);
        out.push({ t: st2 ? st2.line1 : "", o: {} });
      }
    });
    out.push({ t: "六种工艺，同一个" + (s.name || "它") + "。文物精灵。", o: {} });
    return out;
  }

  function prefetchVoice() {
    if (F.mute || !window.Voice || !Voice.prefetch) return;
    lines().forEach(function (l) { try { Voice.prefetch(l.t, {}); } catch (e) {} });
  }

  function speak(it, p) {
    if (F.mute || !window.Voice) return;
    var txt = "";
    if (it.type === "intro") txt = lines()[0].t;
    else if (it.type === "cover") { var s = styleOf(it.key); txt = (s ? s.cn : "") + "。"; }
    else if (it.type === "art") { var s2 = styleOf(it.key); txt = s2 ? s2.line1 : ""; }
    else if (it.type === "outro") { var sp = spiritOf(F.spiritId); txt = "六种工艺，同一个" + (sp.name || "它") + "。文物精灵。"; }
    if (!txt || txt === F.lastVoice) return;
    F.lastVoice = txt;
    try { Voice.say(txt, {}); } catch (e) {}
  }

  /* ---------------- 片头 / 片尾（不走工艺渲染器，用同一套字体排出来） ---------------- */
  function grain() {
    if (F.grain) return F.grain;
    var c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    var x = c.getContext("2d");
    var d = x.createImageData(256, 256);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = 180 + Math.random() * 75;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = Math.random() * 26;
    }
    x.putImageData(d, 0, 0);
    F.grain = c;
    return c;
  }

  function plate(x, p) {
    x.fillStyle = "#14100c"; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * .5, H * .42, 60, W * .5, H * .5, W * .75);
    g.addColorStop(0, "rgba(78,62,44,.55)"); g.addColorStop(1, "rgba(12,10,8,1)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalAlpha = .5;
    x.drawImage(grain(), 0, 0, W, H);
    x.globalAlpha = 1;
  }

  function kicker(x, txt, y, color, size, gap, align) {
    x.font = "700 " + size + "px " + '"PingFang SC","Microsoft YaHei",sans-serif';
    x.fillStyle = color;
    x.textAlign = "left";
    var w = 0, i;
    var chars = txt.split("");
    x.font = "700 " + size + "px " + '"PingFang SC","Microsoft YaHei",sans-serif';
    for (i = 0; i < chars.length; i++) w += x.measureText(chars[i]).width + gap;
    var cx = align === "center" ? (W - w + gap) * .5 : align === "right" ? W - 64 - w : 64;
    for (i = 0; i < chars.length; i++) {
      x.fillText(chars[i], cx, y);
      cx += x.measureText(chars[i]).width + gap;
    }
    return w;
  }

  function drawIntro(p) {
    var x = F.ctx;
    var s = spiritOf(F.spiritId);
    plate(x, p);

    kicker(x, "AI 微电影 · SIX CRAFTS", 96, "rgba(214,178,110,.9)", 15, 5, "center");

    var a1 = seg(p, .05, .34), a2 = seg(p, .18, .5), a3 = seg(p, .42, .74);
    var e = easeOut(a1);
    x.textAlign = "center";
    x.font = '900 96px "Songti SC","SimSun","STSong",serif';
    x.fillStyle = "#f3ece0";
    x.globalAlpha = e;
    x.fillText("《" + (s.name || "文物") + "》", W * .5, 300 + (1 - e) * 18);
    x.globalAlpha = 1;

    if (a2 > 0) {
      x.globalAlpha = a2 * .86;
      x.font = '500 24px "PingFang SC","Microsoft YaHei",sans-serif';
      x.fillStyle = "#cfc3ae";
      x.fillText("六种工艺，把它重新画一遍", W * .5, 356);
      x.globalAlpha = 1;
    }

    if (a3 > 0) {
      /* 六种工艺的名字，一行排开，像片头的演员表 */
      var names = F.segs.map(function (k) { var st = styleOf(k); return st ? st.cn : k; });
      var txt = names.join("　·　");
      x.globalAlpha = a3 * .96;
      x.font = '700 21px "PingFang SC","Microsoft YaHei",sans-serif';
      x.fillStyle = "#e6c98a";
      x.fillText(txt, W * .5, 470);
      x.globalAlpha = 1;
    }

    x.globalAlpha = .5;
    x.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif';
    x.fillStyle = "#9a8f7d";
    kicker(x, "文物精灵 · RELIC SOUL", H - 54, "#9a8f7d", 13, 4.2, "center");
    x.globalAlpha = 1;
  }

  function drawOutro(p) {
    var x = F.ctx;
    var s = spiritOf(F.spiritId);
    plate(x, p);

    kicker(x, "END", 118, "rgba(214,178,110,.85)", 15, 6, "center");

    var a1 = seg(p, .06, .4), a2 = seg(p, .3, .66);
    var e = easeOut(a1);
    x.textAlign = "center";
    x.font = '900 72px "Songti SC","SimSun","STSong",serif';
    x.fillStyle = "#f3ece0";
    x.globalAlpha = e;
    x.fillText("六种工艺，一件文物", W * .5, 322 + (1 - e) * 16);
    x.globalAlpha = 1;

    if (a2 > 0) {
      x.globalAlpha = a2 * .9;
      x.font = '500 22px "PingFang SC","Microsoft YaHei",sans-serif';
      x.fillStyle = "#cfc3ae";
      x.fillText((s.name || "") + (s.era ? "　·　" + s.era : ""), W * .5, 384);
      x.globalAlpha = a2 * .55;
      x.font = '500 16px "PingFang SC","Microsoft YaHei",sans-serif';
      x.fillStyle = "#a99b86";
      x.fillText("画面由 canvas 逐帧现算 · 旁白由站内语音现场合成 · 站里不存一个视频文件", W * .5, 436);
      x.globalAlpha = 1;
    }

    kicker(x, "文物精灵 · RELIC SOUL", H - 54, "#9a8f7d", 13, 4.2, "center");
  }

  /* 还没开始放的时候，画布上给一张"待映"卡 */
  function paintIdle() {
    if (!F.ctx || F.playing) return;
    var x = F.ctx;
    var s = spiritOf(F.spiritId);
    plate(x, 1);
    x.textAlign = "center";
    x.font = '900 54px "Songti SC","SimSun","STSong",serif';
    x.fillStyle = "rgba(243,236,224,.92)";
    x.fillText((s.name || "选一件精灵"), W * .5, 330);
    x.font = '500 18px "PingFang SC","Microsoft YaHei",sans-serif';
    x.fillStyle = "rgba(207,195,174,.7)";
    var n = F.segs.length;
    x.fillText(n === PICK ? "已选 6 种工艺，点下面的按钮开始放映"
             : (n ? "已选 " + n + " / 6 种工艺" : "先在下面选 6 种工艺"), W * .5, 382);
    kicker(x, "STANDBY · 待映", 96, "rgba(214,178,110,.75)", 14, 5, "center");
  }

  /* 验收/导片用：把片子拨到第 t 秒（会顺带把这一段要用到的工艺板子建好） */
  window.fmSeek = function (t) {
    if (!F.segs.length) return false;
    F.plan = buildPlan();
    var r = at(clamp(t, 0, F.total - 0.001));
    if (r.it.type !== "intro" && r.it.type !== "outro") sdFilmUse(r.it.key);
    F.cur = null;
    drawAt(clamp(t, 0, F.total - 0.001));
    return true;
  };
  window.fmState = function () {
    return { total: F.total, segs: F.segs.slice(), spirit: F.spiritId, built: F.built, playing: F.playing };
  };

  function drawTicks() {
    var box = $("fmTicks");
    if (!box) return;
    var html = "";
    F.plan.forEach(function (it) {
      if (it.type !== "cover") return;
      var s = styleOf(it.key);
      html += '<i style="left:' + (it.at / F.total * 100).toFixed(2) + '%"><b>' +
              (s ? s.no : "") + '</b></i>';
    });
    box.innerHTML = html;
  }
})();
