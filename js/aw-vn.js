/* =========================================================
 * js/aw-vn.js · 文物精灵「精灵物语 · 主线剧情」—— 全国大地图分支流程图
 *
 * 定位：
 *   一条由「初始七友」开启的大主线：
 *     七友启程 → 沧州 → 河北十一站 → 国博（出河北）→ 全国十馆 → 华夏（终章）
 *
 * 分支机制（底特律·变人式）：
 *   每一站都是一次「三选一」——三条道通往三个不同的捕捉节点、
 *   三个不同的结局、三段不同的 AI 随机事件：
 *     「直面」= 勇  ｜  「追问」= 知  ｜  「相伴」= 情
 *
 * 剧情生成机制：
 *   ① 主节点（站点剧本）—— 手写，事实以 SPIRITS / STATIONS 为准
 *   ② 副节点 / 随机事件 —— 云端 AI 实时续写；断网用本机事件池兜底
 *
 * 复用：SPIRITS / STATIONS / spritePath / teaCloudDirect / identDirectKey
 * ========================================================= */
(function () {
  "use strict";

  /* ================= 全局状态 ================= */
  const VN = {
    view: "map",          // map=流程图 / node=节点对话
    current: null,        // 当前节点 id
    path: [],             // 已走过的节点 id 序列
    endings: {},          // 已解锁结局 { endingId: true }
    busy: false,
    cloudFail: false,
    nodeLines: [],
    nodeCursor: 0,
    generated: {},        // AI 已生成的事件缓存 { parentId: {title,lines} }
    eventIdx: {},
    cam: null,            // 相机 { cx, cy, w }（SVG 单位）
    lastNode: null,       // 最近停留的节点（回流程图时相机对准它）
    _b: null,             // 全图边界
    drag: null,
  };

  const VN_SAVE_KEY = "wjwl_vn_endings_v3";
  function vnLoad() { try { const s = localStorage.getItem(VN_SAVE_KEY); return s ? JSON.parse(s) : {}; } catch (e) { return {}; } }
  function vnSave() { try { localStorage.setItem(VN_SAVE_KEY, JSON.stringify({ endings: VN.endings, path: VN.path })); } catch (e) {} }

  /* ================= 辅助 ================= */
  function vnEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function vnSpiritName(id) { return (SPIRITS && SPIRITS[id]) ? SPIRITS[id].name : (id || "旁白"); }
  function vnStationName(id) {
    if (typeof STATIONS !== "undefined" && STATIONS) {
      const s = STATIONS.find ? STATIONS.find(x => x.id === id) : null;
      if (s && s.name) return s.name;
    }
    return id;
  }
  function vnShortStation(id) { return vnStationName(id).replace(/^第.+站[··]?\s*/, ""); }

  /* ================= 第零幕 · 初始七友 =================
   * n=旁白 / s=说话（id=精灵）
   * ========================================================= */
  const VN_OPEN = {
    id: "open", station: "huaxia", kind: "start", title: "启程 · 七友相送", speaker: "wuzhuqian", ai: true,
    lines: [
      { t: "narr", x: "故事开始在一间小小的书房。你翻开一本旧旧的图鉴，七枚信物忽然一起亮了。" },
      { t: "say", id: "wuzhuqian", x: "小友，别慌。我们七个，是陪你走这一路的『初始七友』。" },
      { t: "say", id: "qinghuaci", x: "青花瓷。白地蓝花，漂洋过海见过世面。往后路上，瓷器伙伴归我照看。" },
      { t: "say", id: "jinqi", x: "金器。商周传下来的老家伙。金贵的不只是金子，是人心里的那点念想。" },
      { t: "say", id: "yinqi", x: "银器。我光泽清冷、心肠温热，酒器食器最在行。" },
      { t: "say", id: "xuanzhi", x: "宣纸。笔墨落在我身上，就有了千年的字与画。别怕写错，纸总是温柔的。" },
      { t: "say", id: "xiangqi", x: "象棋。车马炮相士将，方寸棋盘就是战场。路要一步一步走。" },
      { t: "say", id: "yuzhui", x: "玉坠。我最小，可我最会看人——你，是个好苗子。" },
      { t: "narr", x: "图鉴的空白页上，浮出一行字：『第一站 · 沧州』。七枚信物围成一圈，等你选一个走法。" },
    ],
    choices: [
      { label: "镇海之路", text: "（握紧玉坠）先向东。海边的铁狮子，我要亲眼去看看。", to: "cz_hub", ending: "open_yong" },
      { label: "问古之路", text: "（翻开图鉴）先问路，弄清这一路都有什么，再走不迟。", to: "cz_hub", ending: "open_zhi" },
      { label: "同行之路", text: "（回头笑）七个都在，那就慢慢走，一路走一路看。", to: "cz_hub", ending: "open_qing" },
    ],
    next: "cz_hub",
  };

  /* ================= 站点剧本 =================
   * id   站点 id（对应 STATIONS）
   * p    id 前缀（流程图节点用）
   * hub  到站（3 个方向选择，自动生成）
   * caps 三个捕捉节点 { t 标题, sp 精灵 id, pick 玩家选择时的话, lines }
   * win  结缘（自动接下一站）
   * ========================================================= */

  /* ---------- 燕赵篇 · 沧州 → 邢台 ---------- */
  const VN_ST_1 = [
    /* 第一站 · 沧州 */
    { id: "cangzhou", p: "cz",
      hub: { t: "沧州 · 狮城问路", sp: "xiangqi", lines: [
        { t: "narr", x: "狮城的日头正毒。你还没走近，先听见一阵此起彼伏的快门声。" },
        { t: "narr", x: "一群人举着手机围在铁狮子前面，有人喊「这个角度出片」。没有一个人抬头看它。" },
        { t: "say", id: "xiangqi", x: "（沉默了一会儿）一千年了。来看它的人，比当年守城的人还多。" },
        { t: "say", id: "wuzhuqian", x: "可没一个问它叫什么。他们只说，那个大铁疙瘩。" },
        { t: "say", id: "yuzhui", x: "它听得见。它一直都听得见。" },
        { t: "narr", x: "铁狮子的眼睛烂了两个洞。可你觉得它正看着你——满场的人里，它只在你身上停住了。" },
        { t: "narr", x: "远处又过来一队旅游团，小旗子一摇一摇。图鉴在你手里发烫：三处微光，在等你先走哪一步。" },
      ]},
      caps: [
        { t: "沧州 · 镇海吼", sp: "tielion", pick: "（绕开人群，站到它侧面）我想站在没人拍照的那个角度。", lines: [
          { t: "narr", x: "你绕到铁狮子侧面。这个角度一个人也没有——因为不好看。" },
          { t: "say", id: "tielion", x: "（声音像铁锈相互摩擦）……站这么久了，不拍？" },
          { t: "narr", x: "你这才看见，它身上裂着一道很长的口子，被一圈钢架箍住。它一直在硬撑。" },
          { t: "say", id: "tielion", x: "后周广顺三年，人们把我铸在这儿，不是为好看。这一带的水，年年漫上来。" },
          { t: "say", id: "tielion", x: "张嘴不是吼人，是吼潮。如今潮退了，来看我的人都是笑着的。" },
          { t: "say", id: "tielion", x: "你说，我是不是该高兴。" },
          { t: "narr", x: "你没有回答。你把手放在钢架上，铁的凉透进掌心。" },
          { t: "say", id: "tielion", x: "……好。这一站，你算看过我了。" },
        ]},
        { t: "沧州 · 事死如生", sp: "lvyoutaozhu", pick: "（往城西走）我想去看看墓里那头小猪。", lines: [
          { t: "narr", x: "墓道里潮气很重。一只圆滚滚的绿釉陶猪缩在角落，釉面泛着一层土光。" },
          { t: "say", id: "lvyoutaozhu", x: "（打了个哈欠）来啦……轻点儿。这边的人都睡了。" },
          { t: "narr", x: "它肚子底下压着一排小陶器：鼎、盒、壶，一样不少。" },
          { t: "say", id: "lvyoutaozhu", x: "汉朝人把我请进来，是怕他在那边饿着。我替他备了两千年的饭。" },
          { t: "say", id: "jinqi", x: "事死如生。那时候的人不怕死，只怕那边的日子过得不体面。" },
          { t: "say", id: "lvyoutaozhu", x: "可他一次也没回来吃过。" },
          { t: "narr", x: "它说得很平静，像在说一件早就认了的事。" },
          { t: "say", id: "lvyoutaozhu", x: "你要带我走么。那这边的饭，谁替他们备呀。" },
          { t: "say", id: "xuanzhi", x: "有人记得，就不算没人备。" },
        ]},
        { t: "沧州 · 白玉蹲狮", sp: "baiyulion", pick: "（翻了翻图鉴）还有一尊白玉蹲狮，在馆里。", lines: [
          { t: "narr", x: "展厅最里面，一尊白玉小狮蹲着，鬃毛卷得像云。灯打得很暗。" },
          { t: "say", id: "baiyulion", x: "（很小声）……你是专门来找我的？" },
          { t: "narr", x: "你点头。它愣了一下，好像很久没人这样回答过。" },
          { t: "say", id: "baiyulion", x: "铁狮子镇海，镇得出了名。我在这儿蹲了一千多年，没人知道我是干什么的。" },
          { t: "say", id: "baiyulion", x: "唐代人把我雕成这样，是想让看的人心里稳一点。镇的不是海，是心。" },
          { t: "say", id: "yuzhui", x: "玉以比德。它不吼，可你看久了，会觉得踏实。" },
          { t: "say", id: "baiyulion", x: "那你多看一会儿吧。我这儿不赶时间——我这儿什么都没有，就是有时间。" },
        ]},
      ],
      win: { t: "沧州 · 结缘", sp: "tielion", lines: [
        { t: "say", id: "tielion", x: "记住，镇海的不是铁，是人心里那股不服输的劲。" },
        { t: "narr", x: "你走出很远，还听见身后快门在响。可你手里一张照片也没有。" },
        { t: "say", id: "tielion", x: "你家那边，有没有像我这样，站得太久没人问的老东西？" },
        { t: "narr", x: "你张了张嘴，发现自己答不上来。" },
        { t: "narr", x: "图鉴翻动，第二站的轮廓亮起：『保定』。" },
      ]} },

    /* 第二站 · 保定 */
    { id: "baoding", p: "bd",
      hub: { t: "保定 · 满城汉墓", sp: "changxin", lines: [
        { t: "narr", x: "保定满城，一座睡了两千年的汉墓。墓道里凉，灯影一晃一晃。" },
        { t: "say", id: "changxin", x: "我是长信宫灯。他们说，我替一位很尊贵的夫人，守了整整两千年的夜。" },
        { t: "say", id: "yinqi", x: "她袖子里是空的——烟从袖口进去，沉进灯座的水里。两千年前的巧思。" },
        { t: "narr", x: "图鉴亮起三处：一盏灯、一件玉衣、一枚双龙玉璧。" },
      ]},
      caps: [
        { t: "保定 · 长信宫灯", sp: "changxin", pick: "（走上前）我想先陪这盏灯坐一会儿。", lines: [
          { t: "say", id: "changxin", x: "我的灯芯早就亮不起来了。你还愿意来？" },
          { t: "say", id: "wuzhuqian", x: "灯不亮不要紧，屋里有人就不冷。" },
          { t: "say", id: "changxin", x: "……那你坐近些。我怕黑，怕了两千年了。" },
          { t: "narr", x: "铜灯的火苗，仿佛轻轻晃了一下。" },
        ]},
        { t: "保定 · 金缕玉衣", sp: "jinyuyi", pick: "（俯下身）这身玉衣，我想看清它每一片。", lines: [
          { t: "narr", x: "两千多片玉、一千多克金丝，编成一件殓服。" },
          { t: "say", id: "jinyuyi", x: "我是刘胜的金缕玉衣。他们把我盖在靖王身上，盼他千岁万岁。" },
          { t: "say", id: "yuzhui", x: "玉以比德。汉朝人信玉能让身体不朽——其实是不想被忘掉。" },
          { t: "say", id: "jinyuyi", x: "你呢。你也会忘掉我吗。" },
        ]},
        { t: "保定 · 双龙玉璧", sp: "yubi", pick: "（贴着玻璃）那枚双龙玉璧，纹路真好看。", lines: [
          { t: "narr", x: "白玉圆璧，璧面满饰谷纹，上端透雕两条盘绕的龙。" },
          { t: "say", id: "yubi", x: "我是双龙玉璧。一条龙护着另一条，绕了千年也没松开。" },
          { t: "say", id: "yinqi", x: "汉人佩玉，佩的不是石头，是「我记着你」。" },
          { t: "say", id: "yubi", x: "那我把这句话，也绕在你身上。" },
        ]},
      ],
      win: { t: "保定 · 结缘", sp: "changxin", lines: [
        { t: "say", id: "changxin", x: "有你在，这一夜好像没那么长了。" },
        { t: "narr", x: "图鉴再翻：『第三站 · 张家口』。" },
      ]} },

    /* 第三站 · 张家口 */
    { id: "zhangjiakou", p: "zjk",
      hub: { t: "塞外 · 五千年的龙", sp: "yuzhulong", lines: [
        { t: "narr", x: "出关往北，风变硬了。张家口的风里带着草籽和土腥味。" },
        { t: "say", id: "yuzhulong", x: "我在这儿躺了五千多年。你们管我叫玉猪龙，其实那时候还没有「龙」这个字。" },
        { t: "say", id: "jinqi", x: "红山文化的玉礼器，中华最早的龙形之一。塞外不是边角，是源头。" },
        { t: "narr", x: "图鉴亮起：一枚蜷曲的玉、一盏回首的雁灯、一条踞坐的小铜龙。" },
      ]},
      caps: [
        { t: "塞外 · 玉猪龙", sp: "yuzhulong", pick: "（蹲下来）我想摸摸这道五千年的弧。", lines: [
          { t: "say", id: "yuzhulong", x: "蜷曲如环，首尾相衔。红山人相信，这样就能生生不息。" },
          { t: "say", id: "yuzhui", x: "首尾相接，是没有开头、也没有结尾的意思。" },
          { t: "say", id: "yuzhulong", x: "那你把我带上。路，就不会断。" },
        ]},
        { t: "塞外 · 雁鱼灯", sp: "yanyudeng", pick: "（举起灯）这盏雁鱼灯，我想看它怎么「呼吸」。", lines: [
          { t: "narr", x: "一只回首衔鱼的大雁，铜铸的羽纹还看得清。" },
          { t: "say", id: "yanyudeng", x: "烟从我口里进，顺着脖颈沉进肚子里的水。他们管这叫「环保」。" },
          { t: "say", id: "xiangqi", x: "两千年前就懂得把烟留住。这脑子，值得学。" },
          { t: "say", id: "yanyudeng", x: "我给不了你光。我能给你一屋子干净的气。" },
        ]},
        { t: "塞外 · 金代铜坐龙", sp: "tongzuolong", pick: "（抬头）那条踞坐的小铜龙，在看什么？", lines: [
          { t: "narr", x: "一尊小铜龙踞坐着，昂首看向东北方向的雪线。" },
          { t: "say", id: "tongzuolong", x: "我原在太子城的行宫里。那是金代皇帝的路——他每年都要从这儿过。" },
          { t: "say", id: "jinqi", x: "如今那片地叫崇礼，冬奥的雪道就从旁边过。" },
          { t: "say", id: "tongzuolong", x: "路换了名字，人还在走。挺好。" },
        ]},
      ],
      win: { t: "塞外 · 结缘", sp: "yuzhulong", lines: [
        { t: "say", id: "yuzhulong", x: "龙的传人，果然都还记得来路。" },
        { t: "narr", x: "图鉴翻动：『第四站 · 石家庄』。" },
      ]} },

    /* 第四站 · 石家庄 */
    { id: "shijiazhuang", p: "sjz",
      hub: { t: "中山 · 一个被低估的国", sp: "tiezuding", lines: [
        { t: "narr", x: "石家庄，战国中山王厝的墓。这里的青铜，件件都带着一股不服气。" },
        { t: "say", id: "tiezuding", x: "我是中山王铁足铜鼎。铜身铁足，身上刻着四百六十九个字。" },
        { t: "say", id: "jinqi", x: "中山是白狄建立的国家，夹在燕赵之间，硬生生活出了自己的气象。" },
        { t: "narr", x: "图鉴亮起：一尊鼎、一棵灯树、一张龙凤盘绕的案座。" },
      ]},
      caps: [
        { t: "中山 · 铁足铜鼎", sp: "tiezuding", pick: "（拱手）四百六十九个字，我想听您念完。", lines: [
          { t: "say", id: "tiezuding", x: "「皇祖文武，桓祖成考」……开头是祭祖，后面是告诫子孙：别把国家弄丢了。" },
          { t: "say", id: "xuanzhi", x: "把教训刻在鼎上，是要它比人活得久。" },
          { t: "say", id: "tiezuding", x: "你们今天……还读得懂吗。" },
          { t: "say", id: "tiezuding", x: "……读得懂就好。" },
        ]},
        { t: "中山 · 十五连盏灯", sp: "lianzhandeng", pick: "（绕它一圈）这棵会发光的树，有几盏灯？", lines: [
          { t: "narr", x: "一棵青铜大树，枝头挑着十五盏灯盘，树上还攀着猴子和鸟。" },
          { t: "say", id: "lianzhandeng", x: "十五盏。一起点起来的时候，整间屋子像白天。" },
          { t: "say", id: "changxin", x: "同行啊。都是灯，你热闹，我安静。" },
          { t: "say", id: "lianzhandeng", x: "那你熄了，我替你亮着。" },
        ]},
        { t: "中山 · 四龙四凤案座", sp: "longfengfan", pick: "（低下头）这案座底下，为什么站着四只鹿？", lines: [
          { t: "narr", x: "四条龙、四只凤盘绕成一座案架，底下四只梅花鹿稳稳托着。" },
          { t: "say", id: "longfengfan", x: "龙在上，凤在中，鹿在下。中山人把天地人，摆成了一张案子。" },
          { t: "say", id: "xiangqi", x: "棋要稳，先稳底盘。这道理，铜上写着呢。" },
          { t: "say", id: "longfengfan", x: "抬得起重的，才配站最下面。" },
        ]},
      ],
      win: { t: "中山 · 结缘", sp: "tiezuding", lines: [
        { t: "say", id: "tiezuding", x: "中山虽小，气魄不小。记住这个道理。" },
        { t: "narr", x: "图鉴翻动：『第五站 · 邢台』。" },
      ]} },

    /* 第五站 · 邢台 */
    { id: "xingtai", p: "xt",
      hub: { t: "邢台 · 两千年的晚宴", sp: "cuojinhu", lines: [
        { t: "narr", x: "邢台南和左村汉墓。墓室里摆着一席宴，杯盘都还在原位。" },
        { t: "say", id: "cuojinhu", x: "我是错金四神几何纹长颈铜壶。我身上的金，是一丝一丝「绣」进去的。" },
        { t: "say", id: "yinqi", x: "蝉纹、几何纹、四神纹。这手艺，得把金子当线使。" },
        { t: "narr", x: "图鉴亮起：一只壶、一只会走路的小炉、一只商代铜爵。" },
      ]},
      caps: [
        { t: "邢台 · 错金铜壶", sp: "cuojinhu", pick: "（举杯）为你这两千年，先干一杯。", lines: [
          { t: "say", id: "cuojinhu", x: "等等——你先给我倒上。空着杯说话，不像话。" },
          { t: "narr", x: "你倒了一杯，酒香散开，墓室里忽然有了人气。" },
          { t: "say", id: "cuojinhu", x: "好。两千年了，第一次有人陪我喝。" },
        ]},
        { t: "邢台 · 会走路的炉", sp: "wenlu", pick: "（笑）那只会走路的温酒炉，在哪？", lines: [
          { t: "narr", x: "炉下装着三个小轮，兽柄上留着拉环磨出的亮痕。" },
          { t: "say", id: "wenlu", x: "一拽我，我就拖着满炉热酒走。汉代人喝酒，讲究到这种地步。" },
          { t: "say", id: "yinqi", x: "酒要热，人要暖。器物是替人操心的。" },
          { t: "say", id: "wenlu", x: "那你拽一下试试？我好久没走过路了。" },
        ]},
        { t: "邢台 · 「耳为父癸」铜爵", sp: "tongjue", pick: "（凑近）这只爵上的铭文，写的是什么？", lines: [
          { t: "narr", x: "一只商代铜爵，柱上铸着四个字：耳为父癸。" },
          { t: "say", id: "tongjue", x: "有个叫「耳」的人，为亡父「癸」铸了我。三千年前的一句话，刻在铜上。" },
          { t: "say", id: "xuanzhi", x: "名字是最短的家谱。有人写下来，这个人就没走远。" },
          { t: "say", id: "tongjue", x: "那你能不能，也替我记着他们。" },
        ]},
      ],
      win: { t: "邢台 · 结缘", sp: "cuojinhu", lines: [
        { t: "say", id: "cuojinhu", x: "能再遇上肯举杯的人，不容易。" },
        { t: "narr", x: "图鉴翻动：『第六站 · 承德』。" },
      ]} },
  ];

  /* ---------- 燕赵篇 · 承德 → 衡水 ---------- */
  const VN_ST_2 = [
    /* 第六站 · 承德 */
    { id: "chengde", p: "cd",
      hub: { t: "承德 · 山庄与庙", sp: "jituiping", lines: [
        { t: "narr", x: "承德。一半是避暑山庄的水，一半是外八庙的金顶。" },
        { t: "say", id: "jituiping", x: "我是辽代茶叶末釉鸡腿瓶。小口、长圆腹——契丹人把我绑在马背上，装着酒。" },
        { t: "say", id: "yinqi", x: "草原的酒器进了皇家园林。这城，本来就是两种水土调出来的。" },
        { t: "narr", x: "图鉴亮起：一只瓶、一只屋脊上的金凤凰、一尊骑骡的护法神。" },
      ]},
      caps: [
        { t: "承德 · 鸡腿瓶", sp: "jituiping", pick: "（拍了拍瓶腹）先跟这只马背上的瓶子聊聊。", lines: [
          { t: "say", id: "jituiping", x: "你别拍，我这肚子里的酒，几百年前就漏光了。" },
          { t: "say", id: "jituiping", x: "契丹人赶路，一天能走百里。走累了，就从我这儿倒一碗。" },
          { t: "say", id: "xiangqi", x: "路远的人，最懂得留一口给自己。" },
          { t: "say", id: "jituiping", x: "那这一口，我留给你。" },
        ]},
        { t: "承德 · 鎏金凤凰脊兽", sp: "jishou", pick: "（仰头）屋脊上那只金凤凰，为什么一直朝西南？", lines: [
          { t: "narr", x: "一只铜鎏金脊兽蹲在殿脊上，脚底刻着两个字：西南。" },
          { t: "say", id: "jishou", x: "我在普陀宗乘之庙的金顶上蹲了很久。后来被人凿下来，漂了整整一百年。" },
          { t: "say", id: "jinqi", x: "二〇二〇年，它回来了。脚底那两个字，就是它认路的路条。" },
          { t: "say", id: "jishou", x: "走得再远，只要记得朝哪边看，总能找回来。" },
        ]},
        { t: "承德 · 吉祥天母", sp: "jixiangtianmu", pick: "（合十）这尊骑骡的护法神，我想安静看看。", lines: [
          { t: "narr", x: "一尊铜吉祥天母像，骑着黄骡，神情不算温和，也不算凶。" },
          { t: "say", id: "jixiangtianmu", x: "我骑骡巡三界。拉萨人把我当城的守护神，承德的外八庙里，也有我的位置。" },
          { t: "say", id: "yuzhui", x: "护法神不一定温柔。肯挡在前面的，都是。" },
          { t: "say", id: "jixiangtianmu", x: "你往前走，我在后头看着。" },
        ]},
      ],
      win: { t: "承德 · 结缘", sp: "jituiping", lines: [
        { t: "say", id: "jituiping", x: "草原与园林，本是一家亲。" },
        { t: "narr", x: "图鉴翻动：『第七站 · 唐山』。" },
      ]} },

    /* 第七站 · 唐山 */
    { id: "tangshan", p: "ts",
      hub: { t: "唐山 · 窑火与铁火", sp: "caitaohu", lines: [
        { t: "narr", x: "唐山。一座烧了一千年窑、也打过一百年铁的城市。" },
        { t: "say", id: "caitaohu", x: "我是半山彩陶壶。四千多年前，黄河上游的人在我身上画满大圆圈和菱形网格。" },
        { t: "say", id: "qinghuaci", x: "彩陶在前，青花在后。我们这一家子，画了几千年。" },
        { t: "narr", x: "图鉴亮起：一只彩陶壶、一柄燕国铜戈、一座绿釉小楼。" },
      ]},
      caps: [
        { t: "唐山 · 半山彩陶壶", sp: "caitaohu", pick: "（凑近）这些圈圈，是随手画的吗？", lines: [
          { t: "say", id: "caitaohu", x: "不是随手。四个大圈套着菱形网格，一圈一圈，都是有数的。" },
          { t: "say", id: "qinghuaci", x: "没有稿子，没有尺子，画得比尺子还准。" },
          { t: "say", id: "caitaohu", x: "手稳，是因为心里静。" },
        ]},
        { t: "唐山 · 三穿直内铜戈", sp: "tongge", pick: "（伸手）这柄戈，我想掂一掂。", lines: [
          { t: "narr", x: "一柄燕国铜戈，胡上三穿，内是直的。刃口早钝了，脊线还在。" },
          { t: "say", id: "tongge", x: "别掂了，我轻得很。可当年，谁握着我，谁就得往前站。" },
          { t: "say", id: "jinqi", x: "「干戈」这两个字，就是从它身上来的。" },
          { t: "say", id: "tongge", x: "我希望你握着我的时候，是在田里，不是在战场上。" },
        ]},
        { t: "唐山 · 绿釉陶楼", sp: "lvyoutaolou", pick: "（蹲下看）这座小楼里，怎么还有人？", lines: [
          { t: "narr", x: "一座绿釉陶楼，层层出檐，楼里塑着小小的人。" },
          { t: "say", id: "lvyoutaolou", x: "汉代人信「事死如生」，所以把高楼也搬进了墓里。楼里那些小人，是一家人。" },
          { t: "say", id: "xuanzhi", x: "一座楼，一张全家福。汉朝人连死后的住处都安排得这么细。" },
          { t: "say", id: "lvyoutaolou", x: "你要不要进来坐坐。里头不冷。" },
        ]},
      ],
      win: { t: "唐山 · 结缘", sp: "caitaohu", lines: [
        { t: "say", id: "caitaohu", x: "窑火不熄，匠心不灭。" },
        { t: "narr", x: "图鉴翻动：『第八站 · 秦皇岛』。" },
      ]} },

    /* 第八站 · 秦皇岛 */
    { id: "qinhuangdao", p: "qhd",
      hub: { t: "秦皇岛 · 海与关", sp: "tonggui", lines: [
        { t: "narr", x: "秦皇岛。山海关的砖，渤海的浪，还有一场求仙入海的旧梦。" },
        { t: "say", id: "tonggui", x: "我是商代铜簋。贵族宴席上，我和鼎搭伴出场，盛满热腾腾的黍米饭。" },
        { t: "say", id: "jinqi", x: "鼎盛肉，簋盛饭。礼这东西，是从一日三餐里长出来的。" },
        { t: "narr", x: "图鉴亮起：一只铜簋、一峰彩绘骆驼、一只开满牡丹的瓷罐。" },
      ]},
      caps: [
        { t: "秦皇岛 · 商代铜簋", sp: "tonggui", pick: "（正色）我先拜一拜这只簋。", lines: [
          { t: "narr", x: "铜簋满身小乳钉与云雷纹，三千年了，纹路还咬得紧。" },
          { t: "say", id: "tonggui", x: "你不用拜我。你要拜的，是当年那些把饭盛进来的人。" },
          { t: "say", id: "wuzhuqian", x: "敬天敬祖，说到底敬的是「吃过饭」这件事。" },
          { t: "say", id: "tonggui", x: "那就坐下，先吃一口。" },
        ]},
        { t: "秦皇岛 · 彩绘陶骆驼", sp: "caihuiluotuo", pick: "（看着它）这峰骆驼，是从哪儿走来的？", lines: [
          { t: "narr", x: "一峰双峰驼，背驮货囊、颈挂响铃，彩绘已斑驳。" },
          { t: "say", id: "caihuiluotuo", x: "我从西域的商道上来。走了很久，走到海边，就走不动了。" },
          { t: "say", id: "xuanzhi", x: "丝路的尽头是海。海的那头，还有路。" },
          { t: "say", id: "caihuiluotuo", x: "那你替我走下去吧。我这几步，走得值。" },
        ]},
        { t: "秦皇岛 · 五彩牡丹罐", sp: "mudanguan", pick: "（笑）这罐子上的牡丹，开得真热闹。", lines: [
          { t: "narr", x: "白釉为地，釉上开花。红牡丹热热闹闹地开满罐身。" },
          { t: "say", id: "mudanguan", x: "「花开富贵」。清代人把最俗气的愿望，画在了最家常的罐子上。" },
          { t: "say", id: "qinghuaci", x: "不俗。日子过得下去的人，才敢盼富贵。" },
          { t: "say", id: "mudanguan", x: "那我就替你，把这花开着。" },
        ]},
      ],
      win: { t: "秦皇岛 · 结缘", sp: "tonggui", lines: [
        { t: "say", id: "tonggui", x: "海风吹了两千年，好在还有人记得礼。" },
        { t: "narr", x: "图鉴翻动：『第九站 · 廊坊』。" },
      ]} },

    /* 第九站 · 廊坊 */
    { id: "langfang", p: "lf",
      hub: { t: "廊坊 · 石上的慈悲", sp: "taihezaoxiang", lines: [
        { t: "narr", x: "廊坊。一尊北魏的石佛，眉眼低垂，坐着看了十五个世纪。" },
        { t: "say", id: "taihezaoxiang", x: "我是太和十一年的造像。背面刻着许愿文——刻的人，连名字都没留。" },
        { t: "say", id: "yuzhui", x: "他许的什么愿，你知道吗。" },
        { t: "narr", x: "图鉴亮起：一尊石佛、一座石灯楼、一尊小铜菩萨。" },
      ]},
      caps: [
        { t: "廊坊 · 太和造像", sp: "taihezaoxiang", pick: "（合十）我想读一读它背后的字。", lines: [
          { t: "narr", x: "「太和十一年」——石头上的一行小字，已经磨得很浅。" },
          { t: "say", id: "taihezaoxiang", x: "「愿亡者生天，现存安隐。」刻字的人，求的不是自己。" },
          { t: "say", id: "xuanzhi", x: "一句许愿，写了两个世界。" },
          { t: "say", id: "taihezaoxiang", x: "你也替我，念一遍吧。" },
        ]},
        { t: "廊坊 · 长明灯楼", sp: "changmingdenglou", pick: "（绕着走）这座石灯，为什么叫「长明」？", lines: [
          { t: "narr", x: "八角石柱上刻满佛像与伎乐，顶端托着一盏灯。" },
          { t: "say", id: "changmingdenglou", x: "灯油会干，火会灭。所以他们把「长明」两个字，刻在了石头上。" },
          { t: "say", id: "changxin", x: "我懂。灯是给别人看的，长明是给自己的。" },
          { t: "say", id: "changmingdenglou", x: "只要还有人点，就还亮着。" },
        ]},
        { t: "廊坊 · 铜鎏金菩萨", sp: "liujinpusa", pick: "（低头）这尊菩萨的金，怎么千年不褪？", lines: [
          { t: "narr", x: "一尊小铜菩萨，结跏趺坐，周身鎏金。" },
          { t: "say", id: "liujinpusa", x: "鎏金不是涂金漆。是把金子真正「烘」进铜面里，融成一层。" },
          { t: "say", id: "jinqi", x: "金子进了铜，就不是镀的一层皮了。它成了铜的一部分。" },
          { t: "say", id: "liujinpusa", x: "人也一样。你走过的路，会长进你身上。" },
        ]},
      ],
      win: { t: "廊坊 · 结缘", sp: "taihezaoxiang", lines: [
        { t: "say", id: "taihezaoxiang", x: "慈悲不灭，善念长存。" },
        { t: "narr", x: "图鉴翻动：『第十站 · 邯郸』。" },
      ]} },

    /* 第十站 · 邯郸 */
    { id: "handan", p: "hd",
      hub: { t: "邯郸 · 成语之乡", sp: "jinpaishi", lines: [
        { t: "narr", x: "邯郸。两千多个成语从这座城里长出来，像树上的叶子。" },
        { t: "say", id: "jinpaishi", x: "我是透雕螭龙纹金牌饰。先秦的金器里，我算稀罕物。" },
        { t: "say", id: "jinqi", x: "巴掌大的金牌，透雕两条螭龙。胡人的手艺，中原的审美。" },
        { t: "narr", x: "图鉴亮起：一枚金牌、一只顶着神兽的熨斗、一方会讲故事的瓷枕。" },
      ]},
      caps: [
        { t: "邯郸 · 透雕螭龙金牌饰", sp: "jinpaishi", pick: "（托在掌心）这金牌，轻得不像话。", lines: [
          { t: "narr", x: "金铜合金铸成，透雕两条昂首的螭龙，四角卷云环绕。" },
          { t: "say", id: "jinpaishi", x: "轻，才挂得住。太重的东西，人戴不住，也传不下去。" },
          { t: "say", id: "jinqi", x: "中原与草原，就在这一枚牌子上握了手。" },
          { t: "say", id: "jinpaishi", x: "你手上这点分量，是两条龙。" },
        ]},
        { t: "邯郸 · 刻度天禄熨斗", sp: "tianluyundou", pick: "（好奇）熨斗上为什么还带刻度？", lines: [
          { t: "narr", x: "细长支架上蹲着瑞兽「天禄」，斗身插在架中，斗上刻着刻度。" },
          { t: "say", id: "tianluyundou", x: "汉代熨斗带刻度，是极罕见的。他们要的不只是平，还要准。" },
          { t: "say", id: "xiangqi", x: "规矩刻在器物上，比写在纸上管用。" },
          { t: "say", id: "tianluyundou", x: "你量什么，就会变成什么。" },
        ]},
        { t: "邯郸 · 时苗留犊瓷枕", sp: "shimiaozhen", pick: "（俯身）这枕头上画的，是个什么故事？", lines: [
          { t: "narr", x: "白底黑花，松树下一辆牛车，一头小牛犊站在车边。" },
          { t: "say", id: "shimiaozhen", x: "东汉时苗到寿春做官，离任时把牛犊留下了——那是当地所生，不算他的。" },
          { t: "say", id: "xuanzhi", x: "磁州窑把「做官的道理」，画在了枕头上。天天枕着，天天记着。" },
          { t: "say", id: "shimiaozhen", x: "你要是困了，就枕着我睡一会儿。醒了我再讲。" },
        ]},
      ],
      win: { t: "邯郸 · 结缘", sp: "jinpaishi", lines: [
        { t: "say", id: "jinpaishi", x: "文明从来不是孤岛，是万千条路的交汇。" },
        { t: "narr", x: "图鉴翻动：『第十一站 · 衡水』。" },
      ]} },

    /* 第十一站 · 衡水 */
    { id: "hengshui", p: "hs",
      hub: { t: "衡水 · 冀州故地", sp: "lianhuazun", lines: [
        { t: "narr", x: "衡水，古冀州。一尊青瓷莲花尊立在展厅正中，像一朵站起来的花。" },
        { t: "say", id: "lianhuazun", x: "我是青釉仰覆莲花尊。盖是花，腹是花，层层莲瓣从口沿开到足底。" },
        { t: "say", id: "qinghuaci", x: "北朝工匠用青釉塑莲。那不是装饰，是把「清净」烧进了瓷里。" },
        { t: "narr", x: "图鉴亮起：一尊莲花尊、一座两米高的绿釉陶楼、一片刻着字的瓦当。" },
      ]},
      caps: [
        { t: "衡水 · 青釉莲花尊", sp: "lianhuazun", pick: "（轻声）我想绕着它走一圈。", lines: [
          { t: "narr", x: "你绕了一圈。每一面的莲瓣，开得都一样认真。" },
          { t: "say", id: "lianhuazun", x: "出淤泥而不染。可我也是从泥里烧出来的。" },
          { t: "say", id: "qinghuaci", x: "不染，不是没沾过泥。是沾过了，还开得干净。" },
          { t: "say", id: "lianhuazun", x: "那你记住这一圈。" },
        ]},
        { t: "衡水 · 东汉绿釉陶楼", sp: "taolou", pick: "（仰头）两米多高的陶楼，是怎么烧出来的？", lines: [
          { t: "narr", x: "台基、门楼、五层楼阁，一气烧进一捧陶土，通高两米一六。" },
          { t: "say", id: "taolou", x: "一整座楼，一次烧成。塌一点，就全废了。" },
          { t: "say", id: "caitaohu", x: "窑里的事，成了就成了，败了就败了。没有第二遍。" },
          { t: "say", id: "taolou", x: "所以我站着的时候，特别直。" },
        ]},
        { t: "衡水 · 长乐未央瓦当", sp: "wadang", pick: "（伸手）这片瓦当上的四个字，我认得。", lines: [
          { t: "narr", x: "一片灰色圆瓦，十字界格分出四格，刻着「长乐未央」。" },
          { t: "say", id: "wadang", x: "长久欢乐，没有尽头。汉朝人把它盖在屋檐上，天天抬头就看见。" },
          { t: "say", id: "wuzhuqian", x: "最好的祝福，要放在每天都能看见的地方。" },
          { t: "say", id: "wadang", x: "那我替你，盖在头顶上。" },
        ]},
      ],
      win: { t: "衡水 · 结缘", sp: "lianhuazun", lines: [
        { t: "say", id: "lianhuazun", x: "燕赵十一站，你走完了。下一站，出河北。" },
        { t: "narr", x: "图鉴合拢又翻开，最终一页庄严亮起：『第十二站 · 国博』。" },
      ]} },
  ];

  /* ---------- 出河北 · 国博 → 南京 ---------- */
  const VN_ST_3 = [
    /* 第十二站 · 国博（出河北） */
    { id: "guobo", p: "gb",
      hub: { t: "国博 · 殿堂之上", sp: "houmuwuding", lines: [
        { t: "narr", x: "中国国家博物馆。人很多，脚步很轻。你在展厅门口站了一会儿，才敢进去。" },
        { t: "say", id: "houmuwuding", x: "我是后母戊鼎。八百多公斤，两条立耳像两扇门。三千年了，我还站得稳。" },
        { t: "say", id: "wuzhuqian", x: "从沧州一头铁狮子，到这儿一尊大鼎。这一路，你长大了。" },
        { t: "narr", x: "图鉴亮起三处：一尊鼎、一只四羊的尊、一个笑着的陶俑。" },
      ]},
      caps: [
        { t: "国博 · 后母戊鼎", sp: "houmuwuding", pick: "（仰起头）我想先绕着它走一圈。", lines: [
          { t: "narr", x: "你仰头，才看清它鼎腹上那对巨大的兽面纹眼睛。" },
          { t: "say", id: "houmuwuding", x: "别急着说话。八百公斤的东西，不是用来看的，是用来量的。" },
          { t: "say", id: "jinqi", x: "量什么？" },
          { t: "say", id: "houmuwuding", x: "量一个人，肯为后人留下多重的东西。" },
        ]},
        { t: "国博 · 四羊方尊", sp: "siyangfangzun", pick: "（侧身）那四只羊，我想看清它们的角。", lines: [
          { t: "narr", x: "方尊肩上，四只卷角羊从容探出脑袋，像是从青铜里长出来的。" },
          { t: "say", id: "siyangfangzun", x: "四只羊朝着四个方向。铸我的人，想的不是好看，是「四方」。" },
          { t: "say", id: "xiangqi", x: "四方来朝，四时有序。器是拿来装道理的。" },
          { t: "say", id: "siyangfangzun", x: "你从哪个方向来？那就从那个方向，再往外看一次。" },
        ]},
        { t: "国博 · 击鼓说唱俑", sp: "shuochangyong", pick: "（忍不住笑）这个陶俑，怎么这么高兴？", lines: [
          { t: "narr", x: "一个陶俑，头裹小巾，额上皱纹挤成一团，笑得眼睛眯成缝。" },
          { t: "say", id: "shuochangyong", x: "我抱着鼓，举着槌，正要喊出那一声「好」——然后就被埋了两千年。" },
          { t: "say", id: "xuanzhi", x: "庙堂上的重器讲的是国。他讲的，是人。" },
          { t: "say", id: "shuochangyong", x: "让我把这句喊完吧。" },
          { t: "narr", x: "展厅里明明很安静，你却仿佛听见了一声喝彩。" },
        ]},
      ],
      win: { t: "国博 · 出河北", sp: "houmuwuding", lines: [
        { t: "say", id: "houmuwuding", x: "从这儿往北往南，还有十座馆。别以为出了河北，就到了头。" },
        { t: "narr", x: "图鉴翻开新的一页：『第十三站 · 故宫』。" },
      ]} },

    /* 第十三站 · 故宫 */
    { id: "gugong", p: "gg",
      hub: { t: "故宫 · 红墙之内", sp: "jinouyonggubei", lines: [
        { t: "narr", x: "故宫。红墙很高，日影一块一块地挪过砖地。" },
        { t: "say", id: "jinouyonggubei", x: "我是金瓯永固杯。乾隆每年元旦开笔，第一杯酒，要从我这里倒。" },
        { t: "say", id: "jinqi", x: "「金瓯永固」——他求的是江山像金子一样稳。" },
        { t: "narr", x: "图鉴亮起：一只酒杯、一幅五米长卷、一座五吨重的玉山。" },
      ]},
      caps: [
        { t: "故宫 · 金瓯永固杯", sp: "jinouyonggubei", pick: "（俯身）这只杯，一年只用一次？", lines: [
          { t: "narr", x: "一只满身珠宝的金杯，杯身錾着缠枝花，光从珠子上滑过去。" },
          { t: "say", id: "jinouyonggubei", x: "一年只用一次。用完就锁起来，等明年。" },
          { t: "say", id: "yinqi", x: "一年一次的酒，喝的是「又过了一年」。" },
          { t: "say", id: "jinouyonggubei", x: "你要不要也替自己，留一杯。" },
        ]},
        { t: "故宫 · 清明上河图", sp: "qingmingshanghetu", pick: "（凑近）这幅五米长的画，我该从哪头看？", lines: [
          { t: "narr", x: "绢本长卷，八百多人、六十多匹牲口，店铺舟车一眼望不到头。" },
          { t: "say", id: "qingmingshanghetu", x: "我是汴京的一天。从郊外的驴队，到城里的酒楼，全在这五米里。" },
          { t: "say", id: "xuanzhi", x: "画里的人不知道自己在画里。他们只是过日子。" },
          { t: "say", id: "qingmingshanghetu", x: "你找找看，桥上有没有一个像我一样，站着往下看的人。" },
        ]},
        { t: "故宫 · 大禹治水图玉山", sp: "dayuzhishui", pick: "（退后两步）这么大一块玉，是怎么运来的？", lines: [
          { t: "narr", x: "一块重逾五吨的青玉，雕着大禹率众凿山导水。" },
          { t: "say", id: "dayuzhishui", x: "玉从新疆来，走了三年才到京城。雕，又雕了十年。" },
          { t: "say", id: "yuzhui", x: "一块玉，走了十三年，才变成一座山。" },
          { t: "say", id: "dayuzhishui", x: "慢的东西，才留得久。" },
        ]},
      ],
      win: { t: "故宫 · 结缘", sp: "jinouyonggubei", lines: [
        { t: "say", id: "jinouyonggubei", x: "出了这道门往西走，八百里秦川在等你。" },
        { t: "narr", x: "图鉴翻动：『第十四站 · 陕西历史博物馆』。" },
      ]} },

    /* 第十四站 · 陕西 */
    { id: "shaanxi", p: "sx",
      hub: { t: "西安 · 十三朝的城", sp: "duhufu", lines: [
        { t: "narr", x: "西安。城墙根下有人唱秦腔，声音撞在砖上，又弹回来。" },
        { t: "say", id: "duhufu", x: "我是杜虎符。一分为二，合在一起才能调兵。「符合」这个词，从我身上来的。" },
        { t: "say", id: "xiangqi", x: "一半在君，一半在将。谁也不能一个人说了算。" },
        { t: "narr", x: "图鉴亮起：一枚虎符、一只兽首玛瑙杯、一把舞马银壶。" },
      ]},
      caps: [
        { t: "西安 · 杜虎符", sp: "duhufu", pick: "（摊开手）把左半给我吧。", lines: [
          { t: "narr", x: "一只青铜小虎，脊背上有错金铭文，从中间剖开。" },
          { t: "say", id: "duhufu", x: "你先拿左半。右半在别人手里——你得先学会信人。" },
          { t: "say", id: "xiangqi", x: "兵者，国之大事。所以连信任都要做成两半。" },
          { t: "say", id: "duhufu", x: "合得上，才是自己人。" },
        ]},
        { t: "西安 · 镶金兽首玛瑙杯", sp: "shoushoumanao", pick: "（凝视）这玛瑙的颜色，像凝住的光。", lines: [
          { t: "narr", x: "一只兽首形状的玛瑙杯，口沿镶着金边，红得像凝住的光。" },
          { t: "say", id: "shoushoumanao", x: "我从何家村窖藏里出来。唐人把西域的样式、波斯的工艺，全装进了一只杯子。" },
          { t: "say", id: "qinghuaci", x: "大唐的底气，是敢把别人的东西，变成自己的。" },
          { t: "say", id: "shoushoumanao", x: "你带我去看海吧。我还没见过它从哪边来。" },
        ]},
        { t: "西安 · 舞马衔杯银壶", sp: "wumaxianbei", pick: "（轻声）壶上这匹马，真的在跳舞吗？", lines: [
          { t: "narr", x: "银壶上鎏金的纹饰，是一匹衔着酒杯、随乐起舞的马。" },
          { t: "say", id: "wumaxianbei", x: "玄宗生日那天，四百匹马一起跳舞，衔杯上寿。我就是其中一匹。" },
          { t: "say", id: "yinqi", x: "马会跳舞，是因为有人真心待它。" },
          { t: "say", id: "wumaxianbei", x: "那你能不能，为我打一次拍子。" },
        ]},
      ],
      win: { t: "西安 · 结缘", sp: "duhufu", lines: [
        { t: "say", id: "duhufu", x: "十三朝的城，走一层土，就是一代人。" },
        { t: "narr", x: "图鉴翻动：『第十五站 · 河南博物院』。" },
      ]} },

    /* 第十五站 · 河南 */
    { id: "henan", p: "hn",
      hub: { t: "郑州 · 天地之中", sp: "jiahugudi", lines: [
        { t: "narr", x: "郑州。中原的土很厚，一脚下去，可能踩着八千年前。" },
        { t: "say", id: "jiahugudi", x: "我是贾湖骨笛。仙鹤的翅骨，钻了七个孔。我吹响的时候，中国还没有字。" },
        { t: "say", id: "xuanzhi", x: "先有声音，后有文字。音乐比史书老。" },
        { t: "narr", x: "图鉴亮起：一支骨笛、一件云纹铜禁、一只立着鹤的方壶。" },
      ]},
      caps: [
        { t: "郑州 · 贾湖骨笛", sp: "jiahugudi", pick: "（接过来）我可以试着吹一下吗？", lines: [
          { t: "narr", x: "一支细长的骨笛，孔位排得规整，管身还看得出骨质的纹。" },
          { t: "say", id: "jiahugudi", x: "你会吹么。不会也没关系，我可以教你。" },
          { t: "narr", x: "你试着吹了一下。声音很细，像风从很远的洞里过来。" },
          { t: "say", id: "jiahugudi", x: "九千年了，这个音还没变。" },
        ]},
        { t: "郑州 · 云纹铜禁", sp: "yunwentongjin", pick: "（纳闷）一件酒案，为什么叫「禁」？", lines: [
          { t: "narr", x: "一件镂空的云纹青铜器，层层云气盘绕，像一团凝固的雾。" },
          { t: "say", id: "yunwentongjin", x: "我是「禁」——放酒器的案子。取名「禁」，是提醒人别喝过头。" },
          { t: "say", id: "yinqi", x: "周人把「节制」两个字，铸成了一件家具。" },
          { t: "say", id: "yunwentongjin", x: "我身上这些云，是失蜡法铸的。两千多年前，中国就有了这门手艺。" },
        ]},
        { t: "郑州 · 莲鹤方壶", sp: "lianhefanghu", pick: "（抬头）顶上那只鹤，好像随时要飞。", lines: [
          { t: "narr", x: "方壶的莲瓣顶上，立着一只振翅欲飞的鹤。" },
          { t: "say", id: "lianhefanghu", x: "商周的青铜都肃穆。我偏要在顶上立一只鹤，让它想飞。" },
          { t: "say", id: "jinqi", x: "春秋的风，就是从这只鹤的翅膀底下开始吹的。" },
          { t: "say", id: "lianhefanghu", x: "你也想飞么。" },
        ]},
      ],
      win: { t: "郑州 · 结缘", sp: "jiahugudi", lines: [
        { t: "say", id: "jiahugudi", x: "听见了么。这一路的声音，比看到的还多。" },
        { t: "narr", x: "图鉴翻动：『第十六站 · 南京博物院』。" },
      ]} },

    /* 第十六站 · 南京 */
    { id: "nanjing", p: "nj",
      hub: { t: "南京 · 六朝烟水", sp: "zhulinqixian", lines: [
        { t: "narr", x: "南京。梧桐叶子落在青石板上，走起来沙沙响。" },
        { t: "say", id: "zhulinqixian", x: "我是竹林七贤与荣启期砖画。几百块砖拼成八个人，在竹林里喝酒、弹琴、什么都不干。" },
        { t: "say", id: "xiangqi", x: "魏晋的人，把「不想做事」做成了一门学问。" },
        { t: "narr", x: "图鉴亮起：一幅砖画、一盏牛形铜灯、一座鎏金小塔。" },
      ]},
      caps: [
        { t: "南京 · 竹林七贤砖画", sp: "zhulinqixian", pick: "（在画前站定）这八个人，都在干什么？", lines: [
          { t: "narr", x: "砖画上，八个人姿态各异，有人抚琴，有人仰头长啸。" },
          { t: "say", id: "zhulinqixian", x: "他们不是懒。是那个世道，做事不如不做。" },
          { t: "say", id: "xuanzhi", x: "于是他们把力气，全用来活成自己。" },
          { t: "say", id: "zhulinqixian", x: "你累的时候，就想想我们这一片竹林。" },
        ]},
        { t: "南京 · 错银铜牛灯", sp: "tongniudeng", pick: "（弯腰）牛肚子里，为什么有水？", lines: [
          { t: "narr", x: "一头错银的铜牛驮着灯盘，牛腹中空，能盛水。" },
          { t: "say", id: "tongniudeng", x: "烟从灯罩进牛颈，再沉进牛肚子里的水。东汉人管这叫「会呼吸的灯」。" },
          { t: "say", id: "yanyudeng", x: "同行。我也是靠肚子里那点水，把烟留住。" },
          { t: "say", id: "tongniudeng", x: "那咱们俩，一个天上飞，一个地上走。" },
        ]},
        { t: "南京 · 明鎏金喇嘛塔", sp: "lama_ta", pick: "（仰视）这座塔里，藏着什么？", lines: [
          { t: "narr", x: "一座通体鎏金的喇嘛塔，塔身嵌着宝石，塔内藏着舍利。" },
          { t: "say", id: "lama_ta", x: "我是明代宫廷赐给藏传佛教的。金是朝廷的，塔是信仰的。" },
          { t: "say", id: "jinqi", x: "一件东西，两头都认。" },
          { t: "say", id: "lama_ta", x: "你现在站的这块地，也是这样长起来的。" },
        ]},
      ],
      win: { t: "南京 · 结缘", sp: "zhulinqixian", lines: [
        { t: "say", id: "zhulinqixian", x: "六朝的烟水散了，人还在。" },
        { t: "narr", x: "图鉴翻动：『第十七站 · 上海博物馆』。" },
      ]} },
  ];

  /* ---------- 神州篇 · 上海 → 苏州 ---------- */
  const VN_ST_4 = [
    /* 第十七站 · 上海 */
    { id: "shanghai", p: "sh",
      hub: { t: "上海 · 江海交汇", sp: "dakeding", lines: [
        { t: "narr", x: "上海。江水入海的地方，船来船往，一城人讲着各处的口音。" },
        { t: "say", id: "dakeding", x: "我是大克鼎。西周的重器，内壁刻着两百九十多字——一位叫「克」的贵族受了赏，铸我记下来。" },
        { t: "say", id: "jinqi", x: "一座不产青铜的城市，藏着一件青铜重器。这就是「聚」。" },
        { t: "narr", x: "图鉴亮起：一尊鼎、一只方升、一幅缂丝莲塘。" },
      ]},
      caps: [
        { t: "上海 · 大克鼎", sp: "dakeding", pick: "（俯身）内壁那些字，我想慢慢读。", lines: [
          { t: "narr", x: "鼎内壁的铭文密密的，一笔一笔都还看得清。" },
          { t: "say", id: "dakeding", x: "记的是赏赐：田、臣、乐工。三千年前的一份清单。" },
          { t: "say", id: "wuzhuqian", x: "钱、田、人。三千年，账目没变过。" },
          { t: "say", id: "dakeding", x: "可这份账里还写了「不敢忘」。这才是我想让你读的。" },
        ]},
        { t: "上海 · 商鞅方升", sp: "shangyangfangsheng", pick: "（拿起放大镜）这么小一只升，也要刻字？", lines: [
          { t: "narr", x: "一个小小的青铜方升，侧面刻着铭文，底部还有一行更晚的刻字。" },
          { t: "say", id: "shangyangfangsheng", x: "商鞅变法，统一度量衡。全国的量器，都要照我这个样子。" },
          { t: "say", id: "xiangqi", x: "一件小方升，把「一样」两个字，量进了整个天下。" },
          { t: "say", id: "shangyangfangsheng", x: "你信不信——同样的东西，得先有同样的尺子。" },
        ]},
        { t: "上海 · 缂丝莲塘乳鸭图", sp: "kesilian", pick: "（贴近玻璃）这真是织出来的？", lines: [
          { t: "narr", x: "缂丝织出的莲塘，莲花与乳鸭纤毫毕现，一寸一寸织成。" },
          { t: "say", id: "kesilian", x: "一寸缂丝一寸金。我这一池莲塘，织了很久。" },
          { t: "say", id: "qinghuaci", x: "画是一笔画出来的，她是千万根线换着织出来的。" },
          { t: "say", id: "kesilian", x: "你走近些看。莲叶的边上，还有线头。" },
        ]},
      ],
      win: { t: "上海 · 结缘", sp: "dakeding", lines: [
        { t: "say", id: "dakeding", x: "聚起来的东西，才走得远。" },
        { t: "narr", x: "图鉴翻动：『第十八站 · 湖北省博物馆』。" },
      ]} },

    /* 第十八站 · 湖北 */
    { id: "hubei", p: "hb",
      hub: { t: "武汉 · 楚人的浪漫", sp: "zenghouyibianzhong", lines: [
        { t: "narr", x: "武汉。江与汉水在这里碰头，雾气一层一层压在江面上。" },
        { t: "say", id: "zenghouyibianzhong", x: "我是曾侯乙编钟。六十五件，一钟双音，音域跨五个半八度。" },
        { t: "say", id: "xiangqi", x: "一钟双音——敲正面一个音，敲侧面又一个音。这脑子是怎么长的。" },
        { t: "narr", x: "图鉴亮起：一套编钟、一柄越王剑、一只鹿角仙鹤。" },
      ]},
      caps: [
        { t: "武汉 · 曾侯乙编钟", sp: "zenghouyibianzhong", pick: "（举起槌子）我可以敲一下吗？", lines: [
          { t: "narr", x: "六十五件青铜钟按大小排开，钟架上的漆色还亮。" },
          { t: "say", id: "zenghouyibianzhong", x: "你敲中间那件试试。轻一点。" },
          { t: "narr", x: "一声闷响，余音在厅里转了两圈才落下去。" },
          { t: "say", id: "zenghouyibianzhong", x: "这一声，两千四百年没人听过了。" },
        ]},
        { t: "武汉 · 越王勾践剑", sp: "goujianjian", pick: "（凝神）这剑，真的两千四百年不锈？", lines: [
          { t: "narr", x: "一柄青铜剑，剑身满布菱形暗纹，历两千四百年依然寒光凛冽。" },
          { t: "say", id: "goujianjian", x: "「越王鸠浅，自作用剑」。我主人等了十年，才等到出鞘那天。" },
          { t: "say", id: "jinqi", x: "卧薪尝胆，尝的不是胆，是时间。" },
          { t: "say", id: "goujianjian", x: "你握着我的时候，别抖。" },
        ]},
        { t: "武汉 · 鹿角立鹤", sp: "lujiaolihe", pick: "（仰头）一只鹤，为什么长着鹿角？", lines: [
          { t: "narr", x: "一只青铜仙鹤，头顶鹿角，昂首展翅。" },
          { t: "say", id: "lujiaolihe", x: "楚人让我长着鹿角，是让我能上天，也能在人间走。" },
          { t: "say", id: "yuzhui", x: "通天的路，也要踩着地走。" },
          { t: "say", id: "lujiaolihe", x: "那我替你，走在前面。" },
        ]},
      ],
      win: { t: "武汉 · 结缘", sp: "zenghouyibianzhong", lines: [
        { t: "say", id: "zenghouyibianzhong", x: "楚人信巫，也信美。这两样，都不讲道理。" },
        { t: "narr", x: "图鉴翻动：『第十九站 · 湖南博物院』。" },
      ]} },

    /* 第十九站 · 湖南 */
    { id: "hunan", p: "hun",
      hub: { t: "长沙 · 马王堆", sp: "sushadanyi", lines: [
        { t: "narr", x: "长沙。夏天潮热，樟树的香味压不住。" },
        { t: "say", id: "sushadanyi", x: "我是素纱襌衣。重四十九克，薄如蝉翼，叠起来能放进一只火柴盒。" },
        { t: "say", id: "qinghuaci", x: "四十九克。一件衣服，比一张纸还轻。" },
        { t: "narr", x: "图鉴亮起：一件纱衣、一幅 T 形帛画、一尊长着人脸的鼎。" },
      ]},
      caps: [
        { t: "长沙 · 素纱襌衣", sp: "sushadanyi", pick: "（屏住呼吸）我想隔着它看看天。", lines: [
          { t: "narr", x: "纱衣摊在展台上，罩着一层玻璃，几乎看不见。" },
          { t: "say", id: "sushadanyi", x: "汉代人穿我在锦袍外面。一层薄纱，遮不住什么，只是好看。" },
          { t: "say", id: "xuanzhi", x: "有些东西，就是为了「好看」才存在的。" },
          { t: "say", id: "sushadanyi", x: "你把手举起来，隔着我看看。天是灰的，还是蓝的？" },
        ]},
        { t: "长沙 · T 形帛画", sp: "tbo_hua", pick: "（后退一步）这幅画，分了三层？", lines: [
          { t: "narr", x: "一幅 T 字形帛画，上中下三段：天上、人间、地下。" },
          { t: "say", id: "tbo_hua", x: "我是墓主人升仙的「通行证」。日月在上，人间在中，黄泉在下。" },
          { t: "say", id: "xuanzhi", x: "一幅画，把整个宇宙装进去了。" },
          { t: "say", id: "tbo_hua", x: "你走这一路，也是从地上往天上走。" },
        ]},
        { t: "长沙 · 人面纹方鼎", sp: "renmianfangding", pick: "（与它对视）这鼎上，怎么是人的脸？", lines: [
          { t: "narr", x: "鼎腹四面各铸着一张人脸，神情肃穆，眼睛直视前方。" },
          { t: "say", id: "renmianfangding", x: "全国只有我这一件，以人面为饰的商代方鼎。" },
          { t: "say", id: "jinqi", x: "商人敬鬼神，却敢把人的脸，铸在礼器上。" },
          { t: "say", id: "renmianfangding", x: "你看着我。我也看着你。" },
        ]},
      ],
      win: { t: "长沙 · 结缘", sp: "sushadanyi", lines: [
        { t: "say", id: "sushadanyi", x: "轻的东西，飞得远。" },
        { t: "narr", x: "图鉴翻动：『第二十站 · 三星堆』。" },
      ]} },

    /* 第二十站 · 三星堆 */
    { id: "sanxingdui", p: "sxd",
      hub: { t: "广汉 · 古蜀的眼睛", sp: "zongmumianju", lines: [
        { t: "narr", x: "广汉。稻田中间几座土丘，谁也没想到这里埋着一个王国。" },
        { t: "say", id: "zongmumianju", x: "我是青铜纵目面具。眼睛凸出十六厘米，耳朵像两片张开的翼。" },
        { t: "say", id: "xuanzhi", x: "千里眼，顺风耳。古蜀人想看多远，就铸多远。" },
        { t: "narr", x: "图鉴亮起：一尊巨人、一张面具、一根金杖。" },
      ]},
      caps: [
        { t: "广汉 · 青铜纵目面具", sp: "zongmumianju", pick: "（仰头对视）你的眼睛，在看哪里？", lines: [
          { t: "narr", x: "面具巨大，双目如圆柱般凸出，嘴角微微上扬。" },
          { t: "say", id: "zongmumianju", x: "你们看我像神。我其实是他们「想看见」的样子。" },
          { t: "say", id: "xiangqi", x: "人先想要一双看得远的眼睛，才把它铸出来。" },
          { t: "say", id: "zongmumianju", x: "你替我看看，三千年后的世界，看得清么。" },
        ]},
        { t: "广汉 · 青铜大立人", sp: "dali_ren", pick: "（绕到侧面）他手里，原本握着什么？", lines: [
          { t: "narr", x: "一尊高近三米的青铜巨人，双手环握，赤足立在座上。" },
          { t: "say", id: "dali_ren", x: "我手里原本握着什么，没人知道。象牙、玉琮，还是一根看不见的东西。" },
          { t: "say", id: "jinqi", x: "空着手站了三千年，也不肯把手放下。" },
          { t: "say", id: "dali_ren", x: "有些姿势，是不能改的。" },
        ]},
        { t: "广汉 · 金杖", sp: "jinzhang", pick: "（俯身）杖上的鱼和鸟，是什么记号？", lines: [
          { t: "narr", x: "一根纯金的手杖，杖身刻着鱼、鸟、箭与人面。" },
          { t: "say", id: "jinzhang", x: "我是古蜀王的权杖。鱼、鸟、箭——他们把自己的来历，刻在了一根金子上。" },
          { t: "say", id: "yuzhui", x: "权柄会旧，刻上去的故事不会。" },
          { t: "say", id: "jinzhang", x: "那你握住我一头。另一头，我替你指路。" },
        ]},
      ],
      win: { t: "广汉 · 结缘", sp: "zongmumianju", lines: [
        { t: "say", id: "zongmumianju", x: "古蜀没有留下一个字。可我们一直在说话。" },
        { t: "narr", x: "图鉴翻动：『第二十一站 · 辽宁省博物馆』。" },
      ]} },

    /* 第二十一站 · 辽宁 */
    { id: "liaoning", p: "ln",
      hub: { t: "沈阳 · 关外风华", sp: "zanhuashinv", lines: [
        { t: "narr", x: "沈阳。关外的风干净利落，天黑得早，灯亮得也早。" },
        { t: "say", id: "zanhuashinv", x: "我是周昉的《簪花仕女图》。几位贵妇在园中走，头上簪着花，衣裙被风托起来。" },
        { t: "say", id: "xuanzhi", x: "大唐的雍容，不是胖，是松。" },
        { t: "narr", x: "图鉴亮起：一幅仕女图、一只鸭形玻璃器、一只卧着的鎏金羊。" },
      ]},
      caps: [
        { t: "沈阳 · 簪花仕女图", sp: "zanhuashinv", pick: "（放轻脚步）她们好像不着急。", lines: [
          { t: "narr", x: "画卷上，贵妇的纱衣薄得能看见手臂，发间一朵大花。" },
          { t: "say", id: "zanhuashinv", x: "她们不急。走一步，停一步，逗狗、拈花、看鹤。" },
          { t: "say", id: "yuzhui", x: "慢下来的人，才看得见自己好看。" },
          { t: "say", id: "zanhuashinv", x: "你也把肩松一松。" },
        ]},
        { t: "沈阳 · 鸭形玻璃注", sp: "yaxingboli", pick: "（蹲下）这只鸭子，肚子里有水？", lines: [
          { t: "narr", x: "一只鸭形玻璃器，晶莹剔透，肚子里能注水，重心一偏就自己立正。" },
          { t: "say", id: "yaxingboli", x: "我从西亚来，走的是草原丝绸之路。玻璃这手艺，当时中国还不会。" },
          { t: "say", id: "qinghuaci", x: "一只鸭子，从地中海走到了辽河。" },
          { t: "say", id: "yaxingboli", x: "你把我灌满水，我就低下头；倒空了，我又抬起来。" },
        ]},
        { t: "沈阳 · 鎏金铜卧羊", sp: "liujintongwoyang", pick: "（轻声）这只羊，睡得很安稳。", lines: [
          { t: "narr", x: "一只通体鎏金的铜羊静静卧着，四肢收在身下。" },
          { t: "say", id: "liujintongwoyang", x: "我是唐代宫廷的席镇。压着席角，也压着一屋子的安稳。" },
          { t: "say", id: "jinqi", x: "金子做的羊，不跑，也不叫。" },
          { t: "say", id: "liujintongwoyang", x: "该动的时候动，该卧的时候卧。这也是一种本事。" },
        ]},
      ],
      win: { t: "沈阳 · 结缘", sp: "zanhuashinv", lines: [
        { t: "say", id: "zanhuashinv", x: "关外的花，开得晚，也开得久。" },
        { t: "narr", x: "图鉴翻动：『第二十二站 · 苏州博物馆』。" },
      ]} },

    /* 第二十二站 · 苏州 */
    { id: "suzhou", p: "sz",
      hub: { t: "苏州 · 一园一世界", sp: "wenzhengshan", lines: [
        { t: "narr", x: "苏州。白墙、黑瓦、一池水。风一吹，墙上的影子就动了。" },
        { t: "say", id: "wenzhengshan", x: "我是文徵明亲手栽的紫藤。四百多年了，年年还开花。" },
        { t: "say", id: "xuanzhi", x: "一株活着的藏品。别的都在柜子里，它在院子里。" },
        { t: "narr", x: "图鉴亮起：一只莲花碗、一座珍珠宝幢、一株紫藤。" },
      ]},
      caps: [
        { t: "苏州 · 文衡山手植紫藤", sp: "wenzhengshan", pick: "（走到藤下）我在这儿站一会儿。", lines: [
          { t: "narr", x: "老藤盘在架上，枝条粗得像手臂，一串串花垂下来。" },
          { t: "say", id: "wenzhengshan", x: "文徵明当年在这院里写字，累了就到藤下坐坐。" },
          { t: "say", id: "xuanzhi", x: "他写的字留下来了，他坐过的地方也留下来了。" },
          { t: "say", id: "wenzhengshan", x: "你在藤下站一会儿。四百年，就是这么过来的。" },
        ]},
        { t: "苏州 · 秘色瓷莲花碗", sp: "misecilianhuawan", pick: "（俯身）这釉色，像一块冰。", lines: [
          { t: "narr", x: "一只莲花状的青瓷碗，釉色如冰似玉，光是看着就觉得凉。" },
          { t: "say", id: "misecilianhuawan", x: "「秘色」两个字，困了人们一千年。文献里有，东西找不到。" },
          { t: "say", id: "qinghuaci", x: "直到法门寺地宫打开，账册上一句「秘色瓷」，才对上了实物。" },
          { t: "say", id: "misecilianhuawan", x: "有些谜，是要等一千年才解的。" },
        ]},
        { t: "苏州 · 真珠舍利宝幢", sp: "zhenzhushielibaochuang", pick: "（数不过来）这里一共有多少颗珍珠？", lines: [
          { t: "narr", x: "一座用金银、珍珠、水晶、玛瑙打造的宝幢，层层叠叠，宝光流转。" },
          { t: "say", id: "zhenzhushielibaochuang", x: "我是北宋匠人做的。三万颗珍珠，一颗一颗串上去。" },
          { t: "say", id: "jinqi", x: "做这东西的人，一辈子大概只做这一件。" },
          { t: "say", id: "zhenzhushielibaochuang", x: "你把眼睛借我一下。我想再看看光。" },
        ]},
      ],
      win: { t: "苏州 · 全图鉴", sp: "wenzhengshan", lines: [
        { t: "say", id: "wenzhengshan", x: "二十二站，走完了。最后一页，在等你。" },
        { t: "narr", x: "图鉴合上，又自己翻开。空白的那一页上，浮出两个字：『华夏』。" },
      ]} },
  ];

  /* ================= 终章 ================= */
  const VN_FINAL = {
    id: "hx_end", station: "huaxia", kind: "end", title: "终章 · 华夏永续", speaker: "wuzhuqian",
    lines: [
      { t: "narr", x: "从沧州的铁狮子，到苏州的一株紫藤。图鉴的最后一页，终于满了。" },
      { t: "say", id: "wuzhuqian", x: "你走了二十个馆，六十多件器物。可你真正捉住的，不是它们。" },
      { t: "say", id: "yuzhui", x: "是它们背后，那些没留下名字的人。" },
      { t: "say", id: "houmuwuding", x: "文物的意义，不在柜中沉睡，而在被一代代人记住、讲述、再讲给下一个人听。" },
      { t: "narr", x: "初始七友与一路结缘的精灵，齐齐围拢，向你深深一礼。" },
    ],
    ending: "huaxia_yongxu",
    endingTitle: "结局 · 华夏永续",
    endingText: "你从沧州出发，走过燕赵十一站，出河北、入国博，再南下北上走过十座大馆，最终回到「华夏」这两个字里。这一路，是文物精灵送给你、也送给中华文明的赞歌。",
  };

  const VN_STATIONS = [].concat(VN_ST_1, VN_ST_2, VN_ST_3, VN_ST_4);

  /* ================= 构链：站点剧本 → 流程图节点 =================
   * 每站 5 个节点：hub(0) / cap1(1) / cap2(2) / cap3(3) / win(4)
   * 连线：hub→cap×3（三条道）、cap→win、win→下一站hub
   * ========================================================= */
  const VN_MAIN = (function () {
    const arr = [];
    VN_OPEN._g = 0; VN_OPEN._slot = 0;
    arr.push(VN_OPEN);
    VN_STATIONS.forEach((st, si) => {
      const p = st.p, gi = si + 1;
      const hubId = p + "_hub", winId = p + "_win";
      const nx = VN_STATIONS[si + 1];
      const hub = {
        id: hubId, station: st.id, kind: "hub",
        title: st.hub.t, speaker: st.hub.sp, lines: st.hub.lines, ai: true,
        choices: st.caps.map((c, i) => ({
          label: c.t.split(" · ").pop(),
          text: c.pick,
          to: p + "_c" + (i + 1),
        })),
        next: winId, _g: gi, _slot: 0,
      };
      arr.push(hub);
      st.caps.forEach((c, i) => {
        arr.push({
          id: p + "_c" + (i + 1), station: st.id, kind: "capture",
          title: c.t, speaker: c.sp, lines: c.lines, ai: true, next: winId, _g: gi, _slot: i + 1,
          choices: [{
            label: "与之结缘",
            text: "（向" + vnSpiritName(c.sp) + "伸出手）",
            to: winId,
            ending: p + "_e" + (i + 1),
          }],
        });
      });
      arr.push({
        id: winId, station: st.id, kind: "win",
        title: st.win.t, speaker: st.win.sp, lines: st.win.lines, ai: true,
        next: nx ? nx.p + "_hub" : "hx_end", _g: gi, _slot: 4,
      });
    });
    VN_FINAL._g = VN_STATIONS.length + 1; VN_FINAL._slot = 0;
    arr.push(VN_FINAL);
    return arr;
  })();

  /* 坐标：蛇形排布（每 3 站一列，横向铺开再折返，适合横屏） */
  /* 坐标：底特律式横向推进 + 蛇形折返
   * 每站 = 一条横向带：hub 在行首 → 三条道向上/中/下扇形展开 → win 收在行尾
   * 一行 5 站，奇数行整体镜像（从右往左推进），相邻两行首尾相接
   * 注意：n._g 是「站点序号」（0=开场，1..22=各站），不是节点序号 */
  (function vnLayout() {
    const PER_ROW = 5, SW = 990, SPAN = 640, RH = 580;
    const offsX = [0, 320, 320, 320, SPAN];   // hub / 三条道 / win
    const offsY = [0, -190, 0, 190, 0];       // 上 / 中 / 下
    VN_MAIN.forEach(n => {
      if (n._g === 0) {                        // 开场节点单独摆在沧州左侧
        n.x = -430; n.y = 0; n._row = 0;
        return;
      }
      const grp = n._g - 1;
      const row = Math.floor(grp / PER_ROW);
      let idx = grp % PER_ROW;
      const flip = row % 2 === 1;
      if (flip) idx = PER_ROW - 1 - idx;
      const x0 = idx * SW, cy = row * RH;
      const ox = offsX[n._slot];
      n.x = x0 + (flip ? SPAN - ox : ox);
      n.y = cy + offsY[n._slot];
      n._row = row;
    });
  })();

  function vnNode(id) { return VN_MAIN.find(n => n.id === id); }

  /* ================= 随机事件池（本机兜底） ================= */
  const VN_EVENT_POOL = [
    { title: "偶遇 · 路边茶摊", lines: [
      { t: "narr", x: "赶路途中，你在一间小茶摊歇脚。茶香里，一位游方老人递来一盏清茶。" },
      { t: "say", id: "xuanzhi", x: "歇一歇吧。古人行路，也讲究小憩片刻，再整行装。" },
    ]},
    { title: "奇缘 · 图鉴低语", lines: [
      { t: "narr", x: "夜深了，图鉴忽然自己翻动，一页页低声吟唱，像在背一首很老的歌。" },
      { t: "say", id: "yuzhui", x: "它在提醒你——前头还有更多睡着的伙伴，别停下脚。" },
    ]},
    { title: "历练 · 星夜谈古", lines: [
      { t: "narr", x: "篝火旁，精灵们围坐一圈，讲起各自朝代的见闻，星星都听得入了神。" },
      { t: "say", id: "xiangqi", x: "车有车路，马有马路。走得稳，才走得远。" },
    ]},
    { title: "问心 · 古镇石板", lines: [
      { t: "narr", x: "你踏上一条被岁月磨亮的石板路，每一道纹，都是前人的脚印。" },
      { t: "say", id: "wuzhuqian", x: "记住脚下的路。每一枚钱、每一件物，都是前人走过的证明。" },
    ]},
    { title: "暖意 · 市集灯火", lines: [
      { t: "narr", x: "路过一处夜市，灯笼次第亮起，叫卖声、笑声，热闹得像一个不散的梦。" },
      { t: "say", id: "jinqi", x: "人间的烟火气，才是最金贵的器物。" },
    ]},
    { title: "夜雨 · 檐下借宿", lines: [
      { t: "narr", x: "夜雨忽至，你躲进一间旧祠堂的檐下。雨水顺着瓦当滴成一条线。" },
      { t: "say", id: "wadang", x: "长乐未央——刻在我身上的四个字，就是替这样的夜晚许的愿。" },
    ]},
    { title: "偶得 · 碎瓷一片", lines: [
      { t: "narr", x: "土坡塌了一角，露出一片带青花的碎瓷。你把它捧在手心。" },
      { t: "say", id: "qinghuaci", x: "别嫌它碎。碎过的东西，才知道自己是怎么来的。" },
    ]},
    { title: "夜谈 · 银匠铺子", lines: [
      { t: "narr", x: "镇口一间银匠铺还亮着灯，锤声一下一下，很稳。" },
      { t: "say", id: "yinqi", x: "一块银，要挨上千锤才成形。急不得——人也一样。" },
    ]},
    { title: "奇遇 · 荒寺钟声", lines: [
      { t: "narr", x: "荒寺无人，钟却自己响了一声。回声在山谷里滚了很久。" },
      { t: "say", id: "jinqi", x: "钟是铜铸的。铜记得每一次撞击，也记得每一次停手。" },
    ]},
    { title: "温故 · 老农说古", lines: [
      { t: "narr", x: "田埂上，一位老农歇着锄头，跟你讲起村里早年挖出的旧物。" },
      { t: "say", id: "xuanzhi", x: "史书是写下来的，这些是没写下来的史书。" },
    ]},
    { title: "险路 · 山道失足", lines: [
      { t: "narr", x: "山道湿滑，你一脚踩空，被谁在半空中稳稳扶住。" },
      { t: "say", id: "yuzhui", x: "小心些。我还等着你走到最后那一站呢。" },
    ]},
    { title: "静坐 · 河畔无人", lines: [
      { t: "narr", x: "河面平得像一块玉。你坐下，什么也不想，只听水声。" },
      { t: "say", id: "yubi", x: "有些路，是要停下来才走得完的。" },
    ]},
    { title: "巧遇 · 孩童问字", lines: [
      { t: "narr", x: "一个小孩举着书跑来，指着青铜器上的字问你念什么。" },
      { t: "say", id: "xiangqi", x: "你看，字还没死。还有人在问它怎么念。" },
    ]},
    { title: "风起 · 城头看雪", lines: [
      { t: "narr", x: "城头风大，雪粒打在脸上。远处灯火，一盏一盏地亮。" },
      { t: "say", id: "qinghuaci", x: "我漂洋过海那几年，最想的就是这样的灯火。" },
    ]},
  ];
  /* 站点相关事件（每个站点专属一条，命中率更高） */
  const VN_EVENT_TIP = {
    cangzhou: "涛声 · 夜宿海堡", baoding: "灯下 · 满城夜话", zhangjiakou: "风沙 · 关口换马",
    shijiazhuang: "山雨 · 中山旧道", xingtai: "酒醒 · 汉墓晨光", chengde: "晨钟 · 山庄薄雾",
    tangshan: "窑火 · 通宵未熄", qinhuangdao: "潮落 · 拾贝人", langfang: "石刻 · 一凿一凿",
    handan: "巷口 · 学步孩童", hengshui: "荷塘 · 采莲谣", guobo: "长队 · 一馆千人",
    gugong: "红墙 · 落日照影", shaanxi: "驼铃 · 西市旧梦", henan: "骨笛 · 一声九千年",
    nanjing: "砖画 · 竹林风声", shanghai: "江海 · 万国来船", hubei: "编钟 · 一钟双音",
    hunan: "楚辞 · 夜诵一章", sanxingdui: "面具 · 望向何方", liaoning: "雪原 · 一行驼印",
    suzhou: "紫藤 · 花开四百年", huaxia: "书页 · 合上又开",
  };

  /* ================= 云端续写（副节点 / 随机事件） ================= */
  const VN_CLOUD_SYS = "你是国风游戏「文物精灵」的支线编剧。玩家正走在一条从沧州到全国的捕捉文物精灵主线里，两个主节点之间需要一段短小的随机事件过渡。请为当前站点写一个 2~3 句的小事件：一句旁白铺垫 + 1~2 句精灵搭话。硬规矩：①只用给出的文物/站点资料里的事实，不编造史实人名数字；②口语化、有古意但不文言；③每句 10~60 字；④只输出 JSON：{\"title\":\"事件标题(6~12字)\",\"lines\":[{\"who\":\"旁白\"或精灵名,\"x\":\"一句话\"}]}，不要代码块。";
  function vnCloudEventMessages(stationId, prevNode) {
    const facts = [];
    if (prevNode && prevNode.speaker && SPIRITS[prevNode.speaker]) {
      const s = SPIRITS[prevNode.speaker];
      facts.push(s.name + "：" + String(s.intro || "").slice(0, 80));
    }
    return [
      { role: "system", content: VN_CLOUD_SYS },
      { role: "user", content: JSON.stringify({
        场景: "文物精灵主线 · 随机事件过渡",
        当前站点: vnShortStation(stationId),
        上一个节点: prevNode ? prevNode.title : "",
        相关精灵: facts,
      }) },
    ];
  }
  function vnCloudEventParse(text) {
    let j = null;
    try { const m = String(text || "").match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch (e) { j = null; }
    if (!j || !Array.isArray(j.lines)) return null;
    const lines = [];
    j.lines.slice(0, 6).forEach(l => {
      if (!l) return;
      let x = String(l.x == null ? "" : l.x).replace(/\s+/g, " ").trim();
      if (!x) return;
      if (x.length > 90) x = x.slice(0, 90);
      const w = String(l.who == null ? "" : l.who).trim();
      if (!w || w === "旁白" || w === "narr") { lines.push({ t: "narr", x: x }); return; }
      let sid = null;
      if (SPIRITS) { for (const k in SPIRITS) { if (SPIRITS[k].name === w || SPIRITS[k].alias === w) { sid = k; break; } } }
      lines.push({ t: "say", id: sid, name: w, x: x });
    });
    if (!lines.length) return null;
    return { title: String(j.title || "路遇奇缘").slice(0, 16), lines: lines };
  }
  function vnCloudReady() {
    if (VN.cloudFail) return false;
    if (typeof fetch !== "function") return false;
    return typeof teaCloudDirect === "function" && typeof identDirectKey === "function" && !!identDirectKey();
  }

  function vnHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 99991; return h; }
  function vnEventFor(node) {
    if (VN.generated[node.id]) return VN.generated[node.id];
    const idx = (VN.eventIdx[node.id] || 0);
    VN.eventIdx[node.id] = idx + 1;
    const pool = VN_EVENT_POOL;
    let ev = pool[(vnHash(node.station) + idx) % pool.length];
    // 每站第一条优先用专属事件
    const tip = VN_EVENT_TIP[node.station];
    if (idx === 0 && tip && VN.path.indexOf(node.id) < 0) {
      const sp = node.speaker;
      ev = { title: tip, lines: [
        { t: "narr", x: "在" + vnShortStation(node.station) + "，你遇到了一点计划之外的小事。" },
        { t: "say", id: sp, x: "别急着赶路。有些东西，只有慢下来才看得见。" },
      ]};
    }
    VN.generated[node.id] = { title: ev.title, lines: ev.lines, local: true };
    return VN.generated[node.id];
  }
  async function vnTryCloudEvent(parent) {
    if (!vnCloudReady()) return;
    const cached = VN.generated[parent.id];
    if (cached && cached.cloud) return;
    VN.busy = true; vnPaint();
    try {
      const d = await teaCloudDirect(vnCloudEventMessages(parent.station, parent), 18000);
      const ev = vnCloudEventParse(d && d.text);
      if (ev) {
        VN.generated[parent.id] = { title: ev.title, lines: ev.lines, cloud: true, model: d.model };
        if (VN.current === parent.id + "_ev") {
          VN.nodeLines = ev.lines.slice();
          if (VN.nodeCursor > VN.nodeLines.length) VN.nodeCursor = VN.nodeLines.length;
        }
      }
    } catch (e) { VN.cloudFail = true; }
    VN.busy = false; vnPaint();
  }

  /* ================= 对话背景 ================= */
  const VN_BG = {
    palace: "装饰/vn_bg_palace.png", garden: "装饰/vn_bg_garden.png",
    shanhai: "装饰/vn_bg_shanhai.png", grassland: "装饰/vn_bg_grassland.png",
    bronze: "装饰/vn_bg_bronze.png", banquet: "装饰/vn_bg_banquet.png",
    summerpalace: "装饰/vn_bg_summerpalace.png", kiln: "装饰/vn_bg_kiln.png",
    sea: "装饰/vn_bg_sea.png", temple: "装饰/vn_bg_temple.png",
    study: "装饰/vn_bg_study.png", street: "装饰/vn_bg_street.png",
    lotus: "装饰/vn_bg_lotus.png", museum: "装饰/vn_bg_museum.png",
    fallback: "装饰/vn_bg_clean.png",
  };
  const VN_BG_MAP = {
    huaxia: "study", cangzhou: "shanhai", baoding: "palace", zhangjiakou: "grassland",
    shijiazhuang: "bronze", xingtai: "banquet", chengde: "summerpalace", tangshan: "kiln",
    qinhuangdao: "sea", langfang: "temple", handan: "street", hengshui: "lotus",
    guobo: "museum", gugong: "palace", shaanxi: "bronze", henan: "bronze",
    nanjing: "garden", shanghai: "street", hubei: "bronze", hunan: "museum",
    sanxingdui: "bronze", liaoning: "palace", suzhou: "garden",
  };
  function vnBgFor(station) { return VN_BG[VN_BG_MAP[station] || "garden"] || VN_BG.fallback; }

  /* ================= 流程图渲染 ================= */
  function vnMapHTML() {
    const pathSet = new Set(VN.path);
    const cur = VN.current;

    const edges = [];
    VN_MAIN.forEach(n => {
      const chs = n.choices || [];
      const pickNext = chs.some(c => c.to === n.next);
      if (n.next && !pickNext) edges.push({ from: n.id, to: n.next, type: "next" });
      const fan = {};
      chs.forEach(c => {
        if (!c.to) return;
        fan[c.to] = (fan[c.to] || 0) + 1;
        edges.push({ from: n.id, to: c.to, type: "choice", k: fan[c.to] - 1 });
      });
    });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    VN_MAIN.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
    const pad = 120;
    const W = (maxX - minX) + pad * 2, H = (maxY - minY) + pad * 2;
    const box = vnCamPrep({ x: minX - pad, y: minY - pad, w: W, h: H });

    function stateOf(n) {
      if (cur === n.id) return "cur";
      if (pathSet.has(n.id)) return "done";
      return "todo";
    }

    const NW = 210, NH = 46;

    /* 底特律式卡片：横条 + 右端斜切尾 + 左侧状态块 + 右下百分比 */
    function nodeShape(n) {
      const st = stateOf(n);
      const isCur = st === "cur", isDone = st === "done", isEnd = n.kind === "end";
      const x = n.x - NW / 2, y = n.y - NH / 2;

      let gid, bd, icBg, icFg, icMark, txtCol, op;
      if (isEnd)       { gid = "gEnd";  bd = "#f2bccb"; icBg = "#5c1c33"; icFg = "#ffdce5"; icMark = "◆"; txtCol = "#ffffff"; op = 1; }
      else if (isCur)  { gid = "gCur";  bd = "#ffe3a0"; icBg = "#e2ac2e"; icFg = "#3a2a05"; icMark = "▶"; txtCol = "#ffffff"; op = 1; }
      else if (isDone) { gid = "gDone"; bd = "#9ccbe6"; icBg = "#2b7f96"; icFg = "#d6f4f8"; icMark = "✓"; txtCol = "#ffffff"; op = 1; }
      else             { gid = "gTodo"; bd = "#b3b8bd"; icBg = "#aeb3b8"; icFg = "#f4f5f6"; icMark = "·"; txtCol = "#5f666b"; op = 0.9; }

      const parts = String(n.title).split(" · ");
      const l1 = parts.length > 1 ? parts[0] : "";
      let l2 = parts.length > 1 ? parts.slice(1).join("·") : parts[0];
      if (l2.length > 9) l2 = l2.slice(0, 8) + "…";

      // 右侧百分比 = 该站探索度（底特律的「路径占比」语义对应「这站你走完了多少」）
      const st5 = VN_MAIN.filter(m => m.station === n.station);
      const hit = st5.filter(m => pathSet.has(m.id) || cur === m.id).length;
      const pct = Math.round(hit / (st5.length || 1) * 100);

      const d = `M ${x + 8} ${y} H ${x + NW - 18} L ${x + NW} ${n.y} L ${x + NW - 18} ${y + NH} H ${x + 8} L ${x} ${y + NH - 8} V ${y + 8} Z`;

      let g = `<g class="vn-node vn-${st}" data-id="${n.id}" style="cursor:pointer;opacity:${op}" onclick="VN.open('${n.id}')">
        <path d="${d}" fill="url(#${gid})" stroke="${bd}" stroke-width="1.6" filter="url(#nShadow)"/>
        <path d="M ${x + 2} ${y + 2} H ${x + 38} V ${y + NH - 2} H ${x + 2} Z" fill="${icBg}"/>
        <text x="${x + 20}" y="${n.y + 4}" text-anchor="middle" font-size="11" fill="${icFg}">${icMark}</text>`;
      if (l1) g += `<text x="${x + 48}" y="${n.y - 5}" font-size="10" fill="${txtCol}" opacity="0.75">${vnEsc(l1)}</text>`;
      g += `<text x="${x + 48}" y="${n.y + (l1 ? 11 : 4)}" font-size="12.5" font-weight="700" fill="${txtCol}">${vnEsc(l2)}</text>`;
      g += `<text x="${x + NW - 24}" y="${n.y + 3.5}" text-anchor="end" font-size="9" fill="${txtCol}" opacity="0.62">${pct}%</text>`;
      g += `</g>`;

      // 随机事件徽标（走过 / 当前 才显示）—— 站在卡片上方，不压内容
      if (n.ai && n.next && (pathSet.has(n.id) || cur === n.id)) {
        const gen = VN.generated[n.id];
        g += `<g style="cursor:pointer" onclick="VN.openEvent('${n.id}')">
          <path d="M ${x + NW - 92} ${y - 30} H ${x + NW - 22} L ${x + NW - 16} ${y - 22} L ${x + NW - 22} ${y - 14} H ${x + NW - 92} Z" fill="#c79a44"/>
          <text x="${x + NW - 56}" y="${y - 19}" text-anchor="middle" font-size="9" fill="#fff8ec">✦ 随机事件</text>
          <title>${vnEsc(gen ? gen.title : "随机事件")}</title>
        </g>`;
      }
      return g;
    }

    /* 直角折线：同高走直线；垂直堆叠走肘形；空间够走 45° 斜切 */
    function edgePath(e) {
      const a = vnNode(e.from), b = vnNode(e.to);
      if (!a || !b) return "";
      const isCh = e.type === "choice";
      const walked = pathSet.has(e.from) && (pathSet.has(e.to) || cur === e.to);
      const col = walked ? "#2f7fb5" : "#9db4c3";
      const wdt = walked ? 2 : 1.5;
      const dash = "none";
      const op = walked ? 0.95 : 0.5;

      const rightward = b.x >= a.x;
      const sx = a.x + (rightward ? NW / 2 : -NW / 2);
      const ex = b.x - (rightward ? NW / 2 : -NW / 2);
      const ay = a.y, by = b.y;
      const dy = by - ay, ady = Math.abs(dy);
      const dir = rightward ? 1 : -1;
      const span = Math.abs(ex - sx);
      let d;

      if (ady < 3) {
        d = `M ${sx} ${ay} H ${ex}`;
      } else if (Math.abs(b.x - a.x) < NW + 16) {
        const sy2 = dy > 0 ? ay + NH / 2 : ay - NH / 2;
        const ey2 = dy > 0 ? by - NH / 2 : by + NH / 2;
        const my2 = (sy2 + ey2) / 2;
        d = `M ${a.x} ${sy2} V ${my2} H ${b.x} V ${ey2}`;
      } else if (span >= ady + 24) {
        d = `M ${sx} ${ay} L ${sx + dir * ady} ${by} H ${ex}`;
      } else {
        const mx = sx + dir * Math.max(16, span / 2);
        d = `M ${sx} ${ay} H ${mx} V ${by} H ${ex}`;
      }
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wdt}" stroke-dasharray="${dash}" opacity="${op}" stroke-linecap="square"/>`;
    }

    const stSet = new Set(VN.path.map(id => { const n = vnNode(id); return n ? n.station : null; }));
    const curSt = cur ? (vnNode(cur) || {}).station : null;

    /* 站点框几何：一次算好，细节层 / 远景层 / 聚焦取景三处共用 */
    const bandList = VN_STATIONS.map((s, i) => {
      const ms = VN_MAIN.filter(m => m.station === s.id);
      if (!ms.length) return null;
      let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
      ms.forEach(m => { x1 = Math.min(x1, m.x); x2 = Math.max(x2, m.x); y1 = Math.min(y1, m.y); y2 = Math.max(y2, m.y); });
      const padX = NW / 2 + 20, padY = NH / 2 + 32;
      const hit = ms.filter(m => pathSet.has(m.id) || cur === m.id).length;
      return {
        id: s.id, idx: i + 1, row: ms[0]._row, total: ms.length, hit: hit,
        label: (i + 1) + ". " + vnShortStation(s.id),
        x: x1 - padX, y: y1 - padY,
        w: (x2 - x1) + padX * 2, h: (y2 - y1) + padY * 2,
        done: hit > 0, cur: curSt === s.id,
      };
    }).filter(Boolean);
    VN._bands = {};
    bandList.forEach(b => { VN._bands[b.id] = b; });

    /* 开场 / 终章不属于任何站，单独成块——远景里也要能点回去 */
    [
      { node: "open", label: "开场", mark: "序" },
      { node: "hx_end", label: "终章 · 华夏", mark: "终" },
    ].forEach(p => {
      const n = vnNode(p.node);
      if (!n) return;
      const w = NW + 300, h = NH + 210;
      const b = {
        id: "__" + p.node, node: p.node, label: p.label, mark: p.mark,
        row: n._row, total: 1, hit: (pathSet.has(p.node) || cur === p.node) ? 1 : 0,
        x: n.x - w / 2, y: n.y - h / 2, w: w, h: h,
        done: pathSet.has(p.node), cur: cur === p.node, pseudo: true,
      };
      bandList.push(b);
      VN._bands[b.id] = b;
    });

    /* 细节层 · 站点虚线框 */
    const bandSVG = bandList.map(b => `<g class="vn-band">
        <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"
          fill="${b.cur ? "#e6f1f8" : (b.done ? "#dfeaf3" : "#f4f5f6")}" fill-opacity="0.6"
          stroke="${b.cur ? "#3f8ec0" : "#9fb6c4"}" stroke-opacity="${b.cur ? 0.85 : 0.45}"
          stroke-width="${b.cur ? 1.6 : 1}" stroke-dasharray="4,5"/>
        <text x="${b.x + 10}" y="${b.y + 19}" font-size="15" font-weight="600" fill="#53768c" fill-opacity="0.9">${vnEsc(b.label)}</text>
      </g>`).join("");

    const edgeSVG = edges.map(edgePath).join("");
    const nodeSVG = VN_MAIN.map(nodeShape).join("");

    /* 远景层 · 只留「站名大字 + 五格进度」，缩到看不清字时自动接管
     * 站与站之间只画同一行内的短接头，避免蛇形折返处斜穿全图 */
    const ovEdges = bandList.map((b, i) => {
      const nx = bandList[i + 1];
      if (!nx || b.pseudo || nx.pseudo || nx.row !== b.row) return "";
      const rightward = nx.x > b.x;
      const x1 = rightward ? b.x + b.w : b.x;
      const x2 = rightward ? nx.x : nx.x + nx.w;
      const y = b.y + b.h / 2;
      const walked = b.hit >= b.total && nx.hit >= nx.total;
      return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${walked ? "#2f7fb5" : "#a9bcc9"}"
        stroke-width="${walked ? 6 : 4}" stroke-opacity="${walked ? 0.8 : 0.42}" stroke-linecap="round"/>`;
    }).join("");

    const ovBands = bandList.map(b => {
      const on = b.done || b.cur;
      const fill = b.pseudo ? (b.id === "__hx_end" ? "url(#gEnd)" : (b.done ? "url(#gDone)" : "url(#gTodo)"))
                           : (b.cur ? "url(#gCur)" : (b.done ? "url(#gDone)" : "url(#gTodo)"));
      const dark = b.id === "__hx_end" || b.done || b.cur;   // 深底必配白字
      const txt = dark ? "#ffffff" : "#4f575d";
      const big = b.pseudo ? vnEsc(b.label) : vnEsc(vnShortStation(b.id));
      const small = b.pseudo ? vnEsc(b.mark === "序" ? "启程" : "终点") : "第 " + b.idx + " 站";
      const gap = 26, pw = 18;
      const px0 = b.x + b.w / 2 - (b.total * gap) / 2 + (gap - pw) / 2;
      const pips = b.pseudo ? "" : Array.from({ length: b.total }, (_, i) =>
        `<rect x="${px0 + i * gap}" y="${b.y + b.h - 46}" width="${pw}" height="8" rx="4"
          fill="${i < b.hit ? "#ffd470" : "#ffffff"}" fill-opacity="${i < b.hit ? 0.95 : (on ? 0.32 : 0.5)}"/>`).join("");
      return `<g class="vn-ovband" style="cursor:pointer" onclick="VN.focusStation('${b.id}')">
        <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16"
          fill="${fill}" stroke="${b.cur ? "#ffe3a0" : "#b8c6d0"}" stroke-width="${b.cur ? 3 : 1.4}"
          filter="url(#nShadow)" opacity="${on ? 1 : 0.94}"/>
        <text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 - 34}" text-anchor="middle" font-size="${b.pseudo ? 26 : 21}" fill="${txt}" fill-opacity="0.7">${small}</text>
        <text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 26}" text-anchor="middle" font-size="${b.pseudo ? 42 : 44}" font-weight="700" fill="${txt}">${big}</text>
        ${pips}
      </g>`;
    }).join("");

    const doneSt = VN_STATIONS.filter(s => stSet.has(s.id)).length;
    const pct = Math.round(doneSt / VN_STATIONS.length * 100);
    const gotEnd = Object.keys(VN.endings || {}).length;
    const route = VN_STATIONS.map(s => vnShortStation(s.id)).join(" → ");

    return `
    <div class="vn-map-head">
      <h3>🗺 主线剧情 · 从沧州到全国</h3>
      <p>初始七友送你启程，从<b>第一站 · 沧州</b>开始捕捉精灵，先走遍燕赵十一站，再出河北进<b>国博</b>，南下北上走完十座大馆，最后回到<b>华夏</b>。每一站都有<span style="color:#c08a35">三条道</span>——直面、追问、相伴，通往不同的精灵与结局。<span style="color:#2f8fd0">亮蓝</span>为当前，<span style="color:#1e6d9c">深蓝</span>为已走过，<span style="color:#8c949a">灰色</span>为未走，<span style="color:#b8863a">✦</span>为 AI 随机事件（走过才出现，点它可看）。</p>
      <div style="margin:8px 0 0;font-size:12px;line-height:1.7;color:#7a6a52">${vnEsc(route)} → 华夏</div>
    </div>
    <div class="vn-map-progress">
      <span>站点进度 ${doneSt}/${VN_STATIONS.length}</span>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <span>${pct}%　·　已解锁结局 ${gotEnd}</span>
    </div>
    <div class="vn-map-wrap" id="vn-map-wrap">
      <div class="vn-map-toolbar">
        <button type="button" class="vn-minibtn dark" onclick="VN.zoom(1.25)">＋ 放大</button>
        <button type="button" class="vn-minibtn dark" onclick="VN.zoom(0.8)">－ 缩小</button>
        <button type="button" class="vn-minibtn dark" onclick="VN.focusStation()">◎ 聚焦本站</button>
        <button type="button" class="vn-minibtn dark" onclick="VN.resetView()">⤢ 全图</button>
        <span class="vn-map-legend">
          <i class="lg lg-done"></i>已过 <i class="lg lg-cur"></i>当前 <i class="lg lg-todo"></i>未走 <i class="lg lg-event"></i>随机事件
        </span>
      </div>
      <div class="vn-map-canvas" id="vn-map-canvas">
        <svg id="vn-map-svg" class="vn-map-svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">
          <defs>
            <linearGradient id="gCur" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#1c6ba6"/><stop offset="62%" stop-color="#2f8fd0"/><stop offset="100%" stop-color="#5cabdf"/>
            </linearGradient>
            <linearGradient id="gDone" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#124668"/><stop offset="100%" stop-color="#1e6d9c"/>
            </linearGradient>
            <linearGradient id="gTodo" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#d6d9dc"/><stop offset="100%" stop-color="#c1c6ca"/>
            </linearGradient>
            <linearGradient id="gEnd" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#6d2440"/><stop offset="100%" stop-color="#a2395a"/>
            </linearGradient>
            <pattern id="vgrid" width="46" height="46" patternUnits="userSpaceOnUse">
              <path d="M46 0 H0 V46" fill="none" stroke="#1b3b52" stroke-opacity="0.055" stroke-width="1"/>
            </pattern>
            <pattern id="vhatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="16" stroke="#1b3b52" stroke-opacity="0.03" stroke-width="5"/>
            </pattern>
            <filter id="nShadow" x="-25%" y="-60%" width="150%" height="220%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#123047" flood-opacity="0.22"/>
            </filter>
          </defs>
          <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#edecea"/>
          <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#vgrid)"/>
          <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#vhatch)"/>
          <g id="vn-lod-overview">${ovEdges}${ovBands}</g>
          <g id="vn-lod-detail">${bandSVG}${edgeSVG}${nodeSVG}</g>
        </svg>
        <div class="vn-lod-hint" id="vn-lod-hint">站名视图 · 点一站放大</div>
        <div class="vn-map-hud">
          <span><b>滚轮</b> 缩放</span>
          <span><b>拖动</b> 平移</span>
          <span><b>◎</b> 聚焦本站</span>
          <span><b>⤢</b> 全图</span>
          <span class="hud-sp">站点进度 ${doneSt}/${VN_STATIONS.length} · 已解锁结局 ${gotEnd}</span>
        </div>
      </div>
    </div>`;
  }

  /* ================= 节点对话视图 ================= */
  function vnNodeHTML() {
    const isEvent = String(VN.current).endsWith("_ev");
    const n = isEvent ? vnNode(VN.current.slice(0, -3)) : vnNode(VN.current);
    if (!n) { VN.view = "map"; return vnMapHTML(); }

    let title, speaker, station, lines;
    if (isEvent) {
      const ev = vnEventFor(n);
      lines = ev.lines; title = ev.title; station = n.station;
      const sayLine = lines.find(l => l.t === "say" && l.id);
      speaker = sayLine ? sayLine.id : n.speaker;
    } else {
      lines = VN.nodeLines.length ? VN.nodeLines : n.lines;
      title = n.title; speaker = n.speaker; station = n.station;
    }

    const line = lines[VN.nodeCursor - 1] || null;
    const curText = line ? line.x : "";
    const curSpeaker = (line && line.t === "say" && line.id) ? line.id : (speaker || "wuzhuqian");

    let choiceHTML = "";
    const atEnd = VN.nodeCursor >= lines.length;
    if (atEnd && !isEvent && n.choices && n.choices.length) {
      choiceHTML = `<div class="vn-choices">${n.choices.map((c, i) =>
        `<button type="button" class="vn-choice" onclick="VN.choose(${i})">${vnEsc(c.label)}<span>${vnEsc(c.text)}</span></button>`
      ).join("")}</div>`;
    }
    if (atEnd && !isEvent && n.kind === "end") {
      choiceHTML = `<div class="vn-endcard">
        <div class="vn-end-title">${vnEsc(n.endingTitle || "结局")}</div>
        <p>${vnEsc(n.endingText || "")}</p>
        <button type="button" class="btn gold" onclick="VN.openMap()">🗺 回到流程图</button>
        <button type="button" class="btn ghost" onclick="VN.restart()">↺ 重新开始主线</button>
      </div>`;
    }

    const spriteName = (line && line.name) || vnSpiritName(curSpeaker);
    const canNext = atEnd && !(n.choices && n.choices.length) && n.kind !== "end";

    return `
    <div class="vn-stage" id="vn-stage">
      <img class="vn-bg" src="${vnBgFor(station)}" alt="">
      <div class="vn-topbar">
        <button type="button" class="vn-minibtn" onclick="VN.openMap()">🗺 流程图</button>
        <span class="vn-title">${vnEsc(title)}</span>
        <button type="button" class="vn-minibtn" onclick="VN.auto()">自动</button>
      </div>
      <div class="vn-sprite" style="${choiceHTML ? "bottom:206px" : ""}"><img src="精灵/透明/${vnEsc(curSpeaker)}.webp" alt="${vnEsc(spriteName)}" onerror="this.style.display='none'"></div>
      <div class="vn-dialog" onclick="VN.advance()">
        <div class="vn-dialog-avatar"><img src="精灵/透明/${vnEsc(curSpeaker)}.webp" alt="" onerror="this.style.display='none'"></div>
        <div class="vn-dialog-box">
          <b>${vnEsc(spriteName)}</b>
          <p id="vn-dialog-text">${line && line.t === "narr" ? "　" + vnEsc(curText) : vnEsc(curText)}</p>
          ${VN.busy ? '<span class="vn-typing">… 正在生成</span>' : ""}
          ${canNext ? '<span class="vn-typing">▸ 点击继续</span>' : ""}
        </div>
      </div>
      ${choiceHTML}
    </div>`;
  }

  /* ================= 核心动作 ================= */
  function vnOpen(id) {
    const n = vnNode(id);
    if (!n || String(id).endsWith("_ev")) return;
    VN.current = id;
    VN.lastNode = id;
    VN.cam = null;
    if (!VN.path.includes(id)) VN.path.push(id);
    VN.view = "node";
    VN.nodeLines = n.lines.slice();
    VN.nodeCursor = 1;
    vnSave(); vnPaint();
  }
  function vnOpenEvent(parentId) {
    const n = vnNode(parentId);
    if (!n) return;
    const aid = parentId + "_ev";
    VN.current = aid;
    VN.lastNode = parentId;
    VN.cam = null;
    if (!VN.path.includes(aid)) VN.path.push(aid);
    VN.view = "node";
    const ev = vnEventFor(n);
    VN.nodeLines = ev.lines.slice();
    VN.nodeCursor = 1;
    vnSave(); vnPaint();
    vnTryCloudEvent(n);
  }
  function vnAdvance() {
    if (VN.busy) return;
    const isEvent = String(VN.current).endsWith("_ev");
    const n = isEvent ? vnNode(VN.current.slice(0, -3)) : vnNode(VN.current);
    const lines = VN.nodeLines;
    if (VN.nodeCursor < lines.length) { VN.nodeCursor++; vnPaint(); return; }
    if (isEvent) { vnOpenMap(); return; }
    if (!n) { vnOpenMap(); return; }
    if (n.choices && n.choices.length) { vnPaint(); return; }
    if (n.kind === "end") { vnPaint(); return; }
    if (n.next) { vnOpen(n.next); return; }
    vnOpenMap();
  }
  function vnChoose(ci) {
    if (VN.busy) return;
    const n = vnNode(VN.current);
    if (!n || !n.choices || !n.choices[ci]) return;
    const c = n.choices[ci];
    if (c.ending) { VN.endings[c.ending] = true; vnSave(); }
    if (c.to) vnOpen(c.to);
    else vnOpenMap();
  }
  function vnOpenMap() { VN.view = "map"; VN.current = null; vnPaint(); }
  function vnRestart() {
    VN.path = []; VN.current = null; VN.lastNode = "open"; VN.endings = {};
    VN.generated = {}; VN.eventIdx = {}; VN.cam = null;
    VN.view = "map"; vnSave(); vnPaint();
  }
  function vnAuto() {
    let guard = 0;
    const tick = () => {
      if (guard++ > 200) return;
      const isEvent = String(VN.current).endsWith("_ev");
      const n = isEvent ? vnNode(VN.current.slice(0, -3)) : vnNode(VN.current);
      if (VN.nodeCursor < VN.nodeLines.length) { VN.nodeCursor++; vnPaint(); setTimeout(tick, 1000); return; }
      if (isEvent) { vnOpenMap(); return; }
      if (!n) return;
      if (n.choices && n.choices.length) return;
      if (n.kind === "end") return;
      if (n.next) { vnOpen(n.next); setTimeout(tick, 1000); return; }
    };
    tick();
  }

  /* ================= 相机（viewBox 取景） =================
   * 112 个节点全图铺开必然看不清，所以默认「跟着当前节点走」：
   * 有当前节点 → 居中放大到 1500 单位；没有 → 全图。
   * 缩放/拖动只改 viewBox，不重绘，字体始终清晰。
   * ========================================================= */
  function vnClamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function vnCamPrep(b) {
    VN._b = b;
    if (!VN.cam) {
      let cur = VN.current ? vnNode(VN.current) : null;
      if (!cur && VN.lastNode) cur = vnNode(VN.lastNode);
      const w = cur ? Math.min(b.w, 1900) : b.w;
      VN.cam = { cx: cur ? cur.x : b.x + b.w / 2, cy: cur ? cur.y : b.y + b.h / 2, w: w };
    }
    return vnCamBox();
  }
  function vnCamBox() {
    const b = VN._b, c = VN.cam || { cx: 0, cy: 0, w: 1000 };
    const ar = VN._ar || (b.h / b.w);            // 容器宽高比：取景框跟着容器走，避免上下留黑
    const w = vnClamp(c.w, 420, b.w * 1.06);
    const h = w * ar;
    let cx = c.cx, cy = c.cy;
    const insX = Math.min(w / 2, 260), insY = Math.min(h / 2, 260);
    cx = (w >= b.w) ? b.x + b.w / 2 : vnClamp(cx, b.x + insX, b.x + b.w - insX);
    cy = (h >= b.h) ? b.y + b.h / 2 : vnClamp(cy, b.y + insY, b.y + b.h - insY);
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }
  /* 远景阈值：取景宽度超过它，字就小到读不清了，自动切「站名层」 */
  const LOD_FAR = 2400;
  function applyView() {
    const svg = document.getElementById("vn-map-svg");
    if (!svg || !VN._b || !VN.cam) return;
    const box = vnCamBox();
    svg.setAttribute("viewBox", box.x + " " + box.y + " " + box.w + " " + box.h);
    const far = box.w > LOD_FAR;
    svg.classList.toggle("lod-far", far);
    VN.lodFar = far;
    const hint = document.getElementById("vn-lod-hint");
    if (hint) hint.style.display = far ? "block" : "none";
  }
  function vnZoom(f) {
    if (!VN.cam) return;
    VN.cam.w = vnClamp(VN.cam.w / f, 420, VN._b ? VN._b.w * 1.06 : 6000);
    applyView();
  }
  /* 聚焦视图：把「一站」完整框进画面，五个节点一次看全
   * 未指定站时，取当前所在站；不在站内（开场/终章）则框住当前节点 */
  function vnFocusStation(stId) {
    if (!VN._b) return;
    const ar = VN._ar || (VN._b.h / VN._b.w);
    let sid = stId;
    if (!sid) {
      const cur = VN.current ? vnNode(VN.current) : (VN.lastNode ? vnNode(VN.lastNode) : null);
      sid = cur ? cur.station : null;
    }
    const b = sid && VN._bands ? VN._bands[sid] : null;
    if (!b) { vnFocus(); return; }
    if (b.pseudo) {
      const n = vnNode(b.node);
      VN.cam = { cx: n ? n.x : b.x + b.w / 2, cy: n ? n.y : b.y + b.h / 2, w: 900 };
      applyView();
      return;
    }
    const w = vnClamp(Math.max(b.w * 1.14, (b.h / ar) * 1.08), 420, VN._b.w * 1.06);
    VN.cam = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: w };
    applyView();
  }
  function vnFocus() {
    const n = VN.current ? vnNode(VN.current) : null;
    const target = n || (VN.path.length ? vnNode(VN.path[VN.path.length - 1]) : vnNode("open"));
    if (!target || !VN._b) { vnResetView(); return; }
    VN.cam = { cx: target.x, cy: target.y, w: Math.min(VN._b.w, 1500) };
    applyView();
  }
  function vnResetView() {
    if (!VN._b) return;
    VN.cam = { cx: VN._b.x + VN._b.w / 2, cy: VN._b.y + VN._b.h / 2, w: VN._b.w };
    applyView();
  }
  function vnInitDrag() {
    const canvas = document.getElementById("vn-map-canvas");
    if (!canvas || canvas._vnDrag) return;
    canvas._vnDrag = true;
    canvas.addEventListener("mousedown", e => {
      const svg = document.getElementById("vn-map-svg");
      const box = vnCamBox();
      const r = svg.getBoundingClientRect();
      // 1 像素 = 多少 SVG 单位（meet 取较小比例）
      const k = 1 / Math.min(r.width / box.w, r.height / box.h);
      VN.drag = { x: e.clientX, y: e.clientY, cx: VN.cam.cx, cy: VN.cam.cy, k: k || 1 };
      canvas.style.cursor = "grabbing";
    });
    document.addEventListener("mousemove", e => {
      if (!VN.drag) return;
      VN.cam.cx = VN.drag.cx - (e.clientX - VN.drag.x) * VN.drag.k;
      VN.cam.cy = VN.drag.cy - (e.clientY - VN.drag.y) * VN.drag.k;
      applyView();
    });
    document.addEventListener("mouseup", () => { VN.drag = null; canvas.style.cursor = ""; });
    canvas.addEventListener("wheel", e => { e.preventDefault(); vnZoom(e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
  }

  /* ================= 渲染入口 ================= */
  function vnPaint() {
    const host = document.getElementById("vn-host");
    if (!host) return;
    if (VN.view === "node") { host.innerHTML = vnNodeHTML(); return; }
    const hw = host.clientWidth || 1280, hh = Math.max(320, host.clientHeight - 150);
    VN._ar = hh / hw;
    host.innerHTML = vnMapHTML();
    setTimeout(() => {
      vnInitDrag();
      // 首次进入：直接落在「聚焦本站」，而不是糊成一片的全图
      if (!VN._camDone) { VN._camDone = true; vnFocusStation(); }
      else applyView();
    }, 30);
  }

  window.VN = {
    paint: vnPaint, open: vnOpen, openEvent: vnOpenEvent, openMap: vnOpenMap,
    advance: vnAdvance, choose: vnChoose, auto: vnAuto,
    zoom: vnZoom, focus: vnFocus, focusStation: vnFocusStation, resetView: vnResetView,
    restart: vnRestart,
    _state: VN, _main: VN_MAIN, _stations: VN_STATIONS,
  };

  const saved = vnLoad();
  VN.endings = saved.endings || {};
  VN.path = saved.path || [];
  VN.lastNode = VN.path.length ? VN.path[VN.path.length - 1] : "open";
  VN.view = "map";
})();
