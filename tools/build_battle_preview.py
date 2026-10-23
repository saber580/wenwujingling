# -*- coding: utf-8 -*-
"""把「选择出战精灵 → 站点页 → 2D 对战」多个画面导出成一个自带样式和图片的静态预览页
   (图片转成 base64 内嵌,任何浏览器双击都能看)
   运行: python tools\build_battle_preview.py
"""
import os, io, base64, json, quickjs
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()

# ---- 1) 用 quickjs + 假 DOM 把三段 HTML 渲染出来 ----
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
globalThis.__flush = function(){
  for(var r=0;r<50;r++){ var any=false;
    for(var i=0;i<__intervals.length;i++){ var it=__intervals[i];
      if(!it.stop){ it.fn(); any=true; } }
    if(!any) break; }
};
Math.random = function(){ return 0.999; };
"""

ctx = quickjs.Context()
ctx.eval(PRELUDE)
ctx.eval(rd("js/data.js"))
ctx.eval(rd("js/app.js"))

def shot(js):
    ctx.eval("globalThis.__go = function(){ %s }" % js)
    ctx.eval("__go()")
    overlay = ctx.eval("document.querySelector('#overlay').innerHTML")
    body = ctx.eval("document.querySelector('#battleBody').innerHTML")
    log = ctx.eval("document.querySelector('#battleLog').innerHTML")
    if body:
        overlay = overlay.replace('<div id="battleBody"></div>', body)
    if log:
        overlay = overlay.replace('<div class="log" id="battleLog"></div>',
                                  '<div class="log">%s</div>' % log)
    return overlay

def page(js):
    ctx.eval("globalThis.__page = function(){ %s }" % js)
    ctx.eval("__page()")
    return ctx.eval("document.querySelector('#app').innerHTML")

shots = []
# ① 选择出战精灵
shots.append(("① 选择出战精灵",
              "每只出战精灵都按主属性自带特性,挑一只上场",
              shot("openBattle('changxin')")))
# ② 第三站 · 张家口
shots.append(("② 第三站 · 张家口",
              "红山玉猪龙 / 西汉彩绘雁鱼灯 / 金代铜坐龙 / 元中都汉白玉螭首",
              page("location.hash = '#/station/zhangjiakou'; render();")))
# ③ 第四站 · 石家庄
shots.append(("③ 第四站 · 石家庄",
              "战国中山国王陵的宝藏:铁足铜鼎 / 十五连盏铜灯 / 四龙四凤铜方案座 / 虎噬鹿屏风座",
              page("location.hash = '#/station/shijiazhuang'; render();")))
# ④ 第五站 · 邢台(新增)
shots.append(("④ 第五站 · 邢台(新增)",
              "商「耳为父癸」铜爵 / 汉错金长颈铜壶 / 三轮盘附觞铜温炉 / 鎏金盘龙座铜博山炉 / 宋磁州窑瓷童子",
              page("location.hash = '#/station/xingtai'; render();")))
# ⑤ 出题(双方已经登场)
base = ("startBattle('yuzhulong','hushilu');"
        "var n = SPIRITS.yuzhulong.comic.length + 2; while(n-- > 0) battleComic(1);"
        "battleToExaminer(); battleAsk();")
shots.append(("⑤ 2D 对战 · 出题",
              "左右对称站位:我方(虎噬鹿屏风座)在左、野生精灵(红山玉猪龙)在右,背景是故宫,双方都是从卡片里弹出来登场的",
              shot(base)))
# ⑤ 答对 → 掷骰命中
shots.append(("⑥ 答对 · 掷骰攻击",
              "答对后我方精灵冲上去,骰子点数就是伤害;答错则被对方直接反击 -1 血",
              shot(base + "answer(B.cur.answer); __flush();")))
# ⑥ 残血 → 捕捉按钮
shots.append(("⑦ 残血 · 点击捕捉",
              "野生精灵掉到残血(≤9 血),就会出现 🎯 捕捉按钮;血量归零也会自动捕捉成功",
              shot(base + "B.spiritHp = catchLine(); paintBattle(); ")))

# ---- 2) 图片转 base64(缩小体积) ----
def data_uri(rel, size):
    im = Image.open(os.path.join(ROOT, rel.replace("/", os.sep))).convert("RGBA")
    im.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

cache = {}
def to_data(html):
    import re
    def rep(m):
        rel = m.group(1)
        if rel not in cache:
            size = 240 if rel.startswith("精灵/") else 64
            cache[rel] = data_uri(rel, size)
        return 'src="%s"' % cache[rel]
    return re.sub(r'src="([^"]+\.png)"', rep, html)


def jpeg_data_uri(rel, width, quality=86):
    im = Image.open(os.path.join(ROOT, rel.replace("/", os.sep))).convert("RGB")
    im = im.resize((width, int(round(im.height * width / im.width))), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

# ---- 3) 拼成单文件 HTML(样式和图片全部内嵌) ----
css = rd("css/style.css")
bg = os.path.join("背景", "故宫.jpg")
if os.path.exists(os.path.join(ROOT, bg)):
    css = css.replace('url("../背景/故宫.jpg")', 'url("%s")' % jpeg_data_uri(bg, 940))
parts = []
for title, sub, html in shots:
    parts.append('<div class="sec-h">%s</div>\n<div class="hint">%s</div>\n<div class="shot">%s</div>'
                 % (title, sub, to_data(html)))
body = "\n".join(parts)

out = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>文物精灵 · 对战界面预览</title>
<style>
%s
</style>
<style>
  body{background:#f3ece0;padding:20px;max-width:640px;margin:0 auto}
  h1{font-size:19px;margin:0 0 4px}
  .top-hint{color:#8a7f6d;font-size:12.5px;margin:0 0 8px;line-height:1.7}
  .sec-h{font-size:14.5px;font-weight:800;margin:26px 0 6px;display:flex;align-items:center;gap:8px}
  .sec-h::before{content:"";width:5px;height:16px;border-radius:3px;background:#b5432f}
  .hint{color:#8a7f6d;font-size:12px;margin:0 0 8px;line-height:1.7}
  .shot .sheet{position:static;max-width:none;max-height:none;margin:0;box-shadow:0 14px 40px rgba(150,110,70,.22)}
  .shot .sheet .close{display:none}
  .foot2{text-align:center;color:#a99d8a;font-size:11.5px;padding:22px 0 6px}
</style>
</head>
<body>
  <h1>文物精灵 · 对战界面预览</h1>
  <p class="top-hint">这是给老师/队友看的<b>静态预览</b>,图片和样式都已内嵌,任何浏览器直接打开即可。<br>
  正式页面还是 <b>index.html</b>(带真实动画:精灵从卡片里弹出、出手冲刺、挨打抖动)。</p>
%s
  <p class="foot2">文物精灵 · 打文物精灵 Demo · 文物资料为科普整理</p>
</body>
</html>
""" % (css, body)

dst = os.path.join(ROOT, "_预览_对战.html")
open(dst, "w", encoding="utf-8").write(out)
print("已生成:", dst, "(%.1f KB)" % (len(out.encode("utf-8")) / 1024))
