/* =========================================================
   文物精灵 · 工具层（Tool Registry）
   ---------------------------------------------------------
   为什么要有这一层：
     问答原来是「检索 → 生成 → 自检 → 互审 → 评分」的固定管线，
     每一步走不走、走哪条，都是代码里写死的 if-else。
     工具层把「查什么」的决定权交还给模型：模型看得到有哪些工具、
     每个工具能干什么，自己决定调哪个、传什么参数、要不要再调一次。
     这是从「管线」到「Agent」的那一步。

   规范：
     工具定义采用 MCP（Model Context Protocol）的字段命名——
       name / description / inputSchema(JSON Schema)
     openai() 只是把 inputSchema 换个字段名就叫 parameters，
     所以同一份定义既能喂给支持 Function Calling 的模型，
     也能原样挂到 MCP server 上，不用维护两套。

   安全：
     全部工具都是只读的站内查询（scope: "read"），不写文件、
     不发外部请求、不改用户数据。模型调错了顶多查空，不会坏事。
   ========================================================= */
(function () {
  "use strict";

  /* 沙箱里 window 不一定是全局，两路都取一遍 */
  var W = (typeof window !== "undefined") ? window : (typeof globalThis !== "undefined" ? globalThis : {});

  function KB() { return W.KB || (typeof KB !== "undefined" ? KB : null); }
  function CONTENT() { return W.CONTENT || (typeof CONTENT !== "undefined" ? CONTENT : null); }

  /* 文物总表。data.js 末尾显式挂了 window.SPIRITS；
     用 typeof 兜一次是为了兼容「还没挂上去」的老版本页面。
     注意函数名不能叫 SPIRITS —— 函数声明会占住这个名字，
     typeof 永远命中函数自身，永远取不到数据。 */
  function spiritBag() {
    if (W.SPIRITS) return W.SPIRITS;
    try {
      if (typeof SPIRITS !== "undefined" && SPIRITS && typeof SPIRITS === "object") return SPIRITS;
    } catch (e) {}
    return null;
  }

  /* ---------------- 调用轨迹 ----------------
     模型调了哪些工具、传了什么、拿到多少条，全部记下来。
     前端拿它渲染「AI 查了 3 次资料」的过程条，
     评测脚本拿它算「工具命中率」—— 这是 Agent 可解释性的落点。 */
  var TRACE = [];
  var MAX_TRACE = 40;

  function pushTrace(rec) {
    TRACE.push(rec);
    if (TRACE.length > MAX_TRACE) TRACE.shift();
  }

  function nowMs() {
    try { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
    catch (e) { return Date.now(); }
  }

  /* ---------------- 公共小工具 ---------------- */

  function clip(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  /* 名称归一：去掉「请查」「一下」「的资料」这类口水，留下实体 */
  function cleanName(s) {
    return String(s || "")
      .replace(/^[\s，,。、]+|[\s，,。、]+$/g, "")
      .replace(/^(请|帮我|帮忙|给我|我想|想要|麻烦)?(查|找|搜|看看|了解|介绍)(一下|一查)?/g, "")
      .replace(/(的|之)?(资料|信息|介绍|来历|详情|档案)$/g, "")
      .trim();
  }

  /* 在 SPIRITS 里按 id / name / alias / relicName 找一件文物 */
  function findSpirit(name) {
    var bag = spiritBag();
    if (!bag) return null;
    var q = cleanName(name).toLowerCase();
    if (!q) return null;
    var ids = Object.keys(bag), i, s;
    /* 第一轮：精确命中 */
    for (i = 0; i < ids.length; i++) {
      s = bag[ids[i]];
      if (!s) continue;
      if (String(s.id || "").toLowerCase() === q) return s;
      if (String(s.name || "").toLowerCase() === q) return s;
      if (String(s.relicName || "").toLowerCase() === q) return s;
      if (String(s.alias || "").toLowerCase() === q) return s;
    }
    /* 第二轮：包含关系（「长信宫灯」能命中「长信宫灯(西汉)」这类写法） */
    var best = null, bestLen = 0;
    for (i = 0; i < ids.length; i++) {
      s = bag[ids[i]];
      if (!s) continue;
      var cands = [s.name, s.relicName, s.alias].filter(Boolean).map(function (x) { return String(x); });
      for (var j = 0; j < cands.length; j++) {
        var c = cands[j].toLowerCase();
        if (!c) continue;
        if (c.indexOf(q) >= 0 || q.indexOf(c) >= 0) {
          if (c.length > bestLen) { best = s; bestLen = c.length; }
        }
      }
    }
    return best;
  }

  /* 把一件文物压成给模型看的样子：只要它答得出话的字段 */
  function spiritBrief(s) {
    if (!s) return null;
    var kn = Array.isArray(s.knowledge) ? s.knowledge : [];
    return {
      id: s.id,
      name: s.name || s.relicName || "",
      alias: s.alias || "",
      era: s.era || "",
      material: (s.primary || ""),
      use: (s.secondary || ""),
      intro: clip(s.intro || "", 220),
      comic: Array.isArray(s.comic) ? s.comic.slice(0, 3).map(function (x) { return clip(x, 160); }) : [],
      qa: kn.slice(0, 6).map(function (k) {
        return { keys: (k.keys || []).slice(0, 4), a: clip(k.a || "", 200) };
      })
    };
  }

  /* ---------------- 工具定义 ----------------
     顺序即「模型看到的顺序」，越靠前越容易被选中，
     所以把最常用的检索放第一。 */
  var TOOLS = [

    {
      name: "search_relic",
      title: "站内文物检索",
      scope: "read",
      description:
        "在文物精灵站内知识库做全文检索，返回最相关的资料片段（片段来自站内文物档案，不是网上搜的）。" +
        "凡是问「某件文物是什么 / 哪个朝代 / 什么材质 / 有什么故事」，或提到具体文物名、" +
        "朝代、工艺术语时，都先用这个工具查，不要凭记忆答。",
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "检索词。用文物名（如「长信宫灯」）、朝代（如「西汉」）或工艺名（如「失蜡法」），不要写整句话"
          },
          limit: {
            type: "integer",
            description: "返回片段条数，默认 5，最多 8",
            minimum: 1,
            maximum: 8
          }
        },
        required: ["keyword"]
      },
      run: function (a) {
        var kb = KB();
        if (!kb || !kb.search) return { ok: false, error: "知识库未加载" };
        var kw = String(a.keyword || "").trim();
        if (!kw) return { ok: false, error: "keyword 不能为空" };
        var n = Math.max(1, Math.min(8, parseInt(a.limit, 10) || 5));
        var hits = kb.search(kw, n) || [];
        if (!hits.length) {
          return { ok: true, data: { keyword: kw, hits: [] }, note: "站内没有检索到「" + clip(kw, 20) + "」的资料" };
        }
        return {
          ok: true,
          data: {
            keyword: kw,
            hits: hits.map(function (h) {
              return { name: h.sname, field: h.field, text: clip(h.text, 260), score: h.score };
            })
          },
          note: "命中 " + hits.length + " 条片段，涉及 " + uniq(hits.map(function (h) { return h.sname; })).join("、")
        };
      }
    },

    {
      name: "get_relic",
      title: "取文物档案",
      scope: "read",
      description:
        "按名称取一件文物的完整站内档案：年代、材质、用途、简介、看点、常见问答。" +
        "已经知道具体是哪件文物、要看详情时用它；只有模糊关键词、不知道该找哪件时用 search_relic。",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "文物名称，可用别名（如「后母戊鼎」也可写「司母戊鼎」）"
          }
        },
        required: ["name"]
      },
      run: function (a) {
        var s = findSpirit(a.name);
        if (!s) {
          /* 档案里没有：回退到检索，别直接说不知道 */
          var kb = KB();
          var hits = (kb && kb.search) ? kb.search(cleanName(a.name), 3) : [];
          if (hits && hits.length) {
            return {
              ok: true,
              data: { found: false, fallback: hits.map(function (h) { return { name: h.sname, text: clip(h.text, 200) }; }) },
              note: "档案里没有「" + clip(a.name, 16) + "」，已回退到片段检索"
            };
          }
          return { ok: true, data: { found: false }, note: "站内档案没有收录「" + clip(a.name, 16) + "」" };
        }
        return { ok: true, data: { found: true, relic: spiritBrief(s) }, note: "已取到「" + (s.name || "") + "」的档案" };
      }
    },

    {
      name: "compare_relics",
      title: "文物对比",
      scope: "read",
      description:
        "对比两件文物，返回站内已整理好的对比结论：谁更早、谁更巧、差在哪。" +
        "用户问「A 和 B 有什么区别 / 谁更早 / 哪个更厉害」时用它，" +
        "不要自己临时拼对比。站内只有 8 组预设对比，没命中会返回可对比的组名。",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string", description: "第一件文物名称" },
          b: { type: "string", description: "第二件文物名称" }
        },
        required: ["a", "b"]
      },
      run: function (a) {
        var cp = CONTENT();
        var na = cleanName(a.a), nb = cleanName(a.b);
        if (!cp || !cp.cmp) return { ok: false, error: "内容包未加载" };

        function hit(name) {
          var out = [];
          for (var i = 0; i < cp.cmp.length; i++) {
            var items = cp.cmp[i].items || [];
            for (var j = 0; j < items.length; j++) {
              var nm = String(items[j].name || "");
              if (nm && (nm.indexOf(name) >= 0 || name.indexOf(nm) >= 0)) { out.push(cp.cmp[i]); break; }
            }
          }
          return out;
        }

        var ha = hit(na), hb = hit(nb), k, found = null;
        for (k = 0; k < ha.length; k++) {
          if (hb.indexOf(ha[k]) >= 0) { found = ha[k]; break; }
        }
        if (!found) {
          return {
            ok: true,
            data: {
              matched: false,
              available: cp.cmp.map(function (g) { return g.title; })
            },
            note: "「" + clip(na, 12) + "」与「" + clip(nb, 12) + "」不在预设对比组里"
          };
        }
        return {
          ok: true,
          data: {
            matched: true,
            title: found.title,
            axis: found.axis,
            items: (found.items || []).map(function (it) {
              return { name: it.name, era: it.era, craft: it.craft, edge: clip(it.edge, 200) };
            }),
            diff: found.diff || [],
            verdict: found.verdict || ""
          },
          note: "命中对比组《" + found.title + "》"
        };
      }
    },

    {
      name: "lookup_craft",
      title: "查工艺",
      scope: "read",
      description:
        "查中国传统工艺词条，返回工艺释义、工序要点与代表器物。" +
        "问「什么是失蜡法 / 青铜器怎么铸的 / 唐三彩怎么做」这类工艺问题时用它。",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "工艺名称，如「失蜡法」「錾刻」「点翠」" }
        },
        required: ["name"]
      },
      run: function (a) {
        var kb = KB(), cp = CONTENT();
        var n = cleanName(a.name);
        if (!n) return { ok: false, error: "name 不能为空" };
        /* 先用 kb-rag 的工艺检索（它带权重与同义展开），查不到再扫内容包 */
        if (kb && kb.craftEvidence) {
          var ev = kb.craftEvidence(n);
          if (ev) {
            return { ok: true, data: { found: true, evidence: clip(String(ev), 600) }, note: "命中工艺「" + clip(n, 12) + "」" };
          }
        }
        if (cp && cp.craft) {
          for (var i = 0; i < cp.craft.length; i++) {
            var c = cp.craft[i];
            var nm = String(c.name || "");
            if (nm && (nm.indexOf(n) >= 0 || n.indexOf(nm) >= 0)) {
              return {
                ok: true,
                data: { found: true, craft: c },
                note: "命中工艺「" + nm + "」"
              };
            }
          }
        }
        return {
          ok: true,
          data: { found: false, total: cp && cp.craft ? cp.craft.length : 0 },
          note: "没查到「" + clip(n, 12) + "」这个工艺"
        };
      }
    },

    {
      name: "check_misconception",
      title: "易混淆辨析",
      scope: "read",
      description:
        "查一件文物最容易被认成什么、两者差在哪。用户说「这是不是 X」、" +
        "或识别结果把握不大时用它，能给出一句「你可能认成了 Y，区别在于…」。",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "待辨析的文物名称" }
        },
        required: ["name"]
      },
      run: function (a) {
        var kb = KB();
        var n = cleanName(a.name);
        if (!n) return { ok: false, error: "name 不能为空" };
        var hint = (kb && kb.confuseHint) ? kb.confuseHint(n) : null;
        if (!hint) {
          return { ok: true, data: { found: false }, note: "「" + clip(n, 12) + "」没有登记易混淆项" };
        }
        return { ok: true, data: { found: true, hint: clip(String(hint), 400) }, note: "已给出「" + clip(n, 12) + "」的辨析" };
      }
    },

    {
      name: "list_collection",
      title: "浏览馆藏",
      scope: "read",
      description:
        "按材质或朝代列出站内收录的文物名单。" +
        "用户问「你们这儿有什么 / 有哪些青铜器 / 汉代的东西有哪些」时用它，" +
        "先看清楚站内有什么，再决定要不要逐个查。",
      inputSchema: {
        type: "object",
        properties: {
          material: {
            type: "string",
            description: "材质筛选：青铜器 / 陶瓷器 / 玉器 / 书画 / 金银器 / 石刻 等，不填则不限"
          },
          era: {
            type: "string",
            description: "朝代筛选，如「西汉」「唐」「宋」，不填则不限"
          },
          limit: { type: "integer", description: "最多返回几件，默认 20", minimum: 1, maximum: 40 }
        },
        required: []
      },
      run: function (a) {
        var bag = spiritBag();
        if (!bag) return { ok: false, error: "文物数据未加载" };
        var ATTR = (typeof ATTRIBUTES !== "undefined") ? ATTRIBUTES : (W.ATTRIBUTES || null);
        var mat = String(a.material || "").trim();
        var era = String(a.era || "").trim();
        var lim = Math.max(1, Math.min(40, parseInt(a.limit, 10) || 20));

        /* 材质键（bronze/ceramic…）和中文名（青铜器/陶瓷器）都认 */
        var matKey = "";
        if (mat && ATTR && ATTR.primary) {
          for (var k in ATTR.primary) {
            if (String(ATTR.primary[k].name || "").indexOf(mat) >= 0 || mat.indexOf(String(ATTR.primary[k].name || "")) >= 0) {
              matKey = k; break;
            }
          }
        }

        var ids = Object.keys(bag), out = [];
        for (var i = 0; i < ids.length && out.length < lim; i++) {
          var s = bag[ids[i]];
          if (!s) continue;
          if (matKey && s.primary !== matKey) continue;
          if (era && String(s.era || "").indexOf(era) < 0) continue;
          out.push({ name: s.name || s.relicName || "", era: clip(s.era || "", 40), intro: clip(s.intro || "", 60) });
        }
        return {
          ok: true,
          data: { total: Object.keys(bag).length, filter: { material: mat || "不限", era: era || "不限" }, list: out },
          note: "共收录 " + Object.keys(bag).length + " 件，本次列出 " + out.length + " 件"
        };
      }
    },

    {
      name: "graph_query",
      title: "文物关系图谱 · 多跳推理",
      scope: "read",
      description:
        "在文物知识图谱上做多跳关系推理，回答纯检索答不了的问题：" +
        "「这件鼎和那件簋什么关联」「同一墓葬还出土了哪些」「这件文物和谁同时代/同材质」。" +
        "凡是问「XX 和 XX 什么关系 / 什么关联」「XX 同墓 / 同遗址出土了哪些」「XX墓出土了哪些文物」时用它。" +
        "图谱关系包括：同墓出土、同遗址、同文化、同时代、同材质、同用途、同站收藏。",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "用户的原始关系问题，例如「错金铜壶和温炉什么关系」「满城汉墓出土了哪些」"
          }
        },
        required: ["question"]
      },
      run: function (a) {
        var G = W.GRAPH || (typeof GRAPH !== "undefined" ? GRAPH : null);
        if (!G) return { ok: false, error: "知识图谱未加载" };
        var q = String(a.question || "").trim();
        if (!q) return { ok: false, error: "question 不能为空" };
        var r = G.query(q);
        return { ok: true, data: r, note: "关系图谱查询完成（kind=" + r.kind + "）" };
      }
    }
  ];

  function uniq(arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && !seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
    }
    return out;
  }

  function byName(n) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].name === n) return TOOLS[i];
    return null;
  }

  /* ---------------- 参数校验 ----------------
     模型给的参数经常是字符串 "3" 而不是数字 3，也可能少必填项。
     与其让它带着坏参数去执行，不如在这里挡下来并把「哪里错了」回给模型，
     模型下一轮能自己改。这是 Agent 自我修正的一环。 */
  function validate(tool, args) {
    var sc = tool.inputSchema || {};
    var props = sc.properties || {};
    var req = sc.required || [];
    var out = {}, errs = [], i;

    for (i = 0; i < req.length; i++) {
      var rk = req[i];
      if (args[rk] == null || String(args[rk]).trim() === "") errs.push("缺少必填参数 " + rk);
    }
    for (var k in props) {
      var v = args[k];
      if (v == null || v === "") continue;
      var t = props[k].type;
      if (t === "integer" || t === "number") {
        var num = Number(v);
        if (isNaN(num)) { errs.push(k + " 应该是数字"); continue; }
        if (props[k].minimum != null && num < props[k].minimum) num = props[k].minimum;
        if (props[k].maximum != null && num > props[k].maximum) num = props[k].maximum;
        out[k] = (t === "integer") ? Math.round(num) : num;
      } else if (t === "string") {
        out[k] = String(v);
      } else {
        out[k] = v;
      }
    }
    /* 模型偶尔会多传一个 schema 里没有的键，丢掉即可，不报错 */
    return { ok: errs.length === 0, args: out, errors: errs };
  }

  /* ---------------- 对外调用 ---------------- */

  function call(name, args, opt) {
    opt = opt || {};
    var tool = byName(name);
    var t0 = nowMs();

    if (!tool) {
      var miss = { ok: false, error: "没有名为 " + name + " 的工具，可用：" + TOOLS.map(function (t) { return t.name; }).join(", ") };
      pushTrace({ name: name, args: args, ok: false, ms: 0, note: miss.error });
      return Promise.resolve(miss);
    }

    var v = validate(tool, args || {});
    if (!v.ok) {
      var bad = { ok: false, error: "参数不对：" + v.errors.join("；") + "。请修正后重试。" };
      pushTrace({ name: name, args: args, ok: false, ms: Math.round(nowMs() - t0), note: bad.error });
      return Promise.resolve(bad);
    }

    var res;
    try {
      res = tool.run(v.args);
    } catch (e) {
      res = { ok: false, error: "工具执行出错：" + String((e && e.message) || e).slice(0, 120) };
    }

    var ms = Math.round(nowMs() - t0);
    var payload = res && res.data;
    /* 结果过大就把片段再压一压：模型上下文有限，塞爆了反而答不好 */
    var json = "";
    try { json = JSON.stringify(payload == null ? null : payload); } catch (e) { json = ""; }
    if (json.length > (opt.maxChars || 4000)) {
      payload = { truncated: true, preview: clip(json, opt.maxChars || 4000) };
    }

    pushTrace({
      name: name,
      title: tool.title,
      args: v.args,
      ok: !!(res && res.ok),
      ms: ms,
      note: (res && (res.note || res.error)) || ""
    });

    if (!res || res.ok === false) {
      return Promise.resolve({ ok: false, error: (res && res.error) || "工具没有返回结果" });
    }
    return Promise.resolve({ ok: true, data: payload, note: res.note || "" });
  }

  /* MCP 原生格式：name + description + inputSchema */
  function list() {
    return TOOLS.map(function (t) {
      return {
        name: t.name,
        title: t.title,
        description: t.description,
        scope: t.scope,
        inputSchema: t.inputSchema
      };
    });
  }

  /* OpenAI Function Calling 格式：只把 inputSchema 换个键名叫 parameters */
  function openai() {
    return TOOLS.map(function (t) {
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
        }
      };
    });
  }

  W.WJTools = {
    version: "tool1",
    list: list,
    openai: openai,
    call: call,
    trace: function () { return TRACE.slice(); },
    clearTrace: function () { TRACE = []; },
    has: function (n) { return !!byName(n); },
    stats: function () { return { tools: TOOLS.length, calls: TRACE.length }; }
  };
})();
