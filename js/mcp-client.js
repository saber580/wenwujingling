/* =========================================================
   文物精灵 · MCP Client（浏览器侧）
   ---------------------------------------------------------
   和「只是把工具定义写成 MCP 字段名」的区别：

     之前：js/tools.js 在页面里自己执行 6 个工具，MCP 只是命名风格。
     现在：页面先向 /mcp 发 initialize 真正握手，拿 Mcp-Session-Id，
           再用 tools/list 从服务端发现工具清单，用 tools/call 让
           服务端执行检索。工具在哪儿跑、跑的是什么，由 server 说了算。
           换 CLI 或别的 Agent 连同一个 server，拿到的是同一套能力。

   两套传输都实现并自检：
     · Streamable HTTP  POST /mcp                    （2025-03-26，默认）
     · HTTP + SSE       GET /mcp/sse + POST /mcp/messages（2024-11-05）

   可靠性：连不上就静默回落到页面内的 WJTools，问答不会因此哑掉。
   状态里如实记录 connected / fallback，界面与消融实验都能看见。
   ========================================================= */
(function () {
  "use strict";
  var W = (typeof window !== "undefined") ? window : globalThis;

  var PROTOCOL = "2025-03-26";
  var TIMEOUT = 9000;
  var PROBE_TIMEOUT = 2200;

  var state = {
    connected: false,
    endpoint: "",
    sessionId: "",
    protocolVersion: "",
    serverInfo: null,
    tools: [],
    instructions: "",
    sse: { open: false, endpoint: "", messages: 0, sessionId: "" },
    lastError: "",
    handshakes: 0,
    calls: 0,
    remoteCalls: 0,
    fallbackCalls: 0
  };

  function localTools() {
    return W.WJTools || (typeof WJTools !== "undefined" ? WJTools : null);
  }

  /* 端点候选：先同域，再本机常见端口。
     file:// 双击打开时同域相对路径必然失败，会自动落到 8898 小桥。 */
  function candidates() {
    var out = [];
    try {
      if (location.protocol === "http:" || location.protocol === "https:") out.push("/mcp");
    } catch (e) {}
    ["http://127.0.0.1:8898", "http://127.0.0.1:8080", "http://127.0.0.1:8000",
     "http://localhost:8898"].forEach(function (h) { out.push(h + "/mcp"); });
    var seen = {};
    return out.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("请求超时"));
      }, ms);
      p.then(function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
             function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    });
  }

  var seq = 0;
  function nextId() { return ++seq; }

  /* 发一条 JSON-RPC；通知（无 id）不期待响应体 */
  function rawRPC(endpoint, body, sid, ms) {
    var headers = { "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream" };
    if (sid) headers["Mcp-Session-Id"] = sid;
    if (body.method === "initialize") headers["MCP-Protocol-Version"] = PROTOCOL;
    return withTimeout(fetch(endpoint, {
      method: "POST", headers: headers, body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok && r.status !== 202) throw new Error("MCP HTTP " + r.status);
      var sid2 = r.headers.get("Mcp-Session-Id") || sid || "";
      var txt = r.text();
      return txt.then(function (t) {
        return { status: r.status, sessionId: sid2,
                 data: t ? JSON.parse(t) : null };
      });
    }), ms || TIMEOUT);
  }

  function rpc(method, params, opt) {
    opt = opt || {};
    var ep = opt.endpoint || state.endpoint;
    var body = { jsonrpc: "2.0", method: method };
    if (params !== undefined) body.params = params;
    if (!opt.notification) body.id = nextId();
    return rawRPC(ep, body, opt.sid !== undefined ? opt.sid : state.sessionId, opt.ms)
      .then(function (r) {
        if (r.sessionId && !state.sessionId) state.sessionId = r.sessionId;
        if (opt.notification) return { ok: true, status: r.status };
        if (r.data && r.data.error) {
          var e = new Error(r.data.error.message || "MCP 错误");
          e.code = r.data.error.code;
          throw e;
        }
        return { ok: true, result: (r.data && r.data.result) || {}, sessionId: r.sessionId };
      });
  }

  /* ---------- 握手：initialize → initialized 通知 → tools/list ---------- */
  var _connectPromise = null;
  function connect(opt) {
    opt = opt || {};
    if (state.connected && !opt.force) return Promise.resolve(status());
    if (_connectPromise) return _connectPromise;
    var list = opt.endpoint ? [opt.endpoint] : candidates();
    var attempt = function (i) {
      if (i >= list.length) {
        state.connected = false;
        state.lastError = "所有 MCP 端点都不可用";
        _connectPromise = null;
        return Promise.resolve(status());
      }
      var ep = list[i];
      return rpc("initialize", {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "wenwujingling-web", version: "1.0" }
      }, { endpoint: ep, sid: "", ms: opt.probeMs || PROBE_TIMEOUT })
        .then(function (r) {
          state.endpoint = ep;
          state.connected = true;
          state.sessionId = r.sessionId || "";
          state.protocolVersion = r.result.protocolVersion || PROTOCOL;
          state.serverInfo = r.result.serverInfo || null;
          state.instructions = r.result.instructions || "";
          state.handshakes++;
          /* 协议规定：initialized 通知不带 id，服务端不能回包 */
          return rpc("notifications/initialized", {}, { notification: true })
            .catch(function () { return null; });
        })
        .then(function () { return rpc("tools/list", {}); })
        .then(function (r) {
          state.tools = r.result.tools || [];
          state.lastError = "";
          return status();
        })
        .catch(function (e) {
          state.lastError = ep + " → " + String((e && e.message) || e);
          state.sessionId = "";
          state.connected = false;
          return attempt(i + 1);
        });
    };
    _connectPromise = attempt(0).then(function (s) {
      _connectPromise = null;
      return s;
    }, function (e) {
      _connectPromise = null;
      throw e;
    });
    return _connectPromise;
  }

  /* ---------- 工具调用：优先服务端，失败才回落页面内实现 ---------- */
  function call(name, args, opt) {
    opt = opt || {};
    state.calls++;
    if (!state.connected || !state.tools.length) {
      state.fallbackCalls++;
      return fallback(name, args, "MCP 未连接");
    }
    var has = state.tools.some(function (t) { return t.name === name; });
    if (!has) {
      state.fallbackCalls++;
      return fallback(name, args, "服务端没有这个工具");
    }
    return rpc("tools/call", { name: name, arguments: args || {} }, { ms: opt.ms || 15000 })
      .then(function (r) {
        state.remoteCalls++;
        var sc = r.result.structuredContent || {};
        if (sc.ok === false) return { ok: false, error: sc.error || "服务端工具报错", _mcp: true };
        return { ok: true, data: sc.data, note: sc.note || "", _mcp: true };
      })
      .catch(function (e) {
        // 单条调用失败不该拖垮整轮问答：退到页面内工具，但记下来
        state.fallbackCalls++;
        return fallback(name, args, String((e && e.message) || e));
      });
  }

  function fallback(name, args, why) {
    var t = localTools();
    if (!t) return Promise.resolve({ ok: false, error: why + "，且页面内工具层未加载" });
    if (t.has && !t.has(name)) return Promise.resolve({ ok: false, error: "没有名为 " + name + " 的工具" });
    return t.call(name, args);
  }

  /* ---------- 把服务端发现的清单转成 OpenAI Function Calling 形状 ---------- */
  function openaiTools() {
    var src = state.connected && state.tools.length
      ? state.tools
      : ((function () { var t = localTools(); return t ? t.list() : []; })());
    return src.map(function (t) {
      var sc = t.inputSchema || t.parameters || { type: "object", properties: {} };
      return { type: "function", function: {
        name: t.name, description: t.description || "", parameters: sc
      } };
    });
  }

  /* ---------- 旧版 HTTP+SSE 传输：建立通道并验证能收消息 ---------- */
  function openSSE(opt) {
    opt = opt || {};
    if (typeof EventSource === "undefined") {
      return Promise.resolve({ ok: false, error: "浏览器不支持 EventSource" });
    }
    var base = state.endpoint ? state.endpoint.replace(/\/mcp$/, "") : "http://127.0.0.1:8898";
    var url = base + "/mcp/sse";
    return new Promise(function (resolve) {
      var settled = false, es;
      function finish(o) {
        if (settled) return;
        settled = true;
        resolve(o);
      }
      try { es = new EventSource(url); }
      catch (e) { return finish({ ok: false, error: String(e) }); }

      var timer = setTimeout(function () {
        finish({ ok: state.sse.open, endpoint: state.sse.endpoint,
                 messages: state.sse.messages, timeout: !state.sse.open });
      }, opt.ms || 5000);

      es.addEventListener("endpoint", function (ev) {
        state.sse.open = true;
        state.sse.endpoint = ev.data;
        var m = String(ev.data || "").match(/sessionId=([^&\s]+)/);
        state.sse.sessionId = m ? m[1] : "";
        clearTimeout(timer);
        finish({ ok: true, endpoint: ev.data, sessionId: state.sse.sessionId });
      });
      es.addEventListener("message", function () { state.sse.messages++; });
      es.onerror = function () {
        state.sse.open = false;
        clearTimeout(timer);
        finish({ ok: false, error: "SSE 连接失败或已关闭" });
      };
      W.__wjMCPEventSource = es;
    });
  }

  /* 用完必须关：EventSource 是长连接，不关会让页面/无头浏览器一直挂着 */
  function closeSSE() {
    try { if (W.__wjMCPEventSource) W.__wjMCPEventSource.close(); } catch (e) {}
    W.__wjMCPEventSource = null;
    state.sse.open = false;
  }

  /* 走 SSE 通道发一条消息：POST /mcp/messages，响应从 EventSource 回来。
     这里只验证协议通路，实际问答仍用 Streamable HTTP（更省一次连接）。 */
  function callViaSSE(name, args) {
    if (!state.sse.open || !state.sse.endpoint) {
      return Promise.resolve({ ok: false, error: "SSE 通道未建立" });
    }
    var body = { jsonrpc: "2.0", method: "tools/call", id: nextId(),
                 params: { name: name, arguments: args || {} } };
    var base = state.endpoint ? state.endpoint.replace(/\/mcp$/, "") : "http://127.0.0.1:8898";
    var before = state.sse.messages;
    return withTimeout(fetch(base + state.sse.endpoint.replace(/^https?:\/\/[^/]+/, ""), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.status !== 202) throw new Error("HTTP " + r.status);
      return new Promise(function (resolve) {
        var n = 0;
        var iv = setInterval(function () {
          if (state.sse.messages > before || ++n > 30) {
            clearInterval(iv);
            resolve({ ok: state.sse.messages > before, delivered: state.sse.messages - before });
          }
        }, 100);
      });
    }), 8000).catch(function (e) {
      return { ok: false, error: String((e && e.message) || e) };
    });
  }

  function status() {
    return {
      connected: state.connected,
      endpoint: state.endpoint,
      sessionId: state.sessionId,
      protocolVersion: state.protocolVersion,
      serverInfo: state.serverInfo,
      tools: state.tools.map(function (t) { return t.name; }),
      toolCount: state.tools.length,
      transport: state.connected ? "streamable-http" : "local-fallback",
      sse: { open: state.sse.open, endpoint: state.sse.endpoint, messages: state.sse.messages },
      calls: state.calls, remoteCalls: state.remoteCalls, fallbackCalls: state.fallbackCalls,
      lastError: state.lastError
    };
  }

  /* 不联网也能跑的部分 + 联网自检，给「协议一致性」面板用 */
  function selfTest(opt) {
    opt = opt || {};
    var out = { connected: false, checks: [] };
    function add(n, ok, d) { out.checks.push({ name: n, ok: !!ok, detail: d || "" }); }
    return connect().then(function (st) {
      out.connected = st.connected;
      out.status = st;
      add("initialize 握手", st.connected, st.serverInfo && st.serverInfo.name);
      add("Mcp-Session-Id", !!st.sessionId, st.sessionId);
      add("tools/list 服务端发现", st.toolCount >= 8, st.toolCount + " 个工具");
      if (st.connected) {
        return rpc("ping", {        }).then(function (r) {
          add("ping", r.ok);
          return call("get_relic", { name: "长信宫灯" });
        }).then(function (r) {
          add("tools/call 远程执行", !!(r && r.ok && r._mcp), r && r.note);
          if (opt.skipSSE) {
            add("HTTP+SSE 通道", true, "由 tools/check_mcp.py 第 7 节验证");
            return { skipped: true };
          }
          return openSSE({ ms: 4000 });
        }).then(function (s) {
          if (s.skipped) return { skipped: true };
          add("HTTP+SSE 通道", s.ok, s.endpoint);
          return s.ok ? callViaSSE("lookup_craft", { name: "失蜡法" }) : { ok: false };
        }).then(function (s) {
          if (s.skipped) return;
          add("SSE 消息回传", s.ok, s.delivered != null ? "收到 " + s.delivered + " 条" : s.error);
          closeSSE();               // 自检完就关，别把长连接留在页面上
        });
      }
    }).then(function () {
      out.passed = out.checks.filter(function (c) { return c.ok; }).length;
      out.total = out.checks.length;
      return out;
    }).catch(function (e) {
      out.error = String((e && e.message) || e);
      return out;
    });
  }

  W.WJMCP = {
    version: "mcp-client-1.0",
    connect: connect,
    rpc: rpc,
    call: call,
    openaiTools: openaiTools,
    openSSE: openSSE,
    closeSSE: closeSSE,
    callViaSSE: callViaSSE,
    status: status,
    selfTest: selfTest,
    listResources: function () { return rpc("resources/list", {}); },
    readResource: function (uri) { return rpc("resources/read", { uri: uri }); },
    listPrompts: function () { return rpc("prompts/list", {}); },
    getPrompt: function (n, a) { return rpc("prompts/get", { name: n, arguments: a || {} }); },
    close: function () {
      if (state.connected && state.sessionId) {
        try {
          fetch(state.endpoint, { method: "DELETE",
            headers: { "Mcp-Session-Id": state.sessionId } });
        } catch (e) {}
      }
    }
  };
})();
