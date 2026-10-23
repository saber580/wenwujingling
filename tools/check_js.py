# -*- coding: utf-8 -*-
"""用 quickjs 对 JS 做语法/数据自检"""
import os, json, quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()

ctx = quickjs.Context()

# 1) data.js 能否正常求值
try:
    ctx.eval(rd("js/data.js"))
    print("[data.js] 求值 OK")
    print("  精灵数:", ctx.eval("Object.keys(SPIRITS).length"))
    print("  主属性:", ctx.eval("Object.keys(ATTRIBUTES.primary).length"),
          "| 副属性:", ctx.eval("Object.keys(ATTRIBUTES.secondary).length"))
    print("  站点:", ctx.eval("STATIONS.map(s=>s.name+'('+s.spiritIds.length+')').join(' / ')"))
    print("  对战:", ctx.eval("BATTLE.spiritHp+'血/'+BATTLE.playerHp+'血 骰'+BATTLE.diceMin+'-'+BATTLE.diceMax"))
    print("  每只题目数:", ctx.eval("Object.keys(SPIRITS).map(k=>k+':'+SPIRITS[k].quiz.length).join(', ')"))
    print("  通用题库(含历史题):", ctx.eval("COMMON_QUIZ.length"), "题")
    # 校验每道题的正确答案下标合法、选项为4个(含通用题库)
    bad = ctx.eval("""
      (()=>{let b=[];
        const all = Object.keys(SPIRITS).map(k=>[k,SPIRITS[k].quiz]).concat([['通用',COMMON_QUIZ]]);
        for(const [k,qs] of all) for(const q of qs){
          if(q.options.length!==4) b.push(k+' 选项数!=4');
          if(!(q.answer>=0&&q.answer<4)) b.push(k+' answer越界');
          if(new Set(q.options).size!==4) b.push(k+' 选项重复');
        }
        return b.join('; ') || 'OK';
      })()
    """)
    print("  题目校验:", bad)
    # 校验属性引用都存在
    badref = ctx.eval("""
      (()=>{let b=[];
        for(const k in SPIRITS){const s=SPIRITS[k];
          if(!ATTRIBUTES.primary[s.primary]) b.push(k+' 主属性无效');
          if(!ATTRIBUTES.secondary[s.secondary]) b.push(k+' 副属性无效');
        }
        return b.join('; ') || 'OK';
      })()
    """)
    print("  属性引用:", badref)
    # 校验属性图标文件是否存在(属性图标/主属性/p_xxx.png、属性图标/副属性/s_xxx.png)
    import json
    miss = []
    for kind, expr in (("主属性", "Object.values(ATTRIBUTES.primary)"), ("副属性", "Object.values(ATTRIBUTES.secondary)")):
        icons = json.loads(ctx.eval("JSON.stringify(%s.map(a=>a.icon))" % expr))
        for ic in icons:
            if not os.path.exists(os.path.join(ROOT, "属性图标", kind, ic + ".png")):
                miss.append("%s/%s.png" % (kind, ic))
    print("  属性图标文件:", "; ".join(miss) if miss else "OK(全部命中)")
    # 每只精灵都必须有「出土/来历」:history 里提到 + knowledge 有对应问答(以后新增的也一样)
    lack = ctx.eval("""
      (()=>{let b=[];
        for(const k in SPIRITS){const s=SPIRITS[k];
          const h=s.history||"";
          const hasHist=/出土|发掘|发现|原址|来历/.test(h);
          const hasKb=(s.knowledge||[]).some(e=>(e.keys||[]).some(x=>/出土|挖掘|挖出|考古|来历/.test(x)));
          if(!hasHist) b.push(k+' history 缺「出土/来历」');
          if(!hasKb)   b.push(k+' knowledge 缺「出土/来历」问答');
          if((s.quiz||[]).length<5) b.push(k+' 题库不足 5 题');
          if((s.comic||[]).length<3) b.push(k+' 回忆不足 3 幕');
        }
        return b.join('; ') || 'OK(全部精灵都有)';
      })()
    """)
    print("  出土/来历齐全:", lack)
    # 自述题覆盖:每只精灵题库都要有「出土/来历」题 + 「尺寸/体量」题(战场上约一半题目考它自己)
    lack2 = ctx.eval("""
      (()=>{let b=[];
        const A=/出土|发掘|征集|来历|遗址|墓葬|朝代|年代|时期|距今|哪一年|哪年|几年|被盗|回归|移交|传世|旧藏|来到|入藏|捐赠|拨交|收购|发现|修复/;
        const B=/厘米|公分|毫米|米|克|公斤|吨|多高|多长|多大|多重|多宽|多厚|通高|总高|身高|口径|尺寸|重量|几层|几件|几盏/;
        for(const k in SPIRITS){const s=SPIRITS[k];
          const qs=(s.quiz||[]).map(x=>x.q).join('|');
          if(!A.test(qs)) b.push(k+' 缺「出土/来历」题');
          if(!B.test(qs)) b.push(k+' 缺「尺寸/体量」题');
        }
        return b.join('; ') || 'OK(每只都有两类自述题)';
      })()
    """)
    print("  自述题覆盖:", lack2)
    # 每个主属性都必须有专属「特性」(以后新增属性/精灵时也一样)
    notrait = ctx.eval("""
      (()=>{let b=[];
        for(const k in ATTRIBUTES.primary){ if(!TRAITS[k]||!TRAITS[k].name||!TRAITS[k].desc) b.push(k); }
        return b.join(', ') || 'OK(全部主属性都有特性)';
      })()
    """)
    print("  主属性特性:", notrait)
    # 每只精灵的出战特性必须能取到
    trabl = ctx.eval("""
      (()=>{let b=[];
        for(const k in SPIRITS){ if(!TRAITS[SPIRITS[k].primary]) b.push(k); }
        return b.join(', ') || 'OK(每只都能查到自己主属性的特性)';
      })()
    """)
    print("  精灵特性映射:", trabl)
