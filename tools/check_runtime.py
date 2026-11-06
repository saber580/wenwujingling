# -*- coding: utf-8 -*-
"""无浏览器环境下,用 quickjs + 假 DOM 跑通「对战 → 捕捉」全流程"""
import os, quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()
import re as _re
_HTML = rd("index.html")
SITES = [_s.split("?")[0] for _s in _re.findall(r'<script[^>]*src="([^"]+)"', _HTML)]
JS_ALL = "\n".join(rd(_s) for _s in SITES if _s.startswith("js/") and _s.endswith(".js")
                    and os.path.exists(os.path.join(ROOT, _s)))
CSS_ALL = "\n".join(rd("css/" + _f) for _f in sorted(os.listdir(os.path.join(ROOT, "css")))
                    if _f.endswith(".css"))

PRELUDE = r"""
// ---- 假 DOM/环境 ----
function fakeCtx2d(){
  var o = { canvas:{width:800,height:600},
    measureText:function(t){ return { width:(t?String(t).length:0)*12 }; },
    createLinearGradient:function(){ return { addColorStop:function(){} }; },
    createRadialGradient:function(){ return { addColorStop:function(){} }; },
    createPattern:function(){ return {}; },
    createImageData:function(w,h){ return { data:new Uint8ClampedArray(Math.max(4,(w||1)*(h||1)*4)), width:w||1, height:h||1 }; },
    getImageData:function(x,y,w,h){ return { data:new Uint8ClampedArray(Math.max(4,(w||1)*(h||1)*4)), width:w||1, height:h||1 }; },
    putImageData:function(){}, drawImage:function(){}, setTransform:function(){},
    save:function(){}, restore:function(){}, beginPath:function(){}, closePath:function(){},
    moveTo:function(){}, lineTo:function(){}, arc:function(){}, rect:function(){},
    fill:function(){}, stroke:function(){}, clip:function(){}, translate:function(){},
    scale:function(){}, rotate:function(){}, fillRect:function(){}, strokeRect:function(){},
    clearRect:function(){}, fillText:function(){}, strokeText:function(){}, setLineDash:function(){},
    globalAlpha:1, globalCompositeOperation:"source-over", lineWidth:1, font:"10px sans-serif" };
  o.fillStyle="#000"; o.strokeStyle="#000";
  return o;
}
function fakeEl(tag){
  return {
    tagName:(tag||"div").toUpperCase(), id:"", className:"", innerHTML:"", textContent:"",
    style:{}, dataset:{}, scrollTop:0, scrollLeft:0, scrollHeight:600, scrollWidth:800,
    offsetWidth:800, offsetHeight:600, clientWidth:800, clientHeight:600,
    children:[], childNodes:[], firstChild:null, lastChild:null, parentNode:null,
    value:"", checked:false, disabled:false, hidden:false, files:[],
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    removeAttribute(){}, hasAttribute(){ return false; },
    appendChild:function(c){ return c||fakeEl(); },
    insertBefore:function(c){ return c||fakeEl(); },
    removeChild:function(c){ return c||fakeEl(); },
    replaceChild:function(c){ return c||fakeEl(); },
    remove(){}, cloneNode:function(){ return fakeEl(tag); },
    focus(){}, blur(){}, click(){}, dispatchEvent(){ return true; },
    querySelector:function(){ return fakeEl(); }, querySelectorAll:function(){ return []; },
    getElementsByTagName:function(){ return []; }, getElementsByClassName:function(){ return []; },
    getBoundingClientRect:function(){ return { top:0,left:0,right:800,bottom:600,width:800,height:600 }; },
    scrollIntoView(){}, matches(){ return false; }, contains(){ return false; },
    closest:function(){ return null; }, insertAdjacentHTML(){},
    getContext:function(){ return fakeCtx2d(); },
    toDataURL:function(){ return "data:image/png;base64,"; },
    animate:function(){ return { cancel(){}, finish(){} }; },
    play:function(){ return __thenable(); }, pause(){}
  };
}
var __cache = {};
var document = {
  title:"", head:fakeEl("head"), documentElement:fakeEl("html"), body:fakeEl("body"),
  createElement:function(t){ return fakeEl(t); },
  createTextNode:function(t){ var e=fakeEl("text"); e.textContent=t; return e; },
  createDocumentFragment:function(){ return fakeEl("fragment"); },
  querySelector:function(s){ if(!__cache[s]) __cache[s]=fakeEl(); return __cache[s]; },
  querySelectorAll:function(){ return []; },
  getElementById:function(id){ var k="#"+id; if(!__cache[k]) __cache[k]=fakeEl(id); return __cache[k]; },
  getElementsByClassName:function(){ return []; },
  getElementsByTagName:function(){ return []; },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; }
};
var window = { innerWidth:1280, innerHeight:800, scrollY:0, pageYOffset:0, devicePixelRatio:1,
  addEventListener(){}, removeEventListener(){}, scrollTo(){},
  matchMedia:function(){ return { matches:false, addListener(){}, removeListener(){}, addEventListener(){} }; },
  getComputedStyle:function(){ return { getPropertyValue:function(){ return ""; } }; } };
var location = { hash:"", href:"http://localhost/", search:"", pathname:"/" };
var history = { pushState(){}, replaceState(){}, back(){} };
var localStorage = { _d:{}, getItem:function(k){ return this._d[k]||null; },
  setItem:function(k,v){ this._d[k]=v; }, removeItem:function(k){ delete this._d[k]; }, clear:function(){ this._d={}; } };
var sessionStorage = localStorage;
var URL = { createObjectURL:function(){ return "blob:x"; }, revokeObjectURL:function(){} };
function getComputedStyle(){ return { getPropertyValue:function(){ return ""; } }; }
function addEventListener(){} function removeEventListener(){}
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
Math.random = function(){ return 0.999; };  // 使掷骰恒为 6
// ---- 补桩:页面在 10-24 改版后新增开场动画/音频/媒体 API ----
var __rafQ = [];
function requestAnimationFrame(cb){ __rafQ.push(cb); return __rafQ.length; }
function cancelAnimationFrame(){}
globalThis.__flushRAF = function(){
  for(var r=0;r<8 && __rafQ.length;r++){ var q=__rafQ.splice(0);
    for(var j=0;j<q.length;j++){ try{ q[j](16*j); }catch(e){} } }
};
var performance = { now: function(){ return Date.now(); } };
var navigator = { userAgent:"headless", language:"zh-CN",
  mediaDevices:{ getUserMedia:function(){ var o={}; o.then=function(){return o;}; o.catch=function(){return o;}; return o; } } };
var speechSynthesis = { speak:function(){}, cancel:function(){}, getVoices:function(){ return []; } };
function Audio(src){ this.src=src||""; this.volume=1; this.currentTime=0; this.duration=120;
  this.play=function(){ return __thenable(); }; this.pause=function(){};
  this.load=function(){}; this.addEventListener=function(){}; }
function __thenable(){ var o={}; o.then=function(){ return o; }; o.catch=function(){ return o; };
  o.finally=function(){ return o; }; return o; }
function fetch(){ return __thenable(); }
function Image(){ this.src=""; this.width=0; this.height=0;
  this.addEventListener=function(){}; this.onload=null; }
function FileReader(){ this.readAsDataURL=function(){};
  this.addEventListener=function(){}; this.onload=null; this.result=""; }
function alert(){} function confirm(){ return false; } function prompt(){ return null; }
"""

ctx = quickjs.Context()
ctx.eval(PRELUDE)
_loaded, _skipped = [], []
for _s in SITES:
    if not (_s.startswith("js/") and _s.endswith(".js")):
        continue
    try:
        ctx.eval(rd(_s)); _loaded.append(_s)
    except Exception as _e:
        _skipped.append((_s, str(_e)[:60]))
try:
    ctx.eval("(typeof __flushRAF==='function') ? (__flushRAF(), 1) : 0")
except Exception:
    pass

def ev(x): return ctx.eval(x)

SPIRIT_IDS = [k for k in __import__("json").loads(ev("JSON.stringify(Object.keys(SPIRITS))"))]

