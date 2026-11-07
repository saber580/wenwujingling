/* =========================================================
   文物精灵 · 数据层
   主属性 = 材质(决定精灵的“种类”)
   副属性 = 用途(决定精灵的“特长”)
   ========================================================= */

const ATTRIBUTES = {
  primary: {
    bronze:   { name: "青铜器",     color: "#b87333", icon: "p_bronze",   desc: "铜锡合金铸造。先秦至汉代的礼器、兵器、钱币多用此材。" },
    gold:     { name: "金银器",     color: "#d4af37", icon: "p_gold",     desc: "金、银打造的器物,富丽华贵,多作装饰与珍藏。" },
    ceramic:  { name: "陶瓷器",     color: "#3f7cac", icon: "p_ceramic",  desc: "粘土高温烧成。陶质朴,瓷坚致,是中国对世界的名片。" },
    jade:     { name: "玉器",       color: "#4f9d74", icon: "p_jade",     desc: "温润而有光泽的美石,被古人视为品德与祥瑞的象征。" },
    stone:    { name: "石雕石刻",   color: "#9aa0a6", icon: "p_stone",    desc: "以汉白玉、青石雕刻的造像、碑刻与建筑构件。" },
    lacquer:  { name: "漆器",       color: "#8e3b46", icon: "p_lacquer",  desc: "以大漆髹涂的器物,耐腐蚀、光亮华美。" },
    textile:  { name: "纺织品",     color: "#c060a8", icon: "p_textile",  desc: "丝绸、锦缎与刺绣,体现古代的纺织智慧。" },
    wood:     { name: "竹木牙角器", color: "#9c6b3f", icon: "p_wood",     desc: "竹、木、牙、角雕成的器物,取材自然,温润精巧。" },
    painting: { name: "书画",       color: "#5b6cab", icon: "p_painting", desc: "纸绢上的笔墨丹青与碑帖文献,承载历史与文人的情志。" },
    glass:    { name: "玻璃器",     color: "#6fa8dc", icon: "p_glass",    desc: "以玻璃熔制或镶嵌的器物,晶莹剔透,经丝路传入中原。" }
  },
  secondary: {
    household:  { name: "生活用具", color: "#c26b3f", icon: "s_household",  desc: "饮食起居的日常器具,与古人生活最贴近。" },
    mingqi:     { name: "陪葬明器", color: "#8a8175", icon: "s_mingqi",     desc: "随葬的模型器物,寄托事死如生的观念。" },
    ritual:     { name: "礼器",     color: "#7d5a9e", icon: "s_ritual",     desc: "用于祭祀与礼仪的重器,代表身份与秩序。" },
    document:   { name: "文献档案", color: "#4a5a6a", icon: "s_document",   desc: "书籍、文书、卷帙与档案,是历史最直接的记录。" },
    seal:       { name: "印章",     color: "#b5432f", icon: "s_seal",       desc: "刻有文字、用作凭信的玺印,是身份的凭证。" },
    instrument: { name: "乐器",     color: "#b5762a", icon: "s_instrument", desc: "用于礼乐与娱乐,声动千年。" },
    tool:       { name: "生产工具", color: "#7a8b53", icon: "s_tool",       desc: "农具与匠作用具,是古代生产力的见证。" },
    religion:   { name: "宗教文物", color: "#8a6d3b", icon: "s_religion",   desc: "佛道造像、法器与供养之物,寄托信仰。" },
    weapon:     { name: "兵器",     color: "#5c6b7a", icon: "s_weapon",     desc: "征战与防身的装备。" },
    currency:   { name: "货币",     color: "#c9a227", icon: "s_currency",   desc: "流通于市井的钱币,是经济的血脉。" }
  }
};

/* 打卡站点(「第零站 · 华夏」为隐藏款:集齐其余全部站点的精灵后才开启捕捉;条目放在十二站之后,仅影响展示顺序) */
const STATIONS = [
  {
    id: "cangzhou",
    order: 1,
    name: "第一站 · 沧州",
    subtitle: "铁狮子与它的伙伴们",
    place: "河北 · 沧州",
    intro: "在渤海之滨的沧州,沉睡了千年的铁狮子与它的伙伴们,正等着你去唤醒。举起相机,拍下它们,文物就会化作精灵。",
    spiritIds: ["tielion", "baozhen", "baiyulion", "longhu", "lvyoutaozhu"]
  },
  {
    id: "baoding",
    order: 2,
    name: "第二站 · 保定",
    subtitle: "满城汉墓的宝藏",
    place: "河北 · 保定",
    intro: "1968 年,河北满城陵山的中山靖王刘胜墓与王后窦绾墓被发掘。金缕玉衣、长信宫灯、错金博山炉……两千年前的西汉,在这里重见天日。",
    spiritIds: ["changxin", "jinyuyi", "yubi", "boshanlu"]
  },
  {
    id: "zhangjiakou",
    order: 3,
    name: "第三站 · 张家口",
    subtitle: "从红山玉龙到金元宫殿",
    place: "河北 · 张家口",
    intro: "从五千年前的红山玉猪龙,到金代行宫的铜坐龙、元代中都的白玉螭首,再到蔚州汉墓里的环保雁鱼灯——张家口地处草原与中原的交汇处,装着一部立体的北方史书。",
    spiritIds: ["yuzhulong", "yanyudeng", "tongzuolong", "chishou"]
  },
  {
    id: "shijiazhuang",
    order: 4,
    name: "第四站 · 石家庄",
    subtitle: "战国中山国的王陵宝藏",
    place: "河北 · 石家庄",
    intro: "1977 年,平山县三汲乡的中山王墓被发掘。铁足铜鼎、十五连盏铜灯、四龙四凤方案座、虎噬鹿屏风座——一个曾被史书一笔带过的古国,带着满墓宝藏重见天日。",
    spiritIds: ["tiezuding", "lianzhandeng", "longfengfan", "hushilu"]
  },
  {
    id: "xingtai",
    order: 5,
    name: "第五站 · 邢台",
    subtitle: "从商代铜爵到宋代瓷童",
    place: "河北 · 邢台",
    intro: "邢台有三千五百年的建城史,商代这里是「邢」地重镇。南和左村汉墓的错金铜壶与三轮温炉、南小汪工地问世的「耳为父癸」铜爵、鎏金盘龙座博山炉,再到宋代磁州窑的坐形瓷童——一城之中,藏着三千年的器物与烟火。",
    spiritIds: ["tongjue", "cuojinhu", "wenlu", "liujinlu", "tongzi"]
  },
  {
    id: "chengde",
    order: 6,
    name: "第六站 · 承德",
    subtitle: "避暑山庄与外八庙的金色回忆",
    place: "河北 · 承德",
    intro: "一座山庄,半部清史。康熙、乾隆两朝在承德营建避暑山庄与外八庙,土尔扈特部东归、六世班禅觐见都发生在这里。从辽代契丹人的鸡腿瓶,到万法归一殿金顶上漂泊百年归来的凤凰脊兽——承德的文物,讲的是「合内外之心」的故事。",
    spiritIds: ["jituiping", "jishou", "zongkaba", "jixiangtianmu"]
  },
  {
    id: "tangshan",
    order: 7,
    name: "第七站 · 唐山",
    subtitle: "燕山南麓的时光印记",
    place: "河北 · 唐山",
    intro: "唐山北依燕山、南临渤海,四万年前就有纳玛象在这里漫步,战国时这片土地属于燕国的东境。新石器时代的彩陶壶、燕国武士的铜戈、汉代的绿釉陶楼、唐三彩镇墓兽——四件文物串起从远古到盛唐的时光,也为这座「北方瓷都」写下更早的开篇。",
    spiritIds: ["caitaohu", "tongge", "lvyoutaolou", "zhenmushou"]
  },
  {
    id: "qinhuangdao",
    order: 8,
    name: "第八站 · 秦皇岛",
    subtitle: "孤竹故地 · 海岳明珠",
    place: "河北 · 秦皇岛",
    intro: "北依燕山、南襟渤海,商代这里是孤竹古国的封地,秦代「碣石」由此入海。商代铜簋、唐代彩绘陶骆驼、清代五彩牡丹纹罐与铜香薰——四件文物,从青铜礼乐讲到瓷彩生辉,拼出一座「海岳明珠」之城。",
    spiritIds: ["tonggui", "caihuiluotuo", "mudanguan", "tongxiangxun"]
  },
  {
    id: "langfang",
    order: 9,
    name: "第九站 · 廊坊",
    subtitle: "京畿门户 · 佛光窑火",
    place: "河北 · 廊坊",
    intro: "地处京津之间的京畿门户,是中原通往幽燕的走廊。北魏太和十一年的石造像、唐代隆福寺的长明灯楼、三彩柿蒂纹长方枕与铜鎏金菩萨坐像——佛光与窑火在此相遇,讲述这片土地的千年往事。",
    spiritIds: ["taihezaoxiang", "changmingdenglou", "liujinpusa", "shidizhen"]
  },
  {
    id: "handan",
    order: 10,
    name: "第十站 · 邯郸",
    subtitle: "三千年赵都的赵风窑火",
    place: "河北 · 邯郸",
    intro: "「邯郸」之名,三千多年未改。它是战国赵国的都城,也是磁州窑的故乡。赵王陵出土的透雕螭龙纹金牌饰、东汉张庄桥的刻度天禄架熨斗、元代白地黑花「时苗留犊」瓷枕——三件文物,照见一座古都的赵风窑火。",
    spiritIds: ["jinpaishi", "tianluyundou", "shimiaozhen"]
  },
  {
    id: "hengshui",
    order: 11,
    name: "第十一站 · 衡水",
    subtitle: "汉家屋檐与北朝莲花",
    place: "河北 · 衡水",
    intro: "衡水古属冀州,地处河北东南。汉代的屋檐上刻着「长乐未央」的吉祥话,阜城的汉墓里立着两米高的五层陶楼,景县封氏墓群中更开出了青瓷莲花——三件文物,从汉朝一路讲到北朝。",
    spiritIds: ["lianhuazun", "taolou", "wadang"]
  },
  {
    id: "guobo",
    order: 12,
    name: "第十二站 · 国博",
    subtitle: "一座国博,半部中国史",
    place: "北京 · 中国国家博物馆",
    intro: "天安门广场东侧的国家文化客厅,收藏着 140 余万件中国记忆:后母戊鼎、四羊方尊们从课本里走出来,等着你在这一站,把「镇馆天团」一一唤醒。",
    spiritIds: ["houmuwuding", "siyangfangzun", "xizun", "xiangdou", "baohuadeng", "shuochangyong", "sancailuotuo"]
  },
  {
    id: "huaxia",
    order: 0,
    name: "第零站 · 华夏",
    subtitle: "上下五千年 · 一朝一精灵",
    place: "华夏 · 上下五千年",
    secret: true,
    intro: "从二里头的第一缕铜光,到清宫案头的碧玉凤鸟——十六件镇馆之宝,牵着华夏五千年的心跳。集齐其余十二站的精灵,这条「历史长河」才会向你开启。",
    slots: ["夏", "商", "西周", "东周", "秦", "汉", "三国", "西晋", "南北朝", "隋", "唐", "五代", "宋", "元", "明", "清"],
    spiritIds: ["xiapaishi", "fuxiaozun", "dengxizun", "shuangyangzun", "bingmayong", "shuanglongbi", "pianjiangjunyin", "jinhouniaozun", "longfengpei", "duoguxinyin", "zoulong", "daoliuhu", "yunlongpei", "shuangchibei", "longfenglu", "yanshidi"]
  }
];

/* 精灵图鉴
   ★ 新增精灵时的硬性要求(前后端都要有):
     1) history 里必须出现「出土 / 发掘 / 发现 / 原址 / 来历」等出处信息
     2) knowledge 里必须有一条问答,keys 含「出土 / 挖掘 / 挖出 / 考古 / 来历」
     3) quiz 至少 5 题;comic 至少 3 幕
  4) 立绘放在 精灵\<站点>\<id>.webp(如 精灵\保定\changxin.webp、精灵\张家口\yuzhulong.webp);
     不分站的通用精灵(五铢钱等)直接放 精灵\<id>.webp,此时写 dir: ""
     tools\check_js.py 会自动校验前三条,缺了会直接报错 */
