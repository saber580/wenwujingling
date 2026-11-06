/* =========================================================
   文物精灵 · 内容包（对比组 / 工艺词典 / 误认辨析 / 真实问题语料）
   ---------------------------------------------------------
   为什么单独一个文件：
     这四类内容都是「给 AI 用的知识」，不是给图鉴展示的文案。
     它们不进 SPIRITS，避免污染图鉴与捕捉逻辑；
     由 kb-rag.js 按需取用，按用途分四组：
       cmp     8 组对比 —— 跨文物对比玩法（玩法 5）的燃料
       craft  30 条工艺 —— 时代题与工艺题的依据，替掉只有 24 条 HIST 的窘境
       confuse 15 组误认 —— 识别流水线在「档案里没有」时补一句「你可能认成了 X」
       corpus 100 条真实问法 —— 扩评测集，也当提示词迭代的输入

   数据原则：
     1) 只写能落到档案或公认史实上的事实，拿不准的数字一律不写具体值；
     2) 对比组只用站内已有的精灵，保证「双证据链」真的能检索到原文；
     3) 每条都带一句「差在哪」，这是答辩时唯一值钱的部分。
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- ① 对比组 8 组 ---------------- */
  /* items: 参与对比的器物（sid 指向 SPIRITS，站内真实存在）
     diff:  三条结论性差异，按「谁更早 / 谁更巧 / 差在哪」组织
     qs:    用户可能怎么问，用于意图识别 */
  var CMP = [
    {
      id: "lamps",
      alias: ["灯"], title: "三盏灯：汉代人怎么把烟留住",
      axis: "排烟结构",
      items: [
        { sid: "changxin", name: "长信宫灯", era: "西汉", craft: "青铜鎏金 · 分铸组装", edge: "宫女右臂就是烟道，烟顺着袖子进体腔，腔内盛水把烟尘溶掉；灯盘可转、灯罩可开合，能调亮度和方向。" },
        { sid: "yanyudeng", name: "雁鱼灯", era: "西汉", craft: "青铜彩绘 · 雁衔鱼造型", edge: "烟从鱼腹经雁颈导入雁腹水中，路子与长信宫灯同理，但把整条通道藏进了鸟的脖子。" },
        { sid: "baohuadeng", name: "百花灯", era: "东汉", craft: "陶质彩绘 · 多层堆塑", edge: "走的是另一条路：把灯做成多层灯树，靠人物、龙、蝉、鸟兽堆塑出一整座「灯的山」，重点在场面不在排烟。" }
      ],
      diff: [
        "谁更早：长信宫灯与雁鱼灯都是西汉，百花灯晚到东汉，晚了约两百年。",
        "谁更巧：论排烟，长信宫灯和雁鱼灯是同一档——都把烟道做进了器身；长信宫灯多一层「可开合灯罩」，能调光。",
        "差在哪：前两件解决「烟往哪去」，百花灯解决「灯能有多热闹」，一个是工程，一个是场面。"
      ],
      verdict: "同一件事（照明），汉代给出了两种答案：把功能藏进造型，或把造型做成景观。",
      qs: ["长信宫灯和雁鱼灯谁的排烟更巧", "三盏灯有什么区别", "百花灯和长信宫灯比哪个好"]
    },
    {
      id: "ding",
      alias: ["鼎"], title: "两鼎一比：青铜时代的重量与字量",
      axis: "体量与铭文",
      items: [
        { sid: "houmuwuding", name: "后母戊鼎", era: "商代后期", craft: "陶范范铸 · 巨型合范", edge: "目前已知最重的中国古代青铜器，八百多公斤；能铸成这么大的方鼎，说明商代晚期已经能组织起超大规模的合范浇铸。" },
        { sid: "tiezuding", name: "中山王铁足铜鼎", era: "战国 · 中山国", craft: "铜身铁足 · 长篇铭文", edge: "战国中山王墓出土，鼎足用铁，身上铸了长篇铭文，是研究中山国史的一等材料。" }
      ],
      diff: [
        "谁更早：后母戊鼎早了一千多年，商代后期对战国。",
        "谁更巧：后母戊鼎赢在体量与铸造组织能力；铁足鼎赢在「铜铁合铸」和铭文的信息量。",
        "差在哪：一个用重量说话，一个用文字说话——商代把权力铸进体量，战国把历史刻进铭文。"
      ],
      verdict: "从「比谁大」到「比谁记得多」，鼎的功能在战国已经变了。",
      qs: ["后母戊鼎和中山王铁足铜鼎哪个更早", "两个鼎有什么区别", "铁足铜鼎为什么用铁做足"]
    },
    {
      id: "zun",
      alias: ["尊"], title: "两尊对看：方尊与鸟兽尊",
      axis: "造型语言",
      items: [
        { sid: "siyangfangzun", name: "四羊方尊", era: "商代后期", craft: "分铸法 · 四角羊首", edge: "四角各探出一个羊首，肩部四龙缠绕；羊角是先分铸再嵌套进器身的，属于「分铸法」的典型。" },
        { sid: "fuxiaozun", name: "妇好鸮尊", era: "商代晚期 · 殷墟妇好墓", craft: "整体铸造成鸮形", edge: "整器就是一只昂首的鸮（猫头鹰），盖、身、尾一体构思，殷墟妇好墓出土，同型成对。" }
      ],
      diff: [
        "谁更早：两件都是商代晚期，时间相近。",
        "谁更巧：四羊方尊难在「分铸嵌套」，把四个羊首严丝合缝接进方尊；鸮尊难在「整体象生」，要把一只鸟的体态收进礼器的规矩里。",
        "差在哪：一个是在方正器身上长出动植物，一个是把整件器物做成动物——装饰与象生两条路。"
      ],
      verdict: "同是商代酒器，一个把动物贴上去，一个把器物变成动物。",
      qs: ["四羊方尊和妇好鸮尊谁更难铸", "两个尊有什么区别"]
    },
    {
      id: "yong",
      alias: ["俑"], title: "三件俑：秦的写实、汉的诙谐、唐的热闹",
      axis: "神态与功能",
      items: [
        { sid: "bingmayong", name: "兵马俑", era: "秦代", craft: "陶塑 · 模塑结合", edge: "真人大小、千人千面，按军阵排列，是「以俑代殉」的国家工程。" },
        { sid: "shuochangyong", name: "击鼓说唱俑", era: "东汉", craft: "陶塑 · 彩绘", edge: "缩着脖子、腆着肚子、左脚翘起，把俳优说唱演到笑点上，是汉代世俗生活的直接证据。" },
        { sid: "sancailuotuo", name: "三彩骆驼载乐俑", era: "唐代", craft: "三彩低温铅釉 · 模制", edge: "骆驼背上驮着一支乐队，胡人面孔、胡乐器，把丝路贸易与胡乐东传一起定格。" }
      ],
      diff: [
        "谁更早：秦 → 东汉 → 唐，跨度近千年。",
        "谁更巧：秦俑赢在规模与写实；汉俑赢在表情与动势；唐俑赢在釉色与题材的国际化。",
        "差在哪：秦俑是「军队」，汉俑是「个人」，唐俑是「一台节目」——俑从陪葬品变成了生活切片。"
      ],
      verdict: "看俑就是看时代情绪：秦紧张，汉松弛，唐热闹。",
      qs: ["兵马俑和击鼓说唱俑有什么不同", "三件俑有什么区别", "为什么唐俑那么鲜艳"]
    },
    {
      id: "lu",
      alias: ["博山炉"], title: "两炉相较：同一种山，两种做法",
      axis: "工艺与纹饰",
      items: [
        { sid: "boshanlu", name: "错金铜博山炉", era: "西汉 · 满城汉墓", craft: "错金 · 山形镂孔盖", edge: "炉盖做成层叠山峦，错金云气纹满布，烟从山间孔洞溢出，像仙山吐云。" },
        { sid: "liujinlu", name: "鎏金盘龙座铜博山炉", era: "汉代", craft: "鎏金 · 盘龙座", edge: "同样取博山造型，但在底座上盘了一条龙，鎏金通体，气势更外放。" }
      ],
      diff: [
        "谁更早：错金博山炉出自西汉满城汉墓，可定到公元前 2 世纪；鎏金盘龙座同为汉代，具体年份不如前者明确。",
        "谁更巧：错金博山炉胜在纹饰工艺（错金要嵌金丝再打磨）；鎏金盘龙座胜在造型叙事（把龙加进了底座）。",
        "差在哪：一个把功夫花在表面纹样，一个把功夫花在整体构图。"
      ],
      verdict: "博山炉是汉代的「香氛机」，也是把仙境搬进卧室的装置。",
      qs: ["两个博山炉有什么区别", "博山炉上面的山是什么意思"]
    },
    {
      id: "zhen",
      alias: ["瓷枕"], title: "两枕对照：唐三彩与元磁州窑",
      axis: "釉与画",
      items: [
        { sid: "shidizhen", name: "三彩柿蒂纹长方枕", era: "唐代", craft: "三彩低温铅釉", edge: "以釉色取胜，柿蒂纹对称铺开，颜色靠铅釉流动，烧一次成色。" },
        { sid: "shimiaozhen", name: "白地黑花「时苗留犊」瓷枕", era: "元代", craft: "磁州窑白地黑花", edge: "以画取胜，白地上用黑彩画故事，把「时苗留犊」这类清官典故画在枕头上，睡着也能受教。" }
      ],
      diff: [
        "谁更早：唐早于元，差五百多年。",
        "谁更巧：唐三彩难在控温控釉（铅釉易流），磁州窑难在「画」——铁彩在生坯上一笔定生死。",
        "差在哪：一个用颜色说话，一个用线条说话；一个装饰，一个叙事。"
      ],
      verdict: "枕头的两面：唐人在意好看，元人在意有话说。",
      qs: ["唐三彩枕和磁州窑瓷枕有什么区别", "时苗留犊是什么意思"]
    },
    {
      id: "long",
      alias: ["龙"], title: "两条龙：走与坐",
      axis: "姿态与材质",
      items: [
        { sid: "zoulong", name: "赤金走龙", era: "唐代 · 何家村窖藏", craft: "金质 · 锤揲錾刻", edge: "小到可以托在掌心，四肢迈开、长尾上卷，是「行走中」的龙，多半用于道教投龙仪式。" },
        { sid: "tongzuolong", name: "金代铜坐龙", era: "金代", craft: "铜铸 · 坐姿", edge: "蹲坐、昂首、张口，形体凝重，一般认为与皇家辇辂或宫殿陈设有关。" }
      ],
      diff: [
        "谁更早：唐早于金，差约四百年。",
        "谁更巧：赤金走龙难在金工（锤揲出肌肉起伏）；铜坐龙难在体量与环境（要镇得住场面）。",
        "差在哪：唐龙在动，金龙在守——一个是仪式里的信使，一个是权力前的守卫。"
      ],
      verdict: "同一条龙，唐人要它跑起来，金人要它坐下去。",
      qs: ["赤金走龙和金代铜坐龙有什么区别", "为什么唐龙是走的"]
    },
    {
      id: "yu",
      alias: ["玉"], title: "同墓两玉：礼玉与葬玉",
      axis: "用途",
      items: [
        { sid: "shuanglongbi", name: "透雕双龙白玉璧", era: "西汉 · 满城汉墓", craft: "透雕 · 双龙附璧", edge: "璧面透雕双龙，是佩戴与礼制并用的玉器，讲究的是「看得见的身份」。" },
        { sid: "jinyuyi", name: "刘胜金缕玉衣", era: "西汉 · 满城汉墓", craft: "玉片金丝编缀", edge: "两千多片玉片用金丝编成，把整个人包住，求的是「尸身不腐」，讲究的是「看不见的永生」。" }
      ],
      diff: [
        "谁更早：同出满城汉墓，同一时期。",
        "谁更巧：玉璧难在透雕（玉脆，镂空易崩）；玉衣难在工程（数千片玉按人体分型编号编缀）。",
        "差在哪：一件给活人看，一件给死人用——礼玉讲排场，葬玉讲信仰。"
      ],
      verdict: "同一种材料，汉代人用它办两件事：证明身份，和赌一个不死。",
      qs: ["金缕玉衣和玉璧有什么区别", "汉代为什么用玉衣下葬"]
    }
  ];

  /* ---------------- ② 工艺词典 30 条 ---------------- */
  /* how: 一句话原理  rep: 站内代表作  vs: 最容易混的那一项怎么分 */
  var CRAFT = [
    { n: "范铸法", aka: "陶范铸造", era: "商周", how: "先做泥模，再翻出外范与内芯，合范后浇铜，冷却打碎范取出器", rep: "后母戊鼎、四羊方尊", vs: "与失蜡法相比，范铸要分块合范，器身会留下范线" },
    { n: "失蜡法", aka: "熔模铸造", era: "春秋战国以后", how: "用蜡做原型，外面糊泥成壳，烧掉蜡再浇铜，蜡模多复杂铜器就多复杂", rep: "曾侯乙尊盘一类复杂镂空器", vs: "范铸靠分块拼接，失蜡能一次铸出连续镂空，没有范线" },
    { n: "分铸法", aka: "先铸附件再合铸", era: "商周", how: "把羊首、耳、足等附件单独铸好，再嵌进主体范里二次浇铸", rep: "四羊方尊", vs: "与整体一次浇铸不同，分铸能解决「附件突出、模具挡位」的问题" },
    { n: "错金银", aka: "嵌错、金银错", era: "春秋战国至汉", how: "在铜器表面刻出沟槽，把金丝银丝嵌进去打磨平，靠金属色差成纹", rep: "错金铜博山炉、错金银四龙四凤铜方案座", vs: "与鎏金不同：错金银是「嵌进去」，鎏金是「镀上去」" },
    { n: "鎏金", aka: "火镀金", era: "战国以后", how: "金溶于水银成泥，涂在铜器上烘烤，水银挥发后金层留在表面", rep: "鎏金盘龙座铜博山炉、铜鎏金宗喀巴像", vs: "与贴金不同，鎏金是汞齐冶金结合，不易整片脱落" },
    { n: "鎏银", aka: "火镀银", era: "汉以后", how: "与鎏金同理，用银汞齐涂布烘烤", rep: "汉代铜器装饰", vs: "银层易氧化发黑，出土后常被误认作锡层" },
    { n: "镶嵌绿松石", aka: "嵌石", era: "夏商", how: "在铜牌、玉器上按纹样开槽，把绿松石片嵌入粘牢", rep: "嵌绿松石兽面纹铜牌饰", vs: "与错金银的区别在材料：一个是宝石片，一个是金属丝" },
    { n: "錾刻", aka: "錾花", era: "唐以后", how: "用不同头型的錾子逐点敲击，在金属表面压出纹样", rep: "赤金走龙", vs: "与铸造纹样不同，錾刻是冷加工，纹路边缘有挤压痕" },
    { n: "锤揲", aka: "打作", era: "唐以后", how: "金银板反复退火敲打，靠延展成型，能打出很薄的立体器", rep: "赤金走龙", vs: "与铸造相比更轻更薄，内壁常见锤痕" },
    { n: "模印", aka: "印坯", era: "汉唐", how: "把泥料压进刻好纹样的模具，脱模后修坯", rep: "唐三彩镇墓兽、汉代瓦当", vs: "与手塑相比纹样重复、规整，同模器物能完全对上" },
    { n: "贴塑", aka: "堆贴", era: "汉唐", how: "把捏好的泥片、泥条贴到器身上再加烧", rep: "东汉彩绘陶百花灯、青釉堆贴花龙冰壶", vs: "与刻划不同，贴塑是「加上去」，侧面能看到接缝" },
    { n: "轮制", aka: "拉坯", era: "新石器时代以来", how: "泥料放在转轮上靠离心力拉出圆形器身", rep: "半山彩陶壶", vs: "轮制器内壁有平行拉坯纹，手制则厚薄不均" },
    { n: "彩绘陶", aka: "彩陶（陶胎上画）", era: "新石器至汉", how: "陶器烧成后再用矿物颜料画，颜料不入釉、附着力弱", rep: "东汉彩绘陶百花灯、东汉击鼓说唱俑", vs: "与釉下彩不同：彩绘陶的彩在表面，一擦就掉" },
    { n: "低温铅釉", aka: "铅釉陶", era: "汉", how: "以铅作助熔剂，七八百度就能烧出光亮釉面，但易剥落", rep: "绿釉陶楼、绿釉陶猪", vs: "与高温瓷釉相比硬度低、有细密开片，俗称「泛银」" },
    { n: "唐三彩", aka: "低温多彩铅釉陶", era: "唐", how: "在铅釉里加铜、铁等着色，二次低温烧成，釉色互相流淌", rep: "唐三彩镇墓兽、三彩骆驼载乐俑", vs: "三彩是「陶」不是「瓷」，胎松、釉软、多流釉" },
    { n: "青釉", aka: "青瓷釉", era: "东汉以来", how: "釉里含铁，在还原气氛中烧成青绿色", rep: "青釉仰覆莲花尊、青釉堆贴花龙冰壶", vs: "与白釉的分界在铁含量：青釉含铁，白釉要除铁" },
    { n: "白釉", aka: "白瓷釉", era: "北朝以来", how: "胎釉里把铁控制在极低，烧出来才能白", rep: "白釉黑花坐形童子像", vs: "白瓷比白陶致密，敲之声脆" },
    { n: "黑釉", aka: "黑瓷", era: "东汉以来", how: "釉里氧化铁高到一定程度，烧成就是黑的", rep: "辽代茶叶末釉鸡腿瓶", vs: "茶叶末釉是黑釉的一支，釉面有结晶点" },
    { n: "青花", aka: "釉下钴蓝", era: "元代成熟", how: "用钴料在生坯上画，罩透明釉一次高温烧成，蓝在釉下永不褪", rep: "青花瓷、青花龙凤纹三足炉", vs: "与釉里红只差着色剂：一个钴一个铜，铜难烧得多" },
    { n: "釉里红", aka: "釉下铜红", era: "元代", how: "用铜料在釉下画，还原气氛中呈红，温度差一点就发灰发黑", rep: "明代官窑", vs: "成品率远低于青花，红色常偏暗" },
    { n: "斗彩", aka: "逗彩", era: "明成化", how: "先釉下青花勾轮廓，烧成后再填釉上彩，二次低温烧", rep: "明代官窑", vs: "与五彩不同：斗彩有青花打底，五彩是纯釉上" },
    { n: "五彩", aka: "硬彩", era: "明清明", how: "全部釉上彩，烧成后用彩料画再低温烤", rep: "清代五彩牡丹纹罐", vs: "色彩硬朗、有凸起感，不如粉彩柔和" },
    { n: "粉彩", aka: "软彩", era: "清康熙以后", how: "彩料里加玻璃白打底，颜色能晕染出层次", rep: "清代官窑", vs: "与五彩的差别就在这层「白」：粉彩能渐变，五彩不能" },
    { n: "剔红", aka: "雕漆", era: "唐宋以来", how: "在胎上刷几十上百道漆，厚到能刻，再雕出纹样", rep: "清代雕漆", vs: "与描漆不同，剔红是「减」出来的，刀口见漆层" },
    { n: "透雕", aka: "镂空", era: "新石器以来", how: "把玉、石、木上不需要的部分镂穿，留下纹样", rep: "透雕双龙白玉璧、透雕螭龙纹金牌饰", vs: "与浮雕不同：透雕有孔洞，两面可看" },
    { n: "金缕玉衣", aka: "玉匣", era: "汉代", how: "按人体分片制玉，钻孔后用金丝编缀成衣", rep: "刘胜金缕玉衣", vs: "按缕分等级：金缕、银缕、铜缕，身份不同用不同线" },
    { n: "累丝", aka: "花丝", era: "明清", how: "把金银拉成细丝，盘织、掐花、焊接成器", rep: "清代宫廷金银器", vs: "与錾刻不同，累丝是「加」出来的，轻且透" },
    { n: "烧蓝", aka: "珐琅", era: "明清", how: "在金属掐出的格子里填珐琅釉，入炉烧结", rep: "清代珐琅器", vs: "与烧蓝相近的还有画珐琅，区别在填还是画" },
    { n: "剪纸漏花", aka: "磁州窑漏花", era: "宋金", how: "把剪纸贴在坯上，施釉后揭去，留下纹样空白", rep: "白地黑花瓷枕一系", vs: "与画花不同，漏花纹样边缘利落、能看出纸的剪口" },
    { n: "覆烧", aka: "支钉烧、垫烧", era: "宋以后", how: "把器口朝下扣在支圈上烧，一次能码很多件，口沿要刮釉", rep: "定窑一系", vs: "覆烧器口沿无釉（芒口），正烧则口沿有釉" }
  ];

  /* ---------------- ③ 常见误认 15 组 ---------------- */
  /* a/b: 两件容易被认混的器物；tip: 一句话分清；key: 记这一条就够 */
  var CONFUSE = [
    { a: "鼎", b: "簋", sidA: "houmuwuding", sidB: "tonggui", key: "看足和用途", tip: "鼎是三足（也有四足）的煮肉器，簋是圈足或方座的盛饭器，商周礼制里鼎盛肉、簋盛黍稷，常成套出现。" },
    { a: "尊", b: "鼎", sidA: "siyangfangzun", sidB: "houmuwuding", key: "看口和腹", tip: "尊是酒器，大口、鼓腹、高圈足，没有鼎那样的三足；鼎一定是立在三只脚上的。" },
    { a: "灯", b: "炉", sidA: "changxin", sidB: "boshanlu", key: "看有没有灯盘", tip: "灯有灯盘和灯芯位，用来照明；炉是焚香的，盖上有镂孔散烟，没有盛油的盘。" },
    { a: "博山炉", b: "香薰", sidA: "boshanlu", sidB: "tongxiangxun", key: "看盖子", tip: "博山炉盖必做层叠山峦，是汉代的「仙山」意象；后世香薰盖多为花鸟、缠枝，没有山的造型。" },
    { a: "俑", b: "镇墓兽", sidA: "shuochangyong", sidB: "zhenmushou", key: "看是人还是兽", tip: "俑是人形（或动物）的替身，表情动作写实；镇墓兽是想象出来的怪兽，多为人面兽身、独角。" },
    { a: "壶", b: "尊", sidA: "longhu", sidB: "siyangfangzun", key: "看有没有流和把", tip: "壶有流（倒水的嘴）、有把或提梁，是实用器；尊没有流，是礼器，讲究的是造型。" },
    { a: "罐", b: "壶", sidA: "mudanguan", sidB: "longhu", key: "看口和流", tip: "罐大口、无流、无把，收口盛物；壶必有流或有提梁，用来倒。" },
    { a: "璧", b: "佩", sidA: "shuanglongbi", sidB: "yunlongpei", key: "看孔和大小", tip: "璧是圆形中孔、孔径小于半径的礼玉，个大；佩是随身系的，形制自由、多带穿孔。" },
    { a: "玉猪龙", b: "龙形佩", sidA: "yuzhulong", sidB: "yunlongpei", key: "看头和身", tip: "红山玉猪龙是兽首（猪吻）、身体卷成环、缺口不闭合；后世龙佩多为透雕的行走龙形。" },
    { a: "印章", b: "多面印", sidA: "pianjiangjunyin", sidB: "duoguxinyin", key: "数面数", tip: "普通印章一到两面；独孤信多面印有十几个面，一印多用，是官员身兼数职的产物。" },
    { a: "佛造像", b: "菩萨像", sidA: "taihezaoxiang", sidB: "liujinpusa", key: "看头饰和衣", tip: "佛多螺发肉髻、披袈裟、少饰物；菩萨戴宝冠、有璎珞臂钏，装饰华丽。" },
    { a: "温炉", b: "熨斗", sidA: "wenlu", sidB: "tianluyundou", key: "看有没有柄和盘", tip: "温炉是带盘、带轮，用来温酒温食；熨斗是长柄接一个平底斗，装炭后压着烫布。" },
    { a: "鸡腿瓶", b: "莲花尊", sidA: "jituiping", sidB: "lianhuazun", key: "看肩和装饰", tip: "鸡腿瓶小口、溜肩、长腹，是辽代装酒奶的实用器；莲花尊满身莲瓣堆塑，是北朝的精神产品。" },
    { a: "铁狮", b: "玉狮", sidA: "tielion", sidB: "baiyulion", key: "看体量和材质", tip: "沧州铁狮子是五代后周铸造的巨型镇水铁兽，几十吨；白玉蹲狮是小型陈设玉雕，案头之物。" },
    { a: "走龙", b: "坐龙", sidA: "zoulong", sidB: "tongzuolong", key: "看姿态", tip: "唐代赤金走龙四肢迈开、长尾上卷，是行进姿态；金代铜坐龙蹲坐昂首，是陈设或辇辂装饰。" }
  ];

  /* ---------------- ④ 真实问法语料 100 条 ---------------- */
  /* g: 问法类型（size/era/mat/craft/origin/use/why/cmp/open）—— 用来做提示词迭代时的分层输入
     sid 为 null 表示站务或泛问，不该注入档案 */
  var CORPUS = [
    { q: "长信宫灯到底有多大", sid: "changxin", g: "size" },
    { q: "这个宫女灯为什么能吸油烟", sid: "changxin", g: "why" },
    { q: "长信宫灯是在哪儿挖出来的", sid: "changxin", g: "origin" },
    { q: "灯罩真的能转吗", sid: "changxin", g: "use" },
    { q: "五铢钱一枚现在多重", sid: "wuzhuqian", g: "size" },
    { q: "五铢钱用了多少年", sid: "wuzhuqian", g: "era" },
    { q: "为什么古钱中间要开方孔", sid: "wuzhuqian", g: "why" },
    { q: "后母戊鼎多少斤", sid: "houmuwuding", g: "size" },
    { q: "后母戊鼎是做什么用的", sid: "houmuwuding", g: "use" },
    { q: "那个最大的鼎是怎么铸出来的", sid: "houmuwuding", g: "craft" },
    { q: "鼎上面的花纹是什么", sid: "houmuwuding", g: "craft" },
    { q: "四羊方尊的羊是后来焊上去的吗", sid: "siyangfangzun", g: "craft" },
    { q: "四羊方尊出土地在哪", sid: "siyangfangzun", g: "origin" },
    { q: "四羊方尊是装酒的还是装水的", sid: "siyangfangzun", g: "use" },
    { q: "妇好鸮尊为什么是猫头鹰", sid: "fuxiaozun", g: "why" },
    { q: "妇好是谁", sid: "fuxiaozun", g: "era" },
    { q: "鸮尊是一对还是单个", sid: "fuxiaozun", g: "open" },
    { q: "金缕玉衣用了多少片玉", sid: "jinyuyi", g: "size" },
    { q: "玉衣的金丝有多重", sid: "jinyuyi", g: "size" },
    { q: "穿玉衣真能防腐吗", sid: "jinyuyi", g: "why" },
    { q: "刘胜是谁", sid: "jinyuyi", g: "era" },
    { q: "玉猪龙是猪还是龙", sid: "yuzhulong", g: "why" },
    { q: "玉猪龙哪个文化出的", sid: "yuzhulong", g: "era" },
    { q: "红山文化在哪儿", sid: "yuzhulong", g: "origin" },
    { q: "兵马俑为什么长得都不一样", sid: "bingmayong", g: "why" },
    { q: "兵马俑原来有颜色吗", sid: "bingmayong", g: "craft" },
    { q: "兵马俑有多高", sid: "bingmayong", g: "size" },
    { q: "说唱俑为什么笑得那么开心", sid: "shuochangyong", g: "why" },
    { q: "说唱俑手里拿的是什么", sid: "shuochangyong", g: "use" },
    { q: "汉代俳优是干什么的", sid: "shuochangyong", g: "open" },
    { q: "三彩骆驼上到底几个人", sid: "sancailuotuo", g: "size" },
    { q: "骆驼上的人在演奏什么", sid: "sancailuotuo", g: "use" },
    { q: "唐三彩的釉为什么是流的", sid: "sancailuotuo", g: "craft" },
    { q: "唐三彩是瓷器吗", sid: "sancailuotuo", g: "craft" },
    { q: "百花灯一共有几层", sid: "baohuadeng", g: "size" },
    { q: "百花灯上塑的都是些什么", sid: "baohuadeng", g: "open" },
    { q: "雁鱼灯和长信宫灯哪个更早", sid: "yanyudeng", g: "cmp" },
    { q: "雁鱼灯的烟从哪儿走", sid: "yanyudeng", g: "why" },
    { q: "博山炉为什么做成山的形状", sid: "boshanlu", g: "why" },
    { q: "博山炉里烧的是什么香料", sid: "boshanlu", g: "use" },
    { q: "错金是什么意思", sid: "boshanlu", g: "craft" },
    { q: "鎏金和错金一样吗", sid: "liujinlu", g: "craft" },
    { q: "铁足铜鼎为什么足是铁的", sid: "tiezuding", g: "craft" },
    { q: "中山国是现在的哪儿", sid: "tiezuding", g: "origin" },
    { q: "十五连盏灯怎么点着", sid: "lianzhandeng", g: "use" },
    { q: "十五连盏灯多重", sid: "lianzhandeng", g: "size" },
    { q: "错金银方案座是干什么用的", sid: "longfengfan", g: "use" },
    { q: "四龙四凤是什么意思", sid: "longfengfan", g: "why" },
    { q: "虎噬鹿屏风座是插座吗", sid: "hushilu", g: "use" },
    { q: "铜爵是喝酒的还是温酒的", sid: "tongjue", g: "use" },
    { q: "四神纹是哪四神", sid: "cuojinhu", g: "open" },
    { q: "温炉怎么加热", sid: "wenlu", g: "use" },
    { q: "沧州铁狮子多少吨", sid: "tielion", g: "size" },
    { q: "铁狮子为什么叫镇海吼", sid: "tielion", g: "why" },
    { q: "铁狮子现在还在原地吗", sid: "tielion", g: "open" },
    { q: "青花瓷的蓝是什么料", sid: "qinghuaci", g: "craft" },
    { q: "青花是什么时候成熟的", sid: "qinghuaci", g: "era" },
    { q: "苏麻离青是什么", sid: "qinghuaci", g: "craft" },
    { q: "青花和青瓷是一回事吗", sid: "qinghuaci", g: "cmp" },
    { q: "倒流壶为什么倒着不漏", sid: "daoliuhu", g: "why" },
    { q: "倒流壶的构造原理", sid: "daoliuhu", g: "why" },
    { q: "耀州窑在哪个省", sid: "daoliuhu", g: "origin" },
    { q: "鸡腿瓶为什么叫这名", sid: "jituiping", g: "why" },
    { q: "鸡腿瓶是装什么的", sid: "jituiping", g: "use" },
    { q: "莲花尊是北朝的还是隋的", sid: "lianhuazun", g: "era" },
    { q: "莲花尊为什么满身莲花", sid: "lianhuazun", g: "why" },
    { q: "长乐未央瓦当什么意思", sid: "wadang", g: "why" },
    { q: "瓦当是装在哪儿", sid: "wadang", g: "use" },
    { q: "独孤信是谁", sid: "duoguxinyin", g: "era" },
    { q: "多面印有几个面", sid: "duoguxinyin", g: "size" },
    { q: "偏将军印章是什么级别的官", sid: "pianjiangjunyin", g: "era" },
    { q: "晋侯鸟尊是什么鸟", sid: "jinhouniaozun", g: "why" },
    { q: "鸟尊的尾巴为什么卷起来", sid: "jinhouniaozun", g: "craft" },
    { q: "邓仲牺尊是什么动物", sid: "dengxizun", g: "open" },
    { q: "双羊尊是两隻羊背靠背吗", sid: "shuangyangzun", g: "open" },
    { q: "犀尊是写实的吗", sid: "xizun", g: "craft" },
    { q: "错金银云纹犀尊多沉", sid: "xizun", g: "size" },
    { q: "赤金走龙是纯金的吗", sid: "zoulong", g: "mat" },
    { q: "赤金走龙是干什么用的", sid: "zoulong", g: "use" },
    { q: "金代铜坐龙是放在哪儿的", sid: "tongzuolong", g: "use" },
    { q: "铜坐龙为什么坐着", sid: "tongzuolong", g: "why" },
    { q: "错金豹镇是压席子的吗", sid: "baozhen", g: "use" },
    { q: "汉代人席地而坐怎么坐", sid: "baozhen", g: "open" },
    { q: "玉衣和玉璧哪个等级高", sid: "shuanglongbi", g: "cmp" },
    { q: "透雕玉璧为什么容易碎", sid: "shuanglongbi", g: "craft" },
    { q: "唐三彩镇墓兽为什么长得凶", sid: "zhenmushou", g: "why" },
    { q: "镇墓兽放在墓里什么位置", sid: "zhenmushou", g: "use" },
    { q: "太和十一年是哪一年", sid: "taihezaoxiang", g: "era" },
    { q: "北魏的佛造像有什么特点", sid: "taihezaoxiang", g: "craft" },
    { q: "宗喀巴是哪个教派的", sid: "zongkaba", g: "era" },
    { q: "吉祥天母在藏传佛教里管什么", sid: "jixiangtianmu", g: "open" },
    { q: "长明灯楼是灯塔吗", sid: "changmingdenglou", g: "why" },
    { q: "汉白玉螭首是什么建筑构件", sid: "chishou", g: "use" },
    { q: "五彩和粉彩怎么分", sid: "mudanguan", g: "craft" },
    { q: "铜香薰和博山炉什么区别", sid: "tongxiangxun", g: "cmp" },
    { q: "砚滴是干什么的", sid: "yanshidi", g: "use" },
    /* 站务 / 泛问：不该检索档案 */
    { q: "这个网站怎么玩", sid: null, g: "service" },
    { q: "一共有多少只精灵", sid: null, g: "service" },
    { q: "怎么打卡", sid: null, g: "service" },
    { q: "我要怎么登录", sid: null, g: "service" },
    { q: "你是谁", sid: null, g: "service" },
    { q: "考考我", sid: null, g: "service" },
    { q: "河北有哪些博物馆值得去", sid: null, g: "open" },
    { q: "青铜器和陶器哪个更早", sid: null, g: "open" },
    { q: "中国最早的龙长什么样", sid: null, g: "open" },
    { q: "为什么文物都要放在玻璃柜里", sid: null, g: "open" }
  ];

  /* ---------------- 查询接口 ---------------- */
  function byId(list, key, val) {
    for (var i = 0; i < list.length; i++) if (list[i][key] === val) return list[i];
    return null;
  }

  /* 一句话里是否点了这两件器物的名（用于识别「对比」意图） */
  function namesOf(rec) {
    var out = [];
    rec.items.forEach(function (it) { if (it.name) out.push(it.name); });
    return out;
  }

  /* 从问题里猜出想要哪一组对比。三种命中方式：
       ① 点名两件（「后母戊鼎和铁足铜鼎」）—— 最可靠
       ② 点到一个类名 + 有比较词（「两个博山炉有什么区别」）
       ③ 组名命中（「三盏灯」）
     只有一种情况不给：只提了一件、又没有比较词（「长信宫灯为什么能防烟」）。 */
  /* 比较词只收真比较。「哪个博物馆」不是对比，所以「哪个」必须跟「更 / 早 / 巧」连用才算 */
  var CUE = /区别|不同|谁更|谁早|谁巧|谁难|谁厉害|怎么分|怎么区分|一样吗|一样|差在哪|差别|比起来|相比|对比|大于|胜过|哪个更|哪个早|哪件更|还是.{0,6}(好|强|巧)/;

  /* 一件器物的「叫法」：全名、去掉修饰的核心名、末两字（瓷枕 / 方尊 这类通名） */
  function nameHits(s, nm) {
    if (!nm) return 0;
    if (s.indexOf(nm) >= 0) return 2;
    var core = nm.replace(/^[\u4e00-\u9fa5]{0,4}?(商代|西周|战国|西汉|东汉|唐代|元代|金代|东汉|北齐|清代|辽代)/, "");
    if (core && core !== nm && s.indexOf(core) >= 0) return 2;
    if (nm.length >= 3 && s.indexOf(nm.slice(-2)) >= 0) return 1;
    return 0;
  }

  function pickCmp(q) {
    var s = String(q || "");
    if (!s) return null;
    var cue = CUE.test(s);
    /* 先看出现的是哪几组类名：一句话里只该比一组，出现两组就不敢猜 */
    var aliasGroups = 0;
    CMP.forEach(function (rec) {
      var al = rec.alias || [];
      for (var i = 0; i < al.length; i++) if (s.indexOf(al[i]) >= 0) { aliasGroups++; break; }
    });

    var best = null, bestScore = 0;
    CMP.forEach(function (rec) {
      var full = 0, any = 0;
      rec.items.forEach(function (it) {
        var h = nameHits(s, it.name);
        if (h) { any++; if (h >= 2) full++; }
      });
      var al = 0;
      (rec.alias || []).forEach(function (a) { if (s.indexOf(a) >= 0) al = 1; });
      var titleHit = s.indexOf(rec.title.slice(0, 4)) >= 0 ? 1 : 0;

      var ok = false;
      if (any >= 2) ok = true;                                  /* ① 点到两件 */
      else if (al && cue && aliasGroups <= 1) ok = true;         /* ② 类名 + 比较词，且没混到别组 */
      else if (titleHit && cue) ok = true;                       /* ③ 组名 + 比较词 */
      if (!ok) return;

      var sc = any * 2 + al + titleHit + (cue ? 1 : 0);
      if (sc > bestScore) { bestScore = sc; best = rec; }
    });
    return best;
  }

  /* 工艺词条命中：问「错金是什么」要能把词条捞出来 */
  /* 命中工艺词条：按「在问句里出现的位置」排序，先说到的排前面。
     除了正式名与别称，也认词条名的前两字（「错金」→「错金银」），
     因为玩家很少把工艺全名说全。 */
  function pickCraft(q) {
    var s = String(q || ""), out = [];
    CRAFT.forEach(function (c) {
      var pos = -1;
      if (c.n && s.indexOf(c.n) >= 0) pos = s.indexOf(c.n);
      else if (c.aka && s.indexOf(c.aka) >= 0) pos = s.indexOf(c.aka);
      else if (c.n && c.n.length >= 3 && s.indexOf(c.n.slice(0, 2)) >= 0) pos = s.indexOf(c.n.slice(0, 2));
      if (pos >= 0) out.push({ c: c, p: pos });
    });
    out.sort(function (a, b) { return a.p - b.p; });
    return out.map(function (x) { return x.c; });
  }

  /* 误认辨析：给一个被认错的名字，返回「你可能认成了 X」的那一条 */
  function pickConfuse(name) {
    var s = String(name || "");
    if (!s) return null;
    for (var i = 0; i < CONFUSE.length; i++) {
      if (s.indexOf(CONFUSE[i].a) >= 0 || s.indexOf(CONFUSE[i].b) >= 0) return CONFUSE[i];
    }
    return null;
  }

  window.CONTENT = {
    version: "cp1",
    cmp: CMP,
    craft: CRAFT,
    confuse: CONFUSE,
    corpus: CORPUS,
    pickCmp: pickCmp,
    pickCraft: pickCraft,
    pickConfuse: pickConfuse,
    stats: function () {
      return { cmp: CMP.length, craft: CRAFT.length, confuse: CONFUSE.length, corpus: CORPUS.length };
    }
  };
})();