print("首页渲染长度:", ev("(render(), document.querySelector('#app')) && 0") or ev("viewHome().length"))
print("首页包含标题:", ev("viewHome().includes('文物精灵')"))
print("站点页包含铁狮子:", ev("viewStation('cangzhou').includes('沧州铁狮子')"))
print("保定站包含长信宫灯:", ev("viewStation('baoding').includes('长信宫灯') && viewStation('baoding').includes('满城汉墓')"))
print("分站立绘路径:", ev("viewStation('baoding').includes('精灵/保定/changxin.webp') && viewStation('cangzhou').includes('精灵/tielion.webp') && viewStation('hengshui').includes('精灵/衡水/lianhuazun.webp')"))
print("精灵页包含属性:", ev("viewSpirit('tielion').includes('青铜器') && viewSpirit('tielion').includes('宗教文物')"))
print("首页属性图鉴:", ev("viewHome().includes('属性图标/主属性/p_bronze.webp') && viewHome().includes('属性图标/副属性/s_currency.webp')"))
print("首页卡片带图标:", ev("viewHome().includes('属性图标/主属性/p_jade.webp')"))
# ---- 中国风主页(大改造) ----
print("首页 12 字大标题:", ev("viewHome().includes('讲好中国故事') && viewHome().includes('让文物活起来')"))
print("首页四大分类卡:", ev("""
(()=>{ const h = viewHome();
  return (h.match(/cat-card/g)||[]).length >= 4
      && ['我的精灵','文物图鉴','河北地图','博物馆与文创'].every(t=>h.includes(t)); })()
"""))
print("首页中国风装饰齐全:", ev("['夔龙角','青铜鼎','印章','红日','远山带'].every(t=>viewHome().includes('装饰/'+t+'.webp'))"))
print("首页地图+点位:", ev("""
(()=>{ const h = viewHome();
  return h.includes('装饰/河北地图.webp') && (h.match(/map-mark/g)||[]).length === 12
      && MAP_MARKS.stations.length === 12 && MAP_MARKS.cities.length >= 5; })()
"""))
print("承德站精灵:", ev("viewStation('chengde').includes('鸡腿瓶') && viewStation('chengde').includes('宗喀巴') && viewStation('chengde').includes('凤凰脊兽')"))
print("唐山站精灵:", ev("viewStation('tangshan').includes('彩陶壶') && viewStation('tangshan').includes('镇墓兽') && viewStation('tangshan').includes('铜戈') && viewStation('tangshan').includes('陶楼')"))
print("秦皇岛站精灵:", ev("viewStation('qinhuangdao').includes('铜簋') && viewStation('qinhuangdao').includes('陶骆驼') && viewStation('qinhuangdao').includes('牡丹') && viewStation('qinhuangdao').includes('香薰')"))
print("廊坊站精灵:", ev("viewStation('langfang').includes('长明灯楼') && viewStation('langfang').includes('太和十一年') && viewStation('langfang').includes('三彩') && viewStation('langfang').includes('菩萨')"))
print("邯郸站精灵:", ev("viewStation('handan').includes('金牌饰') && viewStation('handan').includes('熨斗') && viewStation('handan').includes('时苗留犊')"))
print("衡水站精灵:", ev("viewStation('hengshui').includes('莲花尊') && viewStation('hengshui').includes('陶楼') && viewStation('hengshui').includes('瓦当')"))
print("纹样边框分布:", ev("JSON.stringify(Object.values(SPIRITS).map(s=>decorFrame(s)).reduce((o,f)=>{o[f]=(o[f]||0)+1;return o;},{}))"))
print("青铜→饕餮/陶瓷→缠枝莲:", ev("decorFrame(SPIRITS.tielion)==='饕餮框' && decorFrame(SPIRITS.qinghuaci)==='缠枝莲框'"))
print("青瓷→冰裂/唐→忍冬/北魏→忍冬/金器→回纹:", ev("decorFrame(SPIRITS.longhu)==='冰裂框' && decorFrame(SPIRITS.lianhuazun)==='冰裂框' && decorFrame(SPIRITS.baiyulion)==='忍冬框' && decorFrame(SPIRITS.taihezaoxiang)==='忍冬框' && decorFrame(SPIRITS.jinpaishi)==='回纹框'"))
print("站点页纹样框:", ev("viewStation('xingtai').includes('decor-card') && (viewStation('xingtai').match(/fr-/g)||[]).length >= 5"))
print("图鉴/详情/出战选择纹样框:", ev("viewCodex().includes('fr-') && viewSpirit('tongjue').includes('decor-card') && (openBattle('tielion'), document.querySelector('#overlay').innerHTML.includes('decor-card'))"))
print("博物馆页:", ev("viewMuseums().includes('河北博物院') && viewMuseums().includes('邢台博物馆') && viewMuseums().includes('承德避暑山庄博物院') && viewMuseums().includes('唐山博物馆') && viewMuseums().includes('秦皇岛博物馆') && viewMuseums().includes('廊坊博物馆') && viewMuseums().includes('邯郸市博物馆') && viewMuseums().includes('衡水市博物馆') && MUSEUMS.length === 12 && viewMuseums().includes('#/station/')"))
print("文创页:", ev("viewCreative().includes('文创') && CREATIVE.length >= 8 && viewCreative().includes(CREATIVE_NOTE.slice(0, 10))"))
print("顶栏九栏目(AI打卡海报/AI文物修复/AI精灵茶话会/AI赋彩/AI文物识别 一级入口):", all((t in rd("index.html")) or (t.replace("AI","AI ") in rd("index.html")) for t in ["文物精灵", "我的精灵", "地图", "图鉴", "关于", "AI打卡海报", "AI文物修复", "AI精灵茶话会", "AI赋彩", "AI文物识别"]) and rd("index.html").count("nav-drop") >= 3 and ('data-nav="poster"' in rd("index.html")) and ('href="#/poster"' in rd("index.html")) and ('href="#/restore"' in rd("index.html")) and ('href="#/tea"' in rd("index.html")) and ('href="#/dye"' in rd("index.html")) and ('href="#/ident"' in rd("index.html")))
print("导航含博物馆/文创(收进其他下拉):", "博物馆" in rd("index.html") and "文创" in rd("index.html"))
# ---- AI 文物修复(16/32/64 三档 · 参考图/拼图块导出 · AI 元素) ----
print("AI文物修复(三档/导出/AI要素):", ev("""
(()=>{ const h = viewRestore();
  return ['16 块','32 块','64 块','完整参考图','下载拼图块','复原度实时检测','AI 一键修复','rs-board','rs-cv-sheet'].every(t=>h.includes(t))
      && (h.match(/rs-piece/g)||[]).length === 16
      && typeof rsSwap === 'function' && typeof rsAuto === 'function' && typeof rsDownload === 'function'; })()
"""))
print("AI文物修复·打乱/交换/复原冒烟:", ev("""
(()=>{ RS.mode='64'; rsBuild(true); const N=64; const before=RS.slots.slice();
  const mis0 = before.filter((v,i)=>v!==i).length;
  rsSwap(0,1);
  const changed = RS.slots[0]===before[1] && RS.slots[1]===before[0];
  let guard=0; while (rsCorrect(RS.slots)!==N && guard<300){ let p=-1; for(let i=0;i<N;i++){ if(RS.slots[i]!==i){p=i;break;} } if(p<0) break; rsSwap(p, RS.slots[p]); guard++; }
  return mis0>=6 && changed && rsCorrect(RS.slots)===N; })()
"""))
print("首页锚点+导航脚本:", ev("""
viewHome().includes('id="home-map"') && viewHome().includes('id="home-attr"') && viewHome().includes('id="home-stations"')
""") and ("function navGo" in JS_ALL) and ("toggleDD" in JS_ALL))
print("navGo 冒烟:", ev("navGo('home-mine') === false"))
print("CSS 纹样边框+万字底纹:", ("border-image" in CSS_ALL) and ("装饰/万字底纹.webp" in CSS_ALL) and ("装饰/回纹框.webp" in CSS_ALL))
# ---- 版式焕新:横版英雄区(左文案右印章精灵) + 区块头 + 三列站点 ----
print("首页版式焕新(英雄区/区块头/三列站点):", ev("""
(()=>{ const h = viewHome();
  return h.includes('装饰/红日.webp') && h.includes('装饰/远山带.webp') && !h.includes('home-scene')
      && (h.match(/sec-head/g)||[]).length >= 4 && h.includes('hero-facts') && h.includes('hero-orbit')
      && h.includes('station-grid') && (h.match(/orbit-chip/g)||[]).length >= 3; })()
"""))
print("全站动态山水背景(bg-art/青绿山水):", (('class="bg-art"' in rd("index.html")) and ("背景/青绿山水.webp" in CSS_ALL) and ("bg-art-img" in CSS_ALL) and ("function initBgArt" in JS_ALL) and os.path.exists(os.path.join(ROOT, "背景", "青绿山水.webp"))))
print("五套国风背景(五方案样式·挂件已撤,默认 e·中国红):", (('class="bg-switch"' not in rd("index.html")) and ('data-bg="e"' in rd("index.html")) and ("initBgSwitch" not in JS_ALL) and all(t in CSS_ALL for t in ['body[data-bg="a"]', 'body[data-bg="b"]', 'body[data-bg="c"]', 'body[data-bg="d"]', 'body[data-bg="e"]', "bgCloud", "青绿山.svg", "飞鸟.svg", "bg-sun"])))
print("CSS 焕新(宣纸纹+山水背景+渐显):", ("装饰/宣纸纹.webp" in CSS_ALL) and ("bg-art-img" in CSS_ALL) and ("hero-mtn" in CSS_ALL) and (".rv{" in CSS_ALL))
print("红金尾页(品牌+标语+三栏+版权行):", all(t in rd("index.html") for t in ['class="foot-in"', '让每一个中国文物,都鲜活起来', 'RELIC SOUL', 'class="foot-bar"', '河北 · 中国']))
# ---- 打卡拍照 · AI 幻化唤醒新文物(编码顺延 → 「我点亮的文物」栏目 / 海报可选;不计入我的精灵) ----
print("拍照唤醒(幻化/编码/点亮栏目/海报可选):", ev("""
(()=>{
  if (typeof openPhoto !== 'function' || typeof onPhoto !== 'function' || typeof photoFlow !== 'function'
      || typeof localStylize !== 'function' || typeof aiStylize !== 'function' || typeof wakeFormStep !== 'function'
      || typeof wakeConfirm !== 'function' || typeof wakeDoneStep !== 'function' || typeof viewSpiritCustom !== 'function'
      || typeof removeCustom !== 'function' || typeof nextCustomNo !== 'function') return '缺函数';
  if (nextCustomNo() !== 'HB-075') return '首个编码应为 HB-075,实际:' + nextCustomNo();
  const id = 'myzztest', no = 'HB-099';
  CUSTOMS.push({ id: id, no: no, name: '测试小神兽', primary: 'bronze', secondary: 'currency', img: 'x', era: 'e', intro: 'i', history: 'h', trivia: 't' });
  registerCustoms();
  const cx = viewCodex(), hm = viewHome(), sel = posterSpiritOptions(id);
  const ok = viewSpirit(id).includes('测试小神兽')
      && cx.includes('我点亮的文物') && cx.includes('测试小神兽') && cx.includes('HB-099')
      && cx.includes('另有 1 只')
      && !hm.includes('测试小神兽') && !hm.includes('HB-099') && hm.includes('<b>76</b>')
      && sel.includes('我的新唤醒') && sel.includes('测试小神兽(HB-099)') && sel.includes(' selected')
      && posterMeta(id).no === 'HB-099';
  CUSTOMS.pop();
  delete SPIRITS[id];
  return ok;
})()
"""))
print("进场动效脚本:", ("function initHomeFx" in JS_ALL) and ("IntersectionObserver" in JS_ALL))
print("精灵页含出战特性:", ev("viewSpirit('tielion').includes('铜筋铁骨')"))
# 选择出战精灵面板
print("出战选择面板:", ev("""
(()=>{
  openBattle('tielion');
  const h = document.querySelector('#overlay').innerHTML;
  return h.includes('选择出战精灵') && h.includes('铜筋铁骨') && h.includes('温润养德');
})()
"""))
print("特性表(主属性):", ev("Object.keys(ATTRIBUTES.primary).map(k=>k+'='+(TRAITS[k]?TRAITS[k].name:'缺')).join(' ')"))
print("舞台(故宫+透明立绘+左右对称):", ev("""
(()=>{
  startBattle('tielion','qinghuaci');
  let n = SPIRITS.tielion.comic.length + 1;
  while(n-- > 0) battleComic(1);
  const h = document.querySelector('#overlay').innerHTML;
  return h.includes('精灵/透明/qinghuaci.webp') && h.includes('精灵/透明/tielion.webp')
      && h.includes('unit foe') && h.includes('unit mine') && h.includes('flip');
})()
"""))
print("CSS 故宫背景:", "背景/故宫.webp" in open(os.path.join(ROOT, 'css', 'style.css'), encoding='utf-8').read())
print("透明立绘齐全(", ev("Object.keys(SPIRITS).length"), "/", ev("Object.keys(SPIRITS).length"), "):",
      all(os.path.exists(os.path.join(ROOT, '精灵', '透明', k + '.webp')) or os.path.exists(os.path.join(ROOT, '精灵', '透明', k + '.webp')) for k in SPIRIT_IDS))