const SPIRITS = {

  wuzhuqian: {
    id: "wuzhuqian",
    name: "五铢钱",
    alias: "汉代铜钱",
    primary: "bronze",
    secondary: "currency",
    starter: true,
    era: "西汉 · 汉武帝元狩五年(公元前118年)始铸",
    relicName: "五铢钱",
    intro: "方孔圆钱,在中国流通了七百多年,是寿命最长的古钱之一。"
  },

  qinghuaci: {
    id: "qinghuaci",
    name: "青花瓷",
    alias: "白地蓝花瓷",
    primary: "ceramic",
    secondary: "household",
    starter: true,
    era: "元代成熟,明清鼎盛",
    relicName: "青花瓷",
    intro: "白地蓝花,钴料入画,高温一次烧成,是走向世界的中国名片。"
  },

  yuzhui: {
    id: "yuzhui",
    name: "玉坠",
    alias: "玉佩",
    primary: "jade",
    secondary: "household",
    starter: true,
    era: "新石器时代至今",
    relicName: "玉坠 / 玉佩",
    intro: "温润的美石,佩在身上,也被视为品德的象征。"
  },

  jinqi: {
    id: "jinqi",
    name: "金器",
    alias: "黄金器物",
    primary: "gold",
    secondary: "household",
    starter: true,
    era: "商周至今",
    relicName: "金器",
    intro: "黄金打成的器物,色泽恒久、延展性极好,自古就是富足与身份的象征。"
  },

  yinqi: {
    id: "yinqi",
    name: "银器",
    alias: "白银器物",
    primary: "gold",
    secondary: "household",
    starter: true,
    era: "战国至今",
    relicName: "银器",
    intro: "白银打成的器物,光泽清冷、易于錾刻,常作酒器、食器与装饰。"
  },

  xuanzhi: {
    id: "xuanzhi",
    name: "宣纸",
    alias: "泾县纸",
    primary: "painting",
    secondary: "document",
    starter: true,
    era: "唐代起源,历代传承",
    relicName: "宣纸",
    intro: "产于安徽泾县(古属宣州)的传统手工纸,润墨耐折,是书画与文献的良伴。"
  },

  xiangqi: {
    id: "xiangqi",
    name: "象棋",
    alias: "中国象棋",
    primary: "wood",
    secondary: "household",
    starter: true,
    era: "宋代定型,流传至今",
    relicName: "象棋",
    intro: "棋盘九列十行、三十二枚棋子,方寸之间演练攻守,是流传千年的智力游戏。"
  },

  tielion: {
    id: "tielion",
    name: "沧州铁狮子",
    alias: "镇海吼",
    primary: "bronze",
    secondary: "religion",
    era: "后周广顺三年(953年)",
    relicName: "沧州铁狮子",
    intro: "现存最大的古代铸铁艺术品之一,张口怒吼千年,镇守沧州。"
  },

  baozhen: {
    id: "baozhen",
    name: "错金豹镇",
    alias: "汉代席镇",
    primary: "bronze",
    secondary: "household",
    era: "汉代",
    relicName: "汉代错金豹镇",
    intro: "青铜铸豹,错金为纹,压在席角的小小猛兽。"
  },

  baiyulion: {
    id: "baiyulion",
    name: "白玉蹲狮",
    alias: "唐代玉狮",
    primary: "jade",
    secondary: "religion",
    era: "唐代",
    relicName: "唐 · 白玉蹲狮",
    intro: "温润白玉,雕成雄狮,唐代的瑞兽与雅趣。"
  },

  longhu: {
    id: "longhu",
    name: "青釉堆贴花龙冰壶",
    alias: "青瓷龙纹壶",
    primary: "ceramic",
    secondary: "household",
    era: "唐代",
    relicName: "青釉堆贴花龙冰壶",
    intro: "青绿釉色,堆塑贴花,壶身盘绕着一条立体的龙。"
  },

  lvyoutaozhu: {
    id: "lvyoutaozhu",
    name: "绿釉陶猪",
    alias: "汉代的小猪",
    primary: "ceramic",
    secondary: "mingqi",
    era: "汉代",
    relicName: "汉 · 绿釉陶猪",
    intro: "圆滚滚的陶猪,披着一身绿釉。汉代人「事死如生」,把它请进墓葬,为墓主在另一个世界备好肉食;它是沧州博物馆的特色藏品。"
  },

  changxin: {
    id: "changxin",
    name: "长信宫灯",
    dir: "保定",
    alias: "中华第一灯",
    primary: "bronze",
    secondary: "household",
    era: "西汉 · 公元前2世纪",
    relicName: "西汉 · 长信宫灯",
    intro: "一尊通体鎏金的铜灯,跪坐的宫女双手举灯,衣袖里藏着排烟的烟道。"
  },

  jinyuyi: {
    id: "jinyuyi",
    name: "刘胜金缕玉衣",
    dir: "保定",
    alias: "汉代殓服",
    primary: "jade",
    secondary: "mingqi",
    era: "西汉 · 公元前2世纪",
    relicName: "西汉 · 刘胜金缕玉衣",
    intro: "用两千多片玉、一千多克金丝编成的殓服,汉代人相信玉能让身体不朽。"
  },

  yubi: {
    id: "yubi",
    name: "透雕双龙白玉璧",
    dir: "保定",
    alias: "双龙玉璧",
    primary: "jade",
    secondary: "ritual",
    era: "西汉 · 公元前2世纪",
    relicName: "西汉 · 透雕双龙白玉璧",
    intro: "白玉琢成的圆璧,璧面满饰谷纹,上端透雕两条盘绕的龙。"
  },

  boshanlu: {
    id: "boshanlu",
    name: "错金铜博山炉",
    dir: "保定",
    alias: "熏香炉",
    primary: "bronze",
    secondary: "household",
    era: "西汉 · 公元前2世纪",
    relicName: "西汉 · 错金铜博山炉",
    intro: "炉盖高耸如仙山,错金云气间藏着人兽,焚香时烟从山峦间袅袅升起。"
  },

  yuzhulong: {
    id: "yuzhulong",
    name: "红山文化玉猪龙",
    dir: "张家口",
    alias: "五千年前的龙",
    primary: "jade",
    secondary: "ritual",
    era: "新石器时代 · 红山文化(距今约6500—5000年)",
    relicName: "红山文化 · 玉猪龙",
    intro: "龙体蜷曲如环、首尾相衔,大耳圆眼、吻部前突,是红山文化最标志性的玉礼器。"
  },

  yanyudeng: {
    id: "yanyudeng",
    name: "西汉青铜彩绘雁鱼灯",
    dir: "张家口",
    alias: "汉代环保灯",
    primary: "bronze",
    secondary: "household",
    era: "西汉",
    relicName: "西汉 · 彩绘雁鱼铜灯",
    intro: "回首衔鱼的大雁造型铜灯,烟气顺着鱼身、雁颈沉进雁腹的水里,被誉为汉代的「环保灯」。"
  },

  tongzuolong: {
    id: "tongzuolong",
    name: "金代铜坐龙",
    dir: "张家口",
    alias: "行宫里的铜龙",
    primary: "bronze",
    secondary: "household",
    era: "金代(1115—1234年)",
    relicName: "金 · 铜坐龙",
    intro: "踞坐昂首的小铜龙,出土于崇礼太子城——一座金代皇家行宫遗址,如今就在冬奥赛区旁。"
  },

  chishou: {
    id: "chishou",
    name: "元中都汉白玉螭首",
    dir: "张家口",
    alias: "宫殿排水兽",
    primary: "stone",
    secondary: "household",
    era: "元 · 大德十一年(1307年)后",
    relicName: "元 · 汉白玉螭首",
    intro: "元中都宫殿台基上的汉白玉螭首,龙首高昂、张口露齿,原本是皇家建筑的排水口。"
  },

  tiezuding: {
    id: "tiezuding",
    name: "中山王铁足铜鼎",
    dir: "石家庄",
    alias: "战国第一鼎",
    primary: "bronze",
    secondary: "ritual",
    era: "战国 · 中山王厝墓",
    relicName: "战国 · 中山王铁足铜鼎",
    intro: "铜身铁足的大鼎,鼎身刻着 469 字长篇铭文,是目前发现的最大的战国铜鼎。"
  },

  lianzhandeng: {
    id: "lianzhandeng",
    name: "十五连盏铜灯",
    dir: "石家庄",
    alias: "青铜神树灯",
    primary: "bronze",
    secondary: "household",
    era: "战国 · 中山王墓",
    relicName: "战国 · 十五连盏铜灯",
    intro: "像一棵大树一样的青铜灯:枝头挑着十五盏灯盘,树上还攀着猴子和小鸟。"
  },

  longfengfan: {
    id: "longfengfan",
    name: "错金银四龙四凤铜方案座",
    dir: "石家庄",
    alias: "龙凤铜案",
    primary: "bronze",
    secondary: "household",
    era: "战国 · 中山王墓",
    relicName: "战国 · 错金银四龙四凤铜方案座",
    intro: "四条龙、四只凤盘绕成的案座,通体错金银,底座由四只梅花鹿稳稳托起。"
  },

  hushilu: {
    id: "hushilu",
    name: "错金银虎噬鹿屏风座",
    dir: "石家庄",
    alias: "猛虎扑鹿",
    primary: "bronze",
    secondary: "household",
    era: "战国 · 中山王墓",
    relicName: "战国 · 错金银虎噬鹿屏风座",
    intro: "猛虎扑住小鹿的一瞬间被铸成青铜,通体错金银,是中山王屏风的底座。"
  },

  tongjue: {
    id: "tongjue",
    name: "「耳为父癸」铜爵",
    dir: "邢台",
    alias: "商代铭文酒杯",
    primary: "bronze",
    secondary: "ritual",
    era: "商代",
    relicName: "商 · 「耳为父癸」铭兽首鋬兽面纹铜爵",
    intro: "商代的青铜酒爵,柱上铸着铭文「耳为父癸」——一个名叫「耳」的人,为亡父「癸」铸造了它。1992 年出土于邢台南小汪的一处建筑工地。"
  },

  cuojinhu: {
    id: "cuojinhu",
    name: "错金四神几何纹长颈铜壶",
    dir: "邢台",
    alias: "错金酒壶",
    primary: "bronze",
    secondary: "household",
    era: "汉代",
    relicName: "汉 · 错金四神几何纹长颈铜壶",
    intro: "通体错金的长颈铜壶:颈、肩、腹上错着蝉纹、几何纹与四神纹。1976 年出土于邢台南和左村汉墓,是邢台博物馆的一级文物。"
  },

  wenlu: {
    id: "wenlu",
    name: "三轮盘附觞铜温炉",
    dir: "邢台",
    alias: "会走路的温酒炉",
    primary: "bronze",
    secondary: "household",
    era: "汉代",
    relicName: "汉 · 三轮盘附觞铜温炉",
    intro: "会「走路」的汉代温酒炉:炉上架着耳杯,炉下装着三个小轮,兽柄拉环一拽,就能拖着满炉热酒四处走。1976 年出土于邢台南和左村汉墓。"
  },

  liujinlu: {
    id: "liujinlu",
    name: "鎏金盘龙座铜博山炉",
    dir: "邢台",
    alias: "会吐仙气的香炉",
    primary: "bronze",
    secondary: "household",
    era: "汉代",
    relicName: "汉 · 鎏金盘龙座铜博山炉",
    intro: "通体鎏金的汉代香炉:山形盖上镂着云气,细长的炉身下,盘着一条昂首的龙。1976 年出土于邢台南和左村汉墓。"
  },

  tongzi: {
    id: "tongzi",
    name: "白釉黑花坐形童子像",
    dir: "邢台",
    alias: "磁州窑瓷童",
    primary: "ceramic",
    secondary: "household",
    era: "宋代",
    relicName: "宋 · 磁州窑白釉黑花坐形童子像",
    intro: "白白胖胖的瓷童子:黑釉点出头发、眉毛、眼睛,是宋代磁州窑的小瓷塑。1979 年由邢台隆尧县双碑村村民张明堂捐赠入藏。"
  },

  jituiping: {
    id: "jituiping",
    name: "辽代茶叶末釉鸡腿瓶",
    dir: "承德",
    alias: "马背上的贮酒瓶",
    primary: "ceramic",
    secondary: "household",
    era: "辽代(907—1125年)",
    relicName: "辽 · 茶叶末釉鸡腿瓶",
    intro: "契丹人马上携行的贮酒器:小口、长圆腹、小平底,形似鸡腿,釉色像茶叶末。辽墓中常有出土,是辽代陶瓷的代表器形。"
  },

  jishou: {
    id: "jishou",
    name: "铜鎏金凤凰脊兽",
    dir: "承德",
    alias: "屋顶上的金凤凰",
    primary: "bronze",
    secondary: "household",
    era: "清代 · 乾隆年间",
    relicName: "清乾隆 · 铜鎏金凤凰脊兽",
    intro: "它曾在普陀宗乘之庙万法归一殿的金顶上蹲守:高 31.5 厘米,脚底刻着「西南、祥六」。20 世纪初被盗,漂泊百年,2021 年在厦门被查获,2025 年终于回到承德。"
  },

  zongkaba: {
    id: "zongkaba",
    name: "铜鎏金宗喀巴像",
    dir: "承德",
    alias: "格鲁派祖师像",
    primary: "bronze",
    secondary: "religion",
    era: "清代",
    relicName: "清 · 铜鎏金宗喀巴像",
    intro: "头戴黄帽、结说法印的藏传佛教格鲁派创始人宗喀巴:双肩莲茎上托着经书与宝剑。清代承德外八庙里,供奉着许多这样的宫廷造像。"
  },

  jixiangtianmu: {
    id: "jixiangtianmu",
    name: "清代铜吉祥天母像",
    dir: "承德",
    alias: "骑骡子的护法神",
    primary: "bronze",
    secondary: "religion",
    era: "清代",
    relicName: "清 · 铜吉祥天母像",
    intro: "藏传佛教著名的女性护法神吉祥天母(班丹拉姆):传说她骑着黄骡巡行三界,在拉萨被尊为古城的守护神。承德外八庙里,供奉着许多藏传佛教的护法像。"
  },

  caitaohu: {
    id: "caitaohu",
    name: "半山彩陶壶",
    dir: "唐山",
    alias: "爱画圈圈的小陶壶",
    primary: "ceramic",
    secondary: "household",
    era: "新石器时代",
    relicName: "新石器时代 · 半山类型四大圈菱形网格纹彩陶壶",
    intro: "它是四千多年前黄河上游的「彩绘大师」:红黑两彩画满全身,四个大圆圈套着菱形网格。半山先民的一只日常陶壶,却画出了让今天的设计师都惊叹的图案。"
  },

  tongge: {
    id: "tongge",
    name: "三穿直内铜戈",
    dir: "唐山",
    alias: "皱着眉的老兵器",
    primary: "bronze",
    secondary: "weapon",
    era: "战国",
    relicName: "战国 · 三穿直内铜戈",
    intro: "戈是先秦战场上的主力长兵器,「干戈」一词就是它留下的。这件铜戈有胡、三穿、直内——燕国工匠的严谨,都刻在它的线条里。"
  },

  lvyoutaolou: {
    id: "lvyoutaolou",
    name: "绿釉陶楼",
    dir: "唐山",
    alias: "住着小人的陶楼",
    primary: "ceramic",
    secondary: "mingqi",
    era: "汉代",
    relicName: "汉 · 绿釉陶楼",
    intro: "汉代人相信「事死如生」,于是把高楼也搬进了墓葬。这座绿釉陶楼层层出檐,楼里还塑着小人——那是两千年前的「全家福」。"
  },

  zhenmushou: {
    id: "zhenmushou",
    name: "唐三彩镇墓兽",
    dir: "唐山",
    alias: "守在墓门口的神兽",
    primary: "ceramic",
    secondary: "mingqi",
    era: "唐代",
    relicName: "唐 · 三彩镇墓兽",
    intro: "它是唐代墓葬的「门神」:往墓门旁一蹲,邪祟就不敢靠近。黄、绿、白三色釉在身上流淌交融,那是烧出来的盛唐气象。"
  },

  tonggui: {
    id: "tonggui",
    name: "商代铜簋",
    dir: "秦皇岛",
    alias: "装着饭香的小铜簋",
    primary: "bronze",
    secondary: "ritual",
    era: "商代",
    relicName: "商 · 乳钉纹铜簋",
    intro: "它是商代贵族宴席上的「饭碗」:和鼎搭伴出场,盛满热腾腾的黍米饭。满身小乳钉与云雷纹,是三千多年前青铜礼器的模样。"
  },

  caihuiluotuo: {
    id: "caihuiluotuo",
    name: "唐代彩绘陶骆驼",
    dir: "秦皇岛",
    alias: "走丝路的小骆驼",
    primary: "ceramic",
    secondary: "mingqi",
    era: "唐代",
    relicName: "唐 · 彩绘陶骆驼",
    intro: "一峰双峰驼,从西域的商道上走来。它背驮货囊、颈挂响铃,彩绘虽已斑驳,却还记得盛唐丝路的车马声。"
  },

  mudanguan: {
    id: "mudanguan",
    name: "清代五彩牡丹纹罐",
    dir: "秦皇岛",
    alias: "开满牡丹的小瓷罐",
    primary: "ceramic",
    secondary: "household",
    era: "清代",
    relicName: "清 · 五彩牡丹纹罐",
    intro: "白釉为地,釉上开花:红牡丹热热闹闹地开满罐身。清代五彩瓷把「花开富贵」,画进了最家常的器物里。"
  },

  tongxiangxun: {
    id: "tongxiangxun",
    name: "清代铜香薰",
    dir: "秦皇岛",
    alias: "会吐烟的小瑞兽",
    primary: "bronze",
    secondary: "household",
    era: "清代",
    relicName: "清 · 铜香薰",
    intro: "蹲坐的小瑞兽,背上驮着一只小花瓶——那不是装饰,是烟囱。点上一炷香,云烟从瓶口袅袅升起,屋子就有了安定的气味。"
  },

  taihezaoxiang: {
    id: "taihezaoxiang",
    name: "太和十一年佛造像",
    dir: "廊坊",
    alias: "刻着许愿文的石头佛",
    primary: "stone",
    secondary: "religion",
    era: "北魏",
    relicName: "北魏 · 太和十一年石造像",
    intro: "一块青石,正面雕着微笑的佛与两尊菩萨;背面刻着「太和十一年」的许愿文。它是廊坊土地上最早的佛教记忆之一。"
  },

  changmingdenglou: {
    id: "changmingdenglou",
    name: "隆福寺长明灯楼",
    dir: "廊坊",
    alias: "举着一盏灯的石塔",
    primary: "stone",
    secondary: "religion",
    era: "唐代",
    relicName: "唐 · 隆福寺长明灯楼",
    intro: "八角石柱上刻满佛像与伎乐,顶端托起一盏「长明灯」。它是国内现存纪年最早的唐代石灯,稳稳立在廊坊博物馆大厅正中。"
  },

  liujinpusa: {
    id: "liujinpusa",
    name: "铜鎏金菩萨坐像",
    dir: "廊坊",
    alias: "披着金衣的菩萨",
    primary: "bronze",
    secondary: "religion",
    era: "唐代",
    relicName: "唐 · 铜鎏金菩萨坐像",
    intro: "小小的铜菩萨,端端正正结跏趺坐,周身鎏金。鎏金不是涂金漆——是把金子真正「烘」进铜面,千年不褪。"
  },

  shidizhen: {
    id: "shidizhen",
    name: "三彩柿蒂纹长方枕",
    dir: "廊坊",
    alias: "开满柿蒂花的小枕头",
    primary: "ceramic",
    secondary: "household",
    era: "唐代",
    relicName: "唐 · 三彩柿蒂纹长方枕",
    intro: "黄、绿、白三色釉在小枕头上流淌,枕面开满柿蒂花。唐代人枕着它入睡——凉丝丝的,据说还能「明目益睛」。"
  },

  jinpaishi: {
    id: "jinpaishi",
    name: "透雕螭龙纹金牌饰",
    dir: "邯郸",
    alias: "胸前挂过的金牌",
    primary: "gold",
    secondary: "household",
    era: "战国",
    relicName: "战国 · 透雕螭龙纹金牌饰",
    intro: "巴掌大的金牌,透雕两条昂首的螭龙,四角卷云环绕,背面还有穿鼻。它以金铜合金铸成,是先秦金器中的稀世精品。"
  },

  tianluyundou: {
    id: "tianluyundou",
    name: "刻度天禄架熨斗",
    dir: "邯郸",
    alias: "顶着神兽的小熨斗",
    primary: "bronze",
    secondary: "household",
    era: "东汉",
    relicName: "东汉 · 刻度天禄架熨斗",
    intro: "会站立的青铜熨斗:细长支架上蹲着瑞兽「天禄」,斗身插在架中;斗上还带刻度,在汉代熨斗里极为罕见。"
  },

  shimiaozhen: {
    id: "shimiaozhen",
    name: "白地黑花「时苗留犊」瓷枕",
    dir: "邯郸",
    alias: "会讲清廉故事的瓷枕",
    primary: "ceramic",
    secondary: "household",
    era: "元代",
    relicName: "元 · 白地黑花「时苗留犊」瓷枕",
    intro: "白底黑花,松树下一辆牛车。它画的是东汉清官时苗离任留犊的故事——磁州窑把「做官的道理」,画在了枕头上。"
  },

  lianhuazun: {
    id: "lianhuazun",
    name: "青釉仰覆莲花尊",
    dir: "衡水",
    alias: "开满莲花的青瓷大尊",
    primary: "ceramic",
    secondary: "religion",
    era: "北齐",
    relicName: "北齐 · 青釉仰覆莲花尊",
    intro: "它像一朵立起来的大莲花:盖是花,腹是花,层层莲瓣从口沿开到足底。北朝工匠以青釉塑莲,把清净化进瓷土,烧成了这件高大庄重的大器。"
  },

  taolou: {
    id: "taolou",
    name: "东汉绿釉陶楼",
    dir: "衡水",
    alias: "两米高的绿瓦小楼",
    primary: "ceramic",
    secondary: "mingqi",
    era: "东汉",
    relicName: "东汉 · 绿釉陶楼",
    intro: "台基、门楼、五层楼阁,一气烧进一捧陶土,通高足有 2.16 米。这座东汉「豪宅」是随葬的明器,却把汉代楼阁的样子,原原本本留给了两千年后的我们。"
  },

  wadang: {
    id: "wadang",
    name: "汉代「长乐未央」瓦当",
    dir: "衡水",
    alias: "刻着吉祥话的圆瓦",
    primary: "ceramic",
    secondary: "household",
    era: "汉代",
    relicName: "汉 · 「长乐未央」文字瓦当",
    intro: "一片灰色的圆瓦,十字界格分出四格,刻着四个吉祥字:长、乐、未、央——长久欢乐,没有尽头。四角卷云舒卷,替这句话配上了风与云。"
  },

  houmuwuding: {
    id: "houmuwuding",
    name: "商代「后母戊」青铜鼎",
    dir: "国博",
    alias: "商代青铜礼器之王",
    primary: "bronze",
    secondary: "ritual",
    era: "商代后期",
    relicName: "商 · 「后母戊」青铜鼎",
    intro: "一只双手合抱都抱不拢的大鼎,重达八百多公斤,两条立耳如同巨门,鼎腹上藏着一对巨大的兽面纹「眼睛」。三千年前它是祭祀礼器,今天它是中国最重的青铜鼎。"
  },

  siyangfangzun: {
    id: "siyangfangzun",
    name: "商代四羊方尊",
    dir: "国博",
    alias: "肩扛四只羊的青铜方尊",
    primary: "bronze",
    secondary: "ritual",
    era: "商代后期",
    relicName: "商 · 四羊方尊",
    intro: "方方正正的尊肩上,四只卷角羊从容探出脑袋,仿佛是从青铜里长出来的生灵。它是商代青铜铸造的极限之作,被称为「臻于极致的青铜典范」。"
  },

  xizun: {
    id: "xizun",
    name: "西汉错金银云纹青铜犀尊",
    dir: "国博",
    alias: "披着金银花纹的犀牛酒尊",
    primary: "bronze",
    secondary: "household",
    era: "西汉",
    relicName: "西汉 · 错金银云纹青铜犀尊",
    intro: "一头昂着双角的青铜犀牛,浑身流淌着金色的云纹。它背上藏着一扇小盖——它不只是雕像,它是一只可以开合盛酒的酒尊。"
  },

  xiangdou: {
    id: "xiangdou",
    name: "西汉鎏金镶斗",
    dir: "国博",
    alias: "金光灿灿的鎏金铜器",
    primary: "bronze",
    secondary: "household",
    era: "西汉",
    relicName: "西汉 · 鎏金镶斗",
    intro: "一只圆筒形的青铜器,披着完整的金衣:口沿外撇、双环耳垂立,腹侧探出一只昂首的马首,底下三只蹄足稳稳落地——两千年前的金光,至今依然亮晶晶。"
  },

  baohuadeng: {
    id: "baohuadeng",
    name: "东汉彩绘陶百花灯",
    dir: "国博",
    alias: "开出十三盏灯的陶灯树",
    primary: "ceramic",
    secondary: "mingqi",
    era: "东汉",
    relicName: "东汉 · 彩绘陶百花灯",
    intro: "一株陶做的「树」:灯柱上十二支曲枝分三层伸展开来,枝头各托一盏小灯,顶端再坐一盏——一共十三盏。点亮时,就是一树的人间烟火。"
  },

  shuochangyong: {
    id: "shuochangyong",
    name: "东汉击鼓说唱俑",
    dir: "国博",
    alias: "手舞足蹈的说唱艺人",
    primary: "ceramic",
    secondary: "mingqi",
    era: "东汉",
    relicName: "东汉 · 击鼓说唱俑",
    intro: "他头裹小巾,额上皱纹挤成一团,笑得眼睛眯成缝;左臂环抱一只小鼓,右手举着鼓槌——你几乎能听见他马上就要喊出来的那句「好!」。"
  },

  sancailuotuo: {
    id: "sancailuotuo",
    name: "唐代三彩骆驼载乐俑",
    dir: "国博",
    alias: "驮着乐队的骆驼",
    primary: "ceramic",
    secondary: "mingqi",
    era: "唐代",
    relicName: "唐 · 三彩骆驼载乐俑",
    intro: "一头昂首的骆驼立在原地,背上却热闹得很:几名乐手围着席地而坐,琴弦与鼓点齐飞,中间一人起身起舞——一支丝路乐队,就这样被唐三彩驮了两千年。"
  },

  xiapaishi: {
    id: "xiapaishi",
    name: "嵌绿松石兽面纹铜牌饰",
    img: "精灵/朝代/立绘/xiapaishi.webp",
    alias: "胸前的绿松石兽面",
    primary: "bronze",
    secondary: "ritual",
    era: "夏代 · 二里头文化",
    relicName: "夏 · 嵌绿松石兽面纹铜牌饰",
    intro: "青铜铸出框身,数百枚细小的绿松石片严丝合缝,拼出一张威风的兽面——三千八百年前的手艺,至今一片不落。"
  },

  fuxiaozun: {
    id: "fuxiaozun",
    name: "妇好鸮尊",
    img: "精灵/朝代/立绘/fuxiaozun.webp",
    alias: "三千年的猫头鹰",
    primary: "bronze",
    secondary: "ritual",
    era: "商代晚期 · 妇好墓",
    relicName: "商 · 妇好鸮尊",
    intro: "一只站立的「猫头鹰」酒尊:昂首、垂尾、双足稳立,通体纹饰密布——它是中国目前发现最早的鸟形铜酒器之一。"
  },

  dengxizun: {
    id: "dengxizun",
    name: "邓仲牺尊",
    img: "精灵/朝代/立绘/dengxizun.webp",
    alias: "满身神兽的牺尊",
    primary: "bronze",
    secondary: "ritual",
    era: "西周中期",
    relicName: "西周 · 邓仲牺尊",
    intro: "似马非马、似羊非羊、似鹿非鹿——一只青铜神兽驮着盖子,盖顶立着凤鸟,身上还攀着小龙,一身都是动物。"
  },

  shuangyangzun: {
    id: "shuangyangzun",
    name: "双羊尊",
    img: "精灵/朝代/立绘/shuangyangzun.webp",
    alias: "背靠背的双羊",
    primary: "bronze",
    secondary: "ritual",
    era: "东周",
    relicName: "青铜双羊尊",
    intro: "两只背对背的公羊,合抱成一只筒形尊口——羊角卷曲、口鼻微张,是青铜礼器里最温驯也最奇特的造型之一。"
  },

  bingmayong: {
    id: "bingmayong",
    name: "兵马俑",
    img: "精灵/朝代/立绘/bingmayong.webp",
    alias: "千军万马的一员",
    primary: "ceramic",
    secondary: "mingqi",
    era: "秦代",
    relicName: "秦 · 兵马俑",
    intro: "我是一个陶土烧成的武士,身高一米八,两千多年前站在秦始皇陵的军阵里——千人千面,每一张脸都不一样。"
  },

  shuanglongbi: {
    id: "shuanglongbi",
    name: "透雕双龙白玉璧",
    img: "精灵/朝代/立绘/shuanglongbi.webp",
    alias: "璧上双龙",
    primary: "jade",
    secondary: "ritual",
    era: "西汉",
    relicName: "西汉 · 透雕双龙高钮谷纹白玉璧",
    intro: "一块玉璧上,两条龙昂首盘绕、腾空欲飞——汉代的玉工把「礼天」的重器,琢成了惊心动魄的艺术品。"
  },

  pianjiangjunyin: {
    id: "pianjiangjunyin",
    name: "偏将军印章",
    img: "精灵/朝代/立绘/pianjiangjunyin.webp",
    alias: "龟钮金印",
    primary: "gold",
    secondary: "seal",
    era: "三国",
    relicName: "偏将军金印",
    intro: "一方金灿灿的龟钮印章,边长只有 2.4 厘米,却盖着一位将军的全部权威——印文五个字:「偏将军印章」。"
  },

  jinhouniaozun: {
    id: "jinhouniaozun",
    name: "晋侯鸟尊",
    img: "精灵/朝代/立绘/jinhouniaozun.webp",
    alias: "凤鸟回眸",
    primary: "bronze",
    secondary: "ritual",
    era: "西晋",
    relicName: "晋 · 晋侯鸟尊",
    intro: "一只回眸的凤鸟:高冠直立、象鼻为尾,背上还停着一只小鸟——青铜酒器里,藏着一座惊喜「动物园」。"
  },

  longfengpei: {
    id: "longfengpei",
    name: "玉龙凤形佩",
    img: "精灵/朝代/立绘/longfengpei.webp",
    alias: "龙蟠凤栖",
    primary: "jade",
    secondary: "household",
    era: "南北朝",
    relicName: "六朝 · 龙凤形玉佩",
    intro: "龙曲颈卷身,凤栖在龙尾上,侧首与龙相望——小小的玉片之上,一对龙凤绕出一个温柔的环。"
  },

  duoguxinyin: {
    id: "duoguxinyin",
    name: "独孤信多面印",
    img: "精灵/朝代/立绘/duoguxinyin.webp",
    alias: "天下第一老丈人的印",
    primary: "stone",
    secondary: "seal",
    era: "隋代",
    relicName: "独孤信多面体煤精组印",
    intro: "一枚只有核桃大的煤精石,被磨成 26 个面,刻着 14 个印文——它的主人独孤信,是三个朝代的皇后之父。"
  },

  zoulong: {
    id: "zoulong",
    name: "赤金走龙",
    img: "精灵/朝代/立绘/zoulong.webp",
    alias: "掌心上的小金龙",
    primary: "gold",
    secondary: "religion",
    era: "唐代 · 何家村窖藏",
    relicName: "唐 · 赤金走龙",
    intro: "只有拇指大小,却长角长须、四足行走——这几条纯金的小龙,是大唐皇帝投给山川的「信使」。"
  },

  daoliuhu: {
    id: "daoliuhu",
    name: "耀州窑倒流壶",
    img: "精灵/朝代/立绘/daoliuhu.webp",
    alias: "三王壶",
    primary: "ceramic",
    secondary: "household",
    era: "五代 · 耀州窑",
    relicName: "五代 · 耀州窑青釉刻花提梁倒流壶",
    intro: "没有壶盖的壶:从壶底梅花孔注水,翻过来却滴水不漏——五代的耀州窑工匠,把机关藏进了壶肚子里。"
  },

  yunlongpei: {
    id: "yunlongpei",
    name: "云龙佩",
    img: "精灵/朝代/立绘/yunlongpei.webp",
    alias: "云中盘龙",
    primary: "jade",
    secondary: "household",
    era: "宋代",
    relicName: "宋 · 云龙佩",
    intro: "一条玉龙盘成圆环,身旁祥云萦绕、爪护火珠——宋代的玉工把飞龙收进一枚玉,佩在身上,便是身上有山河。"
  },

  shuangchibei: {
    id: "shuangchibei",
    name: "双螭耳玉杯",
    img: "精灵/朝代/立绘/shuangchibei.webp",
    alias: "螭虎作耳",
    primary: "jade",
    secondary: "household",
    era: "元代",
    relicName: "元 · 双螭耳玉杯",
    intro: "杯身两侧,两条螭虎攀壁而上:前爪扒住口沿,卷尾贴住杯身——元代的玉工,把野性刻进了酒杯。"
  },

  longfenglu: {
    id: "longfenglu",
    name: "青花龙凤纹三足炉",
    img: "精灵/朝代/立绘/longfenglu.webp",
    alias: "鼎式龙凤炉",
    primary: "ceramic",
    secondary: "household",
    era: "明代 · 洪武官窑",
    relicName: "明 · 青花龙凤纹三足炉",
    intro: "一只鼎式香炉:双耳朝天、三兽蹄足,青花绘着龙飞凤舞——明初官窑的气派,都装在这只炉里。"
  },

  yanshidi: {
    id: "yanshidi",
    name: "碧玉凤鸟形砚滴",
    img: "精灵/朝代/立绘/yanshidi.webp",
    alias: "案头凤鸟",
    primary: "jade",
    secondary: "document",
    era: "清代 · 宫廷文房",
    relicName: "清 · 碧玉凤鸟形砚滴",
    intro: "一只卧伏的碧玉凤鸟:腹部掏空贮水,口部藏着滴水的孔——它是皇帝书案上的砚滴,一滴一滴,给砚台续水。"
  }
};