except Exception as e:
    print("[data.js] 出错:", e)

# 2) app.js 语法检查(eval 到 ReferenceError 说明语法通过)
src = rd("js/app.js")
try:
    ctx.eval(src)
    print("[app.js] 居然完整执行了(不应发生)")
except Exception as e:
    msg = str(e)
    first = msg.splitlines()[0] if msg else ""
    if "SyntaxError" in msg or "unexpected" in msg.lower() or "Unexpected" in msg:
        print("[app.js] 语法错误:", msg[:300])
    else:
        print("[app.js] 语法 OK(运行到环境缺失处停止:", first[:80], ")")

# 2b) flyleaf.js 语法检查(包进函数体,只解析不执行)
try:
    ctx.eval("(function(){\n" + rd("js/flyleaf.js") + "\n})")
    print("[flyleaf.js] 语法 OK")
except Exception as e:
    print("[flyleaf.js] 语法错误:", str(e)[:300])

# 2c) 扉页接线:双扇牌阵 + 大按钮 + 进入后强制开场画卷
try:
    html = rd("index.html")
    ok_fl = ('id="flyleaf"' in html) and ('class="fl-enter"' in html) and ('flyleafEnter()' in html) \
        and ('js/flyleaf.js' in html) and ('body.flyleaf-on #intro{display:none' in rd("css/style.css"))
    print("[flyleaf.js] 扉页入口:", "OK(双扇牌阵 + 大按钮 + 强制开场画卷)" if ok_fl else "缺少扉页/大按钮/强制开场接线")
except Exception as e:
    print("[flyleaf.js] 扉页检查出错:", e)

# 3) 存档命名空间:index.html 必须引入 js/save-id.js(否则正式版/测试版进度会混在一起)
try:
    html = rd("index.html")
    sid_js = rd("js/save-id.js")
    ok = ("js/save-id.js" in html) and ("SAVE_ID" in sid_js)
    print("[save-id.js] 存档命名空间:", "OK(已引入,正式版/测试版进度相互独立)" if ok else "缺少文件或未在 index.html 引入(两版进度可能混用!)")
except Exception as e:
    print("[save-id.js] 存档命名空间:出错", e)