# ---- 对战题池:一半考它自己、一半通识(交替排列) ----
print("对战题池(一半考它自己):", ev("""
(()=>{
  startBattle('tielion','tielion');
  const own = B.s.quiz.map(q=>q.q);
  const com = COMMON_QUIZ.map(q=>q.q);
  const first = B.pool.slice(0, 12);
  const ownN = first.filter(x=>own.indexOf(x.q)>=0).length;
  const comN = first.filter(x=>com.indexOf(x.q)>=0).length;
  const firstOk = own.indexOf(B.pool[0].q)>=0 && com.indexOf(B.pool[1].q)>=0 && B.pool[0].self===true;
  return '前 12 题 自述='+ownN+' 通识='+comN+' 首题自述='+firstOk;
})()
"""))

print("图腾数:", ev("Object.keys(SPIRITS).length"), "| 站点:", ev("STATIONS.map(s=>s.name).join(' / ')"))

# ---- 全答对:应捕捉成功 ----
driver_ok = ev("""
(()=>{
  startBattle('tielion','tielion');
  let guard=0;
  while(B.phase!=='over' && guard++<200){
    if(B.phase==='comic') battleComic(1);
    else if(B.phase==='intro') battleToExaminer();
    else if(B.phase==='examiner') battleAsk();
    else if(B.phase==='asking') {}            // 计时器已同步触发
    else if(B.phase==='question'){
      if(B.chosen<0) answer(B.cur.answer);     // 选正确答案
      else battleNext();
    } else if(B.phase==='rolling'){ __flush(); }
  }
  return JSON.stringify({phase:B.phase, win:B.win, spiritHp:B.spiritHp, myHp:B.myHp, myMax:B.myMax, captured:captured.includes('tielion')});
})()
""")
print("全答对(青铜出战,上限+2) ->", driver_ok)

# ---- 全答错:应失败 ----
driver_bad = ev("""
(()=>{
  captured = captured.filter(x=>x!=='baozhen');
  startBattle('baozhen','baozhen');
  let guard=0;
  while(B.phase!=='over' && guard++<200){
    if(B.phase==='comic') battleComic(1);
    else if(B.phase==='intro') battleToExaminer();
    else if(B.phase==='examiner') battleAsk();
    else if(B.phase==='question'){
      if(B.chosen<0){ const wrong=[0,1,2,3].find(i=>i!==B.cur.answer&&i!==B.hintIdx); answer(wrong); }
      else battleNext();
    } else if(B.phase==='rolling'){ __flush(); }
  }
  return JSON.stringify({phase:B.phase, win:B.win, myHp:B.myHp, myMax:B.myMax, captured:captured.includes('baozhen')});
})()
""")
print("全答错 ->", driver_bad)

print("图鉴页含已收集:", ev("viewCodex().includes('沧州铁狮子')"))
print("知识库问答:", ev("spiritAnswer(SPIRITS.tielion, '你多大')"))
print("知识库兜底:", ev("spiritAnswer(SPIRITS.tielion, '今天天气').slice(0,12)"))
print("出土问答(每只):", ev("Object.keys(SPIRITS).map(k=>k+'→'+spiritAnswer(SPIRITS[k],'你是怎么出土的').slice(0,12)).join(' | ')"))

# ---- 答错应固定扣 1 血(不掷骰) ----
print("答错扣血 ->", ev("""
(()=>{
  startBattle('longhu','tielion');
  B.phase='question'; B.cur={q:'测试',options:['a','b','c','d'],answer:0}; B.chosen=-1; B.hintIdx=-1;
  const before=B.myHp;
  answer(1);                       // 选错误答案
  return JSON.stringify({before, after:B.myHp, dice:B.dice, diceWho:B.diceWho});
})()
"""))

# ---- 残血捕捉 ----
print("残血捕捉 ->", ev("""
(()=>{
  captured = captured.filter(x=>x!=='tielion');
  startBattle('tielion','tielion');
  B.phase='question'; B.chosen=-1; B.cur={q:'测试',options:['a','b','c','d'],answer:0};
  B.spiritHp = catchLine();        // 打到残血线
  const weak = isWeak();
  captureNow();
  return JSON.stringify({catchLine:catchLine(), weak, phase:B.phase, win:B.win, captured:captured.includes('tielion')});
})()
"""))

# ---- 特性效果:金/木等加成(直接调 rollAttack) ----
print("特性·骰子 ->", ev("""
(()=>{
  const out=[];
  // 陶瓷(龙冰壶):掷 6 → 5、6 加 2
  startBattle('tielion','longhu'); out.push('陶瓷='+B.tkey+'/'+rollAttack());
  // 玉器(玉坠):不掷骰加成
  startBattle('tielion','yuzhui'); out.push('玉器='+B.tkey+'/'+rollAttack());
  // 青铜(五铢钱):+2 上限
  startBattle('tielion','wuzhuqian'); out.push('青铜上限='+B.myMax);
  return out.join(' | ');
})()
"""))

# ---- AI 打卡海报:页面渲染 + 编号/馆藏映射 ----
print("海报页渲染:", ev("""
(()=>{ const h = viewPoster();
  return h.includes('AI 打卡海报') && h.includes('打卡海报/例图_写实.webp') && h.includes('打卡海报/例图_Q版.webp')
      && h.includes('posterCanvas') && h.includes('一键生成海报') && h.includes('图鉴编号:HB-001');
})()
"""))
print("海报数据(编号/冷知识 30-60 字):", ev("""
(()=>{ let b=[]; const nos={};
  for (const k of Object.keys(SPIRITS)) { const m=POSTER_META[k];
    if(!m){ b.push(k+'缺'); continue; }
    if(!/^HB-\\d{3}$/.test(m.no||'')) b.push(k+'编号格式');
    if(nos[m.no]) b.push(k+'重复'); nos[m.no]=1;
    const L=(m.trivia||'').length; if(L<30||L>60) b.push(k+L+'字');
  }
  return b.join('; ') || 'OK(' + Object.keys(POSTER_META).length + ' 只全齐、编号唯一、冷知识 30-60 字)';
})()
"""))
print("海报打卡地点映射:", ev("""
JSON.stringify({ tielion: posterHall('tielion'), changxin: posterHall('changxin'),
  chishou: posterHall('chishou'), yuzhulong: posterHall('yuzhulong'),
  wuzhuqian: posterHall('wuzhuqian') })
"""))
print("海报默认选中:", ev("posterSpiritId()"))