/* 档案包(自述 / 问答 / 考点 / 来历)体积占全文件七成,已拆到 js/data-deep.js,
   首屏不再加载;需要时由 js/data-lazy.js 拉取并合并回 SPIRITS,访问写法不变。 */

/* 对战规则 */
const BATTLE = {
  spiritHp: 30,     // 精灵血量,归零 → 被捕捉
  playerHp: 6,      // 我方血量,归零 → 捕捉失败
  diceMin: 1,       // 骰子点数范围(答对时,点数 = 对精灵的伤害)
  diceMax: 6,
  wrongPenalty: 1,  // 答错:精灵直接反击,我方固定扣 1 血(不掷骰)
  captureThreshold: 0.3  // 血量降到 30% 以下(<=9 血)即可「残血捕捉」
};

/* 主属性「特性」:出战精灵的主属性,决定了它在对战里的独门本领。
   修改/新增属性时,记得在这里补一条同名 key(见 ATTRIBUTES.primary) */
const TRAITS = {
  bronze:   { name: "铜筋铁骨", desc: "上场时生命上限 +2,更耐打。" },
  gold:     { name: "锋芒毕露", desc: "每次攻击的骰子点数 +1。" },
  ceramic:  { name: "釉色生辉", desc: "掷出 5、6 点时,伤害额外 +2。" },
  jade:     { name: "温润养德", desc: "每答对 2 题,回复 1 点血。" },
  stone:    { name: "磐石之躯", desc: "30% 概率完全免疫对手的反击。" },
  lacquer:  { name: "髹漆坚韧", desc: "首次濒死时保留 1 血(每场一次)。" },
  textile:  { name: "柔韧轻盈", desc: "骰子点数保底为 2。" },
  wood:     { name: "灵巧上身", desc: "掷骰掷两次,取较大值。" },
  painting: { name: "文心雕龙", desc: "开局自动排除一个错误选项。" },
  glass:    { name: "晶莹剔透", desc: "掷出 6 点时,伤害翻倍。" }
};

