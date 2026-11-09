/* =========================================================
   文物精灵 · 知识图谱（多跳关系推理）
   ---------------------------------------------------------
   为什么单独一个文件：
     RAG 检索是「按关键词把相关档案捞出来」，回答的是「这件文物是
     什么」；但回答不了「这件鼎和那件簋什么关联」「同一墓葬还出土了
     哪些」。后者需要把文物之间的「关系」显式建模成图，让 Agent 沿
     边做多跳推理——这是纯检索做不到的，也是 RAG 之上的进阶能力。

   关系数据原则：
     1) 只写能落到 data.js 档案 / 公认史实上的关系，不编造；
     2) 同墓 / 同遗址关系以 data.js 里 intro、history 的出土信息为准；
     3) 同朝代 / 同材质 / 同属性 / 同站 由 SPIRITS 字段自动推导，
        不手写，保证与图鉴数据一致、不会漂移。

   对外能力（window.GRAPH）：
     - GRAPH.build()        从 SPIRITS 构建节点 + 自动关系 + 手工关系
     - GRAPH.neighbors(id)  一级邻居（按关系类型分组）
     - GRAPH.path(a, b)     BFS 最短关系路径（多跳）
     - GRAPH.sameTomb(id)   同墓出土清单
     - GRAPH.sameSite(id)   同遗址清单
     - GRAPH.query(q)       意图识别 → 分发到上面某一种查询
   ========================================================= */
