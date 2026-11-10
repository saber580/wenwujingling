# -*- coding: utf-8 -*-
"""
生成「全国分省地图」SVG 路径数据 -> js/china-map-data.js

数据源：阿里 DataV 省级行政边界（民政部标准行政区划，含台湾、海南、南海诸岛）
投影：Web Mercator，等比，保证省界形状不变形
简化：Douglas-Peucker，容差按像素控制，压到可接受体积

输出：
  CHINA_MAP = {
    vb: [w, h],              // viewBox
    box: [lng0, lat0, lng1, lat1],  // 投影用的经纬边界（前端据此把经纬度投影成像素）
    provinces: [{n:"河北省", c:"130000", d:"M..."}],
  }
"""
import json, math, os, sys

SRC = os.path.join(os.environ.get("TEMP", "/tmp"), "cn.json")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "china-map-data.js")

W = 1000.0          # viewBox 宽
PAD = 6.0           # 四周留白（viewBox 单位）
TOL = 0.55          # DP 简化容差（viewBox 单位，约 0.55px）

def merc(lng, lat):
    x = lng
    y = math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
    return x, -y

def dp(pts, tol):
    """Douglas-Peucker，迭代实现，避免深递归"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]

def main():
    raw = json.load(open(SRC, encoding="utf-8"))
    feats = raw["features"]

    # ---- 1) 收集所有环（含孔洞），算全局经纬边界 ----
    polys = []   # [(adcode, [ring, ring, ...]), ...]
    lngs, lats = [], []
    for f in feats:
        p = f["properties"]
        g = f["geometry"]
        if not g:
            continue
        code = str(p.get("adcode", ""))
        name = p.get("name", "")
        if g["type"] == "Polygon":
            rings = [g["coordinates"]]
        else:
            rings = g["coordinates"]
        out_rings = []
        for poly in rings:            # poly = [outer, hole1, hole2...]
            for ring in poly:
                out_rings.append([(float(x), float(y)) for x, y in ring])
                for x, y in ring:
                    lngs.append(x); lats.append(y)
        polys.append((code, name, out_rings))

    lng0, lng1 = min(lngs), max(lngs)
    lat0, lat1 = min(lats), max(lats)

    # ---- 2) Mercator 投影后算边界，定比例 ----
    xs, ys = [], []
    proj = []
    for code, name, rs in polys:
        prs = []
        for ring in rs:
            pr = [merc(x, y) for x, y in ring]
            prs.append(pr)
            for x, y in pr:
                xs.append(x); ys.append(y)
        proj.append((code, name, prs))
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    span = x1 - x0
    scale = (W - PAD * 2) / span
    H = (y1 - y0) * scale + PAD * 2

    def to_px(x, y):
        return ((x - x0) * scale + PAD, (y - y0) * scale + PAD)

    # ---- 3) 生成路径 ----
    provs = []
    for code, name, prs in proj:
        d_parts = []
        for ring in prs:
            pts = dp([to_px(x, y) for x, y in ring], TOL)
            if len(pts) < 3:
                continue
            # 闭合环：至少 3 个不同点
            seg = ["M%.1f %.1f" % pts[0]]
            for x, y in pts[1:]:
                seg.append("L%.1f %.1f" % (x, y))
            seg.append("Z")
            d_parts.append("".join(seg))
        if d_parts:
            provs.append({"n": name, "c": code, "d": "".join(d_parts)})
    provs.sort(key=lambda p: p["c"])

    # ---- 河北包围盒（供前端「放大到河北」用）----
    hb_box = None
    for code, name, rs in proj:
        if name.startswith("河北"):
            hx, hy = [], []
            for ring in rs:
                for x, y in ring:
                    px, py = to_px(x, y)
                    hx.append(px); hy.append(py)
            m = 8.0
            hb_box = [min(hx) - m, min(hy) - m, max(hx) - min(hx) + 2 * m, max(hy) - min(hy) + 2 * m]
            break

    # ---- 主图（陆域 + 海南 + 台湾）与南海诸岛附图 ----
    mx, my = [], []
    for code, name, rs in polys:            # 用原始经纬度判断范围
        for ring in rs:
            for lng, lat in ring:
                px, py = to_px(*merc(lng, lat))
                if lat >= 17.6:                     # 陆域主图（含海南、台湾）
                    mx.append(px); my.append(py)
    M = 6.0
    main_box = [min(mx) - M, min(my) - M,
                max(mx) - min(mx) + 2 * M, max(my) - min(my) + 2 * M]

    # ---- 南海诸岛附图：单独取窗口内的几何，简化更细，单独出路径 ----
    SC_LAT, SC_LNG0, SC_LNG1 = 23.5, 105.0, 125.0
    scs_parts, sx, sy = [], [], []
    for code, name, rs in polys:
        for ring in rs:
            if not any((lat < SC_LAT and SC_LNG0 <= lng <= SC_LNG1) for lng, lat in ring):
                continue
            pts = [to_px(*merc(lng, lat)) for lng, lat in ring]
            for px, py in pts:
                sx.append(px); sy.append(py)
            simp = dp(pts, 0.2)
            if len(simp) < 3:
                continue
            seg = ["M%.1f %.1f" % simp[0]]
            for x, y in simp[1:]:
                seg.append("L%.1f %.1f" % (x, y))
            seg.append("Z")
            scs_parts.append("".join(seg))
    scs_d = "".join(scs_parts)

    # 附图摆位：主图右下角
    iw = 88.0
    s_x0, s_y0, s_x1, s_y1 = min(sx), min(sy), max(sx), max(sy)
    sw, sh = s_x1 - s_x0, s_y1 - s_y0
    ih = iw * sh / sw
    ix = main_box[0] + main_box[2] - iw - 9.0
    iy = main_box[1] + main_box[3] - ih - 9.0
    sc = min((iw - 8) / sw, (ih - 14) / sh)
    tx = ix + (iw - sw * sc) / 2 - s_x0 * sc
    ty = iy + 4 + (ih - 14 - sh * sc) / 2 - s_y0 * sc

    js = []
    js.append("/* 全国分省地图 · 省级行政边界路径")
    js.append("   数据源：阿里 DataV 省级行政边界（民政部标准行政区划，含台湾、海南、南海诸岛）")
    js.append("   投影：Web Mercator；viewBox 单位与像素等比；由 tools/gen_china_map.py 生成，请勿手改")
    js.append("   box = [西经, 南纬, 东经, 北纬]，前端用 CHINA_MAP.project(lng,lat) 把经纬度换算成 viewBox 坐标 */")
    js.append("const CHINA_MAP = {")
    js.append("  vb: [%d, %d]," % (round(W), round(H)))
    js.append("  box: [%.4f, %.4f, %.4f, %.4f]," % (lng0, lat0, lng1, lat1))
    js.append("  scale: %.6f," % scale)
    js.append("  pad: %.2f," % PAD)
    js.append("  y0: %.4f," % y0)
    js.append("  x0: %.4f," % x0)
    if hb_box:
        js.append("  hb: [%.1f, %.1f, %.1f, %.1f]," % tuple(hb_box))
    js.append("  main: [%.1f, %.1f, %.1f, %.1f]," % tuple(main_box))
    js.append("  inset: {box:[%.1f, %.1f, %.1f, %.1f], tf:[%.4f, %.4f, %.5f], d:\"%s\"}," %
              (ix, iy, iw, ih, tx, ty, sc, scs_d))
    js.append("  provinces: [")
    for p in provs:
        js.append('    {n:"%s",c:"%s",d:"%s"},' % (p["n"], p["c"], p["d"]))
    js.append("  ]")
    js.append("};")
    js.append("")
    js.append("""/* 经纬度 -> viewBox 坐标（与上面的路径同一套投影） */
CHINA_MAP.project = function (lng, lat) {
  var y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI;
  return [
    (lng - this.x0) * this.scale + this.pad,
    (-y - this.y0) * this.scale + this.pad
  ];
};
""")

    body = "\n".join(js)
    open(OUT, "w", encoding="utf-8").write(body)

    # ---- 4) 报告 ----
    print("省份数:", len(provs))
    print("viewBox: %d x %d  (高宽比 %.2f)" % (round(W), round(H), H / W))
    print("经纬边界: lng %.2f~%.2f  lat %.2f~%.2f" % (lng0, lng1, lat0, lat1))
    print("scale: %.4f" % scale)
    print("输出体积: %.1f KB" % (len(body.encode("utf-8")) / 1024))
    print("最大省份路径字符数:", max(len(p["d"]) for p in provs))
    for p in sorted(provs, key=lambda x: -len(x["d"]))[:5]:
        print("   ", p["n"], len(p["d"]))

if __name__ == "__main__":
    main()
