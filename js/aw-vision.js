/* ================= 展望 · 文物活进下一个千年（#/vision） =================
   一页"暗厅放映"：3 分钟概念短片《中式美，已抵达》+ 年份对照 + 对回本站能力。
   为什么放在这里是这个逻辑：短片想象的是"文物基因长成未来造物"，
   本站做的是这条链上更近的三段（学纹理 / 学结构 / 学叙事），
   所以页面下半部分是"它想的事，我们已经走到哪一步"，而不是单纯贴片。

   视频两档：720p 15MB（默认，手机）/ 1080p 51MB（桌面或手动切）。
   preload="none"：不进页面不下载，点了才拉流。                        */
(function () {
  "use strict";

  var V720 = "展望/中式美学-720p.mp4";
  var V1080 = "展望/中式美学-1080p.mp4";
  var POSTER = "展望/cover2.jpg";   /* 开场山峦帧：中央干净，播放键不压字 */

  /* 时间轴：片子里被点名的年份 → 它其实在说哪件"真的东西" */
  var YEARS = [
    { y: "2028", tag: "宋瓷", t: "汝窑开片，做成了手机",
      d: "每一部手机的裂纹，都不一样。", real: "汝窑的开片本是烧成时的“缺陷”，宋代把它看成了审美。", hot: true },
    { y: "2036", tag: "山水画", t: "第一座“山水城市”落成",
      d: "楼长成了山，山上挂着楼阁，峰与峰之间架着廊桥。", real: "“可游可居”不是形容词，是山水画给城市定的标准。" },
    { y: "2040", tag: "营造法式", t: "屋顶会呼吸",
      d: "瓦片像鱼鳞一样开合，热了就张开。", real: "鱼鳞瓦、举折、飞檐，古人早就在算遮阳与排水的曲线。" },
    { y: "2044", tag: "悬空寺", t: "悬空寺被“打印”在悬崖上",
      d: "一夜之间，一座寺挂在百米绝壁上。", real: "横梁插入岩体的“半插飞梁”，是一套完整的地形力学解法。" },
    { y: "2049", tag: "琉璃影壁", t: "九龙壁活了",
      d: "城市中轴线上的九龙壁，九条龙一条条游出了墙。", real: "影壁是院落的“屏”，琉璃把等级与工艺烧在了墙上。" },
    { y: "2077", tag: "神话", t: "太平洋海底，一座水晶龙宫",
      d: "珊瑚是柱子，水母是灯。", real: "龙宫是中国人最早写下的“水下建筑方案”，出自想象，不是技术。" },
    { y: "2120", tag: "园林", t: "宇宙最大的园林，是一个星系团",
      d: "假山是星云，池塘是黑洞。", real: "假山、池沼、借景——园林的语法，是把小空间讲成大世界。" }
  ];

  function yearHTML(list) {
    return list.map(function (v) {
      return '<div class="vs-item' + (v.hot ? " hot" : "") + '">' +
        '<div class="vs-yr">' + v.y + "<i>" + v.tag + "</i></div>" +
        "<h4>" + v.t + "</h4>" +
        "<p>" + v.d + ' <b>' + v.real + "</b></p>" +
        "</div>";
    }).join("");
  }

  function viewVision() {
    return '' +
    '<div class="vs-wrap">' +

      /* ---- 1. 暗厅 ---- */
      '<section class="vs-stage">' +
        '<div class="vs-kicker">展望 · OUTLOOK</div>' +
        '<h2 class="vs-title">让文物<em>活进下一个千年</em></h2>' +
        '<p class="vs-lead">一部三分钟的中式未来时间轴：2028 年，汝窑开片做成了手机；' +
          '2044 年，悬空寺被打印在悬崖上；2120 年，一个星系团成了一座园林。<br>' +
          '片子讲的是未来，落点却全是文物。</p>' +
        '<div class="vs-player">' +
          '<div class="vs-frame">' +
            '<video id="vsVideo" preload="none" playsinline webkit-playsinline x5-playsinline ' +
              'controlsList="nodownload" poster="' + POSTER + '"></video>' +
            '<button type="button" class="vs-cover" id="vsCover" aria-label="播放短片">' +
              '<img src="' + POSTER + '" alt="短片封面：2036 年，第一座山水城市落成">' +
              '<span class="vs-play">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>' +
              "</span>" +
              '<span class="vs-cover-t">《中式美学：下一个一百年》· 3 分 06 秒</span>' +
            "</button>" +
          "</div>" +
          '<div class="vs-q">' +
            '<button type="button" data-q="720" id="vsQ720">流畅 720p</button>' +
            '<button type="button" data-q="1080" id="vsQ1080">高清 1080p</button>' +
            '<span class="vs-q-hint">手机默认流畅，投屏用高清</span>' +
          "</div>" +
        "</div>" +
        '<p class="vs-credit"><b>素材说明</b>：短片《中式美学：下一个一百年》为公开传播的概念演绎，<b>非本站制作</b>；' +
          '下方的年份对照、能力映射与功能对照由本站整理，只作理念讨论，不代表短片原作者观点。</p>' +
      "</section>" +

      /* ---- 2. 年份 ---- */
      '<section class="vs-sec">' +
        '<div class="vs-sec-h"><h3>片子里被点名的七个年份</h3><span>SEVEN YEARS</span></div>' +
        '<p class="vs-sec-p">这条时间轴好看的地方在于：它每一个“未来发明”，都能倒推回一件真东西。' +
          '下面每一条，前半句是片子里的想象，后半句是它借的那件文物。</p>' +
        '<div class="vs-line">' + yearHTML(YEARS) + "</div>" +
      "</section>" +

      /* ---- 3. 对回本站 ---- */
      '<section class="vs-sec">' +
        '<div class="vs-sec-h"><h3>它想的三件事，我们已经在做近的那一段</h3><span>WHAT WE DO</span></div>' +
        '<p class="vs-sec-p">从“看懂一件文物”到“用它造出新东西”，中间隔着三件事：' +
          '学它的纹理、学它的结构、学它的叙事。片子把三件事都推到了 2100 年以后，' +
          '本站做的是这条链上第一步可落地的那一段。</p>' +
        '<div class="vs-cards">' +

          '<div class="vs-card">' +
            '<div class="vs-card-no">01 · 学纹理</div>' +
            "<h4>从釉色与纹样，长出新的外形</h4>" +
            '<p class="vs-card-from">对应片中的 <b>2028 汝窑开片</b> 与 <b>2040 呼吸屋顶</b></p>' +
            "<ul>" +
              "<li><em>AI 赋彩</em>：给黑白线稿上色，色板取自真实器物，不是随手调色</li>" +
              "<li><em>文物拟人漫画</em>：把一件器的纹样、性情，长成一个人</li>" +
              "<li><em>AI 打卡海报</em>：同一件文物，每个人拿到的画面都不一样</li>" +
            "</ul>" +
            '<a class="vs-go" href="#/dye">去看赋彩 <i>→</i></a>' +
          "</div>" +

          '<div class="vs-card">' +
            '<div class="vs-card-no">02 · 学结构</div>' +
            "<h4>先让它碎，再让它长回去</h4>" +
            '<p class="vs-card-from">对应片中的 <b>2044 悬空寺打印</b> 与 <b>2036 山水城市</b></p>' +
            "<ul>" +
              "<li><em>文物修复</em>：碎成若干片的器物，按纹样与走向拼回去</li>" +
              "<li><em>向考古 · 我埋下的三千年</em>：先当先民埋一座墓，三千年后再亲手挖开</li>" +
              "<li>一条器物的完整生命：被造、被用、被埋、被挖、被读懂</li>" +
            "</ul>" +
            '<a class="vs-go" href="#/restore">去看修复 <i>→</i></a>' +
          "</div>" +

          '<div class="vs-card">' +
            '<div class="vs-card-no">03 · 学叙事</div>' +
            "<h4>让文物自己开口说话</h4>" +
            '<p class="vs-card-from">对应片中的 <b>2049 九龙壁活了</b> 与 <b>2120 星系园林</b></p>' +
            "<ul>" +
              "<li><em>活态苏醒 · 文物聊天</em>：每句回答都能追到档案字段，不是编的</li>" +
              "<li><em>AI 精灵茶话会</em>：几件文物坐一桌，互相接话</li>" +
              "<li><em>溯源视频讲解</em>：把一件器物的来历讲成一部短纪录片</li>" +
            "</ul>" +
            '<a class="vs-go" href="#/alive">去和文物说话 <i>→</i></a>' +
          "</div>" +

        "</div>" +
      "</section>" +

      /* ---- 4. 三步 ---- */
      '<section class="vs-sec">' +
        '<div class="vs-sec-h"><h3>从今天到 2120，中间只有三步</h3><span>THREE STEPS</span></div>' +
        '<p class="vs-sec-p">别把这部片当预言看。它更像一张技术路线图：' +
          '第一步已经在跑，第二步正在别人的实验室里发生，第三步还没有人做出来。</p>' +
        '<div class="vs-steps">' +
          '<div class="vs-step done">' +
            '<div class="vs-step-t"><s></s>已经做到 · 本站</div>' +
            "<h5>让文物可问、可算</h5>" +
            "<ul><li>74 件文物的结构化档案（年代 / 工艺 / 出土地 / 自述）</li>" +
              "<li>RAG 检索 + 出处标注，答案能追到字段</li>" +
              "<li>多模态识别：拍照 → 候选 → 对齐 → 置信度</li>" +
              "<li>语音合成与逐字同步</li></ul>" +
          "</div>" +
          '<div class="vs-step now">' +
            '<div class="vs-step-t"><s></s>正在发生 · 业界</div>' +
            "<h5>让文物可重建、可生成</h5>" +
            "<ul><li>3D 高斯泼溅与摄影测量：把馆藏搬进浏览器</li>" +
              "<li>生成式材质：从残片推断完整釉面与纹样</li>" +
              "<li>视频模型做动态复原（服饰、仪式、营造过程）</li>" +
              "<li>多模态 Agent 串起“看—问—讲—生成”全流程</li></ul>" +
          "</div>" +
          '<div class="vs-step far">' +
            '<div class="vs-step-t"><s></s>再远一点 · 片子里的</div>' +
            "<h5>让文物可参与造物</h5>" +
            "<ul><li>空间计算展陈：展厅本身变成可计算的场所</li>" +
              "<li>AI 策展：按观众兴趣实时生成动线</li>" +
              "<li>遗址数字孪生与“可推演考古”</li>" +
              "<li>把器物语法直接写成设计约束，用于新造物</li></ul>" +
          "</div>" +
        "</div>" +
      "</section>" +

      /* ---- 5. 收尾 ---- */
      '<div class="vs-end">' +
        "<p>片子里最动人的一句是“造得出古人的想象”。<br>" +
          "而古人的想象力，全在他们留下的东西里——<b>文物不是过去的标本，是未来的材料库</b>。</p>" +
        "<small>本站是参赛原型：74 件文物、12 站打卡、五个 AI 玩法与三个动手栏目，全部可在线体验。</small>" +
      "</div>" +

    "</div>";
  }

  /* ---------- 播放器 ---------- */
  var srcOf = function (q) { return q === "1080" ? V1080 : V720; };

  function paintQ(q) {
    var a = document.getElementById("vsQ720"), b = document.getElementById("vsQ1080");
    if (a) a.classList.toggle("on", q === "720");
    if (b) b.classList.toggle("on", q === "1080");
  }

  /* 切清晰度：记住进度，换源后回原位继续播 */
  window.vsPickQ = function (q) {
    var v = document.getElementById("vsVideo");
    if (!v) return;
    v.dataset.q = q;
    paintQ(q);
    /* 还没开始看：只记档不拉流，等点播放时再按这档加载（免得点一下先下 51MB） */
    if (!v.getAttribute("src")) return;
    var at = v.currentTime || 0, playing = !v.paused && !v.ended;
    v.src = encodeURI(srcOf(q));
    if (at > 0.4) {
      v.addEventListener("loadedmetadata", function once() {
        v.removeEventListener("loadedmetadata", once);
        try { v.currentTime = at; } catch (e) {}
        if (playing) v.play().catch(function () {});
      });
    }
    v.load();
  };

  window.vsPlay = function () {
    var v = document.getElementById("vsVideo"), cov = document.getElementById("vsCover");
    if (!v) return;
    if (!v.getAttribute("src")) v.src = encodeURI(srcOf(v.dataset.q || "720"));
    if (cov) cov.style.display = "none";
    v.setAttribute("controls", "controls");
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  };

  /* 渲染后：定默认清晰度、绑封面与按钮 */
  window.vsInit = function () {
    var v = document.getElementById("vsVideo"), cov = document.getElementById("vsCover");
    if (!v) return;
    /* 桌面给高清，手机给流畅（省流量，也不卡首帧） */
    var q = (window.innerWidth >= 900 && !/Mobi|Android/i.test(navigator.userAgent)) ? "1080" : "720";
    v.dataset.q = q;
    paintQ(q);
    if (cov) {
      cov.addEventListener("click", function (e) { e.preventDefault(); window.vsPlay(); });
    }
    var b1 = document.getElementById("vsQ720"), b2 = document.getElementById("vsQ1080");
    if (b1) b1.addEventListener("click", function () { window.vsPickQ("720"); });
    if (b2) b2.addEventListener("click", function () { window.vsPickQ("1080"); });
    /* 播完把封面还回来，别留一屏黑 */
    v.addEventListener("ended", function () {
      if (cov) cov.style.display = "";
      v.removeAttribute("controls");
    });
  };

  window.viewVision = viewVision;
})();