/* 通用题库:AI 出题时会与精灵专属题混在一起随机抽取 */
const COMMON_QUIZ = [
  { q: "「镇海吼」指的是下列哪件文物?", options: ["司母戊鼎", "沧州铁狮子", "马踏飞燕", "曾侯乙编钟"], answer: 1, tip: "沧州铁狮子又名「镇海吼」。" },
  { q: "青花瓷的蓝色主要来自哪种原料?", options: ["铁料", "钴料", "铜料", "金粉"], answer: 1, tip: "钴料是青花呈色的关键。" },
  { q: "英文「china」除了指中国,还指什么?", options: ["丝绸", "茶叶", "瓷器", "玉器"], answer: 2, tip: "瓷器与中国同名。" },
  { q: "古人常用玉来比喻君子的什么?", options: ["财富", "品德", "权力", "容貌"], answer: 1, tip: "「君子比德于玉」。" },
  { q: "汉代人用来压住席子角的器物叫什么?", options: ["镇", "鼎", "卮", "盂"], answer: 0, tip: "「镇」是压席用具。" },
  { q: "「错金」工艺指的是?", options: ["把金熔化浇铸", "把金丝嵌入金属凹槽", "给器物刷金漆", "用金箔包裹"], answer: 1, tip: "错金是嵌金工艺。" },
  { q: "五铢钱中的「铢」是什么单位?", options: ["长度", "重量", "面积", "时间"], answer: 1, tip: "铢是古代重量单位。" },
  { q: "秦始皇兵马俑主要由什么材质制成?", options: ["青铜", "陶", "玉", "木"], answer: 1, tip: "兵马俑是陶制。" },
  { q: "中国古代四大发明中,便于书写传播的是?", options: ["造纸术", "指南针", "火药", "冶铁术"], answer: 0, tip: "造纸术推动了文化传播。" },
  { q: "后母戊鼎(司母戊鼎)是什么材质的?", options: ["陶瓷", "青铜", "玉石", "铁"], answer: 1, tip: "它是商代青铜重器。" },
  { q: "「唐三彩」主要属于哪一类器物?", options: ["瓷器", "陶器", "玉器", "漆器"], answer: 1, tip: "唐三彩是低温铅釉陶。" },
  { q: "中国最早的纸币出现在哪个朝代?", options: ["唐朝", "北宋", "明朝", "清朝"], answer: 1, tip: "北宋的交子是最早的纸币。" },
  { q: "「缂丝」属于哪一类文物?", options: ["织绣", "陶瓷", "青铜", "书画"], answer: 0, tip: "缂丝是丝织精品。" },
  { q: "甲骨文主要刻写在什么材料上?", options: ["青铜器", "龟甲兽骨", "竹简", "纸张"], answer: 1, tip: "甲骨文刻于龟甲兽骨。" },
  { q: "曾侯乙编钟是古代的什么器物?", options: ["兵器", "乐器", "礼器", "货币"], answer: 1, tip: "编钟是打击乐器。" },
  { q: "「金缕玉衣」的主要用途是?", options: ["日常穿衣", "帝王贵族丧葬", "作战护甲", "赏赐功臣"], answer: 1, tip: "玉衣是汉代高级葬服。" },
  { q: "景德镇以什么闻名于世?", options: ["丝绸", "瓷器", "玉雕", "漆器"], answer: 1, tip: "景德镇是瓷都。" },
  { q: "玉璧这种器物最典型的形状是?", options: ["方形", "圆形中间带孔", "三角形", "不规则形"], answer: 1, tip: "玉璧是圆形中间有穿孔。" },

  /* ---- 考古发现 / 出土年代(历史题) ---- */
  { q: "秦始皇兵马俑是哪一年被发现的?", options: ["1954 年", "1974 年", "1984 年", "1994 年"], answer: 1, tip: "1974 年在陕西临潼被发现。" },
  { q: "秦始皇兵马俑当年是怎么被发现的?", options: ["考古队主动发掘", "农民打井时偶然挖出", "盗墓者发现", "修路时挖出"], answer: 1, tip: "1974 年农民打井时偶然挖出陶俑碎片。" },
  { q: "曾侯乙编钟出土于哪一年?", options: ["1958 年", "1968 年", "1978 年", "1988 年"], answer: 2, tip: "1978 年出土于湖北随州曾侯乙墓。" },
  { q: "三星堆遗址位于我国哪个省?", options: ["四川", "陕西", "河南", "湖北"], answer: 0, tip: "三星堆在四川广汉。" },
  { q: "后母戊鼎(司母戊鼎)是哪一年出土的?", options: ["1899 年", "1927 年", "1939 年", "1949 年"], answer: 2, tip: "1939 年出土于河南安阳武官村。" },
  { q: "铜奔马(马踏飞燕)是在哪个省出土的?", options: ["陕西", "甘肃", "河南", "山西"], answer: 1, tip: "1969 年出土于甘肃武威雷台汉墓。" },
  { q: "甲骨文最早是被谁发现并认出的?", options: ["王国维", "王懿荣", "郭沫若", "董作宾"], answer: 1, tip: "1899 年王懿荣首先认出甲骨文。" },
  { q: "敦煌莫高窟的藏经洞是哪一年被发现的?", options: ["1860 年", "1900 年", "1911 年", "1924 年"], answer: 1, tip: "1900 年由道士王圆箓发现。" },
  { q: "著名的金缕玉衣出土于哪座墓葬?", options: ["河北满城汉墓", "陕西兵马俑坑", "河南殷墟", "湖北曾侯乙墓"], answer: 0, tip: "1968 年河北满城汉墓出土。" },
  { q: "「长信宫灯」发掘自哪座墓葬?", options: ["满城汉墓", "马王堆汉墓", "海昏侯墓", "曾侯乙墓"], answer: 0, tip: "长信宫灯出土于河北满城汉墓。" },
  { q: "良渚文化最早是在哪一年被发现的?", options: ["1916 年", "1936 年", "1956 年", "1976 年"], answer: 1, tip: "1936 年施昕更在浙江余杭良渚发现。" },
  { q: "河姆渡遗址位于我国哪个省?", options: ["江苏", "浙江", "福建", "安徽"], answer: 1, tip: "河姆渡在浙江余姚,1973 年发掘。" },
  { q: "「南海一号」是一艘什么船?", options: ["宋代远洋商船", "元代战船", "明代宝船", "清代渔船"], answer: 0, tip: "1987 年发现于广东阳江海域的宋代沉船。" },
  { q: "妇好墓是哪一年在殷墟发掘的?", options: ["1936 年", "1956 年", "1976 年", "1996 年"], answer: 2, tip: "1976 年发掘于河南安阳殷墟。" },
  { q: "出土了素纱襌衣、T 形帛画的马王堆汉墓在哪个省?", options: ["湖北", "湖南", "河南", "江西"], answer: 1, tip: "马王堆汉墓在湖南长沙,1972 年发掘。" },
  { q: "我国现存最大的古代铸铁艺术品「沧州铁狮子」,现在位于?", options: ["河北沧州", "山西太原", "山东济南", "河南洛阳"], answer: 0, tip: "它千年矗立在河北沧州,并非出土文物。" },

  /* ---- 第二站 · 保定(满城汉墓) ---- */
  { q: "满城汉墓位于我国哪个省?", options: ["河北", "河南", "陕西", "山东"], answer: 0, tip: "满城汉墓在河北保定满城的陵山。" },
  { q: "「博山炉」是汉代的什么用具?", options: ["熏香器", "酒器", "兵器", "乐器"], answer: 0, tip: "博山炉是焚香用的熏炉。" },
  { q: "玉衣按金缕、银缕、铜缕分等级,等级最高的是?", options: ["金缕", "银缕", "铜缕", "三者相同"], answer: 0, tip: "金缕玉衣等级最高。" },

  /* ---- 第三站 · 张家口 ---- */
  { q: "元中都遗址位于河北哪座城市?", options: ["保定", "张家口", "石家庄", "承德"], answer: 1, tip: "元中都在张家口张北县,与大都、上都齐名。" },
  { q: "「玉猪龙」是哪个史前文化的标志性玉器?", options: ["良渚文化", "红山文化", "龙山文化", "三星堆文化"], answer: 1, tip: "玉猪龙是红山文化的代表玉器。" },
  { q: "以「环保灯」著称的汉代雁鱼灯,把烟导入哪里?", options: ["盛水的雁腹", "屋顶夹层", "地下排水沟", "灯座夹层"], answer: 0, tip: "烟气经鱼身、雁颈进入盛水的雁腹。" },
  { q: "2025 年度全国十大考古新发现中,河北入选的是?", options: ["宣化郑家沟遗址", "元中都遗址", "满城汉墓", "太子城遗址"], answer: 0, tip: "郑家沟遗址首次在红山文化传统核心区外发现典型积石冢。" },
  { q: "张家口的蔚县,古时候被称作?", options: ["蔚州", "定州", "涿州", "冀州"], answer: 0, tip: "蔚县古称蔚州,是中原与草原往来的要地。" },

  /* ---- 第四站 · 石家庄(战国中山国) ---- */
  { q: "河北平山县三汲乡的中山王墓是哪一年被发掘的?", options: ["1957 年", "1968 年", "1977 年", "1986 年"], answer: 2, tip: "1977 年发掘,出土铁足大铜鼎、十五连盏铜灯等重器。" },
  { q: "战国中山国的王陵珍宝,如今主要收藏在哪座博物馆?", options: ["河北博物院", "陕西历史博物馆", "上海博物馆", "湖北省博物馆"], answer: 0, tip: "中山王墓文物多藏于石家庄的河北博物院。" },
  { q: "十五连盏铜灯上,一共挑着多少个灯盘?", options: ["5 个", "10 个", "15 个", "24 个"], answer: 2, tip: "「十五连盏」,共 15 个灯盘。" },
  { q: "「中山王铁足铜鼎」的鼎足是用什么铸造的?", options: ["铁", "玉", "木", "铅"], answer: 0, tip: "铜身铁足,反映战国冶铁技术的进步。" },

  /* ---- 第五站 · 邢台 ---- */
  { q: "1976 年,河北邢台南和左村汉墓出土了两件国家一级文物,它们是?", options: ["错金长颈铜壶和三轮盘附觞铜温炉", "金缕玉衣和长信宫灯", "铁足铜鼎和十五连盏铜灯", "玉猪龙和铜坐龙"], answer: 0, tip: "两件同出于南和左村汉墓,现藏邢台博物馆。" },
  { q: "商代「耳为父癸」铜爵出土于邢台的哪处工地?", options: ["南小汪公园东街住宅工地", "南和左村农田", "崇礼太子城", "张北元中都"], answer: 0, tip: "1992 年出土于邢台市南小汪公园东街住宅工地。" },
  { q: "宋代「白釉黑花」瓷器的代表窑口是?", options: ["磁州窑", "邢窑", "汝窑", "哥窑"], answer: 0, tip: "白地黑花是磁州窑的招牌手艺。" },
  { q: "邢台有 3500 年建城史,在商代它是商王朝的?", options: ["北方重镇(邢地)", "都城镐京", "海上港口", "西域边关"], answer: 0, tip: "邢台古称邢,商代即为王朝北方的重地。" },
  { q: "邢台博物馆「鎏金盘龙座铜博山炉」的底座上盘着什么?", options: ["一条龙", "一只虎", "一条蛇", "一只鹿"], answer: 0, tip: "盘龙形饰件托起细长的炉身。" },

  /* ---- 第六站 · 承德 ---- */
  { q: "承德避暑山庄始建于哪个朝代?", options: ["明朝", "清朝", "元朝", "宋朝"], answer: 1, tip: "清康熙四十二年(1703 年)开始营建,历经三朝、耗时 89 年建成。" },
  { q: "承德「外八庙」大多是哪个宗教的寺庙?", options: ["藏传佛教", "道教", "伊斯兰教", "基督教"], answer: 0, tip: "外八庙是清代为团结蒙藏而建的藏传佛教寺庙群。" },
  { q: "1780 年,六世班禅长途跋涉到承德觐见的是哪位皇帝?", options: ["康熙帝", "雍正帝", "乾隆帝", "嘉庆帝"], answer: 2, tip: "乾隆皇帝为六世班禅修建了须弥福寿之庙。" },
  { q: "2025 年回归承德的「铜鎏金凤凰脊兽」原本立在哪个殿顶上?", options: ["普陀宗乘之庙·万法归一殿", "普宁寺·大乘之阁", "故宫·太和殿", "殊像寺·会乘殿"], answer: 0, tip: "铭文「西南、祥六」正是它在万法归一殿殿顶的方位与编号。" },
  { q: "「一座山庄,半部清史」说的是哪座城市?", options: ["承德", "保定", "邯郸", "秦皇岛"], answer: 0, tip: "承德避暑山庄曾是清王朝在北京之外的第二个政治中心。" },

  /* ---- 第七站 · 唐山 ---- */
  { q: "唐山博物馆的《古代唐山》陈列,从哪一类展品开始讲起?", options: ["约 4 万年前的纳玛象门齿化石", "清代宫廷钟表", "唐代金银器", "民国股票"], answer: 0, tip: "纳玛象门齿化石出土于迁安爪村遗址,距今约 4.2 万年。" },
  { q: "唐山在战国时期属于哪个诸侯国?", options: ["燕国", "赵国", "齐国", "楚国"], answer: 0, tip: "唐山地处燕国东境,出土过大量燕国文物。" },
  { q: "「唐山皮影戏」2006 年入选了什么?", options: ["首批国家级非物质文化遗产名录", "世界自然遗产名录", "全国重点文物保护单位", "世界记忆名录"], answer: 0, tip: "唐山皮影戏是「冀东三枝花」之一,2006 年入选首批国家级非遗。" },
  { q: "唐山博物馆的《冀东三枝花》陈列,指的是哪三样?", options: ["皮影、评剧、乐亭大鼓", "剪纸、泥塑、年画", "瓷器、玉器、石雕", "石雕、木雕、砖雕"], answer: 0, tip: "冀东三枝花:皮影、评剧、乐亭大鼓。" },
  { q: "唐山素有「北方瓷都」之称,说的是唐山的什么产业?", options: ["陶瓷工业", "造船工业", "丝绸织造", "茶叶贸易"], answer: 0, tip: "唐山是中国近代陶瓷工业重镇,与瓷结缘已逾百年。" },

  /* ---- 第八站 · 秦皇岛 ---- */
  { q: "商周时期,今天的秦皇岛一带属于哪个古国?", options: ["孤竹国", "中山国", "燕国", "齐国"], answer: 0, tip: "孤竹国是商周时期河北东北部的古国,伯夷、叔齐便是孤竹君之子。" },
  { q: "秦皇岛博物馆的商代铜簋,出土于哪个遗址?", options: ["卢龙县阚各庄遗址", "北戴河海滨", "山海关老龙头", "青龙县古长城"], answer: 0, tip: "阚各庄遗址位于卢龙,是商代孤竹国区域的重要遗址。" },
  { q: "被称为「瓦当王」的秦代大型瓦当,收藏在哪座博物馆?", options: ["秦皇岛博物馆", "西安碑林博物馆", "河北博物院", "辽宁省博物馆"], answer: 0, tip: "它出土于秦皇岛,是秦代高等级建筑的用瓦。" },
  { q: "秦皇岛博物馆里,陈列着一件距今约十万年、保存非常完整的动物化石,它是?", options: ["斑鬣狗化石", "恐龙骨架", "猛犸象牙", "剑齿虎头骨"], answer: 0, tip: "它出土于板厂峪溶洞,保存相当完整。" },
  { q: "长城入海处的「天下第一关」,是哪座关城?", options: ["山海关", "居庸关", "嘉峪关", "紫荆关"], answer: 0, tip: "山海关依山襟海,号称「天下第一关」。" },

  /* ---- 第九站 · 廊坊 ---- */
  { q: "廊坊博物馆的镇馆之宝,是一件唐代的什么?", options: ["石灯——隆福寺长明灯楼", "铜钟", "瓷盘", "铁塔"], answer: 0, tip: "隆福寺长明灯楼是国内现存纪年最早的唐代石灯。" },
  { q: "隆福寺长明灯楼雕制于唐代哪一年?", options: ["垂拱四年(688 年)", "贞观十年(636 年)", "开元二年(714 年)", "天宝六年(747 年)"], answer: 0, tip: "垂拱是武则天时期的年号,688 年。" },
  { q: "北魏「太和十一年」,是公元哪一年?", options: ["487 年", "387 年", "587 年", "687 年"], answer: 0, tip: "太和是北魏孝文帝的年号,太和十一年即公元 487 年。" },
  { q: "「柿蒂纹」的「柿蒂」,指的是柿子的哪个部分?", options: ["顶端的蒂(萼片)", "果肉", "叶子", "树皮"], answer: 0, tip: "柿蒂四瓣对称,是传统器物上的经典纹样。" },
  { q: "「鎏金」工艺,是把金子和什么调在一起涂上铜器再烘烤?", options: ["水银", "清漆", "蜡", "胶水"], answer: 0, tip: "金溶于水银成金汞剂,烘烤后水银蒸发、金留器表。" },

  /* ---- 第十站 · 邯郸 ---- */
  { q: "透雕螭龙纹金牌饰出土于邯郸的什么地方?", options: ["赵王陵 2 号陵", "响堂山石窟", "磁县北朝墓群", "丛台公园"], answer: 0, tip: "1997 年出土于赵王陵 2 号陵。" },
  { q: "「刻度天禄架熨斗」是哪个朝代的文物?", options: ["东汉", "战国", "唐代", "元代"], answer: 0, tip: "1972 年出土于邯郸张庄桥东汉墓。" },
  { q: "古代熨斗工作时,斗里装的是什么?", options: ["炭火", "热水", "沙子", "冰块"], answer: 0, tip: "炭火加热铜斗,就能熨平衣物。" },
  { q: "「时苗留犊」的故事,赞美的是时苗的什么品质?", options: ["清廉", "勇猛", "节俭", "孝顺"], answer: 0, tip: "离任留犊让利,「时苗留犊」成为清廉的代名词。" },
  { q: "画出「时苗留犊」故事的瓷枕,出自哪个窑口?", options: ["磁州窑", "邢窑", "定窑", "汝窑"], answer: 0, tip: "磁州窑位于邯郸一带,以白地黑花闻名。" },

  /* ---- 第十一站 · 衡水 ---- */
  { q: "景县封氏墓群出土的四件青瓷莲花尊,如今分藏于?", options: ["中国国家博物馆、故宫博物院、河北博物院等处", "全部收藏在衡水市博物馆", "全部流失海外", "全部收藏在洛阳博物馆"], answer: 0, tip: "四件莲花尊分藏多家大馆,衡水市博物馆陈列的是复制件。" },
  { q: "「长乐未央」的意思是?", options: ["长久欢乐、没有尽头", "又长又冷的夜", "年年丰收", "岁岁平安"], answer: 0, tip: "「未央」意为未已、未尽,是汉代流行的吉语。" },
  { q: "汉代瓦当上的「长乐」「未央」与哪两座宫殿同名?", options: ["长乐宫与未央宫", "大明宫与太极宫", "阿房宫与章台宫", "建章宫与甘泉宫"], answer: 0, tip: "长乐宫、未央宫是汉长安城的两大宫殿。" },
  { q: "衡水阜城桑庄汉墓出土的绿釉陶楼,通高约?", options: ["2.16 米", "0.5 米", "6 米", "12 米"], answer: 0, tip: "它由台基、门楼与五层楼阁组成,通高 216 厘米。" },
  { q: "「事死如事生」反映了汉代怎样的葬俗观念?", options: ["把生前的生活带进墓葬", "反对厚葬", "重视出生礼", "死后迁居他乡"], answer: 0, tip: "陶楼、陶仓等明器,正是这种观念的产物。" }
];

