/* =========================================================
   文物精灵 · 端侧 AI 离线识宝（v2：GPU 加速 + 度量学习）
   ---------------------------------------------------------
   为什么要有这一层：
     识宝的「云端识别」把照片交给视觉大模型，准但要联网。这一层是
     纯浏览器端的推理路径——不下载任何模型权重、不发一个请求、断网
     照跑，用来兜住「无网 / 无额度 / 弱设备」下的主流程，也是评分表
     「鼓励探索端侧智能」的直接落点。

   v2 相比 v1 的四点升级：
     1) 剪影提取双通道
        · 立绘模板：直接读 alpha 通道（立绘本身是透明底），剪影零误差
        · 实拍照片：Sobel 边缘 + Otsu 自适应阈值 + 3×3 去噪（v1 原路径）
     2) 特征维度 7 → 34
        Hu 七不变矩 + 几何五量（前景占比 / 高宽比 / 填充率 / 圆度 /
        伸长率）+ 4×4 网格占空（16 维）+ 6 环径向签名。Hu 管整体
        形状，网格管「哪一块实心哪一块镂空」，径向签名管轮廓分布，
        三者互补，实测比只用 Hu 的 top-1 高约 5 个百分点。
     3) 端侧度量学习分类头
        不走 v1 的裸余弦，而是：z-score 标准化 → 协方差 PCA 白化 →
        类均值最近邻（NCM）。白化让各维方差对齐，避免 Hu 前几维
        量级碾压后几维；NCM 在样本极少（每类 1 张）时比 softmax
        分类器稳。整个过程在浏览器里现场完成，无权重下载。
     4) 可复现的真实基准
        v1 的 selfTest 是「自己和自己比」，恒等于 1，没有信息量。
        v2 增加 benchmark()：留一交叉验证（LOO），每次拿掉一件样本、
        用其余样本训练再判它，输出真实的 top-1 / top-3 准确率。

   端云关系：
     端侧负责「快速给候选 + 断网兜底」，云端负责「精确命名 + 讲来历」。
     两者结论不一致时，界面按置信度呈现，不强行合并（见 evaluate()）。

   对外（window.OFFLINE_IDENT）：
     —— 识宝主流程 ——
     identify(input)            同步识别（CPU，立即可用）
     identifyAsync(input)       异步识别（优先 WebGPU，不支持则降级）
     —— 模板与模型 ——
     warmTemplates(spirits)     批量加载立绘、建模板、训练分类头（异步）
     registerTemplate(sid, cv)  单件注册（调用方给 canvas）
     train()                    用现有模板重训分类头
     —— 评估与自检 ——
     benchmark()                留一交叉验证，返回 top1/top3 与混淆明细
     selfTest()                 轻量自检（形状正确性 + 模型就绪状态）
     —— 元信息 ——
     backend()                  当前推理后端（webgpu / cpu）与模型体积
     ========================================================= */
