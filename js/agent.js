/* =========================================================
   文物精灵 · Agent v2（规划 · 并行 · 反思 · 溯源 · 安全）
   ---------------------------------------------------------
   相对 v1「模型说要调什么就串行调什么」，v2 多了四件事：

   1) 显式规划：先用一次轻量调用产出 JSON 计划（goal / steps / tools /
      parallel），并把步骤里的工具名与 MCP server 实际发现的清单对齐。
      调用失败或超时就用代码启发式兜底，绝不因为规划器卡住而答不上话。
   2) 并行调用：计划标记为 parallel 的多个独立步骤，或模型一轮给出的
      多个 tool_calls，用 Promise.all 同时打出去，而不是一个等一个。
   3) 反思：拿到工具结果后自评「够不够 / 缺什么 / 下一轮查哪个」，
      不够就按 next_tool + next_args 定向补查一次，够了就催它收尾。
   4) 引用溯源：hybrid_search 的 [n] 角标在跨多次调用时统一重编号，
      最终回答的角标能一路追回到 doc_id / 档案字段 / 原文片段。

   所有开关来自 prompts/registry.json（消融实验逐项关闭的就是这些）。
   工具经 MCP client 走服务端执行，连不上才回落页面内工具层。
   ========================================================= */
(function () {
  "use strict";
  var W = (typeof window !== "undefined") ? window : globalThis;

  var MAX_ROUNDS = 4;
  var MAX_CALLS = 9;
  var MAX_REFLECT = 1;
  var PLAN_MS = 4200;
  var REFLECT_MS = 4600;

  var FALLBACK_CFG = {
    id: "builtin", prompt_version: "v3.0-agent",
    features: { rag_hybrid: true, citations: true, agent_plan: true,
                agent_reflect: true, parallel_calls: true,
                input_guard: true, output_guard: true },
    system: "你是「文物精灵」里的国风文物助手，只谈中国文物、历史、博物馆与传统文化。回答前先查站内资料，查到什么就依据什么回答，简洁典雅。",
    plan: "", reflect: ""
  };

  /* ---------------- 基础 ---------------- */
  function cfgFor(opt) {
    if (W.WJPrompts) return W.WJPrompts.active(opt.ablated || []);
    return FALLBACK_CFG;
  }
  function post(path, body, ms, onDelta) {
    /* 带订阅时走流式通道：模型收尾那一轮吐的正文能边到边显示 */
    if (typeof onDelta === "function") {
      if (path === "/api/agent" && typeof W.cloudAgentStream === "function")
        return W.cloudAgentStream(body, onDelta);
      if (path === "/api/chat" && typeof W.cloudChatStream === "function")
        return W.cloudChatStream(Array.isArray(body.messages) ? body.messages : [], {
          temperature: body.temperature, max_tokens: body.max_tokens, ms: ms, onDelta: onDelta
        });
    }
    if (typeof W.identFetchCloud === "function") return W.identFetchCloud(path, body, ms);
    return Promise.reject(new Error("AI 通道还没就绪，请刷新页面"));
  }
  function mcp() { return W.WJMCP || null; }
  function localTools() { return W.WJTools || (typeof WJTools !== "undefined" ? WJTools : null); }

  var _connecting = null;
  function ensureMCP() {
    var c = mcp();
    if (!c) return Promise.resolve(null);
    if (c.status().connected) return Promise.resolve(c);
    if (_connecting) return _connecting;
    _connecting = c.connect().then(function () { return c; })
      .catch(function () { return c; })
      .then(function (x) { _connecting = null; return x; });
    return _connecting;
  }

  function toolNames() {
    var c = mcp();
    var list = [];
    if (c && c.openaiTools) list = c.openaiTools().map(function (t) { return t.function.name; });
    if (!list.length) { var t = localTools(); if (t) list = t.list().map(function (x) { return x.name; }); }
    return list;
  }
  function toolSchemas() {
    var c = mcp();
    if (c && c.openaiTools) {
      var s = c.openaiTools();
      if (s.length) return s;
    }
    var t = localTools();
    return t ? t.openai() : [];
  }
  function callTool(name, args) {
    var c = mcp();
    if (c && c.status().connected) return c.call(name, args);
    var t = localTools();
    return t ? t.call(name, args) : Promise.resolve({ ok: false, error: "工具层未加载" });
  }

  function race(p, ms) {
    return Promise.race([
      Promise.resolve(p).catch(function (e) { return null; }),
      new Promise(function (res) { setTimeout(function () { res(null); }, ms); })
    ]);
  }

  /* 让模型只吐 JSON，再稳妥地抠出来；坏 JSON 一律当失败交给兜底 */
  async function llmJSON(sys, user, ms) {
    var r = await post("/api/agent", {
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0.1, ms: ms
    }, ms).catch(function () { return null; });
    if (!r || r.ok === false) return null;
    var t = String(r.text || "").replace(/```(?:json)?/g, "").trim();
    var m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) { return null; }
  }

  /* ---------------- 规划 ---------------- */
  function heuristicPlan(q, names) {
    var s = String(q || "");
    var steps = [], parallel = false;
    var has = function (n) { return names.indexOf(n) >= 0; };
    if (/和|与|相比|哪个更|谁更|区别|不同/.test(s) && has("compare_relics")) {
      steps.push({ action: "查两件文物的预设对比", tool: "compare_relics" });
    }
    /* 关系/多跳问题优先走知识图谱（「XX和XX什么关联」「同墓出土」） */
    if (/关系|关联|同墓|同遗址|一起出土|同一墓|出土了哪些|出土了什么/.test(s) && has("graph_query")) {
      steps.push({ action: "在文物关系图谱上做多跳推理", tool: "graph_query" });
    }
    if (/工艺|怎么铸|怎么做|什么叫|是什么法|技法/.test(s) && has("lookup_craft")) {
      steps.push({ action: "查工艺词条", tool: "lookup_craft" });
    }
    if (/有哪些|都有什么|多少件|列出|馆藏/.test(s) && has("list_collection")) {
      steps.push({ action: "浏览馆藏名单", tool: "list_collection" });
    }
    if (!steps.length) {
      if (has("hybrid_search")) steps.push({ action: "双路召回相关档案片段", tool: "hybrid_search" });
      if (has("get_relic")) steps.push({ action: "取命中档案的完整字段", tool: "get_relic" });
      parallel = steps.length > 1;
    }
    return {
      goal: s.slice(0, 60), steps: steps, need_tools: steps.length > 0,
      parallel: parallel, source: "heuristic"
    };
  }

  async function makePlan(q, cfg, names) {
    if (!cfg.features.agent_plan) {
      return { goal: q, steps: [], need_tools: true, parallel: false, source: "disabled" };
    }
    var sys = (cfg.plan || FALLBACK_CFG.plan) + "\n可用工具：" + names.join(", ");
    var j = await race(llmJSON(sys, q, PLAN_MS), PLAN_MS + 300);
    if (!j || typeof j !== "object") return heuristicPlan(q, names);
    var steps = (Array.isArray(j.steps) ? j.steps : []).slice(0, 3).map(function (s) {
      return { action: String((s && s.action) || "查资料").slice(0, 60),
               tool: String((s && s.tool) || "none") };
    }).filter(function (s) {
      return s.tool === "none" || names.indexOf(s.tool) >= 0;
    });
    if (!steps.length) return heuristicPlan(q, names);
    return {
      goal: String(j.goal || q).slice(0, 60),
      steps: steps,
      need_tools: j.need_tools !== false && steps.some(function (s) { return s.tool !== "none"; }),
      parallel: !!j.parallel && cfg.features.parallel_calls,
      source: "llm"
    };
  }

  /* 计划 → 具体参数。规划器只给工具名，参数由问题里抽，避免再花一次调用。 */
  function argsFor(tool, q) {
    var s = String(q || "").trim();
    if (tool === "hybrid_search") return { query: s, top_k: 5 };
    if (tool === "search_relic") return { keyword: s.replace(/[？?。，,、]/g, " ").slice(0, 24), limit: 5 };
    if (tool === "get_relic") {
      var m = s.match(/[\u4e00-\u9fff]{2,8}(?=灯|鼎|玉|瓶|尊|盘|镜|钱|俑|杯|碗|壶|印|璧|琮|剑)/);
      return { name: (m ? m[0] : s).slice(0, 20) };
    }
    if (tool === "list_collection") {
      var mat = (s.match(/青铜器|陶瓷器?|玉器|书画|金银器|石刻/) || [""])[0];
      var era = (s.match(/西汉|东汉|唐|宋|元|明|清|商|周|汉|战国|春秋/) || [""])[0];
      return { material: mat, era: era, limit: 12 };
    }
    if (tool === "compare_relics") {
      var parts = s.split(/和|与|跟|相比|对比/);
      return { a: (parts[0] || "").slice(0, 20), b: (parts[1] || "").replace(/[哪个更谁更?？]/g, "").slice(0, 20) };
    }
    if (tool === "lookup_craft") return { name: s.replace(/[？?是什么呢怎么做怎么铸]/g, "").slice(0, 16) };
    if (tool === "check_misconception") return { name: s.slice(0, 20) };
    if (tool === "graph_query") return { question: s };
    if (tool === "verify_citation") return { answer: s, refs: [] };
    return {};
  }

  /* ---------------- 执行与溯源 ---------------- */
  function callKey(name, args) {
    var keys = Object.keys(args || {}).sort(), parts = [];
    for (var i = 0; i < keys.length; i++) parts.push(keys[i] + "=" + String(args[keys[i]]));
    return name + "|" + parts.join("&");
  }

  function makeCitationBag() {
    var bag = [];
    return {
      all: bag,
      /* 把一次 hybrid_search 的 [n] 统一重编号，并同步改写回填给模型的文本 */
      absorb: function (data) {
        if (!data || !Array.isArray(data.citations)) return null;
        var map = {}, self = this;
        data.citations.forEach(function (c) {
          var ref = "[" + (bag.length + 1) + "]";
          map[c.ref] = ref;
          bag.push({ ref: ref, doc_id: c.doc_id, title: c.title, field: c.field,
                     snippet: c.snippet, channels: c.channels, score: c.score,
                     origin_ref: c.ref });
        });
        var swap = function (s) { return String(s || "").replace(/\[\d+\]/g, function (m) { return map[m] || m; }); };
        return {
          context: swap(data.context || ""),
          citations: bag.slice(-data.citations.length),
          fusion: data.fusion || "",
          two_channel_hits: data.two_channel_hits || 0,
          rewrites: data.rewrites || []
        };
      }
    };
  }

  function packResult(name, r, citeBag) {
    if (!r) return "{}";
    if (r.ok === false) return JSON.stringify({ error: String(r.error || "工具执行失败") });
    var data = r.data;
    if (name === "hybrid_search" && data && data.citations) {
      var slim = citeBag.absorb(data);
      if (slim) {
        data = { context: slim.context, citations: slim.citations,
                 fusion: slim.fusion, two_channel_hits: slim.two_channel_hits };
      }
    }
    var s = "";
    try { s = JSON.stringify(data); } catch (e) { s = String(data); }
    if (s.length > 3600) s = s.slice(0, 3600) + "…(已截断)";
    return s;
  }

  /* ---------------- LLM 单步 ---------------- */
  function step(messages, cfg, opt) {
    var tools = toolSchemas();
    var body = {
      messages: messages,
      tools: tools,
      tool_choice: "auto",
      temperature: opt.temperature != null ? opt.temperature : 0.3,
      ms: opt.ms || 26000
    };
    if (!tools.length) delete body.tools;
    return post("/api/agent", body, body.ms, opt.onDelta);
  }

  async function reflectOnce(q, results, cfg, names, round) {
    if (!cfg.features.agent_reflect) return null;
    var brief = results.slice(-4).map(function (r) {
      return { tool: r.name, ok: r.ok, note: (r.note || r.error || "").slice(0, 90) };
    });
    var sys = (cfg.reflect || FALLBACK_CFG.reflect) + "\n可用工具：" + names.join(", ");
    var user = "最初的问题：" + q + "\n第 " + round + " 轮工具结果摘要：" + JSON.stringify(brief);
    var j = await race(llmJSON(sys, user, REFLECT_MS), REFLECT_MS + 300);
    if (!j || typeof j !== "object") {
      return { enough: true, covered: [], gaps: [], next_tool: "none",
               next_args: {}, confidence: 0.5, source: "heuristic" };
    }
    var nt = String(j.next_tool || "none");
    if (nt !== "none" && names.indexOf(nt) < 0) nt = "none";
    return {
      enough: j.enough !== false,
      covered: Array.isArray(j.covered) ? j.covered.slice(0, 4).map(String) : [],
      gaps: Array.isArray(j.gaps) ? j.gaps.slice(0, 4).map(String) : [],
      next_tool: nt,
      next_args: (j.next_args && typeof j.next_args === "object") ? j.next_args : {},
      confidence: Number(j.confidence) || 0.5,
      source: "llm"
    };
  }

  /* ---------------- 主流程 ---------------- */
  /**
   * @returns {Promise<{ok,text,rounds,toolsUsed,model,trace,ms,plan,phases,
   *                    reflections,citations,guard,prompt_version,mcp,parallelBatches}>}
   */
  async function ask(question, opt) {
    opt = opt || {};
    var t0 = Date.now();
    var q = String(question || "").trim();
    var cfg = cfgFor(opt);
    var phases = [], reflections = [], trace = [], used = [];
    var guard = { input: null, output: null };

    if (!q) return { ok: false, error: "问题不能为空" };

    /* 0) 输入过滤 */
    if (cfg.features.input_guard && W.WJSafety) {
      var gi = W.WJSafety.checkInput(q);
      guard.input = { action: gi.action, rules: gi.rules };
      if (!gi.ok) {
        return { ok: true, text: gi.reply, rounds: 0, toolsUsed: [], trace: [],
                 phases: [{ phase: "guard", action: "block", rules: gi.rules }],
                 guard: guard, prompt_version: cfg.prompt_version,
                 blocked: true, ms: Date.now() - t0 };
      }
      q = gi.text;
      if (gi.rules.length) phases.push({ phase: "guard", action: gi.action, rules: gi.rules });
    }

    /* 1) MCP 握手（失败也不影响后续，回落页面内工具） */
    await race(ensureMCP(), 2600);
    var names = toolNames();
    var mcpStatus = mcp() ? mcp().status() : { connected: false };

    /* 2) 规划阶段 */
    var plan = await makePlan(q, cfg, names);
    phases.push({ phase: "plan", goal: plan.goal, steps: plan.steps,
                  parallel: plan.parallel, source: plan.source });

    var citeBag = makeCitationBag();
    var sys = (W.WJPrompts ? W.WJPrompts.systemFor(cfg) : cfg.system) +
      (cfg.features.rag_hybrid ? "\n优先用 hybrid_search 取得带角标的双路召回证据。" : "");
    var messages = [{ role: "system", content: sys }];
    if (Array.isArray(opt.history)) {
      var hist = opt.history.filter(function (m) {
        return m && (m.role === "user" || m.role === "assistant") && m.content;
      }).slice(-6);
      for (var h = 0; h < hist.length; h++) {
        messages.push({ role: hist[h].role, content: String(hist[h].content).slice(0, 600) });
      }
    }
    messages.push({ role: "user", content: q });

    var maxRounds = Math.max(1, Math.min(6, opt.maxRounds || MAX_ROUNDS));
    var cache = Object.create(null);
    var calls = 0, lastText = "", model = "", rounds = 0;
    var parallelBatches = 0, reflectionsDone = 0, capped = false;

    /* 执行一个工具并记轨迹（并发安全：各自只写自己的 rec） */
    function execOne(name, args, round) {
      var key = callKey(name, args);
      if (cache[key]) {
        return Promise.resolve({ packed: cache[key], got: { ok: true }, fresh: false });
      }
      if (calls >= MAX_CALLS) {
        return Promise.resolve({ packed: JSON.stringify({ error: "工具调用次数已到上限，请用已有资料回答" }),
                                 got: { ok: false }, fresh: false });
      }
      calls++;
      return callTool(name, args).then(function (got) {
        var packed = packResult(name, got, citeBag);
        cache[key] = packed;
        var rec = { round: round, name: name, args: args, ok: !!(got && got.ok),
                    note: (got && (got.note || got.error)) || "" };
        trace.push(rec);
        if (got && got.ok && used.indexOf(name) < 0) used.push(name);
        if (typeof opt.onStep === "function") { try { opt.onStep(rec); } catch (e) {} }
        return { packed: packed, got: got, fresh: true };
      });
    }

    /* 把一批工具结果按协议回填：assistant.tool_calls + 若干 role:tool */
    function feedBatch(list, results, round, tag) {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: list.map(function (c, i) {
          return { id: c.id || ("call_" + round + "_" + i), type: "function",
                   function: { name: c.name, arguments: JSON.stringify(c.args || {}) } };
        })
      });
      list.forEach(function (c, i) {
        messages.push({ role: "tool", tool_call_id: c.id || ("call_" + round + "_" + i),
                        content: results[i].packed });
      });
      phases.push({ phase: tag, round: round, tools: list.map(function (c) { return c.name; }),
                    count: list.length });
    }

    /* 3) 计划驱动的并行预取：独立步骤一次性打出去，不等彼此 */
    if (plan.parallel && plan.steps.length > 1 && cfg.features.parallel_calls) {
      var prefetch = plan.steps.filter(function (s) { return s.tool && s.tool !== "none" &&
        names.indexOf(s.tool) >= 0; }).slice(0, 3).map(function (s) {
          return { id: "call_plan_" + trace.length + "_" + Math.random().toString(36).slice(2, 6),
                   name: s.tool, args: argsFor(s.tool, q) };
        });
      if (prefetch.length > 1) {
        var preResults = await Promise.all(prefetch.map(function (c) { return execOne(c.name, c.args, 1); }));
        feedBatch(prefetch, preResults, 1, "act_parallel_plan");
        parallelBatches++;
      }
    }

    /* 4) 决策 → 执行 → 反思 循环 */
    for (var r = 1; r <= maxRounds; r++) {
      var res;
      try { res = await step(messages, cfg, opt); }
      catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }
      rounds = r;

      if (!res || res.ok === false) {
        if (!lastText) {
          var fb = await post("/api/chat", {
            messages: messages, temperature: 0.3, ms: opt.ms || 26000
          }, opt.ms || 26000, opt.onDelta).catch(function () { return null; });
          if (fb && fb.ok) {
            lastText = fb.text; model = fb.model || "";
            phases.push({ phase: "degrade", reason: "工具轮失败，回落普通问答" });
          } else {
            return { ok: false, error: (res && res.error) || "AI 暂时没有响应",
                     plan: plan, phases: phases, trace: trace, ms: Date.now() - t0 };
          }
        }
        break;
      }
      if (res.model) model = res.model;
      if (res.text) lastText = res.text;

      var list = (res.tool_calls || []).filter(function (c) { return c && c.name; });
      if (!list.length) break;                       /* 给出正文 = 收尾 */

      /* 同一轮里模型给的多个 tool_calls：并行还是串行由消融开关决定 */
      var execs;
      if (cfg.features.parallel_calls && list.length > 1) {
        execs = await Promise.all(list.map(function (c) { return execOne(c.name, c.args, r); }));
        parallelBatches++;
        phases.push({ phase: "act_parallel_calls", round: r, count: list.length });
      } else {
        execs = [];
        for (var j = 0; j < list.length; j++) {
          execs.push(await execOne(list[j].name, list[j].args, r));
        }
      }
      feedBatch(list, execs, r, "act_round");

      /* 5) 反思：最多一次，避免每次提问都多花一轮模型调用 */
      if (reflectionsDone < MAX_REFLECT && r < maxRounds) {
        var brief = execs.map(function (x, i) {
          return { name: list[i].name, ok: !!(x.got && x.got.ok),
                   note: (x.got && (x.got.note || x.got.error)) || "" };
        });
        var refl = await reflectOnce(q, brief, cfg, names, r);
        reflectionsDone++;
        if (refl) {
          refl.round = r;
          reflections.push(refl);
          phases.push({ phase: "reflect", round: r, enough: refl.enough,
                        gaps: refl.gaps, next_tool: refl.next_tool,
                        confidence: refl.confidence, source: refl.source });
          if (!refl.enough && refl.next_tool !== "none" && calls < MAX_CALLS) {
            var args = (refl.next_args && Object.keys(refl.next_args).length)
              ? refl.next_args : argsFor(refl.next_tool, q);
            var extra = await execOne(refl.next_tool, args, r);
            var one = [{ id: "call_reflect_" + r, name: refl.next_tool, args: args }];
            feedBatch(one, [extra], r, "reflect_followup");
          } else if (refl.enough) {
            messages.push({ role: "user", content: "资料已经足够，请直接回答我最初的问题，不要再查了。" });
          }
        }
      }
    }

    if (rounds >= maxRounds && !String(lastText || "").trim()) capped = true;

    /* 轮次用尽仍无正文：不带工具再逼一次 */
    if (!String(lastText || "").trim()) {
      var fin = await post("/api/agent", {
        messages: messages.concat([{ role: "user",
          content: "资料就查到这儿。请直接根据上面查到的东西回答我最初的问题，不要再查了。" }]),
        temperature: 0.3, ms: opt.ms || 26000
      }, opt.ms || 26000, opt.onDelta).catch(function () { return null; });
      if (fin && fin.ok) { lastText = fin.text || ""; model = fin.model || model; capped = true; }
    }
    if (!String(lastText || "").trim()) {
      return { ok: false, error: "AI 没能给出回答", plan: plan, phases: phases,
               trace: trace, citations: citeBag.all, ms: Date.now() - t0 };
    }

    /* 6) 输出过滤：悬空引用、无依据硬数字、敏感内容与内部措辞 */
    var text = lastText;
    if (cfg.features.output_guard && W.WJSafety) {
      var ev = citeBag.all.map(function (c) { return c.snippet; }).join(" ");
      var go = W.WJSafety.checkOutput(text, {
        refs: citeBag.all.map(function (c) { return c.ref; }),
        evidenceText: ev
      });
      guard.output = { action: go.action || "pass", rules: go.rules,
                       dangling: go.dangling, unsupported: go.unsupported };
      text = go.text;
      if (go.rules.length) phases.push({ phase: "guard_output", rules: go.rules });
    }

    /* 统计要在所有工具跑完之后再取，开头那份快照的 remoteCalls 还是 0 */
    var finalMcp = mcp() ? mcp().status() : { connected: false };
    return {
      ok: true, text: text, rounds: rounds, toolsUsed: used, model: model,
      trace: trace, ms: Date.now() - t0, capped: capped,
      plan: plan, phases: phases, reflections: reflections,
      citations: citeBag.all, guard: guard,
      prompt_version: cfg.prompt_version,
      features: cfg.features,
      mcp: { connected: finalMcp.connected, endpoint: finalMcp.endpoint,
             toolCount: finalMcp.toolCount, transport: finalMcp.transport,
             remoteCalls: finalMcp.remoteCalls, fallbackCalls: finalMcp.fallbackCalls },
      parallelBatches: parallelBatches
    };
  }

  /* 不联网的工具层自检 + 协议自检分离，避免自检把页面拖慢 */
  function selfTest() {
    var c = mcp();
    var t = localTools();
    var cases = [
      ["hybrid_search", { query: "长信宫灯排烟", top_k: 3 }],
      ["search_relic", { keyword: "长信宫灯" }],
      ["get_relic", { name: "长信宫灯" }],
      ["compare_relics", { a: "长信宫灯", b: "雁鱼灯" }],
      ["lookup_craft", { name: "失蜡法" }],
      ["check_misconception", { name: "青铜鼎" }],
      ["list_collection", { material: "青铜器", limit: 5 }]
    ];
    return Promise.all(cases.map(function (x) {
      var p = (c && c.status().connected) ? c.call(x[0], x[1])
            : (t ? t.call(x[0], x[1]) : Promise.resolve({ ok: false }));
      return p.then(function (r) { return { tool: x[0], ok: !!(r && r.ok),
                                            note: (r && (r.note || r.error)) || "" }; });
    })).then(function (items) {
      return { ok: items.every(function (i) { return i.ok; }),
               passed: items.filter(function (i) { return i.ok; }).length,
               total: items.length, items: items };
    });
  }

  W.WJAgent = {
    version: "agent2",
    ask: ask,
    selfTest: selfTest,
    toolNames: toolNames,
    limits: { maxRounds: MAX_ROUNDS, maxCalls: MAX_CALLS, maxReflect: MAX_REFLECT },
    config: function () { return cfgFor({}); }
  };
})();