/* AI 出题:四选一,本地题库随机抽取 */
const AI_EXAMINER = {
  name: "小博主",
  title: "AI 出题官",
  greet: "我是 AI 出题官小博主:题目一半考这只精灵自己的知识(出土、尺寸……),一半是文物通识。答对就掷骰子攻击,答错可要被反打哦!"
};

/* =========================================================
   以下为「主页 · 其他」板块数据:博物馆介绍 / 文创灵感 / 地图点位
   博物馆资料以各馆官方公开信息为准;文创为比赛 Demo 演示创意
   ========================================================= */

/* 河北的博物馆(与十一站打卡呼应的十二馆) */
const MUSEUMS = [
  {
    id: "hebeimuseum", name: "河北博物院", city: "石家庄", level: "国家一级博物馆",
    tags: ["满城汉墓", "战国中山国"],
    intro: "前身为 1953 年成立的河北省博物馆,2013 年更名为河北博物院。现有藏品约 24 万件,其中一级文物 360 余件,是河北文物收藏与研究的中心,「满城汉墓」「战国中山国」两大陈列深受观众喜爱。",
    highlights: ["金缕玉衣", "长信宫灯", "错金银铜版兆域图", "十五连盏铜灯"],
    station: "shijiazhuang"
  },
  {
    id: "xingtaimuseum", name: "邢台博物馆", city: "邢台", level: "市级综合博物馆",
    tags: ["井地长风", "3500 年建城史"],
    intro: "邢台古称邢,有 3500 年建城史。邢台博物馆现有藏品 1375 件/套,其中一级文物 8 件,常设展厅「井地长风」讲述邢台从商周到明清的变迁,并评选出 23 件镇馆之宝。",
    highlights: ["耳为父癸铜爵", "错金四神长颈铜壶", "三轮盘附觞铜温炉", "鎏金盘龙座博山炉"],
    station: "xingtai"
  },
  {
    id: "yuzhoumuseum", name: "蔚州博物馆", city: "张家口 · 蔚县", level: "国家二级博物馆",
    tags: ["代蔚长歌", "十大镇馆之宝"],
    intro: "即蔚县博物馆,2016 年新馆开放。馆藏文物 9653 套(11194 件),其中一级文物 10 件;基本陈列「代蔚长歌」荣获第十四届全国博物馆十大陈列展览精品奖。",
    highlights: ["「代蔚长歌」基本陈列", "一级文物 10 件", "蔚州民俗"],
    station: "zhangjiakou"
  },
  {
    id: "yuanzhongdumuseum", name: "元中都博物馆", city: "张家口 · 张北", level: "国家二级博物馆",
    tags: ["蒙元文化", "一座中都城 半部元朝史"],
    intro: "位于张北县城,2010 年 12 月开馆,建筑面积 9202 平方米,是全国第一座蒙元文化专题博物馆。馆藏文物 2739 件/套,基本陈列「一座中都城 半部元朝史」再现元中都的兴衰。",
    highlights: ["螭首", "六六幻方", "行什"],
    station: "zhangjiakou"
  },
  {
    id: "cangzhoumuseum", name: "沧州市博物馆", city: "沧州", level: "国家二级博物馆",
    tags: ["运河文化", "11 条展线"],
    intro: "位于运河区御河路 59 号,建筑面积 32275 平方米,馆藏文物 17752 件/套,辟有 11 条展览线,系统展示沧州从运河漕运到武术杂技的地域文化。",
    highlights: ["绿釉陶猪", "错金豹镇", "运河漕运文物"],
    station: "cangzhou"
  },
  {
    id: "cizhoumuseum", name: "磁州窑博物馆", city: "邯郸 · 磁县", level: "国家二级博物馆",
    tags: ["白地黑花", "北方民窑"],
    intro: "坐落于邯郸磁县,以磁州窑陶瓷为主题,系统展示白地黑花、剔花、珍珠地划花等工艺,是了解北方民窑的一扇窗口。邢台站的「白釉黑花坐形童子像」便与其一脉相承。",
    highlights: ["白地黑花瓷", "剔花、划花工艺", "北方民窑发展史"]
  },
  {
    id: "chengdemuseum", name: "承德避暑山庄博物院", city: "承德", level: "国家一级博物馆",
    tags: ["避暑山庄", "外八庙", "民族团结"],
    intro: "2022 年 9 月由承德博物馆与避暑山庄博物馆等单位合并组建,2024 年 5 月获评国家一级博物馆。院藏与避暑山庄、外八庙的皇家历史相映照,「望长城内外——清盛世民族团结实录」曾获全国博物馆十大陈列展览精品奖,还推出「假如文物会说话」等数字内容。",
    highlights: ["清紫檀木座铜胎珐琅塔", "铜鎏金凤凰脊兽", "辽代茶叶末釉鸡腿瓶", "清宫钟表"],
    station: "chengde"
  },
  {
    id: "tangshanmuseum", name: "唐山博物馆", city: "唐山", level: "国家一级博物馆",
    tags: ["冀东三枝花", "古代唐山", "北方瓷都"],
    intro: "设立于 1996 年,坐落于唐山市路北区龙泽南路 22 号,2024 年获评国家一级博物馆。馆舍由 A—E 五座展馆组成,总建筑面积约 2.4 万平方米,现有藏品 1.7 万余件(其中一级文物 7 件/套)。《古代唐山》陈列纵览从 4 万年前纳玛象、战国燕地青铜到近代工业的完整脉络;《冀东三枝花》陈列则把皮影、评剧、乐亭大鼓请进了展厅。",
    highlights: ["纳玛象门齿化石", "汉 · 绿釉陶楼", "唐三彩镇墓兽", "开平矿务局早期股票"],
    station: "tangshan"
  },
  {
    id: "qhdmuseum", name: "秦皇岛博物馆", city: "秦皇岛", level: "市级综合博物馆",
    tags: ["海岳明珠", "孤竹古国"],
    intro: "2023 年 11 月开馆试运行,建筑面积约 2.66 万平方米,馆藏文物 1500 余件。基本陈列「海岳明珠——秦皇岛历史文化陈列」分七个展示组,从山海文明、古国故事讲到长城重镇、百年风云;展出文物 1168 件组,2024 年获全国博物馆十大陈列展览精品推介优胜奖。",
    highlights: ["斑鬣狗化石", "商代铜簋", "秦代夔纹大瓦当", "清乾隆景泰蓝太平有象"],
    station: "qinhuangdao"
  },
  {
    id: "lfmuseum", name: "廊坊博物馆", city: "廊坊", level: "国家二级博物馆",
    tags: ["隆福寺长明灯楼", "京畿门户"],
    intro: "坐落在廊坊市文化公园内,2005 年 12 月正式开馆,建筑面积约 7600 平方米,馆藏文物 4 万余件。镇馆之宝「隆福寺长明灯楼」是国内现存纪年最早的唐代石灯,就立在馆内一楼大厅正中。",
    highlights: ["隆福寺长明灯楼(唐)", "北魏太和十一年石造像", "馆藏佛教造像"],
    station: "langfang"
  },
  {
    id: "hdmuseum", name: "邯郸市博物馆", city: "邯郸", level: "国家一级博物馆",
    tags: ["赵文化", "磁州窑"],
    intro: "成立于 1968 年,现馆位于邯郸市文化艺术中心西侧,建筑总面积约 3.07 万平方米,馆藏文物 9000 余件(套)。基本陈列以「赵文化」「磁州窑」为特色,透雕螭龙纹金牌饰、刻度天禄架熨斗、白地黑花「时苗留犊」瓷枕等都是镇馆之宝。",
    highlights: ["透雕螭龙纹金牌饰", "刻度天禄架熨斗", "「时苗留犊」瓷枕", "金银涂乘舆大爵酒樽"],
    station: "handan"
  },
  {
    id: "hengshuimuseum", name: "衡水市博物馆", city: "衡水", level: "市级综合博物馆",
    tags: ["衡水历史文化", "黑石熨斗架"],
    intro: "2021 年 9 月建成并对外免费开放,位于衡水市文化艺术中心,建筑面积 11182 平方米,设序厅、衡水历史文化展厅、衡水历史名人展厅、衡水红色文化展厅等 8 个展厅,是衡水第一家地市级综合类国有博物馆。馆藏青铜器、石器、陶瓷器、玉器、佛造像、钱币等文物 2199 件(套),一级文物包括汉代黑石熨斗架、黑石豆形器、北齐「天保三年」一佛二菩萨立形白石像、唐代邢窑白釉剔花凤首皮囊式瓷壶、北齐至隋四面佛造像塔等,镇馆之宝「唐邢窑白釉剔花凤首皮囊式瓷壶」同类器全国仅发现 4 件。",
    highlights: ["唐邢窑白釉剔花凤首皮囊式瓷壶", "汉代黑石熨斗架", "汉代黑石豆形器", "北齐至隋四面佛造像塔"],
    station: "hengshui"
  }
];

