/* =========================================================
   文物精灵 · 站内知识检索与事实核验（KB / RAG 底座）

   为什么要有这一层：
     站内已有 104 只精灵、441 条知识问答、707 道题、76 段来历，
     合计约 1100 条结构化知识片段。此前云端 AI 只是在「凭记忆答题」，
     站内知识只被当成展示文案，没有被模型真正用起来。

   本模块做三件事：
     1) 把站内知识切成片段，建 2-gram 倒排索引，用 BM25 做检索
     2) 把检索到的片段拼成「证据块」，注入提示词，让模型照着档案说话
     3) 对模型给出的答案做事实核验：答案里的年代、尺寸、重量等断言
        能不能在这批档案里找到依据；核不上的标出来，不直接采信

   纯前端、无依赖、无网络，构建索引约 20ms（104 只精灵）。
   ========================================================= */
(function () {
  "use strict";

  var K1 = 1.5, B = 0.75;          /* BM25 经验参数 */
  var MIN_SCORE = 0.8;             /* 低于这个分数视为不相关，宁可不给证据 */

  /* 高频虚词：只用于过滤「整条 bigram 都是虚词」的情况，不删单字 */
  var STOP = {};
  ("的 了 是 在 我 你 他 她 它 这 那 有 和 与 就 都 也 很 吗 呢 吧 啊 呀 哦 嗯 " +
   "一个 什么 怎么 为什 么样 可以 能不 不是 我们 你们 他们 他们 这个 那个 " +
   "请问 告诉 一下 一些 这些 那些 还是 但是 因为 所以 如果 然后 现在")
    .split(/\s+/).forEach(function (w) { if (w) STOP[w] = 1; });

  /* 字段权重：问答与来历最像「事实」，台词偏叙事，给低一点 */
  var FIELD_W = { knowledge: 1.0, history: 1.0, alias: 0.9, intro: 0.85, quiz: 0.6, comic: 0.45 };

  var DOCS = [];                   /* {sid,sname,field,text,tf:{term:n},len} */
  var POST = Object.create(null);  /* term -> [docIdx] */
  var DF = Object.create(null);    /* term -> 文档频次 */
  var AVG_LEN = 0;
  var BUILT = false;

  /* ---------------- 文本归一化与分词 ---------------- */
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[\uFF01-\uFF5E]/g, function (c) {        /* 全角转半角 */
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .replace(/\u3000/g, " ")
      .toLowerCase();
  }

  var HAN = /[\u4e00-\u9fa5]/;

  /* 中文按 2-gram 切（不引分词库），英文与数字按整词。
     同时收单字，但只给 0.35 权重：
       · 只靠 bigram 时，「烟」这种单字概念匹配不上「烟道 / 排烟 / 烟尘」；
       · 单字权重高了又会满屏「灯」「器」「铜」，所以压到三分之一。
     返回 [{t:词元, w:权重}]，权重参与 tf 累加与打分。 */
  var SINGLE_W = 0.35;

  function terms(text) {
    var s = norm(text).replace(/[^\u4e00-\u9fa5a-z0-9]+/g, " ");
    var out = [], buf = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (HAN.test(ch)) {
        if (buf && !HAN.test(buf[buf.length - 1])) { pushWord(buf); buf = ""; }
        buf += ch;
      } else if (ch === " ") {
        if (buf) { pushWord(buf); buf = ""; }
      } else {
        if (buf && HAN.test(buf[buf.length - 1])) { pushHan(buf); buf = ""; }
        buf += ch;
      }
    }
    if (buf) pushWord(buf);
    return out;

    function pushWord(w) { HAN.test(w[0]) ? pushHan(w) : (w.length >= 2 && out.push({ t: w, w: 1 })); }
    function pushHan(w) {
      if (w.length === 1) {
        if (!STOP[w]) out.push({ t: w, w: SINGLE_W });
        return;
      }
      for (var k = 0; k < w.length - 1; k++) {
        var g = w.substr(k, 2);
        if (!STOP[g]) out.push({ t: g, w: 1 });
      }
      /* 双字以上的词，补上首尾单字（「袖子」→「袖」「子」），提高召回 */
      for (var j = 0; j < w.length; j++) {
        var c = w[j];
        if (!STOP[c]) out.push({ t: c, w: SINGLE_W });
      }
    }
  }

  /* ---------------- 建索引 ---------------- */
  function addDoc(sid, sname, field, text) {
    text = String(text || "").trim();
    if (!text) return;
    var tf = Object.create(null), ts = terms(text), i, len = 0;
    for (i = 0; i < ts.length; i++) {
      tf[ts[i].t] = (tf[ts[i].t] || 0) + ts[i].w;
      len += ts[i].w;
    }
    if (!len) return;
    var idx = DOCS.length;
    DOCS.push({ sid: sid, sname: sname, field: field, text: text, tf: tf, len: len });
    for (var t in tf) {
      if (!POST[t]) POST[t] = [];
      POST[t].push(idx);
      DF[t] = (DF[t] || 0) + 1;
    }
  }

  function build() {
    if (BUILT) return;
    if (typeof SPIRITS === "undefined" || !SPIRITS) return;
    var total = 0;
    for (var id in SPIRITS) {
      var s = SPIRITS[id];
      if (!s || !s.name) continue;
      addDoc(id, s.name, "intro", s.intro);
      addDoc(id, s.name, "history", s.history);
      /* 别名与年代单独成段：用户常说「汉代的铜钱」「红山那个玉猪」而不叫正名 */
      addDoc(id, s.name, "alias", [s.alias, s.relicName, s.era].filter(Boolean).join(" "));
      (s.knowledge || []).forEach(function (k) {
        /* 问题关键词一起进索引：问「哪年铸的」要能命中「什么时候/年代」那条 */
        var keys = (k.keys || []).join(" ");
        addDoc(id, s.name, "knowledge", (keys ? keys + " " : "") + k.a);
        if (k.a) total++;
      });
      (s.quiz || []).forEach(function (q) {
        addDoc(id, s.name, "quiz", q.q + " " + (q.tip || ""));
      });
      (s.comic || []).forEach(function (c) { addDoc(id, s.name, "comic", c); });
    }
    var sum = 0;
    for (var i = 0; i < DOCS.length; i++) sum += DOCS[i].len;
    AVG_LEN = DOCS.length ? sum / DOCS.length : 1;
    BUILT = true;
    return { docs: DOCS.length, terms: Object.keys(POST).length, avgLen: AVG_LEN };
  }

  function idf(t) {
    var df = DF[t] || 0;
    if (!df) return 0;
    return Math.log(1 + (DOCS.length - df + 0.5) / (df + 0.5));
  }

  /* 档案包(data-deep.js)异步补齐字段后,索引必须重建一次:
     首次 build 时 SPIRITS 只有简介与别名,问答/考点/来历还没到,
     不重建就会检索不到这些段落,回答质量会明显下降。

     重建本身是一次「1400 多段文档一次过」的长任务:手机上是几百毫秒。
     以前它在 data-deep.js 末尾同步跑,正好撞上用户刚开始向下滑 ——
     表现就是「滑两下停一下」。现在只标脏,下一次 search() 自己建;
     另外挑一个真空闲的时间预热一次,滑动中就跳过,交给 search 兜底。 */
  function rebuild() {
    /* 原地清空、不换数组：KB._docs 是对外暴露的同一个引用，
       重建时如果 DOCS = [] 换了新数组，外面拿到的永远是首次构建的那 208 段。
       对照实测页要拿「这件文物自己的档案」当尺子，正好踩到这里。 */
    DOCS.length = 0;
    POST = Object.create(null);
    DF = Object.create(null);
    AVG_LEN = 0;
    BUILT = false;
    try {
      var rib = window.requestIdleCallback;
      if (rib) {
        rib(function () {
          var busy = document.body &&
            document.body.classList.contains("is-scrolling");
          if (busy || BUILT) return;        /* 滑动中不抢主线程，等 search 或下次空闲 */
          try { build(); } catch (e) {}
        }, { timeout: 12000 });
      }
    } catch (e) {}
    return { lazy: true };
  }

  /* ---------------- 检索 ---------------- */
  /* q: 查询串；k: 返回条数；opt.sid: 只看某只精灵（可为空） */
  function search(q, k, opt) {
    build();
    opt = opt || {};
    k = k || 5;
    var ts = terms(q), qt = Object.create(null), i, j;
    for (i = 0; i < ts.length; i++) qt[ts[i].t] = Math.max(qt[ts[i].t] || 0, ts[i].w);  /* 同词取最大权重，避免重复放大 */
    var score = Object.create(null);
    for (var t in qt) {
      var list = POST[t];
      if (!list) continue;
      var w = idf(t) * qt[t];
      for (j = 0; j < list.length; j++) {
        var d = DOCS[list[j]];
        if (opt.sid && d.sid !== opt.sid) continue;
        var f = d.tf[t] || 0;
        var s = w * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / AVG_LEN));
        s *= (FIELD_W[d.field] || 0.5);
        score[list[j]] = (score[list[j]] || 0) + s;
      }
    }
    var min = (opt.min != null) ? opt.min : MIN_SCORE;
    var out = [];
    for (var idx in score) if (score[idx] >= min) out.push(idx);
    out.sort(function (a, b) { return score[b] - score[a]; });
    out = out.slice(0, k);
    return out.map(function (idx) {
      var d = DOCS[idx];
      return { sid: d.sid, sname: d.sname, field: d.field, text: d.text, score: +score[idx].toFixed(2) };
    });
  }

  /* 聚合到精灵一级：同一只精灵的多条片段合并，用于「这句话在说哪件文物」 */
  function searchSpirits(q, k) {
    var hits = search(q, Math.max(12, (k || 3) * 4));
    var by = Object.create(null), order = [];
    hits.forEach(function (h) {
      if (!by[h.sid]) { by[h.sid] = { sid: h.sid, sname: h.sname, score: 0, hits: [] }; order.push(h.sid); }
      by[h.sid].score += h.score;
      by[h.sid].hits.push(h);
    });
    order.sort(function (a, b) { return by[b].score - by[a].score; });
    return order.slice(0, k || 3).map(function (sid) { return by[sid]; });
  }

  /* ---------------- 证据块：拼进提示词 ---------------- */
  /* 站务类问题（玩法、打卡、账号、小答自身）不该被塞进文物档案，
     否则「一共有多少精灵」会检索到「十五连盏铜灯」这种无关片段去误导模型。 */
  var SERVICE_Q = /打卡|签到|精灵|图鉴|玩法|界面|按钮|登录|注册|账号|密码|绑定|下载|安装|设置|怎么用|怎么玩|多少只|多少件|一共有|你是谁|你叫什么|你是什么|介绍.{0,2}你|你能做什么/;
  var MIN_GROUND = 8;              /* 低于这个分，判为「跟站内档案没关系」，宁可不给证据 */

  /* ---------------- 点名实体校验 ----------------
     问句用引号点了一件档案里根本没有的器物时，检索仍会因为「铜鎏金」「熏炉」
     这些词命中「铜鎏金凤凰脊兽」——把别人的资料安到它头上，比不回答更糟。
     所以先看引号里点的是谁：站内查无此物，就当作没证据，让上层老实说「档案里没有」。
     只认带引号的写法（「」『』《》""），普通叙述句不拦，避免误伤「天圆地方」这类常识词。 */
  var QUOTED = /[「『《“"]([^」』》”"]{2,20})[」』》”"]/g;
  function namedSpans(q) {
    var out = [], m, s = String(q || "");
    QUOTED.lastIndex = 0;
    while ((m = QUOTED.exec(s))) out.push(m[1].trim());
    return out.filter(Boolean);
  }
  function hasRelic(name) {
    var n = String(name || "").replace(/\s/g, "");
    if (!n) return false;
    if (typeof SPIRITS === "undefined" || !SPIRITS) return true;   /* 数据还没到，不敢下结论 */
    for (var id in SPIRITS) {
      var s = SPIRITS[id];
      if (!s) continue;
      var pool = [s.name, s.alias, s.relicName].filter(Boolean).join("|").replace(/\s/g, "");
      if (pool.indexOf(n) >= 0) return true;
      var nm = String(s.name || "").replace(/\s/g, "");
      if (nm && n.indexOf(nm) >= 0) return true;    /* 「长信宫灯有多大」：名字被包在整句里 */
    }
    return false;
  }
  /* 返回引号里点名的第一件「档案里没有」的器物；没有就返回空串 */
  function unknownRelic(q) {
    var spans = namedSpans(q);
    for (var i = 0; i < spans.length; i++) if (!hasRelic(spans[i])) return spans[i];
    return "";
  }

  function shouldGround(q) {
    var s = String(q || "");
    if (SERVICE_Q.test(s)) return false;
    if (unknownRelic(s)) return false;
    var r = search(s, 1);
    return r.length > 0 && r[0].score >= MIN_GROUND;
  }

  /* 问句里点了名（「长信宫灯有多大」），就先把名字去掉，
     再只在它的档案里查一遍。
     不这么做的话，凡是正文里重复了名字的片段都会排前面，
     真正写了尺寸的那条反而被挤下去——问「多大」却查到「为什么叫」。 */
  function evidence(q, opt) {
    opt = opt || {};
    if (!opt.force && !shouldGround(q)) return { text: "", hits: [] };
    var k = opt.k || 4;
    var hits = search(q, k, opt);
    if (!opt.sid) {
      var top = searchSpirits(q, 1)[0];
      if (top) {
        var bare = String(q);
        [top.sname].concat(coreName(top.sname) ? [coreName(top.sname)] : []).forEach(function (nm) {
          if (nm && nm.length >= 3) bare = bare.split(nm).join(" ");
        });
        if (bare.replace(/\s+/g, "") !== String(q).replace(/\s+/g, "")) {
          var inner = search(bare, k, { sid: top.sid });
          var seen = {}, out = [];
          inner.concat(hits).forEach(function (h) {
            var key = h.sid + "|" + h.field + "|" + h.text.slice(0, 24);
            if (seen[key]) return;
            seen[key] = 1; out.push(h);
          });
          hits = out.slice(0, Math.max(k, inner.length + 2));
        }
      }
    }
    if (!hits.length) return { text: "", hits: [] };
    var lines = hits.map(function (h, i) {
      return "[" + (i + 1) + "] " + h.sname + " · " + label(h.field) + "：" + trim(h.text, 180);
    });
    /* 问的是工艺（「错金是什么」「唐三彩怎么烧的」）时，档案里往往只有一句带过，
       把工艺词典里的词条补进去——它是站内另一份结构化知识，比让模型自由发挥可靠。 */
    var crafts = craftEvidence(q);
    if (crafts.text) lines.push(crafts.text);
    return { text: lines.join("\n"), hits: hits };
  }

  /* ---------------- 工艺词典与误认辨析（来自内容包） ---------------- */
  /* 内容包挂在 window 上；沙箱里 window 不是全局对象，所以两种都认 */
  function CP() {
    if (typeof CONTENT !== "undefined" && CONTENT) return CONTENT;
    if (typeof window !== "undefined" && window && window.CONTENT) return window.CONTENT;
    return null;
  }
  function craftList() {
    var c = CP();
    return (c && c.craft) ? c.craft : [];
  }

  /* 命中哪几条工艺词条，返回可直接塞进提示词的一行行 */
  function craftEvidence(q) {
    var list = craftList(), cp = CP();
    if (!list.length || !cp || typeof cp.pickCraft !== "function") return { text: "", hits: [] };
    var hit = cp.pickCraft(q).slice(0, 2);
    if (!hit.length) return { text: "", hits: [] };
    var lines = hit.map(function (c, i) {
      return "[工" + (i + 1) + "] 工艺·" + c.n + (c.aka ? "（" + c.aka + "）" : "") + "：" +
        c.how + "。代表作：" + c.rep + "。辨析：" + c.vs;
    });
    return { text: lines.join("\n"), hits: hit };
  }

  /* 识别把器物认成另一类时，给一句「你可能认成了 X，区别在 Y」 */
  function confuseHint(name) {
    var cp = CP();
    if (!cp || !cp.pickConfuse) return null;
    var c = cp.pickConfuse(name);
    if (!c) return null;
    return {
      wrong: c.a, right: c.b,
      text: "「" + c.a + "」与「" + c.b + "」最容易混：" + c.tip + "（记一条：" + c.key + "）",
      key: c.key, tip: c.tip
    };
  }

  /* ---------------- 跨文物对比 ---------------- */
  /* 判两件事：① 这句话是不是在要比对；② 要比的是哪两件。
     只认「点到两件以上」的问法，避免把普通提问误判成对比。 */
  function compare(q) {
    var cp = CP();
    if (!cp || !cp.pickCmp) return null;
    var rec = cp.pickCmp(q);
    if (!rec) return null;
    var sides = rec.items.map(function (it) {
      var s = (typeof SPIRITS !== "undefined" && SPIRITS[it.sid]) ? SPIRITS[it.sid] : null;
      return {
        sid: it.sid, name: it.name, era: it.era, craft: it.craft, edge: it.edge,
        /* 站内确有档案时，顺手把它自己的尺寸/年代片段带出来，供渲染对比表 */
        brief: s ? trim([s.era, s.intro].filter(Boolean).join(" · "), 120) : ""
      };
    });
    return { id: rec.id, title: rec.title, axis: rec.axis, sides: sides, diff: rec.diff, verdict: rec.verdict };
  }

  /* 对比的证据块：两边各取一段原文，再补上三句结论，交给模型照着说 */
  function compareEvidence(q) {
    var rec = compare(q);
    if (!rec) return { text: "", rec: null };
    var lines = [];
    rec.sides.forEach(function (s, i) {
      var ev = evidence(s.name, { force: true, sid: s.sid, k: 3 });
      var body = ev.hits.length
        ? ev.hits.map(function (h) { return trim(h.text, 120); }).join("；")
        : s.brief;
      lines.push("[" + (i + 1) + "] " + s.name + "（" + s.era + "）：" + body);
    });
    lines.push("〔对比结论〕" + rec.diff.join(" "));
    lines.push("〔一句话〕" + rec.verdict);
    return { text: lines.join("\n"), rec: rec };
  }

  function label(f) {
    return { intro: "简介", history: "来历", knowledge: "问答", quiz: "考点", comic: "自述" }[f] || f;
  }

  function trim(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; }

  /* ---------------- 事实核验 ---------------- */
  /* 从答案里抽出「可核对的断言」，逐条回到证据里找依据。
     只做保守判断：找不到就标「存疑」，绝不代替人去判定真伪。 */
  var NUM_UNIT = /(\d+(?:\.\d+)?)\s*(克|千克|公斤|吨|米|厘米|毫米|度|年|岁|件|座|层|万元|元)/g;
  var ERA = /(公元前\s*\d{1,4}\s*年?|公元\s*\d{1,4}\s*年?|(?:夏|商|西周|东周|春秋|战国|秦|西汉|东汉|汉|三国|西晋|东晋|晋|南北朝|北魏|隋|唐|五代|北宋|南宋|宋|辽|金|元|明|清)(?:代|朝)?)/g;

  function check(answer, hits) {
    answer = String(answer || "");
    hits = hits || [];
    /* 档案原文里「48 厘米」是带空格的，答案里通常写成「48厘米」，
       所以比对前把空白全部去掉，否则真数据会被当成编造。 */
    var pool = hits.map(function (h) { return norm(h.text); }).join("\n").replace(/\s+/g, "");
    var claims = [], seen = {};

    function add(t, kind) { if (!seen[t]) { seen[t] = 1; claims.push({ t: t, kind: kind }); } }
    var m;
    NUM_UNIT.lastIndex = 0;
    while ((m = NUM_UNIT.exec(answer))) add(m[1] + m[2], "数值");
    ERA.lastIndex = 0;
    while ((m = ERA.exec(answer))) add(m[1].replace(/\s+/g, ""), "年代");

    var ok = [], bad = [];
    claims.forEach(function (c) {
      var key = norm(c.t).replace(/\s+/g, "");
      /* 数值核验放宽：允许「3.3 克」在档案里写成「3.3克」「3.3 克」 */
      if (pool.indexOf(key) >= 0) { ok.push(c); return; }
      if (c.kind === "年代") {
        var bare = key.replace(/代|朝|年/g, "");
        if (bare && pool.indexOf(bare) >= 0) { ok.push(c); return; }
      }
      bad.push(c);
    });

    return {
      claims: claims.length,
      supported: ok,
      unsupported: bad,
      ratio: claims.length ? +(ok.length / claims.length).toFixed(2) : 1
    };
  }

  /* 一句话说明：给界面用，不吓人 */
  function describeCheck(r) {
    if (!r || !r.claims) return "本段无可核对的硬数据";
    if (!r.unsupported.length) return r.claims + " 处数据均可在档案中找到依据";
    return "可核 " + r.supported.length + "/" + r.claims + " 处，" +
           r.unsupported.map(function (c) { return c.t; }).slice(0, 3).join("、") + " 待核";
  }

  /* ---------------- 自测：内置评测集 ---------------- */
  /* 每条 = { q: 问句, want: 期望命中的精灵 id }，检查 top3 内是否命中 */
  var TEST_SET = [
    { q: "五铢钱是什么时候开始铸的", want: "wuzhuqian" },
    { q: "青花瓷的蓝色是怎么来的", want: "qinghuaci" },
    { q: "玉猪龙出土于哪里", want: "yuzhulong" },
    { q: "长信宫灯为什么能防烟", want: "changxin" },
    { q: "金缕玉衣是用什么连起来的", want: "jinyuyi" },
    { q: "博山炉上面为什么有山", want: "boshanlu" },
    { q: "四神纹铜壶上的四神是哪四个", want: "cuojinhu" },
    { q: "兵马俑为什么每个都不一样", want: "bingmayong" },
    { q: "四羊方尊的羊头有什么讲究", want: "siyangfangzun" },
    { q: "后母戊鼎有多重", want: "houmuwuding" },
    { q: "击鼓说唱俑为什么在笑", want: "shuochangyong" },
    { q: "三彩骆驼载乐俑上有几个乐手", want: "sancailuotuo" },
    { q: "东汉百花灯有多少个灯盘", want: "baohuadeng" },
    { q: "长乐未央瓦当是什么意思", want: "wadang" },
    { q: "妇好鸮尊是什么鸟", want: "fuxiaozun" },
    { q: "晋侯鸟尊的鸟是什么鸟", want: "jinhouniaozun" },
    { q: "倒流壶为什么倒着也能出水", want: "daoliuhu" },
    { q: "偏将军印章是谁的", want: "pianjiangjunyin" },
    { q: "太和十一年佛造像是什么年代的", want: "taihezaoxiang" },
    { q: "宗喀巴像属于哪个教派", want: "zongkaba" }
  ];

  /* 第二组：难例 —— 不出现文物正名，只描述特征，考语义检索是否真的能用 */
  var TEST_HARD = [
    { q: "哪个灯能把烟吸进袖子里", want: "changxin" },
    { q: "用金线把玉片连起来的葬服", want: "jinyuyi" },
    { q: "倒着放也能倒出水的壶", want: "daoliuhu" },
    { q: "商代最重的青铜大方鼎", want: "houmuwuding" },
    { q: "红山文化的玉猪", want: "yuzhulong" },
    { q: "东汉彩绘的陶制百花灯", want: "baohuadeng" },
    { q: "瓦当上写着长乐未央", want: "wadang" },
    { q: "妇好墓出土的鸮形尊", want: "fuxiaozun" },
    { q: "西周晋国的鸟形青铜尊", want: "jinhouniaozun" },
    { q: "独孤信的多面印章", want: "duoguxinyin" }
  ];

  function runSet(set) {
    var hit1 = 0, hit3 = 0, miss = [], near = [];
    set.forEach(function (c) {
      var r = searchSpirits(c.q, 3);
      var ids = r.map(function (x) { return x.sid; });
      if (ids[0] === c.want) hit1++;
      else if (ids.indexOf(c.want) >= 0) near.push({ q: c.q, want: c.want, rank: ids.indexOf(c.want) + 1 });
      if (ids.indexOf(c.want) >= 0) hit3++;
      else miss.push({ q: c.q, want: c.want, got: ids });
    });
    return {
      total: set.length, top1: hit1, top3: hit3,
      top1Rate: +(hit1 / set.length).toFixed(3),
      top3Rate: +(hit3 / set.length).toFixed(3),
      miss: miss, near: near
    };
  }

  function selfTest() {
    build();
    var easy = runSet(TEST_SET), hard = runSet(TEST_HARD);
    return { easy: easy, hard: hard, total: easy.total + hard.total,
             top1: easy.top1 + hard.top1, top3: easy.top3 + hard.top3,
             top1Rate: +((easy.top1 + hard.top1) / (easy.total + hard.total)).toFixed(3),
             top3Rate: +((easy.top3 + hard.top3) / (easy.total + hard.total)).toFixed(3),
             miss: easy.miss.concat(hard.miss) };
  }

  /* =========================================================
     历史常识层
     ---------------------------------------------------------
     只有「这件文物自己的档案」还不够：AI 出的题如果永远围着
     同一段简介打转，玩家做的还是同一道题。可文物题真正有意思的
     一半在时代里——西汉为什么流行鎏金、商代为什么酒器多、
     唐三彩的「三彩」到底指什么。

     这一层把「朝代/工艺常识」做成可检索、可核对的短句，
     既塞进提示词让模型照着写，也用来校验模型写的答案。
     全部是教科书级通识，不含争议性表述。
     ========================================================= */
  var HIST = [
    { d: "新石器时代", k: ["新石器", "红山", "仰韶", "龙山", "良渚", "马家窑", "彩陶", "黑陶"], f: [
      "新石器时代以磨制石器、制作陶器和农业定居为标志",
      "红山文化分布在辽河流域，以玉猪龙、C形玉龙等玉器著称",
      "仰韶文化以彩陶闻名，龙山文化以黑陶蛋壳陶著称",
      "良渚文化出土大量玉琮、玉璧，是早期礼制的代表"
    ] },
    { d: "夏", k: ["夏", "二里头"], f: [
      "二里头文化被多数学者视为夏文化，发现了宫殿基址与青铜铸造作坊",
      "夏代已经出现青铜礼器，二里头出土有绿松石龙形器",
      "夏代以农业为主，出现了早期国家形态"
    ] },
    { d: "商", k: ["商", "商周", "殷", "妇好"], f: [
      "商代青铜器铸造达到高峰，主要用陶范范铸法成型",
      "甲骨文是商代刻在龟甲兽骨上的占卜文字，是目前所见最早的成熟汉字",
      "商代礼器以酒器为多，常见爵、斝、觚、尊",
      "妇好墓是殷墟中未被盗掘的商王室墓葬，出土青铜器数量惊人"
    ] },
    { d: "西周", k: ["西周", "商周"], f: [
      "西周推行分封制与宗法制，礼器使用有严格的列鼎制度",
      "西周青铜器长篇铭文最多，毛公鼎铭文近五百字",
      "何尊铭文中的「宅兹中国」是「中国」一词最早的实物记录"
    ] },
    { d: "春秋战国", k: ["春秋", "战国", "东周", "曾侯乙", "中山"], f: [
      "春秋战国时期铁器与牛耕推广，社会生产力大幅提高",
      "青铜器装饰转向错金银、嵌红铜、镶嵌绿松石等工艺",
      "失蜡法在春秋战国用于铸造复杂青铜器，曾侯乙尊盘是代表",
      "战国时期百家争鸣，思想文化空前活跃"
    ] },
    { d: "秦", k: ["秦"], f: [
      "秦统一文字为小篆，统一度量衡与车轨，推行郡县制",
      "秦始皇陵兵马俑以陶塑写实著称，每件面容都不相同",
      "秦代青铜器趋于实用，装饰相对简化"
    ] },
    { d: "西汉", k: ["西汉", "汉", "汉代", "汉武帝", "满城"], f: [
      "汉武帝派张骞通西域，开通了丝绸之路",
      "西汉盛行鎏金、错金银青铜工艺，满城汉墓出土器物为代表",
      "五铢钱自汉武帝元狩五年即公元前118年开始铸造，沿用七百余年",
      "西汉诸侯王葬服使用金缕玉衣，以金丝编缀玉片"
    ] },
    { d: "东汉", k: ["东汉", "汉代"], f: [
      "东汉蔡伦改进造纸术，纸张逐渐取代简牍",
      "东汉青瓷烧造技术成熟，是中国瓷器发展的重要阶段",
      "东汉画像石与陶俑发达，击鼓说唱俑是汉代俳优艺术的代表",
      "佛教在东汉时期传入中国"
    ] },
    { d: "三国", k: ["三国", "曹魏"], f: [
      "三国时期北方由曹魏推行屯田，恢复农业生产",
      "三国时期瓷器继续发展，南方青瓷工艺进步明显"
    ] },
    { d: "西晋", k: ["西晋", "晋"], f: [
      "西晋短暂统一全国，门阀士族势力强盛",
      "西晋青瓷常见谷仓罐、鸡首壶等器形"
    ] },
    { d: "南北朝", k: ["南北朝", "北魏", "北齐", "东晋"], f: [
      "南北朝时期佛教盛行，开凿了云冈、龙门等大型石窟",
      "北魏孝文帝改革推行汉化，促进了民族融合",
      "南北朝青瓷以莲花尊一类器形为代表"
    ] },
    { d: "隋", k: ["隋"], f: [
      "隋代开凿大运河，贯通南北漕运",
      "隋代创立科举制，以考试选拔官员",
      "隋代白瓷开始成熟，形成青瓷白瓷并行的格局"
    ] },
    { d: "唐", k: ["唐", "何家村"], f: [
      "唐三彩是低温铅釉陶器，以黄、绿、白等釉色交融著称",
      "唐代金银器工艺发达，何家村窖藏出土大量金银器",
      "唐代陶瓷形成南青北白的格局，越窑青瓷与邢窑白瓷并称",
      "唐代长安是当时世界上规模最大的都城之一"
    ] },
    { d: "五代", k: ["五代", "后周", "耀州窑"], f: [
      "五代时期北方耀州窑以青瓷刻花工艺见长",
      "五代十国政权更迭频繁，地方窑口各自发展"
    ] },
    { d: "北宋", k: ["北宋", "宋"], f: [
      "宋代五大名窑为汝、官、哥、钧、定",
      "北宋毕昇发明活字印刷术，指南针用于航海",
      "宋代瓷器官窑端庄、民窑活泼，定窑以白瓷印花著称"
    ] },
    { d: "南宋", k: ["南宋"], f: [
      "南宋龙泉窑青瓷以粉青、梅子青釉色著称",
      "南宋海上丝绸之路繁荣，瓷器是主要外销商品"
    ] },
    { d: "辽", k: ["辽", "契丹"], f: [
      "辽代由契丹族建立，礼俗兼有游猎与汉地特征",
      "辽代陶瓷常见鸡冠壶、皮囊壶等便于骑行的器形"
    ] },
    { d: "金", k: ["金", "女真"], f: [
      "金代由女真族建立，与南宋长期并立",
      "金代钧窑、磁州窑延续烧造，釉色与装饰更趋自由"
    ] },
    { d: "元", k: ["元", "大德"], f: [
      "元代青花瓷在景德镇成熟，使用进口钴料苏麻离青",
      "元代戏曲兴盛，元曲与杂剧成为一代文学代表",
      "元代疆域辽阔，中外交流频繁"
    ] },
    { d: "明", k: ["明", "洪武", "永乐"], f: [
      "明代青花成为主流，成化斗彩以釉下青花配釉上彩著称",
      "明代洪武年间设官窑，永乐宣德时期青花与铜红釉成就突出",
      "明代郑和七下西洋，最远到达非洲东海岸"
    ] },
    { d: "清", k: ["清", "乾隆", "康熙", "雍正"], f: [
      "清代康雍乾三朝瓷器工艺达到高峰，粉彩与珐琅彩盛行",
      "清代宫廷文房用具讲究材质与工艺，笔筒、镇纸多有精品",
      "清代实行闭关政策，只留广州一口通商"
    ] }
  ];

  /* 年代串 → 命中哪些朝代条目。
     两个坑：
       1)「公元前2世纪」里的「元」会误命中元朝 —— 先把公元前的纪年剥掉；
       2)「南宋」里的「宋」会误命中北宋 —— 只认命中最长的那个朝代名，
          「南宋」命中的是「南宋」而不是「宋」。
     「汉代」这类统称，西汉、东汉两条都登记了「汉代」，因此会一起命中。 */
  function histEntries(era) {
    var e = norm(era || "")
      .replace(/公元前\s*\d+\s*世纪/g, "")
      .replace(/公元前\s*\d+\s*年/g, "")
      .replace(/\s+/g, "");
    if (!e) return [];
    var best = 0, hits = [];
    HIST.forEach(function (h) {
      var ln = 0;
      for (var i = 0; i < h.k.length; i++) {
        var k = norm(h.k[i]);
        if (k && e.indexOf(k) >= 0 && k.length > ln) ln = k.length;
      }
      if (!ln) return;
      if (ln > best) { best = ln; hits = [h]; }
      else if (ln === best) hits.push(h);
    });
    return hits;
  }

  function histFacts(era) {
    var out = [];
    histEntries(era).forEach(function (h) {
      out.push("〔" + h.d + "〕");
      h.f.forEach(function (x) { out.push(x); });
    });
    return out;
  }

  function histText(era) { return histFacts(era).join("。"); }

  /* 同朝代的其他精灵档案：补上「这个时代还发生过什么」的实物证据。
     只用于给「时代题」找依据，不参与干扰项判定（否则太容易误杀）。 */
  function sibText(era, selfId) {
    var ents = histEntries(era);
    if (!ents.length || typeof SPIRITS === "undefined" || !SPIRITS) return "";
    var names = ents.map(function (h) { return h.d; });
    var e = norm(era || "");
    var out = [];
    for (var id in SPIRITS) {
      if (id === selfId) continue;
      var s = SPIRITS[id];
      if (!s || !s.era) continue;
      var se = norm(s.era);
      var same = false;
      for (var i = 0; i < names.length; i++) {
        if (se.indexOf(norm(names[i])) >= 0) { same = true; break; }
      }
      if (same) { out.push(s.name + "：" + (s.intro || "")); if (out.length >= 6) break; }
    }
    return out.join(" ");
  }

  function eraName(era) {
    return histEntries(era).map(function (h) { return h.d; }).join(" / ");
  }

  /* 档案里的正式名常带朝代、材质和书名号（「商代「后母戊」青铜鼎」），
     玩家和模型却只会说「后母戊鼎」。这里剥出核心名再比一次。 */
  var NAME_HEAD = /^(新石器时代|新石器|夏代|商代|商周|西周|东周|春秋|战国|秦代|秦|西汉|东汉|汉代|汉|三国|西晋|东晋|晋|南北朝|北魏|北齐|隋代|隋|唐代|唐|五代|北宋|南宋|宋代|宋|辽代|辽|金代|金|元代|元|明代|明|清代|清)[·\s]*/;
  function coreName(name) {
    var s = String(name || "").replace(/[「」《》〈〉【】]/g, "");
    s = s.replace(NAME_HEAD, "");
    /* 材质/工艺词出现在哪儿都去掉：「商代「后母戊」青铜鼎」→「后母戊鼎」 */
    s = s.replace(/(青铜|鎏金|错金|错银|彩绘|白釉|青釉|绿釉|红釉|铜|铁|陶|瓷|玉)/g, "");
    return s.replace(/\s+/g, "");
  }

  /* 题干是不是真在问「这一件」：
     要么点名（正名 / 别名 / 另一称法），要么整句与它的档案高度重合。
     这一条是防「模型写着写着跑去考别的文物」的硬闸。 */
  function subjectOk(stem, s) {
    var n = norm(stem).replace(/\s+/g, "");
    var names = [s.name, s.alias, s.relicName].filter(Boolean);
    for (var i = 0; i < names.length; i++) {
      var nm = norm(names[i]).replace(/\s+/g, "");
      if (!nm) continue;
      if (n.indexOf(nm) >= 0) return true;
      if (nm.length >= 6 && n.indexOf(nm.slice(0, 5)) >= 0) return true;  /* 「长信宫灯」写成「长信宫」也算 */
    }
    var core = norm(coreName(s.name)).replace(/\s+/g, "");
    if (core.length >= 3 && n.indexOf(core) >= 0) return true;
    /* 没点名，但题干明显在描述它（与档案的 2-gram 重合度过半） */
    return gramRatio(archText(s), stem) >= 0.5;
  }

  /* ---------------- 校验一道「AI 现场出的题」 ---------------- */
  /* 大模型出题有三个常见的坑：选项重复、答案在档案里找不到依据、
     干扰项恰好也出现在档案里（于是有两个都对）。三条都拦掉再放行。

     v2 起分两类题：
       self    —— 文物本体题，依据只能来自这只精灵的档案
       history —— 时代常识题，依据来自朝代/工艺常识 + 同朝代实物档案
     题干必须点到这一件（或整句高度贴合档案），否则判为「跑题」。 */
  function gramRatio(pool, text) {
    var ts = terms(text).filter(function (x) { return x.w === 1 && x.t.length === 2; });
    if (!ts.length) return 0;
    var seen = {}, hit = 0, tot = 0;
    ts.forEach(function (x) {
      if (seen[x.t]) return;
      seen[x.t] = 1; tot++;
      if (pool.indexOf(x.t) >= 0) hit++;
    });
    return tot ? hit / tot : 0;
  }

  function archText(s) {
    if (!s) return "";
    return [s.name, s.alias, s.era, s.intro, s.history]
      .concat((s.knowledge || []).map(function (k) { return k.a; }))
      .filter(Boolean).join(" ");
  }

  function verifyQuestion(q, s) {
    if (!q || !s) return { ok: false, why: "题目或精灵缺参数" };
    q = { q: q.q, options: q.options || [], answer: q.answer, tip: q.tip, kind: q.kind };
    var stem = String(q.q || "").trim();
    if (!Array.isArray(q.options) || q.options.length !== 4) return { ok: false, why: "选项不是四个" };
    var opts = q.options.map(function (x) { return String(x == null ? "" : x).trim(); });
    if (opts.some(function (x) { return !x || x.length > 30; })) return { ok: false, why: "选项为空或过长" };
    var uniq = {}; opts.forEach(function (x) { uniq[x] = 1; });
    if (Object.keys(uniq).length !== 4) return { ok: false, why: "选项有重复" };
    if (stem.length < 8 || stem.length > 90) return { ok: false, why: "题干长度不合适" };
    var a = Number(q.answer);
    if (!(a >= 0 && a <= 3) || a % 1 !== 0) return { ok: false, why: "答案下标不合法" };

    /* ① 必须问的是这一件，不能写着写着跑去考别的文物 */
    if (!subjectOk(stem, s)) return { ok: false, why: "题干没有落到这只文物身上" };

    var arch = archText(s);
    var hist = histText(s.era);
    var sib = sibText(s.era, s.id);
    var poolHist = hist + " " + sib;

    /* ② 正确选项要有出处：先查本体档案，再查时代常识 */
    var rSelf = gramRatio(arch, opts[a]);
    var rHist = poolHist.trim() ? gramRatio(poolHist, opts[a]) : 0;
    var kind = rSelf >= 0.5 ? "self" : (rHist >= 0.5 ? "history" : "");
    if (!kind) {
      return { ok: false, why: "正确选项在档案与时代常识里都找不到依据(" + rSelf.toFixed(2) + "/" + rHist.toFixed(2) + ")" };
    }
    if (q.kind === "self" && kind === "self" && rSelf < 0.5) return { ok: false, why: "自称本体题却无档案依据" };

    /* ③ 干扰项不能也说得通：整段出现在依据里，或与依据的重合度接近正确答案 */
    var base = kind === "self" ? arch : poolHist;
    for (var i = 0; i < 4; i++) {
      if (i === a) continue;
      if (opts[i].length >= 3 && arch.indexOf(opts[i]) >= 0) {
        return { ok: false, why: "干扰项同样出现在档案里，答案有歧义" };
      }
      var ri = gramRatio(base, opts[i]);
      if (ri >= 0.5 && ri >= (kind === "self" ? rSelf : rHist) - 0.1) {
        return { ok: false, why: "干扰项「" + trim(opts[i], 12) + "」与依据也吻合，答案有歧义" };
      }
    }
    return { ok: true, kind: kind, ratio: +(kind === "self" ? rSelf : rHist).toFixed(2) };
  }

  /* ---------------- 开放题：出题 + 判卷 ---------------- */
  /* 开放题不设选项，玩家用自己的话回答。判卷分两步：
       1) 本地按档案要点算覆盖率（确定性、离线可跑）
       2) 云端 AI 按要点打分（联网时）
     两者偏差过大时以档案为锚往下压，防止模型「嘴甜给满分」。 */

  /* 从这只精灵的档案里挑出与题干最相关的几条，作为「要点」。
     先把题干里的文物名去掉——否则「长信宫灯」四个字会把每条要点都拉成
     一样高的相关度，问「多大」也会挑到「为什么叫长信宫灯」。 */
  function openPoints(s, question) {
    var items = (s.knowledge || []).map(function (k) {
      return { q: (k.keys || []).join(" "), a: k.a };
    }).filter(function (x) { return x.a; });
    if (!items.length) return [{ a: s.intro || "", q: "", w: 0 }];

    var q = String(question || "");
    [s.name, s.alias, s.relicName].filter(Boolean).forEach(function (n) {
      q = q.split(n).join(" ");
    });
    q = q.replace(/长信宫|马王堆|满城汉墓/g, " ");
    if (norm(q).replace(/[^a-z0-9\u4e00-\u9fa5]/g, "").length < 2) q = String(question || "");

    var scored = items.map(function (x, i) {
      var r = Math.max(
        gramRatio(x.q, q) * 1.1,          /* 题干的话，落在了这条要点的关键词上 */
        gramRatio(q, x.q) * 0.9,          /* 这条要点的关键词，出现在了题干里 */
        gramRatio(x.a, q)                 /* 题干的话直接出现在答案正文里 */
      );
      return { a: x.a, q: x.q, w: r, i: i };
    });
    scored.sort(function (x, y) { return (y.w - x.w) || (x.i - y.i); });
    var best = scored[0].w;
    if (!best) return [scored[0]];
    var keep = scored.filter(function (x) { return x.w >= Math.max(0.34, best * 0.7); });
    return keep.slice(0, 2);
  }

  /* 一条要点的「关键词」：取 2-gram，按 idf 加权。
     不用「最后 / 通过 / 进入」这类满篇都是的词，否则答一句话也能蹭到高分；
     真正该被答出来的是「右臂」「体腔」「鎏金」这种只在少数片段里出现的词。 */
  function pointKeys(text, exclude) {
    var ts = terms(text).filter(function (x) { return x.w === 1 && x.t.length === 2; });
    var seen = {}, out = [];
    ts.forEach(function (x) {
      if (seen[x.t]) return;
      if (exclude && exclude[x.t]) return;
      var df = DF[x.t] || 0;
      if (!df || df > 60) return;                 /* 太常见的词不算要点 */
      seen[x.t] = 1;
      out.push({ t: x.t, w: +idf(x.t).toFixed(3) });
    });
    out.sort(function (a, b) { return b.w - a.w; });
    return out.slice(0, 14);
  }

  function gradeOpen(question, answer, s, refA) {
    answer = String(answer || "").trim();
    if (!answer) return { score: 0, points: [], ref: "", why: "还没作答" };
    /* 有出处句就用出处句（AI 出题时会附带「这题考的是哪句原文」），
       没有才回头按题干相关度挑。出处句由校验层确认过确实在档案里。 */
    var pts = refA ? [{ a: refA, q: "", w: 1 }] : openPoints(s, question);
    var wide = false;
    /* 挑不出像样的要点时，退成「宽口径」：只要答的是这只文物档案里说过的，就算数，
       并明确标出来，避免悄悄放宽了标准还说是精确判分。 */
    if (!refA && (!pts.length || !pts[0].w || pts[0].w < 0.25)) {
      pts = [{ a: (s.knowledge || []).map(function (k) { return k.a; }).join("；") || s.intro || "", q: "", w: 1 }];
      wide = true;
    }
    var ansTs = terms(answer).filter(function (x) { return x.w === 1 && x.t.length === 2; });

    /* 判分方向：看「这句话有多少能被档案接住」，而不是「档案有多少被说到」。
       反过来算的话，答案越短越占便宜，一句「烟从袖子里走」也能蹭到分。 */
    var detail = pts.map(function (p) {
      var pool = norm(p.a + " " + (s.era || "") + " " + (s.alias || "") + " " + (s.name || ""))
        .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "");
      var seen = {}, hit = [], miss = [], tot = 0;
      ansTs.forEach(function (x) {
        if (seen[x.t]) return;
        seen[x.t] = 1; tot++;
        if (pool.indexOf(x.t) >= 0) hit.push(x.t); else miss.push(x.t);
      });
      var cover = tot ? hit.length / tot : 0;
      return {
        a: p.a, hit: hit, miss: miss,
        cover: +cover.toFixed(2)
      };
    });
    var wsum = 0, csum = 0;
    pts.forEach(function (p, i) { var w = p.w || 0.5; wsum += w; csum += w * detail[i].cover; });
    /* 覆盖率直接转百分制：60 分上下＝说到了主要意思，85 分以上＝几乎贴着档案讲 */
    var score = Math.round(100 * (wsum ? csum / wsum : 0));
    if (ansTs.length < 3) score = Math.min(score, 30);        /* 一两个字不给分 */
    return {
      score: Math.max(0, Math.min(100, score)),
      points: detail,
      ref: pts.map(function (p) { return p.a; }).join("；"),
      wide: wide,
      why: ""
    };
  }

  /* 离线兜底用的开放题：从档案的问答里取一条，改写成「用自己的话说说」。
     优先挑带疑问词的 key（为什么 / 怎么 / 多大 / 谁），否则说成「…的 X 是怎么回事」。
     返回 ref（这题考的那句原文），判卷时直接拿它当依据。 */
  /* 开放题的问法按「这条档案在讲什么」套模板。
     直接把关键词拼成问句会出「青花瓷什么叫？」这种半截话，
     所以宁可固定几种读得通的说法。 */
  var OPEN_TPL = [
    { k: ["多大", "多高", "多重", "尺寸", "重量", "多长"], q: "有多大、多重？" },
    { k: ["材质", "材料", "什么做", "工艺", "鎏金", "釉", "胎"], q: "是用什么材料、什么工艺做的？" },
    { k: ["出土", "发现", "挖掘", "考古", "来历", "墓"], q: "是怎么被发现的？" },
    { k: ["名字", "为什么叫", "铭文", "得名"], q: "的名字是怎么来的？" },
    { k: ["怎么用", "用法", "功能", "灯盘", "调", "装", "盛"], q: "当年是怎么用的？" },
    { k: ["为什么", "设计", "环保", "巧妙", "特点"], q: "最巧妙的地方在哪里？" }
  ];

  function openQuestion(s) {
    var ks = (s.knowledge || []).filter(function (k) { return k.a && k.keys && k.keys.length; });
    if (!ks.length) return null;
    var cand = [];
    ks.forEach(function (k) {
      var keys = (k.keys || []).join(" ");
      OPEN_TPL.forEach(function (t) {
        for (var i = 0; i < t.k.length; i++) {
          if (keys.indexOf(t.k[i]) >= 0) { cand.push({ q: s.name + t.q, ref: k.a, keys: k.keys }); return; }
        }
      });
    });
    var pick = cand.length
      ? cand[Math.floor(Math.random() * cand.length) % cand.length]
      : { q: s.name + "最特别的地方在哪里？", ref: ks[0].a, keys: ks[0].keys };
    return { q: "用自己的话说说：" + pick.q, ref: pick.ref, keys: pick.keys };
  }

  /* ---------------- 追问：答漏了要点就再问一句 ---------------- */
  /* 一次判卷只给分，不告诉人漏了什么。这里把「没被覆盖到的要点」翻译成一个追问句，
     让玩家补答一轮；补答不重新计分，而是把两轮文字合起来重判一次，
     等于把「补上」和「重复」区分开了。 */
  var ASK_WORD = /多大|多高|多重|多长|多少|为什么|怎么|怎样|哪|谁|什么|如何|是不是/;

  function followUp(question, answer, s, refA) {
    var g = gradeOpen(question, answer, s, refA);
    if (g.score >= 70) return { need: false, grade: g, ask: "", missing: [] };
    var pts = g.points || [];
    var missing = [];
    pts.forEach(function (p) {
      if (p.cover >= 0.5) return;
      missing.push({ a: p.a, cover: p.cover, miss: (p.miss || []).slice(0, 4) });
    });
    /* 追问句优先用档案自己的问法（「多大 / 为什么」），比拿关键词硬拼自然 */
    var ask = "";
    for (var i = 0; i < missing.length && !ask; i++) {
      var src = missing[i].a || "";
      var keys = [];
      ((s && s.knowledge) || []).forEach(function (k) {
        if (k.a === src) keys = k.keys || [];
      });
      for (var j = 0; j < keys.length; j++) {
        if (ASK_WORD.test(keys[j])) { ask = "那" + keys[j].replace(/[?？]$/, "") + "呢？"; break; }
      }
      if (!ask && missing[i].miss.length) ask = "再想想，关于「" + missing[i].miss[0] + "」你还记得什么？";
      if (!ask && src) ask = "再补一句：" + trim(src, 24).replace(/[。；]$/, "") + "——这一点你还没说到。";
    }
    if (!ask) return { need: false, grade: g, ask: "", missing: [] };
    return { need: true, grade: g, ask: ask, missing: missing };
  }

  /* 两轮作答合并重判：补上的算，重复的不额外给分 */
  function gradeMerged(question, first, second, s, refA) {
    var a = String(first || "").trim(), b = String(second || "").trim();
    if (!b) return gradeOpen(question, a, s, refA);
    var r = gradeOpen(question, a + " " + b, s, refA);
    r.merged = true;
    return r;
  }

  /* ---------------- 自测：内置评测集 ---------------- */

  function stats() {
    build();
    return {
      docs: DOCS.length,
      terms: Object.keys(POST).length,
      spirits: (typeof SPIRITS !== "undefined" && SPIRITS) ? Object.keys(SPIRITS).length : 0,
      avgLen: +(AVG_LEN || 0).toFixed(1)
    };
  }

  build();
  window.KB = {
    version: "kb3",
    build: build,
    rebuild: rebuild,
    search: search,
    searchSpirits: searchSpirits,
    evidence: evidence,
    shouldGround: shouldGround,
    namedSpans: namedSpans,
    hasRelic: hasRelic,
    unknownRelic: unknownRelic,
    check: check,
    verifyQuestion: verifyQuestion,
    gradeOpen: gradeOpen,
    followUp: followUp,
    gradeMerged: gradeMerged,
    compare: compare,
    compareEvidence: compareEvidence,
    craftEvidence: craftEvidence,
    craftList: craftList,
    confuseHint: confuseHint,
    openQuestion: openQuestion,
    coreName: coreName,
    openPoints: openPoints,
    histFacts: histFacts,
    histText: histText,
    eraName: eraName,
    subjectOk: subjectOk,
    describeCheck: describeCheck,
    selfTest: selfTest,
    stats: stats,
    _docs: DOCS
  };
})();
