# -*- coding: utf-8 -*-
"""生成「AI 文物修复」静态预览:quickjs 真实渲染 viewRestore(含 AI 随机抽选 + 打乱的拼图盘),
   内联样式与图片(含拼图块的 background-image url()),并用 PIL 按同一版式复刻
   「AI 裁切输出台」图纸(虚线裁切),输出 _预览_AI文物修复.html(无需服务器即可查看)。"""
import os, re, base64, math, tempfile, quickjs
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()

PRELUDE = r"""
// ---- 假 DOM/环境(与 check_runtime 同款) ----
function fakeEl(){ return {
  innerHTML:"", textContent:"", style:{}, dataset:{}, scrollTop:0,
  classList:{ add(){}, remove(){}, toggle(){} },
  addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
  appendChild(){}, focus(){}, click(){}, querySelector:()=>fakeEl(), querySelectorAll:()=>[]
}; }
var __cache = {};
var document = {
  title:"", body: fakeEl(),
  querySelector: (s)=>{ if(!__cache[s]) __cache[s]=fakeEl(); return __cache[s]; },
  querySelectorAll: ()=>[],
  getElementById: (id)=>{ const k='#'+id; if(!__cache[k]) __cache[k]=fakeEl(); return __cache[k]; },
  addEventListener(){}
};
var window = { addEventListener(){}, scrollTo(){} };
var location = { hash:"" };
var localStorage = { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;} };
var URL = { createObjectURL(){return "blob:x";} };
function setTimeout(cb){ cb(); return 1; }
var __intervals=[];
function setInterval(cb){ var id={fn:cb, stop:false}; __intervals.push(id); return id; }
function clearInterval(id){ if(id){ id.stop=true; } }
// ---- 预览用:MINSTD 伪随机(保证打乱质量;每次打开种子不同,重开即新局) ----
var __seed = (Date.now() % 2147483646) + 1;
Math.random = function(){ __seed = (__seed * 48271) % 2147483647; return __seed / 2147483647; };
"""

MODES = {"16": (4, 4), "32": (8, 4), "64": (8, 8)}

ctx = quickjs.Context()
ctx.eval(PRELUDE)
ctx.eval(rd("js/data.js"))
ctx.eval(rd("js/app.js"))

body = ctx.eval("viewRestore()")
sid  = ctx.eval("RS.spirit.id")
name = ctx.eval("RS.spirit.name")
mode = ctx.eval("RS.mode")
cols, rows = MODES.get(mode, (4, 4))
no   = ctx.eval("(POSTER_META['%s'] && POSTER_META['%s'].no) || ''" % (sid, sid))
st   = ctx.eval("((STATIONS.find(s=>s.spiritIds.includes('%s'))||{}).name) || ''" % sid)