# ---- AI 红舞狮「小答」悬浮窗(答疑 + 带路 + 出题考官 三合一;原「AI 精灵考官」已并入) ----
print("小答·带路(带我去看沧州铁狮子→精灵页):", ev("aqAnswer('带我去看沧州铁狮子').nav === '#/spirit/tielion' && aqAnswer('带我去看沧州铁狮子').text.includes('沧州铁狮子')"))
print("小答·带路(打开图鉴/去沧州站):", ev("aqAnswer('打开图鉴').nav === '#/codex' && aqAnswer('去沧州站看看').nav === '#/station/cangzhou'"))
print("小答·统计(76 精灵/13 站/20 属性):", ev("aqAnswer('一共有多少精灵?').text.includes('76') && aqAnswer('一共有多少精灵?').text.includes('13') && aqAnswer('一共有多少精灵?').text.includes('20')"))
print("小答·捕捉话术(残血收下):", ev("aqAnswer('怎么捕捉精灵?').text.includes('残血') && aqAnswer('怎么捕捉精灵?').text.includes('收下')"))
print("小答·问候与兜底:", ev("aqAnswer('你好').text.includes('红舞狮') && aqAnswer('xyzzy').text.includes('考考我')"))
print("小答·胶囊菜单:", ev("AQ_CHIPS.includes('考考我!') && AQ_CHIPS.length >= 5"))
print("小答·存档命名空间:", ev("AQ_KEY.indexOf('wwjl_ask_v1') === 0 && QZ_KEY.indexOf('wwjl_quiz_v1') === 0"))
print("小答·答题冒烟(出题→判卷→计分→存档):", ev("""
(()=>{
  aqQuizGreet();
  if (!QZ.spirit || QZ.phase !== 'idle') return '未进入答题问候';
  aqQuizStart();
  if (QZ.phase !== 'asking' || !QZ.cur) return '未出题';
  aqQuizAnswer(QZ.cur.answer);
  if (QZ.total !== 1 || QZ.correct !== 1 || QZ.streak !== 1 || QZ.best !== 1) return '判卷计分异常';
  aqQuizAnswer(QZ.cur.answer);
  if (QZ.total !== 1) return '重复点击未拦截';
  if (QZ.phase !== 'verdict' || QZ.busy) return '收尾阶段异常:' + QZ.phase + '/' + QZ.busy;
  const s = localStorage.getItem(QZ_KEY);
  return (s && JSON.parse(s).correct === 1) ? 'OK' : '未存档';
})()
"""))
print("小答·换考官(连换必换人):", ev("""
(()=>{ const first = QZ.spirit.id; aqQuizGreet(); const second = QZ.spirit.id; aqQuizGreet(); return first !== second && QZ.spirit.id !== second; })()
"""))
print("小答·开合/拖拽/带路钩子齐全:", ev("typeof aqOpen === 'function' && typeof aqClose === 'function' && typeof aqToggle === 'function' && typeof aqDragStart === 'function' && typeof aqDragMove === 'function' && typeof aqDragEnd === 'function' && typeof aqGo === 'function' && typeof aqSend === 'function' && typeof initAq === 'function'"))
print("小答舞台结构(三桩/狮子/头像):", all(t in rd("index.html") for t in ['aq-pole p1', 'aq-pole p2', 'aq-pole p3', 'aq-hop', 'aq-jump', 'aq-face', '装饰/红舞狮.webp', '装饰/红舞狮头.webp', 'aq-badge']))
print("小答计分胶囊+关闭双保险:", ('id="aqScore"' in rd("index.html")) and ('aq-panel[hidden]{display:none}' in CSS_ALL) and ('p.style.display = "none"' in JS_ALL))
print("旧考官已全撤(QT 无残留):", ('initQt' not in JS_ALL) and ('qt-ball' not in rd("index.html")) and ('.qt-' not in CSS_ALL) and ('qt-panel' not in CSS_ALL))
print("小答素材文件:", all(os.path.exists(os.path.join(ROOT, "装饰", f)) for f in ["红舞狮.webp", "红舞狮正面.webp", "红舞狮头.webp"]))

# ---- 开场画卷(全屏卷轴遮罩:木轴拉开 → 题字浮现 → 历代入列 → 淡出进主页;可跳过) ----
print("画卷·结构(遮罩/画轴/题字/时间轴/跳过):", all(t in rd("index.html") for t in ['id="intro"', 'sc-paper', 'sc-rod l', 'sc-rod r', 'id="scSub"', 'introSkip', '跳过画卷', '文物有话说，千古述流光', '沉睡千年的古物，一朝苏醒', '随君寻访博物']))
print("画卷·主页默认隐藏(intro-on 锁定;完播/跳过解除):", ('<body data-bg="e" class="intro-on' in rd("index.html")) and ('body.intro-on > :not(#intro){display:none}' in CSS_ALL) and ('body.intro-on{overflow:hidden}' in CSS_ALL))
print("画卷·样式与动画(卷面/画轴/浮现/入列/跳过):", all(t in CSS_ALL for t in ['.intro{', '.intro.fade{', '@keyframes introClip', '@keyframes introRollL', '@keyframes introRollR', '@keyframes introFade', '@keyframes introNode', '宣纸纹.webp', '如意祥云.webp', '.intro-skip{']))
print("画卷·脚本(初始化/跳过/收场):", ev("typeof initIntro === 'function' && typeof introSkip === 'function' && typeof introFinish === 'function' && INTRO_DYNASTIES.length === 16"))
print("画卷·朝代顺序(夏→清 16 节点):", ev("INTRO_DYNASTIES.map(d=>d[0]).join('、')") == '夏、商、西周、东周、秦、汉、三国、西晋、南北朝、隋、唐、五代、宋、元、明、清')
print("画卷·假环境冒烟(启动即播放并安全收场):", ev("INTRO.done === true") and ('initIntro();' in JS_ALL))
_intro_names = __import__("json").loads(ev("JSON.stringify(INTRO_DYNASTIES.map(d=>d[1]))"))
_intro_miss = [n for n in _intro_names if not os.path.exists(os.path.join(ROOT, "精灵", "朝代", "缩略", n))]
print("画卷·16 朝代缩略图齐:", (not _intro_miss) or ("缺:" + "、".join(_intro_miss)))
print("画卷·旁白配音(AI 神经语音 · 本地 MP3):", os.path.exists(os.path.join(ROOT, "音频", "开卷旁白.mp3")) and os.path.getsize(os.path.join(ROOT, "音频", "开卷旁白.mp3")) > 20000 and ('音频/开卷旁白.mp3' in JS_ALL))
print("画卷·以旁白读完为结束(ended + 时长/静默兜底):", ('addEventListener("ended"' in JS_ALL) and ('introReadDone' in JS_ALL) and ('introArmEndByDuration' in JS_ALL) and ('introArmEndSilent' in JS_ALL) and ('5300' not in rd("js/app.js")))
print("画卷·朗读跟随(逐句点亮):", ('.intro-reading .intro-line.lit' in CSS_ALL) and ('class="sc-line"' in rd("index.html")) and ('function introSync' in JS_ALL))
print("画卷·旁白被拦可一键开启(introVoiceOn):", ('id="introVoice"' in rd("index.html")) and ('function introVoiceOn' in JS_ALL) and ('.intro-voice[hidden]{display:none}' in CSS_ALL))
print("画卷·开卷国风配乐(本地纯音乐 · 读完淡出):", ('音频/开卷配乐.mp3' in JS_ALL) and os.path.exists(os.path.join(ROOT, "音频", "开卷配乐.mp3")) and os.path.getsize(os.path.join(ROOT, "音频", "开卷配乐.mp3")) > 300000 and ('function introMusicFade' in JS_ALL) and ('function introMusicStop' in JS_ALL))
print("画卷·历史长河(蜿蜒河道 · 文物漂浮立体):", ('function introBuildRiver' in JS_ALL) and ('@keyframes introFloat' in CSS_ALL) and ('@keyframes introFlow' in CSS_ALL) and ('.intro-river' in CSS_ALL) and ('.intro-flow' in rd("index.html")))
print("画卷·山水增色(三层远山 · 云雾淡日 · 波纹飞鸟 · 河上小舟):", ('function introRidge' in JS_ALL) and ('.intro-river .intro-ripple' in rd("index.html")) and ('.intro-river .mtn' in rd("index.html")) and ('.intro-flow' in rd("index.html")) and ('.intro-boat' in CSS_ALL) and ('@keyframes introBoatGlide' in CSS_ALL))
print("主页背景音乐(顶栏右上角按钮 · 五首切换/关闭 · 本地):", all(t in rd("index.html") for t in ['id="bgmBtn"', 'id="bgmPanel"', 'bgmPick(4)', '关闭音乐']) and all(t in JS_ALL for t in ['const BGM_TRACKS', 'function bgmToggle', 'function bgmPick', 'function bgmOff', 'function bgmBoot']) and all(t in CSS_ALL for t in ['.bgm-btn', '.bgm-panel', '.bgm-row']) and all(os.path.exists(os.path.join(ROOT, "音频", "背景音乐%d %s.mp3" % (i + 1, n))) for i, n in enumerate(["玉月巡游", "王朝终章", "华夏之美", "琴语晨思", "睡莲"])))
print("图鉴·燕赵名片(只展不捉 · 不计进度):", ('const LEGENDS' in rd("js/data.js")) and ('燕赵名片' in JS_ALL) and ('function openLegend' in JS_ALL) and ('.codex-card.legend' in CSS_ALL) and os.path.exists(os.path.join(ROOT, "精灵", "河北红舞狮.webp")) and os.path.exists(os.path.join(ROOT, "精灵", "河北神兽错银铜双翼神兽.webp")))

