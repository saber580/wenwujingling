/* =============================================================================
 * js/aw-trace.js · 文物溯源 · 视频讲解（AI 工坊新增项目，路由 #/trace）
 * -----------------------------------------------------------------------------
 *  · 与 aw-live / aw-mystery / aw-craft 同模式：不改动任何既有 css / js，
 *    自注入 style，经 hashchange 挂载 #/trace（注册在 app.js 之后覆盖默认渲染）。
 *  · 卡阵骨架移植自 Uiverse.io「swift-panda-38」by ilkhoeri（MIT）
 *    （Tags: card, gradient, circular, modern, colorful, transparent, floating）：
 *      .wrapper  → .trace-stage   演示画布（居中 + overflow:hidden）
 *      .inner    → .trace-spin    3D 圆柱（perspective + rotateX(-15deg) + 无限自转）
 *      .card     → .trace-slot    每张卡 rotateY(360°/quantity × index) translateZ(w+h)
 *      --quantity / --index / --color-card 三个变量沿用，色值改为本页文物主色。
 *  · 版面按上下两段组织（2026-11-06 第 4 版）：
 *      上半区 .trace-top    = 八张卡绕环自转 + 步进箭头
 *      下半区 .trace-bottom = 复古电视机（Uiverse「black-pug-58」by Sophiek9h，MIT）
 *                            + 「关于这一席」说明；电视机屏幕随翻开的卡片切字。
 *  · 卡片正反面沿用原 funny-cobra-5 的翻面骨架：.uno-card > .card-inner > .front/.back，
 *    preserve-3d + backface-visibility + .flipped 点按翻面（触屏无 hover 也能用）。
 *    正面 = 透明底精灵立绘 + 文物名/年代；背面 = 「文物精灵」草书题字，八张共用。
 *  · 在原始模板上补的三点（不改视觉语言，只为可读可用）：
 *      ① 点卡翻面时暂停自转（.hold），翻回正面即恢复；其余时候（含悬停）一直在转
 *      ② .trace-slot 加 backface-visibility:hidden —— 背向观众的卡在侧棱处正好宽度为 0，
 *         隐去后无跳变，避免看到镜像的精灵和文字
 *      ③ 左右两个箭头按钮按 45° 步进手动转到任意一张
 *  · 卡框边饰（2026-11-06 第 7 版）：正面是「纹样边带 + 留白 + 鎏金细线」三层装裱框。
 *    边带取自「中国传统纹样图鉴 Wényàng」(wenyang.net) 的卡片图 —— 从卡图右侧纹样区
 *    截一条、缩放后与原条镜像拼接，横 repeat-x、旋转 90° 的竖边 repeat-y，平铺无接缝。
 *    素材按图鉴六个分类各取「第一页」，共 106 款，统一收在 文物溯源/纹样库/<分类>/；
 *    八张卡默认素框，由用户在「纹样工坊」里逐张自选，选择自动记住。
 *    授权 CC BY-NC 4.0：非商业使用 + 页面署名（见页脚）。
 *  · 第 6 版（2026-11-06）：
 *      ① 环自转时露出卡背：.uno-card 去掉局部 perspective、改 preserve-3d，把子层交还给
 *         环的 3D 空间 —— 否则浏览器在卡片自己的扁平平面里判朝向，.front 永不被剔除，
 *         后半圈露出的是「镜像的正面」。卡背同时补了鎏金回纹边，与正面同一套层次。
 *      ② 「纹样工坊」选择面板：样卡平铺成图鉴的样子，先选卡、再点纹样，
 *         逐张可换、自动存 localStorage（key: relic_trace_frames_v1），可一键恢复默认。
 *         面板挂在 body 上（.trace-page 带 identity transform，会让 fixed 定位跑偏）。
 * ============================================================================= */
  (function () {
    "use strict";
    if (window.__AW_TRACE__) return;
    window.__AW_TRACE__ = 1;

    var IMG = "文物溯源/";
    /* accent = 该文物的主色（RGB 三段），用于卡框、卡背光晕，取自实物釉色/材质
       frame  = 该卡专用的边饰纹样（八张各不相同，形制依其时代与材质取用） */
    var CARDS = [
      { front: IMG + "front-shuochang.webp", title: "击鼓说唱俑", sub: "东汉 · 俳优俑 · 蜀地", accent: "198,120,74", frame: "none", video: "鼓俑" },
      { front: IMG + "front-hanwa.webp", title: "汉瓦 · 长乐未央", sub: "汉 · 瓦当 · 四神云纹", accent: "124,142,150", frame: "none", video: "汉瓦当" },
      { front: IMG + "front-fuhao.webp", title: "妇好鸮尊", sub: "商 · 青铜酒尊 · 殷墟妇好墓", accent: "96,148,120", frame: "none", video: "妇好" },
      { front: IMG + "front-jinpan.webp", title: "晋公盘", sub: "春秋 · 青铜盘 · 晋公嫁女", accent: "196,150,72", frame: "none", video: "晋公盘" },
      { front: IMG + "front-wuxing.webp", title: "五星出东方利中国", sub: "东汉 · 蜀锦护臂 · 尼雅遗址", accent: "70,110,180", frame: "none", video: "五星出中国" },
      { front: IMG + "front-taogou.webp", title: "绿釉陶狗", sub: "东汉 · 绿釉陶立狗 · 河南博物院", accent: "96,158,110", frame: "none", video: "陶狗" },
      { front: IMG + "front-taoying.webp", title: "陶鹰鼎", sub: "新石器 · 泥塑陶鹰鼎 · 仰韶文化", accent: "180,120,84", frame: "none", video: "陶鹰" },
      { front: IMG + "front-yuxi.webp", title: "传国玉玺", sub: "秦 · 和田玉印 · 金镶一角", accent: "150,170,160", frame: "none", video: "传国玉玺" }
    ];
  var BACK = IMG + "card-back.webp";

  /* ============================ 卡框边饰 ============================
   * 素材来自 Wényàng 卡图（CC BY-NC 4.0），每款三份：<id>.webp 面板样图、
   * <id>_h.webp 横边带、<id>_v.webp 竖边带，按图鉴分类分目录存放。
   * 边带 1:1 平铺：横边 repeat-x、旋转 90° 的同一 tile 走 repeat-y，不拉伸不失真；
   * 尺寸由 --band 控制（background-size:auto var(--band)），移动端整体等比缩小。
   * 八张卡默认素框（f-none），由用户在面板里自选，选择存 localStorage 自动记住。 */
  var FRAME_DIR = "文物溯源/纹样库/";
  /* 分类名（照 Wényàng 图鉴的分类键与中文名，顺序即面板分类条的顺序） */
  var CATS = {
    flora: "植物花卉纹", fauna: "动物瑞兽纹", geometric: "几何锦纹",
    cloud: "云水山石纹", objects: "吉祥器物纹", chars: "文字福寿与组合纹"
  };
  /* 纹样库：直接取自「中国传统纹样图鉴 Wényàng」(wenyang.net) 的卡片图，
     取的是六个分类各自「第一页」，一类一段、不贪多；
     授权 CC BY-NC 4.0（非商业 + 署名，页面底部署名即可）。
     目录按图鉴分类分好：文物溯源/纹样库/<分类中文名>/<id>{,_h,_v}.webp
       <id>.webp 面板样图、<id>_h.webp 横边带、<id>_v.webp 竖边带。
     边带是从卡图右侧纹样区取一条、缩放后与原条镜像拼接，横竖平铺都没有接缝。 */
  var FRAMES = (function () {
    var bank = {
      flora: "001缠枝莲纹 002宝相花纹 003牡丹纹 004菊花纹 005莲瓣纹" +
             " 006卷草纹 007忍冬纹 008唐草纹 009石榴纹 010梅花纹" +
             " 011兰草纹 012竹叶纹 013松针纹 014桃花纹 015海棠纹" +
             " 016荷叶纹 017葡萄藤纹 018葫芦藤纹 019折枝花纹 020团花纹",
      fauna: "021龙纹 022夔龙纹 023螭龙纹 024凤鸟纹 025夔凤纹" +
             " 026麒麟纹 027瑞狮纹 028饕餮纹 029兽面纹 030蝙蝠纹" +
             " 031鹤纹 032鹿纹 033鱼纹 034鲤鱼纹 035鸳鸯纹" +
             " 036喜鹊纹 037马纹 038龟纹 039蝴蝶纹 040金蟾纹",
      geometric: "041回纹 042雷纹 043云雷纹 044龟背纹 045菱格纹" +
             " 046连珠纹 047方胜纹 048盘长纹 049万字锦纹 050锁子纹" +
             " 051冰裂纹 052锦地纹 053十字花纹 054六角花纹 055八角星纹" +
             " 056波折纹 057曲尺纹 058格锦纹 059菱花锦纹 060连环纹",
      cloud: "061祥云纹 062如意云纹 063卷云纹 064海水江崖纹 065水波纹" +
             " 066浪花纹 067山纹 068山水纹 069太湖石纹 070火焰纹" +
             " 071流云纹 072云气纹 073涡纹 074雨点纹 075星宿纹" +
             " 241云海纹 242飞云纹 243朵云纹 244团云纹 245云水纹" +
             " 247潮水纹",
      objects: "076如意纹 077宝瓶纹 078双钱纹 079铜钱纹 080花篮纹" +
             " 081八宝纹 082暗八仙纹 083灵芝纹 084珊瑚纹 085书卷纹" +
             " 086灯笼纹 087香炉纹 088玉璧纹 089扇面纹 090编磬纹",
      chars: "091寿字纹 092团寿纹 093福字纹 094喜字纹 095福寿纹" +
             " 096五福捧寿纹 097双鱼莲花纹 098鹿鹤同春纹 099岁寒三友纹 100方圆合璧纹"
    };
    var out = {};
    Object.keys(bank).forEach(function (cat) {
      bank[cat].split(/\s+/).forEach(function (tok) {
        if (!tok) return;
        var id = tok.slice(0, 3);
        out["w" + id] = { id: id, label: tok.slice(3), cat: cat };
      });
    });
    return out;
  })();
  /* 每类一个子目录，路径按 cat 拼 */
  function framePath(f) { return FRAME_DIR + CATS[f.cat] + "/" + f.id; }

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function $(id) { return document.getElementById(id); }

  /* 八张卡散在盒里的点位：X% / Y% / 倾角。三档宽度各一套，用 :nth-child 下发成 CSS 变量，
     换断点只改这张表，卡片 markup 里不再出现任何内联坐标。 */
  var SPOTS = {
    d: [[17, 27, -7], [39, 28, 4], [60, 28, -3], [82, 27, 7],
        [26, 70, 5], [47, 72, -6], [66, 71, 3], [81, 72, -4]],
    t: [[17, 27, -7], [39, 26, 4], [60, 28, -3], [82, 27, 7],
        [26, 71, 5], [47, 72, -6], [66, 71, 3], [81, 72, -4]],
    m: [[27, 13, -6], [73, 13, 4], [27, 37.5, -3], [73, 37.5, 5],
        [27, 62, -5], [73, 62, 3], [27, 86.5, 4], [73, 86.5, -4]]
  };
  function spotCSS(table, query) {
    var body = table.map(function (s, i) {
      return ".trace-deck .deck-card:nth-child(" + (i + 1) + "){--lx:" + s[0] +
        ";--ly:" + s[1] + ";--r:" + s[2] + "deg}";
    }).join("");
    return query ? query + "{" + body + "}" : body;
  }

  /* ============================ ① 样式（自注入） ============================ */
  var CSS = [
    "/* ---- 文物溯源 · 视频讲解 #/trace ---- */",
    "/* 首页右下常驻的 AI 自检胶囊与小答球会压住页面内容，仅本页收起 */",
    "body:has(.trace-page) .wj-tech-pill,body:has(.trace-page) .aq{display:none}",
    ".trace-page{position:relative;max-width:1080px;margin:0 auto;padding:6px 0 28px;",
    "  font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;color:#3B2418;",
    "  background:linear-gradient(180deg,#FCF6E7 0%,#F9F0DC 58%,#F6EBD3 100%)}",
    /* 背景画：金阙凤凰图压成绢本淡色，垫在卡阵后面；从红头下沿开始，图尾自己褪成纸色，
       所以整块只画一次、再靠底下的米金渐变接住下半页 */
    ".trace-page::before{content:\"\";position:absolute;left:0;right:0;top:0;bottom:0;z-index:0;pointer-events:none;",
    "  background:url(\"文物溯源/trace-bg.webp\") center top/cover no-repeat;opacity:.9;",
    "  -webkit-mask-image:linear-gradient(180deg,transparent 0,transparent 4%,rgba(0,0,0,.6) 12%,#000 26%);",
    "  mask-image:linear-gradient(180deg,transparent 0,transparent 4%,rgba(0,0,0,.6) 12%,#000 26%)}",
    /* 背景之上再压一层米纸纱：上部厚（卡片阵要干净）、下部薄（让宫殿与云纹透出来） */
    ".trace-page::after{content:\"\";position:absolute;inset:0;z-index:0;pointer-events:none;",
    "  background:linear-gradient(180deg,rgba(253,246,232,.5) 0%,rgba(253,246,232,.14) 34%,",
    "  rgba(253,246,232,.1) 62%,rgba(253,246,232,.28) 100%)}",
    ".trace-hero,.trace-top,.trace-bottom{position:relative;z-index:1}",
    ".trace-hero{position:relative;overflow:hidden;border-radius:14px;padding:26px 28px 22px;color:#FFE9B8;",
    "  background:linear-gradient(135deg,#7C0F13 0%,#A5181C 52%,#5A0A0D 100%);",
    "  border:1px solid rgba(255,214,150,.38);box-shadow:0 16px 40px rgba(70,10,6,.34)}",
    ".trace-hero::after{content:\"\";position:absolute;right:-60px;top:-90px;width:300px;height:300px;border-radius:50%;",
    "  background:radial-gradient(circle,rgba(255,214,150,.26) 0%,rgba(255,214,150,0) 66%);pointer-events:none}",
    ".trace-eyebrow{font-size:11.5px;letter-spacing:.24em;opacity:.85;display:block;margin-bottom:7px}",
    ".trace-hero h2{margin:0 0 9px;font-size:26px;letter-spacing:.06em;color:#FFD98A;text-shadow:0 2px 10px rgba(0,0,0,.35)}",
    ".trace-hero p{margin:0;font-size:13.5px;line-height:1.95;opacity:.94;max-width:820px;position:relative;z-index:1}",
    ".trace-stat{display:inline-block;margin-top:13px;font-size:12px;padding:5px 13px;border-radius:999px;",
    "  background:rgba(255,233,184,.14);border:1px solid rgba(255,233,184,.35);position:relative;z-index:1}",

    /* ↓↓ Uiverse.io swift-panda-38 结构（.wrapper/.inner/.card/.img）+ 本页化 ↓↓ */
    /* 上半区：环形卡阵。页面改成上下两段后卡阵略收一点，给下半的电视机腾出视口 */
    ".trace-top{position:relative}",
    "/* 演示画布：原作宽高 100% + overflow:hidden，这里给定高度并加一圈暖色地光 */",
    ".trace-stage{position:relative;height:470px;margin:0;overflow:hidden;",
    "  background:radial-gradient(ellipse at 50% 66%,rgba(255,238,204,.66) 0%,rgba(255,238,204,0) 70%)}",
    "/* .inner：3D 圆柱本体。--w/--h 卡尺寸，--translateZ 半径，--rotateX 俯角。",
    "   环的参数按「强透视环绕」重调（对齐参考截图：近大远小明显、卡片相互咬合、立在一条基线上）：",
    "   · perspective 1500 → 900：透视越近，前卡越大、后卡越小，才有截图那种纵深",
    "   · 半径 w×1.74：八张在弧上留出一指宽的缝，前后卡能互相露出，才看得出是一圈",
    "   · 俯角 -15° → -8°：更接近平视，卡片立得住，不再像俯看一张桌子",
    "   · top 35.5%：实测八张卡投影包围盒（463–853）比几何中心低 68px，等量上抬才上下留白均匀 */",
    ".trace-spin{--w:172px;--h:242px;--translateZ:calc(var(--w) * 1.74);--rotateX:-8deg;--perspective:calc(var(--w) * 5.8);",
    "  position:absolute;width:var(--w);height:var(--h);top:35.5%;left:calc(50% - (var(--w) / 2));",
    "  margin-top:calc(var(--h) / -2);z-index:2;transform-style:preserve-3d;",
    "  transform:perspective(var(--perspective));animation:trace-rotating 42s linear infinite}",
    "@keyframes trace-rotating{",
    "  from{transform:perspective(var(--perspective)) rotateX(var(--rotateX)) rotateY(0)}",
    "  to{transform:perspective(var(--perspective)) rotateX(var(--rotateX)) rotateY(1turn)}}",
    "/* 只有「有卡翻到背面」时才暂停（.hold 由 JS 挂上）；悬停、鼠标划过都不停 */",
    ".trace-stage.hold .trace-spin{animation-play-state:paused}",
    "/* .trace-ring：手动步进层，箭头按钮改 --rot，与自转叠加 */",
    ".trace-ring{position:absolute;inset:0;transform-style:preserve-3d;",
    "  transform:rotateY(var(--rot,0deg));transition:transform .9s cubic-bezier(.22,.75,.28,1)}",
    "/* .card：absolute + inset:0 + 按 --index 沿圆环分布",
    "   ※ 这里不能给 .trace-slot 加 backface-visibility:hidden —— 加了会把「转向背面」的整张卡",
    "     一起隐掉，环上只剩三张正面卡。",
    "   ※ --band 挂在 .trace-slot 上，正反面与边饰层一起继承，移动端改一处就整卡跟着缩 */",
    ".trace-slot{position:absolute;inset:0;transform-style:preserve-3d;--band:9px;",
    "  --a:calc((360deg / var(--quantity)) * var(--index));--face:.86;",
    "  transform:rotateY(var(--a)) translateZ(var(--translateZ)) rotateY(calc(var(--a) * var(--face) * -1))}",
    "/* 卡后主色光晕（对应原作的彩色渐变底，换成各文物主色）；退 2px 避免与卡面共面闪烁 */",
    ".trace-slot::after{content:\"\";position:absolute;inset:-16px;border-radius:24px;pointer-events:none;",
    "  transform:translateZ(-2px);",
    "  background:radial-gradient(circle at 50% 50%,rgba(var(--accent),.4) 0%,rgba(var(--accent),0) 70%)}",
    "/* 卡片「立在桌面上」：底沿一片接地影，跟着卡一起转，环才有落在一条基线上的实感 */",
    ".trace-slot::before{content:\"\";position:absolute;left:-6%;right:-6%;bottom:-9%;height:18%;",
    "  border-radius:50%;pointer-events:none;transform:translateZ(-1px);",
    "  background:radial-gradient(50% 50% at 50% 50%,rgba(72,34,12,.34) 0%,rgba(72,34,12,0) 74%)}",

    /* ↓↓ 翻面卡（沿用 funny-cobra-5 骨架，去掉 hover 翻面与 25° 斜转：环形里会互相打架） ↓↓ */
    /* ※ .uno-card 上不能留 perspective —— 它会把 .card-inner 的子层压平在卡片自己的平面里，
       于是「环转到后半圈」时浏览器只按扁平上下文判朝向：.front 永不被剔除，露出镜像的正面。
       改成 transform-style:preserve-3d（把子层交还给环的 3D 空间）+ 去掉局部 perspective 后，
       背面剔除恢复正常，后半圈自然露出卡背；翻面动效改用环上那层 perspective(1500px) */
    ".trace-page .uno-card{position:relative;width:100%;height:100%;",
    "  transform-style:preserve-3d;border-radius:14px;cursor:pointer}",
    ".trace-page .card-inner{position:relative;width:100%;height:100%;text-align:center;",
    "  transition:transform .95s cubic-bezier(.4,.2,.2,1);transform-style:preserve-3d;border-radius:14px;",
    "  box-shadow:0 16px 34px rgba(70,30,10,.28)}",
    ".trace-page .uno-card.flipped .card-inner{transform:rotateY(180deg)}",
    ".trace-page .front,.trace-page .back{position:absolute;inset:0;border-radius:14px;overflow:hidden;",
    "  -webkit-backface-visibility:hidden;backface-visibility:hidden}",
    ".trace-page .front{display:flex;flex-direction:column;",
    "  padding:calc(var(--band) + 4px) calc(var(--band) + 4px) calc(var(--band) + 5px);",
    "  background:linear-gradient(180deg,#FFFDF6 0%,#F3E4C6 100%)}",
    /* 边饰层：四条 1:1 平铺，四层背景挂在一个元素上（顶层留 1px 纸白再走内金线） */
    /* 没挑纹样时（.f-none 或未命中）走素框：外沿一道墨线，内侧交给 .trace-inline 的金线，
       与有纹样时是同一套骨架，只是中段留白 */
    ".f-none .trace-frame{box-shadow:inset 0 0 0 1px rgba(163,64,44,.42)}",
    /* 素框也要有 --band：装裱留白、金线位置、卡片内边距都靠它，
       少了这个变量整张卡的版式会塌掉（副标题被卡沿切掉就是这么来的） */
    ".f-none{--band:clamp(9px,calc(var(--dkw,160px) * .105),18px)}",
    ".trace-page .back .trace-frame{box-shadow:inset 0 0 0 1px rgba(201,164,106,.42)}",
    ".trace-frame{position:absolute;inset:0;pointer-events:none;z-index:3;opacity:.66;",
    "  background-position:left top,left bottom,left top,right top;",
    "  background-repeat:repeat-x,repeat-x,repeat-y,repeat-y;",
    "  background-size:auto var(--band),auto var(--band),var(--band) auto,var(--band) auto}",
    ".trace-inline{position:absolute;inset:calc(var(--band) + 2px);border-radius:7px;pointer-events:none;z-index:3;",
    "  box-shadow:inset 0 0 0 1px rgba(198,158,96,.95)}",
    ".trace-page .front-bg{flex:1;min-height:0;border-radius:5px;overflow:hidden;",
    "  display:flex;align-items:center;justify-content:center;",
    "  background:radial-gradient(circle at 50% 40%,rgba(255,255,255,.95) 0%,rgba(var(--accent),.18) 100%)}",
    ".trace-page .front-bg img{width:100%;height:100%;object-fit:contain;display:block}",
    /* 卡背：与正面同一套装裱层次（纹带 + 留白 + 金线 + 卡心），纹样用鎏金回纹，八张共用 */
    ".trace-page .back{transform:rotateY(180deg);display:flex;align-items:center;justify-content:center;",
    "  padding:calc(var(--band) + 3px);",
    "  background:linear-gradient(180deg,#20272A 0%,#131A1C 100%)}",
    ".trace-page .back-bg{width:100%;height:100%;border-radius:5px;overflow:hidden}",
    ".trace-page .back-bg img{width:100%;height:100%;object-fit:cover;display:block}",
    /* 卡面文字（原先在卡外的 <b>/<small>，现在收进卡内，随卡一起转）
       卡宽只有 160（手机 104），单行放不下「商 · 青铜酒尊 · 殷墟妇好墓」这种，
       所以两行封顶：超过两行才省略，宁可行高紧一点也不要砍成「…」 */
    ".trace-meta{flex:none;margin-top:5px;padding:0 1px;text-wrap:balance}",
    ".trace-meta b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;",
    "  font-size:13px;line-height:1.28;color:#7C0A0D;letter-spacing:.01em;overflow:hidden;",
    "  word-break:keep-all;overflow-wrap:break-word}",
    ".trace-meta small{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;",
    "  margin-top:2px;font-size:9.5px;line-height:1.32;color:#8a6a48;letter-spacing:0;overflow:hidden;",
    "  word-break:keep-all;overflow-wrap:break-word}",

    /* 底部控制条 */
    ".trace-ctrl{display:flex;align-items:center;justify-content:center;gap:16px;margin:0 0 12px}",
    ".trace-ctrl button{width:34px;height:34px;padding:0;border-radius:50%;cursor:pointer;",
    "  font-size:16px;line-height:1;color:#7C0A0D;background:linear-gradient(180deg,#FFFDF6,#F2E1BF);",
    "  border:1px solid rgba(196,150,74,.72);box-shadow:0 3px 10px rgba(70,40,16,.14);",
    "  transition:transform .2s,box-shadow .2s}",
    ".trace-ctrl button:hover{transform:translateY(-1px);box-shadow:0 7px 16px rgba(70,40,16,.2)}",
    ".trace-tip{text-align:center;font-size:12px;color:#9a7048;letter-spacing:.1em;margin:0}",
    /* 打开纹样工坊的入口按钮
       形制取自 Uiverse.io「StealthWorm / spotty-horse-48」的星空按钮：
       双边框（content-box 深底 + border-box 流动渐变描边）+ 两层星点漂移 + 上下双色光晕。
       配色由原作的「黑底 + 黄粉紫蓝彩虹边」换成本页的「深朱红底 + 鎏金→朱红描边」，
       星点也改成金色；hover 放大从 1.1 收到 1.05，免得在纸底上太跳。 */
    ".trace-tools{display:flex;justify-content:center;margin:-2px 0 16px}",
    ".trace-tools .trace-shop-btn{position:relative;display:flex;justify-content:center;align-items:center;",
    "  width:17.6rem;height:2.75rem;overflow:hidden;cursor:pointer;font:inherit;color:#FFE9B8;",
    /* isolation 必须在：否则 z-index:-1 的星空层会跑到按钮背景之下，星点全被深红盖掉 */
    "  isolation:isolate;",
    "  border-radius:5rem;border:double 4px transparent;background-origin:border-box;",
    "  background-clip:content-box,border-box;background-size:300% 300%;",
    "  background-image:linear-gradient(#7C0F13,#7C0F13),",
    "  linear-gradient(137.48deg,#EBD3A0 8%,#C9A46A 34%,#B0472C 62%,#8E1114 88%);",
    "  animation:tbtn-gradient 6s ease infinite;transition:.5s}",
    "@keyframes tbtn-gradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}",
    ".trace-shop-btn strong{z-index:2;font-weight:400;font-size:13px;letter-spacing:.16em;",
    "  color:#FFE9B8;text-shadow:0 0 6px rgba(255,214,150,.5)}",
    ".trace-shop-btn strong i{font-style:normal;margin-left:.55em;font-size:11.5px;",
    "  letter-spacing:.06em;color:rgba(255,233,184,.74)}",
    /* 星空层：两层 radial 星点，一层斜落、一层慢旋 */
    ".tbtn-stars{position:absolute;z-index:-1;display:block;width:100%;height:100%;overflow:hidden;",
    "  border-radius:5rem;transition:.5s}",
    ".tbtn-field{position:relative;display:block;width:200rem;height:200rem;background:transparent}",
    ".tbtn-field::before,.tbtn-field::after{content:\"\";position:absolute;",
    "  background-image:radial-gradient(#FFE3AE 1px,transparent 1%);background-size:26px 26px}",
    ".tbtn-field::before{top:0;left:-50%;width:170%;height:500%;opacity:.55;animation:tbtn-drift 60s linear infinite}",
    ".tbtn-field::after{top:-10rem;left:-100rem;width:100%;height:100%;animation:tbtn-spin 90s linear infinite}",
    "@keyframes tbtn-drift{from{transform:translateY(0)}to{transform:translateY(-135rem)}}",
    "@keyframes tbtn-spin{from{transform:rotate(360deg)}to{transform:rotate(0)}}",
    /* 光晕层：金 + 朱两条模糊色带，隔着按钮上下起伏 */
    ".tbtn-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;width:78%}",
    ".tbtn-glow span{display:block;width:100%;height:30px;filter:blur(1.3rem);z-index:-1;animation:tbtn-pulse 4s infinite}",
    ".tbtn-glow span:nth-of-type(1){background:rgba(201,164,106,.5)}",
    ".tbtn-glow span:nth-of-type(2){background:rgba(165,24,28,.55)}",
    "@keyframes tbtn-pulse{0%{transform:scale(.75);opacity:.8}",
    "  70%{transform:scale(1);opacity:1}100%{transform:scale(.75);opacity:.8}}",
    /* 交互：hover 时星空浮上来并放大，按下时描边收成一条金线 */
    ".trace-shop-btn:hover .tbtn-stars{z-index:1;background-color:#7C0F13}",
    ".trace-shop-btn:hover{transform:scale(1.05)}",
    ".trace-shop-btn:active{border:double 4px #C9A46A;animation:none}",
    ".trace-shop-btn:active .tbtn-glow span{background:#C9A46A}",
    ".trace-shop-btn:focus-visible{outline:2px solid #C9A46A;outline-offset:4px}",
    "@media (max-width:520px){.trace-tools .trace-shop-btn{width:auto;max-width:100%;padding:0 18px;height:2.5rem}",
    "  .trace-shop-btn strong{font-size:12px;letter-spacing:.08em}}",
    "@media (prefers-reduced-motion:reduce){.trace-shop-btn,.tbtn-field::before,.tbtn-field::after,",
    "  .tbtn-glow span{animation:none}}",

    /* ↓↓ 纹样工坊：仿图鉴的纹样选择面板（点一款即换，本地记住） ↓↓ */
    ".trace-shop{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center}",
    ".trace-shop[hidden]{display:none}",
    /* 蒙层不用 backdrop-filter：环上是 preserve-3d 的 3D 图层，Chrome 对其做背景模糊时会采样错乱
       （实测整屏出现镜像拉扯），纯半透明底更稳 */
    ".trace-shop-mask{position:absolute;inset:0;background:rgba(34,14,9,.58)}",
    ".trace-shop-panel{position:relative;width:min(920px,94vw);max-height:88vh;display:flex;flex-direction:column;",
    "  background:#FFFBF1 url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCc+PGZpbHRlciBpZD0nbic+PGZlVHVyYnVsZW5jZSBiYXNlRnJlcXVlbmNlPScuOCcgbnVtT2N0YXZlcz0nMicvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsdGVyPSd1cmwoI24pJyBvcGFjaXR5PScuMDIyJy8+PC9zdmc+\");",
    "  border-radius:16px;border:1px solid rgba(196,150,74,.65);box-shadow:0 30px 70px rgba(50,16,8,.4);",
    "  font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;color:#3B2418;overflow:hidden}",
    ".trace-shop-head{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;",
    "  padding:20px 24px 14px;border-bottom:1px solid rgba(196,150,74,.32)}",
    ".trace-shop-head b{display:block;font-size:19px;letter-spacing:.14em;color:#8E1114}",
    ".trace-shop-head small{display:block;margin-top:6px;font-size:12px;color:#8a6a48;letter-spacing:.06em}",
    ".trace-shop-head .trace-shop-src{margin-top:3px;font-size:11px;color:#a98d6c;letter-spacing:.04em}",
    ".trace-shop-x{flex:none;width:30px;height:30px;line-height:1;font-size:19px;cursor:pointer;border-radius:50%;",
    "  color:#8E1114;background:#FFFDF6;border:1px solid rgba(196,150,74,.6)}",
    /* 两排控件必须一眼分得开：① 选卡是直角细框的空心标签，② 选纹样是图鉴那样的圆角实心胶囊，
       各配一枚朱红序号章与虚线分隔，避免上下两排长得一样认错 */
    ".trace-shop-row{flex:none;display:flex;align-items:center;gap:9px;padding:0 24px}",
    ".trace-shop-row+.trace-shop-row{margin-top:2px;border-top:1px dashed rgba(196,150,74,.34)}",
    ".trace-shop-lbl{flex:none;display:flex;align-items:center;gap:5px;font-size:11px;",
    "  letter-spacing:.12em;color:#A5181C;white-space:nowrap}",
    ".trace-shop-lbl em{font-style:normal;width:15px;height:15px;line-height:15px;text-align:center;",
    "  border-radius:50%;background:#A5181C;color:#FFE9B8;font-size:9.5px;letter-spacing:0}",
    ".trace-shop-who{flex:1;min-width:0;display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 6px}",
    ".trace-chip{font:inherit;font-size:11.5px;padding:4px 9px;border-radius:4px;cursor:pointer;",
    "  color:#6F4E2E;background:#F6EDDA;border:1px solid rgba(196,150,74,.34);white-space:nowrap}",
    ".trace-chip em{font-style:normal;font-size:9.5px;color:#B08954;margin-right:4px;letter-spacing:0}",
    ".trace-chip.on{color:#FFF3D6;background:linear-gradient(180deg,#A5181C,#7C0F13);border-color:#7C0F13}",
    ".trace-chip.on em{color:#FFD98A}",
    /* 分类条：横向可滑的分区标签，样式与图鉴站的分类胶囊一致 */
    ".trace-shop-cats{flex:1;min-width:0;display:flex;gap:8px;padding:9px 0;overflow-x:auto;",
    "  scrollbar-width:none;-webkit-overflow-scrolling:touch}",
    ".trace-shop-cats::-webkit-scrollbar{display:none}",
    ".trace-cat{flex:none;font:inherit;font-size:12px;padding:6px 12px;border-radius:999px;cursor:pointer;",
    "  white-space:nowrap;color:#7A5A3A;background:rgba(255,250,238,.7);",
    "  border:1px solid rgba(196,150,74,.42);transition:background .16s,color .16s,border-color .16s}",
    ".trace-cat em{font-style:normal;font-size:10px;opacity:.6;margin-left:4px}",
    ".trace-cat:hover{background:#fff;color:#8E1114}",
    ".trace-cat.on{color:#FFF3D6;background:linear-gradient(180deg,#A5181C,#7C0F13);border-color:#7C0F13}",
    ".trace-cat.on em{opacity:.78}",
    /* 窄屏：8 个卡名改成一行横滑，别换行吃掉半屏网格高度 */
    "@media (max-width:520px){.trace-shop-who{flex-wrap:nowrap;overflow-x:auto;",
    "  scrollbar-width:none}.trace-shop-who::-webkit-scrollbar{display:none}",
    "  .trace-shop-who .trace-chip{flex:none}.trace-shop-lbl{font-size:10px;letter-spacing:.06em}}",
    ".trace-shop-empty{grid-column:1/-1;margin:26px auto;max-width:420px;text-align:center;",    "  font-size:13px;line-height:2;color:#8a6647;letter-spacing:.06em}",
    ".trace-shop-grid{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;",
    "  display:grid;grid-template-columns:repeat(auto-fill,124px);grid-auto-rows:166px;",
    "  justify-content:center;align-content:start;gap:16px 14px;padding:16px 20px 10px}",
    /* 样卡直接用纹样图鉴的卡图（3:4），底部压一条渐变写编号与名称 */
    ".trace-sw{position:relative;display:block;width:124px;height:166px;padding:0;cursor:pointer;",
    "  border-radius:9px;border:0;overflow:hidden;background:#F3EAD8;",
    "  box-shadow:0 4px 12px rgba(70,40,16,.14),inset 0 0 0 1px rgba(160,110,60,.12);",
    "  font-family:inherit;transition:transform .18s,box-shadow .18s}",
    ".trace-sw img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}",
    ".trace-sw:hover{transform:translateY(-3px);box-shadow:0 12px 22px rgba(70,40,16,.24)}",
    ".trace-sw.on{box-shadow:0 0 0 2px #A5181C,0 12px 22px rgba(70,40,16,.26)}",
    ".trace-sw span{position:absolute;left:0;right:0;bottom:0;padding:16px 5px 5px;pointer-events:none;",
    "  font-size:11.5px;letter-spacing:.06em;color:#FFF3DA;text-align:center;white-space:nowrap;",
    "  overflow:hidden;text-overflow:ellipsis;",
    "  background:linear-gradient(180deg,rgba(38,16,10,0) 0%,rgba(38,16,10,.84) 62%)}",
    ".trace-sw em{font-style:normal;opacity:.72;margin-right:3px;font-size:10px}",
    ".trace-shop-foot{flex:none;display:flex;justify-content:space-between;align-items:center;gap:12px;",
    "  padding:10px 24px 18px;border-top:1px solid rgba(196,150,74,.28)}",
    ".trace-shop-foot button{font:inherit;font-size:12px;padding:6px 14px;border-radius:999px;cursor:pointer;",
    "  color:#8a6a48;background:#FFFDF6;border:1px solid rgba(196,150,74,.5)}",
    ".trace-shop-foot em{font-style:normal;font-size:11.5px;color:#9a7048;letter-spacing:.04em}",

    /* ↓↓ 下半区：Uiverse.io Sophiek9h/black-pug-58 复古电视机（纯 CSS art）↓↓
       原组件全部尺寸按 em 写，所以整机比例由 font-size 一个值控制。
       移植时做三件不改视觉语言的事：
         ① 所有选择器加 .trace-tv 作用域前缀（原类名 .main/.tv/.screen 太通用，会污染全站）
         ② 原 px 常量（边框 2px、线条 2px、阴影偏移 3.5px、天线阴影 50px/56px）改写为 em，
            否则缩到移动端时边框不变细、比例会走形
         ③ 配色由「橙 #d36604 + 深褐」映射到本页的「朱红 #A5181C + 鎏金 #C9A46A」，
            与红色 hero、米黄纸底同一族；屏幕仍是原来的 CRT 雪花噪点动画
       下半区只放这一台电视，居中，不配说明文字 */
    /* 电视机组件内部上下各留了约 200px 空（天线与底座的自留地），这里上提一点，页面不至于空一大段 */
    ".trace-bottom{display:flex;justify-content:center;margin:-34px 0 0;padding:6px 0}",
    "/* 两根天线杆左右不对称，盒子中心比视觉中心偏右约 1.1em，用负 margin 把视觉重心拉回页面中线 */",
    ".trace-tv{flex:none;isolation:isolate;font-size:24px;line-height:1;margin-left:-0.55em;",
    "  font-family:Montserrat,\"Microsoft YaHei\",sans-serif}",
    /* 宽屏再抬一档：屏幕 28em×27em 时实际放映区约 300×215，看片才不至于费眼 */
    "/* 原画布是 30em 正方形，但机身+天线实际只占约 17em×16em，按实测把四周空档收掉。",
    "   注意 a1/a2（两根天线杆）的盒子比可见细线高得多，收缩量要按「天线尖到底座」的真实高度算，",
    "   否则天线会穿出卡片上沿（实测曾越界 59px） */",
    ".trace-tv .main_wrapper{display:flex;align-items:center;justify-content:center;width:30em;height:30em;",
    "  margin:-.95em -5.2em -8.25em}",
    ".trace-tv .main{display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:0}",
    "/* 原组件 .main 有 margin-top:5em 把机身往下推，画布收紧后会整体偏下（实测上 118 / 下 28），去掉后随画布居中 */",
    ".trace-tv .antenna{width:5em;height:5em;border-radius:50%;border:.12em solid #2A0A06;background-color:#A5181C;",
    "  margin-bottom:-6em;margin-left:0;z-index:-1}",
    ".trace-tv .antenna_shadow{position:absolute;background-color:transparent;width:3.1em;height:3.5em;",
    "  margin-left:1.68em;border-radius:45%;transform:rotate(140deg);border:.25em solid transparent;",
    "  box-shadow:inset 0 1em #6E0C10,inset 0 1em 1px 1px #6E0C10}",
    ".trace-tv .antenna::after{content:\"\";position:absolute;margin-top:-9.4em;margin-left:.4em;",
    "  transform:rotate(-25deg);width:1em;height:.5em;border-radius:50%;background-color:#C4453F}",
    ".trace-tv .antenna::before{content:\"\";position:absolute;margin-top:.2em;margin-left:1.25em;",
    "  transform:rotate(-20deg);width:1.5em;height:.8em;border-radius:50%;background-color:#C4453F}",
    ".trace-tv .a1{position:relative;top:-102%;left:-130%;width:12em;height:5.5em;border-radius:50px;",
    "  background-image:linear-gradient(#171717,#171717,#353535,#353535,#171717);transform:rotate(-29deg);",
    "  clip-path:polygon(50% 0%,49% 100%,52% 100%)}",
    ".trace-tv .a1d{position:relative;top:-211%;left:-35%;transform:rotate(45deg);width:.5em;height:.5em;",
    "  border-radius:50%;border:.12em solid #2A0A06;background-color:#B9B3AA;z-index:99}",
    ".trace-tv .a2{position:relative;top:-210%;left:-10%;width:12em;height:4em;border-radius:50px;",
    "  background-color:#171717;background-image:linear-gradient(#171717,#171717,#353535,#353535,#171717);",
    "  margin-right:5em;clip-path:polygon(47% 0,47% 0,34% 34%,54% 25%,32% 100%,29% 96%,49% 32%,30% 38%);",
    "  transform:rotate(-8deg)}",
    ".trace-tv .a2d{position:relative;top:-294%;left:94%;width:.5em;height:.5em;border-radius:50%;",
    "  border:.12em solid #2A0A06;background-color:#B9B3AA;z-index:99}",
    ".trace-tv .tv{width:17em;height:9em;margin-top:3em;border-radius:.9em;background-color:#A5181C;",
    "  display:flex;justify-content:center;border:.12em solid #2A0A06;box-shadow:inset .2em .2em #C4453F}",
    ".trace-tv .tv::after{content:\"\";position:absolute;width:17em;height:9em;border-radius:.9em;",
    "  background:repeating-radial-gradient(#A5181C 0 .0001%,#00000070 0 .0002%) 50% 0/2500px 2500px,",
    "  repeating-conic-gradient(#A5181C 0 .0001%,#00000070 0 .0002%) 60% 60%/2500px 2500px;",
    "  background-blend-mode:difference;opacity:.09}",
    ".trace-tv .curve_svg{position:absolute;margin-top:.25em;margin-left:-.25em;height:.75em;width:.75em;",
    "  fill:#2A0A06}",
    ".trace-tv .display_div{display:flex;align-items:center;align-self:center;justify-content:center;",
    "  border-radius:.9em;box-shadow:.22em .22em 0 #C9A46A}",
    ".trace-tv .screen_out1{width:11em;height:7.75em;display:flex;align-items:center;justify-content:center;",
    "  border-radius:.6em}",
    ".trace-tv .screen{position:relative;width:13em;height:7.85em;border:.12em solid #1d0e01;border-radius:.6em;z-index:99;",
    "  display:flex;align-items:center;justify-content:center;overflow:hidden;text-align:center;",
    "  background:repeating-radial-gradient(#000 0 .0001%,#fff 0 .0002%) 50% 0/2500px 2500px,",
    "  repeating-conic-gradient(#000 0 .0001%,#fff 0 .0002%) 60% 60%/2500px 2500px;",
    "  background-blend-mode:difference;animation:trace-tv-scan .2s infinite alternate}",
    "@keyframes trace-tv-scan{100%{background-position:50% 0,60% 50%}}",
    "/* 屏内字幕：压一层半透明黑底，才不会被雪花吃掉 */",
    ".trace-scr{position:relative;z-index:2;max-width:90%;background:rgba(10,5,3,.8);color:#FFE9B8;",
    "  border-radius:.35em;padding:.4em .55em;box-shadow:inset 0 0 0 1px rgba(255,217,138,.34)}",
    ".trace-scr b{display:block;font-size:.9em;line-height:1.35;letter-spacing:.04em;color:#FFD98A}",
    ".trace-scr small{display:block;margin-top:.22em;font-size:.64em;line-height:1.32;letter-spacing:.06em;",
    "  color:#D9BD90}",
    ".trace-tv .lines{display:flex;column-gap:.1em;align-self:flex-end}",
    ".trace-tv .line1,.trace-tv .line3{width:.14em;height:.5em;background:#2A0A06;",
    "  border-radius:25px 25px 0 0;margin-top:.5em}",
    ".trace-tv .line2{flex-grow:1;width:.14em;height:1em;background:#2A0A06;border-radius:25px 25px 0 0}",
    ".trace-tv .buttons_div{width:4.25em;align-self:center;height:8em;background-color:#C9A46A;",
    "  border:.12em solid #2A0A06;padding:.6em;border-radius:.6em;display:flex;align-items:center;",
    "  justify-content:center;flex-direction:column;row-gap:.75em;box-shadow:.2em .2em 0 #8E6A32}",
    ".trace-tv .b1{position:relative;width:1.65em;height:1.65em;border-radius:50%;background:#6B3A1E;",
    "  border:.12em solid #1a0806;box-shadow:inset .14em .14em .08em #C09268,-.14em 0 #4A2410,",
    "  -.14em 0 0 1px #1a0806}",
    ".trace-tv .b1::before{content:\"\";position:absolute;margin-top:1em;margin-left:.5em;transform:rotate(47deg);",
    "  border-radius:5px;width:.1em;height:.4em;background:#000}",
    ".trace-tv .b1::after{content:\"\";position:absolute;margin-top:.9em;margin-left:.8em;transform:rotate(47deg);",
    "  border-radius:5px;width:.1em;height:.55em;background:#000}",
    ".trace-tv .b1 div{position:absolute;margin-top:-.1em;margin-left:.65em;transform:rotate(45deg);",
    "  width:.15em;height:1.5em;background:#000}",
    ".trace-tv .b2{position:relative;width:1.65em;height:1.65em;border-radius:50%;background:#6B3A1E;",
    "  border:.12em solid #1a0806;box-shadow:inset .14em .14em .08em #C09268,-.14em 0 #4A2410,",
    "  -.14em 0 0 1px #1a0806}",
    ".trace-tv .b2::before{content:\"\";position:absolute;margin-top:1.05em;margin-left:.8em;transform:rotate(-45deg);",
    "  border-radius:5px;width:.15em;height:.4em;background:#000}",
    ".trace-tv .b2::after{content:\"\";position:absolute;margin-top:-.1em;margin-left:.65em;transform:rotate(-45deg);",
    "  width:.15em;height:1.5em;background:#000}",
    ".trace-tv .speakers{display:flex;flex-direction:column;row-gap:.5em}",
    ".trace-tv .speakers .g1{display:flex;column-gap:.25em}",
    ".trace-tv .g11,.trace-tv .g12,.trace-tv .g13{width:.65em;height:.65em;border-radius:50%;background:#6B3A1E;",
    "  border:.12em solid #1a0806;box-shadow:inset .09em .09em .06em #C09268}",
    ".trace-tv .speakers .g{width:auto;height:.14em;background:#2A0A06}",
    "/* 底座：原组件 base3 是 absolute 却没有定位祖先（会相对视口跑），这里挂在 .bottom 上 */",
    ".trace-tv .bottom{position:relative;width:100%;height:auto;display:flex;align-items:center;",
    "  justify-content:center;column-gap:8.7em}",
    ".trace-tv .base1,.trace-tv .base2{height:1em;width:2em;border:.12em solid #171717;background:#5A3A26;",
    "  margin-top:-.15em;z-index:-1}",
    ".trace-tv .base3{position:absolute;left:50%;transform:translateX(-50%);height:.1em;width:17.5em;",
    "  background:#171717;margin-top:.8em}",

    /* 电视右侧说明（已按需求移除，仅保留居中电视） */

    "/* 断点按「环投影总宽 = 2×√(R² + (w/2)²) 必须小于可视宽」反推，否则两侧卡会被 overflow 裁掉 */",
    /* ===================== 卡带 · 拖动联动 =====================
       卡带形制取自 Uiverse「Praashoo7 / jolly-bulldog-31」的复古磁带：
       3:2 黑壳 + 奶油标签 + 金色卷轴窗 + 朱红条 + 四角螺丝。
       配色换成本页的「栗黑 → 米纸 → 赤金 → 朱红」，尺寸统一由 --cw 控制，
       内部一律按 --cw 的百分比排布，移动端只改 --cw 一处。 */
    /* ===================== 文物卡盒 · Uiverse「necatimertmetin / little-fly-45」 =====================
       卡盒外壳换成一台掌机：左蓝右红两只手柄 + 中间一块屏幕，八张文物卡散在屏幕里。
       原组件是 470×196.5（2.39:1）的小掌机，这里按卡盒的 860×580 重新配比：
         --jcw 手柄宽 / --js 手柄按键摇杆的整体缩放 / --so-px|py 屏幕外框内边距
         --sb-x|y 屏幕黑边厚度。所有通用类名一律加 .trace-box 前缀，
         尤其 .screen / .button / .content，否则会污染下半区电视机的 .screen。 */
    ".trace-box{--dkw:132px;--jcw:88px;--js:.88;--so-px:14px;--so-py:12px;",
    "  --sb-x:22px;--sb-y:16px;position:relative;display:flex;align-items:stretch;",
    "  width:min(860px,96%);height:580px;margin:8px auto 0;",
    "  border-radius:42px;overflow:hidden;background:#1b1c1e;",
    "  box-shadow:0 20px 44px -20px rgba(50,22,8,.55),0 0 0 1px rgba(28,20,12,.35)}",
    /* 屏幕外框：金属灰渐层，撑满两只手柄之间 */
    ".trace-box .screen-outline{display:flex;align-items:stretch;flex:1;min-width:0;",
    "  padding:var(--so-py) var(--so-px);border-radius:2px;pointer-events:none;",
    "  background:linear-gradient(180deg,rgba(71,77,79,1) 0%,rgba(90,97,100,1) 3%,",
    "    rgba(46,50,51,1) 5%,rgba(46,50,51,1) 100%)}",
    ".trace-box .screen-border{box-sizing:border-box;flex:1;min-width:0;display:flex;",
    "  border:var(--sb-y) solid #050505;border-left-width:var(--sb-x);border-right-width:var(--sb-x);",
    "  border-radius:6px;background:#050505}",
    ".trace-box .screen{position:relative;flex:1;min-width:0;border-radius:2px;overflow:hidden;",
    "  background:linear-gradient(135deg,rgba(38,39,43,1) 0%,rgba(49,52,62,1) 49%,",
    "    rgba(38,39,43,1) 100%)}",
    /* 屏幕底纹：极淡扫描线 + 中央暖光，让米纸卡片在冷灰屏上更跳 */
    ".trace-box .screen::before{content:'';position:absolute;inset:0;pointer-events:none;",
    "  background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px),",
    "    radial-gradient(ellipse at 50% 45%,rgba(226,190,132,.13),transparent 68%)}",
    ".trace-box .screen img{height:100%;width:100%;object-fit:cover}",
    /* 两只手柄 */
    ".trace-box .joy-con{position:relative;flex:0 0 var(--jcw);width:var(--jcw);height:100%;",
    "  background:#777;pointer-events:none}",
    ".trace-box .joy-con.left{border-top-left-radius:40px;border-bottom-left-radius:40px;",
    "  border-top-right-radius:4px;border-bottom-right-radius:4px;",
    "  background:linear-gradient(148deg,rgba(0,186,219,1) 0%,rgba(0,185,220,1) 100%);",
    "  box-shadow:inset 3px -4px 10px #058ca5,inset 0 5px 3px #6ad9ed}",
    ".trace-box .joy-con.right{border-top-right-radius:40px;border-bottom-right-radius:40px;",
    "  border-top-left-radius:4px;border-bottom-left-radius:4px;",
    "  background:linear-gradient(148deg,rgba(250,97,93,1) 0%,rgba(239,79,77,1) 100%);",
    "  box-shadow:inset -3px -4px 10px #d12621,inset 0 5px 3px #fd877c}",
    /* 摇杆 / 十字键 / 功能键：位置用百分比铺满竖长的手柄，尺寸用 --js 统一缩放 */
    ".trace-box .joystick{position:absolute;left:50%;top:22%;",
    "  width:calc(46px * var(--js));height:calc(46px * var(--js));margin-left:calc(-23px * var(--js));",
    "  border-radius:50%;background:#2d2e33;border:1px solid #2d2e33;overflow:hidden;",
    "  display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);",
    "  grid-column-gap:1px;grid-row-gap:1px;filter:drop-shadow(0 1px 2px #00000088)}",
    ".trace-box .joy-con.right .joystick{top:44%;filter:contrast(130%) drop-shadow(0 1px 2px #00000088)}",
    ".trace-box .joystick-edge{background:#444}",
    ".trace-box .joystick-inner-border{position:absolute;top:50%;left:50%;z-index:2;",
    "  background:#2d2e33;padding:1px;border-radius:50%;transform:translate(-50%,-50%);",
    "  display:flex;align-items:center;justify-content:center}",
    ".trace-box .joystick-inner{position:relative;z-index:3;border-radius:50%;",
    "  width:calc(36px * var(--js));height:calc(36px * var(--js));background:#282c2f;",
    "  box-shadow:inset 0 -4px 4px #313131,inset 0 4px 12px #7c7c7c,inset 0 4px 6px #000}",
    ".trace-box .numpad-container{position:absolute;left:50%;top:48%;",
    "  width:calc(72px * var(--js));height:calc(72px * var(--js));",
    "  margin-left:calc(-36px * var(--js));display:flex;flex-direction:column;",
    "  align-items:center;justify-content:center;color:#1b1b1c;font-size:calc(10px * var(--js))}",
    ".trace-box .joy-con.right .numpad-container{top:16%;color:#d7d7d7}",
    ".trace-box .numpad-part{flex:1;display:flex;align-items:center;justify-content:center;width:100%}",
    ".trace-box .numpad-middle{gap:calc(22px * var(--js))}",
    ".trace-box .numpad-button{width:calc(20px * var(--js));height:calc(20px * var(--js));",
    "  background:#505050;border:1px solid #2d2e33;border-radius:50%;",
    "  display:flex;align-items:center;justify-content:center;font-size:calc(9px * var(--js));",
    "  box-shadow:inset -.5px -.5px 1.5px rgba(92,92,92,.5),inset .2px 1px .8px rgba(143,143,143,.66),",
    "    inset -1px -1px 2px rgba(31,31,31,.76),0 0 3px #00000055}",
    ".trace-box .minus{position:absolute;top:9%;right:calc(8px * var(--js));",
    "  width:calc(16px * var(--js));height:calc(3px * var(--js));border-radius:1px;",
    "  border:.8px solid #222;background:#3c3d41}",
    ".trace-box .plus-symbol{position:absolute;top:8%;left:calc(8px * var(--js));",
    "  width:calc(16px * var(--js));height:calc(16px * var(--js));display:inline-block}",
    ".trace-box .plus-symbol::before,.trace-box .plus-symbol::after{content:'';position:absolute;",
    "  background:#333;border:.8px solid #222;border-radius:1px}",
    ".trace-box .plus-symbol::before{width:2px;height:86.5%;left:50%;transform:translateX(-50%)}",
    ".trace-box .plus-symbol::after{width:86.5%;height:2px;top:50%;transform:translateY(-50%)}",
    ".trace-box .plus-symbol-overlap-fixer{position:absolute;z-index:3;top:50%;left:50%;",
    "  width:2px;height:calc(100% - 2px);border-radius:1px;background:#333;",
    "  transform:translate(-50%,-50%)}",
    ".trace-box .record-button{position:absolute;top:74%;left:calc(31px * var(--js));",
    "  width:calc(16px * var(--js));height:calc(16px * var(--js));border:1px solid #2d2e33;",
    "  border-radius:2px;background:linear-gradient(135deg,#605f65,#3c3d42);",
    "  display:flex;align-items:center;justify-content:center}",
    ".trace-box .record-button-inner{width:calc(7px * var(--js));height:calc(7px * var(--js));",
    "  border:1px solid #2d2e33;border-radius:50%;background:#605f65}",
    ".trace-box .home-button-border{position:absolute;top:74%;left:calc(11px * var(--js));",
    "  width:calc(22px * var(--js));height:calc(22px * var(--js));padding:1px;",
    "  border:1px solid #1b1b1c;border-radius:50%;",
    "  background:linear-gradient(135deg,#a0a0a0,#303030);",
    "  display:flex;align-items:center;justify-content:center}",
    ".trace-box .home-button{width:calc(18px * var(--js));height:calc(18px * var(--js));",
    "  border:.9px solid #1b1b1c;border-radius:50%;color:#000;font-size:calc(12px * var(--js));",
    "  background:linear-gradient(180deg,#6b6b6b,#303030);",
    "  display:flex;align-items:center;justify-content:center}",
    ".trace-box .button{cursor:pointer}",
    /* 卡片不是叠成一摞，是按 8 个点位散在盒里（Uiverse 之外另取的 hover.dev Drag Cards 摆法：
       每张各自有位置与倾角，按住能随手挪，松手就停在原地，像真的撒了一盒卡）。
       点位用百分比（相对卡片层，也就是掌机屏幕的宽高），--tx/--ty 是拖动增量，--r 是倾角。 */
    /* 卡片层仍按百分比点位散布，但父容器收进掌机屏幕：左右 = 手柄 + 外框内边距 + 黑边，
       上下 = 外框内边距 + 黑边。SPOTS 三套点位表一字不改，卡片自然落在屏幕里 */
    ".trace-deck{position:absolute;z-index:2;",
    "  left:calc(var(--jcw) + var(--so-px) + var(--sb-x));",
    "  right:calc(var(--jcw) + var(--so-px) + var(--sb-x));",
    "  top:calc(var(--so-py) + var(--sb-y));",
    "  bottom:calc(var(--so-py) + var(--sb-y))}",
    ".deck-card{position:absolute;left:calc(var(--lx) * 1%);top:calc(var(--ly) * 1%);",
    "  width:var(--dkw,160px);height:calc(var(--dkw,160px) * 1.345);",
    "  margin-left:calc(var(--dkw,160px) / -2);margin-top:calc(var(--dkw,160px) * 1.345 / -2);",
    "  transform:translate3d(var(--tx,0px),var(--ty,0px),0) rotate(var(--r,0deg));",
    "  cursor:grab;touch-action:none;will-change:transform;",
    "  transition:transform .2s cubic-bezier(.3,.9,.4,1),opacity .25s,filter .25s}",
    /* 悬停只抬阴影，不用 filter：drop-shadow 在卡片移动时要逐帧重算，很吃帧 */
    ".deck-card:hover .uno-card{box-shadow:0 14px 24px rgba(50,20,6,.34)}",
    /* 拖动中：连 filter/阴影的过渡都拿掉，起手那一帧就开始跟手 */
    ".deck-card.moving{transition:opacity .2s;cursor:grabbing;filter:none}",
    ".deck-card.moving:hover{filter:none}",
    ".deck-card.moving .uno-card{box-shadow:0 22px 34px rgba(40,14,4,.5)}",
    ".deck-card.gone{opacity:0;pointer-events:none}",
    ".deck-card:active{cursor:grabbing}",
    ".deck-card .uno-card{width:100%;height:100%}",
    /* 拖出去的那张：盒里留个淡影（拖动中才有，松手即消失） */
    ".deck-card.dragging{opacity:.18}",
    /* 已入机的那张：完全隐去。以前留 30% 透明度当「占位」，在深色盒底上
       就是一块浅色残影，很脏。位置靠 DOM 记住，退带时直接复现 */
    ".deck-card.in-tv{opacity:0;filter:grayscale(.55);pointer-events:none}",
    ".trace-box-tag{position:absolute;left:50%;bottom:1px;transform:translateX(-50%);z-index:3;",
    "  font-size:10px;letter-spacing:.22em;color:#98a0a2;opacity:.9;white-space:nowrap;",
    "  text-shadow:0 1px 1px #000}",
    ".trace-top > .trace-tip{margin:10px 0 10px}",
    /* 操作引导：两条步骤 + 一个指向电视的箭头，常驻在盒子上方，评审/首次进入都看得见 */
    ".trace-guide{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;",
    "  gap:6px 14px;width:min(860px,96%);margin:0 auto 10px;padding:9px 18px;",
    "  border:1px solid rgba(163,64,44,.3);border-radius:999px;",
    "  background:linear-gradient(180deg,rgba(255,251,241,.95),rgba(247,234,207,.9));",
    "  box-shadow:0 5px 16px rgba(84,48,18,.13),inset 0 1px 0 rgba(255,255,255,.9);",
    "  backdrop-filter:blur(2px)}",
    ".tg-step{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}",
    ".tg-n{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;",
    "  background:#A3402C;color:#FFF3DB;font:700 12px/1 Montserrat,sans-serif;font-style:normal;",
    "  box-shadow:0 2px 5px rgba(124,15,19,.28)}",
    ".tg-step b{font-size:13px;letter-spacing:.04em;color:#7C0A0D;font-weight:600}",
    ".tg-step em{font-style:normal;font-size:11.5px;color:#9a7048;letter-spacing:.02em}",
    ".tg-down{font-size:17px;line-height:1;color:#A3402C;animation:tg-bob 1.8s ease-in-out infinite}",
    "@keyframes tg-bob{0%,100%{transform:translateY(-2px);opacity:.65}",
    "  50%{transform:translateY(2px);opacity:1}}",

    /* 卡带本体 */
    ".trace-tape{--cw:172px;position:relative;flex:none;width:var(--cw);height:calc(var(--cw) * .667);",
    "  border-radius:calc(var(--cw) * .035);cursor:grab;touch-action:none;",
    "  background:linear-gradient(158deg,#432211 0%,#2A1208 44%,#160803 100%);",
    "  box-shadow:0 10px 22px rgba(30,10,2,.42),inset 0 1px 0 rgba(255,214,150,.18),",
    "    inset 0 -3px 7px rgba(0,0,0,.5);transform-origin:50% 100%}",
    ".trace-tape:active{cursor:grabbing}",
    ".trace-tape.dragged{opacity:.2}",
    ".trace-tape.arriving{opacity:0;transform:scaleY(.3)}",
    ".trace-tape.landed{animation:trace-tape-land .42s cubic-bezier(.3,1.5,.5,1)}",
    "@keyframes trace-tape-land{0%{transform:scale(1.06,.88)}60%{transform:scale(.98,1.03)}100%{transform:none}}",
    /* 四角螺丝：四个径向渐变一次画完，省节点 */
    ".trace-tape .cs-screws{position:absolute;inset:0;pointer-events:none;border-radius:inherit;",
    "  background-image:radial-gradient(circle at 4.6% 7.5%,#F0DCB6 0 1px,#8A6A45 1.2px 2px,transparent 2.2px),",
    "  radial-gradient(circle at 95.4% 7.5%,#F0DCB6 0 1px,#8A6A45 1.2px 2px,transparent 2.2px),",
    "  radial-gradient(circle at 4.6% 92.5%,#F0DCB6 0 1px,#8A6A45 1.2px 2px,transparent 2.2px),",
    "  radial-gradient(circle at 95.4% 92.5%,#F0DCB6 0 1px,#8A6A45 1.2px 2px,transparent 2.2px)}",
    /* 奶油标签：左缩略图 + 右名号 */
    ".trace-tape .cs-label{position:absolute;left:6.2%;right:6.2%;top:6.5%;height:54%;",
    "  display:flex;gap:5%;padding:4.4% 5%;border-radius:calc(var(--cw) * .012);overflow:hidden;",
    "  background:linear-gradient(180deg,#FFFBEE 0%,#F7EBCD 100%);",
    "  box-shadow:inset 0 0 0 1px rgba(120,80,40,.3),inset 0 -6px 12px rgba(160,120,70,.12)}",
    ".trace-tape .cs-thumb{width:33%;height:100%;object-fit:cover;border-radius:2px;",
    "  box-shadow:0 1px 4px rgba(90,50,20,.3);filter:saturate(.95)}",
    ".trace-tape .cs-txt{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:.18em}",
    ".trace-tape .cs-txt b{font-size:calc(var(--cw) * .058);line-height:1.2;letter-spacing:.03em;color:#6B1F12;",
    "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".trace-tape .cs-txt small{font-size:calc(var(--cw) * .038);line-height:1.35;letter-spacing:.03em;color:#95744B;",
    "  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".trace-tape .cs-txt i{font-style:normal;font-size:calc(var(--cw) * .036);letter-spacing:.14em;",
    "  color:#B08A55;margin-top:.15em}",
    /* 金色卷轴窗：两个卷盘，播放时转 */
    ".trace-tape .cs-window{position:absolute;left:6.2%;right:6.2%;bottom:19%;height:20%;",
    "  display:flex;align-items:center;justify-content:space-between;padding:0 7%;",
    "  background:linear-gradient(180deg,#D7B074,#BE9450);",
    "  box-shadow:inset 0 1px 0 rgba(255,240,200,.55),inset 0 -1px 3px rgba(90,50,10,.35)}",
    ".trace-tape .cs-reel{position:relative;width:calc(var(--cw) * .095);height:calc(var(--cw) * .095);",
    "  border-radius:50%;background:#2A1208;flex:none;",
    "  box-shadow:inset 0 0 0 1px rgba(255,240,200,.5)}",
    ".trace-tape .cs-reel::before{content:\"\";position:absolute;inset:22%;border-radius:50%;",
    "  border:1px dashed rgba(255,246,220,.9);box-shadow:0 0 0 1.6px rgba(255,246,220,.35)}",
    ".trace-tape.playing .cs-reel::before{animation:trace-reel 2.2s linear infinite}",
    "@keyframes trace-reel{to{transform:rotate(1turn)}}",
    ".trace-tape .cs-num{font-size:calc(var(--cw) * .05);letter-spacing:.1em;color:#4A2410;font-weight:700}",
    /* 朱红条 */
    ".trace-tape .cs-strip{position:absolute;left:6.2%;right:6.2%;bottom:5.6%;height:11%;",
    "  display:flex;align-items:center;justify-content:center;border-radius:0 0 calc(var(--cw) * .01) calc(var(--cw) * .01);",
    "  background:linear-gradient(180deg,#B7271F,#8E1114);",
    "  box-shadow:inset 0 1px 0 rgba(255,190,150,.3)}",
    ".trace-tape .cs-strip span{font-size:calc(var(--cw) * .036);letter-spacing:.22em;color:#FFDDB0}",
    /* 退卡小叉：把卡带撤掉、卡片还回环上 */
    ".trace-tape .cs-del{position:absolute;top:-8px;right:-8px;width:19px;height:19px;border-radius:50%;",
    "  border:1px solid rgba(255,236,200,.5);background:#7C0F13;color:#FFE9B8;font-size:11px;line-height:1;",
    "  cursor:pointer;opacity:0;transform:scale(.8);transition:opacity .18s,transform .18s;z-index:2}",
    ".trace-tape:hover .cs-del,.trace-tape:focus-within .cs-del{opacity:1;transform:none}",

    /* 拖拽幽灵（挂 body，fixed；.trace-page 带 transform，挂里面会错位）
       卡片态 → 卡带态靠两层交叉翻转：卡片绕底边压低消失、卡带从底边立起来，
       同时幽灵的宽高按磁带 3:2 过渡，所以看起来是「这张卡被压成了一盘带子」。 */
    ".trace-drag{position:fixed;left:0;top:0;z-index:9998;pointer-events:none;transform-origin:50% 50%;",
    "  will-change:transform;contain:layout paint style;",
    "  filter:drop-shadow(0 12px 18px rgba(40,14,4,.4));",
    "  transition:width .38s cubic-bezier(.22,.8,.26,1),height .38s cubic-bezier(.22,.8,.26,1)}",
    ".trace-drag .dg-card{position:absolute;inset:0;border-radius:14px;overflow:hidden;",
    "  transform-origin:50% 100%;",
    "  transition:transform .32s cubic-bezier(.5,0,.75,0),opacity .26s ease}",
    /* 幽灵里的卡：抹掉盒内的百分比点位与负边距，铺满这一层 */
    ".trace-drag .dg-card .deck-card{position:absolute;inset:0;width:100%;height:100%;",
    "  margin:0;transform:none;transition:none;cursor:grabbing}",
    ".trace-drag .dg-tape{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;",
    "  transform:scaleY(.06);transform-origin:50% 100%;",
    "  transition:transform .36s cubic-bezier(.25,1.2,.5,1),opacity .22s ease .06s}",
    ".trace-drag .dg-tape .trace-tape{width:100%;height:100%;cursor:grabbing}",
    ".trace-drag.morphing .dg-card{transform:rotateX(80deg) scale(.96,.6);opacity:0}",
    ".trace-drag.morphing .dg-tape{opacity:1;transform:scaleY(1)}",
    /* 拖拽时页面其它元素不参与命中，减少 elementFromPoint 误判 */
    ".trace-page .uno-card,.deck-card,.trace-tape{touch-action:none;-webkit-user-select:none;user-select:none}",
    /* 拖动中的卡带：原位留一道淡影，幽灵跟着指针走 */
    "body.trace-dragging{cursor:grabbing}",

    /* 电视播放态：雪花收掉，换成实拍画面 */
    ".trace-tv.playing .screen{animation:none;background:#0B0503}",
    ".trace-tv .trace-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;",
    "  border-radius:inherit;background:#0B0503;cursor:pointer}",
    ".trace-tv.playing .trace-scr{display:none}",
    /* 屏内控件：原生 controls 在 13em 的小屏上会把画面压掉一半，这里自己画一条极简控制条 */
    ".trace-tv .trace-tvbar{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;align-items:center;",
    "  gap:.32em;padding:.22em .38em .28em;background:linear-gradient(180deg,transparent,rgba(0,0,0,.76))}",
    ".trace-tv .trace-tvbar[hidden]{display:none}",
    ".trace-tv .trace-tvbar button{flex:none;width:1.1em;height:1.1em;padding:0;display:flex;",
    "  align-items:center;justify-content:center;font:inherit;font-size:.62em;line-height:1;cursor:pointer;",
    "  color:#FFE9B8;background:rgba(124,15,19,.7);border:1px solid rgba(255,233,184,.4);border-radius:.25em}",
    ".trace-tv .trace-tvbar button:hover{background:#A5181C}",
    ".trace-tv .trace-tvbar .track{flex:1;height:.2em;border-radius:99px;cursor:pointer;",
    "  background:rgba(255,233,184,.26);overflow:hidden}",
    ".trace-tv .trace-tvbar .track i{display:block;height:100%;width:0;",
    "  background:linear-gradient(90deg,#C9A46A,#FFD98A)}",
    /* 全屏时屏幕吃掉整个画面，圆角与边框收掉，控件按视口重新缩放 */
    ".trace-tv .screen:fullscreen,.trace-tv .screen:-webkit-full-screen{",
    "  width:100vw;height:100vh;border:0;border-radius:0;",
    "  display:flex;align-items:center;justify-content:center;background:#000}",
    ".trace-tv .screen:fullscreen .trace-tvbar,.trace-tv .screen:-webkit-full-screen .trace-tvbar{",
    "  font-size:20px;padding:16px 26px 20px;gap:14px;",
    "  background:linear-gradient(180deg,transparent,rgba(0,0,0,.88))}",
    ".trace-tv .screen:fullscreen .trace-tvbar button,",
    ".trace-tv .screen:-webkit-full-screen .trace-tvbar button{width:1.7em;height:1.7em;font-size:.78em;",
    "  border-radius:.32em}",
    ".trace-tv .screen:fullscreen .trace-tvbar .track,",
    ".trace-tv .screen:-webkit-full-screen .trace-tvbar .track{height:.3em}",
    ".trace-tv .screen:fullscreen .trace-eject,.trace-tv .screen:-webkit-full-screen .trace-eject{",
    "  font-size:14px;right:14px;top:14px;opacity:1}",
    /* 全屏里启动键也跟着放大，不然还是个小点 */
    ".trace-tv .screen:fullscreen .trace-gate-btn,",
    ".trace-tv .screen:-webkit-full-screen .trace-gate-btn{width:96px;height:96px}",
    ".trace-tv .screen:fullscreen .trace-gate-tip,",
    ".trace-tv .screen:-webkit-full-screen .trace-gate-tip{font-size:15px;letter-spacing:.3em}",
    ".trace-tv .trace-tv-note{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;",
    "  align-items:center;justify-content:center;gap:.35em;padding:0 .6em;background:#0B0503;",
    "  color:#FFE9B8;text-align:center}",
    /* hidden 必须显式压掉：上面给了 display:flex，会盖住 UA 的 [hidden]{display:none} */
    ".trace-tv .trace-tv-note[hidden]{display:none}",

    /* ---- 入带后的启动键（Uiverse 环形脉冲 + 三角描边，尺寸走 em）---- */
    ".trace-tv .trace-gate{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;",
    "  align-items:center;justify-content:center;gap:.26em;",
    "  background:radial-gradient(circle at 50% 46%,#1C0E07 0%,#0B0503 76%)}",
    ".trace-tv .trace-gate[hidden]{display:none}",
    ".trace-tv .trace-gate-btn{font:inherit;position:relative;display:inline-block;padding:0;border:none;",
    "  width:max(2.55em,44px);height:max(2.55em,44px);border-radius:50%;cursor:pointer;outline:none;",
    "  background:#FFF6E4;",
    "  box-shadow:0 0 0 .05em rgba(255,226,170,.6),0 .12em .34em rgba(0,0,0,.55);",
    "  transition:transform .2s ease,box-shadow .2s ease}",
    ".trace-tv .trace-gate-btn:hover{transform:scale(1.06);box-shadow:0 0 0 .05em rgba(255,226,170,.9),0 .16em .4em rgba(0,0,0,.6)}",
    ".trace-tv .trace-gate-btn:active{transform:scale(.97)}",
    /* 原组件是半透明实心圆，在深色屏上几乎看不出；换成金线圆环，扩出去才看得见 */
    ".trace-tv .tp-ring{position:absolute;inset:0;border-radius:50%;pointer-events:none;",
    "  border:max(1px,.055em) solid rgba(255,214,150,.62);background:rgba(255,222,168,.06)}",
    ".trace-tv .tp-icon{position:absolute;top:50%;left:50%;width:33%;height:33%;",
    "  transform:translate(-50%,-50%)}",
    ".trace-tv .tp-icon svg{display:block;width:100%;height:100%}",
    ".trace-tv .tp-tri{fill:#B3161B;animation:trace-gate-fade 7s ease forwards}",
    ".trace-tv .tp-path{stroke:#B3161B;stroke-width:1;stroke-dasharray:90;stroke-dashoffset:0;",
    "  animation:trace-gate-stroke 3s ease forwards}",
    ".trace-tv .has-scale-animation{animation:trace-gate-scale 3s infinite ease-out}",
    ".trace-tv .has-delay-short{animation-delay:.5s}",
    ".trace-tv .trace-gate-tip{font-size:max(.56em,10px);letter-spacing:.22em;color:#C9AE85;",
    "  text-indent:.22em;white-space:nowrap}",
    "@keyframes trace-gate-fade{from{opacity:0}to{opacity:1}}",
    "@keyframes trace-gate-stroke{from{stroke-dashoffset:90}to{stroke-dashoffset:0}}",
    "@keyframes trace-gate-scale{from{transform:scale(1);opacity:1}to{transform:scale(1.5);opacity:0}}",
    ".trace-tv .trace-tv-note b{font-size:.72em;letter-spacing:.06em;color:#FFD98A}",
    ".trace-tv .trace-tv-note small{font-size:.56em;line-height:1.45;color:#C9AE85;letter-spacing:.02em}",
    /* 退带：压在画面右上角那圈黑边上，平时压暗，鼠标进来才实——不挡片子 */
    ".trace-tv .trace-eject{position:absolute;right:1.6%;top:1.6%;z-index:4;font:inherit;",
    "  font-size:.58em;padding:.24em .46em;border-radius:999px;cursor:pointer;",
    "  color:#FFE9B8;background:rgba(124,15,19,.86);border:1px solid rgba(255,233,184,.42);",
    "  box-shadow:0 .12em .3em rgba(0,0,0,.35);opacity:.62;transition:opacity .18s ease,background .18s ease}",
    ".trace-tv .trace-eject:hover,.trace-tv:hover .trace-eject{opacity:1;background:#A5181C}",
    "@media (hover:none){.trace-tv .trace-eject{opacity:.94}}",

    /* 窄屏：盒子和卡片一起缩，点位由 spotCSS 的 t/m 两套表接管，卡不会溢出盒口 */
    "@media (min-width:1360px){.trace-tv{font-size:27px}}",
    "@media (max-width:900px){.trace-box{height:520px;--dkw:clamp(96px,15vw,132px);--jcw:66px;--js:.72;",
    "  --so-px:10px;--so-py:9px;--sb-x:16px;--sb-y:12px}",
    "  .trace-tv{font-size:12px}}",
    /* 手机屏幕只有 230px 宽：八张卡改排 2 列 × 4 行，卡面字号跟着收一档，
       不然 3 列会把每张卡的右半边（连标题）压在邻卡底下 */
    "@media (max-width:640px){.trace-box{height:520px;width:100%;--dkw:92px;--jcw:38px;--js:.44;",
    "  --so-px:5px;--so-py:6px;--sb-x:7px;--sb-y:8px;border-radius:24px}",
    "  .trace-meta{margin-top:3px}",
    "  .trace-meta b{font-size:11px;line-height:1.22}",
    "  .trace-meta small{font-size:8px;line-height:1.25;margin-top:1px}",
    "  .trace-top > .trace-tip{margin:10px 8px 8px;font-size:11px;line-height:1.6}",
    "  .trace-guide{flex-direction:column;gap:3px;border-radius:14px;padding:8px 10px;width:100%}",
    "  .tg-step{white-space:normal;flex-wrap:wrap;justify-content:center;gap:5px}",
    "  .tg-step b{font-size:12px}.tg-step em{font-size:10.5px}",
    "  .tg-down{font-size:14px;animation:none}",
    "  .trace-bottom{padding:6px 0 2px;margin:6px 0 0}",
    "  .trace-page{padding-bottom:86px}",
    "  .trace-tv{font-size:11px}.trace-tv .main_wrapper{margin:-.95em -5.2em -8.25em}}",
    /* ---- 低性能兜底 .perf-lite（由 JS 按实测帧率自动挂上）----
       没走 GPU 合成时是软件光栅化，整环每帧都要重画，实测只有 20fps。
       三处最贵：① CRT 雪花 background-blend-mode:difference + 2500px 渐变，0.2s 一帧反复重绘；
       ② 每张卡后 8 个大径向光晕；③ 每张卡 16px/34px 大模糊阴影。这里换成静态扫描线 + 去光晕 + 小阴影，
       卡阵、边框、翻面、电视外形全部照旧，只是不再逐帧重算这些模糊 */
    ".trace-page.perf-lite .trace-tv .screen{animation:none;background:",
    "  repeating-linear-gradient(0deg,rgba(0,0,0,.5) 0 .16em,rgba(58,46,36,.3) .16em .34em),",
    "  radial-gradient(circle at 50% 45%,#1d1613,#050403)}",
    ".trace-page.perf-lite .trace-slot::after{display:none}",
    ".trace-page.perf-lite .card-inner{box-shadow:0 6px 14px rgba(70,30,10,.2)}",
    "@media (prefers-reduced-motion:reduce){.trace-spin{animation:none}",
    "  .trace-tv .screen{animation:none}}"
  ].concat(spotCSS(SPOTS.d))
   .concat(spotCSS(SPOTS.t, "@media (max-width:900px)"))
   .concat(spotCSS(SPOTS.m, "@media (max-width:640px)"))
   .concat(Object.keys(FRAMES).map(function (k) {
    var f = FRAMES[k], d = framePath(f);
    var h = 'url("' + d + '_h.webp")', v = 'url("' + d + '_v.webp")';
    /* band 跟着卡宽走：160 的卡约 17px、手机 104 约 11px。以前用 vw，
       盒子变宽而卡不变时边带会粗得压住字 */
    return ".f-" + k + "{--band:clamp(9px,calc(var(--dkw,160px) * .105),18px)}" +
           ".f-" + k + " .trace-frame{background-image:" + h + "," + h + "," + v + "," + v + "}";
  })).join("\n");

  function injectCSS() {
    if ($("aw-trace-css")) return;
    var s = document.createElement("style");
    s.id = "aw-trace-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ============================ ② 页面结构 ============================ */
  /* 用户可在「纹样工坊」里逐张换边饰，选择存 localStorage；这里以 FRAME_OF 为准 */
  var FRAME_KEYS = Object.keys(FRAMES);
  var STORE = "relic_trace_frames_v1";
  var FRAME_OF = (function () {
    var def = CARDS.map(function (c) { return c.frame; });
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { saved = null; }
    if (!saved || saved.length !== CARDS.length) return def;
    return def.map(function (k, i) { return FRAMES[saved[i]] ? saved[i] : k; });
  })();
  function saveFrames() {
    try { localStorage.setItem(STORE, JSON.stringify(FRAME_OF)); } catch (e) {}
  }

  function slotHTML(c, i) {
    return '<div class="trace-slot f-' + esc(FRAME_OF[i]) + '" style="--index:' + i + ';--accent:' + esc(c.accent) + '">' +
      '<div class="uno-card" data-i="' + i + '" role="button" tabindex="0" ' +
           'aria-label="' + esc(c.title) + ' · 翻面查看文物精灵题字">' +
        '<div class="card-inner">' +
          '<div class="front">' +
            '<div class="front-bg">' +
              '<img src="' + esc(c.front) + '" alt="' + esc(c.title) + ' 精灵" draggable="false">' +
            '</div>' +
            '<div class="trace-meta"><b>' + esc(c.title) + '</b><small>' + esc(c.sub) + '</small></div>' +
            '<i class="trace-frame"></i><i class="trace-inline"></i>' +
          '</div>' +
          '<div class="back">' +
            '<div class="back-bg">' +
              '<img src="' + esc(BACK) + '" alt="文物精灵 · 草书题字" draggable="false">' +
            '</div>' +
            '<i class="trace-frame"></i>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* 下半区的复古电视机（Uiverse black-pug-58，类名加 .trace-tv 前缀；屏幕字幕可被翻面联动） */
  function tvHTML() {
    var D = "M70.343,70.343c-30.554,30.553-44.806,72.7-39.102,115.635l-29.738,3.951" +
      "C-5.442,137.659,11.917,86.34,49.129,49.13C86.34,11.918,137.664-5.445,189.928,1.502" +
      "l-3.95,29.738C143.041,25.54,100.895,39.789,70.343,70.343z";
    return '<div class="trace-tv">' +
      '<div class="main_wrapper"><div class="main">' +
        '<div class="antenna"><div class="antenna_shadow"></div>' +
          '<div class="a1"></div><div class="a1d"></div><div class="a2"></div><div class="a2d"></div></div>' +
        '<div class="tv">' +
          '<div class="cruve"><svg class="curve_svg" viewBox="0 0 189.929 189.929"><path d="' + D + '"></path></svg></div>' +
          '<div class="display_div"><div class="screen_out"><div class="screen_out1">' +
            '<div class="screen">' +
              '<div class="trace-scr">' +
                '<b id="traceTvTitle">文物溯源 · 视频讲解</b>' +
                '<small id="traceTvSub">八件文物 · 八段来路<br>卡带入机，按下播放键放映</small>' +
              '</div>' +
              /* 影片铺满屏幕；没有素材时由 .trace-tv-note 顶上说明 */
              '<video class="trace-video" id="traceVideo" playsinline preload="none" hidden></video>' +
              '<div class="trace-tv-note" id="traceTvNote" hidden>' +
                '<b id="traceTvNoteTitle">卡带已入机</b>' +
                '<small id="traceTvNoteSub"></small>' +
              '</div>' +
              /* 带子入机后先停在这一屏：按下这个键才真的开始放 */
              '<div class="trace-gate" id="traceGate" hidden>' +
                '<button type="button" class="trace-gate-btn is-play" id="traceGateBtn" aria-label="播放影片">' +
                  '<span class="tp-ring has-scale-animation"></span>' +
                  '<span class="tp-ring has-scale-animation has-delay-short"></span>' +
                  '<span class="tp-icon"><svg viewBox="0 0 30 30" fill="none" aria-hidden="true">' +
                    '<polygon class="tp-tri" points="9,4.5 24,15 9,25.5"></polygon>' +
                    '<path class="tp-path" d="M9,4.5 L24,15 L9,25.5z"></path>' +
                  '</svg></span>' +
                '</button>' +
                '<small class="trace-gate-tip">按此放映</small>' +
              '</div>' +
              '<button type="button" class="trace-eject" id="traceEject" hidden>⏏ 退带</button>' +
              /* 自绘控制条：播/暂停 · 进度 · 全屏（屏幕只有 13em 宽，原生控件太大） */
              '<div class="trace-tvbar" id="traceTvBar" hidden>' +
                '<button type="button" id="tracePlayBtn" aria-label="播放或暂停">❚❚</button>' +
                '<div class="track" id="traceTrack"><i id="traceTrackFill"></i></div>' +
                '<button type="button" id="traceFsBtn" aria-label="全屏观看">⛶</button>' +
              '</div>' +
            '</div>' +
          '</div></div></div>' +
          '<div class="lines"><div class="line1"></div><div class="line2"></div><div class="line3"></div></div>' +
          '<div class="buttons_div">' +
            '<div class="b1"><div></div></div><div class="b2"></div>' +
            '<div class="speakers"><div class="g1"><div class="g11"></div><div class="g12"></div>' +
              '<div class="g13"></div></div><div class="g"></div><div class="g"></div></div>' +
          '</div>' +
        '</div>' +
        '<div class="bottom"><div class="base1"></div><div class="base2"></div><div class="base3"></div></div>' +
      '</div></div>' +
    '</div>';
  }

  /* 卡带外观：形制取自 Uiverse「Praashoo7 / jolly-bulldog-31」的复古磁带，
     结构压成「壳 / 奶油标签 / 金色卷轴窗 / 朱红条」四段，名号与编号取自 CARDS。 */
  function tapeHTML(i) {
    var c = CARDS[i], num = ("0" + (i + 1)).slice(-2);
    return '<div class="trace-tape" data-i="' + i + '" role="button" tabindex="0" ' +
        'aria-label="' + esc(c.title) + ' 卡带 · 拖进电视机放映">' +
      '<i class="cs-screws"></i>' +
      '<div class="cs-label">' +
        '<img class="cs-thumb" src="' + esc(c.front) + '" alt="" draggable="false">' +
        '<div class="cs-txt"><b>' + esc(c.title) + '</b>' +
          '<small>' + esc(c.sub) + '</small><i>NO.' + num + '</i></div>' +
      '</div>' +
      '<div class="cs-window"><span class="cs-reel"></span>' +
        '<span class="cs-num">' + num + '</span><span class="cs-reel"></span></div>' +
      '<div class="cs-strip"><span>RELIC · TAPE</span></div>' +
      '<button type="button" class="cs-del" aria-label="撤掉这张卡带">×</button>' +
    '</div>';
  }

  /* 盒子里的一张卡：正反两面（沿用 funny-cobra-5 的翻面骨架）+ 各自一款纹样边饰。
     位置与倾角全部由 spotCSS 下发的 --lx/--ly/--r 决定，这里只带一个 --accent。 */
  function deckCard(c, i) {
    return '<div class="deck-card f-' + esc(FRAME_OF[i]) + '" data-i="' + i + '" ' +
        'style="--accent:' + esc(c.accent) + '" ' +
        'role="button" tabindex="0" ' +
        'aria-label="' + esc(c.title) + ' · 轻点翻面，按住拖出盒子会变成卡带">' +
      '<div class="uno-card" data-i="' + i + '">' +
        '<div class="card-inner">' +
          '<div class="front">' +
            '<div class="front-bg">' +
              '<img src="' + esc(c.front) + '" alt="' + esc(c.title) + ' 精灵" draggable="false">' +
            '</div>' +
            '<div class="trace-meta"><b>' + esc(c.title) + '</b><small>' + esc(c.sub) + '</small></div>' +
            '<i class="trace-frame"></i><i class="trace-inline"></i>' +
          '</div>' +
          '<div class="back">' +
            '<div class="back-bg">' +
              '<img src="' + esc(BACK) + '" alt="文物精灵 · 草书题字" draggable="false">' +
            '</div>' +
            '<i class="trace-frame"></i>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* 上半区：掌机造型的卡盒，八张卡散在屏幕里 —— 拖出去就成了卡带 */
  /* Uiverse「necatimertmetin / little-fly-45」的 HTML 骨架，原样搬进来：
     左蓝右红两只手柄（减号 / 摇杆 / 十字键 / 录制键，加号 / 摇杆 / ABXY / Home 键）
     + 中间一块空屏幕。屏幕留给八张文物卡，手柄全是装饰、不参与拖拽。
     原组件 470×196.5 的绝对定位在放大的机身上会挤成一团，
     所以 CSS 里把位置改成百分比、尺寸交给 --js 统一缩放。 */
  function switchHTML() {
    return '<div class="joy-con left">' +
        '<div class="minus button"></div>' +
        '<div class="joystick">' +
          '<div class="joystick-inner-border"><div class="joystick-inner"></div></div>' +
          '<div class="joystick-edge"></div><div class="joystick-edge"></div>' +
          '<div class="joystick-edge"></div><div class="joystick-edge"></div>' +
        '</div>' +
        '<div class="numpad-container">' +
          '<div class="numpad-part numpad-top"><div class="numpad-button">▲</div></div>' +
          '<div class="numpad-part numpad-middle"><div class="numpad-button">◀</div>' +
            '<div class="numpad-button">▶</div></div>' +
          '<div class="numpad-part numpad-bottom"><div class="numpad-button">▼</div></div>' +
        '</div>' +
        '<div class="record-button"><div class="record-button-inner"></div></div>' +
      '</div>' +
      '<div class="screen-outline"><div class="screen-border"><div class="screen"></div></div></div>' +
      '<div class="joy-con right">' +
        '<div class="plus-symbol"><div class="plus-symbol-overlap-fixer"></div></div>' +
        '<div class="joystick">' +
          '<div class="joystick-inner-border"><div class="joystick-inner"></div></div>' +
          '<div class="joystick-edge"></div><div class="joystick-edge"></div>' +
          '<div class="joystick-edge"></div><div class="joystick-edge"></div>' +
        '</div>' +
        '<div class="numpad-container">' +
          '<div class="numpad-part numpad-top"><div class="numpad-button">X</div></div>' +
          '<div class="numpad-part numpad-middle"><div class="numpad-button button">Y</div>' +
            '<div class="numpad-button button">A</div></div>' +
          '<div class="numpad-part numpad-bottom"><div class="numpad-button button">B</div></div>' +
        '</div>' +
        '<div class="home-button-border"><div class="home-button">⌂</div></div>' +
      '</div>';
  }

  function deckHTML() {
    /* 先把玩法讲清楚：拖卡出盒 → 化带 → 入机 → 按播放键
       注意 return 后面别写 `注释 +`：那个 + 会被当成一元加号，把第一个字符串转成 NaN */
    return '<div class="trace-guide" aria-label="操作提示">' +
        '<span class="tg-step"><i class="tg-n">1</i><b>按住卡片，拖出盒子</b>' +
          '<em>出手即化卡带</em></span>' +
        '<span class="tg-down" aria-hidden="true">↓</span>' +
        '<span class="tg-step"><i class="tg-n">2</i><b>把卡带放进下方电视机</b>' +
          '<em>点「按此放映」看片</em></span>' +
      '</div>' +
      '<div class="trace-box switch-card" id="traceBox">' +
        switchHTML() +
        '<div class="trace-deck" id="traceDeck" style="--n:' + (CARDS.length - 1) + '">' +
          CARDS.map(deckCard).join("") + '</div>' +
        '<span class="trace-box-tag">文物卡盒 · 八件</span>' +
      '</div>' +
      '<p class="trace-tip">轻点卡片可翻面看背面 · 卡片在盒里也能随手挪动 · 不想看了点「⏏ 退带」</p>' +
      '<div class="trace-tools">' +
        '<button type="button" class="trace-shop-btn" id="traceShopOpen">' +
          '<strong>纹样工坊 · 换卡框<i>八张各挑一款</i></strong>' +
          '<span class="tbtn-stars"><span class="tbtn-field"></span></span>' +
          '<span class="tbtn-glow"><span></span><span></span></span>' +
        '</button>' +
      '</div>';
  }

  function pageHTML() {
    return '<div class="trace-page">' +
      '<div class="trace-hero">' +
        '<span class="trace-eyebrow">AI 工坊 · 溯源讲解</span>' +
        '<h2>文物溯源 · 视频讲解</h2>' +
        '<p>文物无言，各载春秋。世间没有两件完全相同的古物，每一件文物背后，都沉淀着一段独一无二的故事，藏着古人的悲欢、时代的风云，等待我们解锁、传递华夏文明。</p>' +
        '<span class="trace-stat">视频精灵 · 八只讲解精灵已就位</span>' +
      '</div>' +
      /* 上半区：一只卡盒，里面摞着八张卡 */
      '<div class="trace-top">' + deckHTML() + '</div>' +
      /* 下半区：只有一台复古电视机，居中 */
      '<div class="trace-bottom">' +
        tvHTML() +
      '</div>' +
      shopHTML() +
    '</div>';
  }

  /* 纹样工坊面板：仿传统纹样图鉴的排布 —— 上方先选「给哪张卡换」，下方一排纹样样卡 */
  function shopHTML() {
    return '<div class="trace-shop" id="traceShop" hidden>' +
      '<div class="trace-shop-mask" data-shop-close="1"></div>' +
      '<div class="trace-shop-panel" role="dialog" aria-modal="true" aria-label="卡框纹样">' +
        '<div class="trace-shop-head">' +
          '<div><b>卡框纹样</b><small>先选一张卡，再点一款纹样；八张可以各不相同，选择会自动记住</small>' +
            '<small class="trace-shop-src">共 ' + FRAME_KEYS.length +
            ' 款 · 六类各取图鉴第一页 · 取自 Wényàng 中国传统纹样图鉴（CC BY-NC 4.0）</small></div>' +
          '<button type="button" class="trace-shop-x" data-shop-close="1" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="trace-shop-row">' +
          '<span class="trace-shop-lbl"><em>1</em>换哪张卡</span>' +
          '<div class="trace-shop-who" id="traceShopWho"></div>' +
        '</div>' +
        '<div class="trace-shop-row">' +
          '<span class="trace-shop-lbl"><em>2</em>挑哪款纹样</span>' +
          '<div class="trace-shop-cats" id="traceShopCats"></div>' +
        '</div>' +
        '<div class="trace-shop-grid" id="traceShopGrid"></div>' +
        '<div class="trace-shop-foot">' +
          '<em id="traceShopNow">正在换：—</em>' +
          '<button type="button" id="traceShopReset">全部恢复默认</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ======================= ②-b 出盒化带 · 入机放映 =======================
     一条链路：盒里摞着八张卡 → 按住一张拖出盒口 → 越过盒沿当场「化」成卡带
     → 投进电视屏幕 → 放映 文物溯源/视频/0X.mp4。松手没投中就变回卡片落回盒里。
     全程 Pointer Events，鼠标 / 触摸 / 触控笔同一套，没有引第三方库。 */
  function bindDeck(box) {
    var page = box.closest ? box.closest(".trace-page") : null;
    if (!page) return;
    var tv = page.querySelector(".trace-tv");
    if (!tv) return;
    var screen = tv.querySelector(".screen");
    var deck = $("traceDeck");
    var video = $("traceVideo"), note = $("traceTvNote");
    var noteTitle = $("traceTvNoteTitle"), noteSub = $("traceTvNoteSub");
    var ejectBtn = $("traceEject");
    var bar = $("traceTvBar"), playBtn = $("tracePlayBtn"), fsBtn = $("traceFsBtn");
    var track = $("traceTrack"), fill = $("traceTrackFill");
    var gate = $("traceGate"), gateBtn = $("traceGateBtn");

    /* 素材在 文物精灵的起源视频/，文件名按文物取（鼓俑 / 汉瓦当 / 妇好 …），
       每张卡的 video 字段就是它；找不到再退回「编号 / 清洗后的标题」两套老名字 */
    var VIDEO_DIR = "文物精灵的起源视频/";
    var EXT = ["mp4", "webm", "m4v", "mov"];

    var ghost = null, drag = null;
    var gw = 190, gh = 258;          // 卡片态尺寸
    var tw = 330, th = 220;          // 卡带态尺寸
    var morphed = false;             // 幽灵是否已经化成卡带
    var muteClick = 0;               // 拖完吞掉尾随的 click
    var inTv = -1;                   // 屏幕里那张卡
    var okUrl = {};

    function cardAt(i) { return deck ? deck.querySelector('.deck-card[data-i="' + i + '"]') : null; }
    function inRect(el, x, y, pad) {
      var r = el.getBoundingClientRect();
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    }
    /* 尺寸都按实际量，断点改了 CSS 也不用再改一处 JS */
    function cardSize() {
      var c = deck ? deck.querySelector(".deck-card") : null;
      var r = c ? c.getBoundingClientRect() : null;
      return r && r.width ? { w: Math.round(r.width), h: Math.round(r.height) } : { w: 190, h: 258 };
    }
    /* 卡带必守 3:2：早先用盒子高度算高，盒子一加高带子就被拉扁，卷盘与标签全变形 */
    function tapeSize() {
      var w = box.clientWidth || 600;
      var cw = Math.round(Math.min(380, Math.max(250, w * 0.46)));
      return { w: cw, h: Math.round(cw * 0.667) };
    }

    /* ---------------- 翻面 ---------------- */
    function flipCard(card) {
      var inner = card.classList && card.classList.contains("uno-card")
        ? card : (card.querySelector ? card.querySelector(".uno-card") : null);
      if (!inner) return;
      var toBack = !inner.classList.contains("flipped");
      var all = deck.querySelectorAll(".uno-card");
      for (var i = 0; i < all.length; i++) {
        all[i].classList.toggle("flipped", all[i] === inner && toBack);
      }
    }

    /* ---------------- 幽灵：卡片出盒后接管拖动的这一层 ---------------- */
    function placeGhost(cx, cy, rot, sc) {
      if (!ghost) return;
      ghost.style.transform = "translate3d(" + Math.round(cx - gw / 2) + "px," +
        Math.round(cy - gh / 2) + "px,0)" + (rot ? " rotate(" + rot + "deg)" : "") +
        " scale(" + (sc || 1.02) + ")";
    }
    /* 盒内拖动：直接写 transform。
       早先每帧写 --tx/--ty 会让整棵卡片子树的样式重算（8 层纹样背景 + 翻面骨架），
       实测掉帧明显；改成写一个合成属性，指针事件再用 rAF 合并成一帧一次。 */
    function setPos(d, dx, dy) {
      d.card.style.transform = "translate3d(" + (d.tx0 + dx).toFixed(1) + "px," +
        (d.ty0 + dy).toFixed(1) + "px,0) rotate(" + d.rot + ")";
    }
    /* 盒口矩形按下时量一次，拖动过程中不再读布局，避免「写样式 → 读矩形」的强制重排 */
    var boxR = null;
    function inBox(x, y, pad) {
      if (!boxR) boxR = box.getBoundingClientRect();
      return x >= boxR.left - pad && x <= boxR.right + pad &&
             y >= boxR.top - pad && y <= boxR.bottom + pad;
    }
    /* 按下即置顶：扫一遍盒里的卡，把 z-index 抬到最大值 +1 */
    function raiseZ(card) {
      var all = deck.querySelectorAll(".deck-card"), mx = 0;
      for (var i = 0; i < all.length; i++) {
        var z = parseInt(window.getComputedStyle(all[i]).zIndex, 10);
        if (!isNaN(z) && z > mx) mx = z;
      }
      card.style.zIndex = mx + 1;
    }
    /* 出盒：以卡片此刻的样貌另起一层幽灵，盒里那张先藏起来 */
    function beginDrag(d, cx, cy) {
      var cs = cardSize(), ts = tapeSize();
      gw = cs.w; gh = cs.h; tw = ts.w; th = ts.h;
      morphed = false;
      ghost = document.createElement("div");
      ghost.className = "trace-drag card-mode";
      ghost.style.width = gw + "px";
      ghost.style.height = gh + "px";
      ghost.innerHTML =
        '<div class="dg-card">' + deckCard(CARDS[d.i], d.i) + '</div>' +
        '<div class="dg-tape f-' + esc(FRAME_OF[d.i]) + '">' + tapeHTML(d.i) +
          '<i class="trace-frame"></i></div>';
      var tp = ghost.querySelector(".trace-tape");
      if (tp) tp.style.setProperty("--cw", tw + "px");
      /* 盒里那张若已翻到背面，幽灵也照背面拿出去 */
      var inner = d.card.querySelector(".uno-card");
      if (inner && inner.classList.contains("flipped")) {
        var gi = ghost.querySelector(".dg-card .uno-card");
        if (gi) gi.classList.add("flipped");
      }
      document.body.appendChild(ghost);
      placeGhost(cx, cy, 0, 1.02);
      d.card.classList.add("gone");
      document.body.classList.add("trace-dragging");
    }
    function killGhost() {
      if (ghost && ghost.parentNode) {
        ghost.style.visibility = "hidden";
        ghost.parentNode.removeChild(ghost);
      }
      ghost = null;
      morphed = false;
      document.body.classList.remove("trace-dragging");
    }
    /* 卡片 → 卡带：尺寸换成磁带的 3:2，两层交叉翻转 */
    function morphToTape() {
      if (!ghost || morphed) return;
      morphed = true;
      void ghost.offsetWidth;            // 先让浏览器认下卡片态的尺寸，过渡才会跑
      ghost.classList.add("morphing");
      ghost.style.width = tw + "px";
      ghost.style.height = th + "px";
      gw = tw; gh = th;
    }
    /* 落定：位置夹在掌机屏幕以内（不是整台机身，否则卡片会被拖到手柄上），
       再把 transform 交回 CSS 的 --tx/--ty/--r */
    function settle(d) {
      var br = (deck || box).getBoundingClientRect(), cs = cardSize(), p = 8;
      var hw = cs.w / 2, hh = cs.h / 2;
      var cx = d.cx0 + (d.x - d.x0), cy = d.cy0 + (d.y - d.y0);
      cx = Math.min(Math.max(cx, br.left + hw + p), br.right - hw - p);
      cy = Math.min(Math.max(cy, br.top + hh + p), br.bottom - hh - p);
      d.card.style.setProperty("--tx", (d.tx0 + cx - d.cx0).toFixed(1) + "px");
      d.card.style.setProperty("--ty", (d.ty0 + cy - d.cy0).toFixed(1) + "px");
      d.card.style.removeProperty("transform");     // 与上一帧同值，肉眼看不到接缝
      d.card.classList.remove("moving");
    }

    function onDown(e) {
      if (drag) return;
      if (e.button != null && e.button !== 0) return;
      var t = e.target;
      if (!t || !t.closest) return;
      var card = t.closest(".deck-card");
      if (!card || card.classList.contains("in-tv")) return;
      var r = card.getBoundingClientRect();
      boxR = box.getBoundingClientRect();
      drag = {
        i: +card.getAttribute("data-i"), card: card,
        x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
        cx0: r.left + r.width / 2, cy0: r.top + r.height / 2,
        tx0: parseFloat(card.style.getPropertyValue("--tx")) || 0,
        ty0: parseFloat(card.style.getPropertyValue("--ty")) || 0,
        rot: (window.getComputedStyle(card).getPropertyValue("--r") || "0deg").trim() || "0deg",
        moved: false, pid: e.pointerId
      };
      raiseZ(card);
      card.classList.add("moving");
      try { box.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    }

    var raf = 0;
    /* 一帧只算一次：指针再怎么密，落到 DOM 上也就每帧一个 transform */
    function flush() {
      raf = 0;
      var d = drag;
      if (!d) return;
      var dx = d.x - d.x0, dy = d.y - d.y0;
      var cx = d.cx0 + dx, cy = d.cy0 + dy;
      if (!ghost) {
        setPos(d, dx, dy);
        /* 指针越过盒沿 → 当场化带，交给幽灵接着拖 */
        if (!inBox(d.x, d.y, 8)) {
          beginDrag(d, cx, cy);
          morphToTape();
        }
      } else if (inBox(d.x, d.y, -30)) {
        /* 又拖回盒里 → 变回卡片，交还盒内拖动 */
        killGhost();
        d.card.classList.remove("gone");
        setPos(d, dx, dy);
      } else {
        placeGhost(cx, cy, Math.max(-10, Math.min(10, dx * 0.9)), 1.03);
      }
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      drag.x = e.clientX; drag.y = e.clientY;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 6) return;
        drag.moved = true;                             // 手抖不算拖，留给轻点翻面
        muteClick = Date.now() + 700;
        boxR = box.getBoundingClientRect();
      }
      if (!raf) raf = window.requestAnimationFrame(flush);
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      var d = drag;
      if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
      d.x = e.clientX; d.y = e.clientY;
      if (d.moved) flush();                            // 落手前把最后一帧补上
      drag = null;
      try { box.releasePointerCapture(d.pid); } catch (err) {}
      if (!d.moved) {                                  // 轻点：翻面
        d.card.classList.remove("moving");
        flipCard(d.card);
        return;
      }
      muteClick = Date.now() + 700;
      if (!ghost) { settle(d); return; }               // 盒内松手：就地停住
      var cx = d.cx0 + (d.x - d.x0), cy = d.cy0 + (d.y - d.y0);
      if (inRect(screen, d.x, d.y, 18)) feedTv(d);
      else backHome(d, cx, cy);
    }

    /* 卡带 → 电视：幽灵缩进屏幕并淡出，机器「吞带」，随即放映 */
    function feedTv(d) {
      var r = screen.getBoundingClientRect();
      /* 上一盘还没退带就又塞进来一盘：先把上一张放回盒里，
         否则它会被永久隐去（现在入机那张是完全不可见的） */
      if (inTv >= 0 && inTv !== d.i) {
        var prev = cardAt(inTv);
        if (prev) prev.classList.remove("in-tv");
      }
      var g = ghost; ghost = null;
      morphed = false;
      document.body.classList.remove("trace-dragging");
      if (g) {
        var sc = Math.max(.12, Math.min(1, (r.width * .82) / gw));
        g.style.transition = "transform .44s cubic-bezier(.55,0,.6,1),opacity .44s ease";
        g.style.transform = "translate3d(" + Math.round(r.left + r.width / 2 - gw / 2) + "px," +
          Math.round(r.top + r.height / 2 - gh / 2) + "px,0) rotate(0deg) scale(" + sc + ")";
        g.style.opacity = "0";
        setTimeout(function () {
          if (!g.parentNode) return;
          g.style.visibility = "hidden";              // 先彻底不画，再摘节点，避免合成层残留
          g.parentNode.removeChild(g);
        }, 470);
      }
      d.card.classList.remove("moving");
      d.card.classList.remove("gone");
      d.card.classList.add("in-tv");
      d.card.setAttribute("data-flew", "1");
      playVideo(d.i);
    }

    /* 没投中：变回卡片，飞回屏幕里（落点同样夹在屏幕以内） */
    function backHome(d, cx, cy) {
      var g = ghost; ghost = null;
      morphed = false;
      document.body.classList.remove("trace-dragging");
      var br = (deck || box).getBoundingClientRect(), cs = cardSize(), p = 8;
      var hw = cs.w / 2, hh = cs.h / 2;
      var tx = Math.min(Math.max(cx, br.left + hw + p), br.right - hw - p);
      var ty = Math.min(Math.max(cy, br.top + hh + p), br.bottom - hh - p);
      d.card.style.setProperty("--tx", (d.tx0 + tx - d.cx0).toFixed(1) + "px");
      d.card.style.setProperty("--ty", (d.ty0 + ty - d.cy0).toFixed(1) + "px");
      d.card.style.removeProperty("transform");
      if (g) {
        g.classList.remove("morphing");
        g.style.width = cs.w + "px";
        g.style.height = cs.h + "px";
        g.style.transition = "transform .4s cubic-bezier(.3,.9,.4,1),opacity .4s ease .1s";
        g.style.transform = "translate3d(" + Math.round(tx - cs.w / 2) + "px," +
          Math.round(ty - cs.h / 2) + "px,0) rotate(-3deg) scale(.94)";
        g.style.opacity = "0";
        setTimeout(function () {
          if (!g.parentNode) return;
          g.style.visibility = "hidden";
          g.parentNode.removeChild(g);
        }, 520);
      }
      setTimeout(function () {
        d.card.classList.remove("gone");
        d.card.classList.remove("moving");
      }, 260);
    }

    /* ---------------- 放映 ---------------- */
    function videoCands(i) {
      var c = CARDS[i] || {}, num = ("0" + (i + 1)).slice(-2);
      var names = [c.video, num, String(c.title || "").replace(/[\\/:*?"<>|\s·]+/g, "")];
      var out = [];
      names.forEach(function (n) {
        if (!n) return;
        EXT.forEach(function (x) {
          var u = VIDEO_DIR + n + "." + x;
          if (out.indexOf(u) < 0) out.push(u);
        });
      });
      return out;
    }
    /* 逐个候选试载：命中 loadedmetadata 就用，error 就换下一个，2.4s 没响应也换 */
    function probeVideo(i, cb) {
      if (okUrl[i]) return cb(okUrl[i]);
      var list = videoCands(i), k = 0;
      (function next() {
        if (k >= list.length) return cb(null);
        var url = list[k], v = document.createElement("video"), done = false;
        var timer = setTimeout(function () { if (!done) { done = true; cleanup(); k++; next(); } }, 2400);
        function cleanup() {
          clearTimeout(timer);
          v.onloadedmetadata = v.onerror = null;
          v.removeAttribute("src");
        }
        v.onloadedmetadata = function () {
          if (done) return;
          done = true; cleanup(); okUrl[i] = url; cb(url);
        };
        v.onerror = function () {
          if (done) return;
          done = true; cleanup(); k++; next();
        };
        v.preload = "metadata";
        v.src = url;
      })();
    }
    var armedUrl = null;          // 已探到、等用户按播放的那支片
    var wantPlay = false;         // 按得比探针快：探到就直接放
    function playVideo(i) {
      var c = CARDS[i] || {};
      inTv = i;
      armedUrl = null;
      wantPlay = false;
      tv.classList.add("playing");
      if (ejectBtn) ejectBtn.hidden = false;
      if (note) note.hidden = true;
      if (gate) gate.hidden = false;    // 入带即出键，别让屏幕先黑一下
      if (bar) bar.hidden = true;
      if (video) {
        video.hidden = true;
        video.removeAttribute("src");
        try { video.load(); } catch (e) {}
      }
      probeVideo(i, function (url) {
        if (inTv !== i) return;                          // 期间已经换片或退带
        if (!url) {
          if (note) {
            note.hidden = false;
            if (noteTitle) noteTitle.textContent = c.title + " · 卡带已入机";
            if (noteSub) noteSub.innerHTML = "还没找到影像<br>把 <b>" +
              esc(c.video || ("0" + (i + 1)).slice(-2)) + ".mp4</b> 放进 文物精灵的起源视频/";
          }
          return;
        }
        /* 先停在启动键那一屏，等观众按下才真的放映 */
        armedUrl = url;
        if (note) note.hidden = true;
        if (gate) gate.hidden = false;
        if (wantPlay) startPlay();
      });
    }
    /* 启动键：按下才第一次真正加载影片 */
    /* 全屏只能由用户手势触发：必须在 click 的同一个任务里调用，不能等探针回调 */
    /* 手机竖屏全屏会让横片夹成一条，能锁就锁成横屏；锁不上（iOS）就算了 */
    function tryLandscape() {
      if (!window.matchMedia || !window.matchMedia("(pointer:coarse)").matches) return;
      var o = window.screen && window.screen.orientation;
      if (!o || !o.lock) return;
      try { var p = o.lock("landscape"); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }

    function goBig() {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      try {
        if (screen.requestFullscreen) {
          var p = screen.requestFullscreen();
          if (p && p.then) p.then(tryLandscape, function () {});
          else tryLandscape();
        } else if (screen.webkitRequestFullscreen) {
          screen.webkitRequestFullscreen();
          tryLandscape();
        } else if (video && video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();               // iOS Safari 只认视频自己全屏
        }
      } catch (err) {}
    }

    /* 退出全屏把方向锁解掉，否则整个页面被锁在横屏 */
    function onFsChange() {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      var o = window.screen && window.screen.orientation;
      if (o && o.unlock) { try { o.unlock(); } catch (e) {} }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);

    function startPlay() {
      if (inTv < 0 || !video) return;
      goBig();                                         // 按下即最大放映
      if (!armedUrl) { wantPlay = true; return; }      // 还没探到，等探针回来自动放
      var url = armedUrl;
      armedUrl = null;
      if (gate) gate.hidden = true;
      video.src = url;
      video.hidden = false;
      if (bar) bar.hidden = false;
      if (fill) fill.style.width = "0%";
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
    function togglePlay() {
      if (!video || video.hidden) return;
      if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      else video.pause();
    }
    function eject() {
      var i = inTv;
      inTv = -1;
      /* 全屏里退带就把人放回页面，不然只剩一块空屏幕 */
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      armedUrl = null;
      wantPlay = false;
      if (gate) gate.hidden = true;
      tv.classList.remove("playing");
      if (video) {
        try { video.pause(); } catch (e) {}
        video.removeAttribute("src");
        try { video.load(); } catch (e) {}
        video.hidden = true;
      }
      if (note) note.hidden = true;
      if (ejectBtn) ejectBtn.hidden = true;
      if (bar) bar.hidden = true;
      if (fill) fill.style.width = "0%";
      if (i >= 0) {                                     // 退带：盒里那张重新亮起来
        var c = cardAt(i);
        if (c) {
          c.classList.remove("in-tv");
          if (c.getAttribute("data-flew") === "1") {    // 从盒外飞进去的，退回原来的点位
            c.removeAttribute("data-flew");
            c.classList.remove("moving");
            c.style.removeProperty("--tx");
            c.style.removeProperty("--ty");
            c.style.removeProperty("transform");
            c.style.zIndex = "";
          }
        }
      }
    }

    /* ---------------- 事件 ---------------- */
    box.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    box.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest ? e.target.closest(".deck-card") : null;
      if (!card) return;
      e.preventDefault();
      var inner = card.querySelector(".uno-card");
      if (inner) flipCard(inner);
    });
    /* 拖动尾随的 click 吞掉，免得顺手翻面 */
    box.addEventListener("click", function (e) {
      if (Date.now() < muteClick) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    /* 整块屏幕都是播放面：戳按钮、戳周围空白都算 */
    if (gate) gate.addEventListener("click", function (e) {
      e.stopPropagation();
      startPlay();
    });
    if (ejectBtn) ejectBtn.addEventListener("click", eject);
    if (playBtn) playBtn.addEventListener("click", togglePlay);
    if (video) {
      video.addEventListener("click", togglePlay);
      video.addEventListener("timeupdate", function () {
        var d = video.duration || 0;
        if (fill && d) fill.style.width = (video.currentTime / d * 100).toFixed(2) + "%";
      });
      video.addEventListener("play", function () { if (playBtn) playBtn.textContent = "❚❚"; });
      video.addEventListener("pause", function () { if (playBtn) playBtn.textContent = "▶"; });
    }
    if (track) track.addEventListener("click", function (e) {
      if (!video || !video.duration) return;
      var r = track.getBoundingClientRect();
      var k = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
      try { video.currentTime = k * video.duration; } catch (err) {}
    });
    if (fsBtn) fsBtn.addEventListener("click", function () {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }
      if (video && video.webkitDisplayingFullscreen) { video.webkitExitFullscreen(); return; }
      goBig();
    });
  }





  /* ============================ ③ 交互 ============================ */
  function bind() {
    var box = $("traceBox");
    if (!box) return;

    /* 出盒化带 · 入机放映（见 bindDeck） */
    bindDeck(box);

    /* ---------------- 纹样工坊 ---------------- */
    var shop = $("traceShop"), grid = $("traceShopGrid"), who = $("traceShopWho"), now = $("traceShopNow");
    var openBtn = $("traceShopOpen"), resetBtn = $("traceShopReset");
    if (!shop || !grid || !who) return;

    var cur = 0;                       // 当前正在换的是第几张卡

    function paintOne(i, key) {
      FRAME_OF[i] = key;
      var reel = box.querySelectorAll(".deck-card")[i];
      if (!reel) return;
      for (var k = 0; k < FRAME_KEYS.length; k++) reel.classList.remove("f-" + FRAME_KEYS[k]);
      reel.classList.remove("f-none");
      if (key && FRAMES[key]) reel.classList.add("f-" + key);
      else reel.classList.add("f-none");
      /* 工坊里正换的那张顺手翻到正面，边挑边看 */
      var inner = reel.querySelector(".uno-card");
      if (inner) inner.classList.remove("flipped");
    }
    function syncSel() {
      var tiles = grid.querySelectorAll(".trace-sw");
      for (var i = 0; i < tiles.length; i++) {
        tiles[i].classList.toggle("on", tiles[i].getAttribute("data-key") === FRAME_OF[cur]);
      }
      var chips = who.querySelectorAll(".trace-chip");
      for (var j = 0; j < chips.length; j++) chips[j].classList.toggle("on", +chips[j].getAttribute("data-i") === cur);
      if (now) now.textContent = "正在换：" + (CARDS[cur] ? CARDS[cur].title : "");
    }
    var curCat = "*";                  // 当前分类：* 表示全部
    /* 分类条：只列纹样库里真实存在的类，顺序按图鉴的分类键 */
    function renderCats() {
      var catsEl = $("traceShopCats");
      if (!catsEl) return;
      var order = Object.keys(CATS), has = {};
      FRAME_KEYS.forEach(function (k) { has[FRAMES[k].cat] = 1; });
      var list = ['<button type="button" class="trace-cat' + (curCat === "*" ? " on" : "") +
                  '" data-cat="*">全部<em>' + FRAME_KEYS.length + '</em></button>'];
      order.forEach(function (c) {
        if (!has[c]) return;
        var n = FRAME_KEYS.filter(function (k) { return FRAMES[k].cat === c; }).length;
        list.push('<button type="button" class="trace-cat' + (curCat === c ? " on" : "") +
                  '" data-cat="' + c + '">' + esc(CATS[c]) + '<em>' + n + '</em></button>');
      });
      catsEl.innerHTML = list.join("");
    }
    function renderGrid() {
      var keys = FRAME_KEYS.filter(function (k) { return curCat === "*" || FRAMES[k].cat === curCat; });
      grid.innerHTML = keys.length ? keys.map(function (k) {
        var f = FRAMES[k];
        return '<button type="button" class="trace-sw" data-key="' + k + '" ' +
               'aria-label="' + esc(f.id + " " + f.label) + '">' +
               '<img src="' + esc(framePath(f) + ".webp") + '" alt="" loading="lazy" draggable="false">' +
               '<span><em>' + esc(f.id) + '</em>' + esc(f.label) + '</span></button>';
      }).join("") : '<p class="trace-shop-empty">这一类还没有素材。</p>';
      grid.scrollTop = 0;
    }
    function buildShop() {
      who.innerHTML = CARDS.map(function (c, i) {
        return '<button type="button" class="trace-chip" data-i="' + i + '">' +
               '<em>' + (i < 9 ? "0" : "") + (i + 1) + '</em>' + esc(c.title) + '</button>';
      }).join("");
      renderCats();
      renderGrid();
    }
    /* 事件只绑一次（面板每次打开只重建 innerHTML，不重复挂监听） */
    who.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".trace-chip") : null;
      if (!b) return;
      cur = +b.getAttribute("data-i") || 0;
      syncSel();
    });
    var catsBox = $("traceShopCats");
    if (catsBox) catsBox.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".trace-cat") : null;
      if (!b) return;
      curCat = b.getAttribute("data-cat") || "*";
      renderCats();
      renderGrid();
    });
    grid.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".trace-sw") : null;
      if (!b) return;
      paintOne(cur, b.getAttribute("data-key"));
      saveFrames();
      syncSel();
    });
    shop.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-shop-close]")) closeShop();
    });
    if (resetBtn) resetBtn.addEventListener("click", function () {
      CARDS.forEach(function (c, i) { paintOne(i, c.frame); });
      saveFrames();
      syncSel();
    });
    function openShop() {
      /* 默认先选「已经抽出来的那盘」，没有就选第 1 盘 */
      cur = 0;
      var open = box.querySelector(".deck-card .uno-card.flipped");
      if (open) cur = +(open.closest(".deck-card").getAttribute("data-i")) || 0;
      buildShop();
      syncSel();
      shop.hidden = false;
      /* 把正在换的那盘抽出来，边挑边看 */
      var r = box.querySelectorAll(".deck-card")[cur];
      if (r) { var inn = r.querySelector(".uno-card"); if (inn) inn.classList.remove("flipped"); }
    }
    function closeShop() {
      shop.hidden = true;
    }
    if (openBtn) openBtn.addEventListener("click", openShop);
    if (!document.__awTraceEsc) {
      document.__awTraceEsc = 1;
      document.addEventListener("keydown", function (e) {
        var s = document.getElementById("traceShop");
        if (e.key === "Escape" && s && !s.hidden) s.hidden = true;
      });
    }

    /* 帧率自检 · 低性能兜底：前 1.2 秒数帧，低于 42fps 说明没走 GPU 合成（软件渲染），
       自动挂 .perf-lite 关掉最贵的持续重绘（CRT 雪花、卡后光晕、大模糊阴影）。
       有硬件加速时不触发，视觉完全不变 */
    (function watchPerf() {
      if (!window.requestAnimationFrame) return;
      var page = box.closest ? box.closest(".trace-page") : null;
      if (!page) return;
      var n = 0, t0 = 0;
      function tick(t) {
        if (!t0) t0 = t;
        n++;
        if (t - t0 < 1200) { window.requestAnimationFrame(tick); return; }
        var fps = Math.round(n / ((t - t0) / 1000));
        page.setAttribute("data-fps", fps);
        if (fps < 42) page.classList.add("perf-lite");
      }
      window.requestAnimationFrame(tick);
    })();
  }

  /* ============================ ④ 路由 #/trace ============================ */
  function isMine() {
    return String(location.hash || "").replace(/^#\/?/, "").split("/")[0] === "trace";
  }
  function mount() {
    var app = $("app");
    if (!app) return;
    injectCSS();
    if (app.querySelector(".trace-page")) return;
    /* 面板要挂到 body 上：.trace-page 身上带着入场动画留下的 identity transform，
       会让内部 position:fixed 相对 .trace-page 定位（实测跑到视口下方），必须脱离它 */
    var stale = document.getElementById("traceShop");
    if (stale && stale.parentNode === document.body) stale.parentNode.removeChild(stale);
    app.innerHTML = pageHTML();
    var sp = app.querySelector("#traceShop");
    if (sp) document.body.appendChild(sp);
    try { document.body.dataset.page = "trace"; } catch (e) {}
    var navs = document.querySelectorAll(".topnav .nav-item");
    for (var i = 0; i < navs.length; i++) {
      navs[i].classList.toggle("active", navs[i].getAttribute("data-nav") === "poster");
    }
    bind();
  }
  function onHash() { if (isMine()) setTimeout(mount, 0); }
  window.addEventListener("hashchange", onHash);
  window.addEventListener("load", function () { if (isMine()) mount(); });
  if (isMine()) setTimeout(mount, 0);

  window.AWTrace = {
    open: function () { location.hash = "#/trace"; },
    cards: CARDS
  };
})();
