# -*- coding: utf-8 -*-
"""无浏览器环境下,用 quickjs + 假 DOM 跑通「对战 → 捕捉」全流程"""
import os, quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()

PRELUDE = r"""
// ---- 假 DOM/环境 ----
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
Math.random = function(){ return 0.999; };  // 使掷骰恒为 6
"""

ctx = quickjs.Context()
ctx.eval(PRELUDE)
ctx.eval(rd("js/data.js"))
ctx.eval(rd("js/app.js"))

def ev(x): return ctx.eval(x)

SPIRIT_IDS = [k for k in __import__("json").loads(ev("JSON.stringify(Object.keys(SPIRITS))"))]

print("首页渲染长度:", ev("(render(), document.querySelector('#app')) && 0") or ev("viewHome().length"))
print("首页包含标题:", ev("viewHome().includes('文物精灵')"))
print("站点页包含铁狮子:", ev("viewStation('cangzhou').includes('沧州铁狮子')"))
print("保定站包含长信宫灯:", ev("viewStation('baoding').includes('长信宫灯') && viewStation('baoding').includes('满城汉墓')"))
print("分站立绘路径:", ev("viewStation('baoding').includes('精灵/保定/changxin.png') && viewStation('cangzhou').includes('精灵/tielion.png') && viewStation('hengshui').includes('精灵/衡水/lianhuazun.png')"))
print("精灵页包含属性:", ev("viewSpirit('tielion').includes('青铜器') && viewSpirit('tielion').includes('宗教文物')"))
print("首页属性图鉴:", ev("viewHome().includes('属性图标/主属性/p_bronze.png') && viewHome().includes('属性图标/副属性/s_currency.png')"))
print("首页卡片带图标:", ev("viewHome().includes('属性图标/主属性/p_jade.png')"))
# ---- 中国风主页(大改造) ----
print("首页 12 字大标题:", ev("viewHome().includes('讲好中国故事') && viewHome().includes('让文物活起来')"))
print("首页四大分类卡:", ev("""
(()=>{ const h = viewHome();
  return (h.match(/cat-card/g)||[]).length >= 4
      && ['我的精灵','文物图鉴','河北地图','博物馆与文创'].every(t=>h.includes(t)); })()
"""))
print("首页中国风装饰齐全:", ev("['夔龙角','青铜鼎','印章','红日','远山带'].every(t=>viewHome().includes('装饰/'+t+'.png'))"))
print("首页地图+点位:", ev("""
(()=>{ const h = viewHome();
  return h.includes('装饰/河北地图.png') && (h.match(/map-mark/g)||[]).length === 12
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
print("顶栏九栏目(AI打卡海报/AI文物修复/AI精灵茶话会/AI赋彩/AI文物识别 一级入口):", all(t in rd("index.html") for t in ["文物精灵", "我的精灵", "地图", "图鉴", "其他", "AI打卡海报", "AI文物修复", "AI精灵茶话会", "AI赋彩", "AI文物识别"]) and rd("index.html").count("nav-drop") >= 3 and ('data-nav="poster"' in rd("index.html")) and ('href="#/poster"' in rd("index.html")) and ('data-nav="restore"' in rd("index.html")) and ('href="#/restore"' in rd("index.html")) and ('data-nav="tea"' in rd("index.html")) and ('href="#/tea"' in rd("index.html")) and ('data-nav="dye"' in rd("index.html")) and ('href="#/dye"' in rd("index.html")) and ('data-nav="ident"' in rd("index.html")) and ('href="#/ident"' in rd("index.html")))
print("导航含博物馆/文创(收进其他下拉):", "博物馆" in rd("index.html") and "文创" in rd("index.html"))
# ---- AI 文物修复(16/32/64 三档 · 参考图/拼图块导出 · AI 元素) ----
print("AI文物修复(三档/导出/AI要素):", ev("""
(()=>{ const h = viewRestore();
  return ['16 块','32 块','64 块','完整参考图','下载拼图块','AI 复原检测','AI 一键修复','rs-board','rs-cv-sheet'].every(t=>h.includes(t))
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
""") and ("function navGo" in rd("js/app.js")) and ("toggleDD" in rd("js/app.js")))
print("navGo 冒烟:", ev("navGo('home-mine') === false"))
print("CSS 纹样边框+万字底纹:", ("border-image" in rd("css/style.css")) and ("装饰/万字底纹.png" in rd("css/style.css")) and ("装饰/回纹框.png" in rd("css/style.css")))
# ---- 版式焕新:横版英雄区(左文案右印章精灵) + 区块头 + 三列站点 ----
print("首页版式焕新(英雄区/区块头/三列站点):", ev("""
(()=>{ const h = viewHome();
  return h.includes('装饰/红日.png') && h.includes('装饰/远山带.png') && !h.includes('home-scene')
      && (h.match(/sec-head/g)||[]).length >= 4 && h.includes('hero-facts') && h.includes('hero-orbit')
      && h.includes('station-grid') && (h.match(/orbit-chip/g)||[]).length >= 3; })()
"""))
print("全站动态山水背景(bg-art/青绿山水):", (('class="bg-art"' in rd("index.html")) and ("背景/青绿山水.jpg" in rd("css/style.css")) and ("bg-art-img" in rd("css/style.css")) and ("function initBgArt" in rd("js/app.js")) and os.path.exists(os.path.join(ROOT, "背景", "青绿山水.jpg"))))
print("五套国风背景(五方案样式·挂件已撤,默认 e·中国红):", (('class="bg-switch"' not in rd("index.html")) and ('data-bg="e"' in rd("index.html")) and ("initBgSwitch" not in rd("js/app.js")) and all(t in rd("css/style.css") for t in ['body[data-bg="a"]', 'body[data-bg="b"]', 'body[data-bg="c"]', 'body[data-bg="d"]', 'body[data-bg="e"]', "bgCloud", "青绿山.svg", "飞鸟.svg", "bg-sun"])))
print("CSS 焕新(宣纸纹+山水背景+渐显):", ("装饰/宣纸纹.png" in rd("css/style.css")) and ("bg-art-img" in rd("css/style.css")) and ("hero-mtn" in rd("css/style.css")) and (".rv{" in rd("css/style.css")))
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
print("进场动效脚本:", ("function initHomeFx" in rd("js/app.js")) and ("IntersectionObserver" in rd("js/app.js")))
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
  return h.includes('精灵/透明/qinghuaci.png') && h.includes('精灵/透明/tielion.png')
      && h.includes('unit foe') && h.includes('unit mine') && h.includes('flip');
})()
"""))
print("CSS 故宫背景:", "背景/故宫.jpg" in open(os.path.join(ROOT, 'css', 'style.css'), encoding='utf-8').read())
print("透明立绘齐全(", ev("Object.keys(SPIRITS).length"), "/", ev("Object.keys(SPIRITS).length"), "):",
      all(os.path.exists(os.path.join(ROOT, '精灵', '透明', k + '.png')) for k in SPIRIT_IDS))

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
  return h.includes('AI 打卡海报') && h.includes('打卡海报/例图_写实.jpg') && h.includes('打卡海报/例图_Q版.jpg')
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
print("小答舞台结构(三桩/狮子/头像):", all(t in rd("index.html") for t in ['aq-pole p1', 'aq-pole p2', 'aq-pole p3', 'aq-hop', 'aq-jump', 'aq-face', '装饰/红舞狮.png', '装饰/红舞狮头.png', 'aq-badge']))
print("小答计分胶囊+关闭双保险:", ('id="aqScore"' in rd("index.html")) and ('aq-panel[hidden]{display:none}' in rd("css/style.css")) and ('p.style.display = "none"' in rd("js/app.js")))
print("旧考官已全撤(QT 无残留):", ('initQt' not in rd("js/app.js")) and ('qt-ball' not in rd("index.html")) and ('.qt-' not in rd("css/style.css")) and ('qt-panel' not in rd("css/style.css")))
print("小答素材文件:", all(os.path.exists(os.path.join(ROOT, "装饰", f)) for f in ["红舞狮.png", "红舞狮正面.png", "红舞狮头.png"]))

# ---- 开场画卷(全屏卷轴遮罩:木轴拉开 → 题字浮现 → 历代入列 → 淡出进主页;可跳过) ----
print("画卷·结构(遮罩/画轴/题字/时间轴/跳过):", all(t in rd("index.html") for t in ['id="intro"', 'intro-clip', 'intro-roll l', 'intro-roll r', 'id="introDyn"', 'intro-skip', '跳过画卷', '文物有话说，千古述流光', '沉睡千年的古物一朝苏醒', '随君寻访博物，邂逅文物精灵，共览华夏文脉']))
print("画卷·主页默认隐藏(intro-on 锁定;完播/跳过解除):", ('<body data-bg="e" class="intro-on">' in rd("index.html")) and ('body.intro-on > :not(#intro){display:none}' in rd("css/style.css")) and ('body.intro-on{overflow:hidden}' in rd("css/style.css")))
print("画卷·样式与动画(卷面/画轴/浮现/入列/跳过):", all(t in rd("css/style.css") for t in ['.intro{', '.intro.fade{', '@keyframes introClip', '@keyframes introRollL', '@keyframes introRollR', '@keyframes introFade', '@keyframes introNode', '宣纸纹.png', '如意祥云.png', '.intro-skip{']))
print("画卷·脚本(初始化/跳过/收场):", ev("typeof initIntro === 'function' && typeof introSkip === 'function' && typeof introFinish === 'function' && INTRO_DYNASTIES.length === 16"))
print("画卷·朝代顺序(夏→清 16 节点):", ev("INTRO_DYNASTIES.map(d=>d[0]).join('、')") == '夏、商、西周、东周、秦、汉、三国、西晋、南北朝、隋、唐、五代、宋、元、明、清')
print("画卷·假环境冒烟(启动即播放并安全收场):", ev("INTRO.done === true && INTRO.audio === null") and ('initIntro();' in rd("js/app.js")))
_intro_names = __import__("json").loads(ev("JSON.stringify(INTRO_DYNASTIES.map(d=>d[1]))"))
_intro_miss = [n for n in _intro_names if not os.path.exists(os.path.join(ROOT, "精灵", "朝代", "缩略", n))]
print("画卷·16 朝代缩略图齐:", (not _intro_miss) or ("缺:" + "、".join(_intro_miss)))
print("画卷·旁白配音(AI 神经语音 · 本地 MP3):", os.path.exists(os.path.join(ROOT, "音频", "开场旁白.mp3")) and os.path.getsize(os.path.join(ROOT, "音频", "开场旁白.mp3")) > 20000 and ('音频/开场旁白.mp3' in rd("js/app.js")))
print("画卷·以旁白读完为结束(ended + 时长/静默兜底):", ('addEventListener("ended"' in rd("js/app.js")) and ('introReadDone' in rd("js/app.js")) and ('introArmEndByDuration' in rd("js/app.js")) and ('introArmEndSilent' in rd("js/app.js")) and ('5300' not in rd("js/app.js")))
print("画卷·朗读跟随(逐句点亮):", ('.intro-reading .intro-line.lit' in rd("css/style.css")) and ('class="intro-line"' in rd("index.html")) and ('function introSync' in rd("js/app.js")))
print("画卷·旁白被拦可一键开启(introVoiceOn):", ('id="introVoice"' in rd("index.html")) and ('function introVoiceOn' in rd("js/app.js")) and ('.intro-voice[hidden]{display:none}' in rd("css/style.css")))
print("画卷·开卷国风配乐(本地纯音乐 · 读完淡出):", ('音频/开场音乐.mp3' in rd("js/app.js")) and os.path.exists(os.path.join(ROOT, "音频", "开场音乐.mp3")) and os.path.getsize(os.path.join(ROOT, "音频", "开场音乐.mp3")) > 300000 and ('function introMusicFade' in rd("js/app.js")) and ('function introMusicStop' in rd("js/app.js")))
print("画卷·历史长河(蜿蜒河道 · 文物漂浮立体):", ('function introBuildRiver' in rd("js/app.js")) and ('@keyframes introFloat' in rd("css/style.css")) and ('@keyframes introFlow' in rd("css/style.css")) and ('.intro-river' in rd("css/style.css")) and ('class="intro-flow"' in rd("js/app.js")))
print("画卷·山水增色(三层远山 · 云雾淡日 · 波纹飞鸟 · 河上小舟):", ('function introRidge' in rd("js/app.js")) and ('class="mtn m3"' in rd("js/app.js")) and ('class="intro-ripple"' in rd("js/app.js")) and ('class="intro-boat' in rd("js/app.js")) and ('.intro-river .mtn.m1' in rd("css/style.css")) and ('.intro-boat' in rd("css/style.css")) and ('@keyframes introBoatGlide' in rd("css/style.css")))
print("主页背景音乐(顶栏右上角按钮 · 五首切换/关闭 · 本地):", all(t in rd("index.html") for t in ['id="bgmBtn"', 'id="bgmPanel"', 'bgmPick(4)', '关闭音乐']) and all(t in rd("js/app.js") for t in ['const BGM_TRACKS', 'function bgmToggle', 'function bgmPick', 'function bgmOff', 'function bgmBoot']) and all(t in rd("css/style.css") for t in ['.bgm-btn', '.bgm-panel', '.bgm-row']) and all(os.path.exists(os.path.join(ROOT, "音频", "背景音乐%d %s.mp3" % (i + 1, n))) for i, n in enumerate(["玉月巡游", "王朝终章", "华夏之美", "琴语晨思", "睡莲"])))
print("图鉴·燕赵名片(只展不捉 · 不计进度):", ('const LEGENDS' in rd("js/data.js")) and ('燕赵名片' in rd("js/app.js")) and ('function openLegend' in rd("js/app.js")) and ('.codex-card.legend' in rd("css/style.css")) and os.path.exists(os.path.join(ROOT, "精灵", "河北红舞狮.png")) and os.path.exists(os.path.join(ROOT, "精灵", "河北神兽错银铜双翼神兽.png")))

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
""") and ("茶话会" in rd("js/data.js")) and ("function teaInit" in rd("js/app.js")) and (".tea-opts" in rd("css/style.css")) and ("teaChoose" in rd("js/app.js")))
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
""") and all(t in rd("js/app.js") for t in ["teaCloudReady", "teaCloudAct", "teaCloudMessages", "teaCloudParse", "teaCloudDirect", "teaDirectPost", "teaActLocal", "teaAdvance", "teaChipState", "teaCloudKeyPaste", "teaInitView", "TEA_CLOUD_SYS", 'id="tea-cloud-chip"']) and rd("js/app.js").count("teaAdvance(st, phase, i)") >= 3 and all(t in rd("tools/ident_cloud.py") for t in ["/api/chat", "def call_chat", "def _chat_once", "def _chat_post", '"type": "disabled"', "/api/imagine", "def imagine_cloud", "ZHIPU_IMG_MODEL", "/api/setkey", "RUNTIME"]) and (".tea-cloudchip" in rd("css/style.css")))

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
""") and ('data-nav="dye"' in rd("index.html")) and ('href="#/dye"' in rd("index.html")) and ("DYE_IMAGES" in rd("js/data.js")) and ("__DYE_DATA" in rd("js/app.js")) and all(t in rd("css/style.css") for t in [".dye-stage", ".dye-thumb", "#dye-cv"]) and os.path.isdir(os.path.join(ROOT, "AI 赋彩")) and os.path.isdir(os.path.join(ROOT, "AI 赋彩", "_data")))

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
""") and ('data-nav="ident"' in rd("index.html")) and ('href="#/ident"' in rd("index.html")) and all(t in rd("css/style.css") for t in [".ident-slider", ".ident-grid", ".im-item", ".ident-verdict", ".ident-lore", ".icloud-card"]) and os.path.exists(os.path.join(ROOT, "tools", "ident_cloud.py")) and all(t in rd("tools/ident_cloud.py") for t in ["ark.cn-beijing.volces.com", "open.bigmodel.cn", "/api/ping", "ident_key.txt"]))