# ---- AI 精灵茶话会(跨文物对话:选 3~6 只 · 玩家当主持人四选一 · 年代/风俗/手艺/来历 + 各朝掌故串讲) ----
print("茶话会(页面/玩法说明/模板):", ev("""
(()=>{ const h = viewTea();
  return h.includes('AI 精灵茶话会') && h.includes('怎么玩') && h.includes('3~6') && h.includes('开场') && h.includes('主持人')
      && typeof teaToggle === 'function' && typeof teaRandom === 'function' && typeof teaStart === 'function'
      && typeof teaChoose === 'function' && typeof teaPanelHTML === 'function' && typeof teaInit === 'function'
      && typeof teaPlay === 'function' && typeof teaLore === 'function' && typeof teaAsk === 'function' && typeof teaPauseToggle === 'function'
      && TEA_TALK.open.length >= 2 && TEA_TALK.title.length >= 2 && Object.keys(TEA_TALK.q).length >= 8
      && TEA_TALK.topicLead.length >= 4 && !!TEA_TALK.end.toast.back && !!TEA_TALK.gapBack && !!TEA_TALK.bridge && !!TEA_TALK.praise
      && typeof TEA_LORE === 'object' && Object.keys(TEA_LORE).length >= 15; })()
""") and ("茶话会" in rd("js/data.js")) and ("function teaInit" in JS_ALL) and (".tea-opts" in CSS_ALL) and ("teaChoose" in JS_ALL))
print("茶话会·解锁分支(<3 显示锁定):", ev("""
(()=>{ const keep = captured.slice();
  captured = [];
  const locked = viewTea().includes('还差一点点就解锁') && viewTea().includes('/ 3');
  captured = keep;
  return locked && viewTea().includes('怎么玩'); })()
"""))
print("茶话会·选池/上限/主持四选一/逐幕散场:", ev("""
(()=>{
  captured = ['wuzhuqian','qinghuaci','yuzhui','tielion','longfengfan','changxin','caihuiluotuo'];
  const pool = teaPool().length;
  TEA.picks = []; TEA.story = null;
  teaToggle('tielion'); teaToggle('wuzhuqian'); teaToggle('changxin');
  const three = TEA.picks.length === 3 && teaCountHTML().includes('开场');
  teaToggle('qinghuaci'); teaToggle('yuzhui'); teaToggle('longfengfan'); teaToggle('caihuiluotuo');
  const cap = TEA.picks.length === 6 && TEA.picks.indexOf('caihuiluotuo') < 0;
  teaStart();
  const st0 = TEA.story;
  const initOk = !!st0 && st0.phase === 'topic' && st0.opts.length === 4 && st0.lines.length >= 8
      && st0.lines.filter(l => l.t === 'narr').length >= 2 && st0.lines.filter(l => l.t === 'say').length === 6;
  teaChoose(1);
  const n1 = TEA.story.lines.length;
  const topicOk = TEA.story.phase === 'star' && TEA.story.opts.length === 3 && TEA.story.opts.every(o => o.sid && SPIRITS[o.sid])
      && n1 >= 20 && Object.keys(TEA.story.loreUsed).length >= 3;
  teaChoose(1);
  const n2 = TEA.story.lines.length;
  const starOk = TEA.story.phase === 'end' && TEA.story.opts.length === 3 && n2 >= n1 + 6;
  teaChoose(2);
  const n3 = TEA.story.lines.length;
  const says = TEA.story.lines.filter(l => l.t === 'say');
  const ids = [];
  says.forEach(l => { if (ids.indexOf(l.id) < 0) ids.push(l.id); });
  const doneOk = TEA.story.phase === 'done' && TEA.story.opts === null && n3 >= n2 + 4
      && TEA.story.lines.filter(l => l.t === 'narr').length >= 3 && ids.length >= 5 && ids.every(id => TEA.picks.indexOf(id) >= 0)
      && says.every(l => l.x && l.x.length > 3) && TEA.story.title.length > 4 && TEA.story.sub.indexOf('主持人') >= 0
      && (TEA.story.lines.map(l => l.x).join('') + TEA.story.title + TEA.story.sub).indexOf('{') < 0;
  teaAgain();
  const again = TEA.story && TEA.story.phase === 'topic' && TEA.story.opts.length === 4 && TEA.story.lines.length >= 8;
  /* 三条支线各跑一遍(年头/手艺/来历):每场都能完整走到散场、掌故用上、无占位符残留 */
  const runLine = (topic) => {
    TEA.picks = ['tielion','changxin','wuzhuqian']; TEA.story = null; teaStart();
    teaChoose(topic);
    const a = TEA.story.lines.length;
    const lr = Object.keys(TEA.story.loreUsed).length;
    teaChoose(0);
    const b = TEA.story.lines.length;
    teaChoose(0);
    const st = TEA.story;
    return st.phase === 'done' && a >= 14 && lr >= 2 && b >= a + 6 && st.lines.length >= b + 4
        && st.lines.map(l => l.x).join('').indexOf('{') < 0;
  };
  const miniOk = runLine(0) && runLine(2) && runLine(3);
  teaReset();
  const rst = TEA.story === null && TEA.picks.length === 3;
  captured = loadCaptured();
  TEA.picks = []; TEA.story = null;
  return JSON.stringify({pool, three, cap, initOk, topicOk, starOk, doneOk, again, miniOk, rst});
})()
"""))

# ---- 茶话会·云端真聊(第 2 步起每幕由云端大模型现场写词 · 小桥→直连→本机台词库兜底 · 起草/回退状态条) ----
print("茶话会·云端真聊(双通道 + 本机兜底):", ev("""
(()=>{
  if (typeof teaCloudReady !== 'function' || typeof teaCloudAct !== 'function' || typeof teaCloudMessages !== 'function'
      || typeof teaCloudParse !== 'function' || typeof teaCloudDirect !== 'function' || typeof teaActLocal !== 'function'
      || typeof teaAdvance !== 'function'
      || typeof teaChipState !== 'function' || typeof teaChipPaint !== 'function' || typeof teaCloudKeyPaste !== 'function'
      || typeof teaInitView !== 'function') return '缺函数';
  const keep = captured.slice();
  captured = ['tielion','wuzhuqian','changxin'];
  TEA.picks = ['tielion','wuzhuqian','changxin']; TEA.story = null;
  teaStart();
  const st = TEA.story;
  /* ① 提示词组装:两份消息、带全人物与资料、要求 JSON */
  const msgs = teaCloudMessages(st, 'topic', 1);
  const promptOk = Array.isArray(msgs) && msgs.length === 2 && msgs[0].role === 'system' && msgs[1].role === 'user'
      && msgs[0].content.indexOf('JSON') >= 0 && msgs[0].content.indexOf('narr') >= 0 && msgs[0].content.indexOf('打趣') >= 0
      && msgs[1].content.indexOf('eraLore') >= 0
      && msgs[1].content.indexOf('铁狮子') >= 0 && msgs[1].content.indexOf('长信宫灯') >= 0 && msgs[1].content.indexOf('五铢钱') >= 0;
  /* ② 模型返回解析:id→精灵、narr→旁白、混入闲话也能挑出 JSON */
  const fakeText = '好的:\\n{"lines":[{"who":"tielion","x":"老夫镇守沧州千年,见过多少风浪。"},{"who":"narr","x":"茶香袅袅,檐角风铃轻响。"},{"who":"长信宫灯","x":"前辈好气魄,我这一盏灯也照过汉宫的长夜。"},{"who":"wuzhuqian","x":"两位年岁都比我长,我自汉武帝时才开铸,也见过七百年人间。"}]}';
  const parsed = teaCloudParse(fakeText, st.metas);
  const parseOk = Array.isArray(parsed) && parsed.length === 4 && parsed.filter(l => l.t === 'say').length === 3
      && parsed[0].id === 'tielion' && parsed[1].t === 'narr' && parsed[2].id === 'changxin' && parsed[3].id === 'wuzhuqian'
      && parsed.every(l => l.x.length > 4);
  /* ③ 认不出人、行数太少、没有 JSON:都判失败走兜底 */
  const badOk = teaCloudParse('今天天气不错,没有花括号', st.metas) === null
      && teaCloudParse('{"lines":[{"who":"nobody","x":"谁?"}]}', st.metas) === null;
  /* ④ 云端成功后阶段照常推进(topic→star→end→done;本地/云端共用一个出口) */
  const ast = { metas: st.metas, phase: 'topic', opts: teaTopicOpts() };
  teaAdvance(ast, 'topic', 0);
  const adv1 = ast.phase === 'star' && ast.opts.length === 3;
  teaAdvance(ast, 'star', 0);
  const adv2 = ast.phase === 'end' && ast.opts.length === 3;
  teaAdvance(ast, 'end', 0);
  const advOk = adv1 && adv2 && ast.phase === 'done' && ast.opts === null;
  /* ⑤ 自检环境没有 fetch:云端必须不可用,teaChoose 同步走本机台词库(行为与旧版一致) */
  const readyOff = teaCloudReady() === false;
  TEA.busy = false; TEA.cloudFail = false;
  teaChoose(1);
  const syncOk = TEA.busy === false && TEA.story.phase === 'star' && TEA.story.opts.length === 3
      && TEA.story.lines.length >= 12 && TEA.lastSrc === '';
  teaStopPlay();
  captured = keep;
  TEA.picks = []; TEA.story = null; TEA.busy = false; TEA.cloudFail = false; TEA.cloudDone = 0; TEA.lastSrc = ''; TEA.lastModel = '';
  return promptOk && parseOk && badOk && advOk && readyOff && syncOk;
})()
""") and all(t in JS_ALL for t in ["teaCloudReady", "teaCloudAct", "teaCloudMessages", "teaCloudParse", "teaCloudDirect", "teaDirectPost", "teaActLocal", "teaAdvance", "teaChipState", "teaCloudKeyPaste", "teaInitView", "TEA_CLOUD_SYS", 'id="tea-cloud-chip"']) and JS_ALL.count("teaAdvance(st, phase, i)") >= 3 and all(t in rd("tools/ident_cloud.py") for t in ["/api/chat", "def call_chat", "def _chat_once", "def _chat_post", '"type": "disabled"', "/api/imagine", "def imagine_cloud", "ZHIPU_IMG_MODEL", "/api/setkey", "RUNTIME"]) and (".tea-cloudchip" in CSS_ALL))