# ---------- PIL 复刻「AI 裁切输出台」图纸 ----------
FONT_LIST = [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc",
             r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\simsun.ttc"]
def load_font(size):
    for p in FONT_LIST:
        if os.path.isfile(p):
            try: return ImageFont.truetype(p, size)
            except Exception: pass
    return ImageFont.load_default()

def dash_line(d, p0, p1, size=(12, 9), fill=(150, 110, 60), width=2):
    (x0, y0), (x1, y1) = p0, p1
    length = math.hypot(x1 - x0, y1 - y0)
    if length <= 0: return
    dash, gap = size
    k, t = 0, 0.0
    while t < 1.0:
        a = k * (dash + gap); b = a + dash
        if a >= length: break
        ta, tb = min(a / length, 1.0), min(b / length, 1.0)
        d.line([x0 + (x1 - x0) * ta, y0 + (y1 - y0) * ta,
                x0 + (x1 - x0) * tb, y0 + (y1 - y0) * tb], fill=fill, width=width)
        k += 1; t = tb

def render_sheet(out_png):
    im = Image.open(os.path.join(ROOT, "精灵", "透明", sid + ".png")).convert("RGBA")
    W, head, foot = 1200, 150, 90
    pw = W / cols
    ph = pw * (im.height / im.width) * (cols / rows)
    H = int(round(head + ph * rows + foot))
    page = Image.new("RGB", (W, H), (248, 243, 232))
    sw, sh = im.width / cols, im.height / rows
    pwi, phi = int(round(pw)), int(round(ph))
    for r in range(rows):
        for c in range(cols):
            x0, y0 = int(round(c * sw)), int(round(r * sh))
            x1, y1 = int(round((c + 1) * sw)), int(round((r + 1) * sh))
            piece = im.crop((x0, y0, x1, y1)).resize((pwi, phi), Image.LANCZOS)
            page.paste(piece, (int(round(c * pw)), int(round(head + r * ph))), piece)
    d = ImageDraw.Draw(page)
    d.text((46, 30), "文物精灵 · AI 文物修复 — 拼图素材", font=load_font(44), fill=(92, 51, 23))
    d.text((46, 92), "%s · %s · %s · %d 块(%d×%d)· 沿虚线裁切" % (name, no, st, cols * rows, cols, rows),
           font=load_font(26), fill=(138, 90, 43))
    for c in range(cols + 1):
        x = c * pw
        dash_line(d, (x, head), (x, head + ph * rows))
    for r in range(rows + 1):
        y = head + r * ph
        dash_line(d, (0, y), (W, y))
    d.rectangle([1, 1, W - 2, H - 2], outline=(120, 80, 40), width=3)
    f3 = load_font(24)
    d.text((46, H - 52), "由「文物精灵」AI 裁切引擎自动切分 · 立绘为 AI 幻化生成 · 打印后沿虚线剪下即可拼玩",
           font=f3, fill=(138, 90, 43))
    import datetime
    ds = datetime.date.today().strftime("%Y/%m/%d")
    d.text((W - 46 - d.textlength(ds, font=f3), H - 52), ds, font=f3, fill=(138, 90, 43))
    page.save(out_png)
    return os.path.getsize(out_png)

tmp_png = os.path.join(tempfile.gettempdir(), "rs_sheet_preview.png")
sheet_bytes = render_sheet(tmp_png)
sheet_uri = "data:image/png;base64," + base64.b64encode(open(tmp_png, "rb").read()).decode()

# ---------- 用图纸替换预览页里的空 canvas(静态页没有 JS 绘制) ----------
assert '<canvas id="rs-cv-sheet" class="rs-sheet"></canvas>' in body
body = body.replace('<canvas id="rs-cv-sheet" class="rs-sheet"></canvas>',
                    '<img class="rs-sheet" src="%s" alt="拼图块图纸">' % sheet_uri)
body = re.sub(r'<p class="rs-note" id="rs-sheet-note">[^<]*</p>',
              '<p class="rs-note">本次图纸:%s · %d 块(%d×%d)· 沿虚线裁切 —— 打印后剪下即可拼玩(预览为静态快照;正式页实时生成并可下载 PNG)</p>'
              % (name, cols * rows, cols, rows), body)
body = re.sub(r'\son[a-z]+="[^"]*"', "", body)   # 静态预览:去掉交互事件属性

# ---------- 内联工具 ----------
_m = re.search(r'<header class="topbar">.*?</header>', rd("index.html"), re.S)
topbar = re.sub(r'\sonclick="[^"]*"', "", _m.group(0))
topbar = topbar.replace('<a class="nav-item" href="#/restore" data-nav="restore">',
                        '<a class="nav-item active" href="#/restore" data-nav="restore">')

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp"}
_cache = {}
def data_uri(rel):
    key = rel.replace("\\", "/")
    if key in _cache: return _cache[key]
    p = os.path.join(ROOT, key.replace("/", os.sep))
    if not os.path.isfile(p):
        _cache[key] = None
        return None
    ext = os.path.splitext(p)[1].lower()
    with open(p, "rb") as f:
        uri = "data:%s;base64,%s" % (MIME.get(ext, "application/octet-stream"), base64.b64encode(f.read()).decode())
    _cache[key] = uri
    return uri

missing = []
def inline_imgs(html):
    def sub(m):
        if m.group(1).startswith("data:"):
            return m.group(0)
        uri = data_uri(m.group(1))
        if uri: return 'src="%s"' % uri
        missing.append(m.group(1))
        return m.group(0)
    return re.sub(r'src="([^"]+)"', sub, html)

def inline_urls(html):
    def sub(m):
        uri = data_uri(m.group(1))
        if uri: return "url('%s')" % uri
        missing.append(m.group(1))
        return m.group(0)
    return re.sub(r"url\(['\"]?([^'\")]+)['\"]?\)", sub, html)

def css_sub(m):
    uri = data_uri(m.group(1))
    return 'url("%s")' % uri if uri else m.group(0)
css = re.sub(r'url\("\.\./([^")]+)"\)', css_sub, rd("css/style.css"))

body2 = inline_urls(inline_imgs(body))

tpl = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>预览 · AI 文物修复</title>
<style>
%(css)s
.preview-note{
  font-size:12.5px;color:#7a6a52;background:#fbf3e2;border:1px dashed #e0c9a0;
  border-radius:12px;padding:10px 14px;margin:0 0 16px;line-height:1.8;
}
</style>
</head>
<body data-page="restore" data-bg="e">
  <div class="bg-art" aria-hidden="true">
    <div class="bg-art-img"></div>
    <div class="bg-water"></div>
    <div class="bg-art-veil"></div>
    <div class="bg-art-paper"></div>
    <div class="bg-mtn"></div>
    <div class="bg-sun"></div>
    <div class="bg-mist m1"></div>
    <div class="bg-mist m2"></div>
    <div class="bg-birds"></div>
    <div class="bg-cloud c1"></div>
    <div class="bg-cloud c2"></div>
    <div class="bg-bloom"></div>
    <div class="bg-crack"></div>
  </div>
  %(topbar)s
  <main id="app">
    <div class="preview-note">🧩 AI 文物修复 · 静态预览(真实页面渲染:本局为 AI 随机抽选「%(name)s」+ AI 破损模拟打乱的快照,重开本页即换一张;右侧「AI 裁切输出台」图纸为同版式复刻)。<br>
    点选交换 / 拖拽碎片 / AI 提示 / AI 一键修复 / 下载「完整参考图」「可裁切拼图块」等交互,请在正式页体验:浏览器打开 <b>http://localhost:8899</b>(顶栏 ➜ AI文物修复)。</div>
    %(body)s
  </main>
</body>
</html>""" % {"css": css, "topbar": topbar, "body": body2, "name": name}

tpl = inline_imgs(tpl)   # 顶栏里的品牌标志等再补一次

out = os.path.join(ROOT, "_预览_AI文物修复.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(tpl)

print("本局:", name, "(%s)" % sid, "| 模式:", mode, "%d×%d" % (cols, rows), "| 图纸 %.0f KB" % (sheet_bytes / 1024))
print("ok", out, "%.1f MB" % (os.path.getsize(out) / 1024 / 1024))
if missing:
    print("缺失图片(%d):" % len(missing))
    for m in sorted(set(missing)):
        print("  -", m)
else:
    print("所有图片已内联 ✓")