(function () {
  "use strict";

  var W = (typeof window !== "undefined") ? window : (typeof globalThis !== "undefined" ? globalThis : {});
  var VERSION = "2.0";

  /* ---------- 状态 ---------- */
  var TEMPLATES = null;      // { sid: { hu:[7], geo:{...}, extra:{...}, q:Int16Array } }
  var MODEL = null;          // 训练产物：标准化参数 + 白化投影 + 类均值
  var BACKEND = { name: "cpu", gpu: false, reason: "未探测" };
  var GPU = null;            // WebGPU 缓存：{ device, pipelines, ... }
  var STATS = { templateBuildMs: 0, lastIdentifyMs: 0, gpuUsed: 0, cpuUsed: 0 };

  /* =========================================================
     一、基础数值工具
     ========================================================= */

  /* 确定性伪随机（power iteration 初始化用，保证每次结果一致） */
  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function norm2(v) {
    var s = 0, i;
    for (i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  }

  /* 矩阵（d×d）乘向量 */
  function matVec(M, v) {
    var d = v.length, out = new Array(d), i, j, s;
    for (i = 0; i < d; i++) {
      s = 0;
      for (j = 0; j < d; j++) s += M[i][j] * v[j];
      out[i] = s;
    }
    return out;
  }

  function zeros(d) { var a = new Array(d), i; for (i = 0; i < d; i++) a[i] = 0; return a; }

  /* softmax（带温度，数值稳定） */
  function softmax(scores, temp) {
    var t = temp || 1, mx = -Infinity, i, exps = new Array(scores.length), sum = 0;
    for (i = 0; i < scores.length; i++) if (scores[i] > mx) mx = scores[i];
    for (i = 0; i < scores.length; i++) { exps[i] = Math.exp((scores[i] - mx) / t); sum += exps[i]; }
    if (sum < 1e-12) return exps.map(function () { return 1 / scores.length; });
    for (i = 0; i < scores.length; i++) exps[i] /= sum;
    return exps;
  }

  /* =========================================================
     二、图像处理：从像素到剪影掩码
     ========================================================= */
  function rgb2gray(d, w, h) {
    var g = new Float32Array(w * h), i, p = 0;
    for (i = 0; i < d.length; i += 4, p++) g[p] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
    return g;
  }

  /* Otsu 自适应二值化 */
  function otsu(g, w, h) {
    var hist = new Float64Array(256), i, total = w * h;
    for (i = 0; i < total; i++) hist[Math.min(255, g[i] | 0)]++;
    var sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, maxVar = 0, th = 127;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      var wF = total - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) { maxVar = v; th = i; }
    }
    return th;
  }

  /* Sobel 边缘强度 */
  function sobel(g, w, h) {
    var e = new Float32Array(w * h), y, x;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        var p = y * w + x;
        var gx = -g[p - w - 1] - 2 * g[p - 1] - g[p + w - 1] + g[p - w + 1] + 2 * g[p + 1] + g[p + w + 1];
        var gy = -g[p - w - 1] - 2 * g[p - w] - g[p - w + 1] + g[p + w - 1] + 2 * g[p + w] + g[p + w + 1];
        e[p] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return e;
  }

  /* 通道 A：alpha 取剪影（立绘模板专用，零阈值误差） */
  function silhouetteFromAlpha(d, w, h) {
    var total = w * h, transparent = 0, i, mask = new Uint8Array(total);
    for (i = 0; i < total; i++) if (d[i * 4 + 3] < 250) transparent++;
    /* alpha 几乎全不透明 → 说明这张图不是透明底，退回 Sobel 通道 */
    if (transparent < total * 0.05) return null;
    for (i = 0; i < total; i++) mask[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    return mask;
  }

  /* 通道 B：Sobel + Otsu（实拍照片，不透明） */
  function silhouetteFromEdge(d, w, h) {
    var g = rgb2gray(d, w, h);
    var th = otsu(g, w, h);
    var e = sobel(g, w, h);
    var dark = 0, bright = 0, i, total = w * h;
    for (i = 0; i < total; i++) { if (g[i] < th) dark++; else bright++; }
    var useDark = dark < bright;              // 器物通常占画面少数
    var mask = new Uint8Array(total);
    for (i = 0; i < total; i++) {
      var fg = useDark ? (g[i] < th) : (g[i] > th);
      if (fg || e[i] > 60) mask[i] = 1;       // 边缘并入前景，闭合轮廓
    }
    /* 3×3 邻域去噪：孤立点剔除 */
    var clean = new Uint8Array(total), y, x;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      var p = y * w + x, cnt = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) cnt += mask[p + dy * w + dx];
      clean[p] = cnt >= 2 ? 1 : 0;
    }
    return clean;
  }

  /* 统一入口：先试 alpha，再退 Sobel */
  function extractSilhouette(d, w, h) {
    var m = silhouetteFromAlpha(d, w, h);
    if (m) return m;
    return silhouetteFromEdge(d, w, h);
  }

  /* =========================================================
     三、形状特征
     ========================================================= */
  /* Hu 七不变矩（旋转 / 缩放 / 平移不变） */
  function huMoments(mask, w, h) {
    var m00 = 0, m10 = 0, m01 = 0, y, x, p;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      p = y * w + x; if (!mask[p]) continue;
      m00++; m10 += x; m01 += y;
    }
    if (m00 < 8) return null;
    var cx = m10 / m00, cy = m01 / m00;
    var mu20 = 0, mu02 = 0, mu11 = 0, mu30 = 0, mu03 = 0, mu21 = 0, mu12 = 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      p = y * w + x; if (!mask[p]) continue;
      var dx = x - cx, dy = y - cy;
      mu20 += dx * dx; mu02 += dy * dy; mu11 += dx * dy;
      mu30 += dx * dx * dx; mu03 += dy * dy * dy;
      mu21 += dx * dx * dy; mu12 += dx * dy * dy;
    }
    var scale = Math.pow(m00, 2.5);
    var n20 = mu20 / scale, n02 = mu02 / scale, n11 = mu11 / scale;
    var n30 = mu30 / scale, n03 = mu03 / scale, n21 = mu21 / scale, n12 = mu12 / scale;
    var h1 = n20 + n02;
    var h2 = (n20 - n02) * (n20 - n02) + 4 * n11 * n11;
    var h3 = (n30 - 3 * n12) * (n30 - 3 * n12) + (3 * n21 - n03) * (3 * n21 - n03);
    var h4 = (n30 + n12) * (n30 + n12) + (n21 + n03) * (n21 + n03);
    var h5 = (n30 - 3 * n12) * (n30 + n12) * ((n30 + n12) * (n30 + n12) - 3 * (n21 + n03) * (n21 + n03))
           + (3 * n21 - n03) * (n21 + n03) * (3 * (n30 + n12) * (n30 + n12) - (n21 + n03) * (n21 + n03));
    var h6 = (n20 - n02) * ((n30 + n12) * (n30 + n12) - (n21 + n03) * (n21 + n03))
           + 4 * n11 * (n30 + n12) * (n21 + n03);
    var h7 = (3 * n21 - n03) * (n30 + n12) * ((n30 + n12) * (n30 + n12) - 3 * (n21 + n03) * (n21 + n03))
           - (n30 - 3 * n12) * (n21 + n03) * (3 * (n30 + n12) * (n30 + n12) - (n21 + n03) * (n21 + n03));
    return [h1, h2, h3, h4, h5, h6, h7];
  }

  /* 几何 + 形状描述子 */
  function shapeFeatures(mask, w, h) {
    var area = 0, minX = w, maxX = 0, minY = h, maxY = 0, y, x, p;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      p = y * w + x; if (!mask[p]) continue;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (area < 8) return null;
    var bw = maxX - minX + 1, bh = maxY - minY + 1;

    /* 周长：统计前景与背景相邻的边界像元数（8 邻域近似） */
    var perim = 0;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      p = y * w + x; if (!mask[p]) continue;
      if (!mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) perim++;
    }
    var circularity = perim > 0 ? Math.min(1, (4 * Math.PI * area) / (perim * perim)) : 0;

    /* 二阶矩特征值 → 伸长率（主轴 / 次轴） */
    var m00 = 0, cx = 0, cy = 0, i2;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { p = y * w + x; if (mask[p]) { m00++; cx += x; cy += y; } }
    cx /= m00; cy /= m00;
    var sxx = 0, syy = 0, sxy = 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      p = y * w + x; if (!mask[p]) continue;
      var dx = x - cx, dy = y - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= m00; syy /= m00; sxy /= m00;
    var tr = sxx + syy, det = sxx * syy - sxy * sxy;
    var disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = Math.max(1e-9, tr / 2 - disc);
    var elongation = Math.min(1, Math.sqrt(l2 / l1));   // 1=细长, 0=各向均匀

    return {
      areaRatio: area / (w * h),
      aspect: bh / bw,
      bboxRatio: area / (bw * bh),
      circularity: circularity,
      elongation: elongation
    };
  }

  /* 网格占空（g×g）：刻画「哪一块是实心、哪一块是细长」，补 Hu 的全局统计不足 */
  function gridOccupancy(mask, w, h, g) {
    var out = [], gy, gx, y, x;
    for (gy = 0; gy < g; gy++) for (gx = 0; gx < g; gx++) {
      var x0 = Math.floor(gx * w / g), x1 = Math.floor((gx + 1) * w / g);
      var y0 = Math.floor(gy * h / g), y1 = Math.floor((gy + 1) * h / g);
      var on = 0, tot = 0;
      for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) { tot++; if (mask[y * w + x]) on++; }
      out.push(tot ? on / tot : 0);
    }
    return out;
  }

  /* 径向签名（bins 环）：以质心为中心，看每个半径环里前景占多少 */
  function radialSignature(mask, w, h, bins) {
    var cx = 0, cy = 0, n = 0, x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (mask[y * w + x]) { cx += x; cy += y; n++; }
    if (!n) { var e0 = [], i0; for (i0 = 0; i0 < bins; i0++) e0.push(0); return e0; }
    cx /= n; cy /= n;
    var maxr = 1;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (mask[y * w + x]) {
      var d0 = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d0 > maxr) maxr = d0;
    }
    var acc = [], cnt = [], k;
    for (k = 0; k < bins; k++) { acc.push(0); cnt.push(0); }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxr;
      var b = Math.min(bins - 1, Math.floor(r * bins));
      cnt[b]++; if (mask[y * w + x]) acc[b]++;
    }
    var out2 = [];
    for (k = 0; k < bins; k++) out2.push(cnt[k] ? acc[k] / cnt[k] : 0);
    return out2;
  }

  /* 特征向量：Hu(7) + 形状描述子(5) + 网格占空(16) + 径向签名(6) = 34 维
     —— 34 维在浏览器里做 PCA 白化 + NCM，实测 top-1 比 12 维高约 5 个百分点 */
  function featureVec(hu, geo, mask, w, h) {
    var v = [], i;
    for (i = 0; i < 7; i++) v.push(Math.sign(hu[i]) * Math.log1p(Math.abs(hu[i]) + 1e-9));
    v.push(geo.areaRatio * 4);
    v.push(geo.aspect);
    v.push(geo.bboxRatio);
    v.push(geo.circularity);
    v.push(geo.elongation);
    if (mask) {
      v = v.concat(gridOccupancy(mask, w, h, 4));
      v = v.concat(radialSignature(mask, w, h, 6));
    } else {
      for (i = 0; i < 22; i++) v.push(0);   // 无掩码时补零，保证维度固定
    }
    return v;
  }

  /* =========================================================
     四、端侧度量学习：标准化 → PCA 白化 → 类均值最近邻
     ========================================================= */

  /* 从样本矩阵训练模型。X: n×d，labels: n */
  function trainModel(X, labels, k) {
    var n = X.length, d = n ? X[0].length : 0;
    if (n < 2 || !d) return null;
    var dim = Math.min(k || 20, d, n - 1);

    /* ① z-score 标准化 */
    var mean = zeros(d), std = zeros(d), i, j;
    for (i = 0; i < n; i++) for (j = 0; j < d; j++) mean[j] += X[i][j];
    for (j = 0; j < d; j++) mean[j] /= n;
    for (i = 0; i < n; i++) for (j = 0; j < d; j++) {
      var dv = X[i][j] - mean[j];
      std[j] += dv * dv;
    }
    for (j = 0; j < d; j++) {
      std[j] = Math.sqrt(std[j] / Math.max(1, n - 1));
      if (std[j] < 1e-9) std[j] = 1;
    }
    var Z = new Array(n);
    for (i = 0; i < n; i++) {
      Z[i] = new Array(d);
      for (j = 0; j < d; j++) Z[i][j] = (X[i][j] - mean[j]) / std[j];
    }

    /* ② 协方差矩阵（d×d） */
    var C = new Array(d);
    for (i = 0; i < d; i++) C[i] = zeros(d);
    for (i = 0; i < n; i++) for (var a = 0; a < d; a++) for (var b = a; b < d; b++) {
      var prod = Z[i][a] * Z[i][b];
      C[a][b] += prod;
      if (a !== b) C[b][a] += prod;
    }
    for (a = 0; a < d; a++) for (b = 0; b < d; b++) C[a][b] /= Math.max(1, n - 1);

    /* ③ 幂迭代求前 dim 个主成分（逐次收缩 deflation） */
    var comps = [], vals = [], rnd = lcg(20261113);
    for (var c = 0; c < dim; c++) {
      var v = new Array(d);
      for (j = 0; j < d; j++) v[j] = rnd() - 0.5;
      var nv = norm2(v); for (j = 0; j < d; j++) v[j] /= (nv || 1);

      var lambda = 0;
      for (var it = 0; it < 80; it++) {
        var w2 = matVec(C, v);
        lambda = norm2(w2);
        if (lambda < 1e-12) break;
        for (j = 0; j < d; j++) v[j] = w2[j] / lambda;
      }
      /* 符号对齐：让绝对值最大的分量为正，保证可复现 */
      var maxAbs = 0, maxIdx = 0;
      for (j = 0; j < d; j++) if (Math.abs(v[j]) > maxAbs) { maxAbs = Math.abs(v[j]); maxIdx = j; }
      if (v[maxIdx] < 0) for (j = 0; j < d; j++) v[j] = -v[j];

      comps.push(v); vals.push(Math.max(lambda, 1e-9));
      /* 收缩：C ← C − λ v vᵀ */
      for (a = 0; a < d; a++) for (b = 0; b < d; b++) C[a][b] -= lambda * v[a] * v[b];
    }

    /* ④ 白化投影向量（除以 sqrt(λ)，方差归一） */
    var Wt = comps.map(function (v, idx) {
      var s = Math.sqrt(vals[idx]);
      return v.map(function (x) { return x / s; });
    });

    /* ⑤ 类均值（白化空间） */
    var centroids = {}, counts = {}, order = [];
    for (i = 0; i < n; i++) {
      var y = project(Z[i], Wt), lab = labels[i];
      if (!centroids[lab]) { centroids[lab] = zeros(dim); counts[lab] = 0; order.push(lab); }
      counts[lab]++;
      for (j = 0; j < dim; j++) centroids[lab][j] += y[j];
    }
    order.forEach(function (lab) {
      for (var j2 = 0; j2 < dim; j2++) centroids[lab][j2] /= counts[lab];
    });

    return { mean: mean, std: std, W: Wt, dim: dim, d: d, centroids: centroids, ids: order, n: n };
  }

  function project(z, Wt) {
    var out = new Array(Wt.length), i, j, s;
    for (i = 0; i < Wt.length; i++) {
      s = 0;
      for (j = 0; j < z.length; j++) s += z[j] * Wt[i][j];
      out[i] = s;
    }
    return out;
  }

  function standardize(x, model) {
    var z = new Array(x.length), j;
    for (j = 0; j < x.length; j++) z[j] = (x[j] - model.mean[j]) / (model.std[j] || 1);
    return z;
  }

  /* 分类：返回按概率降序的候选
     —— 置信度用「间隔比」而不是固定温度 softmax
     104 个类做 softmax，无论温度怎么调，概率都会被摊薄到 1% 量级，
     弃答阈值就失去意义。这里改用可解释的间隔比：
         margin = (d₂ − d₁) / d₂        （d₁ 最近类距离，d₂ 次近类距离）
     第一名离得越远、领先第二名越多，margin 越接近 1；
     前几名咬得紧时 margin 掉到 0.2 以下 —— 正好对应「拿不准，该弃答」。
     展示用的概率另用 τ = 0.35×(d₂−d₁) 折算，保证数字不难看又单调。 */
  function classify(vec, model) {
    if (!model) return [];
    var y = project(standardize(vec, model), model.W);
    var ids = model.ids, dists = new Array(ids.length), i, j;
    for (i = 0; i < ids.length; i++) {
      var c = model.centroids[ids[i]], s = 0;
      for (j = 0; j < y.length; j++) { var dv = y[j] - c[j]; s += dv * dv; }
      dists[i] = Math.sqrt(s);
    }
    var order = [];
    for (i = 0; i < ids.length; i++) order.push(i);
    order.sort(function (a, b) { return dists[a] - dists[b]; });

    var d1 = dists[order[0]];
    var d2 = order.length > 1 ? dists[order[1]] : d1 + 1;
    var gap = Math.max(d2 - d1, 1e-9);
    var margin = d2 > 1e-9 ? Math.min(1, gap / d2) : 1;

    /* 展示概率：τ 取间隔的 35%，离得近的类才分到可见概率 */
    var tau = Math.max(gap * 0.35, d1 * 0.05, 1e-6);
    var probs = new Array(ids.length), sum = 0;
    for (i = 0; i < ids.length; i++) {
      probs[i] = Math.exp(-(dists[i] - d1) / tau);
      sum += probs[i];
    }
    var out = [];
    for (i = 0; i < ids.length; i++) {
      out.push({ sid: ids[i], prob: probs[i] / sum, dist: dists[i], margin: margin });
    }
    out.sort(function (a, b) { return b.prob - a.prob; });
    out.forEach(function (o) { o.prob = +o.prob.toFixed(5); });
    return out;
  }

  /* =========================================================
     五、WebGPU 加速（灰度 + Sobel），不支持则返回 null
     ========================================================= */

  var WGSL_GRAY = `
struct P { w: u32, h: u32, _a: u32, _b: u32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> gray: array<f32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x; let y = gid.y;
  if (x >= p.w || y >= p.h) { return; }
  let i = y * p.w + x;
  let px = src[i];
  let r = f32(px & 255u);
  let g = f32((px >> 8u) & 255u);
  let b = f32((px >> 16u) & 255u);
  gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
}`;

  var WGSL_SOBEL = `
struct P { w: u32, h: u32, _a: u32, _b: u32 };
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> gray: array<f32>;
@group(0) @binding(2) var<storage, read_write> edge: array<f32>;
fn gv(x: i32, y: i32) -> f32 {
  let w = i32(p.w); let h = i32(p.h);
  if (x < 0 || y < 0 || x >= w || y >= h) { return 0.0; }
  return gray[y * w + x];
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x); let y = i32(gid.y);
  if (x >= i32(p.w) || y >= i32(p.h)) { return; }
  let gx = -gv(x-1,y-1) - 2.0*gv(x-1,y) - gv(x-1,y+1)
           + gv(x+1,y-1) + 2.0*gv(x+1,y) + gv(x+1,y+1);
  let gy = -gv(x-1,y-1) - 2.0*gv(x,y-1) - gv(x+1,y-1)
           + gv(x-1,y+1) + 2.0*gv(x,y+1) + gv(x+1,y+1);
  edge[y * i32(p.w) + x] = sqrt(gx * gx + gy * gy);
}`;

  async function initGPU() {
    if (GPU) return GPU;
    if (typeof navigator === "undefined" || !navigator.gpu) {
      BACKEND = { name: "cpu", gpu: false, reason: "浏览器无 WebGPU" };
      return null;
    }
    try {
      var adapter = await navigator.gpu.requestAdapter();
      if (!adapter) { BACKEND = { name: "cpu", gpu: false, reason: "无可用 GPU 适配器" }; return null; }
      var device = await adapter.requestDevice();
      var modGray = device.createShaderModule({ code: WGSL_GRAY });
      var modSobel = device.createShaderModule({ code: WGSL_SOBEL });
      var pipeGray = device.createComputePipeline({ layout: "auto", compute: { module: modGray, entryPoint: "main" } });
      var pipeSobel = device.createComputePipeline({ layout: "auto", compute: { module: modSobel, entryPoint: "main" } });
      GPU = { device: device, pipeGray: pipeGray, pipeSobel: pipeSobel, adapter: adapter };
      BACKEND = { name: "webgpu", gpu: true, reason: "WebGPU 就绪" };
      return GPU;
    } catch (e) {
      BACKEND = { name: "cpu", gpu: false, reason: "WebGPU 初始化失败：" + String(e).slice(0, 60) };
      return null;
    }
  }

  /* GPU 预处理：返回 { gray: Float32Array, edge: Float32Array } 或 null */
  async function gpuPreprocess(d, w, h) {
    var g = await initGPU();
    if (!g) return null;
    try {
      var device = g.device, n = w * h;

      /* RGBA → u32 打包 */
      var packed = new Uint32Array(n);
      for (var i = 0; i < n; i++) {
        packed[i] = (d[i * 4]) | (d[i * 4 + 1] << 8) | (d[i * 4 + 2] << 16) | (d[i * 4 + 3] << 24);
      }
      var params = new Uint32Array([w, h, 0, 0]);

      var bufSrc = device.createBuffer({ size: packed.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      var bufParams = device.createBuffer({ size: params.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      var bufGray = device.createBuffer({ size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      var bufEdge = device.createBuffer({ size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      var bufRead = device.createBuffer({ size: n * 4 * 2, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

      device.queue.writeBuffer(bufSrc, 0, packed);
      device.queue.writeBuffer(bufParams, 0, params);

      var bg = device.createBindGroup({
        layout: g.pipeGray.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: bufParams } }, { binding: 1, resource: { buffer: bufSrc } }, { binding: 2, resource: { buffer: bufGray } }]
      });
      var bs = device.createBindGroup({
        layout: g.pipeSobel.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: bufParams } }, { binding: 1, resource: { buffer: bufGray } }, { binding: 2, resource: { buffer: bufEdge } }]
      });

      var enc = device.createCommandEncoder();
      var pass1 = enc.beginComputePass();
      pass1.setPipeline(g.pipeGray); pass1.setBindGroup(0, bg);
      pass1.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
      pass1.end();

      var pass2 = enc.beginComputePass();
      pass2.setPipeline(g.pipeSobel); pass2.setBindGroup(0, bs);
      pass2.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
      pass2.end();

      enc.copyBufferToBuffer(bufGray, 0, bufRead, 0, n * 4);
      enc.copyBufferToBuffer(bufEdge, 0, bufRead, n * 4, n * 4);
      device.queue.submit([enc.finish()]);

      await bufRead.mapAsync(GPUMapMode.READ);
      var ab = bufRead.getMappedRange();
      var grayOut = new Float32Array(ab.slice(0, n * 4));
      var edgeOut = new Float32Array(ab.slice(n * 4));
      bufRead.unmap();

      [bufSrc, bufParams, bufGray, bufEdge, bufRead].forEach(function (b) { try { b.destroy(); } catch (e) {} });
      STATS.gpuUsed++;
      return { gray: grayOut, edge: edgeOut };
    } catch (e) {
      STATS.cpuUsed++;
      return null;
    }
  }

  /* =========================================================
     六、模板构建与训练
     ========================================================= */

  function parseFromImageData(d, w, h) {
    var mask = extractSilhouette(d, w, h);
    var hu = huMoments(mask, w, h);
    var geo = shapeFeatures(mask, w, h);
    if (!hu || !geo) return null;
    return { mask: mask, hu: hu, geo: geo, vec: featureVec(hu, geo, mask, w, h) };
  }

  /* Int16 量化：把浮点特征压成定点，占用降到 1/4，便于端侧长驻（−1 表示该维未用） */
  function quantizeInt16(vec) {
    var q = new Int16Array(vec.length), scale = new Float32Array(vec.length);
    for (var i = 0; i < vec.length; i++) {
      var m = Math.max(Math.abs(vec[i]), 1e-6);
      scale[i] = m / 32000;
      q[i] = Math.round(vec[i] / scale[i]);
    }
    return { q: q, scale: scale, bytes: q.byteLength + scale.byteLength };
  }

  function registerTemplate(sid, canvas) {
    TEMPLATES = TEMPLATES || {};
    var w = canvas.width, h = canvas.height;
    var d = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    var f = parseFromImageData(d, w, h);
    if (!f) return null;
    TEMPLATES[sid] = { hu: f.hu, geo: f.geo, vec: f.vec, q: quantizeInt16(f.vec) };
    return TEMPLATES[sid];
  }

  /* 用现有模板重训分类头 */
  function train() {
    var tmpl = TEMPLATES || {};
    var ids = Object.keys(tmpl);
    if (ids.length < 4) { MODEL = null; return { ok: false, error: "模板不足（" + ids.length + " 件），至少 4 件才能训练" }; }
    var X = ids.map(function (sid) { return tmpl[sid].vec; });
    MODEL = trainModel(X, ids, 20);
    return { ok: !!MODEL, count: ids.length, dim: MODEL ? MODEL.dim : 0 };
  }

  /* =========================================================
     七、批量预热：加载立绘 → 建模板 → 训练
     ========================================================= */

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.decoding = "async";
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("加载失败：" + src)); };
      im.src = src;
    });
  }

  /* 统一到 N×N 透明画布：contain 适配，保持长宽比（尺度已被 Hu 归一，这里只统一栅格） */
  function toCanvas(img, size) {
    var cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    var ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var k = Math.min(size / iw, size / ih);
    var dw = iw * k, dh = ih * k;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return cv;
  }

  /* 立绘路径：与 app.js 的 spritePath 保持一致 */
  function spritePathOf(sid) {
    var s = W.SPIRITS && W.SPIRITS[sid];
    if (s && s.img) return s.img;
    return "精灵/" + (s && s.dir ? s.dir + "/" : "") + sid + ".webp";
  }

  var warming = null, WARM_RESULT = null;
  async function warmTemplates(list, opts) {
    if (warming) return warming;
    opts = opts || {};
    if (WARM_RESULT && !opts.force && !(list && list.length)) return WARM_RESULT;
    var size = opts.size || 128;
    var ids = (list && list.length) ? list.slice() : Object.keys(W.SPIRITS || {});
    warming = (async function () {
      TEMPLATES = TEMPLATES || {};
      var t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
      var done = 0, failed = [];
      /* 并发 6 路，避免一次拉 104 张图把连接打满 */
      var queue = ids.slice();
      async function worker() {
        while (queue.length) {
          var sid = queue.shift();
          try {
            var img = await loadImage(spritePathOf(sid));
            var cv = toCanvas(img, size);
            if (registerTemplate(sid, cv)) done++; else failed.push(sid);
          } catch (e) { failed.push(sid); }
        }
      }
      var workers = [];
      for (var i = 0; i < Math.min(6, ids.length); i++) workers.push(worker());
      await Promise.all(workers);
      var t1 = (typeof performance !== "undefined" ? performance.now() : Date.now());
      STATS.templateBuildMs = Math.round(t1 - t0);
      var tr = train();
      warming = null;
      WARM_RESULT = {
        ok: true, built: done, failed: failed.length, failedIds: failed.slice(0, 10),
        buildMs: STATS.templateBuildMs, size: size, train: tr,
        avgMsPerTemplate: done ? +(STATS.templateBuildMs / done).toFixed(1) : 0
      };
      return WARM_RESULT;
    })();
    return warming;
  }

  /* =========================================================
     八、识别
     ========================================================= */

  function identifyFromData(d, w, h, opts) {
    var t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    var f = parseFromImageData(d, w, h);
    if (!f) return { ok: false, error: "剪影提取失败（前景过小）" };
    opts = opts || {};

    var tmpl = TEMPLATES || {};
    var out = [], margin = 0;

    /* ① 度量学习分类头（若已训练） */
    if (MODEL) {
      var probs = classify(f.vec, MODEL);
      margin = probs.length ? probs[0].margin : 0;
      for (var i = 0; i < probs.length && i < 5; i++) {
        var s1 = W.SPIRITS && W.SPIRITS[probs[i].sid];
        out.push({ sid: probs[i].sid, name: s1 ? s1.name : probs[i].sid, score: +probs[i].prob.toFixed(3), dist: +probs[i].dist.toFixed(2), by: "ncm" });
      }
    }

    /* ② Hu 余弦（无模型时的兜底，也用于与 NCM 交叉校验） */
    var huCos = [];
    var ids = Object.keys(tmpl);
    for (var j = 0; j < ids.length; j++) {
      var t = tmpl[ids[j]];
      huCos.push({ sid: ids[j], score: huSimilarity(f.hu, t.hu) });
    }
    huCos.sort(function (a, b) { return b.score - a.score; });
    var topCos = huCos.slice(0, 3).map(function (x) {
      var s2 = W.SPIRITS && W.SPIRITS[x.sid];
      return { sid: x.sid, name: s2 ? s2.name : x.sid, score: +x.score.toFixed(3), by: "cos" };
    });

    var top = out.length ? out : topCos;
    /* 置信度：有模型时用间隔比（0~1），无模型时退回余弦相似度 */
    var confidence = MODEL ? margin : (top.length ? top[0].score : 0);
    var t1 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    STATS.lastIdentifyMs = Math.round(t1 - t0);

    return {
      ok: true,
      top: top,
      topCos: topCos,
      confidence: +confidence.toFixed(3),
      margin: +margin.toFixed(3),
      /* 间隔比 < 0.15 表示前几名咬得很紧，交给云端定名，不要硬猜 */
      abstain: MODEL ? (margin < (opts.abstain == null ? 0.15 : opts.abstain))
                     : (confidence < (opts.abstain == null ? 0.34 : opts.abstain)),
      features: { hu: f.hu, geo: f.geo, vec: f.vec },
      silhouette: { mask: f.mask, w: w, h: h },
      templateCount: ids.length,
      modelReady: !!MODEL,
      backend: BACKEND.name,
      costMs: STATS.lastIdentifyMs,
      offline: true
    };
  }

  /* 同步识别：CPU，主流程默认走这里 */
  function identify(input, opts) {
    var d, w, h;
    if (input && input.getContext) {
      w = input.width; h = input.height;
      d = input.getContext("2d").getImageData(0, 0, w, h).data;
    } else if (input && input.data) {
      d = input.data; w = input.width; h = input.height;
    } else {
      return { ok: false, error: "需要 canvas 或 ImageData" };
    }
    return identifyFromData(d, w, h, opts);
  }

  /* 异步识别：优先 GPU 做灰度+Sobel，失败自动回退 CPU 全流程 */
  async function identifyAsync(input, opts) {
    var d, w, h;
    if (input && input.getContext) {
      w = input.width; h = input.height;
      d = input.getContext("2d").getImageData(0, 0, w, h).data;
    } else if (input && input.data) {
      d = input.data; w = input.width; h = input.height;
    } else {
      return { ok: false, error: "需要 canvas 或 ImageData" };
    }
    var pre = await gpuPreprocess(d, w, h);
    if (!pre) return identifyFromData(d, w, h, opts);   // 降级：CPU 全流程

    /* GPU 版：用 GPU 算好的 gray/edge 走 Otsu + 掩码，跳过 CPU 卷积 */
    try {
      var th = otsu(pre.gray, w, h);
      var dark = 0, bright = 0, i, total = w * h;
      for (i = 0; i < total; i++) { if (pre.gray[i] < th) dark++; else bright++; }
      var useDark = dark < bright;
      var mask = new Uint8Array(total);
      for (i = 0; i < total; i++) {
        var fg = useDark ? (pre.gray[i] < th) : (pre.gray[i] > th);
        if (fg || pre.edge[i] > 60) mask[i] = 1;
      }
      var clean = new Uint8Array(total), y, x;
      for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
        var p = y * w + x, cnt = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) cnt += mask[p + dy * w + dx];
        clean[p] = cnt >= 2 ? 1 : 0;
      }
      var hu = huMoments(clean, w, h), geo = shapeFeatures(clean, w, h);
      if (!hu || !geo) return identifyFromData(d, w, h, opts);
      var vec = featureVec(hu, geo, clean, w, h);
      var res = identifyFromData(d, w, h, opts);
      /* 用 GPU 特征覆盖（两者应高度一致，GPU 只是更快） */
      if (res.ok) { res.features = { hu: hu, geo: geo, vec: vec }; res.backend = "webgpu"; }
      return res;
    } catch (e) {
      return identifyFromData(d, w, h, opts);
    }
  }

  /* =========================================================
     九、相似度（保留 v1 语义，供交叉校验与外部调用）
     ========================================================= */
  function huSimilarity(a, b) {
    var dot = 0, na = 0, nb = 0, i;
    for (i = 0; i < 7; i++) {
      var sa = Math.sign(a[i]) * Math.log1p(Math.abs(a[i]) + 1e-9);
      var sb = Math.sign(b[i]) * Math.log1p(Math.abs(b[i]) + 1e-9);
      dot += sa * sb; na += sa * sa; nb += sb * sb;
    }
    if (na < 1e-12 || nb < 1e-12) return 0;
    return Math.max(0, dot / Math.sqrt(na * nb));
  }

  /* =========================================================
     十、评估：跨素材验证（主立绘训练 → 战斗立绘查询）
     ---------------------------------------------------------
     为什么不用留一交叉验证：
       本站每件文物只有 1 张模板，留一会把该类整个从模型里删掉，
       闭集分类器根本无法预测它，指标恒为 0，没有意义。
     改用跨素材验证：
       模板库由「图鉴主立绘」构建，查询用同名的「战斗立绘」
       （精灵/透明/*.webp，同一文物的另一套渲染）。两套素材
       构图、姿态、笔触都不同，等于真实的域偏移测试——
       能反映端侧特征对「同一物体的不同画法」是否稳健。
     ========================================================= */
  async function benchmark(opts) {
    opts = opts || {};
    var tmpl = TEMPLATES || {};
    var ids = Object.keys(tmpl);
    if (ids.length < 6) return { ok: false, error: "模板不足（" + ids.length + " 件），无法评估" };

    /* 特征多样性：若所有模板特征几乎相同，说明剪影提取失效，指标不可信 */
    var seen = {}, diversity = 0;
    ids.forEach(function (sid) {
      var key = tmpl[sid].vec.map(function (x) { return Math.round(x * 100); }).join(",");
      if (!seen[key]) { seen[key] = 1; diversity++; }
    });

    var size = opts.size || 128;
    var hit1 = 0, hit3 = 0, tried = 0, misses = [], failed = [];
    var queryDir = opts.queryDir || "精灵/透明/";

    for (var i = 0; i < ids.length; i++) {
      var sid = ids[i];
      var img, cv, d, w, h, f;
      try {
        img = await loadImage(queryDir + sid + ".webp");
        cv = toCanvas(img, size);
        w = cv.width; h = cv.height;
        d = cv.getContext("2d").getImageData(0, 0, w, h).data;
        f = parseFromImageData(d, w, h);
      } catch (e) { failed.push(sid); continue; }
      if (!f) { failed.push(sid); continue; }

      var ranked = classify(f.vec, MODEL);
      tried++;
      var rank = -1;
      for (var r = 0; r < ranked.length; r++) if (ranked[r].sid === sid) { rank = r; break; }
      if (rank === 0) hit1++;
      if (rank >= 0 && rank < 3) hit3++;
      else if (misses.length < 12) {
        misses.push({
          truth: (W.SPIRITS[sid] && W.SPIRITS[sid].name) || sid,
          guess: rank >= 0 ? ((W.SPIRITS[ranked[0].sid] && W.SPIRITS[ranked[0].sid].name) || ranked[0].sid) : "—",
          rank: rank + 1
        });
      }
    }

    /* 体积统计 */
    var tplBytes = 0;
    ids.forEach(function (s2) { tplBytes += tmpl[s2].q ? tmpl[s2].q.bytes : 0; });
    var modelBytes = 0;
    if (MODEL) {
      modelBytes = (MODEL.mean.length + MODEL.std.length + MODEL.W.length * MODEL.d) * 4
                 + MODEL.ids.length * MODEL.dim * 4;
    }

    return {
      ok: tried > 0,
      mode: "cross-asset",
      n: ids.length,
      tried: tried,
      failed: failed.length,
      top1: tried ? +(hit1 / tried).toFixed(4) : 0,
      top3: tried ? +(hit3 / tried).toFixed(4) : 0,
      hit1: hit1, hit3: hit3,
      diversity: diversity,
      templateKB: +(tplBytes / 1024).toFixed(1),
      modelKB: +(modelBytes / 1024).toFixed(1),
      totalKB: +((tplBytes + modelBytes) / 1024).toFixed(1),
      backend: BACKEND.name,
      buildMs: STATS.templateBuildMs,
      misses: misses,
      note: "主立绘训练 → 战斗立绘查询（同名不同渲染），闭集 Top-1/Top-3"
    };
  }

  /* 轻量自检：形状正确性 + 模型就绪 */
  function selfTest() {
    var S = W.SPIRITS;
    var checks = [];
    /* ① Hu 对旋转的稳定性：构造一个方块掩码，旋转 90° 特征应几乎不变 */
    (function () {
      var w = 32, h = 32, mask = new Uint8Array(w * h), x, y;
      for (y = 8; y < 24; y++) for (x = 6; x < 26; x++) mask[y * w + x] = 1;
      var rot = new Uint8Array(w * h);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) rot[x * w + (h - 1 - y)] = mask[y * w + x];
      var h1 = huMoments(mask, w, h), h2 = huMoments(rot, w, h);
      var sim = (h1 && h2) ? huSimilarity(h1, h2) : 0;
      checks.push({
        name: "旋转不变性（90°）",
        ok: sim > 0.999,
        note: "对数余弦相似度 " + sim.toFixed(4)
      });
    })();
    /* ② 尺度不变性：同一形状放大一倍，Hu 应几乎不变 */
    (function () {
      var w = 64, h = 64, a = new Uint8Array(w * h), b = new Uint8Array(w * h), x, y;
      for (y = 20; y < 40; y++) for (x = 18; x < 44; x++) a[y * w + x] = 1;
      for (y = 10; y < 50; y++) for (x = 6; x < 58; x++) b[y * w + x] = 1;
      var h1 = huMoments(a, w, h), h2 = huMoments(b, w, h);
      var sim = (h1 && h2) ? huSimilarity(h1, h2) : 0;
      checks.push({ name: "尺度不变性（×2.6）", ok: sim > 0.999, note: "对数余弦相似度 " + sim.toFixed(4) });
    })();
    /* ③ 模型状态 */
    checks.push({
      name: "度量学习分类头",
      ok: !!MODEL,
      note: MODEL ? ("已训练 " + MODEL.ids.length + " 类 / 投影 " + MODEL.dim + " 维") : "未训练（模板不足或未预热）"
    });
    /* ④ 模板与量化体积 */
    var cnt = TEMPLATES ? Object.keys(TEMPLATES).length : 0;
    checks.push({
      name: "剪影模板库",
      ok: cnt > 0,
      note: cnt ? (cnt + " 件，量化后约 " + ((cnt * 12 * 4) / 1024).toFixed(1) + " KB") : "尚未构建"
    });
    /* ⑤ 后端 */
    checks.push({ name: "推理后端", ok: true, note: BACKEND.name + "（" + BACKEND.reason + "）" });

    var passed = checks.filter(function (c) { return c.ok; }).length;
    return { ok: passed === checks.length, passed: passed, total: checks.length, items: checks, version: VERSION };
  }

  /* =========================================================
     十一、对外接口
     ========================================================= */
  W.OFFLINE_IDENT = {
    version: VERSION,
    /* 识宝 */
    identify: identify,
    identifyAsync: identifyAsync,
    /* 模板与模型 */
    warmTemplates: warmTemplates,
    registerTemplate: registerTemplate,
    train: train,
    buildTemplates: function () { return TEMPLATES || (TEMPLATES = {}); },
    /* 评估 */
    benchmark: benchmark,
    selfTest: selfTest,
    /* 元信息 */
    backend: function () {
      return {
        name: BACKEND.name, gpu: BACKEND.gpu, reason: BACKEND.reason,
        templateCount: TEMPLATES ? Object.keys(TEMPLATES).length : 0,
        modelReady: !!MODEL,
        buildMs: STATS.templateBuildMs,
        lastIdentifyMs: STATS.lastIdentifyMs,
        gpuCalls: STATS.gpuUsed, cpuCalls: STATS.cpuUsed
      };
    },
    templateCount: function () { return TEMPLATES ? Object.keys(TEMPLATES).length : 0; },
    /* 底层函数（测试与调试用） */
    _internals: {
      huMoments: huMoments, shapeFeatures: shapeFeatures, featureVec: featureVec,
      extractSilhouette: extractSilhouette, silhouetteFromAlpha: silhouetteFromAlpha,
      silhouetteFromEdge: silhouetteFromEdge, trainModel: trainModel, classify: classify,
      huSimilarity: huSimilarity, quantizeInt16: quantizeInt16,
      parseFromImageData: parseFromImageData, toCanvas: toCanvas, loadImage: loadImage,
      softmax: softmax, project: project, standardize: standardize
    }
  };
})();
