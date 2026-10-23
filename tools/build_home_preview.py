# -*- coding: utf-8 -*-
"""生成「中国风主页」静态预览:quickjs 真实渲染 viewHome/viewMuseums/viewCreative,
   再把 CSS 与所有图片内联为 data URI,输出 _预览_主页.html(无需服务器即可查看)。"""
import os, re, base64, quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()

PRELUDE = r"""
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
"""

ctx = quickjs.Context()
ctx.eval(PRELUDE)
ctx.eval(rd("js/data.js"))
ctx.eval(rd("js/app.js"))

home     = ctx.eval("viewHome()")
museums  = ctx.eval("viewMuseums()")
creative = ctx.eval("viewCreative()")
poster   = ctx.eval("viewPoster()")

# 顶栏直接取 index.html 的(与正式页保持一致),首个栏目「我的精灵」高亮;预览页无 JS,去掉交互脚本引用
_m = re.search(r'<header class="topbar">.*?</header>', rd("index.html"), re.S)
topbar = re.sub(r'\sonclick="[^"]*"', "", _m.group(0)).replace('class="nav-item"', 'class="nav-item active"', 1)

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
        if m.group(1).startswith("data:"):   # 已内联过的(如顶栏/页脚二次处理)跳过
            return m.group(0)
        uri = data_uri(m.group(1))
        if uri: return 'src="%s"' % uri
        missing.append(m.group(1))
        return m.group(0)
    return re.sub(r'src="([^"]+)"', sub, html)

# CSS:把 url("../xxx") 内联(背景/故宫.jpg、装饰/*.png、属性图标等)
def css_sub(m):
    uri = data_uri(m.group(1))
    return 'url("%s")' % uri if uri else m.group(0)
css = re.sub(r'url\("\.\./([^")]+)"\)', css_sub, rd("css/style.css"))

home2     = inline_imgs(home)
museums2  = inline_imgs(museums)
creative2 = inline_imgs(creative)
poster2   = inline_imgs(re.sub(r'\son[a-z]+="[^"]*"', "", poster))   # 静态预览:去掉交互事件属性

# 悬浮窗:AI 红舞狮「小答」(踩梅花桩来回跳为纯 CSS 动画,本页即可看到;去掉交互事件属性)
_aqm = re.search(r'<!-- AQ-WIDGET-START.*?-->(.*?)<!-- AQ-WIDGET-END -->', rd("index.html"), re.S)
aq2 = inline_imgs(re.sub(r'\son[a-z]+="[^"]*"', "", _aqm.group(1))) if _aqm else ""

sep = lambda t: '<div class="preview-sep">%s</div>' % t

tpl = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>预览 · 文物精灵 中国风主页</title>
<style>
%(css)s
.preview-note{
  font-size:12.5px;color:#7a6a52;background:#fbf3e2;border:1px dashed #e0c9a0;
  border-radius:12px;padding:10px 14px;margin:0 0 16px;line-height:1.8;
}
.preview-sep{
  text-align:center;color:#a99d8a;font-size:12px;letter-spacing:2px;
  margin:34px 0 10px;padding-top:22px;border-top:1px dashed #e0d5bd;
}
</style>
</head>
<body data-page="home" data-bg="e">
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
    <div class="preview-note">🎨 中国风主页 · 静态预览(真实视图渲染 + 样式/图片内联,可直接滚动查看)。<br>
    背景为「五 · 中国红」动态背景(红底金云 · 金芒红日 · 祥云巡行,本页即可看到;金尘粒子见正式页);五套国风备选(青绿山水 / 水墨烟雨 / 鎏金宫阙 / 天青青花)已内置,换风格在正式版改 body 的 data-bg 即可。<br>
    新增:AI 打卡海报页(写实 / Q版两张例图见本页底部;一键合成交互需在正式页里玩)。<br>
    新增:页尾右下角 <b>AI 红舞狮「小答」</b>——踩梅花桩来回跳(纯 CSS 动画,本页就能看到);点开聊天答疑 / 带路 / 出题答题需在正式页体验。<br>
    完整交互版:在浏览器打开 <b>http://localhost:8899</b>(顶部导航、地图点位、打卡对战均可点击)。</div>
    %(home)s
    %(sep1)s
    %(museums)s
    %(sep2)s
    %(creative)s
    %(sep3)s
    %(poster)s
  </main>
  <!-- 尾页(深色版式,预览内链接为静态文字) -->
  <footer class="foot">
    <div class="foot-in">
      <div class="foot-brand">
        <div class="foot-logo">
          <img class="brand-logo" src="装饰/神兽标志.png" alt="文物精灵">
          <b>文物精灵</b>
          <span class="en">RELIC SOUL</span>
        </div>
        <p>让每一个中国文物,都鲜活起来。</p>
      </div>
      <div class="foot-cols">
        <div class="fc"><b>功能</b>
          <span>我的精灵</span><span>文物图鉴</span><span>属性图鉴</span>
        </div>
        <div class="fc"><b>探索</b>
          <span>河北的博物馆</span><span>文创灵感</span><span>AI 打卡海报</span>
        </div>
        <div class="fc"><b>关于</b>
          <span>关于本站 · 大学 AI 网页作品</span>
          <span>文物资料为科普整理,以博物馆官方为准</span>
          <span>演示项目 · 2026</span>
        </div>
      </div>
    </div>
    <div class="foot-bar">
      <span>© 2026 文物精灵 RELIC SOUL · 本页为设计预览</span>
      <span class="fb-r"><em>部分内容为演示数据</em><em>河北 · 中国</em></span>
    </div>
  </footer>

%(aq)s
</body>
</html>""" % {
    "css": css,
    "topbar": topbar,
    "home": home2,
    "museums": museums2,
    "creative": creative2,
    "poster": poster2,
    "aq": aq2,
    "sep1": sep("博物馆页预览"),
    "sep2": sep("文创页预览"),
    "sep3": sep("AI 打卡海报页预览 · 一键合成需在正式页体验"),
}

# 顶栏(取自 index.html)与页脚模板里的图片也补一次内联
tpl = inline_imgs(tpl)

out = os.path.join(ROOT, "_预览_主页.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(tpl)

print("ok", out, "%.1f MB" % (os.path.getsize(out) / 1024 / 1024))
if missing:
    print("缺失图片(%d):" % len(missing))
    for m in sorted(set(missing)):
        print("  -", m)
else:
    print("所有图片已内联 ✓")