/* 文创灵感(比赛 Demo 的演示创意) */
const CREATIVE_NOTE = "以上为比赛 Demo 的演示创意,并非真实在售商品;文创落地需获得相关博物馆与文物 IP 授权。";
const CREATIVE = [
  { id: "zhenzhi", name: "「镇海吼」铁狮镇纸", from: "沧州铁狮子", tag: "文房",
    idea: "把铁狮子昂首的造型做成黄铜镇纸,压在书页上,就像把「镇海吼」请回了书桌。" },
  { id: "gongdeng", name: "长信宫灯台灯", from: "长信宫灯(满城汉墓)", tag: "家居",
    idea: "复刻宫灯造型,内藏暖光 LED,灯罩可以开合调光,致敬两千年前的「环保灯」。" },
  { id: "yuyi", name: "金缕玉衣金属书签", from: "金缕玉衣", tag: "文具",
    idea: "用黄铜细缕编出迷你玉衣纹样的金属书签,夹在书里的,是汉代最高等级的体面。" },
  { id: "boshanlu", name: "博山炉香薰加湿器", from: "错金博山炉 / 鎏金盘龙座博山炉", tag: "家居",
    idea: "出雾口就是博山云雾,仙山若隐若现,一炉就能「看见」汉代的仙气。" },
  { id: "sishen", name: "四神纹帆布袋", from: "错金四神长颈铜壶(邢台)", tag: "潮玩",
    idea: "把青龙、白虎、朱雀、玄武的错金线条印在帆布上,把古人的宇宙观背在肩上。" },
  { id: "huanfang", name: "「六六幻方」数字魔方", from: "元中都六六幻方", tag: "潮玩",
    idea: "六阶幻方做成可转动的数字魔方,每行每列求和都相等,玩的就是元朝的数学浪漫。" },
  { id: "ciheizi", name: "磁州窑白地黑花杯", from: "白釉黑花坐形童子像", tag: "茶具",
    idea: "白釉底色缀上黑花童子,喝茶时低头一看,杯底的童子正冲你笑。" },
  { id: "cards", name: "文物精灵收藏卡牌", from: "全部 47 只精灵", tag: "潮玩",
    idea: "每只精灵一张卡,边框就用它们的主属性纹样:青铜配饕餮纹、陶瓷配缠枝莲、唐代配忍冬纹、玉器配如意纹。" },
  { id: "fenghuang", name: "「万法归一」金顶冰箱贴", from: "铜鎏金凤凰脊兽(承德)", tag: "家居",
    idea: "把万法归一殿的金色殿顶做成冰箱贴,凤凰脊兽蹲在角上——把「漂泊百年、金凤还巢」的故事,贴在你家冰箱上。" },
  { id: "gedao", name: "「戈」形黄铜裁纸刀", from: "战国三穿直内铜戈(唐山)", tag: "文房",
    idea: "把燕国铜戈的冷峻线条做成黄铜裁纸刀——「化干戈为玉帛」,这一次真的用它来拆信、裁纸。" },
  { id: "taolou", name: "「陶楼」桌面收纳楼", from: "汉绿釉陶楼(唐山)", tag: "家居",
    idea: "把汉代陶楼做成可堆叠的桌面收纳:一层放笔、一层放便签,「地下庄园」变身「桌面庄园」。" },
  { id: "qiaokeli", name: "「铜簋」巧克力", from: "商代铜簋(秦皇岛)", tag: "食品",
    idea: "把乳钉纹做成巧克力表面的小格纹,掰开一块——三千年前的「青铜饭碗」,变成了甜甜的下午茶。" },
  { id: "tuoling", name: "「丝路骆驼」驼铃挂件", from: "唐代彩绘陶骆驼(秦皇岛)", tag: "潮玩",
    idea: "骆驼与驼铃做成小挂件,走路叮当作响——把丝绸之路的商队声,挂在书包上。" },
  { id: "changmingdeng", name: "「长明灯楼」纸雕小夜灯", from: "隆福寺长明灯楼(廊坊)", tag: "家居",
    idea: "把灯楼造型做成纸雕灯罩,暖光从八角柱身的佛像剪影间透出来——一灯长明,一夜好梦。" },
  { id: "shifo", name: "「佛系」造像摆件", from: "太和十一年佛造像(廊坊)", tag: "潮玩",
    idea: "石佛的微笑做成桌面小摆件,配一行字:「太和十一年许的愿,不急,慢慢来。」" },
  { id: "jinpai", name: "「金牌饰」镂空冰箱贴", from: "透雕螭龙纹金牌饰(邯郸)", tag: "家居",
    idea: "螭龙透雕做成金属镂空冰箱贴,吸在冰箱门上——你家厨房的「金牌认证」。" },
  { id: "ruanzhen", name: "「时苗留犊」瓷枕抱枕", from: "白地黑花「时苗留犊」瓷枕(邯郸)", tag: "家居",
    idea: "把瓷枕上的松树、牛车印在软糯的长条抱枕上——硬枕变软枕,清廉故事也变得好睡。" },
  { id: "lianzun", name: "「青瓷莲花尊」香薰蜡烛杯", from: "青釉仰覆莲花尊(衡水)", tag: "家居",
    idea: "蜡烛杯做成层层莲瓣的造型,点上烛火——像一朵在夜里悄悄亮起来的青瓷莲花。" },
  { id: "changyue", name: "「长乐未央」瓦当黄铜书签", from: "汉代「长乐未央」瓦当(衡水)", tag: "文房",
    idea: "把十字界格与四个吉祥字做成镂空黄铜书签,夹进书里——每次翻页,都是一句「长久欢乐、没有尽头」。" }
];

/* 河北地图点位(与 装饰/河北地图.webp 同源线性变换,百分比定位) */
const MAP_MARKS = {
  stations: [
    { id: "cangzhou",     x: 52.0, y: 64.7 },
    { id: "baoding",      x: 32.4, y: 56.7 },
    { id: "zhangjiakou",  x: 24.2, y: 29.9 },
    { id: "shijiazhuang", x: 18.9, y: 68.5 },
    { id: "xingtai",      x: 18.9, y: 82.1 },
    { id: "chengde",      x: 67.9, y: 27.0 },
    { id: "tangshan",     x: 74.5, y: 43.0 },
    { id: "qinhuangdao",  x: 91.5, y: 39.0 },
    { id: "langfang",     x: 50.7, y: 47.3 },
    { id: "handan",       x: 20.5, y: 86.8 },
    { id: "hengshui",     x: 37.2, y: 70.4 },
    { id: "guobo",        x: 46.0, y: 38.5 }
  ],
  cities: [
    { name: "秦皇岛", x: 91.1, y: 41.6 },
    { name: "唐山",   x: 71.0, y: 45.9 },
    { name: "邯郸",   x: 19.4, y: 88.3 },
    { name: "衡水",   x: 35.4, y: 72.6 },
    { name: "廊坊",   x: 48.9, y: 49.5 }
  ]
};

/* 站点城市头像(整理自 背景\城市头像\,AI 生成图;暂无头像的站点回退显示编号徽章) */
const CITY_AVATARS = {
  huaxia:       "装饰/城市头像/huaxia.webp",
  cangzhou:     "装饰/城市头像/cangzhou.webp",
  baoding:      "装饰/城市头像/baoding.webp",
  zhangjiakou:  "装饰/城市头像/zhangjiakou.webp",
  shijiazhuang: "装饰/城市头像/shijiazhuang.webp",
  xingtai:      "装饰/城市头像/xingtai.webp",
  chengde:      "装饰/城市头像/chengde.webp",
  tangshan:     "装饰/城市头像/tangshan.webp",
  qinhuangdao:  "装饰/城市头像/qinhuangdao.webp",
  langfang:     "装饰/城市头像/langfang.webp",
  handan:       "装饰/城市头像/handan.webp",
  hengshui:     "装饰/城市头像/hengshui.webp",
  guobo:        "装饰/城市头像/guobo.webp"
};

/* =========================================================
   AI 赋彩 · 图稿库(「AI 赋彩」文件夹里的 36 幅 Q 版文物)
   f=文件名(位于「AI 赋彩/」下) · w/h=原图尺寸 · c=内容区裁剪框 [x0, y0, x1, y1]
   小游戏先把每幅转成黑白稿,玩家点按填色 / 拖笔涂抹,把颜色还回去;
   裁剪框由 tools 里的扫描脚本自动生成,若替换图稿请同步更新 c
   ========================================================= */