# ---- AI 赋彩(36 幅 Q 版黑白稿 · 点按填色 / 拖笔涂抹 / 一键赋彩 / 保存作品) ----
print("赋彩(页面/图稿/引擎/入口):", ev("""
(()=>{
  if (typeof viewDye !== 'function' || typeof dyeInit !== 'function' || typeof dyeLoad !== 'function'
      || typeof dyeResolveSrc !== 'function' || typeof dyeFillAt !== 'function' || typeof dyeBrush !== 'function' || typeof dyeAuto !== 'function'
      || typeof dyeReset !== 'function' || typeof dyeSave !== 'function' || typeof dyePeek !== 'function') return '缺函数';
  if (!Array.isArray(DYE_IMAGES) || DYE_IMAGES.length !== 36) return '图稿应为 36 幅,实际:' + (Array.isArray(DYE_IMAGES) ? DYE_IMAGES.length : '非数组');
  const bad = DYE_IMAGES.filter(m => !(m.f && m.w > 0 && m.h > 0 && Array.isArray(m.c) && m.c.length === 4 && m.c[2] > m.c[0] && m.c[3] > m.c[1] && m.c[2] <= m.w && m.c[3] <= m.h));
  if (bad.length) return '裁剪框异常 ' + bad.length + ' 幅';
  const h = viewDye();
  return h.includes('dye-cv') && h.includes('按住看原图') && h.includes('一键赋彩') && h.includes('保存作品')
      && (h.match(/dye-thumb/g) || []).length >= 36;
})()
""") and ('href="#/dye"' in rd("index.html")) and ("DYE_IMAGES" in rd("js/data.js")) and ("__DYE_DATA" in JS_ALL) and all(t in CSS_ALL for t in [".dye-stage", ".dye-thumb", "#dye-cv"]) and os.path.isdir(os.path.join(ROOT, "AI 赋彩")))

# ---- AI 文物识别(照片复原对比 + 器型 / 纹样 / 年代 / 材质识别) ----
print("识别(页面/引擎/入口):", ev("""
(()=>{
  if (typeof viewIdent !== 'function' || typeof identInit !== 'function' || typeof identPick !== 'function'
      || typeof identFlow !== 'function' || typeof identHeal !== 'function' || typeof identRecolor !== 'function'
      || typeof identFeats !== 'function' || typeof identRank !== 'function' || typeof identMatchSpirits !== 'function'
      || typeof identForm !== 'function' || typeof identPattern !== 'function' || typeof identSave !== 'function'
      || typeof identSetPos !== 'function' || typeof identBindSlider !== 'function' || typeof identResultHTML !== 'function'
      || typeof identCloudPing !== 'function' || typeof identCloudRun !== 'function' || typeof identCloudSlotHTML !== 'function'
      || typeof IDENT_CLOUD_API !== 'string') return '缺函数';
  if (!Array.isArray(IDENT_FORMS) || IDENT_FORMS.length < 20 || !Array.isArray(IDENT_HUES) || IDENT_HUES.length !== 12) return '常量异常';
  const h = viewIdent();
  if (!(h.includes('ident-slider') && h.includes('保存修复图') && h.includes('换一张照片')
      && h.includes('修复前') && h.includes('修复后') && h.includes('器型') && h.includes('材质')
      && h.includes('ident-cloud-state') && h.includes('云端识别'))) return '页面缺件';
  const fake = { mean: [116, 108, 88], meanSat: .22, tops: [{ w: 10, hue: '青绿', rgb: [100, 122, 92] }], edge: .06, ratio: 1.5 };
  const pR = identRank(fake, 'primary'), sR = identRank(fake, 'secondary'), mm = identMatchSpirits(fake);
  if (mm.length !== 3) return '候选应为 3 个,实际 ' + mm.length;
  const rh = identResultHTML(fake, pR, sR, mm, identForm(fake, mm), identPattern(fake.edge));
  return rh.includes('识别结果') && rh.includes('来历') && rh.includes('候选接近度')
      && rh.includes('im-item') && rh.includes('识别依据');
})()
""") and ('href="#/ident"' in rd("index.html")) and all(t in CSS_ALL for t in [".ident-slider", ".ident-grid", ".im-item", ".ident-verdict", ".ident-lore", ".icloud-card"]) and os.path.exists(os.path.join(ROOT, "tools", "ident_cloud.py")) and all(t in rd("tools/ident_cloud.py") for t in ["ark.cn-beijing.volces.com", "open.bigmodel.cn", "/api/ping", "ident_key.txt"]))

# ---- 接入 AI 大模型(设置面板:服务商 / Base URL / 钥匙 / 模型 ID) ----
print("接入 AI 大模型面板(导航入口/函数/默认值/样式):", ('云端 AI' in rd("index.html")) and all(t in JS_ALL for t in ["AI_CFG_PROVIDERS", "function aiCfgOpen", "function aiCfgApply", "function aiCfgTest", "/api/setkey"]) and all(t in CSS_ALL for t in [".aicfg-form", ".aicfg-row", ".aicfg-state"]) and ev("aiCfgDefaults().provider==='zhipu' && aiCfgDefaults().base.indexOf('open.bigmodel.cn')>=0 && aiCfgDefaults().model==='glm-4-flash' && aiCfgDefaults().account==='2502887269@qq.com' && aiCfgGet().key===''"))

# ---- 登录 / 注册(顶栏入口 · 小桥账号 · 演示账号只存哈希) ----
print("登录 / 注册(顶栏入口/双模登录/加盐哈希/小桥接口):", ('id="authBtn"' in rd("index.html")) and all(t in JS_ALL for t in ["function authOpen", "function authSubmit", "function authLogout", "AUTH_DEMO", "function authHash", "/api/login", "/api/reg"]) and all(t in CSS_ALL for t in [".auth-btn", ".auth-tabs"]) and all(t in rd("tools/ident_cloud.py") for t in ["/api/login", "/api/reg", "pbkdf2_hmac", "DEMO_EMAIL", "ACCOUNTS_FILE"]) and ev("authHash('qWeR7xY9','x') === authHash('qWeR7xY9','x') && authHash('qWeR7xY9','x') !== authHash('qWeR7xY8','x') && authWho() === null && typeof authOpen === 'function'"))

# ---- 识别 · 唤醒闭环(云端认出 → 对上图鉴精灵 → 一键唤醒收进图鉴) ----
print("识别·唤醒闭环(名字匹配 / 唤醒卡 / 一键收进图鉴):", ev("""
(()=>{
  if (typeof identWakeFind !== 'function' || typeof identWakeGo !== 'function' || typeof identWakeHTML !== 'function' || typeof identWakeCraft !== 'function') return '缺函数';
  const m1 = identWakeFind('长信宫灯');
  const m2 = identWakeFind('《沧州铁狮子》');
  const m3 = identWakeFind('青花瓷瓶');
  const m4 = identWakeFind('一台冰箱') === null && identWakeFind('') === null;
  if (!(m1 && m1.id === 'changxin') || !(m2 && m2.id === 'tielion') || !(m3 && m3.id === 'qinghuaci') || !m4) return '匹配异常';
  const keep = captured.slice();
  captured = [];
  const h1 = identWakeHTML('长信宫灯');
  const w1 = h1.includes('唤醒') && h1.includes('identWakeGo') && h1.includes('长信宫灯');
  captured = ['changxin'];
  const h2 = identWakeHTML('长信宫灯');
  const w2 = h2.includes('早已在你身边') && !h2.includes('identWakeGo');
  const h3 = identWakeHTML('一台冰箱');
  const w3 = h3.includes('暂未收录') && h3.includes('identWakeCraft');
  captured = keep;
  return w1 && w2 && w3;
})()
""") and all(t in JS_ALL for t in ["identWakeFind", "identWakeGo", "identWakeHTML", "identWakeCraft", "identNormName"]) and (".iwake" in CSS_ALL))

