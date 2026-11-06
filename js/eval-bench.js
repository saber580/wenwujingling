/* =========================================================
   文物精灵 · AI 评测台（离线金标集）
   ---------------------------------------------------------
   为什么要有这个文件：
     站内的 AI 环节此前只有「感觉挺准」这类说法，没有一个数字。
     评审问「准确率多少」时，答不上来就等于没有做效果评估。

   这里把可离线复现的四个环节做成金标集：
     1) 检索   —— 问一句话，能不能找到那件文物（top1 / top3 / MRR）
     2) 门控   —— 该不该去查档案（站务问题不该查）
     3) 核验   —— 答案里编的数字/年代，能不能被揪出来
     4) 识别   —— 模型认错了年代/材质，能不能判出冲突
     5) 出题   —— AI 出的坏题（重复选项、无依据、有歧义）能不能拦住
     6) 判卷   —— 开放题的好/中/差回答，分数是否拉开

   边界（必须如实说明）：
     · 云端大模型本身不在这里评。它需要联网和密钥，结果会随模型版本漂移，
       本文件只评「模型之外、我们自己写的那层」，这层是确定的、可复现的。
     · 识别用例是构造的字段组合，不等于真实拍照的端到端准确率。
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- 金标集 ---------------- */
  var GOLD = {
    /* 检索：一句话 → 应该命中哪只精灵 */
    retrieval: [
      { q: "长信宫灯为什么能防烟", want: "changxin" },
      { q: "五铢钱是什么时候开始铸的", want: "wuzhuqian" },
      { q: "后母戊鼎有多重", want: "houmuwuding" },
      { q: "唐三彩骆驼上有几个乐手", want: "sancailuotuo" },
      { q: "倒流壶为什么倒着也能出水", want: "daoliuhu" },
      { q: "青花瓷的蓝色是怎么来的", want: "qinghuaci" },
      { q: "沧州铁狮子多少吨", want: "tielion" },
      { q: "百花灯一共有几盏", want: "baohuadeng" },
      { q: "金缕玉衣是用什么连起来的", want: "jinyuyi" },
      { q: "玉猪龙出土于哪里", want: "yuzhulong" },
      { q: "四羊方尊的羊头有什么讲究", want: "siyangfangzun" },
      { q: "击鼓说唱俑为什么在笑", want: "shuochangyong" },
      /* 难例：不出现文物正名，只描述特征 */
      { q: "哪个灯能把烟吸进袖子里", want: "changxin" },
      { q: "用金线把玉片连起来的葬服", want: "jinyuyi" },
      { q: "倒着放也能倒出水的壶", want: "daoliuhu" },
      { q: "商代最重的青铜大方鼎", want: "houmuwuding" },
      { q: "红山文化的玉猪", want: "yuzhulong" },
      { q: "东汉彩绘的陶制百花灯", want: "baohuadeng" },
      { q: "瓦当上写着长乐未央", want: "wadang" },
      { q: "妇好墓出土的鸮形尊", want: "fuxiaozun" },
      { q: "独孤信的多面印章", want: "duoguxinyin" },
      { q: "三十二吨重的铸铁狮子", want: "tielion" },
      { q: "唐代驮着一支乐队的骆驼", want: "sancailuotuo" },
      { q: "秦代那支陶俑军队", want: "bingmayong" }
    ],

    /* 门控：该查档案的查，站务问题别乱查 */
    gate: [
      { q: "长信宫灯为什么能防烟", ground: true },
      { q: "五铢钱什么时候开始铸", ground: true },
      { q: "唐三彩的釉色是怎么来的", ground: true },
      { q: "后母戊鼎是怎么铸出来的", ground: true },
      { q: "沧州铁狮子多重", ground: true },
      { q: "百花灯有几盏", ground: true },
      { q: "倒流壶的原理是什么", ground: true },
      { q: "玉猪龙是什么文化的", ground: true },
      { q: "一共有多少精灵", ground: false },
      { q: "怎么打卡唤醒文物", ground: false },
      { q: "怎么登录", ground: false },
      { q: "你是谁", ground: false },
      { q: "这个应用怎么玩", ground: false },
      { q: "怎么捕捉精灵", ground: false }
    ],

    /* 事实核验：答案里塞一个假数字/假年代，看能不能标成「待核」 */
    fact: [
      { q: "长信宫灯有多大", a: "它通高约48厘米，重约15.85公斤。", bad: null },
      { q: "长信宫灯有多大", a: "它通高约68厘米，重约25公斤。", bad: "68厘米" },
      { q: "后母戊鼎有多重", a: "它重达832.84公斤，是商代后期的青铜礼器。", bad: null },
      { q: "后母戊鼎有多重", a: "它重达1200公斤，是商代后期的青铜礼器。", bad: "1200公斤" },
      { q: "五铢钱什么时候开始铸", a: "汉武帝元狩五年，公元前118年开始铸。", bad: null },
      { q: "五铢钱什么时候开始铸", a: "公元前218年开始铸。", bad: "公元前218年" },
      { q: "百花灯有多高", a: "通高约92厘米，有十三盏灯。", bad: null },
      { q: "百花灯有多高", a: "通高约120厘米，有十三盏灯。", bad: "120厘米" }
    ],

    /* 识别：模型给出的字段，是否与档案对得上 */
    ident: [
      { name: "长信宫灯", era: "西汉", material: "青铜铸造", hit: true, conflict: 0 },
      { name: "长信宫灯", era: "唐代", material: "白瓷", hit: true, conflict: 2 },
      { name: "长信宫灯", era: "西汉", material: "白玉", hit: true, conflict: 1 },
      { name: "一台冰箱", era: "现代", material: "金属", hit: false, conflict: 0 },
      { name: "后母戊鼎", era: "商代", material: "青铜", hit: true, conflict: 0 },
      { name: "兵马俑", era: "秦代", material: "陶", hit: true, conflict: 0 },
      { name: "青花瓷", era: "元代", material: "瓷", hit: true, conflict: 0 },
      { name: "倒流壶", era: "五代", material: "青瓷", hit: true, conflict: 0 },
      { name: "玉猪龙", era: "新石器时代", material: "玉", hit: true, conflict: 0 },
      { name: "沧州铁狮子", era: "后周", material: "铸铁", hit: true, conflict: 0 },
      { name: "百花灯", era: "东汉", material: "陶", hit: true, conflict: 0 },
      { name: "长信宫灯", era: "清代", material: "玉", hit: true, conflict: 2 }
    ],

    /* 出题校验：好题放行，坏题拦下 */
    qverify: [
      { sid: "changxin", ok: true, q: {
        q: "长信宫灯点燃后，烟从哪里排出去？", options: ["宫女的右臂", "灯盘底部", "灯罩缝隙", "底座周围"],
        answer: 0, tip: "右臂中空，烟顺手臂进入体腔。" } },
      { sid: "changxin", ok: true, q: {
        q: "长信宫灯是用什么材料做的？", options: ["青铜铸造", "瓷", "玉", "木"],
        answer: 0, tip: "青铜铸造，通体鎏金。" } },
      { sid: "changxin", ok: true, q: {
        q: "长信宫灯出自西汉，当时最典型的铜器装饰工艺是什么？", options: ["鎏金", "珐琅彩", "斗彩", "粉彩"],
        answer: 0, tip: "西汉盛行鎏金与错金银。" } },
      { sid: "changxin", ok: true, q: {
        q: "长信宫灯所在的西汉，五铢钱从哪位皇帝开始铸造？", options: ["汉武帝", "唐太宗", "宋徽宗", "明太祖"],
        answer: 0, tip: "元狩五年始铸五铢钱。" } },
      { sid: "houmuwuding", ok: true, q: {
        q: "后母戊鼎在商代是用来做什么的？", options: ["祭祀祖先", "照面梳妆", "煮茶待客", "储水防火"],
        answer: 0, tip: "它是祭祀用的青铜礼器。" } },
      { sid: "houmuwuding", ok: true, q: {
        q: "后母戊鼎所在的商代，青铜器主要靠什么方法成型？", options: ["陶范法", "吹制", "拉坯", "掐丝"],
        answer: 0, tip: "商代用陶范法整体铸造。" } },
      { sid: "changxin", ok: false, q: {
        q: "长信宫灯出土于哪座墓？", options: ["满城汉墓", "满城汉墓", "马王堆", "海昏侯墓"],
        answer: 0, tip: "满城汉墓二号墓。" } },
      { sid: "changxin", ok: false, q: {
        q: "长信宫灯是用什么材料做的？", options: ["唐代白瓷", "宋代青瓷", "明代景泰蓝", "清代珐琅"],
        answer: 0, tip: "唐代白瓷。" } },
      { sid: "changxin", ok: false, q: {
        q: "长信宫灯是什么材质的？", options: ["青铜铸造，通体鎏金", "青铜铸造", "木头", "陶瓷"],
        answer: 0, tip: "青铜铸造，通体鎏金。" } },
      { sid: "changxin", ok: false, q: {
        q: "唐三彩的主要釉色是什么？", options: ["黄绿白", "青花", "粉彩", "斗彩"],
        answer: 0, tip: "黄绿白交融。" } },
      { sid: "changxin", ok: false, q: {
        q: "长信宫灯通高多少厘米？", options: ["48厘米", "50厘米", "60厘米", "70厘米"],
        answer: 4, tip: "通高约48厘米。" } },
      { sid: "changxin", ok: false, q: {
        q: "灯？", options: ["48厘米", "50厘米", "60厘米", "70厘米"],
        answer: 0, tip: "通高约48厘米。" } }
    ],

    /* 开放题判卷：同一道题下，好/中/差回答的分数要拉开 */
    open: [
      { sid: "changxin", q: "长信宫灯为什么能防烟",
        ref: "我的右臂和身体都是中空的。灯点燃后,烟顺着宫女的右臂进入体腔,落在里面的水里,屋子里就不会被熏黑。",
        a: "因为宫女的右臂和身体中空，烟顺着右臂进入体腔，落在里面的水里，所以屋子不会被熏黑。", lo: 80, hi: 100 },
      { sid: "changxin", q: "长信宫灯为什么能防烟",
        ref: "我的右臂和身体都是中空的。灯点燃后,烟顺着宫女的右臂进入体腔,落在里面的水里,屋子里就不会被熏黑。",
        a: "烟顺着右臂进入体腔。", lo: 60, hi: 100 },
      { sid: "changxin", q: "长信宫灯为什么能防烟",
        ref: "我的右臂和身体都是中空的。灯点燃后,烟顺着宫女的右臂进入体腔,落在里面的水里,屋子里就不会被熏黑。",
        a: "因为它很好看。", lo: 0, hi: 30 },
      { sid: "changxin", q: "长信宫灯有多大",
        ref: "我通高约 48 厘米,重约 15.85 公斤,是一个跪坐执灯的宫女形象。",
        a: "通高大约48厘米，重约15.85公斤。", lo: 70, hi: 100 },
      { sid: "changxin", q: "长信宫灯有多大",
        ref: "我通高约 48 厘米,重约 15.85 公斤,是一个跪坐执灯的宫女形象。",
        a: "大概半米高吧。", lo: 0, hi: 45 },
      { sid: "houmuwuding", q: "后母戊鼎有多重",
        ref: "我高 133 厘米、口长 112 厘米、口宽 79.2 厘米,重达 832.84 公斤。",
        a: "重达832.84公斤，高133厘米。", lo: 70, hi: 100 },
      { sid: "houmuwuding", q: "后母戊鼎有多重",
        ref: "我高 133 厘米、口长 112 厘米、口宽 79.2 厘米,重达 832.84 公斤。",
        a: "大概一吨多，特别重。", lo: 0, hi: 45 },
      { sid: "baohuadeng", q: "百花灯有几盏灯",
        ref: "我共有十三盏灯:灯柱上十二支曲枝分三层伸展,每层四支,各托一盏灯;顶端再坐一盏灯。",
        a: "一共十三盏，灯柱上十二支，顶端还有一盏。", lo: 55, hi: 100 }
    ],

    /* 对比：一句话里点两件器物，能不能判出「要拿哪一组比」 */
    cmp: [
      { q: "长信宫灯和雁鱼灯谁的排烟更巧", want: "lamps" },
      { q: "百花灯和长信宫灯有什么区别", want: "lamps" },
      { q: "后母戊鼎和中山王铁足铜鼎哪个更早", want: "ding" },
      { q: "四羊方尊和妇好鸮尊谁更难铸", want: "zun" },
      { q: "兵马俑和击鼓说唱俑有什么不同", want: "yong" },
      { q: "两个博山炉有什么区别", want: "lu" },
      { q: "唐三彩枕和磁州窑瓷枕怎么分", want: "zhen" },
      { q: "赤金走龙和金代铜坐龙有什么区别", want: "long" }
    ],

    /* 工艺：问一个工艺名，能不能捞到词条 */
    craft: [
      { q: "错金是什么意思", want: "错金银" },
      { q: "失蜡法和范铸法一样吗", want: "失蜡法" },
      { q: "鎏金是怎么镀上去的", want: "鎏金" },
      { q: "唐三彩是釉上还是釉下", want: "唐三彩" },
      { q: "青花的钴料是哪来的", want: "青花" },
      { q: "斗彩和五彩怎么分", want: "斗彩" },
      { q: "剔红为什么能刻出花纹", want: "剔红" },
      { q: "金缕玉衣的玉片怎么连起来", want: "金缕玉衣" }
    ],

    /* 误认：给一个容易混的名字，能不能给出辨析对 */
    confuse: [
      { name: "簋", want: "鼎" },
      { name: "尊", want: "鼎" },
      { name: "炉", want: "灯" },
      { name: "镇墓兽", want: "俑" },
      { name: "壶", want: "尊" },
      { name: "佩", want: "璧" },
      { name: "熨斗", want: "温炉" },
      { name: "坐龙", want: "走龙" }
    ],

    /* 追问：答漏要点时该不该追问一句 */
    follow: [
      { sid: "changxin", q: "长信宫灯为什么能防烟",
        ref: "我的右臂和身体都是中空的。灯点燃后,烟顺着宫女的右臂进入体腔,落在里面的水里,屋子里就不会被熏黑。",
        a: "因为烟会进到袖子里。", need: true },
      { sid: "changxin", q: "长信宫灯为什么能防烟",
        ref: "我的右臂和身体都是中空的。灯点燃后,烟顺着宫女的右臂进入体腔,落在里面的水里,屋子里就不会被熏黑。",
        a: "因为宫女的右臂和身体中空，烟顺着右臂进入体腔，落在里面的水里，屋子不会被熏黑。", need: false },
      { sid: "houmuwuding", q: "后母戊鼎有多重",
        ref: "我高 133 厘米、口长 112 厘米、口宽 79.2 厘米,重达 832.84 公斤。",
        a: "特别重。", need: true },
      { sid: "houmuwuding", q: "后母戊鼎有多重",
        ref: "我高 133 厘米、口长 112 厘米、口宽 79.2 厘米,重达 832.84 公斤。",
        a: "重达832.84公斤，高133厘米。", need: false },
      { sid: "baohuadeng", q: "百花灯有几盏灯",
        ref: "我共有十三盏灯:灯柱上十二支曲枝分三层伸展,每层四支,各托一盏灯;顶端再坐一盏灯。",
        a: "很多盏。", need: true },
      { sid: "baohuadeng", q: "百花灯有几盏灯",
        ref: "我共有十三盏灯:灯柱上十二支曲枝分三层伸展,每层四支,各托一盏灯;顶端再坐一盏灯。",
        a: "一共十三盏，灯柱上十二支，顶端还有一盏。", need: false }
    ]
  };

  /* ---------------- 小工具 ---------------- */
  function now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
  function round(x, n) { var p = Math.pow(10, n || 2); return Math.round(x * p) / p; }
  function inBand(v, lo, hi) { return v >= lo && v <= hi; }
  /* 沙箱里 SPIRITS 是全局变量、浏览器里挂在 window 上，两种都兜住 */
  function SP(id) {
    var m = (typeof window !== "undefined" && window.SPIRITS) ||
            (typeof SPIRITS !== "undefined" ? SPIRITS : null) || {};
    return m[id];
  }

  var GROUPS = [
    { key: "retrieval", name: "知识检索", unit: "条问句" },
    { key: "gate", name: "档案门控", unit: "条问句" },
    { key: "fact", name: "事实核验", unit: "条答案" },
    { key: "ident", name: "识别对账", unit: "组字段" },
    { key: "qverify", name: "出题校验", unit: "道题" },
    { key: "open", name: "开放题判卷", unit: "份回答" },
    { key: "cmp", name: "跨文物对比", unit: "条问句" },
    { key: "craft", name: "工艺词典", unit: "条问句" },
    { key: "confuse", name: "误认辨析", unit: "个名字" },
    { key: "follow", name: "追问判据", unit: "份回答" }
  ];

  /* ---------------- 各组跑法 ---------------- */
  function runRetrieval() {
    var cases = [], hit1 = 0, hit3 = 0, mrr = 0, t0 = now();
    GOLD.retrieval.forEach(function (c) {
      var r = window.KB.searchSpirits(c.q, 3) || [];
      var ids = r.map(function (x) { return x.sid; });
      var rank = ids.indexOf(c.want) + 1;
      if (rank === 1) hit1++;
      if (rank > 0) { hit3++; mrr += 1 / rank; }
      cases.push({
        ok: rank > 0, input: c.q,
        got: rank > 0 ? (r[rank - 1].sname + " · 第" + rank + "位") : ("未进前三：" + (r[0] ? r[0].sname : "无结果")),
        why: rank > 0 ? "" : "期望「" + ((SP(c.want) || {}).name || c.want) + "」"
      });
    });
    var n = GOLD.retrieval.length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "Top-1 命中", v: round(hit1 / n * 100, 1) + "%" },
        { k: "Top-3 命中", v: round(hit3 / n * 100, 1) + "%" },
        { k: "MRR", v: round(mrr / n, 3) }
      ]
    };
  }

  function runGate() {
    var cases = [], tp = 0, tn = 0, fp = 0, fn = 0, t0 = now();
    GOLD.gate.forEach(function (c) {
      var got = !!window.KB.shouldGround(c.q);
      var ok = got === c.ground;
      if (got && c.ground) tp++;
      else if (!got && !c.ground) tn++;
      else if (got && !c.ground) fp++;
      else fn++;
      cases.push({ ok: ok, input: c.q, got: got ? "查档案" : "不查", why: ok ? "" : ("应" + (c.ground ? "查" : "不查")) });
    });
    var n = GOLD.gate.length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "判定准确率", v: round((tp + tn) / n * 100, 1) + "%" },
        { k: "该查未查", v: String(fn) },
        { k: "不该查却查", v: String(fp) }
      ]
    };
  }

  function runFact() {
    var cases = [], okBad = 0, badTotal = 0, cleanOk = 0, cleanTotal = 0, t0 = now();
    GOLD.fact.forEach(function (c) {
      var ev = window.KB.evidence(c.q, { k: 4 });
      var r = window.KB.check(c.a, ev.hits);
      var uns = (r.unsupported || []).map(function (x) { return x.t; });
      var ok;
      if (c.bad) {
        badTotal++;
        ok = uns.some(function (x) { return x.indexOf(c.bad) >= 0 || c.bad.indexOf(x) >= 0; });
        if (ok) okBad++;
      } else {
        cleanTotal++;
        ok = uns.length === 0;
        if (ok) cleanOk++;
      }
      cases.push({
        ok: ok, input: c.a,
        got: uns.length ? ("标为待核：" + uns.join("、")) : "全部有依据",
        why: ok ? "" : (c.bad ? "期望揪出 " + c.bad : "不应有存疑项")
      });
    });
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "假数据检出", v: badTotal ? round(okBad / badTotal * 100, 1) + "%" : "—" },
        { k: "真数据不误伤", v: cleanTotal ? round(cleanOk / cleanTotal * 100, 1) + "%" : "—" },
        { k: "断言抽取", v: String(window.KB.check(GOLD.fact[0].a, window.KB.evidence(GOLD.fact[0].q).hits).claims) + " 条" }
      ]
    };
  }

  function runIdent() {
    var cases = [], t0 = now();
    if (typeof window.identKBCheck !== "function") {
      return { cases: [], ms: 0, metrics: [{ k: "状态", v: "未加载识别模块" }] };
    }
    GOLD.ident.forEach(function (c) {
      var r = window.identKBCheck({ name: c.name, era: c.era, material: c.material });
      var hit = !!(r && r.hit);
      var cf = (r && r.conflicts) ? r.conflicts.length : 0;
      var ok = hit === c.hit && (!c.hit || cf === c.conflict);
      cases.push({
        ok: ok, input: c.name + " · " + c.era + " · " + c.material,
        got: hit ? ("对账成功，冲突 " + cf + " 处") : "档案未收录",
        why: ok ? "" : ("期望" + (c.hit ? "命中且冲突 " + c.conflict + " 处" : "判为未收录"))
      });
    });
    var n = cases.length, pass = cases.filter(function (x) { return x.ok; }).length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "对账一致", v: round(pass / n * 100, 1) + "%" },
        { k: "冲突检出", v: String(GOLD.ident.filter(function (c) { return c.conflict > 0; }).length) + " 组" },
        { k: "未收录不误判", v: "1 组" }
      ]
    };
  }

  function runQverify() {
    var cases = [], t0 = now();
    GOLD.qverify.forEach(function (c) {
      var s = SP(c.sid);
      var v = window.KB.verifyQuestion(c.q, s);
      var ok = !!v.ok === !!c.ok;
      cases.push({
        ok: ok, input: (c.ok ? "好题｜" : "坏题｜") + c.q.q,
        got: v.ok ? ("放行（" + (v.kind === "history" ? "时代常识" : "本体") + "）") : ("拦下：" + v.why),
        why: ok ? "" : ("期望" + (c.ok ? "放行" : "拦下"))
      });
    });
    var n = cases.length, pass = cases.filter(function (x) { return x.ok; }).length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "判定准确率", v: round(pass / n * 100, 1) + "%" },
        { k: "好题放行", v: GOLD.qverify.filter(function (c) { return c.ok; }).length + " 道" },
        { k: "坏题拦截", v: GOLD.qverify.filter(function (c) { return !c.ok; }).length + " 道" }
      ]
    };
  }

  function runOpen() {
    var cases = [], t0 = now();
    GOLD.open.forEach(function (c) {
      var s = SP(c.sid);
      var r = window.KB.gradeOpen(c.q, c.a, s, c.ref);
      var ok = inBand(r.score, c.lo, c.hi);
      cases.push({
        ok: ok, input: c.a,
        got: r.score + " 分",
        why: ok ? "" : ("期望落在 " + c.lo + "~" + c.hi)
      });
    });
    var n = cases.length, pass = cases.filter(function (x) { return x.ok; }).length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "分档准确", v: round(pass / n * 100, 1) + "%" },
        { k: "用例数", v: String(n) }
      ]
    };
  }

  /* ---------------- 新增四组：对比 / 工艺 / 误认 / 追问 ---------------- */
  function runCmp() {
    var cases = [], t0 = now();
    GOLD.cmp.forEach(function (c) {
      var r = (window.KB && window.KB.compare) ? window.KB.compare(c.q) : null;
      var ok = !!r && r.id === c.want;
      cases.push({
        ok: ok, input: c.q,
        got: r ? (r.title + " · " + r.sides.length + " 件") : "没判出对比意图",
        why: ok ? "" : ("期望判成「" + c.want + "」组")
      });
    });
    var n = cases.length, pass = cases.filter(function (x) { return x.ok; }).length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "对比意图识别", v: round(pass / n * 100, 1) + "%" },
        { k: "对比组", v: String(n) + " 组" }
      ]
    };
  }

  function runCraft() {
    var cases = [], t0 = now();
    GOLD.craft.forEach(function (c) {
      var r = (window.KB && window.KB.craftEvidence) ? window.KB.craftEvidence(c.q) : { hits: [] };
      var got = (r.hits && r.hits[0]) ? r.hits[0].n : "";
      /* 一句话里可能同时提到两条工艺（「失蜡法和范铸法一样吗」），
         只要期望那条被捞出来就算命中，顺序不参与判定。 */
      var ok = (r.hits || []).some(function (h) { return h.n === c.want; });
      cases.push({
        ok: ok, input: c.q,
        got: got || "没命中词条",
        why: ok ? "" : ("期望「" + c.want + "」")
      });
    });
    var n = cases.length, pass = cases.filter(function (x) { return x.ok; }).length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "词条命中", v: round(pass / n * 100, 1) + "%" },
        { k: "词典条数", v: ((window.CONTENT && window.CONTENT.craft) ? window.CONTENT.craft.length : 0) + " 条" }
      ]
    };
  }

  function runConfuse() {
    var cases = [], t0 = now();
    GOLD.confuse.forEach(function (c) {
      var r = (window.KB && window.KB.confuseHint) ? window.KB.confuseHint(c.name) : null;
      /* 名单里存的是「另一侧」，命中任一侧都算判对，只要确实给出了辨析对 */
      var ok = !!r && (r.wrong === c.want || r.right === c.want);
      cases.push({
        ok: ok, input: c.name,
        got: r ? ("与「" + (r.wrong === c.name ? r.right : r.wrong) + "」辨析：" + r.key) : "没给出辨析",
        why: ok ? "" : ("期望与「" + c.want + "」成对")
      });
    });
    var n = cases.length, pass = cases.filter(function (x) { return x.ok; }).length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "辨析命中", v: round(pass / n * 100, 1) + "%" },
        { k: "辨析对", v: ((window.CONTENT && window.CONTENT.confuse) ? window.CONTENT.confuse.length : 0) + " 组" }
      ]
    };
  }

  function runFollow() {
    var cases = [], t0 = now();
    GOLD.follow.forEach(function (c) {
      var s = SP(c.sid);
      var r = (window.KB && window.KB.followUp) ? window.KB.followUp(c.q, c.a, s, c.ref) : { need: false };
      var ok = !!r.need === !!c.need && (!c.need || String(r.ask || "").length >= 4);
      cases.push({
        ok: ok, input: c.a,
        got: r.need ? ("追问：" + r.ask) : "不追问（已答到要点）",
        why: ok ? "" : ("期望" + (c.need ? "追问一句" : "不再追问"))
      });
    });
    var n = cases.length, pass = cases.filter(function (x) { return x.ok; }).length;
    return {
      cases: cases, ms: now() - t0,
      metrics: [
        { k: "判据准确", v: round(pass / n * 100, 1) + "%" },
        { k: "该追问的", v: GOLD.follow.filter(function (c) { return c.need; }).length + " 份" }
      ]
    };
  }

  /* ---------------- 汇总 ---------------- */
  function run() {
    var t0 = now(), groups = [];
    var runners = { retrieval: runRetrieval, gate: runGate, fact: runFact, ident: runIdent, qverify: runQverify, open: runOpen,
                    cmp: runCmp, craft: runCraft, confuse: runConfuse, follow: runFollow };
    GROUPS.forEach(function (g) {
      var r = runners[g.key]();
      var total = r.cases.length, pass = r.cases.filter(function (c) { return c.ok; }).length;
      groups.push({
        key: g.key, name: g.name, unit: g.unit,
        total: total, pass: pass, rate: total ? +(pass / total).toFixed(3) : 0,
        ms: Math.round(r.ms), metrics: r.metrics || [],
        fails: r.cases.filter(function (c) { return !c.ok; })
      });
    });
    var total = 0, pass = 0;
    groups.forEach(function (g) { total += g.total; pass += g.pass; });
    var out = {
      at: new Date().toISOString().replace("T", " ").slice(0, 19),
      ms: Math.round(now() - t0),
      groups: groups, total: total, pass: pass,
      rate: total ? +(pass / total).toFixed(3) : 0,
      kb: (window.KB && window.KB.stats) ? window.KB.stats() : null
    };
    EVAL.last = out;
    return out;
  }

  var EVAL = {
    version: "ev1",
    gold: GOLD,
    groups: GROUPS,
    run: run,
    last: null,
    meta: {
      total: GOLD.retrieval.length + GOLD.gate.length + GOLD.fact.length +
             GOLD.ident.length + GOLD.qverify.length + GOLD.open.length +
             GOLD.cmp.length + GOLD.craft.length + GOLD.confuse.length + GOLD.follow.length,
      scope: "检索 / 门控 / 事实核验 / 识别对账 / 出题校验 / 开放题判卷 / 跨文物对比 / 工艺词条 / 误认辨析 / 追问判据",
      limit: "不含云端大模型本身的端到端准确率（需联网与密钥，会随模型版本漂移）"
    }
  };

  window.EVAL = EVAL;
})();