(function () {
  "use strict";

  /* ---------- 手工关系：真实同墓 / 同遗址（依据 data.js 出土信息） ---------- */
  /* 结构：{ type, nodes: [sid...], label, note } */
  var MANUAL = [
    /* —— 同墓出土（真实考古同坑，依据 data.js intro 明示） —— */
    { type: "tomb", label: "邢台南和左村汉墓（1976）", nodes: ["cuojinhu", "wenlu", "liujinlu"], note: "三件 intro 均明示「1976 年出土于邢台南和左村汉墓」" },
    { type: "tomb", label: "战国中山王厝墓（平山三汲）", nodes: ["tiezuding", "lianzhandeng", "longfengfan", "hushilu"], note: "四件 era 均标注「中山王墓 / 中山王厝墓」" },
    { type: "tomb", label: "满城汉墓（刘胜墓，1968）", nodes: ["jinyuyi", "changxin"], note: "刘胜金缕玉衣、长信宫灯同出满城汉墓（见「刘胜」relicName 与公认史实）" },

    /* —— 同遗址出土 —— */
    { type: "site", label: "崇礼太子城遗址（金代行宫）", nodes: ["tongzuolong"], note: "金代铜坐龙出土于太子城" },

    /* —— 同属「战国中山国」文化（中山王厝墓诸器皆属） —— */
    { type: "culture", label: "战国中山国", nodes: ["tiezuding", "lianzhandeng", "longfengfan", "hushilu"], note: "中山国，白狄鲜虞部所建，都灵寿（今平山三汲），厝墓出土诸器皆属之" }
  ];

  /* ---------- 自动关系推导（从 SPIRITS 字段） ---------- */
  /* era 归一：抽朝代，用于「同时代」关系 */
  function dynastyOf(era) {
    var e = String(era || "");
    var dyn = ["夏", "商", "西周", "东周", "春秋", "战国", "秦", "西汉", "东汉", "三国", "西晋", "东晋", "南北朝", "隋", "唐", "五代", "宋", "辽", "金", "元", "明", "清"];
    for (var i = 0; i < dyn.length; i++) if (e.indexOf(dyn[i]) >= 0) return dyn[i];
    return e || "待考";
  }

  var graph = null;

  function build() {
    if (graph) return graph;
    var S = (typeof window !== "undefined" && window.SPIRITS) || (typeof SPIRITS !== "undefined" ? SPIRITS : null);
    if (!S) return null;

    var nodes = {};   // sid -> { id, name, era, dynasty, primary, secondary, station }
    var edges = [];   // { a, b, type, label }
    var tomb = {};    // sid -> label（同墓）
    var site = {};    // sid -> label（同遗址）

    // 1) 节点 + 站点归属（站信息从 STATIONS.spiritIds 反查）
    var spiritToStation = {};
    var ST = (typeof window !== "undefined" && window.STATIONS) || (typeof STATIONS !== "undefined" ? STATIONS : null);
    if (ST) {
      (Array.isArray(ST) ? ST : Object.keys(ST).map(function (k) { return ST[k]; })).forEach(function (st) {
        (st.spiritIds || []).forEach(function (sid) { spiritToStation[sid] = st.name || st.id; });
      });
    }

    Object.keys(S).forEach(function (sid) {
      var s = S[sid];
      nodes[sid] = {
        id: sid, name: s.name || sid, era: s.era || "", dynasty: dynastyOf(s.era),
        primary: s.primary || "", secondary: s.secondary || "", station: spiritToStation[sid] || ""
      };
    });

    // 2) 手工关系 → 边 + 同墓/同遗址索引
    MANUAL.forEach(function (g) {
      for (var i = 0; i < g.nodes.length; i++) {
        for (var j = i + 1; j < g.nodes.length; j++) {
          var a = g.nodes[i], b = g.nodes[j];
          if (!nodes[a] || !nodes[b]) continue;
          edges.push({ a: a, b: b, type: g.type, label: g.label, note: g.note });
        }
        if (g.type === "tomb") tomb[g.nodes[i]] = g.label;
        if (g.type === "site") site[g.nodes[i]] = g.label;
      }
    });

    // 3) 自动关系：同朝代 / 同材质 / 同属性 / 同站
    var byDyn = {}, byPri = {}, bySec = {}, bySta = {};
    Object.keys(nodes).forEach(function (sid) {
      var n = nodes[sid];
      if (n.dynasty && n.dynasty !== "待考") { (byDyn[n.dynasty] = byDyn[n.dynasty] || []).push(sid); }
      if (n.primary) { (byPri[n.primary] = byPri[n.primary] || []).push(sid); }
      if (n.secondary) { (bySec[n.secondary] = bySec[n.secondary] || []).push(sid); }
      if (n.station) { (bySta[n.station] = bySta[n.station] || []).push(sid); }
    });

    function link(group, type, groupBy) {
      Object.keys(group).forEach(function (key) {
        var arr = group[key];
        for (var i = 0; i < arr.length; i++) for (var j = i + 1; j < arr.length; j++) {
          edges.push({ a: arr[i], b: arr[j], type: type, label: key });
        }
      });
    }
    link(byDyn, "dynasty");
    link(byPri, "primary");
    link(bySec, "secondary");
    link(bySta, "station");

    // 4) 邻接表
    var adj = {};   // sid -> [{to, type, label, note}]
    edges.forEach(function (e) {
      (adj[e.a] = adj[e.a] || []).push({ to: e.b, type: e.type, label: e.label, note: e.note });
      (adj[e.b] = adj[e.b] || []).push({ to: e.a, type: e.type, label: e.label, note: e.note });
    });

    graph = { nodes: nodes, edges: edges, adj: adj, tomb: tomb, site: site, built: new Date().toISOString() };
    return graph;
  }

  /* ---------- 查询 ---------- */

  /* 核心名称：去掉「中山王」「商代」「西汉」等前缀修饰，便于简称匹配 */
  function coreName(name) {
    var n = String(name || "");
    return n.replace(/^(商代|西周|东周|战国|西汉|东汉|秦|汉|唐|宋|元|明|清|金|辽|南北朝|中山王|错金银|鎏金|彩绘|青花)/, "").trim();
  }

  /* 按 id 或名称找 sid（支持别名 / 简称模糊匹配） */
  function resolve(q) {
    build();
    var target = String(q || "").trim();
    if (!target) return null;
    // 直接 id 命中
    if (graph.nodes[target]) return target;
    // 名称精确命中
    var exact = null, partial = [];
    var best = null, bestScore = 0;
    var ids = Object.keys(graph.nodes);
    for (var i = 0; i < ids.length; i++) {
      var sid = ids[i];
      var n = graph.nodes[sid];
      var core = coreName(n.name);
      if (n.name === target || core === target) { exact = sid; break; }
      if (n.name.indexOf(target) >= 0 || target.indexOf(n.name) >= 0 ||
          core.indexOf(target) >= 0 || target.indexOf(core) >= 0) { partial.push(sid); continue; }
      // 字符重叠度兜底（「十五连盏灯」→「十五连盏铜灯」）
      var ov = overlap(core, target);
      if (ov > bestScore) { bestScore = ov; best = sid; }
    }
    if (exact) return exact;
    if (partial.length) return partial[0];
    // 重叠度阈值：目标至少 2 字、覆盖目标 60% 以上
    if (best && bestScore >= 2 && bestScore >= target.length * 0.6) return best;
    return null;
  }

  /* 两串的公共字符数（忽略「的」「之」等虚词），用于简称兜底 */
  function overlap(a, b) {
    var sa = String(a || ""), sb = String(b || "");
    var set = Object.create(null), i, n = 0;
    for (i = 0; i < sa.length; i++) set[sa[i]] = 1;
    for (i = 0; i < sb.length; i++) if (set[sb[i]]) n++;
    return n;
  }

  /* 按墓葬/遗址 label 反查同坑文物（「南和左村汉墓出土了哪些」） */
  function resolveTomb(label) {
    build();
    var t = String(label || "").trim();
    if (!t) return null;
    var hit = null;
    var keys = Object.keys(graph.tomb);
    for (var i = 0; i < keys.length; i++) {
      var lb = graph.tomb[keys[i]];
      if (lb.indexOf(t) >= 0 || t.indexOf(lb) >= 0) { hit = lb; break; }
    }
    if (!hit) {
      var bestScore = 0;
      for (var j = 0; j < keys.length; j++) {
        var lb2 = graph.tomb[keys[j]];
        var ov = overlap(lb2, t);
        if (ov > bestScore) { bestScore = ov; hit = lb2; }
      }
      if (hit && bestScore < t.length * 0.5) hit = null;
    }
    // 也搜 site
    if (!hit) {
      var sk = Object.keys(graph.site);
      for (var k = 0; k < sk.length; k++) {
        var sl = graph.site[sk[k]];
        if (sl.indexOf(t) >= 0 || t.indexOf(sl) >= 0) { hit = sl; break; }
      }
    }
    return hit;
  }

  function nameOf(sid) {
    build();
    return graph.nodes[sid] ? graph.nodes[sid].name : sid;
  }

  /* 一级邻居，按关系类型分组 */
  function neighbors(sid) {
    build();
    sid = resolve(sid) || sid;
    if (!graph.nodes[sid]) return { id: sid, found: false, groups: [] };
    var g = graph.adj[sid] || [];
    var byType = {};
    g.forEach(function (e) {
      (byType[e.type] = byType[e.type] || {})[e.to] = e;
    });
    var TYPE_CN = { tomb: "同墓出土", site: "同遗址", culture: "同文化", dynasty: "同时代", primary: "同材质", secondary: "同用途", station: "同站收藏" };
    var groups = Object.keys(byType).map(function (t) {
      return {
        type: t, cn: TYPE_CN[t] || t,
        items: Object.keys(byType[t]).map(function (to) { return { sid: to, name: nameOf(to), label: byType[t][to].label }; })
      };
    });
    // 排序：同墓/同遗址/同文化在前（更强的关联）
    var order = { tomb: 0, site: 1, culture: 2, dynasty: 3, primary: 4, secondary: 5, station: 6 };
    groups.sort(function (a, b) { return (order[a.type] || 9) - (order[b.type] || 9); });
    return { id: sid, name: nameOf(sid), found: true, groups: groups };
  }

  /* BFS 最短路径（多跳），返回路径节点 + 每一步的关系 */
  function path(a, b) {
    build();
    var sa = resolve(a), sb = resolve(b);
    if (!sa || !sb) return { found: false, reason: "文物未找到" };
    if (sa === sb) return { found: true, dist: 0, nodes: [sa] };
    var q = [sa], prev = {}; prev[sa] = null;
    var edgeTo = {}; // sid -> {from, type, label}
    var visited = { sa: true };
    while (q.length) {
      var cur = q.shift();
      var ns = graph.adj[cur] || [];
      for (var i = 0; i < ns.length; i++) {
        var nx = ns[i];
        if (visited[nx.to]) continue;
        visited[nx.to] = true;
        prev[nx.to] = cur;
        edgeTo[nx.to] = { from: cur, type: nx.type, label: nx.label };
        if (nx.to === sb) {
          // 回溯路径
          var pathNodes = [], pathEdges = [], p = sb;
          while (p != null) {
            pathNodes.unshift(p);
            if (prev[p] != null) pathEdges.unshift(edgeTo[p]);
            p = prev[p];
          }
          return { found: true, dist: pathNodes.length - 1, nodes: pathNodes.map(nameOf), edges: pathEdges };
        }
        q.push(nx.to);
      }
    }
    return { found: false, reason: "两者无关联路径" };
  }

  /* 同墓出土清单 */
  function sameTomb(sid) {
    build();
    var sa = resolve(sid);
    if (!sa || !graph.tomb[sa]) return { found: false, reason: nameOf(sid) + "无同墓记录" };
    var label = graph.tomb[sa];
    var mates = [];
    Object.keys(graph.tomb).forEach(function (s2) {
      if (graph.tomb[s2] === label && s2 !== sa) mates.push({ sid: s2, name: nameOf(s2) });
    });
    return { found: true, id: sa, name: nameOf(sa), tomb: label, mates: mates };
  }

  /* 同遗址清单 */
  function sameSite(sid) {
    build();
    var sa = resolve(sid);
    if (!sa || !graph.site[sa]) return { found: false, reason: nameOf(sid) + "无同遗址记录" };
    var label = graph.site[sa];
    var mates = [];
    Object.keys(graph.site).forEach(function (s2) {
      if (graph.site[s2] === label && s2 !== sa) mates.push({ sid: s2, name: nameOf(s2) });
    });
    return { found: true, id: sa, name: nameOf(sa), site: label, mates: mates };
  }

  /* 意图识别 + 分发 */
  function query(q) {
    var t = String(q || "");
    var m;

    // 「X 和 Y 什么关联 / 什么关系」（先于其他判断）
    if ((m = t.match(/^(.+?)(?:和|与|跟)(.+?)(?:有?什么|啥|有)关(?:系|联)|^(.+?)(?:和|与|跟)(.+?)(?:什么|啥)(?:关系|关联)/))) {
      var a = (m[1] || m[3] || "").trim(), b = (m[2] || m[4] || "").trim();
      if (a && b && resolve(a) && resolve(b)) return { kind: "path", result: path(a, b) };
    }

    // 「XX墓/遗址 出土了哪些」→ 按墓名反查（墓名不是文物名，先试 tomb/site 反查）
    if (/出土了哪些|出土了啥|出了哪些|还出土了什么|出土了什么/.test(t)) {
      var m2 = t.replace(/出土了哪些|出土了啥|出了哪些|还出土了什么|出土了什么|出土|了|哪些|什么|啥|还有|有/g, "").replace(/的文物|文物|器物|东西/g, "").trim();
      if (m2) {
        var tl = resolveTomb(m2);
        if (tl) return { kind: "tombByLabel", result: tombMembers(tl) };
        // 若是文物名，转同墓查询
        var sid = resolve(m2);
        if (sid) return { kind: "sameTomb", result: sameTomb(sid) };
      }
    }

    // 「X 同一墓出土了哪些 / X 同墓」
    if (/同墓|同一墓|一个墓/.test(t)) {
      var sid2 = t.replace(/同墓|同一墓|一个墓|出土了哪些|出土了啥|哪些文物|哪些器物|还有谁/g, "").replace(/什么|啥/g, "").trim();
      if (sid2) { var r = sameTomb(sid2); if (r.found) return { kind: "sameTomb", result: r }; }
    }

    // 「X 同遗址 / 一起出土 / 同坑」
    if (/同遗址|同一遗址|一起出土|同坑/.test(t)) {
      var s2 = t.replace(/同遗址|同一遗址|一起出土|同坑/g, "").trim();
      if (s2) { var r2 = sameSite(s2); if (r2.found) return { kind: "sameSite", result: r2 }; }
    }

    // 「X 有什么关联 / X 关联了谁」→ 邻居
    var s3 = t.replace(/有什么关联|有关联|关联了谁|和谁有关|有哪些关联|关联|邻居|的邻居/g, "").trim();
    if (s3) {
      var ns = neighbors(s3);
      if (ns.found) return { kind: "neighbors", result: ns };
    }

    return { kind: "unknown", result: { found: false, reason: "未识别出关系查询意图" } };
  }

  /* 按墓 label 列出全部成员 */
  function tombMembers(label) {
    build();
    var members = [];
    Object.keys(graph.tomb).forEach(function (sid) {
      if (graph.tomb[sid] === label) members.push({ sid: sid, name: nameOf(sid) });
    });
    return { found: members.length > 0, tomb: label, members: members };
  }

  /* 图统计（答辩/README 用） */
  function stats() {
    build();
    var e = graph.edges.length, n = Object.keys(graph.nodes).length;
    var typeCount = {};
    graph.edges.forEach(function (x) { typeCount[x.type] = (typeCount[x.type] || 0) + 1; });
    return { nodes: n, edges: e, edgeTypes: typeCount, tombs: Object.keys(graph.tomb).length };
  }

  window.GRAPH = {
    build: build, resolve: resolve, neighbors: neighbors, path: path,
    sameTomb: sameTomb, sameSite: sameSite, query: query, stats: stats,
    resolveTomb: resolveTomb, tombMembers: tombMembers
  };
})();
