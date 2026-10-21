/* =========================================================
   文物精灵 · 云端 AI 适配层（替代本机小桥 tools/ident_cloud.py）

   站点上线后，页面不再连本机 8898 端口，而是直接调云端大模型：
     · 账号登录   —— 站点内置账号（邮箱 + 密码哈希），不依赖任何本机服务
     · AI 识别    —— 云端多模态模型看图，返回名称/年代/材质/来历
     · 精灵茶话会 —— 云端大模型现场写每一幕对白
     · AI 幻化    —— 云端不出图，自动回退页面自带的艺术化效果

   本文件在 app.js 之后加载，接管 identFetchCloud()，
   于是 app.js / guide.js 里所有 /api/* 调用原样工作，无需改动调用方。
   ========================================================= */
(function () {
  "use strict";

  /* ---------- 云端配置（publicConfig，可公开，权限由服务端按域名校验） ---------- */
  var CFG = {
    endpoint: "https://relic-spirit.app.workbuddy.host",
    oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
    publishableKey: "wbpk_EmA5VK2VcIUoBzfFI6Zacw_F1K3gdiinbg22xd0OTLtOuN32jy1A4wX"
  };

  /* ---------- 内置账号：邮箱 → 允许的密码哈希（FNV-1a 加盐，非加密，只作演示级校验） ----------
     演示账号写在 .env.example（DEMO_EMAIL），口令由部署方设定后把哈希填到下面：
       node -e "..." 或页面控制台执行 hashPass(salt, 口令) 取前 8 位
     安全约定：源码与仓库里一律不出现明文口令。 */
  var ACCOUNTS = {
    "2502887269@qq.com": ["b6f0ed74", "cf143c42"],
    "2502887259@qq.com": ["b6f0ed74", "cf143c42"]   /* 少一位的写法也认，免得再登不进去 */
  };
  var SALT = "wwjl";

  var SYS = "你是「文物精灵」App 里的国风文物助手。用简洁、典雅、准确的中文回答，" +
            "只谈中国文物、历史、博物馆与传统文化；不确定的就说不知道，不要编造。";

  var IDENT_PROMPT =
    "你是「文物精灵」App 里的中国文物鉴定助手。请根据这张照片识别文物(只认中国文物)," +
    "只输出一个 JSON 对象(不要代码块、不要多余文字):" +
    '{"name":"名称(常见别名放括号里)","era":"年代(朝代+大致公元;拿不准用「约」)",' +
    '"material":"材质类别(如 青铜器 / 白瓷 / 玉器 / 石刻 / 书画 / 陶器)",' +
    '"origin":"出土或收藏出处(不确定写「待考」,不编造)",' +
    '"history":"来历与历史 90~160 字:它是什么、哪个朝代、为什么重要、有什么故事",' +
    '"feature":"一眼看点:教参观者该看什么(一句话)","confidence":"高/中/低"}' +
    "。若照片里明显不是文物,name 写「未识别到文物」,并在 history 里说明看到了什么。";

  var cloud = null, booting = null, MODEL_CACHE = null;

  function hashPwd(pwd) {
    var h = 0x811c9dc5 >>> 0;
    var s = SALT + "|" + String(pwd || "");
    for (var i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) >>> 0; h = (h * 16777619) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function boot() {
    if (booting) return booting;
    booting = new Promise(function (resolve, reject) {
      if (!window.WorkBuddyCloud || !window.WorkBuddyCloud.createWorkBuddyCloud) {
        reject(new Error("云端组件没加载,请刷新页面"));
        return;
      }
      try {
        cloud = window.WorkBuddyCloud.createWorkBuddyCloud(CFG);
        resolve(cloud);
      } catch (e) { reject(e); }
    });
    return booting;
  }

  function errText(e) {
    if (!e) return "云端连接失败,请稍后重试";
    var code = (e.error && e.error.code) || "";
    if (/^quota_/.test(code)) return "云端今日额度用完了,明天再来,或先用本机引擎";
    if (/^auth_/.test(code)) return "云端未授权:请用网址打开本页(不要直接双击 html 文件)";
    if (/^request_/.test(code)) return "云端不接受这次请求:" + String((e.error && e.error.message) || "").slice(0, 60);
    if (/^model_|^gateway_/.test(code)) return "云端模型正忙,过几秒点「再试一次」";
    if (e.name === "AbortError") return "云端超时了,请重试";
    return String((e.error && e.error.message) || e.message || e).slice(0, 160);
  }

  /* ---------- 传输方式：直连云端 还是 走本机/服务器的 /api/llm 转发 ----------
     云端会校验 Origin：只有官方域名和本机放行，换成 IP / 自己域名就 403。
     所以只要不是官方域名，就自动改走转发（由服务端去掉 Origin 头代发）。
     对应后端：项目根目录的 server.py。 */
  var DIRECT_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|([\w-]+\.)?app\.workbuddy\.host)$/i;

  function useProxy() {
    try {
      if (location.protocol === "file:") return false;   /* file:// 由 NEED_NET 提前拦住 */
      return !DIRECT_HOST.test(location.hostname);
    } catch (e) { return false; }
  }

  async function listModels() {
    if (MODEL_CACHE) return MODEL_CACHE;
    var raw = null;
    if (useProxy()) {
      /* 走转发：清单也由服务器代取。取不到就用内置候选，绝不因为清单失败把人挡在门外 */
      try {
        var cached = null;
        try { cached = JSON.parse(sessionStorage.getItem("wj_models_v1") || "null"); } catch (e) {}
        if (cached && cached.t && Date.now() - cached.t < 10 * 60 * 1000 && cached.list && cached.list.length) {
          MODEL_CACHE = cached.list;
          return MODEL_CACHE;
        }
        var resp = await fetch("/api/models", { headers: { Accept: "application/json" } });
        if (resp.ok) raw = await resp.json();
      } catch (e) { raw = null; }
    } else {
      await boot();
      raw = await cloud.llm.models.list();
    }
    var list = Array.isArray(raw) ? raw : (raw && (raw.data || raw.models)) || [];
    list = list.filter(function (m) { return m && m.disabled !== true && m.enabled !== false; })
               .map(function (m) {
                 /* 兼容原始字段名：云端直返的是 id/name/capabilities，SDK 会归一化成 supportsImages */
                 if (m.supportsImages === undefined && m.capabilities) {
                   m.supportsImages = !!(m.capabilities.vision || m.capabilities.images);
                 }
                 return m;
               });
    if (!list.length) list = FALLBACK_MODELS.slice();     /* 清单拿不到：用实测能用的几个顶上 */
    MODEL_CACHE = list;
    try {
      sessionStorage.setItem("wj_models_v1", JSON.stringify({ t: Date.now(), list: list }));
    } catch (e) {}
    return MODEL_CACHE;
  }

  /* 内置兜底候选：/api/models 抖动或超时时照样能聊、能看图 */
  var FALLBACK_MODELS = [
    { id: "glm-5.2", name: "GLM-5.2", supportsImages: false },
    { id: "glm-5v-turbo", name: "GLM-5v-Turbo", supportsImages: true },
    { id: "minimax-m3", name: "MiniMax-M3", supportsImages: false },
    { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash", supportsImages: false },
    { id: "kimi-k2.6", name: "Kimi-K2.6", supportsImages: false }
  ];

  /* 优先顺序来自实测（2026-10 云端模型池，34 个模型逐个跑过）：
       · 1~2 秒出字：glm-5.2 / glm-5v-turbo / mimo / minimax-m3 / deepseek-v4.x / kimi-k2.6
       · 一直不返回：auto、default、kimi-k2.7、hy4-preview、step-5-preview —— 压到队尾
     排序不是死的——真跑起来哪个不响应，会被 DEAD 拉黑 10 分钟自动避让。 */
  var PREF_TEXT = ["glm-5.2", "glm-5v-turbo", "minimax-m3", "mimo-v2.6-pro",
                   "deepseek-v4.1-flash", "deepseek-v4-flash", "kimi-k2.6", "glm-5.3",
                   "kimi-k2.5", "hy3", "default", "auto", "kimi-k2.7",
                   "hy4-preview", "step-5-preview"];
  var PREF_VIS = ["glm-5v-turbo", "glm-5.3", "minimax-m3", "mimo-v2.6-pro",
                  "glm-5.2", "kimi-k2.6", "deepseek-v4.1-flash", "kimi-k2.5",
                  "hy3", "auto", "step-5-preview"];

  var DEAD = {};                       /* 模型 id -> 拉黑到期时间戳 */
  function markDead(id) { DEAD[id] = Date.now() + 10 * 60 * 1000; }
  function isDead(id) { return DEAD[id] && DEAD[id] > Date.now(); }

  function orderBy(list, pref) {
    var out = [], i, j, taken = {};
    for (i = 0; i < pref.length; i++) {
      for (j = 0; j < list.length; j++) {
        if (list[j].id === pref[i] && !taken[list[j].id]) { out.push(list[j]); taken[list[j].id] = 1; }
      }
    }
    for (j = 0; j < list.length; j++) if (!taken[list[j].id]) out.push(list[j]);
    /* 刚超时过的挪到队尾，别让它一直挡在前面 */
    return out.filter(function (m) { return !isDead(m.id); })
              .concat(out.filter(function (m) { return isDead(m.id); }));
  }

  async function candsFor(needImage) {
    var list = await listModels();
    if (!list.length) return [];
    var pool = needImage
      ? list.filter(function (m) { return m.supportsImages === true; })
      : list.slice();
    if (needImage && !pool.length) return [];      /* 没有视觉模型:交给上层报错,不硬塞文本模型 */
    return orderBy(pool, needImage ? PREF_VIS : PREF_TEXT);
  }

  /* 走转发时自己读 SSE（不能用 SDK，SDK 只会直接打云端） */
  async function streamViaProxy(body, state, ctrl) {
    var resp = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!resp.ok) {
      var msg = "";
      try { var j = await resp.json(); msg = j.error || j.detail || ""; } catch (e) {}
      var err = new Error(msg || ("云端转发失败 HTTP " + resp.status));
      err.error = { code: "gateway_network_error", message: msg };
      throw err;
    }
    if (!resp.body || !resp.body.getReader) {
      /* 老浏览器兜底：整体读完再解析 */
      var all = await resp.text();
      return parseSSE(all, state);
    }
    var reader = resp.body.getReader();
    var dec = new TextDecoder();
    var buf = "", text = "";
    while (true) {
      var step = await reader.read();
      if (step.done) break;
      buf += dec.decode(step.value, { stream: true });
      var lines = buf.split("\n");
      buf = lines.pop();
      var got = parseSSE(lines.join("\n"), state);
      if (got) text = got;
    }
    if (buf) parseSSE(buf, state);
    return state.text;
  }

  /* 解析 SSE 文本，把增量累加到 state，返回累计文本 */
  function parseSSE(chunkText, state) {
    var lines = String(chunkText || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf("data:") !== 0) continue;
      var payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        var o = JSON.parse(payload);
        var ch = o && o.choices && o.choices[0];
        var d = ch && (ch.delta || ch.message);
        if (d && typeof d.content === "string" && d.content) {
          if (!state.started) { state.started = true; if (state.mark) state.mark(); }
          state.text += d.content;
        }
      } catch (e) { /* 半截 JSON，跳过 */ }
    }
    return state.text;
  }

  /* 按模型跑一次，把流式片段收成完整文本。
     两道闸：
       · firstMs —— 迟迟不吐第一个字，就直接判它失灵，换下一个模型（不用干等到总超时）
       · ms      —— 兜底总时长；已经收到部分文字的话，把已有的交出去，别让人白等
     直连时不给 SDK 传 signal —— 中途 abort 会让部分模型直接吐空帧，反而拿不到内容；
     走转发时请求是我们自己的，可以放心 abort。 */
  function once(model, messages, opt) {
    var body = { model: model.id, messages: messages, stream: true };
    if (opt.temperature != null) body.temperature = opt.temperature;

    var state = { started: false, text: "", mark: null };
    var ctrl = null, run;

    if (useProxy()) {
      ctrl = new AbortController();
      run = streamViaProxy(body, state, ctrl);
    } else {
      run = (async function () {
        for await (var chunk of cloud.llm.chat.completions.create(body)) {
          var d = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          if (d && typeof d.content === "string" && d.content) {
            if (!state.started) { state.started = true; if (state.mark) state.mark(); }
            state.text += d.content;
          }
        }
        return state.text;
      })();
    }
    run.catch(function () {});          /* 下面自己接管成败，避免未捕获告警 */

    var firstMs = opt.firstMs || 10000;
    var totalMs = opt.ms || 30000;

    return new Promise(function (resolve, reject) {
      var done = false;
      function finish(ok, val) {
        if (done) return;
        done = true;
        clearTimeout(t1); clearTimeout(t2);
        if (!ok && ctrl) { try { ctrl.abort(); } catch (e) {} }
        ok ? resolve(val) : reject(val);
      }
      var t1 = setTimeout(function () {
        if (state.started) return;                   /* 已经吐字了，只是慢，继续等 */
        finish(false, new Error("模型没响应"));
      }, firstMs);
      state.mark = function () { clearTimeout(t1); };
      var t2 = setTimeout(function () {
        if (state.text) finish(true, state.text);    /* 有半截就先给半截 */
        else finish(false, new Error("云端超时了,请重试"));
      }, totalMs);
      run.then(function (t) { finish(true, t); }, function (e) { finish(false, e); });
    });
  }

  /* 收集成一段完整文本：一个模型空回/报错就换下一个候选（云端偶发空回复很常见） */
  async function collect(messages, opt) {
    opt = opt || {};
    /* 走转发时完全不依赖页面里的云端 SDK：SDK 没加载好也能聊（手机弱网常见） */
    if (!useProxy()) await boot();
    var all = await candsFor(!!opt.images);
    if (!all.length) throw new Error(opt.images ? "云端还没有开通看图模型" : "云端还没有可用模型");
    var cands = all.slice(0, opt.tries || 3);
    var last = null;
    for (var k = 0; k < cands.length; k++) {
      try {
        var text = await once(cands[k], messages, opt);
        if (String(text || "").trim()) return { text: text, model: cands[k].name || cands[k].id };
        last = new Error("模型没返回内容");
        markDead(cands[k].id);                       /* 空回：本轮先别再找它 */
      } catch (e) {
        last = e;
        if (e && e.error && /^quota_/.test(String(e.error.code || ""))) throw e;   /* 额度问题换模型也没用 */
        if (!(e && e.error && /^request_/.test(String(e.error.code || "")))) markDead(cands[k].id);
      }
    }
    throw last || new Error("云端没有返回内容");
  }

  /* ---------- 各接口实现 ---------- */
  function doLogin(body) {
    var email = String(body.email || "").trim().toLowerCase();
    var pwd = String(body.password || "");
    var allow = ACCOUNTS[email];
    if (!allow) return { ok: false, error: "这个账号没有开通,请用站长给的账号登录" };
    if (allow.indexOf(hashPwd(pwd)) < 0) return { ok: false, error: "密码不对,再试一次" };
    var token = "cloud-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return { ok: true, email: email, token: token };
  }

  async function doChat(body, ms) {
    var src = Array.isArray(body.messages) ? body.messages.slice() : [];
    if (!src.length) return { ok: false, error: "没有对话内容" };
    var msgs;
    if (src[0] && src[0].role === "system") msgs = src;
    else msgs = [{ role: "system", content: SYS }].concat(src);
    /* 每个模型给 10 秒吐第一个字、28 秒收尾；三个候选依次上，最坏也不会卡几分钟 */
    var r = await collect(msgs, {
      temperature: body.temperature,
      firstMs: 10000,
      ms: Math.min(Number(ms) || 28000, 28000),
      tries: 3
    });
    if (!String(r.text || "").trim()) throw new Error("云端没有返回内容");
    return { ok: true, text: r.text, model: r.model };
  }

  async function doIdentify(body) {
    var img = String(body.image || "");
    if (img.indexOf("data:image/") !== 0) return { ok: false, error: "照片数据不对劲" };
    var msgs = [
      { role: "system", content: "你是中国文物鉴定助手,只输出 JSON,不要多余文字。" },
      { role: "user", content: [
        { type: "text", text: IDENT_PROMPT },
        { type: "image_url", image_url: { url: img } }
      ] }
    ];
    var r = await collect(msgs, { temperature: 0.2, images: true, firstMs: 22000, ms: 75000, tries: 3 });
    var m = String(r.text || "").match(/\{[\s\S]*\}/);
    if (!m) throw new Error("云端读不出结果:" + String(r.text || "").slice(0, 60));
    return { ok: true, data: JSON.parse(m[0]), model: r.model };
  }

  /* ---------- 接管 identFetchCloud：所有 /api/* 都走云端 ---------- */
  var NEED_NET = { "/api/chat": 1, "/api/identify": 1 };

  window.identFetchCloud = function (url, body, ms, authKey) {
    var path = String(url || "").replace(/^https?:\/\/[^/]+/i, "").split("?")[0] || "/";
    /* 双击 html 打开时浏览器把来源记为 null，云端会拒绝：说清楚怎么办，别让人以为是坏了 */
    if (NEED_NET[path] && location.protocol === "file:") {
      return Promise.resolve({ ok: false, error: "云端 AI 需要通过网址访问:双击项目里的「启动网页.bat」,它会打开 http://127.0.0.1:8080 并自动进浏览器" });
    }
    var run;
    switch (path) {
      case "/api/ping":
        run = function () { return { ok: true, hasKey: true, provider: "cloud", model: "云端大模型" }; };
        break;
      case "/api/setkey":
        run = function () { return { ok: true, hasKey: true, provider: "cloud" }; };
        break;
      case "/api/login":
        run = function () { return doLogin(body || {}); };
        break;
      case "/api/reg":
        run = function () { return { ok: false, error: "站点已内置账号,直接登录即可(注册暂未开放)" }; };
        break;
      case "/api/chat":
        run = function () { return doChat(body || {}, ms); };
        break;
      case "/api/identify":
        run = function () { return doIdentify(body || {}); };
        break;
      case "/api/imagine":
        run = function () { return { ok: false, error: "云端暂不出图,已改用页面自带的艺术化" }; };
        break;
      default:
        run = function () { return { ok: false, error: "云端不支持该接口" }; };
    }
    return Promise.resolve().then(run).catch(function (e) { return { ok: false, error: errText(e) }; });
  };

  /* ---------- 轻提示：登录完立刻告诉用户「可以直接用了」 ---------- */
  function wjToast(msg, ms) {
    var el = document.getElementById("wjToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "wjToast";
      el.style.cssText = "position:fixed;left:50%;top:66px;transform:translate(-50%,-14px);z-index:9999;" +
        "width:max-content;max-width:min(92vw,430px);padding:11px 16px;border-radius:12px;" +
        "background:linear-gradient(180deg,#8B0C13,#A50F17);color:#FFF3D8;" +
        "font-family:\"KaiTi\",\"STKaiti\",\"Kaiti SC\",serif;font-size:13.5px;letter-spacing:.5px;line-height:1.6;" +
        "box-shadow:0 12px 30px rgba(60,0,4,.36);opacity:0;transition:opacity .25s,transform .25s;" +
        "pointer-events:none;text-align:center;border:1px solid rgba(255,224,168,.42)";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(function () { el.style.opacity = "1"; el.style.transform = "translate(-50%,0)"; });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = "0"; el.style.transform = "translate(-50%,-14px)"; }, ms || 3600);
  }
  window.wjToast = wjToast;

  /* 预热：把模型清单先拉一次，页面显示状态时就不必等 */
  try { boot().catch(function () {}); } catch (e) {}

  /* 对外：登录后立刻预热，状态条马上变「已就绪」 */
  window.wjCloudWarm = function () {
    return listModels().catch(function () { return []; });
  };

  /* 覆盖生效后，重探一次云端状态（首次渲染时可能还在连旧小桥） */
  setTimeout(function () {
    try { if (typeof window.identCloudPing === "function") window.identCloudPing(); } catch (e) {}
  }, 300);
})();