const DYE_IMAGES = [
  { f: "027f06d02433de4523b4b3c4a83e36d6.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "07225a37757e07e46d64fe17c099e5a0.webp", w: 553, h: 1200, c: [0, 208, 553, 992] },
  { f: "0e737ed8891d1c92733617dec2afb1eb.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "168c648d0c09f1a68836633c41837776.webp", w: 553, h: 1200, c: [0, 187, 553, 1013] },
  { f: "16f4b90271faf94a34da8fa9c033f0ab.webp", w: 553, h: 1200, c: [0, 203, 553, 907] },
  { f: "26deb7aa5263c8684e1619bfde46e4ac.webp", w: 871, h: 1200, c: [0, 2, 871, 1193] },
  { f: "29717d2c529b9e3e4c39052802ec7b17.webp", w: 553, h: 1200, c: [0, 195, 553, 887] },
  { f: "2bde8a319b88680667bb816214489a6e.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "2e056a94d4e192639c81f39658482f74.webp", w: 553, h: 1200, c: [0, 195, 553, 887] },
  { f: "32236ba9d81adc09b662436a3584ff68.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "32343700eab6e1d5cd7f7193aa4493fd.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "4038eb06a3ac41e1acd18801f9f9e175.webp", w: 853, h: 1200, c: [0, 0, 853, 1198] },
  { f: "42b45eb6fda78cd58dc09df7677b4b3e.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "4377f5e1579504165314734f4087e68f.webp", w: 553, h: 1200, c: [0, 208, 553, 992] },
  { f: "464c317eae744e0e41fe3e515ad75c30.webp", w: 553, h: 1200, c: [0, 208, 553, 992] },
  { f: "49f0cda786296047aa4750af69ad4b02.webp", w: 553, h: 1200, c: [0, 50, 553, 1043] },
  { f: "55a31d8ba662fd77bcce82c7565c5480.webp", w: 553, h: 1200, c: [0, 208, 553, 992] },
  { f: "6b77f2fdbed39786cb1ee130edefb54d.webp", w: 553, h: 1200, c: [0, 195, 553, 887] },
  { f: "76d3aee19b4494e6b6a0eafec2df7402.webp", w: 553, h: 1200, c: [0, 270, 553, 929] },
  { f: "76e4bce2353254cb7e0a8d6e3e36e1f9.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "7f384666dfb1e3887300e22e75188b90.webp", w: 553, h: 1200, c: [0, 195, 553, 887] },
  { f: "828661bc37932c5d9efa383bd2fefc50.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "916fd273d0d2b71872b097bfeeb9af3c.webp", w: 553, h: 1200, c: [0, 195, 553, 887] },
  { f: "9a9edfef8355050a2cc03eef938e70e5.webp", w: 1089, h: 1200, c: [0, 0, 1089, 1200] },
  { f: "a93da12cb6dd67b775e66f28c80b9664.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "b835227f33cd735c7f8a5f288c61fb2d.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "c0bd075b71cc1cd1ce24845fe0714f36.webp", w: 553, h: 1200, c: [0, 208, 553, 991] },
  { f: "d5100d97f12e22fc19e7fd92fc04ccc6.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "dae74aff89987289493f536d4e73e690.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "df964f72bf71da717712a357d8bc1e92.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "e709188a652540e6d6d64ce59a4b1bbf.webp", w: 553, h: 1200, c: [0, 231, 553, 969] },
  { f: "ec3153703388c0fe1b4598ddbef01aea.webp", w: 553, h: 1200, c: [0, 323, 553, 877] },
  { f: "ecfbb8dfbe2f6ad2ca7a148964dbcd43.webp", w: 553, h: 1200, c: [0, 272, 553, 927] },
  { f: "f0b3bd969741e187d8a0f45c0ed98690.webp", w: 553, h: 1200, c: [0, 208, 553, 991] },
  { f: "f34974f063e4a513f92c8cb72363ff14.webp", w: 553, h: 1200, c: [0, 255, 553, 944] },
  { f: "f837d5d3b0d08b44df9e10ea35bf834a.webp", w: 553, h: 1200, c: [0, 231, 553, 969] }
];

/* =========================================================
   AI 打卡海报 · 数据
   POSTER_META:图鉴编号(HB-XXX,按「站点顺序」编排,起始三精灵排最后)
               + 打卡冷知识(30–60 字,口径与对应精灵的知识库/history 一致)
   POSTER_HALLS:站点 → 打卡地点(馆藏博物馆 + 城市)
   POSTER_HALL_EX:个别精灵与站点默认不同;值为 null 表示「暂无确证收藏信息」,海报会省略打卡地点一行
   ★ 修改冷知识时请控制在 30–60 字(tools\check_js.py 会检查),并保持与知识库说法一致
   ========================================================= */
const POSTER_META = {
  tielion:  { no: "HB-001", trivia: "铸于后周广顺三年(953 年),以「泥范明浇法」整体浇铸而成,原重约三十二吨,是中国现存最大的古代铸铁艺术品之一。" },
  baozhen:  { no: "HB-002", trivia: "错金是把金丝嵌入青铜表面凹槽的工艺;青铜铸成的豹形席镇,金灿灿又威风,多出自汉代高等级墓葬。" },
  baiyulion:{ no: "HB-003", trivia: "狮子经丝绸之路传入中国,成为威武、护佑的象征;这只唐代白玉蹲狮圆雕饱满,是盛唐玉作的佳作。" },
  longhu:   { no: "HB-004", trivia: "青釉因含铁而呈青绿;龙纹以堆贴花工艺立体盘绕在壶身,唐代越窑、长沙窑的青瓷曾远销海外。" },
  lvyoutaozhu:{ no: "HB-005", trivia: "汉代人「事死如生」,把绿釉陶猪请进墓葬,为墓主备好肉食;如今它是沧州博物馆的特色藏品。" },
  changxin: { no: "HB-006", trivia: "宫女执灯,右臂中空是排烟烟道——两千年前的环保设计;1968 年出土于满城汉墓,被誉为「中华第一灯」。" },
  jinyuyi:  { no: "HB-007", trivia: "由 2498 片玉、约 1100 克金丝编成,通长约 1.88 米;是中国首次发现、保存最完整的金缕玉衣。" },
  yubi:     { no: "HB-008", trivia: "璧面满饰谷纹,寓意五谷丰登;上端透雕两条盘绕的龙。《周礼》说「以苍璧礼天」,它既是礼器也是佩玉。" },
  boshanlu: { no: "HB-009", trivia: "炉盖铸成海上仙山「博山」,错金云气间藏着人兽;焚香时香烟从山峦间升起,如山间云雾缭绕。" },
  yuzhulong:{ no: "HB-010", trivia: "蜷曲如环,似猪似龙;张家口宣化郑家沟遗址的发现,实证五千年前红山文化已走到张家口一带。" },
  yanyudeng:{ no: "HB-011", trivia: "大雁回首衔鱼,烟气顺鱼身、雁颈沉入雁腹的水中;是汉代的「环保灯」,蔚州博物馆的镇馆之宝。" },
  tongzuolong:{ no: "HB-012", trivia: "出土于崇礼太子城金代皇家行宫遗址,坐龙昂首或为宫殿饰件;遗址入选 2018 年度全国十大考古新发现。" },
  chishou:  { no: "HB-013", trivia: "螭是无角之龙,这是宫殿台基边沿的排水口;张北元中都遗址出土近 80 件,其中 64 件在博物馆展出。" },
  tiezuding:{ no: "HB-014", trivia: "通高 51.5 厘米,是目前发现最大的战国铜鼎;鼎身 469 字铭文记中山国战功,铜身铁足见冶铁之进。" },
  lianzhandeng:{ no: "HB-015", trivia: "如扶桑神树,挑 15 个灯盘,攀 8 只猴子、立 2 只小鸟,树下还有人逗猴;灯枝能拆装,是战国灯具杰作。" },
  longfengfan:{ no: "HB-016", trivia: "四条盘龙、四只凤鸟相缠,底座由四只梅花鹿稳稳托起,通体错金银;通高约 36 厘米,精巧绝伦。" },
  hushilu:  { no: "HB-017", trivia: "猛虎扑住小鹿的一瞬间被铸成青铜,通体错金银;动势紧张而写实,原是中山王屏风的底座。" },
  tongjue:  { no: "HB-018", trivia: "1992 年出土于邢台一处工地,重约 790 克;铭文「耳为父癸」意为名叫「耳」的人为亡父作器致祭。" },
  cuojinhu: { no: "HB-019", trivia: "通体错金:蝉纹、几何纹与四神纹一丝一丝「绣」成,重约 2800 克;同墓还出土三轮盘附觞铜温炉。" },
  wenlu:    { no: "HB-020", trivia: "炉上架耳杯、炉下装三个小轮,拽着兽柄拉环就能拖着热酒走——两千年前设计师的巧思,通高 25.5 厘米。" },
  liujinlu: { no: "HB-021", trivia: "通体鎏金、盘龙托炉,重约 3000 克;可惜山形盖顶的一件小饰件已经遗失,馆藏记录写着「残缺」二字。" },
  tongzi:   { no: "HB-022", trivia: "宋代磁州窑瓷塑:黑釉点出眉眼、白釉作身,只有 160 克重;1979 年由邢台隆尧村民张明堂捐赠入藏。" },
  jituiping:{ no: "HB-023", trivia: "契丹人「车马为家」,瘦长的瓶身形似鸡腿,便于捆在驮架马背上贮酒贮水;茶叶末釉密布结晶斑点。" },
  jishou:   { no: "HB-024", trivia: "高 31.5 厘米,底部刻「西南、祥六」;漂泊百年后于 2025 年回到承德避暑山庄博物院,是一段回归佳话。" },
  zongkaba: { no: "HB-025", trivia: "头戴黄帽、结说法印,双肩莲茎托经书与宝剑;是清代承德外八庙的传世旧藏,见证团结交融的岁月。" },
  jixiangtianmu:{ no: "HB-026", trivia: "藏语称「班丹拉姆」,被尊为拉萨的守护神;怒目是为了震慑邪恶——「外现忿怒,内怀慈悲」。" },
  caitaohu: { no: "HB-027", trivia: "马家窑文化半山类型,距今约 4600—4300 年;红黑两彩画出四大圆圈与菱形网格,像在陶壶上织彩毯。" },
  tongge:   { no: "HB-028", trivia: "戈是先秦车战时代的长兵器,「干戈」一词由此而来;三个穿绳孔、直方形的内,是燕国工匠的严谨。" },
  lvyoutaolou:{ no: "HB-029", trivia: "台基之上楼阁层层出檐,屋檐、平座、门窗仿木构件而做;被考古学家当作研究汉代建筑的「立体图纸」。" },
  zhenmushou:{ no: "HB-030", trivia: "镇墓兽常成对置于墓门旁,一只兽面、一只人面;黄绿白釉在窑内流淌交融,是烧出来的盛唐气象。" },
  tonggui:  { no: "HB-031", trivia: "簋盛黍稷,与鼎配套使用,「九鼎八簋」是天子排场;满身乳钉纹与云雷纹,是商代青铜礼器的模样。" },
  caihuiluotuo:{ no: "HB-032", trivia: "骆驼是丝绸之路上的「沙漠之舟」;这件彩绘陶骆驼现藏秦皇岛博物馆,残留的彩绘是盛唐的影子。" },
  mudanguan:{ no: "HB-033", trivia: "五彩可不是只有五种颜色:红、绿、黄、紫等彩料在烧好的白釉上作画,再入窑低温烤烧定色。" },
  tongxiangxun:{ no: "HB-034", trivia: "瑞兽驮着小瓶、口吐云烟,是清代书房的清供;鎏金把金「烘」进铜面,几百年依旧亮闪闪。" },
  taihezaoxiang:{ no: "HB-035", trivia: "背面刻着发愿文,有「太和十一年」纪年,即公元 487 年;北朝纪年造像,是考古断代的标尺。" },
  changmingdenglou:{ no: "HB-036", trivia: "通高约 3.4 米,八角柱身刻满佛像与伎乐;是国内已知最早带纪年刻铭的唐代石灯,国家一级文物。" },
  liujinpusa:{ no: "HB-037", trivia: "鎏金把金与水银调成金汞剂涂于铜面,烘烤后水银蒸发、金层留存,历久不褪;小铜像也称「金铜像」。" },
  shidizhen:{ no: "HB-038", trivia: "瓷枕隋代出现、唐宋流行,清凉解暑;枕面满饰柿蒂纹,「柿」谐音「事」,取事事如意的好彩头。" },
  jinpaishi:{ no: "HB-039", trivia: "长 7.2 厘米、重约 80 克,金铜合金含金约 40%;透雕双螭,是「胡服骑射」时代民族交融的物证。" },
  tianluyundou:{ no: "HB-040", trivia: "细长支架上蹲着瑞兽「天禄」,斗身还带刻度,在存世汉代熨斗中极为罕见;已定为国家一级文物。" },
  shimiaozhen:{ no: "HB-041", trivia: "枕面画着「时苗留犊」的典故,颂为官清廉;菱形开光里画松树与牛车,长 42 厘米,小枕头大写意。" },
  lianhuazun:{ no: "HB-042", trivia: "1948 年出土于景县封氏墓群,同类共四件;层层莲瓣、青中泛黄的釉色,是北朝青瓷的代表作。" },
  taolou:   { no: "HB-043", trivia: "由台基、门楼与五层楼阁组成,通高 216 厘米;层间仿木构做出屋檐与平座,是研究汉代建筑的实物。" },
  wadang:   { no: "HB-044", trivia: "「长乐未央」与长乐宫、未央宫相呼应,寄托长久欢乐的祝愿;文字瓦当,是汉代建筑上的「吉祥话」。" },
  wuzhuqian:{ no: "HB-045", trivia: "「铢」是古代重量单位,五铢约合今天的 3.3 克;它从西汉通行到隋代七百多年,是古代的「硬通货」。" },
  qinghuaci:{ no: "HB-046", trivia: "钴料作画、罩透明釉高温一次烧成;元代成熟,永乐、宣德与康熙时最负盛名,英文 china 既指瓷器也指中国。" },
  yuzhui:   { no: "HB-047", trivia: "「君子比德于玉」——玉温润坚硬,既作佩饰也象征品德;从红山、良渚到历代墓葬,都有玉坠出土。" },
  jinqi:    { no: "HB-071", trivia: "黄金延展性极好,1 克金可拉成数千米长的金丝;唐代金银器以锤揲、錾花见长,何家村窖藏一次出土上千件珍宝。" },
  yinqi:    { no: "HB-072", trivia: "银器发黑是表面生成了硫化银,并不是损坏;唐代银壶常锤揲成形、錾刻缠枝莲,何家村窖藏是重要实物。" },
  xuanzhi:  { no: "HB-073", trivia: "宣纸以青檀皮和沙田稻草为原料,润墨耐折;四尺整张约 138 × 69 厘米,2009 年入选人类非物质文化遗产。" },
  xiangqi:  { no: "HB-074", trivia: "棋盘九列十行共 90 个交叉点,红黑各 16 枚;宋代基本定型,考古发现中见过宋元时期的象棋子。" },

  /* ---------- 第十二站 · 国博 ---------- */
  houmuwuding:{ no: "HB-048", trivia: "通高 133 厘米、重 832.84 公斤,是目前已知中国古代最重的单体青铜礼器;鼎腹内壁铸有「后母戊」三字铭文。" },
  siyangfangzun:{ no: "HB-049", trivia: "肩部四角各铸一只卷角羊,羊身羊腿与器身融为一体;以接铸法铸造,被称为「臻于极致的青铜典范」。" },
  xizun:    { no: "HB-050", trivia: "犀牛形酒尊:背设马鞍形活盖,可开合盛酒;通体错金银云纹细如游丝,是西汉错金银工艺的代表作。" },
  xiangdou: { no: "HB-051", trivia: "西汉鎏金铜器:圆筒器身、双环耳与三蹄足,一侧饰昂首马首;鎏金工艺让金层历经千年依旧金光灿灿。" },
  baohuadeng:{ no: "HB-052", trivia: "灯柱如树、12 支曲枝分三层托起灯盏,连同顶端共 13 盏;点亮时火树银花,故名「百花灯」,现藏洛阳博物馆。" },
  shuochangyong:{ no: "HB-053", trivia: "头裹帻巾、抱鼓说唱,眉飞色舞——东汉俳优表演的瞬间被定格,因神态传神被称为「汉代第一俑」。" },
  sancailuotuo:{ no: "HB-054", trivia: "骆驼昂首驮起五人乐队:四人奏乐、一人起舞;胡乐沿丝路入长安,被永远留在了这件三彩陶塑上。" },

  /* ---------- 第零站 · 华夏(夏 → 清 十六朝各一件) ---------- */
  xiapaishi:     { no: "HB-055", trivia: "青铜铸框、绿松石作画:数百枚细小石片严丝合缝,历三四千年不松动;1984 年出土于二里头 11 号墓。" },
  fuxiaozun:     { no: "HB-056", trivia: "通高 46.3 厘米、重 16 千克,内壁铸「妇好」二字;1976 年殷墟妇好墓出土。" },
  dengxizun:     { no: "HB-057", trivia: "似马非马、似羊非羊的青铜神兽:盖顶立凤鸟、身攀小龙;铭文「邓仲作宝尊彝」,1984 年陕西张家坡出土。" },
  shuangyangzun: { no: "HB-058", trivia: "两只公羊背靠背、合抱成筒形尊口;此类双羊尊传世仅两件,一件藏大英博物馆、一件藏根津美术馆。" },
  bingmayong:    { no: "HB-059", trivia: "真人比例、千人千面:武士平均身高约 1.8 米,原本通体彩绘;1974 年临潼打井时被发现,号称「世界第八大奇迹」。" },
  shuanglongbi:  { no: "HB-060", trivia: "通高 25.9 厘米、璧径 13.4 厘米:璧面谷纹、上端透雕双龙并留高钮;1968 年满城汉墓出土。" },
  pianjiangjunyin:{ no: "HB-061", trivia: "通高仅 2 厘米、重 108.95 克:龟钮方印,印文「偏将军印章」;1982 年重庆市民在嘉陵江边拾得后捐赠。" },
  jinhouniaozun: { no: "HB-062", trivia: "凤鸟回眸、象鼻为尾;2000 年出土于曲沃晋侯墓地,尾巴残片多年后被寻回补全,现藏山西博物院。" },
  longfengpei:   { no: "HB-063", trivia: "通高 5.8 厘米的薄玉片:龙屈颈卷身、凤栖龙尾回首相望;1951 年南京邓府山墓出土,现藏南京博物院。" },
  duoguxinyin:   { no: "HB-064", trivia: "煤精磨成 26 个面、刻 14 个印文;主人独孤信三个女儿是北周、隋、唐三朝皇后,人称「天下第一老丈人」。" },
  zoulong:       { no: "HB-065", trivia: "高 2.1~2.8 厘米、长约 4 厘米,重约 4 克;投龙祭祀的「金龙信使」,1970 年何家村出土。" },
  daoliuhu:      { no: "HB-066", trivia: "壶盖与壶身一体、无盖可开:从底部梅花孔注水,倒流满壶而滴水不漏;凤提梁、狮壶嘴、刻花牡丹,人称「三王壶」。" },
  yunlongpei:    { no: "HB-067", trivia: "龙身盘曲成环、爪护火珠,四周缠绕祥云;白玉透雕的一枚佩饰,延续唐五代云龙纹的气韵,是宋代玉作的精巧代表。" },
  shuangchibei:  { no: "HB-068", trivia: "两条螭虎攀作杯耳:前爪扒住口沿、卷尾贴住杯壁;体量敦实、刀法粗犷,是元代玉器的典型面貌。" },
  longfenglu:    { no: "HB-069", trivia: "高 37.5 厘米的鼎式香炉:朝天耳、三兽蹄足,青花绘龙凤祥云;明初洪武官窑器物罕见,现藏中国国家博物馆。" },
  yanshidi:      { no: "HB-070", trivia: "高 6.5 厘米的碧玉凤鸟:腹部掏空贮水,口部开孔,为砚台一滴滴添水;清宫旧藏的文房小件,现藏故宫博物院。" }
};

const POSTER_HALLS = {
  cangzhou:    { hall: "沧州博物馆",       city: "沧州市" },
  baoding:     { hall: "河北博物院",       city: "石家庄市" },
  zhangjiakou: { hall: "蔚州博物馆",       city: "张家口 · 蔚县" },
  shijiazhuang:{ hall: "河北博物院",       city: "石家庄市" },
  xingtai:     { hall: "邢台博物馆",       city: "邢台市" },
  chengde:     { hall: "承德避暑山庄博物院", city: "承德市" },
  tangshan:    { hall: "唐山博物馆",       city: "唐山市" },
  qinhuangdao: { hall: "秦皇岛博物馆",     city: "秦皇岛市" },
  langfang:    { hall: "廊坊博物馆",       city: "廊坊市" },
  handan:      { hall: "邯郸市博物馆",     city: "邯郸市" },
  hengshui:    { hall: "衡水市博物馆",     city: "衡水市" },
  guobo:       { hall: "中国国家博物馆",   city: "北京市" }
};

/* ---------- 燕赵名片 · 只展不捉(文物图鉴专属:不可捕捉 · 不计入收集进度) ---------- */
const LEGENDS = [
  {
    id: "wushi",
    name: "河北红舞狮",
    alias: "燕赵吉祥物",
    corner: "非遗狮舞",
    era: "国家级非物质文化遗产 · 沧州狮舞",
    hall: "河北 · 沧州",
    img: "精灵/河北红舞狮.webp",
    history: "舞狮是我国流传极广的传统民俗,河北的狮舞以沧州最为有名——沧州狮舞已列入国家级非物质文化遗产名录。锣鼓声里,舞狮人顶着红鬃狮头,腾挪、跃桩、采青,威武又喜庆。在「文物精灵」里,这只红舞狮还有个小名叫「小答」:逛馆逛累了,随时可以找它聊天、问路、出题。"
  },
  {
    id: "shenshou",
    name: "河北神兽",
    alias: "错银铜双翼神兽",
    corner: "镇馆之宝",
    era: "战国 · 中山国(公元前 4 世纪) · 1977 年出土",
    hall: "河北博物院 · 镇馆之宝",
    img: "精灵/河北神兽错银铜双翼神兽.webp",
    history: "错银铜双翼神兽出土于河北平山县战国中山王墓,是河北博物院最负盛名的镇馆之宝之一。它四足据地、双翼上扬,似狮似鸟;错银工艺在铜身铺出细密卷云纹,两千三百年后依然流光隐现。它被视为战国中山国的神秘守护者,如今也是「文物精灵」的品牌图腾——顶栏上那枚徽章,就是它。"
  }
];
/* 与站点默认不同的个别精灵(见各自知识库);null = 暂无确证收藏信息,海报省略该行 */
/* ---------- AI「精灵茶话会」· 跨文物对话串讲模板(本地生成,每场随机组合) ---------- */
const TEA_TALK = {
  /* 开场旁白 */
  open: [
    "夜色落下来,闭馆的铃声响过。展厅的灯一盏一盏熄灭——但今晚不太一样:{names}的展柜还亮着。",
    "博物馆闭馆了,大厅安静下来。几个展柜里的小家伙却悄悄睁开了眼:{names}。",
    "最后一批观众已经离馆,{names}挨个从展柜里探出头来——他们的茶话会,准时开始。"
  ],
  seat: [
    "没有主持人,它们自己按年纪排排坐——从{eraMin}到{eraMax},一坐就是一部燕赵年表。",
    "按老规矩,年长的坐左边:从{eraMin}到{eraMax},它们刚好坐成一排「时间」。"
  ],
  /* 自我介绍 */
  intro: [
    "我先来!我叫{name},{alias}。{intro}",
    "轮到我——我是{name},{alias}。{intro}",
    "{name},{alias}——记住我就行。{intro}"
  ],
  /* 论年代(后辈惊叹) */
  gapFar: [
    "{a}前辈,你是{eraA}那会儿的,我晚到{eraB}——中间隔着好几千年,咱们这一桌真能装历史。",
    "{a},我算了算:从{eraA}到{eraB},够讲一整夜了。您先讲,我听着。"
  ],
  gapMid: [
    "{a},你在{eraA}的时候,我还没出生呢——差了{n}朝,正好讲讲我不知道的那些事。",
    "咱们隔着{n}朝呢,{a}。这杯茶敬你,故事可得从你先开头。"
  ],
  gapNear: [
    "{a}和我前后脚——你{eraA},我{eraB},像是老街坊接了个班。",
    "我{eraB}的,{a}你{eraA}的,咱们离得近,聊起来正好接得上话。"
  ],
  gapSame: [
    "{a}和我算同一个大时代里的人物,怪不得一见如故。",
    "咱们俩的岁月差不多叠在一起,{a}——像同一批醒来的小伙伴。"
  ],
  /* 按知识库分类的提问(答复即对方知识库原文) */
  q: {
    time:   ["{a},你到底是什么时候、怎么来的?给大伙讲讲。", "{a},你一开口就是千年起步——先报个岁数吧。"],
    name:   ["{a},你这名字有讲究吧?给我们讲讲来历。", "{a}——这名字一听就不一般,谁给起的?"],
    size:   ["{a},你到底多大个儿?站你旁边我可太吃亏了。", "{a},先报报身高体重——我总觉得你是个大块头。"],
    mat:    ["{a},你是什么做的?凑近了想看又怕唐突,你讲讲。", "{a},你们那个年代,都用什么材料做宝贝?"],
    craft:  ["{a},你这身手艺活儿是怎么做出来的?讲细点。", "{a},我最好奇你的工艺了——来,露一手讲讲门道。"],
    use:    ["{a},你当年是干什么用的?讲讲你的老本行。", "{a},当年人们拿你做什么?给大伙说道说道。"],
    origin: ["{a},你在地下睡了那么久,后来是怎么被找到的?", "{a},讲讲你的出土故事吧——我们都想听。"],
    look:   ["{a},你为什么长这个样子?我很想听听里面的讲究。", "{a},你这造型有说法的吧?给大家讲讲。"],
    any:    ["{a},给大伙讲讲你最想讲的一段吧。", "{a},轮到你了——随便说说,哪儿都好。"]
  },
  /* 老乡 / 同门(有缘才出现的彩蛋) */
  town:     ["等一下——{b},你也是{city}出来的?咱俩是老乡啊!", "我说怎么一见你就投缘,原来都是{city}水土养出来的!"],
  townBack: ["可不是嘛!同饮一河水,隔了多少年还是自家人。", "一对老邻居,今天总算坐一桌了!"],
  mate:     ["{b},看出来没有?咱俩都是{mat}一脉的,算同门师兄弟。", "{b},咱俩这{mat}的身子凑一桌,亮闪闪——同门见同门,话就多了。"],
  mateBack: ["同门同门,以后多亲多近!", "那必须的,门里人好说话!"],
  /* 收尾 */
  closeLead: [
    "夜渐渐深了。从{eraMin}到{eraMax},今晚这一桌,把燕赵这片土地的千年聊成了一个夜晚。",
    "茶见了底,夜深了——{eraMin}的灯、{eraMax}的灯,今晚终于坐到了同一张桌边。"
  ],
  closeSay: [
    "今晚真好。{eraMin}到{eraMax},咱们哥几个一坐,就是半部燕赵史。",
    "记下今晚吧——千年文脉,就是一桌一桌,这么聊下去的。"
  ],
  closeNarr: [
    "闭馆的灯次第亮起又熄灭,它们各自回到展柜,像什么都没发生过。只有展签上的年份,好像悄悄挨近了一点。",
    "夜话散了场,文物们退回各自的位置。它们知道:燕赵的文脉,又多了一夜的注脚。"
  ],
  /* 主持人的选择 · 第 1 步:聊什么(四张牌) */
  topicLead: [
    ["主持人一挥手:「聊聊年头与掌故!」——桌上顿时热闹起来,谁也不肯认年轻。", "「比岁数、讲典故?那我可就不困了。」不知是谁先开了口——话头这就接上了。"],
    ["「说说风俗、吃喝与穿戴吧。」主持人一提,几位眼睛都亮了——民以食为天嘛。", "「吃啥穿啥、怎么过日子?」这一题一出,桌上的气氛立刻热络起来。"],
    ["「聊聊手艺吧。」——话音一落,几位都挺了挺身子,这可是它们最得意的话题。", "主持人把茶盏往前一推:「讲讲你们是怎么做出来的」——好戏来了。"],
    ["「八卦一下?」主持人眨眨眼:「各自的来历、怎么被找到的,都讲讲。」——灯花轻轻一晃,像要把故事都翻出来。", "「都从哪儿来呀?」主持人这一问,把大家的思绪带回了各自的考古现场。"]
  ],
  /* 接话:论年代(长辈回敬)、追问、称赞、话题过渡、开场白、补一句 */
  gapBack: [
    "哈哈,好几千年算什么——在展柜里,咱们都是邻居。",
    "可不是嘛。{b},你晚来几千年,正好听听我们那会儿的新鲜事——"
  ],
  praise: [
    "{a}这段讲得真细,我记下了。",
    "听得我都入神了,{a}。",
    "好家伙,{a}这故事,比讲解词还好听。"
  ],
  follow: [
    "那我再讨教一句,{b}——",
    "既说到这儿,我索性多问一嘴——"
  ],
  bridge: [
    "听{x}这么一说,我们{eraM}也有讲究——",
    "{x}那年代真热闹。我们{eraM}也不含糊——",
    "这么一比,我倒想说两句我们{eraM}的事了——"
  ],
  openUp: [
    "那我先说——我们{eraM}的日子,是这样的:",
    "先说我们{eraM},大家掌掌眼——"
  ],
  extraLead: [
    "轮到我补一句——",
    "我也凑个热闹——"
  ],
  starLead: [
    "主持人把话头往{a}手里一塞:「压轴的,就你了!」",
    "「最后一位——{a},开讲!」主持人带头鼓起了掌。"
  ],
  /* 主持人的选择 · 第 3 步:怎么收尾 */
  end: {
    toast: {
      lead: ["「来,最后一盏——以茶代酒!」茶盏叮当一碰,千年的光阴在杯沿上闪了一下。", "主持人端起茶盏:「干杯!」——叮的一声,像是把两千年的光阴碰在了一起。"],
      say: ["敬各位——敬我们身后这片土地,和它记得的一切。", "这一盏敬岁月——它让我们隔了几千年,还能坐在一块儿。"],
      back: ["我也补一句——敬这一桌,从{eraMin}到{eraMax},一个都不少!", "干!下一场,咱们还坐一桌。"]
    },
    photo: {
      lead: ["不知是谁提议:「合个影吧!」——灯影聚拢,悄悄给这一桌留了张无形的照片。", "「看镜头——」没有镜头,但几盏展柜灯同时亮了亮,当作快门。"],
      say: ["留个念想——下次再聚,我可记得你们每一位坐哪儿。", "把今晚记牢了:从{eraMin}到{eraMax},咱们是一桌的。"],
      back: ["「茄子——」从{eraMin}到{eraMax}的笑脸,都留在光影里了。", "这一张,留给千年后的观众看。"]
    },
    bye: {
      lead: ["夜深了,该散了。它们互相拱了拱手,像几百年前在驿站道别那样。", "「散了吧。」大家却都顿了顿,舍不得似的,又互相看了一眼。"],
      say: ["后会有期——灯亮灯灭,我们一直都在。", "记住今晚的月色——燕赵的故事,就靠一盏一盏灯,传下去。"],
      back: ["路上慢些——闭馆只是暂时的。", "说好了,梦里再会,老朋友。"]
    }
  },
  /* 故事标题 */
  title: [
    "闭馆之后 · {names}的跨时空夜话",
    "一晚越千年 · {names}茶话会",
    "燕赵夜话 · {names}的会面"
  ]
};

/* ---------- AI「精灵茶话会」· 各朝代掌故(习俗 / 美食 / 配饰 / 人物,同场取用不重复) ---------- */
const TEA_LORE = {
  "-1": [
    "我们那会儿还没有锅碗,先民把小米熬成粥,陶鬲里煮着,一大家子围一圈分着吃。",
    "红山文化的先民最崇敬玉,雕出玉龙、玉猪龙挂在身上,那是通神明的宝贝。",
    "半坡人会在彩陶上画鱼、画人面,画的是信仰,也是最早的「画展」。"
  ],
  "0": [
    "传说大禹治理洪水,「三过家门而不入」,后来他的儿子启建立了夏。",
    "夏人已经会用青铜爵喝酒了——那会儿能端上酒器,是身份的排面。",
    "二里头有中国最早的宫城,夏人的都城,已经像模像样。"
  ],
  "1": [
    "商人凡事都要占卜,问一问今天的吉凶,甲骨上就留下中国最早的文字。",
    "商王好酒,青铜觚、青铜爵成组成套,一场宴席能摆一屋子。",
    "商朝有位女将军叫妇好,带兵打仗,还是商王武丁的王后。"
  ],
  "2": [
    "周人最讲「礼乐」:吃饭用鼎,天子九鼎、诸侯七鼎,数目不能乱。",
    "《诗经》里的「国风」,是周代各地老百姓唱的歌谣。",
    "周人穿衣讲究,上衣下裳,再系上宽宽的带子,走路都有章法。"
  ],
  "3": [
    "我们那会儿百家争鸣:孔子、老子、庄子、墨子,思想家一茬接一茬。",
    "赵武灵王让赵国士兵脱下长袍、改穿胡服骑马射箭,一下强盛起来。",
    "「邯郸学步」的典故就出自我们那时候——学走路学丢了本色,成了笑谈。"
  ],
  "4": [
    "秦始皇统一了文字、度量衡和车轨——从此天南地北,尺子一样长。",
    "秦人修驰道、凿灵渠,还留下了兵马俑这样千军万马的地下军阵。",
    "秦朝的小吏在竹简上一笔一笔记公文,那就是最早的「档案」。"
  ],
  "5": [
    "我们汉朝人穿深衣、佩玉坠,走起来衣袂飘飘,叫「衣冠上国」。",
    "张骞出使西域,带回葡萄、石榴和苜蓿——汉人的餐桌一下子丰富了。",
    "汉朝的年轻人霍去病,十七岁领兵出征,「封狼居胥」成了后世的壮志。"
  ],
  "6": [
    "三国那会儿人才济济,曹操横槊赋诗,写下「对酒当歌,人生几何」。",
    "诸葛亮「鞠躬尽瘁」的故事流传至今,成了忠义的代名词。"
  ],
  "7": [
    "晋人爱清谈,手摇麈尾,一聊就是一整天。",
    "东晋的王羲之写《兰亭序》,被称作「天下第一行书」。"
  ],
  "8": [
    "南北朝时佛教兴盛,云冈、龙门的石窟里,一凿一錾都是虔诚。",
    "游牧民族爱马,马具都装饰得讲究;南北两边一路互相学着过日子。",
    "那会儿流行「胡饼」,芝麻撒在饼上烤得喷香,从西域一路传进来。"
  ],
  "9": [
    "隋朝开了科举,读书人有了「考试入仕」的奔头,这制度一直用到清末。",
    "隋炀帝修大运河,南粮北运,船队从杭州一路开到涿郡。",
    "隋人的白瓷初成,后来的大唐瓷器,就是从这儿起步的。"
  ],
  "10": [
    "我们唐朝人穿着讲究:姑娘额上贴花钿,男子头戴幞头,精神得很。",
    "唐人宴席上有歌舞助兴,还有一道名宴叫「烧尾宴」,排场得很。",
    "李白在我们那会儿,一斗酒下肚能写一百首诗,「斗酒诗百篇」。"
  ],
  "11": [
    "我们后周世宗柴荣励精图治,整顿佛寺、铸造钱币,可惜英年早逝。",
    "五代十国的匠人手艺不减,佛造像慈眉善目,一铸就是千年。"
  ],
  "12": [
    "我们宋朝人爱「点茶」「斗茶」,把茶玩成一门艺术,还传到了日本。",
    "宋人夜里爱逛夜市,小吃琳琅满目:包子、汤圆、糖炒栗子。",
    "宋朝姑娘爱戴花冠;苏东坡更是个妙人,走到哪儿吃到哪儿。"
  ],
  "13": [
    "我们元朝人喝马奶酒、听元曲,关汉卿的戏台下日日满座。",
    "元人烧出了成熟的青花瓷:钴料入画,白地蓝花,一路卖到了波斯。"
  ],
  "14": [
    "明人穿马面裙、系宫绦,出门讲究一身利落。",
    "郑和下西洋,宝船带去瓷器丝绸,带回香料珠宝,涨了大见识。",
    "我们明朝的木匠最见功夫:一榫一卯,不用一颗钉子。"
  ],
  "15": [
    "我们清朝有旗袍马褂,满汉衣冠互相借鉴,越穿越好看。",
    "清人爱听戏,徽班进京慢慢唱成了京剧,一唱两百年。",
    "满汉全席名头响亮,山珍海味摆上桌,是那会儿宴席的天花板。"
  ]
};

const POSTER_HALL_EX = {
  chishou:    { hall: "元中都博物馆", city: "张家口 · 张北" },
  yuzhulong:  null,
  tongzuolong:null,
  baohuadeng: { hall: "洛阳博物馆", city: "洛阳市" },  /* 1972 年洛阳涧西出土,现藏洛阳博物馆 */
  xiangdou:   null,                                    /* 暂无确证收藏信息 */

  /* ---- 第零站 · 华夏(十六朝各一件;null = 暂无确证打卡地点) ---- */
  xiapaishi:     { hall: "洛阳博物馆", city: "洛阳市" },
  fuxiaozun:     { hall: "河南博物院", city: "郑州市" },
  dengxizun:     { hall: "中国考古博物馆", city: "北京市" },
  shuangyangzun: null,
  bingmayong:    { hall: "秦始皇帝陵博物院", city: "西安 · 临潼" },
  shuanglongbi:  { hall: "河北博物院", city: "石家庄市" },
  pianjiangjunyin:{ hall: "重庆中国三峡博物馆", city: "重庆市" },
  jinhouniaozun: { hall: "山西博物院", city: "太原市" },
  longfengpei:   { hall: "南京博物院", city: "南京市" },
  duoguxinyin:   { hall: "陕西历史博物馆", city: "西安市" },
  zoulong:       { hall: "陕西历史博物馆", city: "西安市" },
  daoliuhu:      { hall: "陕西历史博物馆", city: "西安市" },
  yunlongpei:    null,
  shuangchibei:  null,
  longfenglu:    { hall: "中国国家博物馆", city: "北京市" },
  yanshidi:      { hall: "故宫博物院", city: "北京市" }
};

/* ---------------------------------------------------------
   显式导出到 window。
   这些在文件里是顶层 const，浏览器里跨 script 直接可用，
   但在沙箱 / 无头自检环境里读不到。
   工具层（js/tools.js）要按名称找文物，靠这里挂出去才稳。
   --------------------------------------------------------- */
if (typeof window !== "undefined") {
  window.SPIRITS = SPIRITS;
  window.ATTRIBUTES = ATTRIBUTES;
}