# 4) 动态山水背景:index.html 有背景层、样式引用成品图、成品图存在
try:
    html = rd("index.html")
    css = rd("css/style.css")
    ok = ('class="bg-art"' in html) and ("背景/青绿山水.jpg" in css) and ("bg-art-img" in css) and os.path.exists(os.path.join(ROOT, "背景", "青绿山水.jpg"))
    print("[bg-art] 动态山水背景:", "OK(背景层 + 样式 + 长卷留档齐全)" if ok else "缺少背景层/样式/留档长卷")
except Exception as e:
    print("[bg-art] 动态山水背景:出错", e)

# 4b) 五套国风背景方案(一·青绿山水 / 二·水墨烟雨 / 三·鎏金宫阙 / 四·天青青花 / 五·中国红):层 / 样式 / 挂件已撤 / 素材
try:
    html = rd("index.html")
    css = rd("css/style.css")
    ok_layers = all(t in html for t in ['class="bg-mtn"', 'class="bg-sun"', 'class="bg-birds"', 'class="bg-cloud c1"', 'class="bg-cloud c2"', 'class="bg-bloom"', 'class="bg-crack"'])
    ok_css = all(t in css for t in ['body[data-bg="a"]', 'body[data-bg="b"]', 'body[data-bg="c"]', 'body[data-bg="d"]', 'body[data-bg="e"]', "@keyframes bgCloud", "水墨山.svg", "青绿山.svg", "飞鸟.svg", ".bg-bloom", ".bg-sun", "@keyframes birdsCross", "@keyframes inkBreathe"])
    ok_gadget = ('class="bg-switch"' not in html) and ('data-bg="e"' in html) and ('data-bg="a"' not in html) and ('data-bg="d"' not in html) and ("initBgSwitch" not in rd("js/app.js"))
    ok_assets = all(os.path.exists(os.path.join(ROOT, "装饰", f)) for f in ["远山带.png", "祥云带.png", "冰裂底纹.png", "万字底纹.png", "飞鸟.svg"]) and all(os.path.exists(os.path.join(ROOT, "背景", f)) for f in ["水墨山.svg", "青绿山.svg"])
    ok = ok_layers and ok_css and ok_gadget and ok_assets
    print("[bg-art] 五套国风背景:", "OK(层/样式/素材齐全;五套均为纯绘制;试看挂件已撤,默认锁定 e · 中国红)" if ok else "缺(层:%s 样式:%s 挂件:%s 素材:%s)" % (ok_layers, ok_css, ok_gadget, ok_assets))
except Exception as e:
    print("[bg-art] 五套国风背景:出错", e)

# 4c) 尾页(深色版式):左品牌 + 标语「让每一个中国文物,都鲜活起来」/ 右三栏链接 / 底版权行
try:
    html = rd("index.html")
    ok_foot = all(t in html for t in ['class="foot-in"', 'class="foot-cols"', '让每一个中国文物,都鲜活起来', 'RELIC SOUL', 'class="foot-bar"', '河北 · 中国'])
    print("[foot] 红金尾页:", "OK(品牌+标语 / 功能·探索·关于三栏 / 版权行齐全)" if ok_foot else "缺")
except Exception as e:
    print("[foot] 深色尾页:出错", e)

