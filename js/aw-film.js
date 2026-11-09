/* ============================================================
   AI 微电影 · 六种工艺，一件文物
   选一件好画的精灵 → 从 10 种动态工艺里选 6 种 →
   连成一部带旁白的短片：每段先出一张统一标识卡（NO.xx / 工艺名 /
   两行说明 / 题材·工序），再放这件工艺真的在动的那 5 秒。
   全部由影棚的渲染器逐帧画出来，站里不存一个视频文件。
   ============================================================ */
(function () {
  "use strict";

  var W = 1280, H = 720;
  var COVER = 1.5, ART = 4.9, INTRO = 3.2, OUTRO = 4.4;
  var PICK = 6;

  /* 初始七友：进场就陪着你的七件老朋友，器形简单、剪影干净，六种工艺都撑得住 */
  var EASY = [
    ["wuzhuqian", "方孔圆钱，两笔就成"],
    ["qinghuaci", "梅瓶，一条弧线立住"],
    ["yuzhui", "一块美石，一勾一圆"],
    ["jinqi", "金器，光一照就亮"],
    ["yinqi", "银器，清冷一道光"],
    ["xuanzhi", "宣纸，摊平就成"],
    ["xiangqi", "象棋，圆扁一枚子"]
  ];

  var F = {
    cv: null, ctx: null, plan: [], total: 0,
    playing: false, raf: 0, t0: 0, cur: null, lastVoice: "",
    spiritId: "", segs: [], ready: false, grain: null, mute: false,
    built: false
  };

  /* 导出用的状态 */
  var EX = { on: false, raf: 0, rec: null, chunks: [], actx: null, dest: null,
             gain: null, src: null, t0: 0, bufs: [], mime: "", limit: 0, discard: false };

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
        '<p>挑一件好画的精灵，再从 10 种动态工艺里选 6 种。点开始放映，它会自己演一部带旁白的短片 —— ' +
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
          '<button class="fm-mini fm-save" id="fmSave" disabled>⬇ 存成视频</button>' +
          '<button class="fm-mini" id="fmPoster" disabled>存海报</button>' +
          '<span class="fm-tip" id="fmTip">还要选 6 种工艺</span>' +
        '</div>' +
      '</section>' +

      '<p class="fm-note">' +
        '说明：这不是剪辑，是逐帧程序化渲染 —— 六段画面全部由 canvas 现算，旁白由站内的 edge-tts 现场合成。' +
        '同一件文物换个工艺，等于换一套算法，不需要重拍。' +
        '「存成视频」会把整部片子连同旁白录成一个文件带走（浏览器能录 mp4 就录 mp4，否则 webm），' +
        '录制时请让这一页留在前台。' +
      '</p>' +
    '</div>';
  };

  /* ---------------- 装页面 ---------------- */
  var REDONE = false;

  /* 直接打开 #/film（分享链接、刷新）时，aw-studio.js 排在 app.js 后面：
     这一页会先被画成空壳（0 个工艺 chip）。等工艺表到齐，把这一页重画一次。
     —— 必须自己重画 #app，不能只叫 render()：那时空壳已经落进 DOM 了。 */
  function redrawFilm() {
    if (REDONE) return;
    REDONE = true;
    var host = document.getElementById("app");
    if (!host) return;
    host.innerHTML = viewFilm();
    window.filmInit();
  }

  window.filmInit = function () {
    F.cv = $("fmCanvas");
    if (!F.cv) return;

    if (!(window.STUDIO_STYLES || []).length) {
      var tries = 0;
      (function waitStyles() {
        if ((window.STUDIO_STYLES || []).length) { redrawFilm(); return; }
        if (++tries > 80) return;
        setTimeout(waitStyles, 100);
      })();
      return;
    }
    /* 工艺表有了，但这页是空壳（渲染时机比脚本早）→ 重画 */
    if (!document.querySelectorAll(".fm-chip").length) { redrawFilm(); return; }
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
    var sv = $("fmSave");
    if (sv) sv.addEventListener("click", function () {
      fmExport().then(null, function (e) {
        var tip = $("fmTip");
        if (tip) tip.textContent = "没能导出：" + (e && e.message ? e.message : "未知原因");
      });
    });
    var ps = $("fmPoster");
    if (ps) ps.addEventListener("click", function () { savePoster(); });

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
    var sv = $("fmSave"), ps = $("fmPoster");
    if (sv) sv.disabled = F.segs.length !== PICK || EX.on;
    if (ps) ps.disabled = F.segs.length !== PICK;
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
      var fam = k === "chalk" || k === "sand" || k === "stained" || k === "foil" ? "a" :
                (k === "wood" || k === "crayon" || k === "riso" ? "b" :
                (k === "stitch" || k === "popup" ? "c" : "d"));
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
    if (EX.on) abortExport();
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
      if (EX.on) playBuf(r.i); else speak(it, p);
    }
    paintScene(it, lt, p);
  }

  function paintScene(it, lt, p) {
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
    return { total: F.total, segs: F.segs.slice(), spirit: F.spiritId, built: F.built,
             playing: F.playing, exporting: EX.on, mime: EX.mime,
             chunks: EX.chunks.length, bytes: EX.chunks.reduce(function (n, b) { return n + b.size; }, 0) };
  };

  /* ================= 导出 =================
     不另做编码：canvas 现画，用 captureStream 取帧，旁白走 WebAudio 混进同一条流，
     MediaRecorder 直接录。录制是实时的，46 秒就是 46 秒，这样时间轴才和画面严丝合缝。 */

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function stamp() {
    var d = new Date();
    return "" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
           "-" + pad2(d.getHours()) + pad2(d.getMinutes());
  }
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60);
  }

  function recMime() {
    if (!window.MediaRecorder) return "";
    /* 首选 H.264 的 mp4（声轨是 opus，Chrome/VLC/浏览器都认）。
       别贪 vp9+mp4a 那条：实测 Chrome 只录到 2 秒、且丢声轨，是个坑。 */
    var cands = ["video/mp4;codecs=avc1.42E01E", "video/mp4",
                 "video/webm;codecs=vp9,opus", "video/webm;codecs=vp9",
                 "video/webm;codecs=vp8", "video/webm"];
    for (var i = 0; i < cands.length; i++) {
      try { if (MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (e) {}
    }
    return "";
  }

  /* 语音：直接问站内的 /api/tts 要 mp3，解码成 AudioBuffer，录制时按段落开火 */
  function ttsBytes(text) {
    return fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, scene: "dialog" })
    }).then(function (r) {
      if (!r.ok) throw new Error("tts " + r.status);
      return r.arrayBuffer();
    });
  }

  function voiceBuffers(actx) {
    var jobs = lines().map(function (l) {
      return ttsBytes(l.t).then(function (ab) {
        return new Promise(function (res) {
          try {
            actx.decodeAudioData(ab, function (b) { res(b); }, function () { res(null); });
          } catch (e) { res(null); }
        });
      })["catch"](function () { return null; });
    });
    return Promise.all(jobs);
  }

  function playBuf(i) {
    if (!EX.actx || !EX.gain) return;
    if (EX.src) { try { EX.src.stop(); } catch (e) {} EX.src = null; }
    var b = EX.bufs[i];
    if (!b) return;
    var s = EX.actx.createBufferSource();
    s.buffer = b;
    s.connect(EX.gain);
    s.start();
    EX.src = s;
  }

  function exLoop(now) {
    if (!EX.on) return;
    if (!document.getElementById("fmCanvas")) { abortExport(); return; }
    var t = (now - EX.t0) / 1000;
    var lim = EX.limit > 0 ? Math.min(EX.limit, F.total) : F.total;
    if (t >= lim) {
      drawAt(Math.min(F.total - 0.001, lim - 0.001));
      endExport();
      return;
    }
    drawAt(t);
    var prog = $("fmProg");
    if (prog) prog.style.width = (t / F.total * 100).toFixed(2) + "%";
    var tip = $("fmTip");
    if (tip) tip.textContent = "正在录制 " + fmt(t) + " / " + fmt(F.total) + "，别切走这一页";
    EX.raf = requestAnimationFrame(exLoop);
  }

  function endExport() {
    if (!EX.on) return;
    EX.on = false;
    if (EX.raf) cancelAnimationFrame(EX.raf);
    EX.raf = 0;
    if (EX.src) { try { EX.src.stop(); } catch (e) {} EX.src = null; }
    try { if (EX.rec && EX.rec.state !== "inactive") EX.rec.stop(); } catch (e) {}
  }

  function abortExport() {
    if (!EX.on) return;
    EX.discard = true;
    endExport();
    var tip = $("fmTip");
    if (tip) tip.textContent = "已经停下，没录成片";
  }

  function finishExport() {
    var mime = EX.mime || "video/webm";
    var blob = new Blob(EX.chunks, { type: mime.split(";")[0] });
    EX.chunks = [];
    var wasDiscard = EX.discard;
    EX.discard = false;
    if (EX.actx) { try { EX.actx.close(); } catch (e) {} }
    EX.actx = null; EX.dest = null; EX.gain = null; EX.bufs = [];

    var sv = $("fmSave"), ps = $("fmPoster"), stp = $("fmStop");
    if (sv) { sv.disabled = false; sv.textContent = "⬇ 存成视频"; }
    if (stp) stp.disabled = true;
    if (ps) ps.disabled = F.segs.length !== PICK;
    var tip = $("fmTip");

    if (wasDiscard || !blob.size || blob.size < 4096) {
      if (tip) tip.textContent = wasDiscard ? "已经停下，没录成片" : "录制失败：录到的内容太小，换个浏览器试试";
      return;
    }
    var ext = mime.indexOf("mp4") >= 0 ? "mp4" : "webm";
    var sp = spiritOf(F.spiritId);
    var name = "文物精灵-六种工艺-" + (sp.name || F.spiritId) + "-" + stamp() + "." + ext;
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); }, 100);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    if (tip) tip.textContent = "已存下 " + name + "（" + (blob.size / 1048576).toFixed(1) + " MB）";
  }

  /* 导出整部片子：返回 Promise，方便自测与自动化 */
  window.fmExport = function (opt) {
    opt = opt || {};
    if (EX.on) return Promise.reject(new Error("正在导出中"));
    if (F.segs.length !== PICK) return Promise.reject(new Error("先选满 6 种工艺"));
    if (!window.MediaRecorder || !F.cv.captureStream) return Promise.reject(new Error("这个浏览器不支持录制"));

    F.plan = buildPlan();
    var tip = $("fmTip"), sv = $("fmSave");

    /* 音频上下文必须在这一拍（用户刚点下去）同步建出来并 resume：
       等到 Promise 里再建，浏览器认为不是用户手势，上下文会一直 suspended，
       录出来的片子就没人声了。 */
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!EX.actx) EX.actx = new AC();
      if (EX.actx.state === "suspended") { try { EX.actx.resume(); } catch (e) {} }
    }

    stop(true);            /* 如果正在放映，先掐掉，别两套时钟打架 */
    F.plan = buildPlan();

    var ready = F.built ? Promise.resolve() : new Promise(function (res) {
      if (tip) tip.textContent = "正在算 6 段工艺…";
      sdFilmBuild(F.spiritId, F.segs, function (n, all, key) {
        var s2 = styleOf(key);
        if (tip) tip.textContent = "正在算 " + n + "/" + all + " 段：" + (s2 ? s2.cn : key);
      }, function () { F.built = true; res(); });
    });

    return ready.then(function () {
      if (tip) tip.textContent = "正在准备旁白…";
      var actx = EX.actx;
      if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
      if (!actx || F.mute) return [];
      return voiceBuffers(actx);
    }).then(function (bufs) {
      EX.bufs = bufs || [];
      /* resume() 是异步的：多等最多 0.9 秒确认上下文真的跑起来了再挂声轨 */
      return new Promise(function (res) {
        var t0 = Date.now();
        (function chk() {
          if (!EX.actx || EX.actx.state === "running" || Date.now() - t0 > 900) return res();
          try { EX.actx.resume(); } catch (e) {}
          setTimeout(chk, 80);
        })();
      });
    }).then(function () {
      EX.mime = recMime();
      EX.chunks = [];
      EX.discard = false;
      EX.limit = opt.seconds || 0;

      var stream = F.cv.captureStream(30);
      var audioOK = !!(EX.actx && EX.actx.state === "running");
      if (audioOK) {
        EX.gain = EX.actx.createGain();
        EX.gain.gain.value = 1;
        EX.dest = EX.actx.createMediaStreamDestination();
        EX.gain.connect(EX.dest);
        try { EX.gain.connect(EX.actx.destination); } catch (e) {}
        var at = EX.dest.stream.getAudioTracks();
        for (var i = 0; i < at.length; i++) stream.addTrack(at[i]);
      }

      try {
        EX.rec = EX.mime
          ? new MediaRecorder(stream, { mimeType: EX.mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 128000 })
          : new MediaRecorder(stream);
      } catch (e) {
        EX.rec = new MediaRecorder(stream);
      }
      EX.rec.ondataavailable = function (e) { if (e.data && e.data.size) EX.chunks.push(e.data); };
      EX.rec.onstop = finishExport;

      F.cur = null;
      EX.on = true;
      if (sv) { sv.disabled = true; sv.textContent = "录制中…"; }
      var stp = $("fmStop");
      if (stp) stp.disabled = false;
      if (tip) tip.textContent = "正在录制 00:00 / " + fmt(F.total);
      EX.rec.start(250);
      EX.t0 = performance.now();
      drawTicks();
      EX.raf = requestAnimationFrame(exLoop);
      if (!audioOK && !F.mute) {
        if (tip) tip.textContent = "浏览器没放开声音，这段会录成无声版（先点一下页面再试）";
      }
      return true;
    });
  };

  /* 存海报：把当前这一帧原样存成 png */
  function savePoster() {
    if (!F.cv) return;
    var sp = spiritOf(F.spiritId);
    var name = "文物精灵-微电影-" + (sp.name || F.spiritId) + "-" + stamp() + ".png";
    try {
      F.cv.toBlob(function (b) {
        if (!b) return;
        var url = URL.createObjectURL(b);
        var a = document.createElement("a");
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 30000);
        var tip = $("fmTip");
        if (tip) tip.textContent = "已存下 " + name;
      }, "image/png");
    } catch (e) {
      var tip2 = $("fmTip");
      if (tip2) tip2.textContent = "存海报失败：" + (e.message || "画布被保护");
    }
  }

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
