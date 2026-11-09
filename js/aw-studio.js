/* ================= 精灵影棚 · 一件文物十道工艺（#/studio） =================
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

  /* ---------------- 生长遮罩（十套共用） ---------------- */
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
     十道工艺。每道：no / cn / en / 文案 / 配色 / 字体 / bg / build / art / fx
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
  /* 亮度等值线：marching squares 出小线段，再按端点接成折线。
     照片逐点提边缘只会得到碎屑；把明暗糊平之后取等高线，才有
     "顺着形体走的一整笔"。返回若干条 G 空间折线。 */
  function isoCurves(f, G, lv, data, S) {
    var segs = [];
    function ip(a, b) { var d = b - a; return Math.abs(d) < 1e-6 ? .5 : (lv - a) / d; }
    function inside(x, y) {
      var qx = clamp(Math.round(x * 2), 0, S - 1), qy = clamp(Math.round(y * 2), 0, S - 1);
      return data[(qy * S + qx) * 4 + 3] > 175;
    }
    for (var y = 0; y < G - 1; y++) {
      for (var x = 0; x < G - 1; x++) {
        var a = f[y * G + x], b = f[y * G + x + 1], c = f[(y + 1) * G + x + 1], d = f[(y + 1) * G + x];
        var id = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (id === 0 || id === 15) continue;
        var Tx = x + ip(a, b), Ty = y;
        var Rx = x + 1, Ry = y + ip(b, c);
        var Bx = x + ip(d, c), By = y + 1;
        var Lx = x, Ly = y + ip(a, d);
        function add(x1, y1, x2, y2) {
          if (!inside(x1, y1) || !inside(x2, y2)) return;
          segs.push(x1, y1, x2, y2);
        }
        if (id === 1 || id === 14) add(Lx, Ly, Bx, By);
        else if (id === 2 || id === 13) add(Bx, By, Rx, Ry);
        else if (id === 3 || id === 12) add(Lx, Ly, Rx, Ry);
        else if (id === 4 || id === 11) add(Tx, Ty, Rx, Ry);
        else if (id === 6 || id === 9) add(Tx, Ty, Bx, By);
        else if (id === 7 || id === 8) add(Tx, Ty, Lx, Ly);
        else if (id === 5) { add(Tx, Ty, Rx, Ry); add(Lx, Ly, Bx, By); }
        else if (id === 10) { add(Tx, Ty, Lx, Ly); add(Bx, By, Rx, Ry); }
      }
    }
    var n = segs.length / 4;
    if (!n) return [];
    var kf = function (x, y) { return (Math.round(x * 8) + 20000) * 90000 + (Math.round(y * 8) + 20000); };
    var ka = new Array(n), kb = new Array(n), map = {};
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      ka[i] = kf(segs[o], segs[o + 1]);
      kb[i] = kf(segs[o + 2], segs[o + 3]);
      (map[ka[i]] || (map[ka[i]] = [])).push(i);
      (map[kb[i]] || (map[kb[i]] = [])).push(i);
    }
    var used = new Uint8Array(n), out = [];
    function nextAt(k) {
      var L = map[k];
      if (!L) return -1;
      for (var i = 0; i < L.length; i++) if (!used[L[i]]) return L[i];
      return -1;
    }
    for (var i0 = 0; i0 < n; i0++) {
      if (used[i0]) continue;
      used[i0] = 1;
      var pts = [segs[i0 * 4], segs[i0 * 4 + 1], segs[i0 * 4 + 2], segs[i0 * 4 + 3]];
      var cur = kb[i0], g1 = 0;
      while (g1++ < 5000) {
        var nx = nextAt(cur);
        if (nx < 0) break;
        used[nx] = 1;
        if (ka[nx] === cur) { pts.push(segs[nx * 4 + 2], segs[nx * 4 + 3]); cur = kb[nx]; }
        else { pts.push(segs[nx * 4], segs[nx * 4 + 1]); cur = ka[nx]; }
      }
      var front = [], cur2 = ka[i0], g2 = 0;
      while (g2++ < 5000) {
        var nx2 = nextAt(cur2);
        if (nx2 < 0) break;
        used[nx2] = 1;
        if (kb[nx2] === cur2) { front.push(segs[nx2 * 4], segs[nx2 * 4 + 1]); cur2 = ka[nx2]; }
        else { front.push(segs[nx2 * 4 + 2], segs[nx2 * 4 + 3]); cur2 = kb[nx2]; }
      }
      var all = [];
      for (var q = front.length - 2; q >= 0; q -= 2) all.push(front[q], front[q + 1]);
      for (var q2 = 0; q2 < pts.length; q2++) all.push(pts[q2]);
      if (all.length >= 8) out.push(all);
    }
    return out;
  }

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
        var jb = j >> 3;                    /* 低频手抖：每 4 个点才换一次 */
        var jx = (_h2(m * 3.7 + bkey, jb) - .5) * 1.7;
        var jy = (_h2(m * 5.1 + bkey, jb + 7) - .5) * 1.7;
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
      /* 底光只跟主笔走：几十根内部线各自带一圈 6px 光晕，叠起来就是灰雾 */
      if (pl.swid && pl.swid[i] < 1.8) continue;
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

  /* 调子：粉笔侧锋顺着形体扫出来的明暗。分三档，越暗叠得越多。
     frac 0..1 控制"扫了多少"，用来做逐笔出现的动画。 */
  function chalkTone(x, pl, frac, ox, oy, sc, bkey) {
    if (!pl.hatch || !pl.hatch.length || frac <= 0) return;
    var hn = Math.floor(frac * pl.hatch.length / 5);
    var lw = [1.25, 1.55, 1.9], al = [.12, .17, .23];
    x.lineCap = "round";
    for (var tier = 0; tier < 3; tier++) {
      var any = false;
      x.beginPath();
      for (var hi = 0; hi < hn; hi++) {
        var o5 = hi * 5;
        if (pl.hatch[o5 + 4] !== tier) continue;
        var jx = (_h2(hi * 2.7 + bkey, 5) - .5) * 2.4;
        var jy = (_h2(hi * 4.1 + bkey, 9) - .5) * 2.4;
        x.moveTo(ox + (pl.hatch[o5] + jx) * sc, oy + (pl.hatch[o5 + 1] + jy) * sc);
        x.lineTo(ox + (pl.hatch[o5 + 2] + jx) * sc, oy + (pl.hatch[o5 + 3] + jy) * sc);
        any = true;
      }
      if (!any) continue;
      x.lineWidth = lw[tier] * sc;
      x.strokeStyle = "rgba(234,243,229," + al[tier] + ")";
      x.stroke();
    }
  }

  var STYLES = [

    /* ---------- 02 凸版烫金 ---------- */
    {
      key: "foil", scrim: "rgba(14,11,9,.82)", no: "01", cn: "凸版烫金", en: "LETTERPRESS & FOIL",
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
    /* ---------- 04 木版年画 ---------- */
    {
      key: "wood", scrim: "rgba(243,231,205,.82)", no: "02", cn: "木版年画", en: "WOODBLOCK PRINT",
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
      key: "riso", scrim: "rgba(248,245,236,.84)", no: "03", cn: "孔版套印", en: "RISOGRAPH",
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
      key: "crayon", scrim: "rgba(220,216,208,.82)", no: "04", cn: "蜡笔童画", en: "CRAYON KID",
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
      key: "chalk", scrim: "rgba(20,32,26,.74)", no: "05", cn: "粉笔黑板", en: "CHALKBOARD",
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
          var poly = rdp(raw, 2.1);
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
        /* ② 内部：亮度等值线。先把明暗糊平（照片的噪声全在这里被抹掉），
           再取几道等高线 —— 出来的是顺着形体走的长曲线，不是碎渣。 */
        var sm = new Float32Array(S * S);
        for (var sy2 = 0; sy2 < S; sy2++) for (var sx2 = 0; sx2 < S; sx2++) sm[sy2 * S + sx2] = lum2(sx2, sy2);
        for (var pass = 0; pass < 4; pass++) {
          var tmp = new Float32Array(S * S);
          for (var yy = 1; yy < S - 1; yy++) {
            for (var xx = 1; xx < S - 1; xx++) {
              var acc = 0;
              for (var oy3 = -1; oy3 <= 1; oy3++) {
                var row3 = (yy + oy3) * S + xx;
                acc += sm[row3 - 1] + sm[row3] + sm[row3 + 1];
              }
              tmp[yy * S + xx] = acc / 9;
            }
          }
          sm = tmp;
        }
        /* 四道线取在剪影内亮度的分位数上：深色青铜和浅色白瓷都合适 */
        var hist = new Uint32Array(48), hcount = 0;
        for (var i3 = 0; i3 < S * S; i3++) {
          if (sp.data[i3 * 4 + 3] < 180) continue;
          hist[clamp(sm[i3] * 47.999, 0, 47) | 0]++; hcount++;
        }
        var levels = [], accN = 0, want = [.34, .60, .80], wi = 0;
        for (var bi = 0; bi < 48 && wi < want.length; bi++) {
          accN += hist[bi];
          if (accN >= hcount * want[wi]) { levels.push((bi + .5) / 48); wi++; }
        }
        var G = S >> 1;
        var f2 = new Float32Array(G * G);
        for (var gy = 0; gy < G; gy++) {
          for (var gx2 = 0; gx2 < G; gx2++) {
            f2[gy * G + gx2] = sm[clamp(gy * 2 + 1, 0, S - 1) * S + clamp(gx2 * 2 + 1, 0, S - 1)];
          }
        }
        var inner = [];
        for (var li = 0; li < levels.length; li++) {
          var curves = isoCurves(f2, G, levels[li], sp.data, S);
          for (var ci = 0; ci < curves.length; ci++) {
            var cc = curves[ci], L3 = 0;
            for (var k3 = 2; k3 < cc.length; k3 += 2) {
              var ddx = (cc[k3] - cc[k3 - 2]) * 2, ddy = (cc[k3 + 1] - cc[k3 - 1]) * 2;
              L3 += Math.sqrt(ddx * ddx + ddy * ddy);
            }
            if (L3 < 150) continue;                  /* 只留最长的几根：它们才是结构线 */
            var sp2 = [];
            for (var k4 = 0; k4 < cc.length; k4 += 2) sp2.push(cc[k4] * 2, cc[k4 + 1] * 2);
            var sm2 = rdp(sp2, 2.0);
            if (sm2.length >= 8) inner.push({ p: sm2, lv: li, len: L3 });
          }
        }
        /* 从上往下落笔：跟人画画的顺序一致 */
        inner.sort(function (a, b) {
          var ya = Math.min(a.p[1], a.p[3]), yb = Math.min(b.p[1], b.p[3]);
          return Math.abs(ya - yb) > 26 ? ya - yb : a.lv - b.lv;
        });
        if (inner.length > 10) inner.length = 10;
        for (var q = 0; q < inner.length; q++) {
          strokes.push(inner[q].p); sw.push(1.0);
          sa.push(.52 + inner[q].lv * .09);
          swid.push(1.2 + inner[q].lv * .12);
        }

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

        pl.hatch = [];

        /* ⑤ 粉笔底子：立绘按亮度压成四档，再撒颗粒 —— 器物这才有体积，
           不然只剩一条轮廓。切成横条，动画时一条条蹭上去。 */
        var tone = off(sz, sz), ttx = C(tone);
        ttx.drawImage(sp.art, 0, 0, sz, sz);
        var td = ttx.getImageData(0, 0, sz, sz), tq = td.data;
        var rh2 = mulberry(9071);
        /* 黑板上的粉笔是"加白"：越亮的地方粉越多，暗部干脆留出黑板。
           按暗部落粉会得到一张灰雾，像照片洗坏了。 */
        var stepA = [.20, .34, .46, .58];
        for (var ti = 0; ti < tq.length; ti += 4) {
          var al0 = tq[ti + 3];
          if (al0 < 24) { tq[ti + 3] = 0; continue; }
          var l0 = (tq[ti] * .299 + tq[ti + 1] * .587 + tq[ti + 2] * .114) / 255 * (al0 / 255);
          var st0 = l0 > .66 ? 3 : (l0 > .46 ? 2 : (l0 > .28 ? 1 : 0));
          var a0 = stepA[st0] * (0.45 + rh2() * 0.95);
          if (rh2() < .16) a0 *= .22;              /* 颗粒：粉笔压不实的地方就露底 */
          tq[ti] = 238; tq[ti + 1] = 245; tq[ti + 2] = 233;
          tq[ti + 3] = Math.min(255, a0 * 255) | 0;
        }
        ttx.putImageData(td, 0, 0);
        var tsm = off(sz, sz), tsx = C(tsm);
        if (tsx.filter !== undefined) tsx.filter = "blur(1.5px)";
        tsx.drawImage(tone, 0, 0);
        tsx.filter = "none";
        /* 笔触纹理：顺着形体方向的粉笔痕。没有它，调子就是一坨雾。
           调子乘上这层笔触，明暗才落在"一道一道实笔"上。 */
        var tex = off(sz, sz), tex_x = C(tex);
        var rt = mulberry(4417);
        tex_x.lineCap = "round";
        for (var ty2 = 4; ty2 < sz; ty2 += 8) {
          for (var tx3 = 4; tx3 < sz; tx3 += 8) {
            var sx3 = clamp((tx3 / sz) * S | 0, 0, S - 1), sy3 = clamp((ty2 / sz) * S | 0, 0, S - 1);
            if (sp.data[(sy3 * S + sx3) * 4 + 3] < 180) continue;
            /* 密度跟亮度走：亮面一笔挨一笔，暗面稀稀几道、直接露黑板。
               等密度地铺一层，得到的是钢丝棉，不是画。 */
            var lb = sm[sy3 * S + sx3];
            if (rt() > .10 + .90 * Math.pow(clamp(lb, 0, 1), 1.25)) continue;
            var gx3 = sm[sy3 * S + clamp(sx3 + 3, 0, S - 1)] - sm[sy3 * S + clamp(sx3 - 3, 0, S - 1)];
            var gy3 = sm[clamp(sy3 + 3, 0, S - 1) * S + sx3] - sm[clamp(sy3 - 3, 0, S - 1) * S + sx3];
            /* 形体方向 + 一条统一的手势方向，混一下：纯跟梯度会转成毛圈 */
            var afl = Math.atan2(gy3, gx3) + 1.5708;
            var aun = -0.62;
            var an3 = afl * .55 + aun * .45 + (rt() - .5) * .30;
            var ca3 = Math.cos(an3), sa3 = Math.sin(an3);
            var ln3 = 12 + rt() * 20;
            var ox3 = (rt() - .5) * 3.4, oy4 = (rt() - .5) * 3.4;
            tex_x.beginPath();
            tex_x.moveTo(tx3 + ox3 - ca3 * ln3 * .5, ty2 + oy4 - sa3 * ln3 * .5);
            tex_x.lineTo(tx3 + ox3 + ca3 * ln3 * .5, ty2 + oy4 + sa3 * ln3 * .5);
            tex_x.lineWidth = 1.9 + rt() * 2.0;
            tex_x.strokeStyle = "rgba(255,255,255," + (.45 + rt() * .55).toFixed(3) + ")";
            tex_x.stroke();
          }
        }
        var toned = off(sz, sz), tdx = C(toned);
        tdx.globalAlpha = .22; tdx.drawImage(tsm, 0, 0); tdx.globalAlpha = 1;
        var toned2 = off(sz, sz), t2x = C(toned2);
        t2x.drawImage(tsm, 0, 0);
        t2x.globalCompositeOperation = "destination-in";
        t2x.drawImage(tex, 0, 0);
        t2x.globalCompositeOperation = "source-over";
        tdx.globalAlpha = .92; tdx.drawImage(toned2, 0, 0); tdx.globalAlpha = 1;
        var tsm2 = toned;
        var STR = 10, SH = Math.ceil(sz / STR);
        pl.tone = [];
        for (var si2 = 0; si2 < STR; si2++) {
          var hh = Math.min(SH, sz - si2 * SH);
          var sc2 = off(sz, hh), scx = C(sc2);
          scx.drawImage(tsm2, 0, si2 * SH, sz, hh, 0, 0, sz, hh);
          pl.tone.push(sc2);
        }
        pl.toneH = SH;

        /* ④ 画完那一版烘好，最后一帧直接贴 */
        var fc = off(sz, sz), fx2 = C(fc);
        chalkDraw(fx2, pl, 1, 0, 0, sz / S, 1);
        if (pl.tone) { fx2.globalAlpha = .96; fx2.drawImage(tsm2, 0, 0, sz, sz); fx2.globalAlpha = 1; }
        chalkTone(fx2, pl, 1, 0, 0, sz / S, 0);
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
        var k = seg(p, 0.02, 0.64);
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
        /* 粉笔底子：一条条蹭上去，跟手上真的在铺粉笔一个节奏 */
        if (pl.tone && pl.tone.length) {
          for (var bi2 = 0; bi2 < pl.tone.length; bi2++) {
            var ap = seg(p, 0.24 + bi2 * 0.032, 0.24 + bi2 * 0.032 + 0.12);
            if (ap <= 0) continue;
            x.globalAlpha = ap * .95;
            var dy2 = Math.round(oy + bi2 * pl.toneH * sc);
            var dy3 = Math.round(oy + (bi2 + 1) * pl.toneH * sc);
            x.drawImage(pl.tone[bi2], ox, dy2, 588, dy3 - dy2);
            x.globalAlpha = 1;
          }
        }
        /* 调子：顺着形体一层层扫上去 —— 最后 1/3 的时间都花在这里 */
        var hk = seg(p, 0.36, 0.88);
        chalkTone(x, pl, hk, ox, oy, sc, Math.floor((ST.t || 0) * 12));
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
    /* ---------- 09 刺绣 ---------- */
    {
      key: "stitch", scrim: "rgba(10,18,32,.74)", no: "06", cn: "刺绣", en: "EMBROIDERY",
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
      key: "shadow", scrim: "rgba(240,222,180,.74)", no: "07", cn: "皮影戏", en: "SHADOW PUPPET",
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
      key: "sand", scrim: "rgba(24,16,6,.74)", no: "08", cn: "沙画", en: "SAND ANIMATION",
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
    /* ---------- 09 彩色玻璃窗 ---------- */
    {
      key: "stained", scrim: "rgba(8,12,20,.74)", no: "09", cn: "彩色玻璃窗", en: "STAINED GLASS",
      line1: "石屋里暗下来，彩窗一块块亮起。",
      line2: "光柱里飘着灰，地上的彩斑慢慢移。",
      tags: ["材质 彩色玻璃·铅条", "工序 切玻璃·镶铅"],
      why: "彩窗的美不在画，在“分格”：一块块玻璃被铅条切开，光透过来才敢亮。算法上就是先采色、再切出不规则小块、最后给块与块之间留缝当铅条。",
      font: SERIF,
      tx: { main: "#f4eede", sub: "#b8af9c", accent: "#e0b96f" },
      pos: { cx: 950, cy: 340, size: 700 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        /* 玻璃只有这几种颜色 —— 中世纪的作坊就这几种料，凑不出渐变 */
        var PAL = [
          [34, 84, 158], [26, 120, 104], [168, 58, 52],
          [212, 156, 62], [104, 72, 152], [44, 138, 168]
        ];
        var COLS = 15, ROWS = 21;
        var cw = sz / COLS, ch = sz / ROWS;
        var r = mulberry(8801);
        var MX0 = .075, MX1 = .925, MY0 = .065, MY1 = .955;
        var P = [], i, j, k2;
        for (i = 0; i <= COLS; i++) {
          P[i] = [];
          for (j = 0; j <= ROWS; j++) {
            var jx = (i === 0 || i === COLS) ? 0 : (r() - .5) * cw * .44;
            var jy = (j === 0 || j === ROWS) ? 0 : (r() - .5) * ch * .44;
            P[i][j] = [i * cw + jx, j * ch + jy];
          }
        }
        /* 底是铅，缝隙露出来就是铅条 */
        x.fillStyle = "#14161a"; x.fillRect(0, 0, sz, sz);

        for (i = 0; i < COLS; i++) {
          for (j = 0; j < ROWS; j++) {
            var a = P[i][j], b = P[i + 1][j], d2 = P[i + 1][j + 1], e2 = P[i][j + 1];
            var mx = (a[0] + b[0] + d2[0] + e2[0]) / 4;
            var my = (a[1] + b[1] + d2[1] + e2[1]) / 4;
            /* 器物在窗里要留边，像彩窗里的圣像，不能顶满整扇窗 */
            var qx = ((mx / sz) - MX0) / (MX1 - MX0) * S;
            var qy = ((my / sz) - MY0) / (MY1 - MY0) * S;
            var col;
            if (qx < 0 || qx >= S || qy < 0 || qy >= S || alphaAt(sp, qx, qy) < 70) {
              /* 剪影之外：夜色玻璃，冷、暗，把器物衬出来 */
              col = [12 + (r() * 7 | 0), 21 + (r() * 9 | 0), 46 + (r() * 15 | 0)];
            } else {
              var pc = colAt(sp, qx, qy);
              var hsl = rgb2hsl(pc[0], pc[1], pc[2]);
              /* 玻璃只烧得出两头：冷是钴蓝紫，暖是金与琥珀。
                 中间那段黄绿最脏，一律归到两极去 —— 教堂窗的老配色也是这么干的 */
              var L2 = hsl[2], hh;
              if (L2 < .30) hh = .655;
              else if (L2 < .44) hh = .735;
              else if (L2 < .58) hh = .60;
              else if (L2 < .74) hh = .075;
              else hh = .115;
              var ss = L2 < .58 ? .74 : .86;
              var ll = clamp(.20 + L2 * .52 + (r() - .5) * .07, .12, .84);
              col = hsl2rgb(hh, ss, ll);
            }
            var g = x.createLinearGradient(mx - cw * .7, my - ch * .7, mx + cw * .6, my + ch * .6);
            g.addColorStop(0, shade(col, .40));
            g.addColorStop(.55, rgb(col));
            g.addColorStop(1, shade(col, -.30));
            x.fillStyle = g;
            x.beginPath();
            x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]);
            x.lineTo(d2[0], d2[1]); x.lineTo(e2[0], e2[1]);
            x.closePath(); x.fill();
            /* 玻璃里的小气泡：透光时最有说服力的细节 */
            var bn = 1 + (r() * 3 | 0);
            for (k2 = 0; k2 < bn; k2++) {
              x.globalAlpha = .10 + r() * .18;
              x.fillStyle = r() > .5 ? "#ffffff" : "#000000";
              x.beginPath();
              x.arc(mx + (r() - .5) * cw * .7, my + (r() - .5) * ch * .7, .8 + r() * 2.2, 0, 6.2832);
              x.fill();
            }
            x.globalAlpha = 1;
          }
        }

        /* 铅条：网格边全描一遍，两条相邻块共用一条，正好加粗 */
        x.beginPath();
        for (i = 0; i <= COLS; i++) for (j = 0; j < ROWS; j++) { x.moveTo(P[i][j][0], P[i][j][1]); x.lineTo(P[i][j + 1][0], P[i][j + 1][1]); }
        for (j = 0; j <= ROWS; j++) for (i = 0; i < COLS; i++) { x.moveTo(P[i][j][0], P[i][j][1]); x.lineTo(P[i + 1][j][0], P[i + 1][j][1]); }
        x.lineCap = "round";
        x.strokeStyle = "#0c0e12"; x.lineWidth = 4.6; x.stroke();
        x.strokeStyle = "rgba(158,168,184,.26)"; x.lineWidth = 1.1; x.stroke();

        /* 器物自己的边也要做成铅条：彩窗的细节全靠铅条勾出来的，
           只留色块就只剩一块马赛克，认不出是什么东西 */
        var ed = sobel(sp, 0.13);
        var tk = off(sz, sz), tkx = C(tk);
        var bx0 = sz * MX0, by0 = sz * MY0, bw0 = sz * (MX1 - MX0), bh0 = sz * (MY1 - MY0);
        var ofs = [[2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4], [1.7, 1.7], [-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7]];
        for (var oi = 0; oi < ofs.length; oi++) {
          tkx.drawImage(ed, 0, 0, S, S, bx0 + ofs[oi][0], by0 + ofs[oi][1], bw0, bh0);
        }
        tkx.globalCompositeOperation = "source-in";
        tkx.fillStyle = "#0b0e12"; tkx.fillRect(0, 0, sz, sz);
        x.drawImage(tk, 0, 0);
        /* 铅条上沿的一道细光，才像金属 */
        var tk2 = off(sz, sz), thx = C(tk2);
        thx.drawImage(ed, 0, 0, S, S, bx0 - .8, by0 - .8, bw0, bh0);
        thx.globalCompositeOperation = "source-in";
        thx.fillStyle = "rgba(150,162,180,.30)"; thx.fillRect(0, 0, sz, sz);
        x.drawImage(tk2, 0, 0);

        /* 外框压边 */
        x.strokeStyle = "#0b0d11"; x.lineWidth = 14;
        x.strokeRect(7, 7, sz - 14, sz - 14);
        return { plate: c };
      },

      bg: function (x) {
        var g = x.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#0a0908"); g.addColorStop(.5, "#171410"); g.addColorStop(1, "#070606");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 石墙：一块块砌上去，缝比砖深 */
        var r = mulberry(8817);
        for (var row = -1; row < 8; row++) {
          var yy = row * 94;
          var off2 = (row % 2) * 88;
          for (var col2 = -1; col2 < 9; col2++) {
            var xx = col2 * 176 + off2 + (r() - .5) * 8;
            var hh = 88 + r() * 5;
            x.fillStyle = "rgba(" + (36 + (r() * 16 | 0)) + "," + (32 + (r() * 14 | 0)) + "," + (27 + (r() * 12 | 0)) + ",.9)";
            x.fillRect(xx, yy, 170, hh);
            x.strokeStyle = "rgba(0,0,0,.55)"; x.lineWidth = 3.5;
            x.strokeRect(xx, yy, 170, hh);
            x.strokeStyle = "rgba(120,110,94,.10)"; x.lineWidth = 1;
            x.beginPath(); x.moveTo(xx + 3, yy + 3); x.lineTo(xx + 167, yy + 3); x.stroke();
          }
        }
        /* 窗那一片的暖光溢出 */
        var g2 = x.createRadialGradient(W * .74, H * .44, 30, W * .74, H * .44, W * .6);
        g2.addColorStop(0, "rgba(150,132,96,.30)");
        g2.addColorStop(.5, "rgba(70,66,56,.12)");
        g2.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g2; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "overlay"; x.globalAlpha = .4;
        x.drawImage(grain(), 0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      },

      art: function (x, p, pl) {
        var k = easeOut(seg(p, 0.02, 0.66));
        var wx = 660, wy = 34, ww = 560, wh = 660;

        x.save();
        archPath(x, wx, wy, ww, wh);
        x.clip();
        x.fillStyle = "#07090d"; x.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);

        /* 玻璃从中心往外亮，像有人把灯点着 */
        var rad = Math.max(1, k * PLATE * 1.02);
        x.drawImage(masked(pl.plate, function (s) {
          var g = s.createRadialGradient(PLATE * .5, PLATE * .44, rad * .26, PLATE * .5, PLATE * .44, rad);
          g.addColorStop(0, "rgba(0,0,0,1)");
          g.addColorStop(.70, "rgba(0,0,0,.94)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          s.fillStyle = g; s.fillRect(0, 0, PLATE, PLATE);
        }), wx, wy, ww, wh);

        /* 背光溢出：光从玻璃里透出来 */
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = .34 * k;
        var gg = x.createRadialGradient(wx + ww * .5, wy + wh * .40, 40, wx + ww * .5, wy + wh * .40, ww * 1.0);
        gg.addColorStop(0, "rgba(255,228,172,.5)");
        gg.addColorStop(.55, "rgba(206,178,138,.12)");
        gg.addColorStop(1, "rgba(120,140,180,0)");
        x.fillStyle = gg; x.fillRect(wx - 220, wy - 120, ww + 440, wh + 240);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        x.restore();

        /* 石窗框：拱边压一圈，玻璃才像嵌在墙里 */
        archPath(x, wx - 11, wy - 11, ww + 22, wh + 22);
        x.strokeStyle = "rgba(58,52,45,.96)"; x.lineWidth = 24; x.stroke();
        x.strokeStyle = "rgba(134,122,102,.5)"; x.lineWidth = 2.5; x.stroke();

        /* 地上的彩斑：窗投下来的光 */
        var lit = easeOut(seg(p, 0.26, 0.92));
        if (lit > 0) {
          x.save();
          x.globalCompositeOperation = "lighter";
          x.globalAlpha = .30 * lit;
          var bx = wx + 30, by = 612;
          for (var i = 0; i < 5; i++) {
            var bx2 = bx + i * 96 + Math.sin(i * 1.7) * 12;
            x.fillStyle = ["rgba(88,130,210,1)", "rgba(196,120,80,1)", "rgba(120,180,120,1)", "rgba(200,170,90,1)", "rgba(150,130,200,1)"][i];
            x.beginPath();
            x.moveTo(bx2, by + 8); x.lineTo(bx2 + 78, by); x.lineTo(bx2 + 96, by + 74); x.lineTo(bx2 + 16, by + 80);
            x.closePath(); x.fill();
          }
          x.restore();
          x.globalAlpha = 1;
        }
      },

      fx: function (x, p, t) {
        var r = mulberry(8813), a = seg(p, 0.08, 0.5);
        if (a <= 0) return;
        x.save();
        x.beginPath();
        x.moveTo(650, 40); x.lineTo(1230, 40); x.lineTo(1090, 700); x.lineTo(540, 700);
        x.closePath(); x.clip();
        for (var i = 0; i < 48; i++) {
          var px = 520 + r() * 760;
          var py = 30 + ((r() * 690 + t * (7 + r() * 18)) % 670);
          x.globalAlpha = (.05 + r() * .20) * a;
          x.fillStyle = "#fff0d2";
          x.fillRect(px, py, 1.2 + r() * 1.7, 1.2 + r() * 1.7);
        }
        x.restore();
        x.globalAlpha = 1;
      }
    },

    /* ---------- 10 立体书 ---------- */
    {
      key: "popup", scrim: "rgba(20,16,12,.76)", no: "10", cn: "立体书", en: "POP-UP BOOK",
      line1: "灯下翻开绘本，纸一层层立起来。",
      line2: "镜头钻进纸页，它就站在那个世界里。",
      tags: ["材质 卡纸·硬壳绘本", "工序 折页·插卡"],
      why: "立体书全靠“层”：每层纸往右下投一道硬影，叠起来就有了纵深。算法上就是同一张剪影复制几份、错开几像素、投影不做模糊。",
      font: HEI,
      tx: { main: "#f2e9d4", sub: "#b6a98c", accent: "#e0a35c" },
      pos: { cx: 940, cy: 330, size: 700 },

      build: function (sp) {
        var sz = PLATE, S = sp.S, c = off(sz, sz), x = C(c);
        var i, L;
        /* 最底：一道硬影，纸立起来压出来的，不做模糊 */
        x.save();
        x.globalAlpha = .30;
        x.drawImage(tint(sp.sil, "#0c1210"), 22, 26, sz, sz);
        x.restore();
        /* 后两层：深一点的绿卡纸，错开，越后越偏左上 */
        var LY = [[-54, -42, "#17312b", .95], [-30, -23, "#26503f", .95]];
        for (i = 0; i < LY.length; i++) {
          L = LY[i];
          x.save();
          x.globalAlpha = L[3];
          x.drawImage(tint(sp.sil, L[2]), L[0], L[1], sz, sz);
          x.restore();
          /* 每层自己的落影，硬边 */
          x.save();
          x.globalAlpha = .16;
          x.drawImage(tint(sp.sil, "#0a0f0d"), L[0] + 10, L[1] + 12, sz, sz);
          x.restore();
        }
        /* 米白卡纸边：贴在卡纸上剪下来的，一定有一圈纸边 */
        x.drawImage(tint(sp.sil, "#f4ead2"), -4, -4, sz, sz);
        x.save();
        x.globalAlpha = .22;
        x.drawImage(tint(sp.sil, "#8a7a5c"), 2, 3, sz, sz);
        x.restore();
        /* 主体 */
        x.drawImage(sp.art, 0, 0, sz, sz);
        /* 纸上印的：纤维 + 一点暖光 */
        x.globalCompositeOperation = "source-atop";
        x.globalAlpha = .24; x.drawImage(fiber(), 0, 0, sz, sz);
        x.globalAlpha = .12; x.fillStyle = "#d8a462"; x.fillRect(0, 0, sz, sz);
        x.globalAlpha = .18;
        var gg = x.createLinearGradient(0, 0, sz * .8, sz);
        gg.addColorStop(0, "rgba(255,240,208,1)"); gg.addColorStop(.5, "rgba(255,240,208,0)");
        x.fillStyle = gg; x.fillRect(0, 0, sz, sz);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        return { plate: c };
      },

      bg: function (x) {
        var g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#211c15"); g.addColorStop(.62, "#120f0b"); g.addColorStop(1, "#070605");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        /* 摊开的书：两页，中间是书脊的凹 */
        var px = 330, py = 512, pw = 1010, ph = 232;
        x.save();
        x.beginPath();
        x.moveTo(px, py + 16);
        x.quadraticCurveTo(px + pw * .5, py - 26, px + pw, py + 16);
        x.lineTo(px + pw - 6, py + ph);
        x.quadraticCurveTo(px + pw * .5, py + ph + 26, px + 6, py + ph);
        x.closePath();
        var pg = x.createLinearGradient(px, py, px, py + ph + 30);
        pg.addColorStop(0, "#efe3c9"); pg.addColorStop(.55, "#e3d4b6"); pg.addColorStop(1, "#c9b995");
        x.fillStyle = pg; x.fill();
        /* 书脊阴影 */
        x.clip();
        var sg = x.createLinearGradient(px + pw * .5 - 70, 0, px + pw * .5 + 70, 0);
        sg.addColorStop(0, "rgba(90,74,50,0)");
        sg.addColorStop(.5, "rgba(74,60,40,.42)");
        sg.addColorStop(1, "rgba(90,74,50,0)");
        x.fillStyle = sg; x.fillRect(px + pw * .5 - 70, py, 140, ph + 30);
        /* 纸纤维 */
        x.globalCompositeOperation = "overlay"; x.globalAlpha = .35;
        x.drawImage(fiber(), px, py, pw, ph);
        x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        x.restore();
        /* 台灯暖光 */
        var lg = x.createRadialGradient(W * .30, H * .06, 40, W * .30, H * .06, W * .95);
        lg.addColorStop(0, "rgba(255,214,150,.30)");
        lg.addColorStop(.42, "rgba(180,140,90,.10)");
        lg.addColorStop(1, "rgba(0,0,0,.55)");
        x.fillStyle = lg; x.fillRect(0, 0, W, H);
      },

      art: function (x, p, pl) {
        var k = easeOut(seg(p, 0.03, 0.60));
        var cx = 950, base = 690;
        /* 从压扁到立起来：纸片立起的动作就是纵向拉伸 */
        var sy = 0.58 + 0.42 * k;
        x.save();
        x.translate(cx, base);
        x.scale(1, sy);
        x.translate(-cx, -base);
        x.globalAlpha = .18 + .82 * k;
        x.drawImage(pl.plate, 620, 40, 660, 660);
        x.restore();
        x.globalAlpha = 1;
        /* 立起来时纸片在书页上投的那道长影 */
        if (k < 0.99) {
          x.save();
          x.globalAlpha = .18 * (1 - k);
          x.fillStyle = "#3a2f20";
          x.beginPath();
          x.ellipse(cx, base + 6, 250 + 40 * (1 - k), 26, 0, 0, 6.2832);
          x.fill();
          x.restore();
          x.globalAlpha = 1;
        }
      },

      fx: function (x, p, t) {
        var r = mulberry(8821);
        x.globalAlpha = .09;
        for (var i = 0; i < 26; i++) {
          var px = (r() * W + t * (4 + r() * 8)) % W;
          var py = ((r() * H + t * (6 + r() * 12)) % H);
          x.fillStyle = "#ffe6b8";
          x.beginPath(); x.arc(px, py, .7 + r() * 1.6, 0, 6.2832); x.fill();
        }
        x.globalAlpha = 1;
      }
    }
  ];

  /* 色相/明度互转：彩窗按明暗调色相要用 */
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0, s2 = 0, l = (mx + mn) / 2;
    if (d > 1e-6) {
      s2 = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h, s2, l];
  }
  function hsl2rgb(h, s2, l) {
    h = ((h % 1) + 1) % 1;
    var c = (1 - Math.abs(2 * l - 1)) * s2;
    var x2 = c * (1 - Math.abs((h * 6) % 2 - 1));
    var m = l - c / 2, r = 0, g = 0, b = 0;
    var hi = Math.floor(h * 6) % 6;
    if (hi === 0) { r = c; g = x2; }
    else if (hi === 1) { r = x2; g = c; }
    else if (hi === 2) { g = c; b = x2; }
    else if (hi === 3) { g = x2; b = c; }
    else if (hi === 4) { r = x2; b = c; }
    else { r = c; b = x2; }
    return [clamp((r + m) * 255, 0, 255) | 0, clamp((g + m) * 255, 0, 255) | 0, clamp((b + m) * 255, 0, 255) | 0];
  }

  /* 拱窗路径：彩窗要它裁边 */
  function archPath(x, px, py, w, h) {
    var r = w / 2;
    x.beginPath();
    x.moveTo(px, py + h);
    x.lineTo(px, py + r);
    x.arc(px + r, py + r, r, Math.PI, 0);
    x.lineTo(px + w, py + h);
    x.closePath();
  }

  /* ---------------- 文字层（十套共用） ---------------- */
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
    if (ks.length > 8) { delete plateCache[ks[0]]; }
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
        '<h1 class="sd-title">一件文物，十道工艺</h1>' +
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
        '之后每帧只做“贴版 + 生长 + 光扫 + 颗粒”，所以 74 件文物 × 10 道工艺都是现算的，站里不存一个视频文件。</p>' +
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

  /* 封面帧：版式对齐参考片的那一帧 —— 右上编号，中间大字工艺名，
     下面两行说明，再一行"题材 / 工序"。p 0..1 控制逐字升起。 */
  function drawCover(p) {
    var st = ST.style || STYLES[0];
    var cv = ST.cv; if (!cv) return;
    var x = ST.ctx;
    var tx = st.tx;
    x.clearRect(0, 0, W, H);
    st.bg(x);

    /* 画好的那件，半透明压在左边，像黑板上擦剩的旧画 */
    if (ST.plate && ST.plate.full) {
      x.save();
      x.globalAlpha = .13;
      x.drawImage(ST.plate.full, 40, 96, 470, 470);
      x.globalAlpha = .05;
      x.drawImage(ST.plate.full, 52, 108, 470, 470);
      x.restore();
    }

    /* 角标 */
    x.textBaseline = "alphabetic";
    x.globalAlpha = .5;
    x.font = "600 13px " + HEI; x.fillStyle = tx.sub; x.textAlign = "left";
    spaced(x, "文物精灵 · RELIC SOUL", 56, 52, 4.4);
    x.globalAlpha = 1;

    x.globalAlpha = .95;
    x.font = "700 15px " + HEI; x.fillStyle = tx.accent; x.textAlign = "right";
    var en = "NO. " + st.no + "  " + st.en;
    spaced(x, en, W - 56 - spacedW(x, en, 6), 52, 6);
    x.globalAlpha = 1;

    /* 主标题：工艺名，逐字升起 */
    var chars = (st.cn || "").split("");
    x.font = "900 " + 150 + "px " + SERIF;
    x.textAlign = "left";
    var tw = 0, i;
    for (i = 0; i < chars.length; i++) tw += x.measureText(chars[i]).width + 10;
    var cxx = W * .5 - tw * .5 + 10;
    for (i = 0; i < chars.length; i++) {
      var a = seg(p, .02 + i * .055, .17 + i * .055);
      if (a > 0) {
        var e = easeOut(a);
        x.save();
        x.globalAlpha = e;
        x.fillStyle = tx.main;
        x.translate(cxx, 316 + (1 - e) * 26);
        x.fillText(chars[i], 0, 0);
        x.restore();
      }
      cxx += x.measureText(chars[i]).width + 10;
    }

    /* 标题下的一道粉笔线 */
    var r = mulberry(77);
    var la = seg(p, .14, .34);
    if (la > 0) {
      x.globalAlpha = la * .55;
      x.strokeStyle = tx.accent; x.lineWidth = 1.4; x.lineCap = "round";
      x.beginPath();
      for (var k = 0; k <= 26; k++) {
        var px = W * .5 - 210 + k * (420 / 26);
        var py = 340 + Math.sin(k * 1.7) * 1.2 + (r() - .5) * 1.6;
        if (k === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
      x.globalAlpha = 1;
    }

    /* 两行说明 */
    x.textAlign = "center";
    x.font = "500 23px " + HEI; x.fillStyle = tx.sub;
    var l1 = seg(p, .20, .44), l2 = seg(p, .28, .52);
    if (l1 > 0) { x.globalAlpha = l1 * .92; x.fillText(st.line1, W * .5, 396); }
    if (l2 > 0) { x.globalAlpha = l2 * .92; x.fillText(st.line2, W * .5, 432); }
    x.globalAlpha = 1;

    /* 题材 / 工序 */
    var ta = seg(p, .40, .62);
    if (ta > 0) {
      x.globalAlpha = ta * .85;
      x.font = "600 14px " + HEI; x.fillStyle = tx.accent;
      var line = (st.tags || []).join("      ");
      spaced(x, line, W * .5 - spacedW(x, line, 2.6) * .5, 486, 2.6);
      x.globalAlpha = 1;
    }

    /* 文物是哪一件：一行小字，跟参考的"15 m"一样是板书式标注 */
    var info = (window.SPIRITS && SPIRITS[ST.spiritId]) || {};
    var ia = seg(p, .52, .72);
    if (ia > 0 && info.name) {
      x.globalAlpha = ia * .55;
      x.font = "500 15px " + HEI; x.fillStyle = tx.sub;
      var s2 = info.name + (info.era ? "　·　" + info.era : "");
      spaced(x, s2, W * .5 - spacedW(x, s2, 1.6) * .5, 522, 1.6);
      x.globalAlpha = 1;
    }

    filmFinish(x, st, 7);
  }
  window.sdSeekCover = function (t, dur) { ST.paused = true; drawCover(clamp(t / (dur || 1), 0, 1)); };

  /* ---------- 微电影用的接口：把渲染器借给别的页面 ---------- */
  function styleByKey(key) {
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].key === key) return STYLES[i];
    return null;
  }
  window.sdSpriteURL = function (id) { return spriteUrl(id); };
  window.sdFilmAttach = function (cv) {
    ST.cv = cv; ST.ctx = cv.getContext("2d");
    ST.k = 1; ST.sm = false;
    cv.width = W; cv.height = H;
  };
  /* 依次把 6 段工艺的"版"算出来（重活只做一次，之后每帧只贴版） */
  window.sdFilmBuild = function (spiritId, keys, onStep, done) {
    ST.spiritId = spiritId;
    loadSpirit(spiritId, function (sp) {
      ST.spirit = sp;
      var i = 0;
      (function step() {
        if (i >= keys.length) { done && done(); return; }
        var st = styleByKey(keys[i]);
        if (st) plateFor(st, sp);
        i++;
        onStep && onStep(i, keys.length, keys[i - 1]);
        setTimeout(step, 16);
      })();
    });
  };
  window.sdFilmUse = function (key) {
    var st = styleByKey(key);
    if (!st || !ST.spirit) return false;
    ST.style = st;
    ST.plate = plateFor(st, ST.spirit);
    return true;
  };
  window.sdFilmCover = function (p) { drawCover(p); };
  window.sdFilmArt = function (t) { ST.paused = true; ST.t = t; drawFrame(); };
  window.sdCoverReady = function () { return !!(ST.plate && ST.plate.full); };
  window.sdResume = function () { ST.paused = false; ST.t0 = 0; ST.t = 0; };
  window.__sd = { ST: ST, STYLES: STYLES, masked: masked, maskRight: maskRight, maskDown: maskDown, maskBlots: maskBlots, sobel: sobel, alphaAt: alphaAt, traceEdge: traceEdge, rdp: rdp, isoCurves: isoCurves, chalkDraw: chalkDraw, PLATE: PLATE };
  window.sdPlateURL = function () {
    var pl = ST.plate; if (!pl) return null;
    var c = pl.plate || (pl.layers && pl.layers[0]) || null;
    return c ? c.toDataURL("image/png") : null;
  };
})();