# 5) AI 打卡海报:图鉴编号 / 冷知识(30–60 字)/ 打卡地点表 / 二维码库 / 例图与入口
try:
    bad = ctx.eval("""
    (()=>{ let b=[]; const nos={};
      if (typeof POSTER_META === 'undefined') return '缺少 POSTER_META';
      for (const k of Object.keys(SPIRITS)) { const m=POSTER_META[k];
        if(!m){ b.push(k+' 缺海报信息'); continue; }
        if(!/^HB-\\d{3}$/.test(m.no||'')) b.push(k+' 编号格式');
        if(nos[m.no]) b.push(k+' 编号重复 '+m.no); nos[m.no]=1;
        const L=(m.trivia||'').length; if(L<30||L>60) b.push(k+' 冷知识 '+L+' 字');
      }
      if (Object.keys(POSTER_HALLS).length !== 12) b.push('打卡地点表不是 12 站');
      return b.join('; ') || 'OK(' + Object.keys(POSTER_META).length + ' 只编号唯一、冷知识 30-60 字)';
    })()
    """)
    print("  海报数据:", bad)
    ctx.eval(rd("js/qrcode.js"))
    qr = ctx.eval("""
    (()=>{ try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'] || qrcode.stringToBytes;
      const q = qrcode(0, 'M');
      q.addData('http://127.0.0.1:8899/文物精灵/index.html#/codex');
      q.make();
      return q.getModuleCount();
    } catch (e) { return 'ERR ' + e; } })()
    """)
    print("  二维码库:", ("OK(示例链接生成 %d×%d 模块)" % (qr, qr)) if isinstance(qr, int) else qr)
    miss2 = [p for p in ["打卡海报/例图_写实.jpg", "打卡海报/例图_Q版.jpg", "js/qrcode.js"]
             if not os.path.exists(os.path.join(ROOT, p.replace("/", os.sep)))]
    html2 = rd("index.html")
    ok_nav = ("#/poster" in html2) and ("js/qrcode.js" in html2)
    print("  海报素材/入口:", ("缺 " + ", ".join(miss2) if miss2 else "素材齐全") + ";" +
          ("导航已接入(index.html:#/poster + qrcode.js)" if ok_nav else "警告:index.html 缺 #/poster 或 qrcode.js"))
except Exception as e:
    print("[poster] AI 打卡海报:出错", e)

# 5b) AI 赋彩:36 幅图稿文件齐全 + 裁剪框合法 + 页面接入
try:
    meta = json.loads(ctx.eval("JSON.stringify(DYE_IMAGES)"))
    bad = []
    if len(meta) != 36:
        bad.append("图稿应为 36 幅,实际 %d" % len(meta))
    miss = [m["f"] for m in meta if not os.path.exists(os.path.join(ROOT, "AI 赋彩", m["f"]))]
    if miss:
        bad.append("缺图 %d 张(如 %s)" % (len(miss), miss[0]))
    badc = [m["f"] for m in meta
            if not (len(m.get("c") or []) == 4 and 0 <= m["c"][0] < m["c"][2] <= m["w"] and 0 <= m["c"][1] < m["c"][3] <= m["h"])]
    if badc:
        bad.append("裁剪框异常 " + badc[0])
    miss_e = [m["f"] for m in meta if not os.path.isfile(os.path.join(ROOT, "AI 赋彩", "_data", m["f"] + ".js"))]
    ok_embed = ("__DYE_DATA" in rd("js/app.js")) and ("AI 赋彩/_data/" in rd("js/app.js"))
    ok_navdye = ("#/dye" in rd("index.html")) and ("AI 赋彩/" in rd("js/app.js"))
    print("[dye] AI 赋彩:", ("OK(%d 幅图稿齐全、裁剪框合法)" % len(meta) if not bad else "; ".join(bad))
          + ";" + ("导航已接入(index.html:#/dye)" if ok_navdye else "警告:缺 #/dye 导航")
          + ";" + ("内嵌数据齐全(双击打开可上色)" if ok_embed and not miss_e else "警告:内嵌数据缺失,跑 python tools\\gen_dye_embed.py 重建"))
except Exception as e:
    print("[dye] AI 赋彩:出错", e)

# 5c) AI 文物识别:导航与页面接入 + 云端小桥(复原引擎在本机浏览器,云桥在本机 tools 里;密钥文件可选)
try:
    ok_navid = (("#/ident" in rd("index.html")) and ('data-nav="ident"' in rd("index.html"))
                and ("viewIdent" in rd("js/app.js")) and ("ident-slider" in rd("js/app.js"))
                and ("IDENT_CLOUD_API" in rd("js/app.js")) and ("/api/identify" in rd("js/app.js")))
    bp = os.path.join(ROOT, "tools", "ident_cloud.py")
    ok_bridge = os.path.exists(bp) and all(t in open(bp, encoding="utf-8").read() for t in ["ark.cn-beijing.volces.com", "/api/ping", "ident_key.txt"])
    print("[ident] AI 文物识别:", ("OK(导航已接入 index.html:#/ident,页面 / 滑块 / 云端小桥都在)" if ok_navid and ok_bridge else "警告:缺 #/ident 导航、viewIdent/滑块或云端小桥"))
except Exception as e:
    print("[ident] AI 文物识别:出错", e)