# ---- 打卡拍照 · AI 幻化通道(小桥智谱免费链 / 直连智谱 CogView 或方舟 Seedream / 画风参考 / 本机兜底) ----
_aj = JS_ALL
print("拍照·AI 幻化通道(双后端/画风参考/体量控制/先云后本机):", ev("""
(()=>{
  if (typeof aiImagine !== 'function' || typeof dataUrlShrink !== 'function' || typeof localStylize !== 'function') return '缺函数';
  return aiImagineOff === false && aiStyleRefP === null;
})()
""") and all(t in _aj for t in ["cogview-3-flash", "glm-4.6v-flash", "IDENT_ZHIPU_IMG", "identKeyKind", "zhipuTrimWatermark", "aiImagineBridge", "aiImagineZhipu", "aiImagineArk", "/api/imagine", "doubao-seedream-5-0-flash-260915", "IDENT_IMG_PROMPT", "精灵/tielion.webp", "response_format", "b64_json", "dataUrlShrink(dataURL, 1024, .85)", "dataUrlShrink(raw, 1024, .92)", "withTimeout(aiImagine(dataURL, desc), 45000)"]) and (_aj.index("aiImagine(dataURL, desc)") < _aj.index("localStylize(dataURL)")))

# ---- 站内知识检索(2-gram 倒排 / BM25 / 门控 / 事实核验) ----
print("知识检索·档案增强(索引规模/召回率/站务门控/事实核验):", ev("""
(()=>{
  const K = window.KB;
  if (!K) return '缺 KB';
  const st = K.stats();
  if (!(st.docs >= 1200 && st.spirits === 74 && st.terms >= 15000)) return '索引规模异常:' + JSON.stringify(st);
  const r = K.selfTest();
  if (r.top3Rate < 0.9) return '召回不足 top3=' + r.top3Rate;
  if (r.easy.top1Rate < 0.9) return '正名组 top1 不足=' + r.easy.top1Rate;
  const e1 = K.evidence('长信宫灯为什么能防烟');
  if (!e1.hits.length || e1.hits[0].sid !== 'changxin') return '证据未命中';
  const e2 = K.evidence('一共有多少精灵');
  if (e2.hits.length) return '站务问题被误注入档案';
  const c = K.check('它通高约48厘米,重约15.85公斤,排烟靠右臂', e1.hits);
  if (c.claims < 2) return '事实核验未抽出断言';
  if (c.supported.length < 1) return '事实核验未匹配到任何依据';
  return true;
})()
""") and os.path.exists(os.path.join(ROOT, "js", "kb-rag.js")) and ("kb-rag.js" in rd("index.html")) and ("KB.evidence" in rd("js/app.js")) and ("已查站内档案" in rd("js/app.js")))

# ---- 识别 · 档案核对(年代/材质冲突检出 / 未收录不误判) ----
print("识别·档案核对(一致不误报/冲突能检出/未收录不误判):", ev("""
(()=>{
  if (typeof identKBCheck !== 'function' || typeof identKBHTML !== 'function') return '缺函数';
  const a = identKBCheck({name:'长信宫灯', era:'西汉', material:'青铜器'});
  if (!a || !a.hit || a.conflicts.length) return '一致样本误报冲突:' + JSON.stringify(a && a.conflicts);
  const b = identKBCheck({name:'长信宫灯', era:'唐代', material:'白瓷'});
  if (!b || !b.hit || b.conflicts.length !== 2) return '冲突未检出:' + JSON.stringify(b && b.conflicts);
  const c = identKBCheck({name:'一台冰箱'});
  if (!c || c.hit) return '未收录样本误判为已收录';
  if (!identKBHTML({name:'长信宫灯', era:'西汉', material:'青铜器'}).includes('✅')) return '一致态文案异常';
  if (!identKBHTML({name:'长信宫灯', era:'唐代', material:'白瓷'}).includes('⚠️')) return '冲突态文案异常';
  if (!identKBHTML({name:'一台冰箱'}).includes('还没有这一件')) return '未收录文案异常';
  return true;
})()
""") and (".icloud-kb" in rd("css/style.css")) and ("identKBHTML(d)" in rd("js/app.js")))

# ---- AI 现场出题 · 题目校验(结构 / 答案有据 / 干扰项不撞档案) ----
print("AI 现场出题(结构校验/答案有据/歧义拦截/失败回退):", ev("""
(()=>{
  const K = window.KB, s = SPIRITS.changxin;
  if (!K || typeof K.verifyQuestion !== 'function') return '缺 verifyQuestion';
  const good = K.verifyQuestion({q:'长信宫灯点燃后,烟从哪里排出去?', options:['宫女的右臂','灯盘底部','灯罩缝隙','底座周围'], answer:0, tip:'右臂中空,烟顺手臂进入体腔'}, s);
  if (!good.ok) return '好题被误拒:' + good.why;
  const noBase = K.verifyQuestion({q:'长信宫灯是用什么材料做的?', options:['唐代白瓷','宋代青瓷','明代景泰蓝','清代珐琅'], answer:0, tip:'唐代白瓷'}, s);
  if (noBase.ok) return '无依据的题被放行';
  const dup = K.verifyQuestion({q:'长信宫灯出土于哪座墓?', options:['满城汉墓','满城汉墓','马王堆','海昏侯墓'], answer:0, tip:'满城汉墓'}, s);
  if (dup.ok) return '重复选项被放行';
  const ambigu = K.verifyQuestion({q:'长信宫灯是什么材质的?', options:['青铜铸造,通体鎏金','青铜铸造','木头','陶瓷'], answer:0, tip:'青铜铸造,通体鎏金'}, s);
  if (ambigu.ok) return '歧义干扰项被放行';
  if (typeof aqQuizStartAI !== 'function' || typeof qzAskAI !== 'function' || typeof qzArchivePrompt !== 'function') return '缺出题函数';
  if (!qzArchivePrompt(s).includes('只输出一个 JSON')) return '出题提示词缺 JSON 约束';
  return true;
})()
""") and ("AI 现场出题" in rd("js/app.js")) and (".aq-ai-tag" in rd("css/style.css")))

# ---- 历史常识层(年代归一 / 常识命中 / 题干主体约束) ----
print("出题·历史常识层(年代归一/常识命中/跑题拦截/时代题放行):", ev("""
(()=>{
  const K = window.KB, s = SPIRITS.changxin;
  if (!K || typeof K.histFacts !== 'function') return '缺 histFacts';
  const f = K.histFacts(s.era);
  if (!f.length) return '西汉常识为空';
  if (f.join('').indexOf('丝绸之路') < 0) return '常识里缺丝绸之路';
  if (K.eraName('西汉 · 公元前2世纪') !== '西汉') return '公元前被误判:' + K.eraName('西汉 · 公元前2世纪');
  if (K.eraName('南宋') !== '南宋') return '南宋归一错:' + K.eraName('南宋');
  if (!K.subjectOk('长信宫灯所在的西汉,五铢钱从哪位皇帝开始铸?', s)) return '主体校验误杀';
  if (K.subjectOk('唐三彩的主要釉色是什么?', s)) return '跑题没有被识别';
  const h = K.verifyQuestion({q:'长信宫灯所在的西汉,五铢钱从哪位皇帝开始铸?', options:['汉武帝','唐太宗','宋徽宗','明太祖'], answer:0, tip:'元狩五年始铸'}, s);
  if (!h.ok || h.kind !== 'history') return '时代题未通过:' + JSON.stringify(h);
  if (typeof qzArchivePrompt !== 'function') return '缺 qzArchivePrompt';
  const p = qzArchivePrompt(s, 'history');
  if (p.indexOf('时代常识') < 0 || p.indexOf('必须写出') < 0) return '时代题提示词缺约束';
  return true;
})()
""") and ("时代常识" in rd("js/app.js")) and ("eraName" in rd("js/kb-rag.js")))

# ---- 开放题判卷(好/中/差三档要拉开) ----
print("开放题·判卷梯度(高分/部分/离题三档拉开):", ev("""
(()=>{
  const K = window.KB, s = SPIRITS.changxin;
  if (!K || typeof K.gradeOpen !== 'function') return '缺 gradeOpen';
  const ref = '我的右臂和身体都是中空的。灯点燃后,烟顺着宫女的右臂进入体腔,落在里面的水里,屋子里就不会被熏黑。';
  const q = '长信宫灯为什么能防烟';
  const a = K.gradeOpen(q, '因为宫女的右臂和身体中空,烟顺着右臂进入体腔,落在里面的水里,所以屋子不会被熏黑。', s, ref);
  const b = K.gradeOpen(q, '烟顺着右臂进入体腔。', s, ref);
  const c = K.gradeOpen(q, '因为它很好看。', s, ref);
  if (!(a.score >= 80)) return '好答案分数偏低:' + a.score;
  if (!(b.score < a.score)) return '中等答案没有拉开:' + b.score + '/' + a.score;
  if (!(c.score <= 30)) return '离题答案没压住:' + c.score;
  const oq = K.openQuestion(s);
  if (!oq || !oq.ref || oq.q.indexOf('用自己的话说说') !== 0) return '开放题生成异常';
  return true;
})()
""") and ("gradeOpen" in rd("js/app.js")) and (".aq-open-in" in rd("css/style.css")))

# ---- 识别四步流水线 ----
print("识别·四步流水线(候选/对齐/校验/置信度 · 冲突降级):", ev("""
(()=>{
  if (typeof identFlowHTML !== 'function' || typeof identConfidence !== 'function') return '缺流水线函数';
  const okHtml = identFlowHTML({name:'长信宫灯', era:'西汉', material:'青铜'});
  ['云端候选','站内对齐','字段校验','置信度'].forEach(k => { if (okHtml.indexOf(k) < 0) throw new Error('缺步骤 ' + k); });
  if (okHtml.indexOf('高 · 名字、年代、材质三项都对得上') < 0) return '一致样本置信度不是高';
  const badHtml = identFlowHTML({name:'长信宫灯', era:'唐代', material:'白瓷'});
  if (badHtml.indexOf('中 · ') < 0) return '冲突样本置信度没降级';
  if (badHtml.indexOf('年代') < 0) return '冲突详情没展示';
  const missHtml = identFlowHTML({name:'一台冰箱'});
  if (missHtml.indexOf('低 · ') < 0) return '未收录样本置信度不是低';
  return true;
})()
""") and ("identFlowHTML(d)" in rd("js/app.js")) and (".icloud-flow" in rd("css/style.css")))

