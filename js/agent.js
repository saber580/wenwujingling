/* =========================================================
   文物精灵 · Agent 循环
   ---------------------------------------------------------
   和原来那条「五步流水线」的区别：

     流水线：代码决定先检索、再生成、再自检、再互审 —— 顺序是写死的。
     Agent ：把工具清单交给模型，模型自己判断「这题要不要查」「查哪个」
             「查到的东西够不够，要不要再查一次」。代码只负责执行它要的、
             把结果还给它，然后问下一轮。

   一轮的样子：
     ┌ 模型（带 tools） ──> 说要调 search_relic("长信宫灯")
     │ 程序执行工具，拿到 5 条片段
     │ 把 assistant.tool_calls + tool 结果两条消息回填进对话
     └ 再问模型 ──> 这次它给正文，或者继续要下一个工具

   三条硬约束（防止 Agent 失控）：
     · 最多 4 轮，到顶就强制收尾，不许无限自问自答
     · 同一个工具 + 同一组参数只执行一次，重复调用直接返回缓存结果
     · 工具全挂时不硬撑，退回不带工具的一次普通问答
   ========================================================= */
(function () {
  "use strict";

  var W = (typeof window !== "undefined") ? window : (typeof globalThis !== "undefined" ? globalThis : {});

  var MAX_ROUNDS = 4;          /* 工具轮次上限（不含最后的收尾） */
  var MAX_CALLS = 6;           /* 整场对话的工具调用总次数上限 */

  var SYSTEM = [
    "你是「文物精灵」里的国风文物助手，只谈中国文物、历史、博物馆与传统文化。",
    "",
    "回答前先查站内工具，不要凭记忆直接答：",
    "· 问某件文物是什么、什么年代、什么材质、有什么故事 —— 用 get_relic 取档案，",
    "  不知道站内有没有收录时先用 search_relic 搜；",
    "· 问工艺怎么做、某个术语什么意思 —— 用 lookup_craft；",
    "· 问两件文物有什么区别、谁更早 —— 用 compare_relics；",
    "· 问「你们这儿有什么 / 有哪些青铜器」这类范围问题 —— 用 list_collection；",
    "· 拿不准是不是认错了 —— 用 check_misconception。",
    "",
    "查到什么就依据什么回答。工具说站内没有收录，就直接说「站内暂未收录这件」，",
    "可以补一句常识性背景，但要讲清楚这是背景不是站内档案，绝不能编造年代、尺寸、出土地。",
    "资料不够时可以连着调多个工具，再给答案。",
    "",
    "最终回答用简洁典雅的中文：先一句话给结论，再补两三句依据。",
    "不要出现「工具」「函数」「检索结果」「数据库」这类词，也不要复述 JSON，",
    "就像面对面跟参观者说话。"
  ].join("\n");

  function post(path, body, ms) {
    if (typeof W.identFetchCloud === "function") return W.identFetchCloud(path, body, ms);
    return Promise.reject(new Error("AI 通道还没就绪，请刷新页面"));
  }

  function toolsApi() {
    return W.WJTools || (typeof WJTools !== "undefined" ? WJTools : null);
  }

  /* 工具结果进上下文前再瘦一次：模型上下文有限，塞太满反而答得差 */
  function packResult(r) {
    if (!r) return "{}";
    if (r.ok === false) return JSON.stringify({ error: String(r.error || "工具执行失败") });
    var s = "";
    try { s = JSON.stringify(r.data); } catch (e) { s = String(r.data); }
    if (s.length > 3000) s = s.slice(0, 3000) + "…(已截断)";
    return s;
  }

  /* 调用去重键：同名同参视为重复 */
  function callKey(name, args) {
    var keys = Object.keys(args || {}).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) parts.push(keys[i] + "=" + String(args[keys[i]]));
    return name + "|" + parts.join("&");
  }

  /* 发一轮：带工具，问模型「你要做什么」 */
  function step(messages, opt) {
    var api = toolsApi();
    var body = {
      messages: messages,
      tools: (api && api.openai) ? api.openai() : [],
      tool_choice: "auto",
      temperature: (opt.temperature != null ? opt.temperature : 0.3),
      ms: opt.ms || 32000
    };
    if (!body.tools.length) delete body.tools;
    return post("/api/agent", body, body.ms);
  }

  /* 收尾：不带工具再问一次，逼它用手上已有的资料作答 */
  function wrapUp(messages, opt) {
    var msgs = messages.concat([{
      role: "user",
      content: "资料就查到这儿。请直接根据上面查到的东西回答我最初的问题，不要再查了。"
    }]);
    return post("/api/agent", {
      messages: msgs,
      temperature: (opt.temperature != null ? opt.temperature : 0.3),
      ms: opt.ms || 30000
    }, opt.ms || 30000);
  }

  /**
   * 跑一次完整的 Agent 问答。
   *
   * @param {string} question 用户的问题
   * @param {object} opt
   *        opt.onStep(rec)  每执行完一个工具回调一次，用于在界面上显示「正在查…」
   *        opt.history      之前几轮的对话（[{role,content}]），最多取 6 条
   *        opt.maxRounds    工具轮次上限，默认 4
   *        opt.noTools      为 true 时退化成普通问答（不挂工具）
   * @returns {Promise<{ok,text,rounds,toolsUsed,model,trace,ms}>}
   */
  async function ask(question, opt) {
    opt = opt || {};
    var q = String(question || "").trim();
    var t0 = Date.now();
    if (!q) return { ok: false, error: "问题不能为空" };

    var api = toolsApi();
    var maxRounds = Math.max(1, Math.min(6, opt.maxRounds || MAX_ROUNDS));

    /* 历史只带最近 3 轮，且只带正文不带工具痕迹，免得老工具结果挤占上下文 */
    var messages = [{ role: "system", content: SYSTEM }];
    if (Array.isArray(opt.history)) {
      var hist = opt.history.filter(function (m) {
        return m && (m.role === "user" || m.role === "assistant") && m.content;
      }).slice(-6);
      for (var i = 0; i < hist.length; i++) {
        messages.push({ role: hist[i].role, content: String(hist[i].content).slice(0, 600) });
      }
    }
    messages.push({ role: "user", content: q });

    var trace = [];
    var used = [];
    var cache = Object.create(null);
    var calls = 0;
    var lastText = "";
    var model = "";
    var rounds = 0;

    /* noTools：直接一次普通问答，用于工具层异常时的降级 */
    if (opt.noTools || !api) {
      var plain = await post("/api/chat", {
        messages: messages, temperature: 0.3, ms: opt.ms || 30000
      }, opt.ms || 30000);
      if (plain && plain.ok) {
        return { ok: true, text: plain.text || "", rounds: 0, toolsUsed: [], model: plain.model || "", trace: [], ms: Date.now() - t0 };
      }
      return { ok: false, error: (plain && plain.error) || "AI 暂时没有响应" };
    }

    for (var r = 1; r <= maxRounds; r++) {
      var res;
      try {
        res = await step(messages, opt);
      } catch (e) {
        res = { ok: false, error: String((e && e.message) || e) };
      }
      rounds = r;

      if (!res || res.ok === false) {
        /* 工具轮出错：不硬撑，退回普通问答 */
        if (lastText) break;
        var fb = await post("/api/chat", { messages: messages, temperature: 0.3, ms: opt.ms || 30000 }, opt.ms || 30000);
        if (fb && fb.ok) {
          return { ok: true, text: fb.text || "", rounds: r, toolsUsed: used, model: fb.model || "", trace: trace, ms: Date.now() - t0, degraded: true };
        }
        return { ok: false, error: (res && res.error) || "AI 暂时没有响应" };
      }

      if (res.model) model = res.model;
      if (res.text) lastText = res.text;

      var list = res.tool_calls || [];
      if (!list.length) {
        /* 不调工具了 —— 这就是最终回答 */
        return { ok: true, text: res.text || lastText, rounds: rounds, toolsUsed: used, model: model, trace: trace, ms: Date.now() - t0 };
      }

      /* 模型要调工具：先把 assistant 这条（含 tool_calls）按协议回填 */
      messages.push({
        role: "assistant",
        content: res.text || "",
        tool_calls: list.map(function (c) {
          return {
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args || {}) }
          };
        })
      });

      /* 逐个执行，结果紧跟着用 role:"tool" 回填 */
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        var key = callKey(c.name, c.args);

        if (calls >= MAX_CALLS) {
          messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ error: "本次对话的工具调用次数已到上限，请直接用已有资料回答" }) });
          continue;
        }
        calls++;

        if (cache[key]) {
          messages.push({ role: "tool", tool_call_id: c.id, content: cache[key] });
          continue;
        }

        var got = await api.call(c.name, c.args);
        var packed = packResult(got);
        cache[key] = packed;
        messages.push({ role: "tool", tool_call_id: c.id, content: packed });

        if (used.indexOf(c.name) < 0) used.push(c.name);
        var rec = { round: r, name: c.name, args: c.args, ok: !!(got && got.ok), note: (got && (got.note || got.error)) || "" };
        trace.push(rec);
        if (typeof opt.onStep === "function") {
          try { opt.onStep(rec); } catch (e) {}
        }
      }
    }

    /* 轮次用完了还在调工具：强制收尾 */
    if (lastText) {
      return { ok: true, text: lastText, rounds: rounds, toolsUsed: used, model: model, trace: trace, ms: Date.now() - t0, capped: true };
    }
    var fin = await wrapUp(messages, opt);
    if (fin && fin.ok && String(fin.text || "").trim()) {
      return { ok: true, text: fin.text, rounds: rounds, toolsUsed: used, model: fin.model || model, trace: trace, ms: Date.now() - t0, capped: true };
    }
    return { ok: false, error: (fin && fin.error) || "AI 没能给出回答" };
  }

  /* 只做工具层自检：不联网，验证 6 个工具都能跑通 */
  function selfTest() {
    var api = toolsApi();
    if (!api) return { ok: false, error: "工具层未加载" };
    var cases = [
      ["search_relic", { keyword: "长信宫灯" }],
      ["get_relic", { name: "长信宫灯" }],
      ["compare_relics", { a: "长信宫灯", b: "雁鱼灯" }],
      ["lookup_craft", { name: "失蜡法" }],
      ["check_misconception", { name: "青铜鼎" }],
      ["list_collection", { material: "青铜器", limit: 5 }]
    ];
    var out = [];
    return Promise.all(cases.map(function (c) {
      return api.call(c[0], c[1]).then(function (r) {
        out.push({ tool: c[0], ok: !!(r && r.ok), note: (r && (r.note || r.error)) || "" });
      });
    })).then(function () {
      var bad = out.filter(function (x) { return !x.ok; });
      return { ok: bad.length === 0, passed: out.length - bad.length, total: out.length, items: out };
    });
  }

  W.WJAgent = {
    version: "agent1",
    ask: ask,
    selfTest: selfTest,
    system: SYSTEM,
    limits: { maxRounds: MAX_ROUNDS, maxCalls: MAX_CALLS }
  };
})();
