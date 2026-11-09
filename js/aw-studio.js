/* ================= 精灵影棚 · 一件文物十七道工艺（#/studio） =================
   用户从抖音看到「全代码生成视频」那套玩法：每一帧都是时间的纯函数，
   无头浏览器逐帧截图再合成。这里把它搬进浏览器——真·实时渲染，不预渲染 mp4。

   一个精灵 = 一张透明立绘（精灵/透明/*.webp，384×384 RGBA）
   一道工艺 = 一组 build（把立绘加工成"版"）+ draw（按时间画这一帧）
   换精灵只换版，换工艺只换算法，所以 74 × 11 全部现算，不用存任何视频。

   性能纪律：所有重活（像素扫描、网点、笔触、砖块）都在 build 里做一次并缓存，
   draw 每帧只做「贴版 + 遮罩生长 + 光扫 + 颗粒」，30fps 才跑得动手机。    */
(function () {
  "use strict";

  var W = 1280, H = 720;      /* 画布内部像素：导出也是这个尺寸 */
  var PLATE = 640;            /* "版"的画布尺寸（立绘 512 放大到此） */
  var DUR = 5.0;              /* 一段五秒，循环 */

  var SERIF = '"Songti SC","SimSun","STSong",serif';
  var KAI = '"Kaiti SC","KaiTi","STKaiti",serif';
  var HEI = '"PingFang SC","Microsoft YaHei","Source Han Sans SC","Heiti SC",sans-serif';

  /* ---------------- 基础工具 ---------------- */
  function off(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function C(c) { return c.getContext("2d"); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeBack(t) { var s = 1.7; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
  function seg(p, a, b) { return clamp((p - a) / (b - a || 1e-6), 0, 1); }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rr(x, px, py, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function shade(c, k) {
    var r = c[0], g = c[1], b = c[2];
    if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
    return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
  }
  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  /* 颗粒底：全站统一手感，只生成一次 */
  var _grain = null;
  function grain() {
    if (_grain) return _grain;
    var n = 256, c = off(n, n), x = C(c), d = x.createImageData(n, n), r = mulberry(7);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = 176 + (r() * 79) | 0;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0); _grain = c; return c;
  }
  /* 细纤维：纸/布/木纹都靠它 */
  var _fiber = null;
  function fiber() {
    if (_fiber) return _fiber;
    var w = 512, h = 512, c = off(w, h), x = C(c), r = mulberry(23);
    x.fillStyle = "#808080"; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      var y = r() * h, len = 30 + r() * 200;
      x.strokeStyle = "rgba(" + (r() > .5 ? 255 : 0) + "," + (r() > .5 ? 255 : 0) + ",220," + (0.02 + r() * 0.05) + ")";
      x.lineWidth = 0.6 + r() * 1.6;
      x.beginPath(); x.moveTo(r() * w, y); x.bezierCurveTo(r() * w, y + 8, r() * w, y - 8, r() * w + len, y + (r() - .5) * 6); x.stroke();
    }
    _fiber = c; return c;
  }

  /* 文字：canvas 没有 letter-spacing，手动排 */
  function spaced(x, s, px, py, gap) {
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      x.fillText(ch, px, py);
      px += x.measureText(ch).width + gap;
    }
    return px;
  }
  function spacedW(x, s, gap) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += x.measureText(s.charAt(i)).width + gap;
    return w - gap;
  }

  /* ---------------- 立绘 → 母版 ---------------- */
  /* 统一裁掉透明边、居中适配到 512，再派生剪影与像素数据。
     74 张立绘构图不一（有的顶天立地，有的四角留白），不归一化就没法排版。 */
  function prep(img) {
    var S = 512;
    var t = off(S, S), tx = C(t);
    tx.drawImage(img, 0, 0, S, S);
    var d = tx.getImageData(0, 0, S, S).data;
    var x0 = S, x1 = 0, y0 = S, y1 = 0;
    for (var y = 0; y < S; y++) {
      var row = y * S * 4;
      for (var x = 0; x < S; x++) {
        if (d[row + x * 4 + 3] > 24) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 <= x0) { x0 = 0; y0 = 0; x1 = S; y1 = S; }
    var nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    var kx = nw / S, ky = nh / S;
    var bx = x0 * kx, by = y0 * ky, bw = (x1 - x0 + 1) * kx, bh = (y1 - y0 + 1) * ky;

    var art = off(S, S), ax = C(art);
    var pad = 0.055, k = Math.min(S * (1 - pad * 2) / bw, S * (1 - pad * 2) / bh);
    var dw = bw * k, dh = bh * k;
    ax.drawImage(img, bx, by, bw, bh, (S - dw) / 2, (S - dh) / 2, dw, dh);

    var sil = off(S, S), sx = C(sil);
    sx.drawImage(art, 0, 0);
    sx.globalCompositeOperation = "source-in";
    sx.fillStyle = "#fff"; sx.fillRect(0, 0, S, S);

    return { art: art, sil: sil, data: ax.getImageData(0, 0, S, S).data, S: S };
  }

  function colAt(sp, px, py) {
    var S = sp.S, x = clamp(px | 0, 0, S - 1), y = clamp(py | 0, 0, S - 1);
    var i = (y * S + x) * 4;
    return [sp.data[i], sp.data[i + 1], sp.data[i + 2], sp.data[i + 3]];
  }
  function lumAt(sp, px, py) {
    var S = sp.S, x = clamp(px | 0, 0, S - 1), y = clamp(py | 0, 0, S - 1);
    var i = (y * S + x) * 4;
    return (sp.data[i] * .299 + sp.data[i + 1] * .587 + sp.data[i + 2] * .114) / 255;
  }
  function alphaAt(sp, px, py) {
    var S = sp.S, x = clamp(px | 0, 0, S - 1), y = clamp(py | 0, 0, S - 1);
    return sp.data[(y * S + x) * 4 + 3];
  }

  /* 索贝尔边缘：掐丝要它、剪纸也能借 */
  function sobel(sp, thr) {
    if (thr > 4) thr = thr / 255;   /* 兼容 0..255 写法，别再传 26 了 */
    var S = sp.S, c = off(S, S), x = C(c), img = x.createImageData(S, S), d = img.data;
    function L(xx, yy) {
      return lumAt(sp, xx, yy) * (alphaAt(sp, xx, yy) / 255);
    }
    for (var y = 1; y < S - 1; y++) {
      for (var xx2 = 1; xx2 < S - 1; xx2++) {
        var gx = (L(xx2 + 1, y - 1) + 2 * L(xx2 + 1, y) + L(xx2 + 1, y + 1)) -
                 (L(xx2 - 1, y - 1) + 2 * L(xx2 - 1, y) + L(xx2 - 1, y + 1));
        var gy = (L(xx2 - 1, y + 1) + 2 * L(xx2, y + 1) + L(xx2 + 1, y + 1)) -
                 (L(xx2 - 1, y - 1) + 2 * L(xx2, y - 1) + L(xx2 + 1, y - 1));
        var g = Math.sqrt(gx * gx + gy * gy);
        if (g > thr) {
          var o2 = (y * S + xx2) * 4;
          d[o2] = d[o2 + 1] = d[o2 + 2] = 255;
          d[o2 + 3] = clamp((g - thr) * 800, 0, 255);
        }
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function tint(src, color) {
    var c = off(src.width, src.height), x = C(c);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color; x.fillRect(0, 0, src.width, src.height);
    return c;
  }

  /* ---------------- 生长遮罩（十七套共用） ---------------- */
  var _scr = null, _msk = null;
  /* 生长遮罩：必须"先画好遮罩，再一次性合成"。
     坑：在 destination-in 下连续画多个图形，后一个图形会把前一个的结果擦掉，
     只剩最后一块（水墨只剩一个点、蜡笔只剩底部一坨），所以遮罩要另开画布累加。 */
  function masked(plate, paint) {
    /* 长满了就直接返回原版，省掉"清两次 + 合成一次"的三遍全图操作 */
    if (paint && paint.done) return plate;
    if (!_scr) { _scr = off(PLATE, PLATE); _msk = off(PLATE, PLATE); }
    var m = C(_msk);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = "source-over";
    m.globalAlpha = 1;
    m.clearRect(0, 0, PLATE, PLATE);
    paint(m);

    var s = C(_scr);
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "source-over";
    s.globalAlpha = 1;
    s.clearRect(0, 0, PLATE, PLATE);
    s.drawImage(plate, 0, 0);
    if (!window.__sdNoMask) {
      s.globalCompositeOperation = "destination-in";
      s.drawImage(_msk, 0, 0);
      s.globalCompositeOperation = "source-over";
    }
    return _scr;
  }
  /* 顶部往下长：刺绣、墨、粉笔都吃这一套 */
  function maskDown(p, soft) {
    var fn = function (s) {
      var e = easeOut(p) * (PLATE + 120) - 60;
      var g = s.createLinearGradient(0, e - 90, 0, e + 40);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = g; s.fillRect(0, 0, PLATE, PLATE);
      if (soft) {
        s.globalAlpha = 0.5;
        s.beginPath(); s.arc(PLATE * .5, e, PLATE * .3, 0, 6.2832); s.fillStyle = "rgba(0,0,0,1)"; s.fill();
        s.globalAlpha = 1;
      }
    };
    fn.done = p >= 0.999;
    return fn;
  }
  function maskRight(p) {
    var fn = function (s) {
      var e = easeOut(p) * (PLATE + 140) - 70;
      var g = s.createLinearGradient(e - 130, 0, e + 30, 0);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = g; s.fillRect(0, 0, PLATE, PLATE);
    };
    fn.done = p >= 0.999;
    return fn;
  }
  function maskBlots(p, blobs) {
    return function (s) {
      s.fillStyle = "rgba(0,0,0,1)";
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i], k = seg(p, b.d, b.d + 0.8);
        if (k <= 0) continue;
        var r = b.r * easeOut(k);
        var g = s.createRadialGradient(b.x, b.y, r * 0.2, b.x, b.y, Math.max(1, r));
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.72, "rgba(0,0,0,.95)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        s.fillStyle = g;
        s.beginPath(); s.arc(b.x, b.y, Math.max(1, r), 0, 6.2832); s.fill();
        s.fillStyle = "rgba(0,0,0,1)";
      }
    };
  }

  /* ===================================================================
     十七道工艺。每道：no / cn / en / 文案 / 配色 / 字体 / bg / build / art / fx
     bg 与 art 都只在必要时重建，fx 才逐帧跑。
     =================================================================== */
  /* ---- 粉笔：逐笔描线 -------------------------------------------------
     参考视频里那只鲸鱼不是"把图扫出来"，而是几根线条被一笔笔画出来：
     先一条长轮廓，再补几笔内部的强线，留大量空白。
     所以这里：① 用摩尔邻域追踪把剪影走成一条闭合轮廓笔画；② 只留最强的
     内部边、按长度砍掉碎屑；③ 给轮廓很大权重，动画自然"先描外形再补细节"。
     抖动用固定 hash —— 同一个 t 必须画出同一张图。 */
  function _h2(a, b) {
    var t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return t - Math.floor(t);
  }

  /* 摩尔邻域追踪：沿二值剪影走一圈，返回扁平的 [x,y,...] */
  function traceEdge(mask, S) {
    var start = -1;
    for (var i = 0; i < S * S; i++) if (mask[i]) { start = i; break; }
    if (start < 0) return null;
    var dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    var sx = start % S, sy = (start / S) | 0;
    var px = sx, py = sy, back = 4, pts = [sx, sy], guard = 0;
    while (guard++ < S * S * 2) {
      var found = -1;
      /* 必须从"来路"的下一个方向开始找：从 back 本身开始会原地来回弹 */
      for (var k = 1; k <= 8; k++) {
        var d = (back + k) % 8;
        var nx = px + dirs[d][0], ny = py + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        if (mask[ny * S + nx]) { found = d; break; }
      }
      if (found < 0) break;
      px += dirs[found][0]; py += dirs[found][1];
      pts.push(px, py);
      back = (found + 4) % 8;
      if (px === sx && py === sy && pts.length > 12) break;
    }
    if (pts.length >= 6 && pts[pts.length - 2] === pts[0] && pts[pts.length - 1] === pts[1]) {
      pts.length -= 2;                    /* 首尾同点：去掉，免得轮廓画两遍 */
    }
    return pts.length >= 12 ? pts : null;
  }

  /* Ramer–Douglas–Peucker：把一圈毛边压成几十个点，线条才干净 */
  function rdp(P, eps) {
    var n = P.length / 2;
    if (n < 3) return P;
    var keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    var st = [[0, n - 1]];
    while (st.length) {
      var seg = st.pop(), a = seg[0], b = seg[1];
      var ax = P[a * 2], ay = P[a * 2 + 1], bx = P[b * 2], by = P[b * 2 + 1];
      var dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy);
      /* 闭合轮廓首尾同点 → 弦长为 0，垂距恒为 0，会一个点都切不出来。
         这种情况改用"到起点距离"当判据。 */
      var degen = L < 0.5;
      if (degen) L = 1;
      var bi = -1, bd = 0;
      for (var i = a + 1; i < b; i++) {
        var d = degen
          ? Math.sqrt((P[i * 2] - ax) * (P[i * 2] - ax) + (P[i * 2 + 1] - ay) * (P[i * 2 + 1] - ay))
          : Math.abs((P[i * 2] - ax) * dy - (P[i * 2 + 1] - ay) * dx) / L;
        if (d > bd) { bd = d; bi = i; }
      }
      if (bd > eps && bi > 0) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
    }
    var o = [];
    for (var j = 0; j < n; j++) if (keep[j]) o.push(P[j * 2], P[j * 2 + 1]);
    return o;
  }

  /* 逐笔描一遍：limit 是"加权长度"预算，返回最后一笔的笔尖 */
  function chalkRun(x, pl, limit, ox, oy, sc, alphaMul, wMul, bkey, wantHead) {
    var strokes = pl.strokes, soff = pl.soff, slen = pl.slen, sw = pl.sw;
    var sa = pl.sa || [], swid = pl.swid || [];
    var head = null;
    x.lineCap = "round"; x.lineJoin = "round";
    for (var m = 0; m < strokes.length; m++) {
      if (soff[m] >= limit) break;
      var Q = strokes[m];
      var av = Math.min(slen[m], (limit - soff[m]) / sw[m]);
      /* 沸腾：每 1/12 秒整笔重画一次（手绘动画是"一拍二"），线才会呼吸 */
      var bx = (_h2(m * 3.1 + bkey * 7.7, 11) - .5) * 2.4;
      var by = (_h2(m * 5.3 + bkey * 3.3, 23) - .5) * 2.4;
      var ac = 0, fin = false;
      x.beginPath();
      x.moveTo(ox + (Q[0] + .5 + bx) * sc, oy + (Q[1] + .5 + by) * sc);
      for (var j = 2; j < Q.length; j += 2) {
        var ex = Q[j], ey = Q[j + 1];
        var dvx = Q[j] - Q[j - 2], dvy = Q[j + 1] - Q[j - 1];
        var sg = Math.sqrt(dvx * dvx + dvy * dvy) || .001;
        if (ac + sg >= av) {
          var f = (av - ac) / sg;
          ex = Q[j - 2] + dvx * f; ey = Q[j - 1] + dvy * f;
          ac = av; fin = true;
        } else ac += sg;
        var jx = (_h2(m * 3.7 + bkey, j) - .5) * 1.2;
        var jy = (_h2(m * 5.1 + bkey, j + 1) - .5) * 1.2;
        var X = ox + (ex + bx + jx) * sc, Y = oy + (ey + by + jy) * sc;
        if (_h2(m * 9.3 + 71, j) < .035) x.moveTo(X, Y);   /* 飞白断口 */
        else x.lineTo(X, Y);
        if (wantHead) head = { x: X, y: Y };
        if (fin) break;
      }
      x.lineWidth = (swid[m] || 2.05) * wMul * sc;
      x.strokeStyle = "rgba(241,247,238," + ((sa[m] == null ? .92 : sa[m]) * alphaMul) + ")";
      x.stroke();
      if (fin) break;
    }
    return head;
  }

  /* prog: 0..1 画到哪；t 用来做沸腾抖动；返回粉笔头位置（画幅坐标） */
  function chalkDraw(x, pl, prog, ox, oy, sc, alpha, t) {
    var limit = prog * pl.total;
    var bkey = Math.floor((t || 0) * 12);
    alpha = alpha == null ? 1 : alpha;
    /* ① 宽笔底光：粉笔压在板上的那一圈白，很淡 */
    x.beginPath();
    for (var i = 0; i < pl.strokes.length; i++) {
      if (pl.soff[i] >= limit) break;
      var P = pl.strokes[i];
      var av0 = Math.min(pl.slen[i], (limit - pl.soff[i]) / pl.sw[i]);
      var bx0 = (_h2(i * 3.1 + bkey * 7.7, 11) - .5) * 2.4;
      var by0 = (_h2(i * 5.3 + bkey * 3.3, 23) - .5) * 2.4;
      var ac0 = 0;
      x.moveTo(ox + (P[0] + .5 + bx0) * sc, oy + (P[1] + .5 + by0) * sc);
      for (var j0 = 2; j0 < P.length; j0 += 2) {
        var ex0 = P[j0], ey0 = P[j0 + 1];
        var dx0 = P[j0] - P[j0 - 2], dy0 = P[j0 + 1] - P[j0 - 1];
        var sg0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || .001;
        if (ac0 + sg0 >= av0) {
          var f0 = (av0 - ac0) / sg0;
          ex0 = P[j0 - 2] + dx0 * f0; ey0 = P[j0 - 1] + dy0 * f0;
          x.lineTo(ox + (ex0 + bx0) * sc, oy + (ey0 + by0) * sc);
          break;
        }
        ac0 += sg0;
        x.lineTo(ox + (ex0 + bx0) * sc, oy + (ey0 + by0) * sc);
      }
    }
    x.lineWidth = 6.2 * sc;
    x.strokeStyle = "rgba(226,238,224," + (.10 * alpha) + ")";
    x.lineCap = "round"; x.lineJoin = "round";
    x.stroke();

    /* ② 正笔 */
    var head = chalkRun(x, pl, limit, ox, oy, sc, alpha, 1, bkey, true);
    /* ③ 草稿第二遍：同一笔错开一点、更淡 —— 手画的东西从来不是一稿 */
    chalkRun(x, pl, limit, ox + 1.9, oy - 1.2, sc, alpha * .20, 1.35, bkey + 5, false);
    return head;
  }

  var STYLES = [

    /* ---------- 01 水墨 ---------- */
    {
      key: "ink", scrim: "rgba(240,232,214,.84)", no: "01", cn: "水墨", en: "INK WASH",
      line1: "一滴墨落在宣纸上，自己会跑。",
      line2: "跑成山，跑成塔，跑成这只精灵的轮廓。",
      tags: ["材质 生宣·松烟", "工序 落墨·晕染"],
      why: "水墨不描边，靠墨色浓淡把形体“养”出来——这正好是 AI 生成纹理的逻辑：给一点点，让算法把剩下的晕开。",
      font: KAI,
      tx: { main: "#241f1a", sub: "#4a4038", accent: "#9c2b1b" },
      pos: { cx: 872, cy: 316, size: 690 },

      build: function (sp) {
        var S = sp.S, sz = PLATE;
        /* 墨色化：暗部吃墨，亮部留白 */
        var t = off(S, S), tx = C(t);
        tx.drawImage(sp.art, 0, 0);
        var d = tx.getImageData(0, 0, S, S), q = d.data;
        for (var i = 0; i < q.length; i += 4) {
          var l = (q[i] * .299 + q[i + 1] * .587 + q[i + 2] * .114) / 255;
          var tone = 22 + 104 * Math.pow(1 - l, 1.05);  /* 亮部浅墨、暗部浓墨 */
          q[i] = tone + 10;
          q[i + 1] = tone + 5;
          q[i + 2] = tone;
          q[i + 3] = q[i + 3] * (0.80 + 0.20 * (1 - l));
        }
        tx.putImageData(d, 0, 0);

        var c = off(sz, sz), x = C(c);
        var k = sz / S;
        /* 洇：多层错位低透明 */
        x.globalAlpha = 0.30;
        for (var j = 0; j < 7; j++) {
          var a = j / 7 * 6.2832, rad = 3 + (j % 3) * 2.6;
          x.drawImage(t, Math.cos(a) * rad, Math.sin(a) * rad, sz, sz);
        }
        x.globalAlpha = 1;
        x.drawImage(t, 0, 0, sz, sz);
        /* 飞白：几笔淡墨扫过边缘 */
        var r = mulberry(19);
        x.globalCompositeOperation = "destination-out";
        for (var m = 0; m < 90; m++) {
          var px = r() * sz, py = r() * sz;
          x.globalAlpha = 0.05 + r() * 0.16;
          x.fillStyle = "#000";
          x.beginPath(); x.ellipse(px, py, 4 + r() * 26, 1.5 + r() * 6, r() * 3.14, 0, 6.2832); x.fill();
        }
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        return { plate: c, k: k };
      },

      bg: function (x) {
        x.fillStyle = "#efe6d4"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .34, H * .1, 60, W * .34, H * .1, W * .85);
        g.addColorStop(0, "rgba(255,252,242,.95)"); g.addColorStop(.6, "rgba(240,231,212,.2)"); g.addColorStop(1, "rgba(198,182,156,.42)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 远山：两笔淡墨 */
        var r = mulberry(31);
        x.globalAlpha = 0.10;
        for (var pass = 0; pass < 2; pass++) {
          x.fillStyle = "#3a332c";
          x.beginPath(); x.moveTo(-40, H);
          for (var i = 0; i <= 12; i++) {
            var px = -40 + i * (W + 80) / 12;
            var py = H - 60 - (pass ? 120 : 190) * (0.35 + r() * 0.65);
            x.quadraticCurveTo(px - 50, py + 40, px, py);
          }
          x.lineTo(W + 40, H); x.closePath(); x.fill();
        }
        x.globalAlpha = 1;
        /* 淡金月 */
        var m = x.createRadialGradient(W * .82, H * .16, 4, W * .82, H * .16, 96);
        m.addColorStop(0, "rgba(214,178,110,.55)"); m.addColorStop(1, "rgba(214,178,110,0)");
        x.fillStyle = m; x.beginPath(); x.arc(W * .82, H * .16, 96, 0, 6.2832); x.fill();
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .5;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var blobs = pl.blobs || (pl.blobs = (function () {
          var r = mulberry(41), a = [];
          for (var i = 0; i < 7; i++) a.push({ x: PLATE * (.28 + r() * .5), y: PLATE * (.22 + r() * .56), r: PLATE * (.16 + r() * .22), d: i * 0.07 });
          return a;
        })());
        x.globalAlpha = 1;
        x.drawImage(masked(pl.plate, maskBlots(seg(p, 0.02, 0.52), blobs)), 650, 66, 588, 588);
      },

      fx: function (x, p, t) {
        /* 三滴墨 */
        var r = mulberry(57);
        for (var i = 0; i < 3; i++) {
          var s = (t + i * 0.7) % 1.6, a = 1 - s / 1.6;
          var px = 300 + i * 190 + Math.sin(t * 0.9 + i) * 10;
          var py = 90 + s * 470;
          x.globalAlpha = a * .5;
          x.fillStyle = "#2a2520";
          x.beginPath(); x.ellipse(px, py, 3 + s * 4, 5 + s * 7, 0, 0, 6.2832); x.fill();
        }
        x.globalAlpha = 1;
      }
    },

    /* ---------- 02 凸版烫金 ---------- */
    {
      key: "foil", scrim: "rgba(14,11,9,.82)", no: "02", cn: "凸版烫金", en: "LETTERPRESS & FOIL",
      line1: "印版隔着金箔，重重压进厚纸。",
      line2: "揭开箔膜，压痕里是一只它，侧光一扫就发亮。",
      tags: ["材质 金箔·棉纸", "工序 热压烫金"],
      why: "烫金的贵气全靠“压痕 + 侧光”两个物理事实。这两件东西在网页上是算出来的：一条渐变做箔，一次偏移做压痕。",
      font: HEI,
      tx: { main: "#f7ead2", sub: "#c4ae90", accent: "#e2b463" },
      pos: { cx: 890, cy: 320, size: 700 },

      build: function (sp) {
        var sz = PLATE, S = sp.S;
        var c = off(sz, sz), x = C(c);
        /* 1) 压痕：先铺一层暗影，箔是压在纸上的，不是浮着的 */
        var sh = off(sz, sz), sx2 = C(sh);
        sx2.drawImage(sp.sil, 0, 0, sz, sz);
        sx2.globalCompositeOperation = "source-in";
        sx2.fillStyle = "#120c05"; sx2.fillRect(0, 0, sz, sz);
        x.globalAlpha = .92; x.drawImage(sh, 5, 7); x.globalAlpha = 1;

        /* 2) 金箔：斜向渐变 × 立绘本身 —— 先乘出器物细节，再裁到轮廓内，
              否则金箔只是一块亮斑，看不出是什么东西 */
        var g = off(sz, sz), gx = C(g);
        var lg = gx.createLinearGradient(0, 0, sz * .95, sz * .9);
        lg.addColorStop(0, "#8a5a1c"); lg.addColorStop(.16, "#d3a03a");
        lg.addColorStop(.34, "#f9ecc4"); lg.addColorStop(.5, "#dcae4c");
        lg.addColorStop(.66, "#96621d"); lg.addColorStop(.84, "#f0d492");
        lg.addColorStop(1, "#b07a26");
        gx.fillStyle = lg; gx.fillRect(0, 0, sz, sz);
        var r = mulberry(67);
        gx.globalCompositeOperation = "overlay";
        for (var i = 0; i < 120; i++) {
          gx.strokeStyle = "rgba(255,255,255," + (.05 + r() * .14) + ")";
          gx.lineWidth = .8 + r() * 2.6;
          var px = r() * sz, py = r() * sz;
          gx.beginPath(); gx.moveTo(px, py);
          gx.quadraticCurveTo(px + 40, py + (r() - .5) * 30, px + 90 + r() * 80, py + (r() - .5) * 20);
          gx.stroke();
        }
        gx.globalCompositeOperation = "overlay";
        gx.globalAlpha = .92;
        gx.drawImage(sp.art, 0, 0, sz, sz);
        gx.globalAlpha = 1;
        gx.globalCompositeOperation = "destination-in";
        gx.drawImage(sp.sil, 0, 0, sz, sz);
        x.drawImage(g, 0, 0);

        /* 3) 受光边：错开 3px 挖掉，只剩左上一条极薄的高光，不能糊成白团 */
        var hi = off(sz, sz), hx = C(hi);
        hx.drawImage(sp.sil, 0, 0, sz, sz);
        hx.globalCompositeOperation = "source-in";
        hx.fillStyle = "#fff6d8"; hx.fillRect(0, 0, sz, sz);
        hx.globalCompositeOperation = "destination-out";
        hx.drawImage(sp.sil, 3, 3, sz, sz);
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = .5;
        x.drawImage(hi, 0, 0);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        return { plate: c, spec: g };
      },

      bg: function (x) {
        x.fillStyle = "#14100c"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .88, H * .3, 40, W * .88, H * .3, W * .8);
        g.addColorStop(0, "rgba(96,70,34,.55)"); g.addColorStop(.45, "rgba(40,28,16,.35)"); g.addColorStop(1, "rgba(6,5,4,0)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "overlay"; x.globalAlpha = .35;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        /* 纸边压痕线 */
        x.strokeStyle = "rgba(226,180,99,.10)"; x.lineWidth = 2;
        x.strokeRect(26, 26, W - 52, H - 52);
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.05, 0.75);
        var s = 1.08 - 0.08 * easeOut(k);
        var cx = 890, cy = 320;
        x.save();
        x.translate(cx, cy); x.scale(s, s); x.translate(-cx, -cy);
        x.globalAlpha = 0.15 + 0.85 * easeOut(seg(p, 0.05, 0.45));
        x.drawImage(pl.plate, 620, 40, 660, 660);
        x.restore();
        /* 侧光扫过：一条斜向高光穿过金箔 */
        var sw = seg(p, 0.28, 0.72);
        if (sw > 0 && sw < 1) {
          x.save();
          x.beginPath(); x.rect(620, 40, 660, 660); x.clip();
          x.globalCompositeOperation = "lighter";
          var sx = 620 - 260 + easeOut(sw) * 1180;
          var g = x.createLinearGradient(sx - 150, 0, sx + 150, 0);
          g.addColorStop(0, "rgba(255,238,190,0)");
          g.addColorStop(.5, "rgba(255,244,206,.42)");
          g.addColorStop(1, "rgba(255,238,190,0)");
          x.fillStyle = g;
          x.save(); x.translate(sx, 320); x.rotate(-0.22); x.fillRect(-150, -600, 300, 1200); x.restore();
          x.restore();
        }
      },

      fx: function (x, p, t) {
        var r = mulberry(73);
        for (var i = 0; i < 26; i++) {
          var px = (r() * W + t * (6 + r() * 10)) % W;
          var py = 80 + r() * (H - 160);
          x.globalAlpha = .10 + r() * .3;
          x.fillStyle = "#f4dca6";
          x.beginPath(); x.arc(px, py, .8 + r() * 1.6, 0, 6.2832); x.fill();
        }
        x.globalAlpha = 1;
      }
    },

    /* ---------- 03 油画厚涂 ---------- */
    {
      key: "oil", scrim: "rgba(232,220,196,.80)", no: "03", cn: "油画厚涂", en: "OIL IMPASTO",
      line1: "油彩一刀一刀堆上画布，堆出它的形。",
      line2: "镜头贴着画面掠过，笔触像山一样起伏。",
      tags: ["材质 亚麻布·油彩", "工序 刮刀厚涂"],
      why: "厚涂的关键不是颜色，是每一笔的“棱”（亮边 + 暗边）。用代码画两万条带棱的色块，就有了那种站在画前才有的立体感。",
      font: SERIF,
      tx: { main: "#231e19", sub: "#463a2c", accent: "#8a4a24" },
      pos: { cx: 910, cy: 330, size: 760 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, r = mulberry(97);
        /* ① 起稿：把立绘降采样再放大糊一档，形先立住 */
        var base = off(sz, sz), bx = C(base);
        var small = off(Math.round(sz / 7), Math.round(sz / 7)), smx = C(small);
        smx.imageSmoothingEnabled = true;
        smx.drawImage(sp.art, 0, 0, small.width, small.height);
        bx.imageSmoothingEnabled = true;
        bx.drawImage(small, 0, 0, sz, sz);
        /* ② 笔触层：方向沿"等明度线"走（垂直梯度），比统一斜向更像在塑形 */
        var lay = off(sz, sz), x = C(lay);
        var step = sz / 34;
        for (var gy = 0; gy < sz; gy += step) {
          for (var gx = 0; gx < sz; gx += step) {
            var sx = (gx + step / 2) / sz * S, sy = (gy + step / 2) / sz * S;
            if (alphaAt(sp, sx, sy) < 80) continue;
            var col = colAt(sp, sx, sy);
            var d2 = 3 / sz * S;
            var gxx = lumAt(sp, sx + d2, sy) - lumAt(sp, sx - d2, sy);
            var gyy = lumAt(sp, sx, sy + d2) - lumAt(sp, sx, sy - d2);
            var ang = Math.atan2(gyy, gxx) + 1.5708;
            /* 与全局斜向取中，免得小噪点把笔触带乱 */
            ang = ang * .55 + (-0.52) * .45 + (r() - .5) * .12;
            var w = step * (1.45 + r() * .45), h = step * (0.66 + r() * .22);
            x.save();
            x.translate(gx + step / 2 + (r() - .5) * step * .3, gy + step / 2 + (r() - .5) * step * .3);
            x.rotate(ang);
            var g = x.createLinearGradient(0, -h / 2, 0, h / 2);
            g.addColorStop(0, shade(col, .30));
            g.addColorStop(.38, shade(col, .10));
            g.addColorStop(.68, rgb(col));
            g.addColorStop(1, shade(col, -.30));
            x.fillStyle = g;
            rr(x, -w / 2, -h / 2, w, h, Math.min(w, h) * .46);
            x.fill();
            x.restore();
          }
        }
        /* ③ 高光刀口 */
        for (var i = 0; i < 150; i++) {
          var px = r() * sz, py = r() * sz;
          if (alphaAt(sp, px / sz * S, py / sz * S) < 130) continue;
          x.save(); x.translate(px, py); x.rotate(-0.52 + (r() - .5) * .9);
          x.strokeStyle = "rgba(255,252,240," + (.14 + r() * .34) + ")";
          x.lineWidth = 1 + r() * 2.4; x.lineCap = "round";
          x.beginPath(); x.moveTo(-5 - r() * 7, 0); x.lineTo(5 + r() * 7, 0); x.stroke();
          x.restore();
        }
        /* ④ 笔画到形外的地方一律裁掉：厚涂也得有干净的剪影 */
        x.globalCompositeOperation = "destination-in";
        x.drawImage(sp.sil, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-over";
        /* ⑤ 起稿 + 笔触合版（笔触留一点透，脸和纹样才认得出来） */
        var c = off(sz, sz), cx3 = C(c);
        cx3.drawImage(base, 0, 0);
        cx3.globalAlpha = .76; cx3.drawImage(lay, 0, 0); cx3.globalAlpha = 1;
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#e6d9c0"; x.fillRect(0, 0, W, H);
        var r = mulberry(101);
        /* 底布：几笔扫底 */
        x.globalAlpha = .55;
        for (var i = 0; i < 60; i++) {
          var px = r() * W, py = r() * H;
          var w = 120 + r() * 320, h = 40 + r() * 90;
          var base = [[92, 108, 88], [70, 86, 104], [138, 122, 96], [110, 128, 112]][(r() * 4) | 0];
          x.save(); x.translate(px, py); x.rotate((r() - .5) * .5);
          var g = x.createLinearGradient(0, -h / 2, 0, h / 2);
          g.addColorStop(0, shade(base, .22)); g.addColorStop(.7, rgb(base)); g.addColorStop(1, shade(base, -.26));
          x.fillStyle = g; rr(x, -w / 2, -h / 2, w, h, h / 2); x.fill();
          x.restore();
        }
        x.globalAlpha = 1;
        /* 亚麻布纹 */
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .45;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = easeOut(seg(p, 0.02, 0.66));
        x.save();
        var sc = 1.0 + 0.05 * p;         /* 极慢推镜 */
        x.translate(910, 330); x.scale(sc, sc); x.translate(-910, -330);
        x.drawImage(masked(pl.plate, maskRight(k)), 620, 40, 660, 660);
        x.restore();
      },

      fx: function (x, p, t) {
        var g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "rgba(255,250,238,.10)");
        g.addColorStop(.5, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(60,44,26,.16)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    },

    /* ---------- 04 木版年画 ---------- */
    {
      key: "wood", scrim: "rgba(243,231,205,.82)", no: "04", cn: "木版年画", en: "WOODBLOCK PRINT",
      line1: "木版刷上墨，铺纸一刷，先印出黑色线稿。",
      line2: "每一拍再套一种颜色，年画一层层活起来。",
      tags: ["材质 梨木版·宣纸", "工序 一版一色套印"],
      why: "年画的魂是“套不准”——四块版各印各的，边线永远错开一两毫米。把这 2px 的错位算进去，版味就出来了。",
      font: KAI,
      tx: { main: "#2a1d15", sub: "#4c382a", accent: "#b3362a" },
      pos: { cx: 880, cy: 320, size: 700 },

      build: function (sp) {
        var sz = PLATE, S = sp.S;
        /* 四色分版：按明度切档，每档一块版 */
        var pal = [
          { lim: 78, col: [32, 22, 16] },      /* 墨线 */
          { lim: 150, col: [178, 52, 40] },    /* 朱红 */
          { lim: 205, col: [42, 82, 88] },     /* 靛青 */
          { lim: 250, col: [226, 196, 138] }   /* 藤黄 */
        ];
        var layers = [];
        for (var li = 0; li < pal.length; li++) {
          var c = off(sz, sz), x = C(c);
          var img = x.createImageData(sz, sz), d = img.data;
          for (var py = 0; py < sz; py++) {
            var sy = clamp(py / sz * S, 0, S - 1);
            for (var px = 0; px < sz; px++) {
              var sx = clamp(px / sz * S, 0, S - 1);
              var i = ((sy | 0) * S + (sx | 0)) * 4;
              var a = sp.data[i + 3];
              if (a < 60) continue;
              var l = (sp.data[i] * .299 + sp.data[i + 1] * .587 + sp.data[i + 2] * .114);
              var lo = li === 0 ? 0 : pal[li - 1].lim;
              if (l >= lo && l < pal[li].lim) {
                var o = (py * sz + px) * 4;
                d[o] = pal[li].col[0]; d[o + 1] = pal[li].col[1]; d[o + 2] = pal[li].col[2];
                d[o + 3] = a;
              }
            }
          }
          x.putImageData(img, 0, 0);
          /* 版痕：边缘吃墨不匀 */
          var r = mulberry(120 + li);
          x.globalCompositeOperation = "destination-out";
          for (var m = 0; m < 1400; m++) {
            x.globalAlpha = .1 + r() * .3;
            x.fillStyle = "#000";
            x.beginPath(); x.arc(r() * sz, r() * sz, .6 + r() * 2.2, 0, 6.2832); x.fill();
          }
          x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
          layers.push(c);
        }
        return { layers: layers, offs: [[0, 0], [3, -2], [-2, 3], [2, 4]] };
      },

      bg: function (x) {
        x.fillStyle = "#f3e7cd"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .5, H * .45, 100, W * .5, H * .45, W * .75);
        g.addColorStop(0, "rgba(255,251,240,.9)"); g.addColorStop(1, "rgba(214,193,158,.55)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .6;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        /* 十字规线：印工对齐用的 */
        x.strokeStyle = "rgba(179,54,42,.45)"; x.lineWidth = 1.4;
        var mk = function (px, py) {
          x.beginPath(); x.moveTo(px - 12, py); x.lineTo(px + 12, py);
          x.moveTo(px, py - 12); x.lineTo(px, py + 12); x.stroke();
          x.beginPath(); x.arc(px, py, 17, 0, 6.2832); x.stroke();
        };
        mk(70, 74); mk(W - 70, 74); mk(70, H - 74); mk(W - 70, H - 74);
      },

      art: function (x, p, pl) {
        var times = [0.10, 0.34, 0.56, 0.78];
        for (var i = 0; i < pl.layers.length; i++) {
          var k = seg(p, times[i], times[i] + 0.16);
          if (k <= 0) continue;
          var o = pl.offs[i];
          /* 压印：落版瞬间轻微过冲 */
          var sc = 1 + (1 - easeOut(k)) * 0.03;
          x.save();
          x.globalAlpha = Math.min(1, k * 1.6);
          x.translate(880, 320); x.scale(sc, sc); x.translate(-880, -320);
          x.drawImage(pl.layers[i], 650 + o[0], 66 + o[1], 588, 588);
          x.restore();
        }
        x.globalAlpha = 1;
      },

      fx: function (x, p, t) {
        /* 压印闪光 */
        for (var i = 0; i < 4; i++) {
          var k = seg(p, 0.10 + i * 0.22, 0.13 + i * 0.22);
          if (k <= 0 || k >= 1) continue;
          x.globalAlpha = (1 - k) * .22;
          x.fillStyle = "#fff6e0"; x.fillRect(0, 0, W, H);
        }
        x.globalAlpha = 1;
      }
    },

    /* ---------- 05 孔版套印 ---------- */
    {
      key: "riso", scrim: "rgba(248,245,236,.84)", no: "05", cn: "孔版套印", en: "RISOGRAPH",
      line1: "滚筒一转，先印荧光粉，再套一层蓝。",
      line2: "两色叠上的那一刻，一只它从网点里出现。",
      tags: ["材质 荧光粉·蓝", "工序 双色套印"],
      why: "孔版只有两种油墨，深色全靠网点加密。所以它天生带“印刷感”——用两种颜色去概括一件文物，反而更像一张海报。",
      font: HEI,
      tx: { main: "#16161a", sub: "#3b3b44", accent: "#e0356a" },
      pos: { cx: 880, cy: 320, size: 700 },

      build: function (sp) {
        var sz = PLATE, S = sp.S;
        var inks = [{ col: [255, 92, 138], off: [4, -3], inv: false }, { col: [43, 74, 214], off: [-4, 4], inv: true }];
        var layers = [];
        var step = sz / 116;
        for (var li = 0; li < inks.length; li++) {
          var c = off(sz, sz), x = C(c);
          x.fillStyle = rgb(inks[li].col);
          for (var gy = 0; gy < sz; gy += step) {
            for (var gx = 0; gx < sz; gx += step) {
              var sx = clamp((gx + step / 2) / sz * S, 0, S - 1);
              var sy = clamp((gy + step / 2) / sz * S, 0, S - 1);
              var a = alphaAt(sp, sx, sy);
              if (a < 60) continue;
              var cx = colAt(sp, sx, sy);
              var l = (cx[0] * .299 + cx[1] * .587 + cx[2] * .114) / 255;
              var dens = inks[li].inv ? (0.10 + (1 - l) * 0.82) : (0.12 + l * 0.80);
              var rad = step * 0.62 * Math.sqrt(dens);
              if (rad < 0.4) continue;
              x.beginPath(); x.arc(gx + step / 2, gy + step / 2, rad, 0, 6.2832); x.fill();
            }
          }
          layers.push(c);
        }
        return { layers: layers, inks: inks };
      },

      bg: function (x) {
        x.fillStyle = "#f8f5ec"; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .35;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        /* 滚筒掠过：色版的显影跟着走 */
        var k0 = easeOut(seg(p, 0.04, 0.5));
        var k1 = easeOut(seg(p, 0.24, 0.74));
        var ks = [k0, k1];
        x.save();
        x.globalCompositeOperation = "multiply";
        for (var i = 0; i < 2; i++) {
          if (ks[i] <= 0) continue;
          var o = pl.inks[i].off;
          var jitter = Math.sin(i * 3.1 + p * 2) * 1.2 * (1 - ks[i]);
          x.globalAlpha = Math.min(1, ks[i] * 1.4) * .92;
          var img = masked(pl.layers[i], maskRight(ks[i]));
          x.drawImage(img, 650 + o[0] + jitter, 66 + o[1], 588, 588);
        }
        x.restore();
        x.globalAlpha = 1;
      },

      fx: function (x, p, t) {
        /* 滚筒投影 */
        var k = seg(p, 0.02, 0.5);
        if (k > 0 && k < 1) {
          var px = 300 + easeOut(k) * 780;
          x.globalAlpha = .12;
          var g = x.createLinearGradient(px - 90, 0, px + 40, 0);
          g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.7, "rgba(0,0,0,.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
          x.fillStyle = g; x.fillRect(px - 90, 0, 130, H);
          x.globalAlpha = 1;
        }
      }
    },

    /* ---------- 06 蜡笔童画 ---------- */
    {
      key: "crayon", scrim: "rgba(220,216,208,.82)", no: "06", cn: "蜡笔童画", en: "CRAYON KID",
      line1: "蜡笔在粗纹画纸上涂出它的样子。",
      line2: "每秒重画三十张，它就抖着线条跑起来。",
      tags: ["材质 蜡笔·粗纹纸", "工序 每秒三十张"],
      why: "孩子的画不讲透视，只讲“它在哪”。把立绘拆成一层层蜡笔涂痕，它就从博物馆的玻璃柜里跳出来了。",
      font: HEI,
      tx: { main: "#33302b", sub: "#4f4a42", accent: "#c0392b" },
      pos: { cx: 872, cy: 322, size: 690 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        var r = mulberry(211);
        x.lineCap = "round";
        /* 三道涂痕，角度不同，叠出蜡的厚度 */
        var passes = [{ step: 7, ang: 0.5, w: 5.2 }, { step: 6, ang: -0.7, w: 4.4 }, { step: 9, ang: 1.35, w: 6.0 }];
        for (var pi = 0; pi < passes.length; pi++) {
          var ps = passes[pi];
          for (var gy = 0; gy < sz; gy += ps.step) {
            var sy = clamp(gy / sz * S, 0, S - 1);
            var on = false, sx = 0;
            for (var px = 0; px <= sz; px += 3) {
              var sx2 = clamp(px / sz * S, 0, S - 1);
              var a = alphaAt(sp, sx2, sy);
              if (a > 110 && !on) { on = true; sx = px; }
              else if (a <= 110 && on) {
                on = false;
                for (var q = sx; q < px; q += ps.step * .82) {
                  if (r() < .12) continue;          /* 蜡笔的断笔 */
                  var c2 = colAt(sp, q / sz * S, sy);
                  var col = [c2[0], c2[1], c2[2]];
                  x.save();
                  x.translate(q + (r() - .5) * 3, gy + (r() - .5) * 3);
                  x.rotate(ps.ang + (r() - .5) * .3);
                  x.strokeStyle = rgba(col, .5 + r() * .42);
                  x.lineWidth = ps.w * (.6 + r() * .7);
                  var L = ps.step * (1.1 + r() * 1.4);
                  x.beginPath(); x.moveTo(-L / 2, 0); x.lineTo(L / 2, 0); x.stroke();
                  x.restore();
                }
              }
            }
          }
        }
        /* 粗纹纸的空白点：戳掉一点，露出纸 */
        x.globalCompositeOperation = "destination-out";
        for (var m = 0; m < 2600; m++) {
          x.globalAlpha = .35 + r() * .5;
          x.fillStyle = "#000";
          x.beginPath(); x.arc(r() * sz, r() * sz, .5 + r() * 1.5, 0, 6.2832); x.fill();
        }
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#dcd8d0"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .45, H * .4, 80, W * .45, H * .4, W * .8);
        g.addColorStop(0, "rgba(250,247,240,.85)"); g.addColorStop(1, "rgba(186,180,170,.5)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .55;
        x.drawImage(grain(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.02, 0.62);
        x.drawImage(masked(pl.plate, maskDown(k, true)), 652, 70, 584, 584);
        /* 蜡笔头：跟着生长线走 */
        if (k > 0 && k < 0.99) {
          var e = easeOut(k) * (PLATE + 120) - 60;
          var py = 70 + e / PLATE * 584;
          x.save();
          x.translate(944 + Math.sin(p * 9) * 26, py);
          x.rotate(-0.5);
          x.fillStyle = "#8fbf5a";
          rr(x, -7, -34, 14, 46, 6); x.fill();
          x.fillStyle = "#6b8f3f";
          rr(x, -7, -34, 14, 12, 6); x.fill();
          x.restore();
        }
      },

      fx: function (x, p, t) {
        /* 抖线：整幅极轻微的手抖 */
        var d = Math.sin(t * 7) * 1.2;
        x.globalAlpha = 1;
        x.translate(0, 0);
        if (d > 0) { /* 留给颗粒层，避免大范围重绘 */ }
      }
    },

    /* ---------- 07 粉笔黑板 ---------- */
    {
      key: "chalk", scrim: "rgba(20,32,26,.74)", no: "07", cn: "粉笔黑板", en: "CHALKBOARD",
      line1: "粉笔在墨绿黑板上，一笔一笔把它勾出来。",
      line2: "从头顶起笔，一路勾到脚，最后往暗处扫上调子。",
      tags: ["材质 粉笔·黑板", "工序 落笔·排线"],
      why: "每一笔都按“先看、再落笔”的顺序长出来，线是断的、有飞白的；一笔画错不要紧，因为它本来就是手画的。",
      font: HEI,
      tx: { main: "#eef3ea", sub: "#b8c6b4", accent: "#e5d38a" },
      pos: { cx: 872, cy: 318, size: 680 },

      build: function (sp) {
        var sz = PLATE, S = sp.S;
        /* ① 剪影轮廓 —— 整幅画的主笔 */
        var mask = new Uint8Array(S * S);
        for (var i = 0; i < S * S; i++) mask[i] = sp.data[i * 4 + 3] > 100 ? 1 : 0;
        var raw = traceEdge(mask, S);
        var strokes = [], sw = [], sa = [], swid = [];
        if (raw && raw.length >= 24) {
          var poly = rdp(raw, 1.4);
          /* 从最高点起笔：现实里没人从脚开始画 */
          if (poly.length >= 8) {
            var n0 = poly.length / 2, top = 0;
            for (var t2 = 1; t2 < n0; t2++) if (poly[t2 * 2 + 1] < poly[top * 2 + 1]) top = t2;
            if (top > 0 && top < n0 - 1) {
              var rot = [];
              for (var t3 = 0; t3 < n0; t3++) {
                var k3 = (top + t3) % n0;
                rot.push(poly[k3 * 2], poly[k3 * 2 + 1]);
              }
              poly = rot;
            }
            strokes.push(poly); sw.push(7.0); sa.push(.94); swid.push(2.15);
          }
        }
        /* ② 内部强线 —— 只留最强的边，碎屑全丢。轮廓已经说过的事，不重复说 */
        function lum2(xx, yy) {
          xx = clamp(xx, 0, S - 1) | 0; yy = clamp(yy, 0, S - 1) | 0;
          var q = (yy * S + xx) * 4;
          var a = sp.data[q + 3] / 255;
          return (sp.data[q] * .114 + sp.data[q + 1] * .587 + sp.data[q + 2] * .299) / 255 * a;
        }
        var edge = new Uint8Array(S * S), ew = new Float32Array(S * S);
        for (var y = 1; y < S - 1; y++) {
          for (var x = 1; x < S - 1; x++) {
            var gx = (lum2(x + 1, y - 1) + 2 * lum2(x + 1, y) + lum2(x + 1, y + 1)) - (lum2(x - 1, y - 1) + 2 * lum2(x - 1, y) + lum2(x - 1, y + 1));
            var gy = (lum2(x - 1, y + 1) + 2 * lum2(x, y + 1) + lum2(x + 1, y + 1)) - (lum2(x - 1, y - 1) + 2 * lum2(x, y - 1) + lum2(x + 1, y - 1));
            var g = Math.sqrt(gx * gx + gy * gy);
            /* 阈值抬到 0.30：只要"结构性"的线（衣褶、灯罩棱、五官） */
            if (g > 0.34) { edge[y * S + x] = 1; ew[y * S + x] = g; }
          }
        }
        var vis = new Uint8Array(S * S), seeds = [];
        for (var i2 = 0; i2 < S * S; i2++) if (edge[i2]) seeds.push(i2);
        seeds.sort(function (a, b) { return ew[b] - ew[a]; });
        if (seeds.length > 14000) seeds.length = 14000;
        var inner = [];
        for (var si = 0; si < seeds.length; si++) {
          var s0 = seeds[si];
          if (vis[s0]) continue;
          var cx = s0 % S, cy = (s0 / S) | 0, pts = [cx, cy], dx = 0, dy = 0;
          vis[s0] = 1;
          for (var step = 0; step < 260; step++) {
            var best = -1, bs = 99, bx = 0, by = 0;
            for (var oy2 = -2; oy2 <= 2; oy2++) {
              for (var ox2 = -2; ox2 <= 2; ox2++) {
                if (!ox2 && !oy2) continue;
                var nx = cx + ox2, ny = cy + oy2;
                if (nx < 1 || ny < 1 || nx >= S - 1 || ny >= S - 1) continue;
                var id = ny * S + nx;
                if (!edge[id] || vis[id]) continue;
                var d2 = ox2 * ox2 + oy2 * oy2;
                var cont = (dx * ox2 + dy * oy2) / Math.sqrt(d2);
                var sc2 = d2 - cont * 2.0 + (1 - ew[id]) * 3;
                if (sc2 < bs) { bs = sc2; best = id; bx = ox2; by = oy2; }
              }
            }
            if (best < 0) break;
            cx += bx; cy += by; vis[best] = 1;
            pts.push(cx, cy);
            var mm = Math.sqrt(bx * bx + by * by);
            dx = bx / mm; dy = by / mm;
          }
          if (pts.length < 150) continue;         /* 短于 75px 的碎屑不要：留白比细节重要 */
          var pl2 = rdp(pts, 1.5);
          if (pl2.length >= 12) inner.push(pl2);
        }
        /* 从上往下落笔：先头顶、再脸、再衣摆 */
        inner.sort(function (a, b) {
          var ya = Math.min(a[1], a[3]), yb = Math.min(b[1], b[3]);
          return ya - yb;
        });
        if (inner.length > 14) inner.length = 14;   /* 留白：最多再补 14 笔 */
        for (var q = 0; q < inner.length; q++) { strokes.push(inner[q]); sw.push(1.0); sa.push(.46); swid.push(1.7); }

        /* ③ 计时：按"加权长度"分配时间，轮廓先走完 */
        var soff = [], slen = [], total = 0;
        for (var r = 0; r < strokes.length; r++) {
          var P = strokes[r], L = 0;
          for (var r2 = 2; r2 < P.length; r2 += 2) {
            var ax = P[r2] - P[r2 - 2], ay = P[r2 + 1] - P[r2 - 1];
            L += Math.sqrt(ax * ax + ay * ay);
          }
          soff.push(total); slen.push(L); total += L * sw[r];
        }
        var pl = { strokes: strokes, soff: soff, slen: slen, sw: sw, sa: sa, swid: swid, total: total || 1 };

        /* 暗部排线：只在影子里扫，越暗越密。画完线再补，才有"上了一层调子"的意思 */
        var hatch = [];
        var rh = mulberry(523);
        for (var hy = 6; hy < S - 6; hy += 7) {
          for (var hx = 6; hx < S - 6; hx += 7) {
            var jx0 = (rh() - .5) * 5, jy0 = (rh() - .5) * 5;
            var px0 = clamp(hx + jx0, 0, S - 1) | 0, py0 = clamp(hy + jy0, 0, S - 1) | 0;
            if (sp.data[(py0 * S + px0) * 4 + 3] < 190) continue;
            var hl = lum2(px0, py0);
            if (hl > .42) continue;
            /* 越暗越密：不是铺一张网点，是有的地方扫两笔、有的地方空着 */
            if (rh() > Math.pow(1 - hl / .42, 1.25)) continue;
            var len = 6 + rh() * 9;
            var ang = -0.72 + (rh() - .5) * 0.34;      /* 角度也各不相同 */
            var ca = Math.cos(ang), sa2 = Math.sin(ang);
            hatch.push(hx + jx0 - ca * len * .5, hy + jy0 - sa2 * len * .5,
                       hx + jx0 + ca * len * .5, hy + jy0 + sa2 * len * .5);
          }
        }
        pl.hatch = hatch;

        /* ④ 画完那一版烘好，最后一帧直接贴 */
        var fc = off(sz, sz), fx2 = C(fc);
        chalkDraw(fx2, pl, 1, 0, 0, sz / S, 1);
        var rr2 = mulberry(311);
        for (var m2 = 0; m2 < 2200; m2++) {
          fx2.globalAlpha = .04 + rr2() * .13;
          fx2.fillStyle = "#eef5ea";
          fx2.beginPath(); fx2.arc(rr2() * sz, rr2() * sz, .5 + rr2() * 1.2, 0, 6.2832); fx2.fill();
        }
        fx2.globalAlpha = 1;
        pl.full = fc;
        return pl;
      },

      bg: function (x) {
        x.fillStyle = "#22342c"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .5, H * .42, 60, W * .5, H * .42, W * .8);
        g.addColorStop(0, "rgba(70,96,80,.55)"); g.addColorStop(1, "rgba(18,28,24,.9)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 擦痕 */
        var r = mulberry(333);
        x.globalAlpha = .07;
        for (var i = 0; i < 22; i++) {
          x.save(); x.translate(r() * W, r() * H); x.rotate((r() - .5) * .5);
          x.fillStyle = "#dfe9da";
          x.fillRect(0, 0, 120 + r() * 300, 8 + r() * 26);
          x.restore();
        }
        x.globalAlpha = 1;
        /* 木质笔槽 */
        var wg = x.createLinearGradient(0, H - 46, 0, H);
        wg.addColorStop(0, "#7a5230"); wg.addColorStop(.5, "#5e3d22"); wg.addColorStop(1, "#3d2716");
        x.fillStyle = wg; x.fillRect(0, H - 46, W, 46);
        x.fillStyle = "rgba(230,205,150,.85)";
        rr(x, 250, H - 40, 130, 12, 6); x.fill();
        x.fillStyle = "rgba(250,245,230,.9)";
        rr(x, 300, H - 34, 60, 8, 4); x.fill();
      },

      art: function (x, p, pl) {
        if (!pl) return;
        var ox = 650, oy = 66, sc = 588 / PLATE;
        var k = seg(p, 0.02, 0.74);
        if (k >= 0.999) {
          x.globalAlpha = .97;
          x.drawImage(pl.full, ox, oy, 588, 588);
          x.globalAlpha = 1;
        } else if (k > 0) {
          var head = chalkDraw(x, pl, easeOut(k), ox, oy, sc, 1, ST.t);
          if (head) {
            x.save();
            x.translate(head.x + 8, head.y - 6);
            x.rotate(-0.42 + Math.sin(p * 23) * .05);
            x.fillStyle = "#f4f8f0";
            rr(x, -3.2, -12, 6.4, 21, 3); x.fill();
            x.globalAlpha = .32;
            x.fillStyle = "#e9f2e4";
            for (var d2 = 0; d2 < 6; d2++) {
              x.beginPath();
              x.arc((_h2(d2, 7) - .5) * 12, 10 + _h2(d2, 19) * 20, 1 + _h2(d2, 3) * 1.5, 0, 6.2832);
              x.fill();
            }
            x.restore();
            x.globalAlpha = 1;
          }
        }
        /* 排线：暗部的调子，一条条扫上去 */
        var hk = seg(p, 0.40, 0.80);
        if (hk > 0 && pl.hatch && pl.hatch.length) {
          var hn = Math.floor(hk * pl.hatch.length / 4);
          var bkey2 = Math.floor((ST.t || 0) * 12);
          x.beginPath();
          for (var hi = 0; hi < hn; hi++) {
            var o4 = hi * 4;
            var jx4 = (_h2(hi * 2.7 + bkey2, 5) - .5) * 2.2;
            var jy4 = (_h2(hi * 4.1 + bkey2, 9) - .5) * 2.2;
            x.moveTo(ox + (pl.hatch[o4] + jx4) * sc, oy + (pl.hatch[o4 + 1] + jy4) * sc);
            x.lineTo(ox + (pl.hatch[o4 + 2] + jx4) * sc, oy + (pl.hatch[o4 + 3] + jy4) * sc);
          }
          x.lineWidth = 1.5 * sc;
          x.strokeStyle = "rgba(232,242,228,.17)";
          x.lineCap = "round";
          x.stroke();
        }
        /* 板书记号：文物纪年，像老师随手标的一行 */
        var a = seg(p, 0.64, 0.80);
        if (a > 0) {
          var info = (window.SPIRITS && SPIRITS[ST.spiritId]) || {};
          var era = info.era || "";
          if (era) {
            var e = easeOut(a);
            x.save();
            x.strokeStyle = "rgba(228,240,224,.58)";
            x.lineWidth = 1.5; x.lineCap = "round";
            x.beginPath();
            x.moveTo(ox + 26, oy + 592);
            x.lineTo(ox + 26 + 140 * e, oy + 592);
            x.stroke();
            if (e > .55) {
              x.globalAlpha = Math.min(1, (e - .55) / .45) * .84;
              x.fillStyle = "#e9f3e5";
              x.font = '500 19px ' + HEI;
              x.fillText(era, ox + 176, oy + 598);
              x.globalAlpha = 1;
            }
            x.restore();
          }
        }
      },

      fx: function (x, p, t) {
        x.globalAlpha = .06;
        x.globalCompositeOperation = "soft-light";
        x.drawImage(grain(), (t * 40) % W * 0.1, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      }
    },

    /* ---------- 08 拼插积木 ---------- */
    {
      key: "brick", scrim: "rgba(10,20,40,.78)", no: "08", cn: "拼插积木", en: "TOY BRICKS",
      line1: "积木一块块落下，咔哒扣上。",
      line2: "镜头贴着凸点掠过，焦点在前后积木间切开。",
      tags: ["材质 塑料积木·底板", "工序 逐块扣合"],
      why: "积木的语法是“分解”——再复杂的形，拆成 400 块也就能拼。这和文物修复里“先编号、再归位”是同一件事。",
      font: HEI,
      tx: { main: "#ffffff", sub: "#d6e2f5", accent: "#ffd34d" },
      pos: { cx: 880, cy: 320, size: 700 },

      build: function (sp) {
        var sz = PLATE, S = sp.S;
        var cell = sz / 46, list = [];
        var r = mulberry(401);
        var raw = [];
        for (var gy = 0; gy < sz; gy += cell) {
          for (var gx = 0; gx < sz; gx += cell) {
            var sx = (gx + cell / 2) / sz * S, sy = (gy + cell / 2) / sz * S;
            /* 邻域取最大值：否则内部小孔会被判空，拼出来像筛子 */
            var amax = 0;
            for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
              var av = alphaAt(sp, sx + ox * cell * .46, sy + oy * cell * .46);
              if (av > amax) amax = av;
            }
            if (amax < 100) continue;
            raw.push({ x: gx, y: gy, c: colAt(sp, sx, sy),
                       l: (function (c) { return (c[0] * .3 + c[1] * .59 + c[2] * .11) / 255; })(colAt(sp, sx, sy)) });
          }
        }
        /* 明度按这张图自己的分布拉满：色相留着，深浅拉开，形才认得出 */
        var ls = raw.map(function (o) { return o.l; }).sort(function (a, b) { return a - b; });
        var lo = ls[Math.floor(ls.length * .04)], hi = ls[Math.floor(ls.length * .96)];
        if (hi - lo < .12) hi = lo + .12;
        /* 砖块贴片：同色只渲染一次，逐帧纯贴图（一千块砖实时算渐变顶不住） */
        var ts = 64, tw = Math.round(ts * 1.16), tileMap = {}, tiles = [];
        var tileFor = function (col) {
          var q = Math.round(col[0] / 20) + "," + Math.round(col[1] / 20) + "," + Math.round(col[2] / 20);
          if (tileMap[q] != null) return tileMap[q];
          var cc = off(tw, tw), xc = C(cc);
          drawBrick(xc, ts * .07, ts * .07, ts, [col[0], col[1], col[2]], 1);
          tileMap[q] = tiles.length; tiles.push(cc);
          return tileMap[q];
        };
        var ACC = [[196, 40, 44], [240, 176, 40], [52, 128, 96], [86, 158, 214]];
        /* 内部轮廓用深色砖勾出来——不然脸、灯笼、衣摆糊成一片，只剩个"团"。
           在砖格上直接比相邻块的明度差，勾出来的线正好一格宽。 */
        var gmap = {};
        for (var i4 = 0; i4 < raw.length; i4++) {
          gmap[(raw[i4].x | 0) + "," + (raw[i4].y | 0)] = raw[i4].l;
        }
        var cellKey = function (gx, gy) { return gmap[(gx | 0) + "," + (gy | 0)]; };
        /* 外轮廓一圈描黑；内部只把"明暗突变"的地方描一道，脸和灯笼才分得开 */
        var isEdge = function (gx, gy, l0) {
          var nb = [cellKey(gx - cell, gy), cellKey(gx + cell, gy), cellKey(gx, gy - cell), cellKey(gx, gy + cell)];
          var miss = 0, jump = 0;
          for (var q = 0; q < 4; q++) {
            if (nb[q] == null) { miss++; continue; }
            if (Math.abs(nb[q] - l0) > 0.17) jump++;
          }
          if (miss >= 2) return 2;      /* 外轮廓 */
          return jump >= 2 ? 1 : 0;
        };
        for (var i3 = 0; i3 < raw.length; i3++) {
          var o3 = raw[i3], c3 = o3.c;
          var k = clamp((o3.l - lo) / (hi - lo), 0, 1);
          /* 目标明度：暗到 0.16、亮到 0.97，再按原色相回贴 */
          /* 砖色 = 原色，只把明度拉伸、饱和略推——像素化照片本身就是马赛克 */
          var want = 0.20 + Math.pow(k, 0.86) * 0.80;
          var src = Math.max(o3.l, .03);
          var col = [c3[0] * want / src, c3[1] * want / src, c3[2] * want / src];
          var gray0 = want * 255;
          col = [col[0] * .80 + gray0 * .20, col[1] * .80 + gray0 * .20, col[2] * .80 + gray0 * .20];
          if (r() < .045) col = ACC[(r() * ACC.length) | 0];
          var ed = isEdge(o3.x, o3.y, o3.l);
          if (ed === 2) col = [26, 20, 15];
          else if (ed === 1) col = [86, 66, 46];
          list.push({ x: o3.x, y: o3.y, t: tileFor(col), d: (o3.y / sz) * 0.42 + r() * 0.3 });
        }
        /* 组装版（静态用） */
        var plate = off(sz, sz), x = C(plate);
        for (var i = 0; i < list.length; i++) {
          x.drawImage(tiles[list[i].t], list[i].x - cell * .07, list[i].y - cell * .07, cell * 1.16, cell * 1.16);
        }
        return { bricks: list, cell: cell, tiles: tiles, plate: plate };
      },

      bg: function (x) {
        var g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#22334f"); g.addColorStop(.55, "#16233c"); g.addColorStop(1, "#0c1526");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 底板凸点：越远越小，做一点纵深 */
        var r = mulberry(433);
        for (var row = 0; row < 9; row++) {
          var py = H * 0.42 + row * row * 3.4 + row * 30;
          var rad = 7 + row * 1.6;
          for (var col = 0; col < 22; col++) {
            var px = -40 + col * (W + 80) / 22 + row * 14;
            if (py > H + 20) continue;
            var gg = x.createRadialGradient(px - rad * .3, py - rad * .4, rad * .1, px, py, rad);
            gg.addColorStop(0, "rgba(126,164,220,.40)"); gg.addColorStop(1, "rgba(10,22,44,.30)");
            x.fillStyle = gg;
            x.beginPath(); x.arc(px, py, rad, 0, 6.2832); x.fill();
          }
        }
        var vg = x.createRadialGradient(W * .5, H * .4, 80, W * .5, H * .4, W * .85);
        vg.addColorStop(0, "rgba(255,255,255,.05)"); vg.addColorStop(1, "rgba(2,8,20,.62)");
        x.fillStyle = vg; x.fillRect(0, 0, W, H);
      },

      art: function (x, p, pl) {
        var cell = pl.cell, k2 = 588 / PLATE, d = cell * k2;
        for (var i = 0; i < pl.bricks.length; i++) {
          var b = pl.bricks[i];
          var k = seg(p, 0.04 + b.d * 0.5, 0.04 + b.d * 0.5 + 0.18);
          if (k <= 0) continue;
          var drop = (1 - easeOut(k)) * -90;
          var sc = 1;
          if (k > 0.72) { var b2 = (k - 0.72) / 0.28; sc = 1 + Math.sin(b2 * 3.1416) * 0.10; }
          x.save();
          x.globalAlpha = Math.min(1, k * 2.2);
          x.translate(944 + (b.x + cell / 2 - PLATE / 2) * k2, 360 + (b.y + cell / 2 - PLATE / 2) * k2 + drop);
          x.scale(sc, sc);
          x.drawImage(pl.tiles[b.t], -d * .58, -d * .58, d * 1.16, d * 1.16);
          x.restore();
        }
        x.globalAlpha = 1;
      },

      fx: function (x, p, t) {
        /* 顶光 */
        var g = x.createLinearGradient(0, 0, W * .6, H);
        g.addColorStop(0, "rgba(255,255,255,.10)"); g.addColorStop(.6, "rgba(255,255,255,0)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    },

    /* ---------- 09 刺绣 ---------- */
    {
      key: "stitch", scrim: "rgba(10,18,32,.74)", no: "09", cn: "刺绣", en: "EMBROIDERY",
      line1: "每一针都按真丝线来画，丝线顺着针法反光。",
      line2: "拉远看，是整只它；金线在边缘盘出一圈亮。",
      tags: ["材质 真丝绣线·绢", "工序 平针·盘金"],
      why: "绣品的美在于“线是有方向的”。把每个像素的走向算成针脚角度，它就有了绣出来的光泽，而不是印上去的平。",
      font: KAI,
      tx: { main: "#f2e7d4", sub: "#c9b79a", accent: "#e0b463" },
      pos: { cx: 880, cy: 320, size: 700 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        /* ① 底：一档绢面底色 + 原图淡淡透上来，形先立住 */
        x.fillStyle = "#1b2740"; x.fillRect(0, 0, sz, sz);
        x.globalAlpha = .46; x.drawImage(sp.art, 0, 0, sz, sz); x.globalAlpha = 1;
        /* ② 平针：一行行并排，线细一点、密一点才像缎面，不像碎纸条 */
        var rowH = sz / 66, stitch = rowH * 2.5;
        x.lineCap = "round";
        for (var py = 0; py < sz; py += rowH) {
          var sy = clamp(py / sz * S, 0, S - 1);
          var on = false, sx0 = 0;
          for (var px = 0; px <= sz; px += 2) {
            var sx = clamp(px / sz * S, 0, S - 1);
            var a = alphaAt(sp, sx, sy);
            if (a > 110 && !on) { on = true; sx0 = px; }
            else if (a <= 110 && on) {
              on = false;
              for (var q = sx0; q < px; q += stitch) {
                var col = colAt(sp, q / sz * S, sy);
                if (col[3] < 80) continue;
                x.save();
                x.translate(q + stitch / 2, py + rowH / 2);
                x.rotate(0.38);
                var g = x.createLinearGradient(0, -rowH * .62, 0, rowH * .62);
                g.addColorStop(0, shade(col, .32));
                g.addColorStop(.42, shade(col, .06));
                g.addColorStop(.70, rgb(col));
                g.addColorStop(1, shade(col, -.28));
                x.strokeStyle = g;
                x.lineWidth = rowH * .88;
                x.beginPath(); x.moveTo(-stitch * .54, 0); x.lineTo(stitch * .54, 0); x.stroke();
                x.restore();
              }
            }
          }
        }
        /* ③ 盘金：沿纹样轮廓压一道金线 */
        var ed = sobel(sp, 0.16);
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = .34;
        x.drawImage(tint(ed, "#e0b463"), 0, 0, sz, sz);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        /* ④ 裁到剪影里：针脚不能飘在形外 */
        x.globalCompositeOperation = "destination-in";
        x.drawImage(sp.sil, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#16243c"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .72, H * .34, 40, W * .72, H * .34, W * .82);
        g.addColorStop(0, "rgba(74,102,148,.55)"); g.addColorStop(.5, "rgba(26,42,68,.6)"); g.addColorStop(1, "rgba(8,14,26,.95)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 绢面织纹 */
        x.globalCompositeOperation = "overlay"; x.globalAlpha = .5;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        x.strokeStyle = "rgba(224,180,99,.16)"; x.lineWidth = 1.2;
        for (var i = 0; i < 8; i++) {
          x.beginPath(); x.moveTo(0, 100 + i * 74); x.lineTo(W, 96 + i * 74); x.stroke();
        }
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.03, 0.7);
        x.drawImage(masked(pl.plate, maskDown(k, true)), 650, 66, 588, 588);
        x.globalAlpha = 1;
      },

      fx: function (x, p, t) {
        /* 丝光扫过 */
        var k = seg(p, 0.55, 0.95);
        if (k > 0 && k < 1) {
          var cx = 530 - 300 + easeOut(k) * 1100;
          x.save();
          x.beginPath(); x.rect(530, -30, 700, 700); x.clip();
          x.globalCompositeOperation = "lighter";
          var g = x.createLinearGradient(cx - 160, 0, cx + 160, 0);
          g.addColorStop(0, "rgba(255,240,200,0)"); g.addColorStop(.5, "rgba(255,244,214,.22)"); g.addColorStop(1, "rgba(255,240,200,0)");
          x.fillStyle = g; x.fillRect(400, -60, 900, 800);
          x.restore();
        }
      }
    },

    /* ---------- 10 皮影戏 ---------- */
    {
      key: "shadow", scrim: "rgba(240,222,180,.74)", no: "10", cn: "皮影戏", en: "SHADOW PUPPET",
      line1: "灯在幕后，牛皮刻的它一登场就有颜色。",
      line2: "贴着幕布清楚又有色，离开幕布就剩一道黑。",
      tags: ["材质 牛皮·白纱幕", "工序 镂刻·缀结"],
      why: "皮影能“动”，靠的是关节和控制杆。给它加一层极轻的摆动，它就从一件摆件变成台上正在唱戏的角色。",
      font: KAI,
      tx: { main: "#3a2415", sub: "#6b4a2c", accent: "#a8341f" },
      pos: { cx: 872, cy: 320, size: 720 },

      build: function (sp) {
        var sz = PLATE, S = sp.S;
        var c = off(sz, sz), x = C(c);
        /* 皮革底色 + 内部纹理 */
        x.drawImage(sp.sil, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-in";
        var g = x.createLinearGradient(0, 0, sz, sz);
        g.addColorStop(0, "#e2a03c"); g.addColorStop(.45, "#c9791f"); g.addColorStop(1, "#8f4a12");
        x.fillStyle = g; x.fillRect(0, 0, sz, sz);
        var r = mulberry(509);
        x.globalCompositeOperation = "source-atop";
        for (var i = 0; i < 240; i++) {
          x.globalAlpha = .08 + r() * .18;
          x.fillStyle = r() > .5 ? "#f6d79a" : "#6b3208";
          x.beginPath(); x.ellipse(r() * sz, r() * sz, 6 + r() * 40, 3 + r() * 14, r() * 3.14, 0, 6.2832); x.fill();
        }
        x.globalAlpha = 1;
        /* 皮革上的彩绘：把器物本身的色压进去，才有"刻出来又上了色"的感觉 */
        x.globalCompositeOperation = "multiply";
        x.globalAlpha = .5;
        x.drawImage(sp.art, 0, 0, sz, sz);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        /* 镂刻的暗边 */
        x.globalCompositeOperation = "destination-over";
        x.globalAlpha = .5;
        x.drawImage(sp.sil, 2, 3, sz, sz);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        var g = x.createRadialGradient(W * .5, H * .46, 40, W * .5, H * .46, W * .75);
        g.addColorStop(0, "#f7e3b8"); g.addColorStop(.5, "#e8c98c"); g.addColorStop(1, "#b98e4f");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 纱幕织纹 */
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .3;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        /* 竹框 */
        x.strokeStyle = "#7a4a22"; x.lineWidth = 16;
        x.strokeRect(8, 8, W - 16, H - 16);
        x.strokeStyle = "rgba(60,34,14,.5)"; x.lineWidth = 2;
        x.strokeRect(18, 18, W - 36, H - 36);
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.02, 0.5);
        var sway = Math.sin(p * 6.2832 * 0.8) * 0.045 * seg(p, 0.3, 0.6);   /* 极轻的摆 */
        x.save();
        x.translate(872, 320 + 340);
        x.rotate(sway);
        x.translate(-872, -(320 + 340));
        x.globalAlpha = .92;
        x.drawImage(masked(pl.plate, maskDown(k, true)), 620, 40, 660, 660);
        x.restore();
        x.globalAlpha = 1;
      },

      fx: function (x, p, t) {
        /* 灯的呼吸 */
        var k = 0.86 + Math.sin(t * 1.6) * 0.05;
        x.fillStyle = "rgba(255,232,180," + (0.06 * k) + ")";
        x.fillRect(0, 0, W, H);
      }
    },

    /* ---------- 11 沙画 ---------- */
    {
      key: "sand", scrim: "rgba(24,16,6,.74)", no: "11", cn: "沙画", en: "SAND ANIMATION",
      line1: "灯箱上铺满细沙，光从下往上透。",
      line2: "手指刮出一道边，它就慢慢从沙里浮出来。",
      tags: ["材质 石英砂·灯箱", "工序 撒·刮·抹"],
      why: "沙画只有“厚”和“薄”，没有颜色。挡住光的地方是影，没挡的是亮——一条灰度曲线就能讲完一件文物的体积。",
      font: HEI,
      tx: { main: "#ffe9c2", sub: "#d8b071", accent: "#ffb648" },
      pos: { cx: 880, cy: 320, size: 720 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        /* 厚沙处亮，薄处透出暗 */
        x.drawImage(sp.sil, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-in";
        var g = x.createLinearGradient(0, 0, sz * .3, sz);
        g.addColorStop(0, "#ffd98a"); g.addColorStop(.55, "#e8ac4e"); g.addColorStop(1, "#b9772a");
        x.fillStyle = g; x.fillRect(0, 0, sz, sz);
        /* 沙粒 */
        x.globalCompositeOperation = "source-atop";
        var r = mulberry(601);
        for (var i = 0; i < 22000; i++) {
          x.globalAlpha = .05 + r() * .28;
          x.fillStyle = r() > .45 ? "#fff3d0" : "#8a4f16";
          var s = .5 + r() * 1.4;
          x.fillRect(r() * sz, r() * sz, s, s);
        }
        x.globalAlpha = 1;
        /* 沙的厚薄：把器物明暗乘进去，才有"堆出来的体积" */
        x.globalCompositeOperation = "multiply";
        x.globalAlpha = .55;
        x.drawImage(sp.art, 0, 0, sz, sz);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        /* 落影：往右下偏一点 */
        x.globalCompositeOperation = "destination-over";
        x.globalAlpha = .45; x.fillStyle = "#5a340c";
        x.drawImage(sp.sil, 5, 7, sz, sz);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        var g = x.createRadialGradient(W * .5, H * 1.05, 60, W * .5, H * 1.05, W * .9);
        g.addColorStop(0, "#8a5c1e"); g.addColorStop(.45, "#4a2f10"); g.addColorStop(1, "#160e05");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 底下透上来的光 */
        var g2 = x.createRadialGradient(W * .52, H * .62, 30, W * .52, H * .62, W * .55);
        g2.addColorStop(0, "rgba(255,198,110,.35)"); g2.addColorStop(1, "rgba(255,198,110,0)");
        x.fillStyle = g2; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "overlay"; x.globalAlpha = .5;
        x.drawImage(grain(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.02, 0.6);
        /* 手指刮出来的方向感：从右下往左上 */
        x.drawImage(masked(pl.plate, function (s) {
          var e = easeOut(k);
          s.save();
          s.translate(PLATE, PLATE);
          s.rotate(-2.2);
          var edge = e * (PLATE * 2.4) - 200;
          var g = s.createLinearGradient(0, edge - 160, 0, edge + 40);
          g.addColorStop(0, "rgba(0,0,0,1)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          s.fillStyle = g; s.fillRect(-PLATE * 2, -PLATE * 2, PLATE * 4, PLATE * 4);
          s.restore();
        }), 620, 40, 660, 660);
        /* 手指影 */
        if (k > 0 && k < 0.98) {
          var e2 = easeOut(k);
          x.save();
          x.globalAlpha = .22;
          x.fillStyle = "#1a0f04";
          var fx = 520 + PLATE * 1.0 - e2 * PLATE * 1.05;
          var fy = -40 + PLATE * 1.0 - e2 * PLATE * 1.05;
          x.beginPath(); x.ellipse(fx + 30, fy + 40, 52, 74, -0.6, 0, 6.2832); x.fill();
          x.restore();
          x.globalAlpha = 1;
        }
      },

      fx: function (x, p, t) {
        var r = mulberry(607);
        for (var i = 0; i < 40; i++) {
          var px = r() * W, py = ((r() * H + t * (10 + r() * 26)) % H);
          x.globalAlpha = .05 + r() * .2;
          x.fillStyle = "#ffd79a";
          x.fillRect(px, py, 1 + r() * 2, 1 + r() * 2);
        }
        x.globalAlpha = 1;
      }
    },

    /* ---------- 12 掐丝珐琅 ---------- */
    {
      key: "cloisonne", scrim: "rgba(12,18,34,.80)", no: "12", cn: "掐丝珐琅", en: "CLOISONNE",
      line1: "先掐铜丝圈出每一块颜色，再一格格填釉。",
      line2: "入窑烧三遍，磨平了，金丝还在光里走。",
      tags: ["材质 铜丝·珐琅釉", "工序 掐丝·点蓝·烧蓝"],
      why: "珐琅的贵不在颜色多，在“每一块颜色都被金丝圈住”。用明度分区、用边缘当丝，器物自然被分成一格格的釉。",
      font: HEI,
      tx: { main: "#f6ecd6", sub: "#c4b393", accent: "#e8c473" },
      pos: { cx: 944, cy: 360, size: 660 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        var pal = [[26, 42, 84], [46, 92, 148], [206, 158, 62], [178, 64, 54],
                   [52, 118, 96], [232, 222, 196], [112, 56, 96], [74, 104, 58]];
        var img = x.createImageData(sz, sz), d = img.data;
        for (var py = 0; py < sz; py++) {
          var sy = clamp(py / sz * S, 0, S - 1);
          for (var px = 0; px < sz; px++) {
            var sx = clamp(px / sz * S, 0, S - 1);
            var a = alphaAt(sp, sx, sy); if (a < 60) continue;
            var l = lumAt(sp, sx, sy);
            var col = pal[Math.min(pal.length - 1, Math.floor(l * pal.length))];
            var o = (py * sz + px) * 4;
            d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a;
          }
        }
        x.putImageData(img, 0, 0);
        /* 铜丝 */
        x.globalCompositeOperation = "source-atop";
        x.globalAlpha = .95;
        x.drawImage(tint(sobel(sp, 0.13), "#e8c473"), 0, 0, sz, sz);
        x.globalAlpha = 1;
        /* 釉面反光 */
        var g = x.createLinearGradient(0, 0, sz, sz);
        g.addColorStop(0, "rgba(255,255,255,.24)");
        g.addColorStop(.42, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(0,0,0,.26)");
        x.fillStyle = g; x.fillRect(0, 0, sz, sz);
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#0b1222"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .74, H * .34, 30, W * .74, H * .34, W * .7);
        g.addColorStop(0, "rgba(46,74,124,.55)"); g.addColorStop(.55, "rgba(14,22,42,.6)"); g.addColorStop(1, "rgba(4,7,14,.95)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "overlay"; x.globalAlpha = .3;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = easeOut(seg(p, 0.03, 0.66));
        x.drawImage(masked(pl.plate, maskRight(k)), 620, 40, 660, 660);
      },

      fx: function (x, p, t) {
        var k = seg(p, 0.5, 0.92);
        if (k > 0 && k < 1) {
          x.save();
          x.beginPath(); x.rect(620, 40, 660, 660); x.clip();
          x.globalCompositeOperation = "lighter";
          var cx = 620 - 280 + easeOut(k) * 1220;
          var g = x.createLinearGradient(cx - 140, 0, cx + 140, 0);
          g.addColorStop(0, "rgba(255,240,200,0)");
          g.addColorStop(.5, "rgba(255,246,214,.26)");
          g.addColorStop(1, "rgba(255,240,200,0)");
          x.fillStyle = g; x.fillRect(480, 0, 900, H);
          x.restore();
        }
      }
    },

    /* ---------- 13 剪纸 ---------- */
    {
      key: "papercut", scrim: "rgba(240,228,206,.86)", no: "13", cn: "剪纸", en: "PAPER CUT",
      line1: "一张红纸对折再对折，剪刀只走一刀。",
      line2: "展开来，镂空处透光，它就有了呼吸。",
      tags: ["材质 朱红宣纸", "工序 折剪·镂空"],
      why: "剪纸的规矩很硬：不能断、要成片。所以它天生适合做“剪影 + 镂空”——把暗部掏成孔，光就从器物里透出来。",
      font: KAI,
      tx: { main: "#2a1a16", sub: "#5c3a2c", accent: "#b0231f" },
      pos: { cx: 944, cy: 360, size: 640 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        x.drawImage(sp.sil, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-in";
        x.fillStyle = "#b0231f"; x.fillRect(0, 0, sz, sz);
        /* 阴刻路数：沿纹样轮廓走刀，把线条掏空。
           整片红只剩"一团影子"，掏了线才有得看。 */
        var ed = sobel(sp, 0.19);
        var eimg = C(ed).getImageData(0, 0, S, S).data;
        var cut = off(S, S), cx2 = C(cut);
        var cimg = cx2.createImageData(S, S), cd = cimg.data;
        for (var yy = 2; yy < S - 2; yy++) {
          for (var xx = 2; xx < S - 2; xx++) {
            if (eimg[(yy * S + xx) * 4 + 3] < 60) continue;
            /* 只掏形内：离轮廓留出 5px 实边，纸才不断 */
            var inner = 1;
            for (var a2 = 0; a2 < 6.2832; a2 += 0.7854) {
              if (alphaAt(sp, xx + Math.cos(a2) * 7, yy + Math.sin(a2) * 7) < 215) { inner = 0; break; }
            }
            if (!inner) continue;
            for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
              var o2 = ((yy + dy) * S + (xx + dx)) * 4;
              cd[o2 + 3] = 255;
            }
          }
        }
        cx2.putImageData(cimg, 0, 0);
        x.globalCompositeOperation = "destination-out";
        x.drawImage(cut, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-over";
        /* 纸的纤维 */
        x.globalCompositeOperation = "destination-out";
        x.globalAlpha = .18;
        x.drawImage(fiber(), 0, 0, sz, sz);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        /* 窗纸：暖白透光，红纸贴在上面才有"透"的感觉 */
        x.fillStyle = "#f2e6cd"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .74, H * .26, 40, W * .74, H * .26, W * .82);
        g.addColorStop(0, "rgba(255,252,240,.95)"); g.addColorStop(.55, "rgba(238,224,196,.5)"); g.addColorStop(1, "rgba(186,166,136,.6)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 窗棂 */
        x.strokeStyle = "rgba(120,86,56,.10)"; x.lineWidth = 14;
        x.beginPath(); x.moveTo(W * .62, 0); x.lineTo(W * .62, H); x.stroke();
        x.beginPath(); x.moveTo(0, H * .52); x.lineTo(W, H * .52); x.stroke();
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .45;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.03, 0.6);
        if (k <= 0) return;
        var sc = 1 + (1 - easeOut(k)) * 0.04;
        x.save();
        x.translate(944, 360); x.scale(sc, sc); x.translate(-944, -360);
        /* 贴在墙上的影子 */
        x.globalAlpha = .20 * easeOut(k);
        x.fillStyle = "#6b3a24";
        x.drawImage(masked(pl.plate, maskDown(k, true)), 636, 66, 640, 640);
        x.globalAlpha = 1;
        x.drawImage(masked(pl.plate, maskDown(k, true)), 620, 48, 640, 640);
        x.restore();
        x.globalAlpha = 1;
      },

      fx: function (x, p, t) {
        /* 窗光轻微晃 */
        x.globalAlpha = .05 + Math.sin(t * 1.4) * .02;
        x.fillStyle = "#ffd9a8"; x.fillRect(0, 0, W, H);
        x.globalAlpha = 1;
      }
    },

    /* ---------- 14 拓片 ---------- */
    {
      key: "rubbing", scrim: "rgba(239,232,216,.86)", no: "14", cn: "拓片", en: "STONE RUBBING",
      line1: "纸覆在碑上，拓包一遍遍扑墨。",
      line2: "凸起的地方不着墨，字口就这样留白。",
      tags: ["材质 宣纸·油烟墨", "工序 上纸·扑墨"],
      why: "拓片只认“凹凸”，不认颜色。把明暗换成一件事：着墨、还是留白。一张纸就能把器物的体积拓下来。",
      font: KAI,
      tx: { main: "#1e1a16", sub: "#4a423a", accent: "#9c2b1b" },
      pos: { cx: 944, cy: 360, size: 640 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        x.drawImage(sp.sil, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-in";
        x.fillStyle = "#171412"; x.fillRect(0, 0, sz, sz);
        /* 凸处不着墨 → 掏回纸白 */
        var hi = off(sz, sz), hx = C(hi), img = hx.createImageData(sz, sz), d = img.data;
        for (var py = 0; py < sz; py++) {
          var sy = clamp(py / sz * S, 0, S - 1);
          for (var px = 0; px < sz; px++) {
            var sx = clamp(px / sz * S, 0, S - 1);
            var l = lumAt(sp, sx, sy);
            if (l > 0.60) {
              var o = (py * sz + px) * 4;
              d[o] = d[o + 1] = d[o + 2] = 255;
              d[o + 3] = clamp((l - 0.60) * 720, 0, 232);
            }
          }
        }
        hx.putImageData(img, 0, 0);
        x.globalCompositeOperation = "destination-out";
        x.drawImage(hi, 0, 0);
        /* 拓包扑不到的死角 */
        var r = mulberry(733);
        for (var i = 0; i < 2600; i++) {
          x.globalAlpha = .10 + r() * .38;
          x.fillStyle = "#000";
          x.beginPath(); x.arc(r() * sz, r() * sz, .6 + r() * 2.4, 0, 6.2832); x.fill();
        }
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#efe8d8"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .62, H * .4, 60, W * .62, H * .4, W * .8);
        g.addColorStop(0, "rgba(255,252,244,.9)"); g.addColorStop(1, "rgba(206,196,176,.55)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "multiply"; x.globalAlpha = .55;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.03, 0.62);
        x.drawImage(masked(pl.plate, maskDown(k, true)), 636, 66, 640, 640);
        /* 拓包：一团墨在纸上走 */
        if (k > 0 && k < 0.99) {
          var e = easeOut(k);
          var px = 636 + 200 + e * 400, py = 66 + 120 + e * 380;
          x.globalAlpha = .22;
          var g = x.createRadialGradient(px, py, 4, px, py, 70);
          g.addColorStop(0, "rgba(20,18,16,.55)"); g.addColorStop(1, "rgba(20,18,16,0)");
          x.fillStyle = g; x.beginPath(); x.arc(px, py, 70, 0, 6.2832); x.fill();
          x.globalAlpha = 1;
        }
      },

      fx: function (x, p, t) {
        var r = mulberry(739);
        for (var i = 0; i < 30; i++) {
          var px = r() * W, py = (r() * H + t * 8 * (0.4 + r())) % H;
          x.globalAlpha = .05 + r() * .12;
          x.fillStyle = "#2a241e";
          x.fillRect(px, py, 1 + r() * 2, 1 + r() * 2);
        }
        x.globalAlpha = 1;
      }
    },

    /* ---------- 15 蜡染 ---------- */
    {
      key: "batik", scrim: "rgba(14,24,42,.78)", no: "15", cn: "蜡染", en: "BATIK",
      line1: "蜡刀蘸蜡，在布上先画一道防线。",
      line2: "浸进靛缸，蜡裂开的地方留下冰纹。",
      tags: ["材质 土布·靛蓝", "工序 点蜡·浸染·冰纹"],
      why: "蜡染最动人的是“防不住”的裂——蜡一裂，靛就渗进去，成了独一无二的冰纹。这份意外，正好是代码最擅长造的随机。",
      font: HEI,
      tx: { main: "#f2ecdc", sub: "#a8bcd4", accent: "#8fb6d8" },
      pos: { cx: 944, cy: 360, size: 660 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        /* 靛蓝只有几阶：防染白、浅靛、中靛、深靛 */
        var lv = [[246, 240, 224], [162, 188, 212], [54, 92, 140], [18, 40, 74]];
        var img = x.createImageData(sz, sz), d = img.data;
        for (var py = 0; py < sz; py++) {
          var sy = clamp(py / sz * S, 0, S - 1);
          for (var px = 0; px < sz; px++) {
            var sx = clamp(px / sz * S, 0, S - 1);
            var a = alphaAt(sp, sx, sy); if (a < 60) continue;
            var l = lumAt(sp, sx, sy);
            var col = lv[l > 0.72 ? 0 : (l > 0.48 ? 1 : (l > 0.24 ? 2 : 3))];
            var o = (py * sz + px) * 4;
            d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a;
          }
        }
        x.putImageData(img, 0, 0);
        /* 冰纹 */
        x.globalCompositeOperation = "source-atop";
        var r = mulberry(811);
        x.lineCap = "round";
        for (var i = 0; i < 92; i++) {
          var px = r() * sz, py = r() * sz, a = r() * 6.2832;
          x.strokeStyle = "rgba(12,28,54," + (0.35 + r() * 0.45) + ")";
          x.lineWidth = 1.2 + r() * 2.6;
          x.beginPath(); x.moveTo(px, py);
          for (var k = 0; k < 8; k++) {
            a += (r() - .5) * 1.15;
            px += Math.cos(a) * (12 + r() * 28);
            py += Math.sin(a) * (12 + r() * 28);
            x.lineTo(px, py);
          }
          x.stroke();
        }
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#16253e"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .72, H * .34, 40, W * .72, H * .34, W * .78);
        g.addColorStop(0, "rgba(58,86,124,.55)"); g.addColorStop(.55, "rgba(20,34,56,.5)"); g.addColorStop(1, "rgba(6,11,20,.95)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "overlay"; x.globalAlpha = .45;
        x.drawImage(fiber(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = easeOut(seg(p, 0.03, 0.68));
        x.drawImage(masked(pl.plate, maskRight(k)), 620, 40, 660, 660);
      },

      fx: function (x, p, t) {
        /* 布面起伏的柔光 */
        var g = x.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "rgba(150,190,240,.10)");
        g.addColorStop(.5, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,.18)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    },

    /* ---------- 16 青花 ---------- */
    {
      key: "cobalt", scrim: "rgba(246,247,244,.88)", no: "16", cn: "青花", en: "BLUE & WHITE",
      line1: "一笔钴料落在白胎上，浓淡全靠手。",
      line2: "罩一层釉，一千三百度，蓝就定住了。",
      tags: ["材质 高岭土·钴料", "工序 绘青·施釉·高温"],
      why: "青花只有一种颜色，浓淡全靠“分水”。所以它最适合用明度直接换钴色——从留白到深蓝，一件器物就是一幅单色画。",
      font: SERIF,
      tx: { main: "#1c3358", sub: "#4a648c", accent: "#2c56a0" },
      pos: { cx: 944, cy: 360, size: 640 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        var img = x.createImageData(sz, sz), d = img.data;
        for (var py = 0; py < sz; py++) {
          var sy = clamp(py / sz * S, 0, S - 1);
          for (var px = 0; px < sz; px++) {
            var sx = clamp(px / sz * S, 0, S - 1);
            var a = alphaAt(sp, sx, sy); if (a < 60) continue;
            var l = lumAt(sp, sx, sy);
            var k = Math.pow(1 - l, 0.92);
            var o = (py * sz + px) * 4;
            d[o] = 246 - 200 * k;
            d[o + 1] = 248 - 168 * k;
            d[o + 2] = 244 - 96 * k;
            d[o + 3] = a;
          }
        }
        x.putImageData(img, 0, 0);
        /* 釉面开片 */
        x.globalCompositeOperation = "source-atop";
        var r = mulberry(853);
        for (var i = 0; i < 22; i++) {
          var px2 = r() * sz, py2 = r() * sz, a2 = r() * 6.2832;
          x.strokeStyle = "rgba(90,110,150,.16)";
          x.lineWidth = .7;
          x.beginPath(); x.moveTo(px2, py2);
          for (var k2 = 0; k2 < 7; k2++) {
            a2 += (r() - .5) * 1.3;
            px2 += Math.cos(a2) * (18 + r() * 40);
            py2 += Math.sin(a2) * (18 + r() * 40);
            x.lineTo(px2, py2);
          }
          x.stroke();
        }
        /* 瓷面反光 */
        var g = x.createLinearGradient(0, 0, sz * .8, sz);
        g.addColorStop(0, "rgba(255,255,255,.35)");
        g.addColorStop(.38, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(120,140,170,.12)");
        x.fillStyle = g; x.fillRect(0, 0, sz, sz);
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#f4f6f3"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .52, H * .3, 60, W * .52, H * .3, W * .8);
        g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(1, "rgba(198,208,214,.6)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 回青纹：底下一圈缠枝，压住大面 */
        x.strokeStyle = "rgba(44,86,160,.13)"; x.lineWidth = 2;
        for (var i = 0; i < 26; i++) {
          x.beginPath();
          var px = i * (W / 26);
          x.arc(px, H * 0.92, 46, Math.PI, 0);
          x.stroke();
        }
      },

      art: function (x, p, pl) {
        var k = seg(p, 0.03, 0.64);
        x.drawImage(masked(pl.plate, maskDown(k, true)), 636, 66, 640, 640);
        /* 笔尖 */
        if (k > 0 && k < 0.99) {
          var e = easeOut(k);
          var py = 66 + e * 640;
          x.save();
          x.translate(944 + Math.sin(p * 6) * 40, py);
          x.fillStyle = "#2c56a0";
          x.beginPath(); x.ellipse(0, 0, 5, 16, 0.5, 0, 6.2832); x.fill();
          x.restore();
        }
      },

      fx: function (x, p, t) {
        var g = x.createLinearGradient(0, 0, W * .5, H);
        g.addColorStop(0, "rgba(255,255,255,.14)");
        g.addColorStop(.5, "rgba(255,255,255,0)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    },

    /* ---------- 17 金缮 ---------- */
    {
      key: "kintsugi", scrim: "rgba(16,12,10,.80)", no: "17", cn: "金缮", en: "KINTSUGI",
      line1: "碎了不藏，用漆粘回去，再敷一层金。",
      line2: "裂纹成了它最好看的那几笔。",
      tags: ["材质 生漆·金粉", "工序 补缺·描金"],
      why: "金缮不修“旧”，修“经历”。裂缝被描成金线，等于把残缺写进器物的一生——这是整站最想说的那句话。",
      font: KAI,
      tx: { main: "#f4e2be", sub: "#bfa78a", accent: "#e8b96a" },
      pos: { cx: 944, cy: 360, size: 660 },

      build: function (sp) {
        var sz = PLATE, c = off(sz, sz), x = C(c);
        x.drawImage(sp.sil, 0, 0, sz, sz);
        x.globalCompositeOperation = "source-in";
        var g = x.createLinearGradient(0, 0, sz, sz);
        g.addColorStop(0, "#2b211a"); g.addColorStop(.55, "#191310"); g.addColorStop(1, "#33261d");
        x.fillStyle = g; x.fillRect(0, 0, sz, sz);
        x.globalCompositeOperation = "source-atop";
        x.globalAlpha = .20;
        x.drawImage(sp.art, 0, 0, sz, sz);
        x.globalAlpha = 1;
        /* 金线裂缝 */
        var r = mulberry(919);
        x.lineCap = "round"; x.lineJoin = "round";
        for (var i = 0; i < 7; i++) {
          var px = r() * sz, py = r() * sz, a = r() * 6.2832;
          var wid = 1.6 + r() * 2.4;
          x.strokeStyle = "rgba(216,164,72,.92)";
          x.lineWidth = wid;
          x.beginPath(); x.moveTo(px, py);
          for (var k = 0; k < 11; k++) {
            a += (r() - .5) * .95;
            px += Math.cos(a) * (16 + r() * 30);
            py += Math.sin(a) * (16 + r() * 30);
            x.lineTo(px, py);
          }
          x.stroke();
          /* 再描一道极细的亮边，才有"金"的厚度 */
          x.strokeStyle = "rgba(255,236,186,.75)";
          x.lineWidth = Math.max(.6, wid * .34);
          x.stroke();
        }
        x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        x.fillStyle = "#120e0b"; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * .76, H * .3, 30, W * .76, H * .3, W * .72);
        g.addColorStop(0, "rgba(96,68,36,.5)"); g.addColorStop(.5, "rgba(32,22,14,.5)"); g.addColorStop(1, "rgba(4,3,2,.96)");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 木纹桌面 */
        var r = mulberry(929);
        x.globalAlpha = .10;
        for (var i = 0; i < 40; i++) {
          x.strokeStyle = "#8a6438"; x.lineWidth = .6 + r() * 2;
          var y = r() * H;
          x.beginPath(); x.moveTo(0, y);
          x.bezierCurveTo(W * .3, y + (r() - .5) * 30, W * .7, y + (r() - .5) * 30, W, y + (r() - .5) * 20);
          x.stroke();
        }
        x.globalAlpha = 1;
      },

      art: function (x, p, pl) {
        var k = easeOut(seg(p, 0.03, 0.66));
        x.drawImage(masked(pl.plate, maskRight(k)), 620, 40, 660, 660);
      },

      fx: function (x, p, t) {
        /* 金线的呼吸光 */
        var k = seg(p, 0.45, 0.95);
        if (k > 0 && k < 1) {
          x.save();
          x.beginPath(); x.rect(620, 40, 660, 660); x.clip();
          x.globalCompositeOperation = "lighter";
          var cx = 620 - 260 + easeOut(k) * 1200;
          var g = x.createLinearGradient(cx - 120, 0, cx + 120, 0);
          g.addColorStop(0, "rgba(255,226,160,0)");
          g.addColorStop(.5, "rgba(255,234,180,.22)");
          g.addColorStop(1, "rgba(255,226,160,0)");
          x.fillStyle = g; x.fillRect(480, 0, 900, H);
          x.restore();
        }
      }
    }
  ];

  /* ---------------- 积木砖块 ---------------- */
  function drawBrick(x, px, py, w, col, k) {
    var pad = w * 0.055, s = w - pad * 2;
    x.save();
    /* 落影 */
    x.fillStyle = "rgba(6,12,30,.28)";
    rr(x, px + pad, py + pad + w * 0.08, s, s, w * 0.17); x.fill();
    /* 主体 */
    var g = x.createLinearGradient(px, py, px, py + w);
    g.addColorStop(0, shade(col, .22)); g.addColorStop(.55, rgb(col)); g.addColorStop(1, shade(col, -.24));
    x.fillStyle = g;
    rr(x, px + pad, py + pad, s, s, w * 0.17); x.fill();
    /* 上缘高光 */
    x.strokeStyle = "rgba(255,255,255,.42)"; x.lineWidth = Math.max(1, w * .05);
    x.beginPath(); x.moveTo(px + pad + s * .18, py + pad + s * .12); x.lineTo(px + pad + s * .82, py + pad + s * .12); x.stroke();
    /* 凸点 */
    var cr = s * 0.19, cx = px + w / 2, cy = py + w / 2;
    var g2 = x.createRadialGradient(cx - cr * .35, cy - cr * .45, cr * .1, cx, cy, cr);
    g2.addColorStop(0, shade(col, .45)); g2.addColorStop(.7, shade(col, .08)); g2.addColorStop(1, shade(col, -.18));
    x.fillStyle = g2;
    x.beginPath(); x.arc(cx, cy, cr, 0, 6.2832); x.fill();
    x.strokeStyle = "rgba(0,0,0,.18)"; x.lineWidth = Math.max(1, w * .025); x.stroke();
    x.restore();
  }

  /* ---------------- 文字层（十一套共用） ---------------- */
  function typeBlock(x, st, p, sm) {
    var L = sm ? {
      brand: 17, kick: 21, kGap: 4.2, title: 108, line: 27, lineGap: 34, tag: 19,
      bx: 34, by: 46, kx: 34, ky: 452, tx: 30, ty: 552, lx: 36, ly: 604, tagY: 668
    } : {
      brand: 15, kick: 17, kGap: 5.2, title: 104, line: 21, lineGap: 30, tag: 14,
      bx: 52, by: 56, kx: 56, ky: 446, tx: 52, ty: 552, lx: 58, ly: 606, tagY: 672
    };
    var tx = st.tx;

    /* 品牌角标 */
    var a0 = seg(p, 0.02, 0.12);
    x.globalAlpha = a0 * .55;
    x.font = "600 " + L.brand + "px " + HEI;
    x.fillStyle = tx.sub;
    x.textBaseline = "alphabetic"; x.textAlign = "left";
    spaced(x, "文物精灵 · RELIC SOUL", L.bx, L.by, L.brand * .32);
    x.globalAlpha = 1;

    /* 右上：编号 + 工艺英文 */
    var a1 = seg(p, 0.10, 0.26);
    x.globalAlpha = a1;
    x.font = "700 " + (L.kick * .82) + "px " + HEI;
    x.fillStyle = tx.accent;
    var en = "NO. " + st.no + "  " + st.en;
    x.textAlign = "right";
    var ex = W - L.bx, eg = L.kick * .26;
    var ew = spacedW(x, en, eg);
    spaced(x, en, ex - ew, L.by, eg);
    x.globalAlpha = 1;

    /* 工艺中文名（kicker 上行） */
    var a2 = seg(p, 0.14, 0.30);
    if (a2 > 0) {
      x.globalAlpha = a2;
      x.font = "700 " + L.kick + "px " + HEI;
      x.fillStyle = tx.accent;
      x.textAlign = "left";
      spaced(x, st.cn + " · " + st.no, L.kx, L.ky, L.kGap);
      x.globalAlpha = 1;
    }

    /* 主标题：逐字升起 */
    var info = (window.SPIRITS && SPIRITS[ST.spiritId]) || {};
    var chars = (info.name || "文物精灵").split("");
    x.font = "800 " + L.title + "px " + st.font;
    x.textAlign = "left";
    x.textBaseline = "alphabetic";
    var cx = L.tx, cy = L.ty;
    var per = 0.045;
    for (var i = 0; i < chars.length; i++) {
      var a3 = seg(p, 0.22 + i * per, 0.30 + i * per);
      if (a3 <= 0) { cx += x.measureText(chars[i]).width + L.title * .02; continue; }
      var e = easeOut(a3);
      x.globalAlpha = e;
      x.fillStyle = tx.main;
      x.save();
      x.translate(cx, cy + (1 - e) * L.title * .22);
      x.fillText(chars[i], 0, 0);
      x.restore();
      cx += x.measureText(chars[i]).width + L.title * .02;
    }
    x.globalAlpha = 1;

    /* 两行工艺说明 */
    var l1 = seg(p, 0.40, 0.50), l2 = seg(p, 0.48, 0.58);
    x.font = "500 " + L.line + "px " + HEI;
    x.fillStyle = tx.sub;
    if (l1 > 0) {
      x.globalAlpha = l1 * .92;
      x.fillText(st.line1, L.lx, L.ly);
      if (!sm && l2 > 0) { x.globalAlpha = l2 * .92; x.fillText(st.line2, L.lx, L.ly + L.lineGap); }
    }
    x.globalAlpha = 1;

    /* 材质 / 工序 小标签 */
    var a4 = seg(p, 0.58, 0.70);
    if (a4 > 0) {
      x.globalAlpha = a4 * .8;
      x.font = "600 " + L.tag + "px " + HEI;
      x.fillStyle = tx.accent;
      x.textAlign = "left";
      var s0 = st.tags.join("   ·   ");
      spaced(x, s0, L.lx, L.tagY, L.tag * .16);
      x.globalAlpha = 1;
    }

    /* 底部进度线：像片头的时间码 */
    var pw = W * 0.24, px0 = L.lx, py0 = L.tagY + (sm ? 24 : 24);
    x.globalAlpha = 0.22;
    x.fillStyle = tx.sub;
    x.fillRect(px0, py0, pw, 1.2);
    x.globalAlpha = 0.85;
    x.fillStyle = tx.accent;
    x.fillRect(px0, py0, pw * p, 1.6);
    x.globalAlpha = 1;
  }

  /* ---------------- 收尾：暗角 + 颗粒 ---------------- */
  function filmFinish(x, st, seed) {
    var g = x.createRadialGradient(W * .5, H * .48, H * .3, W * .5, H * .5, W * .78);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.34)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalAlpha = .045;
    x.globalCompositeOperation = "overlay";
    var ox = (seed * 97) % 256;
    x.drawImage(grain(), -ox, -(seed * 53) % 256, W + 256, H + 256);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }

  /* ---------------- 舞台 ---------------- */
  var ST = {
    cv: null, ctx: null, style: STYLES[0], spiritId: null, spirit: null,
    plate: null, plateKey: "", t: 0, t0: 0, raf: 0, playing: true,
    rec: null, recUntil: 0, alive: false, sm: false, paused: false
  };
  var plateCache = {};
  var imgCache = {};

  function spriteUrl(id) { return "精灵/透明/" + id + ".webp"; }

  function loadSpirit(id, cb) {
    if (imgCache[id] && imgCache[id].ready) { cb(imgCache[id].sp); return; }
    if (imgCache[id] && imgCache[id].waiting) { imgCache[id].waiting.push(cb); return; }
    imgCache[id] = { waiting: [cb], ready: false };
    var im = new Image();
    im.onload = function () {
      var sp = prep(im);
      imgCache[id].sp = sp; imgCache[id].ready = true;
      var ws = imgCache[id].waiting; imgCache[id].waiting = [];
      ws.forEach(function (f) { f(sp); });
    };
    im.onerror = function () {
      imgCache[id].ready = false; imgCache[id].waiting = [];
      var sp2 = placeholderSpirit();
      imgCache[id].sp = sp2; imgCache[id].ready = true;
      cb(sp2);
    };
    im.src = spriteUrl(id);
  }
  function placeholderSpirit() {
    var S = 512, c = off(S, S), x = C(c);
    x.fillStyle = "#b5432f";
    x.beginPath(); x.arc(S / 2, S / 2, S * .34, 0, 6.2832); x.fill();
    x.fillStyle = "#fff"; x.font = "700 120px " + HEI; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("精", S / 2, S / 2);
    var sil = off(S, S), sx = C(sil);
    sx.drawImage(c, 0, 0); sx.globalCompositeOperation = "source-in"; sx.fillStyle = "#fff"; sx.fillRect(0, 0, S, S);
    return { art: c, sil: sil, data: x.getImageData(0, 0, S, S).data, S: S };
  }

  function plateFor(st, sp) {
    var key = st.key + "|" + (ST.spiritId || "x");
    if (plateCache[key]) return plateCache[key];
    var pl = st.build(sp);
    plateCache[key] = pl;
    /* 只留最近 6 个，手机内存吃紧 */
    var ks = Object.keys(plateCache);
    if (ks.length > 6) { delete plateCache[ks[0]]; }
    return pl;
  }

  function ensureBg(st) {
    if (st._bg) return st._bg;
    var c = off(W, H), x = C(c);
    st.bg(x);
    st._bg = c;
    return c;
  }

  function drawFrame() {
    var st = ST.style, sp = ST.spirit, x = ST.ctx;
    if (!st || !sp) return;
    var t = ST.t, p = clamp(t / DUR, 0, 1);
    var pl = ST.plate;
    if (!pl) return;                 /* 版还没算完：宁可空一帧，也别让 art() 炸掉 */
    var k = ST.k || 1;
    x.setTransform(k, 0, 0, k, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, W, H);

    x.drawImage(ensureBg(st), 0, 0);
    try { st.art(x, p, pl, t); } catch (e) { window.__sdErr = st.key + " art: " + e.message; }
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    try { st.fx && st.fx(x, p, t); } catch (e2) { window.__sdErr = st.key + " fx: " + e2.message; }
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";

    /* 压边：把左半边的画压暗/压亮一档，字才站得住 */
    if (st.scrim) {
      var sg = x.createLinearGradient(0, 0, W * .48, 0);
      sg.addColorStop(0, st.scrim);
      sg.addColorStop(.46, st.scrim);
      sg.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = sg;
      x.fillRect(0, 0, W * .48, H);
    }

    typeBlock(x, st, p, ST.sm);
    filmFinish(x, st, (t * 30) | 0);

    var bar = document.getElementById("sdBar");
    if (bar) bar.style.width = (p * 100).toFixed(1) + "%";
  }

  function loop(now) {
    if (!ST.alive) return;
    var cv = document.getElementById("sdCanvas");
    if (!cv) { ST.alive = false; ST.raf = 0; return; }
    if (ST.paused) { ST.raf = requestAnimationFrame(loop); return; }
    if (!ST.t0) ST.t0 = now;
    ST.t = (now - ST.t0) / 1000;
    if (ST.t > DUR) {
      if (ST.rec && ST.rec.state === "recording") {
        ST.rec.stop();
        ST.rec = null;
      }
      ST.t0 = now; ST.t = 0;
    }
    drawFrame();
    ST.raf = requestAnimationFrame(loop);
  }

  /* ---------------- 导出（MediaRecorder，浏览器内录制） ---------------- */
  function pickMime() {
    var list = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    for (var i = 0; i < list.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(list[i])) return list[i];
    }
    return "";
  }

  function startRec() {
    var cv = ST.cv;
    if (!cv) return;
    if (!window.MediaRecorder || !cv.captureStream) { toast("这台设备的浏览器不支持录屏，可以用手机自带录屏"); return; }
    var mt = pickMime();
    var stream = cv.captureStream(30);
    var opt = { videoBitsPerSecond: 7000000 };
    if (mt) opt.mimeType = mt;
    var rec;
    try { rec = new MediaRecorder(stream, opt); }
    catch (e) { toast("这台设备的浏览器不支持录屏，可以用手机自带录屏"); return; }

    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var type = mt || "video/webm";
      var blob = new Blob(chunks, { type: type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var nm = (window.SPIRITS && SPIRITS[ST.spiritId] ? SPIRITS[ST.spiritId].name : "精灵") + "-" + ST.style.cn;
      a.href = url;
      a.download = nm + (type.indexOf("mp4") >= 0 ? ".mp4" : ".webm");
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
      toast("已生成 5 秒短片，检查一下下载");
      var b = document.getElementById("sdRec");
      if (b) { b.classList.remove("on"); b.textContent = "● 录 5 秒带走"; }
    };
    chunks = [];
    ST.rec = rec;
    ST.t0 = 0; ST.t = 0;
    rec.start();
    var b = document.getElementById("sdRec");
    if (b) { b.classList.add("on"); b.textContent = "● 录制中…"; }
  }

  var _toastT = 0;
  function toast(msg) {
    var n = document.getElementById("sdToast");
    if (!n) {
      n = document.createElement("div");
      n.id = "sdToast"; n.className = "sd-toast";
      (document.querySelector(".sd-wrap") || document.body).appendChild(n);
    }
    n.textContent = msg;
    n.classList.add("on");
    clearTimeout(_toastT);
    _toastT = setTimeout(function () { n.classList.remove("on"); }, 2600);
  }

  /* ---------------- 页面 ---------------- */
  function spiritList() {
    var out = [];
    if (!window.SPIRITS) return out;
    for (var k in SPIRITS) {
      if (!SPIRITS.hasOwnProperty(k)) continue;
      var s = SPIRITS[k];
      if (!s || !s.name) continue;
      out.push({ id: k, name: s.name, era: s.era || "", alias: s.alias || "" });
    }
    /* 有立绘的排前面：74 个都有，保留原数据顺序 */
    return out;
  }

  function styleChips(active) {
    return STYLES.map(function (st, i) {
      return '<button type="button" class="sd-chip' + (st.key === active ? " on" : "") + '" data-key="' + st.key + '">' +
        '<i>' + st.no + '</i><b>' + st.cn + '</b></button>';
    }).join("");
  }

  function spiritChips(active) {
    return spiritList().map(function (s) {
      return '<button type="button" class="sd-spt' + (s.id === active ? " on" : "") + '" data-id="' + s.id + '" title="' + s.name + '">' +
        '<img src="' + spriteUrl(s.id) + '" alt="' + s.name + '" loading="lazy">' +
        '<span>' + s.name + '</span></button>';
    }).join("");
  }

  function viewStudio() {
    var def = "changxin";
    if (!window.SPIRITS || !SPIRITS[def]) {
      var ks = spiritList();
      def = ks.length ? ks[0].id : def;
    }
    ST.spiritId = ST.spiritId || def;
    var st0 = ST.style || STYLES[0];
    return '<div class="sd-wrap">' +
      '<header class="sd-head">' +
        '<div class="sd-kicker">影棚 · STUDIO</div>' +
        '<h1 class="sd-title">一件文物，十七道工艺</h1>' +
        '<p class="sd-lead">挑一个精灵，选一道工序——<b>每一帧都由代码现算</b>，五秒成片，可以录下来带走。</p>' +
      '</header>' +

      '<section class="sd-stage">' +
        '<canvas id="sdCanvas" width="' + W + '" height="' + H + '"></canvas>' +
        '<div class="sd-bar"><i id="sdBar"></i></div>' +
        '<div class="sd-hud">' +
          '<button type="button" class="sd-btn" id="sdReplay">↻ 重播</button>' +
          '<button type="button" class="sd-btn rec" id="sdRec">● 录 5 秒带走</button>' +
        '</div>' +
      '</section>' +

      '<section class="sd-pick">' +
        '<div class="sd-ph"><b>① 选精灵</b><em id="sdSpiritName"></em></div>' +
        '<div class="sd-strip" id="sdSpirits">' + spiritChips(ST.spiritId) + '</div>' +
      '</section>' +

      '<section class="sd-pick">' +
        '<div class="sd-ph"><b>② 选工艺</b><em id="sdStyleName">' + st0.cn + ' · ' + st0.en + '</em></div>' +
        '<div class="sd-chips" id="sdStyles">' + styleChips(st0.key) + '</div>' +
      '</section>' +

      '<section class="sd-note">' +
        '<h3>这道工序，其实在算什么</h3>' +
        '<p id="sdWhy">' + st0.why + '</p>' +
        '<div class="sd-tags" id="sdTags">' + st0.tags.map(function (t) { return "<span>" + t + "</span>"; }).join("") + '</div>' +
      '</section>' +

      '<section class="sd-how">' +
        '<h3>它为什么不卡</h3>' +
        '<p>换精灵只换一张“版”，换工艺只换一套算法。重活（像素扫描、网点、笔触、砖块）在选中的那一刻算一次并缓存，' +
        '之后每帧只做“贴版 + 生长 + 光扫 + 颗粒”，所以 74 件文物 × 17 道工艺都是现算的，站里不存一个视频文件。</p>' +
        '<p class="sd-dim">同样的做法可以换到任意画面：片头、章节卡、海报。它是“程序化视频”的最小可玩版本。</p>' +
      '</section>' +

      '<div class="sd-crumb"><a href="#/vision">← 去看《中式美学：下一个一百年》</a><span>·</span><a href="#/dye">试试文物赋彩</a></div>' +
      '</div>';
  }

  function setSpirit(id) {
    ST.spiritId = id;
    var nameEl = document.getElementById("sdSpiritName");
    var s = window.SPIRITS && SPIRITS[id];
    if (nameEl && s) nameEl.textContent = s.name + (s.era ? " · " + s.era : "");
    document.querySelectorAll("#sdSpirits .sd-spt").forEach(function (b) {
      b.classList.toggle("on", b.dataset.id === id);
    });
    ST.plate = null;
    loadSpirit(id, function (sp) {
      ST.spirit = sp;
      ST.plate = plateFor(ST.style, sp);
      if (ST.playing) { ST.t0 = 0; ST.t = 0; }
    });
  }

  function setStyle(key) {
    var st = null;
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].key === key) st = STYLES[i];
    if (!st) return;
    ST.style = st;
    document.querySelectorAll("#sdStyles .sd-chip").forEach(function (b) {
      b.classList.toggle("on", b.dataset.key === key);
    });
    var sn = document.getElementById("sdStyleName");
    if (sn) sn.textContent = st.cn + " · " + st.en;
    var why = document.getElementById("sdWhy");
    if (why) why.textContent = st.why;
    var tags = document.getElementById("sdTags");
    if (tags) tags.innerHTML = st.tags.map(function (t) { return "<span>" + t + "</span>"; }).join("");
    ST.plate = null;
    if (ST.spirit) ST.plate = plateFor(st, ST.spirit);
    ST.paused = false; ST.t0 = 0; ST.t = 0;
  }

  function studioInit() {
    var cv = document.getElementById("sdCanvas");
    if (!cv) return;
    ST.cv = cv;
    ST.ctx = cv.getContext("2d");
    ST.alive = true;
    ST.sm = (cv.clientWidth || 0) < 620;
    /* 注意：别把画布改成非整数缩放（ctx.setTransform(0.78)）再指望提性能——
       实测会掉进慢路径，反而慢 3~5 倍。要省就省具体的绘制次数。 */
    ST.k = 1;
    cv.width = W; cv.height = H;

    var wrap = document.querySelector(".sd-wrap");
    if (wrap) {
      wrap.querySelectorAll("#sdStyles .sd-chip").forEach(function (b) {
        b.addEventListener("click", function () { setStyle(b.dataset.key); });
      });
      wrap.querySelectorAll("#sdSpirits .sd-spt").forEach(function (b) {
        b.addEventListener("click", function () { setSpirit(b.dataset.id); });
      });
    }
    var rp = document.getElementById("sdReplay");
    if (rp) rp.addEventListener("click", function () { ST.paused = false; ST.t0 = 0; ST.t = 0; });

    var rec = document.getElementById("sdRec");
    if (rec) {
      if (!window.MediaRecorder || !cv.captureStream) {
        rec.disabled = true; rec.textContent = "此浏览器不支持录制";
      } else {
        rec.addEventListener("click", startRec);
      }
    }

    var onResize = function () {
      if (!document.getElementById("sdCanvas")) { window.removeEventListener("resize", onResize); return; }
      var sm = (cv.clientWidth || 0) < 620;
      if (sm !== ST.sm) ST.sm = sm;
    };
    window.addEventListener("resize", onResize);

    ST.spiritId = ST.spiritId || "changxin";
    setSpirit(ST.spiritId);
    if (ST.raf) cancelAnimationFrame(ST.raf);
    ST.raf = requestAnimationFrame(loop);
  }

  window.viewStudio = viewStudio;
  window.studioInit = studioInit;
  window.sdSetStyle = setStyle;
  window.sdSetSpirit = setSpirit;
  window.STUDIO_STYLES = STYLES;
  /* 调试/验收用：把进度拨到第 t 秒，方便逐帧截图核对 */
  window.sdSeek = function (t) { ST.paused = true; ST.t = t; drawFrame(); };
  window.sdResume = function () { ST.paused = false; ST.t0 = 0; ST.t = 0; };
  window.__sd = { ST: ST, STYLES: STYLES, masked: masked, maskRight: maskRight, maskDown: maskDown, maskBlots: maskBlots, sobel: sobel, alphaAt: alphaAt, traceEdge: traceEdge, rdp: rdp, PLATE: PLATE };
  window.sdPlateURL = function () {
    var pl = ST.plate; if (!pl) return null;
    var c = pl.plate || (pl.layers && pl.layers[0]) || null;
    return c ? c.toDataURL("image/png") : null;
  };
})();