# ---- AI 评测台(六组金标全通过) ----
print("AI 评测台(十组金标 " + "108 条全通过 / 指标可导出):", ev("""
(()=>{
  if (!window.EVAL || typeof window.EVAL.run !== 'function') return '缺评测模块';
  const r = window.EVAL.run();
  if (r.total < 100) return '用例太少:' + r.total;
  if (r.pass !== r.total) {
    const bad = r.groups.filter(g => g.fails.length).map(g => g.name + ':' + g.fails.length);
    return '有未通过用例 ' + bad.join(',');
  }
  const keys = r.groups.map(g => g.key).join(',');
  if (keys !== 'retrieval,gate,fact,ident,qverify,open,cmp,craft,confuse,follow') return '分组缺失:' + keys;
  if (typeof evalExport !== 'function' || typeof viewEval !== 'function') return '缺页面函数';
  const html = viewEval();
  ['id="evalTiles"','id="evalGroups"','id="evalStamp"','评测口径','重跑评测'].forEach(k => {
    if (html.indexOf(k) < 0) throw new Error('页面缺 ' + k);
  });
  return true;
})()
""") and ("eval-bench.js" in rd("index.html")) and ("viewEval" in rd("js/app.js")) and (".eval-tiles" in rd("css/style.css")) and ("AI评测台" in rd("index.html")))

# ---- 内容包(四类内容: 对比 / 工艺 / 误认 / 语料) ----
print("内容包(对比 8 / 工艺 30 / 误认 15 / 语料 100):", ev("""
(()=>{
  const C = window.CONTENT;
  if (!C) return '缺内容包';
  const st = C.stats();
  if (st.cmp !== 8) return '对比组不是 8:' + st.cmp;
  if (st.craft !== 30) return '工艺词条不是 30:' + st.craft;
  if (st.confuse !== 15) return '误认对不是 15:' + st.confuse;
  if (st.corpus !== 100) return '语料不是 100:' + st.corpus;
  const miss = [];
  C.cmp.forEach(r => r.items.forEach(it => { if (!SPIRITS[it.sid]) miss.push(it.sid); }));
  if (miss.length) return '对比组引用了不存在的精灵:' + miss.join(',');
  const bad = C.corpus.filter(c => c.sid && !SPIRITS[c.sid]).map(c => c.sid);
  if (bad.length) return '语料引用了不存在的精灵:' + bad.join(',');
  if (C.craft.some(c => !c.how || !c.rep || !c.vs)) return '工艺词条字段不全';
  if (C.cmp.some(r => !r.diff || r.diff.length < 3)) return '对比组结论不足三条';
  return true;
})()
""") and ("content-pack.js" in rd("index.html")))

# ---- 跨文物对比(意图识别 / 不误判) ----
print("跨文物对比(八组识别 / 单件提问不误判):", ev("""
(()=>{
  const K = window.KB;
  if (!K || !K.compare) return '缺对比接口';
  const yes = ['长信宫灯和雁鱼灯谁的排烟更巧','后母戊鼎和中山王铁足铜鼎哪个更早','两个博山炉有什么区别','兵马俑和击鼓说唱俑有什么不同'];
  for (const q of yes) { if (!K.compare(q)) return '没判出对比:' + q; }
  const no = ['长信宫灯为什么能防烟','后母戊鼎有多重','长信宫灯在哪个博物馆','青花瓷是什么时候成熟的'];
  for (const q of no) { if (K.compare(q)) return '误判成对比:' + q; }
  const r = K.compare('长信宫灯和雁鱼灯谁的排烟更巧');
  if (r.sides.length < 2) return '对比只有一侧';
  if (!r.diff.length || !r.verdict) return '缺结论';
  const evi = K.compareEvidence('长信宫灯和雁鱼灯谁的排烟更巧');
  if (!evi.text || evi.text.indexOf('对比结论') < 0) return '对比证据块没拼出来';
  return true;
})()
""") and ("aqCmpHTML" in rd("js/app.js")) and (".aq-cmp" in rd("css/style.css")))

# ---- 工艺词典 / 误认辨析 ----
print("工艺词典与误认辨析(词条命中 / 辨析成对 / 掺进证据):", ev("""
(()=>{
  const K = window.KB;
  const c = K.craftEvidence('错金是什么意思');
  if (!c.hits.length || c.hits[0].n !== '错金银') return '工艺词条没命中';
  if (c.text.indexOf('代表作') < 0) return '工艺证据缺代表作';
  const c2 = K.craftEvidence('失蜡法和范铸法一样吗');
  if (c2.hits.length < 2) return '一句话两条工艺只捞到一条';
  const h = K.confuseHint('簋');
  if (!h || (h.wrong !== '鼎' && h.right !== '鼎')) return '误认对没配对';
  if (h.text.indexOf('最容易混') < 0) return '误认说明没生成';
  const ev2 = K.evidence('错金是什么意思', {force:true});
  if (ev2.text.indexOf('工艺·') < 0) return '工艺词条没掺进证据块';
  return true;
})()
""") and ("confuseHint" in rd("js/app.js")))

# ---- 追问式判卷(该问 / 不问 / 合并重判) ----
print("追问式判卷(漏要点追问 / 答全不问 / 合并加分):", ev("""
(()=>{
  const K = window.KB, s = SPIRITS.changxin;
  const ref = '我的右臂和身体都是中空的。灯点燃后,烟顺着宫女的右臂进入体腔,落在里面的水里,屋子里就不会被熏黑。';
  const q = '长信宫灯为什么能防烟';
  const bad = K.followUp(q, '因为烟会进到袖子里。', s, ref);
  if (!bad.need || !bad.ask) return '答漏要点却没追问';
  const good = K.followUp(q, ref, s, ref);
  if (good.need) return '答案已到位还在追问';
  const before = K.gradeOpen(q, '我把烟吸进袖子里。', s, ref);
  const after = K.gradeMerged(q, '我把烟吸进袖子里。', ref, s, ref);
  if (!(after.score > before.score)) return '补答后分数没涨:' + before.score + '→' + after.score;
  if (!after.merged) return '没标记合并判卷';
  return true;
})()
""") and ("aqOpenFollow" in rd("js/app.js")))

# ---- 双模型互审 + 级联回答 ----
print("双模型互审 / 级联回答(代码链路 + 可点名模型 + 五步流水线):", 
      ("identReview" in rd("js/app.js")) and ("aiCascade" in rd("js/app.js")) and
      ("model: body.model" in rd("js/cloud-ai.js")) and
      ("五步走" in rd("js/app.js")) and ("交叉复核" in rd("js/app.js")) and
      ("→ " in rd("js/app.js")) and
      ev("""
(()=>{
  if (typeof identReview !== 'function') return '缺互审函数';
  if (typeof aiCascade !== 'function') return '缺级联函数';
  if (typeof aqLight !== 'function') return '缺红绿灯';
  const h = identFlowHTML({name:'一台冰箱'});
  if (h.indexOf('交叉复核') < 0) return '流水线没有复核步';
  const L = aqLight({check:{claims:3, supported:[1,2,3], unsupported:[], ratio:1}});
  if (!L || L.k !== 'green') return '红绿灯判色错';
  const R = aqLight({check:{claims:3, supported:[1], unsupported:[1,1], ratio:0.33}});
  if (R.k !== 'yellow') return '部分可核应为黄';
  const X = aqLight({check:{claims:2, supported:[], unsupported:[1,1], ratio:0}});
  if (X.k !== 'red') return '全不核应为红';
  return true;
})()
"""))

# ---- 反馈闭环(👍👎 → 坏例库 → 导出) ----
print("反馈闭环(投票 / 坏例库 / 导出成用例 / 评测台入口):", ev("""
(()=>{
  const F = window.FB;
  if (!F) return '缺反馈模块';
  const html = F.foot('aq', {q:'测试问题', a:'测试回答', model:'m', light:'green'});
  if (html.indexOf('fb-foot') < 0 || html.indexOf('👎') < 0) return '反馈条没渲染';
  try { localStorage.removeItem('relic.fb.v1'); } catch(e) {}
  const id = html.match(/id="([^"]+)"/)[1];
  document.body.insertAdjacentHTML('beforeend', '<div id="' + id + '"></div>');
  const box = document.getElementById(id);
  box.dataset.kind = 'aq';
  F.vote(id, -1);
  if (box.innerHTML.indexOf('哪里不对') < 0) return '差评没追问原因';
  F.voteWhy(id, '说得不对');
  const list = F.list();
  if (!list.length) return '差评没落盘';
  if (list[list.length-1].why !== '说得不对') return '原因没记下';
  const st = F.stats();
  if (st.bad < 1) return '坏例统计不对';
  try { localStorage.removeItem('relic.fb.v1'); } catch(e) {}
  return true;
})()
""") and ("feedback.js" in rd("index.html")) and ("FB.foot" in rd("js/app.js")) and
      ('id="evalFb"' in rd("js/app.js")) and (".fb-foot" in rd("css/style.css")))