# ---- 接入 AI 大模型(设置面板:服务商 / Base URL / 钥匙 / 模型 ID) ----
print("接入 AI 大模型面板(导航入口/函数/默认值/样式):", ('🔑 接入 AI 大模型' in rd("index.html")) and all(t in rd("js/app.js") for t in ["AI_CFG_PROVIDERS", "function aiCfgOpen", "function aiCfgApply", "function aiCfgTest", "/api/setkey"]) and all(t in rd("css/style.css") for t in [".aicfg-form", ".aicfg-row", ".aicfg-state"]) and ev("aiCfgDefaults().provider==='zhipu' && aiCfgDefaults().base.indexOf('open.bigmodel.cn')>=0 && aiCfgDefaults().model==='glm-4-flash' && aiCfgDefaults().account==='2502887269@qq.com' && aiCfgGet().key===''"))

# ---- 登录 / 注册(顶栏入口 · 小桥账号 · 演示账号只存哈希) ----
print("登录 / 注册(顶栏入口/双模登录/加盐哈希/小桥接口):", ('id="authBtn"' in rd("index.html")) and all(t in rd("js/app.js") for t in ["function authOpen", "function authSubmit", "function authLogout", "AUTH_DEMO", "function authHash", "/api/login", "/api/reg"]) and all(t in rd("css/style.css") for t in [".auth-btn", ".auth-tabs"]) and all(t in rd("tools/ident_cloud.py") for t in ["/api/login", "/api/reg", "pbkdf2_hmac", "DEMO_EMAIL", "ACCOUNTS_FILE"]) and ev("authHash('qWeR7xY9','x') === authHash('qWeR7xY9','x') && authHash('qWeR7xY9','x') !== authHash('qWeR7xY8','x') && authWho() === null && typeof authOpen === 'function'"))

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
""") and all(t in rd("js/app.js") for t in ["identWakeFind", "identWakeGo", "identWakeHTML", "identWakeCraft", "identNormName"]) and (".iwake" in rd("css/style.css")))

# ---- 打卡拍照 · AI 幻化通道(小桥智谱免费链 / 直连智谱 CogView 或方舟 Seedream / 画风参考 / 本机兜底) ----
_aj = rd("js/app.js")
print("拍照·AI 幻化通道(双后端/画风参考/体量控制/先云后本机):", ev("""
(()=>{
  if (typeof aiImagine !== 'function' || typeof dataUrlShrink !== 'function' || typeof localStylize !== 'function') return '缺函数';
  return aiImagineOff === false && aiStyleRefP === null;
})()
""") and all(t in _aj for t in ["cogview-3-flash", "glm-4.6v-flash", "IDENT_ZHIPU_IMG", "identKeyKind", "zhipuTrimWatermark", "aiImagineBridge", "aiImagineZhipu", "aiImagineArk", "/api/imagine", "doubao-seedream-5-0-flash-260915", "IDENT_IMG_PROMPT", "精灵/tielion.png", "response_format", "b64_json", "dataUrlShrink(dataURL, 1024, .85)", "dataUrlShrink(raw, 1024, .92)", "withTimeout(aiImagine(dataURL, desc), 45000)"]) and (_aj.index("aiImagine(dataURL, desc)") < _aj.index("localStylize(dataURL)")))
