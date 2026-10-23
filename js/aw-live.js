/* =============================================================================
 * js/aw-live.js · 文物「活态苏醒 ＋ 人格化对话」全站通用模块
 * -----------------------------------------------------------------------------
 *  ① 活态苏醒：静态 Q 版图 → 呼吸 / 漂浮 / 眨眼 / 苏醒光效（纯 CSS＋JS，零素材增量）
 *     · 主页（圆窗大精灵 / 折扇扇面 / 我的精灵印章）沿用已调好的三层 transform
 *     · 页内其它精灵（图鉴、档案、我的精灵…）自动挂 .aw-live-img 通用活态
 *  ② 人格化智能体：每只文物一套独立 AI 人设（材质→气质，用途→身份，朝代→阅历，
 *     自身故事→记忆），点它就能以「该文物本人」的身份聊天、科普、讲故事、答题。
 *     云端链路：本机小桥(127.0.0.1:8898) → 浏览器直连智谱 → 本机台词库兜底。
 *     ⚠ 智谱的 OPTIONS 预检不返回 CORS 头，浏览器无法直连，所以小桥是主路。
 *  ③ 新增路由 #/alive：活态苏醒专页（74 只精灵全苏醒的大舞台）
 *
 *  约定：不改动任何既有 css / js 源文件，不劫持原有交互；
 *        只在精灵身上多挂一枚「💬」聊天钮，原跳转 / 原按钮一律照旧。
 * =========================================================================== */
(function () {
  "use strict";
  if (window.__AW_LIVE__) return;          // 幂等：重复引入只生效一次
  window.__AW_LIVE__ = 1;

  var REDUCED = false;
  try { REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function S(id) { return (typeof SPIRITS !== "undefined") ? SPIRITS[id] : null; }
  function ATTR() { return (typeof ATTRIBUTES !== "undefined") ? ATTRIBUTES : { primary: {}, secondary: {} }; }

  /* ============================ ① 样式 ============================ */
  var CSS = [
    "/* ---- 活态苏醒 · 基础帧 ---- */",
    "@keyframes awBreathe{0%,100%{transform:scale(1,1)}45%{transform:scale(1.014,.988)}72%{transform:scale(.995,1.005)}}",
    "@keyframes awFloatC{0%,100%{transform:translateY(-2px)}50%{transform:translateY(2px)}}",
    "@keyframes awBlink{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.9)}}",
    "@keyframes awHalo{0%,100%{opacity:.26;transform:scale(.96)}50%{opacity:.44;transform:scale(1.02)}}",

    "/* ---- 主页 · 圆窗大精灵：容器呼吸（图片沿用原有漂浮）+ 眨眼 + 苏醒光晕 ---- */",
    ".rh-moon-art{animation:awBreathe 6.4s ease-in-out infinite;cursor:pointer}",
    ".rh-moon-art.aw-blink img{animation:awBlink .16s ease!important}",
    ".rh-moon-art::after{content:\"\";position:absolute;left:50%;top:56%;width:78%;padding-bottom:78%;margin:-39% 0 0 -39%;",
    "  border-radius:50%;pointer-events:none;z-index:-1;",
    "  background:radial-gradient(circle,rgba(255,226,152,.5) 0%,rgba(255,206,120,.16) 44%,transparent 70%);",
    "  animation:awHalo 7s ease-in-out infinite}",
    ".rh-moon-art:hover img{filter:drop-shadow(0 22px 34px rgba(120,40,10,.45)) brightness(1.04)}",
    "/* ---- 主页 · 折扇扇面：容器漂浮 + 图片呼吸 ---- */",
    ".rh-fancard .fc-art{animation:awFloatC 7.6s ease-in-out infinite}",
    ".rh-fancard .fc-art img{animation:awBreathe 5.8s ease-in-out infinite;transform-origin:50% 90%}",
    ".rh-fancard.is-sel .fc-art img{animation-duration:5.2s}",
    ".rh-fancard .fc-art.aw-blink img{animation:awBlink .16s ease!important}",
    ".rh-fancard.is-sel .fc-art{cursor:pointer}",
    "/* ---- 主页 · 我的精灵印章：轻轻起伏 ---- */",
    ".rh-seals img,.rh-seals .rh-seal-img{animation:awBreathe 7.8s ease-in-out infinite}",
    "@media (prefers-reduced-motion:reduce){",
    "  .rh-moon-art,.rh-fancard .fc-art,.rh-fancard .fc-art img,.rh-seals img{animation:none}}",

    "/* ---- 通用活态：图鉴 / 档案 / 我的精灵 / 任何精灵图 ---- */",
    "@keyframes awLife{0%,100%{transform:translateY(-2px) scale(1,1)}45%{transform:translateY(1px) scale(1.012,.988)}72%{transform:translateY(2px) scale(.996,1.004)}}",
    ".aw-live-img.aw-live-img{animation:awLife 7.4s ease-in-out infinite;transform-origin:50% 86%}",
    ".aw-live-img.aw-blink{animation:awBlink .17s ease!important}",
    "/* ---- 💬 聊天钮：不抢原交互，独立小气泡 ---- */",
    ".aw-say{position:absolute;right:6px;bottom:6px;z-index:7;width:26px;height:26px;line-height:24px;",
    "  text-align:center;border-radius:50%;font-size:13px;cursor:pointer;user-select:none;",
    "  background:linear-gradient(180deg,#C0392F,#A5181C);color:#FFE9B8;",
    "  border:1px solid rgba(255,214,150,.85);box-shadow:0 3px 10px rgba(60,14,6,.35);",
    "  opacity:.6;transition:opacity .2s,transform .2s}",
    ".aw-host:hover .aw-say{opacity:1;transform:scale(1.1)}",
    ".aw-say:hover{opacity:1;transform:scale(1.16)}",
    "@media (max-width:760px){.aw-say{width:22px;height:22px;line-height:20px;font-size:11px}}",

    "/* ---- 活态苏醒专页 #/alive ---- */",
    ".aw-page{max-width:1180px;margin:0 auto;padding:6px 0 34px;font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif}",
    ".aw-hero{position:relative;overflow:hidden;border-radius:14px;padding:24px 26px 20px;color:#FFE9B8;",
    "  background:linear-gradient(135deg,#A5181C 0%,#7C0F13 58%,#5A0A0D 100%);",
    "  border:1px solid rgba(255,214,150,.38);box-shadow:0 16px 40px rgba(70,10,6,.34)}",
    ".aw-hero::after{content:\"\";position:absolute;right:-60px;top:-80px;width:280px;height:280px;border-radius:50%;",
    "  background:radial-gradient(circle,rgba(255,214,150,.28) 0%,rgba(255,214,150,0) 66%);pointer-events:none}",
    ".aw-eyebrow{font-size:11.5px;letter-spacing:.24em;opacity:.8;display:block;margin-bottom:6px}",
    ".aw-hero h2{margin:0 0 8px;font-size:27px;letter-spacing:.06em;color:#FFD98A;text-shadow:0 2px 10px rgba(0,0,0,.35)}",
    ".aw-hero p{margin:0;font-size:13.5px;line-height:1.9;opacity:.92;max-width:780px;position:relative;z-index:1}",
    ".aw-hero .aw-stat{display:inline-block;margin-top:12px;font-size:12px;padding:5px 13px;border-radius:999px;",
    "  background:rgba(255,233,184,.14);border:1px solid rgba(255,233,184,.35);position:relative;z-index:1}",
    ".aw-hero .aw-stat b{color:#FFD98A;font-size:14px}",
    ".aw-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 16px;padding:10px 12px;",
    "  background:linear-gradient(180deg,#FFFCF3,#F8EEDC);border:1px solid rgba(196,150,74,.55);",
    "  border-radius:10px;box-shadow:0 6px 18px rgba(70,40,16,.12)}",
    ".aw-find{flex:1;min-width:170px;font-family:inherit;font-size:13px;padding:7px 11px;border-radius:7px;",
    "  border:1px solid rgba(196,150,74,.6);background:#fff;color:#3B2418}",
    ".aw-find:focus{outline:none;border-color:#A5181C}",
    ".aw-filt{display:flex;gap:6px;flex-wrap:wrap}",
    ".aw-chip{font-family:inherit;font-size:12px;padding:5px 11px;border-radius:999px;cursor:pointer;",
    "  background:#FFF8EC;color:#7C2A12;border:1px solid rgba(196,150,74,.6);transition:.18s}",
    ".aw-chip:hover{background:#F3E2C4}",
    ".aw-chip.on{background:#A5181C;color:#fff;border-color:#A5181C}",
    ".aw-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#7C2A12}",
    ".aw-dot{width:8px;height:8px;border-radius:50%;background:#9b9b9b;display:inline-block}",
    ".aw-dot.ok{background:#4ec97a}.aw-dot.warn{background:#e0a33a}.aw-dot.err{background:#d9534f}",
    ".aw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:14px}",
    ".aw-card{position:relative;overflow:hidden;cursor:pointer;text-align:center;padding:10px 8px 12px;",
    "  background:linear-gradient(180deg,#FFFDF6,#F5E7CB);border:1px solid rgba(196,150,74,.6);border-radius:11px;",
    "  box-shadow:0 8px 20px rgba(70,40,16,.16);transition:transform .25s,box-shadow .25s}",
    ".aw-card:hover{transform:translateY(-4px);box-shadow:0 16px 32px rgba(70,40,16,.26),0 0 0 2px rgba(165,24,28,.5)}",
    ".aw-card.act{border-color:#A5181C;box-shadow:0 0 0 2px #A5181C,0 14px 30px rgba(70,40,16,.28)}",
    ".aw-stage{height:98px;display:flex;align-items:center;justify-content:center;position:relative}",
    ".aw-halo{position:absolute;left:50%;top:52%;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:50%;",
    "  pointer-events:none;opacity:0;",
    "  background:radial-gradient(circle,rgba(255,226,152,.5) 0%,rgba(255,206,120,.16) 44%,transparent 70%)}",
    ".aw-card.live .aw-halo{animation:awHalo 4s ease-in-out infinite}",
    "@keyframes awFloatS{0%,100%{transform:translateY(-4px) rotate(-1.2deg)}50%{transform:translateY(4px) rotate(1.2deg)}}",
    "@keyframes awSpark{0%{opacity:0;transform:translate(0,0)}18%{opacity:.85}100%{opacity:0;transform:translate(var(--dx),-56px)}}",
    ".aw-float{animation:awFloatS 5.2s ease-in-out infinite}",
    ".aw-card img{width:86px;height:86px;object-fit:contain;display:block;transform-origin:50% 84%;",
    "  filter:drop-shadow(0 6px 8px rgba(60,20,8,.26));animation:awBreathe 3.3s ease-in-out infinite}",
    ".aw-card img.aw-blink{animation:awBlink .17s ease!important}",
    ".aw-spark{position:absolute;width:4px;height:4px;border-radius:50%;background:#C0392F;opacity:0;pointer-events:none}",
    ".aw-card.live .aw-spark{animation:awSpark 4.6s linear infinite}",
    ".aw-card.off .aw-float,.aw-card.off img,.aw-card.off .aw-halo,.aw-card.off .aw-spark{animation:none!important}",
    ".aw-card.off .aw-halo{opacity:0}",
    ".aw-nm{font-size:14px;font-weight:700;color:#7C2A12;margin-top:5px;letter-spacing:.04em}",
    ".aw-er{font-size:10.5px;color:#8a6a44;margin-top:2px;line-height:1.4;min-height:29px}",
    ".aw-tg{display:inline-block;font-size:9.5px;color:#fff;background:#A5181C;border-radius:3px;padding:1px 6px;margin-top:3px}",
    ".aw-hi{position:absolute;left:0;right:0;bottom:0;font-size:11px;letter-spacing:.1em;color:#FFE9B8;",
    "  padding:6px 0 5px;opacity:0;transition:opacity .2s;pointer-events:none;",
    "  background:linear-gradient(180deg,rgba(165,24,28,0),rgba(140,16,20,.94))}",
    ".aw-card:hover .aw-hi{opacity:1}",
    ".aw-empty{text-align:center;color:#8a6a44;font-size:13.5px;padding:36px 0}",
    "@media (max-width:760px){.aw-hero{padding:18px 16px 16px}.aw-hero h2{font-size:21px}",
    "  .aw-grid{grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:10px}.aw-stage{height:78px}",
    "  .aw-card img{width:68px;height:68px}}",

    "/* ---- 对话抽屉 ---- */",
    ".aw-chat{position:fixed;right:20px;bottom:20px;width:min(392px,94vw);height:min(568px,74vh);z-index:120;",
    "  display:none;flex-direction:column;overflow:hidden;",
    "  background:linear-gradient(180deg,#FFFCF3,#F6EAD2);border:1px solid rgba(200,154,82,.75);border-radius:12px;",
    "  box-shadow:0 24px 60px rgba(50,14,6,.5),inset 0 0 0 1px rgba(255,252,240,.6);",
    "  font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif}",
    ".aw-chat.show{display:flex;animation:awIn .32s ease}",
    "@keyframes awIn{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}",
    ".aw-top{background:linear-gradient(180deg,#A5181C,#6E0B0E);color:#FFE9B8;padding:10px 12px;",
    "  display:flex;align-items:center;gap:10px;flex:none;border-bottom:1px solid rgba(255,214,150,.35)}",
    ".aw-top img{width:36px;height:36px;border-radius:50%;background:#FFF8EC;border:1px solid rgba(255,214,150,.8);object-fit:contain}",
    ".aw-top b{font-size:15.5px;letter-spacing:.04em;display:block}",
    ".aw-top span{font-size:10.5px;opacity:.82;display:block;margin-top:1px}",
    ".aw-x{margin-left:auto;cursor:pointer;font-size:18px;opacity:.85;padding:0 4px;line-height:1}",
    ".aw-via{font-size:10px;opacity:.75;margin-left:6px;padding:1px 6px;border:1px solid rgba(255,233,184,.4);border-radius:999px}",
    ".aw-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px}",
    ".aw-m{max-width:85%;font-size:13.5px;line-height:1.75;padding:8px 11px;border-radius:9px;word-break:break-word;animation:awPop .26s ease}",
    "@keyframes awPop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    ".aw-m.them{align-self:flex-start;background:#fff;border:1px solid rgba(200,154,82,.4);color:#3B2418}",
    ".aw-m.me{align-self:flex-end;background:#A5181C;color:#fff}",
    ".aw-m.sys{align-self:center;font-size:11px;color:#8a6a44;background:rgba(200,154,82,.14);border-radius:6px;padding:4px 9px;text-align:center}",
    ".aw-typing{align-self:flex-start;color:#8a6a44;font-size:12px;padding:4px 8px}",
    ".aw-chips{padding:0 12px 8px;display:flex;gap:6px;flex-wrap:wrap;flex:none}",
    ".aw-chips button{font-family:inherit;font-size:11px;padding:4px 9px;border-radius:5px;cursor:pointer;",
    "  background:#FFF8EC;color:#7C2A12;border:1px solid rgba(200,154,82,.6)}",
    ".aw-chips button:hover{background:#A5181C;color:#fff;border-color:#A5181C}",
    ".aw-in{display:flex;gap:7px;padding:10px;border-top:1px solid rgba(200,154,82,.4);background:rgba(255,252,244,.7);flex:none}",
    ".aw-in input{flex:1;font-family:inherit;font-size:13px;padding:8px 10px;border-radius:7px;",
    "  border:1px solid rgba(200,154,82,.6);background:#fff;color:#3B2418;min-width:0}",
    ".aw-in input:focus{outline:none;border-color:#A5181C}",
    ".aw-in button{font-family:inherit;background:#A5181C;border:1px solid #A5181C;color:#fff;",
    "  padding:8px 15px;border-radius:7px;cursor:pointer;font-size:13px;flex:none}",
    ".aw-in button:hover{background:#7C0F13}",
    "/* ---- 圆窗上的「点我聊聊」提示 ---- */",
    ".aw-tip{position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);z-index:5;",
    "  font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;font-size:11.5px;letter-spacing:.14em;",
    "  color:#7C2A12;background:linear-gradient(180deg,rgba(255,252,243,.94),rgba(250,240,220,.9));",
    "  border:1px solid rgba(176,124,62,.6);border-radius:999px;padding:3px 12px;white-space:nowrap;",
    "  box-shadow:0 4px 12px rgba(70,40,16,.22);pointer-events:none;animation:awTip 3.2s ease-in-out infinite}",
    "@keyframes awTip{0%,100%{opacity:.72;transform:translateX(-50%) translateY(0)}50%{opacity:1;transform:translateX(-50%) translateY(-3px)}}",
    "@media (max-width:760px){.aw-chat{right:0;left:0;bottom:0;width:100%;height:86vh;border-radius:14px 14px 0 0}",
    "  .aw-tip{font-size:10.5px;padding:2px 9px}}"
  ].join("\n");

  (function inject() {
    var st = document.createElement("style");
    st.id = "aw-live-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ======================= ② 人设自动派生 ======================= */
  var TONE = {
    gold: "华贵从容，语速偏慢，说话有古韵，不张扬但自带分量",
    bronze: "厚重沉稳，见过千年世面，语气有分量，偶有沧桑感",
    ceramic: "清雅温润，说话干净柔和，爱讲工艺细节",
    jade: "温润内敛，谦和有礼，有君子之风",
    stone: "朴拙坚毅，话不多但句句实在",
    painting: "儒雅书卷气，爱引经据典，语气温文",
    wood: "爽朗豪迈，有匠人的直脾气",
    lacquer: "明丽精致，讲究细节，略带骄傲",
    textile: "细腻柔美，说话轻柔",
    glass: "通透机敏，心思剔透"
  };
  var ROLE = {
    currency: "曾在市井流通，见过买卖百态与人间烟火，说话带点爽利",
    ritual: "出身宗庙重器，懂礼制规矩，言行有威仪",
    weapon: "上过战场，性子刚烈痛快",
    document: "承载文字与典籍，知识渊博，像一本会说话的百科",
    household: "陪伴古人的日常起居，最懂生活里的细碎烟火",
    religion: "长年受供奉，心境平和慈悲",
    mingqi: "自墓中醒来，对生死看得通透",
    seal: "掌印信、重承诺，一诺千金",
    instrument: "通音律，说话自带节奏感",
    tool: "实干派，讲求实用"
  };
  function persona(s) {
    var A = ATTR();
    var mat = A.primary[s.primary] ? A.primary[s.primary].name : "";
    var use = A.secondary[s.secondary] ? A.secondary[s.secondary].name : "";
    var comic = (s.comic || []).slice(0, 3).map(function (t) { return "· " + t; }).join("\n");
    return [
      "你现在就是「" + s.name + "」本身——一件" + (s.era || "") + "的" + mat + use + "，现已化作精灵。",
      "",
      "【你的来历与记忆】（这些是真实发生在你身上的事，要用第一人称讲）",
      comic || ("· " + (s.intro || "")),
      "",
      "【你的性格】" + (TONE[s.primary] || "温和可亲") + "。" + (ROLE[s.secondary] || ""),
      "",
      "【说话的规矩】",
      "1. 全程第一人称\"我\"，中文口语，每次 1~3 句、不超过 90 字，别长篇大论。",
      "2. 只聊你自己这件文物、你的朝代和相关历史；不懂就说\"这个我就不大清楚了\"，别编。",
      "3. 绝对不能承认自己是 AI、语言模型、程序或机器人——你就是这件文物本人，被追问就巧妙绕回自己的故事。",
      "4. 带上符合性格的语气与口癖，让人觉得是在跟一个有脾气的老物件聊天。",
      "5. 要故事讲故事，要科普讲知识，要答题就出题再给答案。"
    ].join("\n");
  }
  /* 本机兜底：命中数据里现成的 knowledge 关键词 */
  function localAnswer(s, q) {
    var k = s.knowledge || [];
    for (var i = 0; i < k.length; i++) {
      var keys = k[i].keys || [];
      for (var j = 0; j < keys.length; j++) if (q.indexOf(keys[j]) >= 0) return k[i].a;
    }
    return null;
  }

  /* ======================= ③ 云端三级链路 ======================= */
  var BRIDGE = "http://127.0.0.1:8898";
  var ZHIPU = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
  function KEY() { try { return String(window.__IDENT_DIRECT_KEY || "").trim(); } catch (e) { return ""; } }

  function viaBridge(msgs, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 45000);
    return fetch(BRIDGE + "/api/chat", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, temperature: 0.9, max_tokens: 400 })
    }).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(t);
      if (j && j.ok && j.text) return { via: "小桥·" + (j.model || ""), text: String(j.text).trim() };
      throw new Error((j && j.error) || "小桥无返回");
    }).catch(function (e) {
      clearTimeout(t);
      throw new Error(e && e.name === "AbortError" ? "小桥超时" : (e.message || "小桥未启动"));
    });
  }
  function viaDirect(msgs, ms) {
    var k = KEY();
    if (!k) return Promise.reject(new Error("无钥匙"));
    var models = ["glm-4-flash", "glm-4.7-flash"];
    function go(n, last) {
      if (n >= models.length) return Promise.reject(new Error(last || "云端不可用"));
      var m = models[n];
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 30000);
      return fetch(ZHIPU, {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + k },
        body: JSON.stringify({
          model: m, messages: msgs, temperature: 0.9, max_tokens: 400,
          thinking: { type: "disabled" }
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        clearTimeout(t);
        if (j && j.error) return go(n + 1, String(j.error.message || j.error.code));
        var c = j && j.choices && j.choices[0] ? j.choices[0].message : null;
        var txt = c ? (c.content || c.reasoning_content || "") : "";
        if (String(txt).trim()) return { via: "直连·" + m, text: String(txt).trim() };
        return go(n + 1, "空回复");
      }).catch(function (e) {
        clearTimeout(t);
        return go(n + 1, e && e.name === "AbortError" ? "超时" : "被 CORS 拦下");
      });
    }
    return go(0, "");
  }
  /* 站点上线后：本站 /api/chat 已由 cloud-ai.js 接管（走服务器转发到云端大模型）。
     只有在本地双击 html、或访问本机时，才回落到小桥 / 直连这条老链路。 */
  function cloudReady() {
    try {
      return typeof window.identFetchCloud === "function" && /^https?:$/.test(location.protocol);
    } catch (e) { return false; }
  }
  function viaCloud(msgs, ms) {
    return Promise.resolve(window.identFetchCloud("/api/chat", { messages: msgs }, ms || 40000))
      .then(function (j) {
        if (j && j.ok && String(j.text || "").trim())
          return { via: "云端 · " + (j.model || "大模型"), text: String(j.text).trim() };
        throw new Error((j && j.error) || "云端没有返回内容");
      });
  }
  function chat(msgs) {
    if (cloudReady()) {
      return viaCloud(msgs).catch(function (e) {
        throw new Error("云端：" + ((e && e.message) || "未接通"));
      });
    }
    return viaBridge(msgs).catch(function (e1) {
      return viaDirect(msgs).catch(function (e2) {
        throw new Error("小桥(" + e1.message + ")；直连(" + e2.message + ")");
      });
    });
  }
  function bridgeHint(e) {           // 云端没接上时,给一句说人话的提示
    var m = String((e && e.message) || "");
    if (/^云端：/.test(m)) return "☁ " + m.slice(3) + "（先用本机台词答你，过一会儿再问一次试试）";
    if (/小桥未启动|Failed to fetch|NetworkError|Load failed|ERR_CONNECTION/i.test(m))
      return "☁ 云端没连上：先用本机台词答你，稍后再试一次即可";
    return "";
  }

  /* ======================= ④ 对话抽屉 ======================= */
  var box = document.createElement("div");
  box.className = "aw-chat";
  box.innerHTML =
    '<div class="aw-top">' +
      '<img id="awImg" src="" alt="">' +
      '<div><b id="awName">—</b><span id="awEra">—</span></div>' +
      '<span class="aw-via" id="awVia" hidden></span>' +
      '<span class="aw-x" id="awX">✕</span>' +
    '</div>' +
    '<div class="aw-log" id="awLog"></div>' +
    '<div class="aw-chips" id="awChips"></div>' +
    '<div class="aw-in"><input id="awInp" placeholder="和它说点什么…"><button id="awGo">发送</button></div>';
  document.body.appendChild(box);

  var $ = function (id) { return document.getElementById(id); };
  var logEl = $("awLog"), CUR = null, HIST = [], BUSY = false;

  $("awX").onclick = function () { box.classList.remove("show"); };
  $("awGo").onclick = send;
  $("awInp").onkeydown = function (e) { if (e.key === "Enter") send(); };

  function put(who, txt) {
    var d = document.createElement("div");
    d.className = "aw-m " + who; d.textContent = txt;
    logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
  }
  function sys(txt) { put("sys", txt); }
  function setVia(v) {
    var el = $("awVia");
    if (!v) { el.hidden = true; return; }
    el.hidden = false; el.textContent = v;
  }

  function openChat(id) {
    var s = S(id);
    if (!s) return;
    CUR = s; HIST = []; BUSY = false;
    $("awImg").src = "精灵/透明/" + id + ".webp";
    $("awName").textContent = s.name;
    $("awEra").textContent = s.era || "";
    logEl.innerHTML = ""; setVia("");
    box.classList.add("show");
    var ks = (s.knowledge || []).slice(0, 5).map(function (x) { return x.keys[0]; });
    $("awChips").innerHTML = ks.map(function (k) {
      return '<button type="button" data-q="' + esc(k) + '">' + esc(k) + "</button>";
    }).join("");
    sys("已唤醒「" + s.name + "」。它会以自己的身份、朝代和脾气与你聊天。");
    greet(s);
  }
  function greet(s) {
    BUSY = true;
    var tp = document.createElement("div"); tp.className = "aw-typing";
    tp.textContent = s.name + " 正在苏醒…"; logEl.appendChild(tp);
    chat([{ role: "system", content: persona(s) },
          { role: "user", content: "用一句话自报家门，说清你是谁、什么朝代的。" }])
      .then(function (r) {
        tp.remove(); put("them", r.text); HIST.push({ role: "assistant", content: r.text });
        setVia(r.via);
      })
      .catch(function (e) {
        tp.remove();
        put("them", localAnswer(s, "你是谁") || ("我是" + s.name + "。" + (s.intro || "")));
        sys(bridgeHint(e) || "云端未接通，已落回本机台词库（离线也能聊）");
      })
      .then(function () { BUSY = false; });
  }
  function send() {
    var el = $("awInp"), q = String(el.value || "").trim();
    if (!q || BUSY || !CUR) return;
    el.value = ""; put("me", q); HIST.push({ role: "user", content: q });
    var la = localAnswer(CUR, q);
    BUSY = true;
    var tp = document.createElement("div"); tp.className = "aw-typing";
    tp.textContent = CUR.name + " 正在想…"; logEl.appendChild(tp);
    chat([{ role: "system", content: persona(CUR) }].concat(HIST.slice(-7)))
      .then(function (r) {
        tp.remove(); put("them", r.text); HIST.push({ role: "assistant", content: r.text });
        setVia(r.via);
      })
      .catch(function (e) {
        tp.remove();
        put("them", la || "哎呀，我这会儿脑子有点转不动（云端没接通），你换个话头问问？");
        if (bridgeHint(e)) sys(bridgeHint(e));
      })
      .then(function () { BUSY = false; });
  }
  $("awChips").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    $("awInp").value = b.getAttribute("data-q") || b.textContent;
    send();
  });

  /* ======================= ⑤ 眨眼调度 ======================= */
  function blinkOnce(el) {
    if (!el || REDUCED) return;
    el.classList.add("aw-blink");
    setTimeout(function () { el.classList.remove("aw-blink"); }, 180);
  }
  function schedule(el, first) {
    var tick = function () {
      blinkOnce(el);
      setTimeout(tick, 2400 + Math.random() * 5200);   // 2.4~7.6s，各只独立
    };
    setTimeout(tick, first);
  }
  /* 主页专属：圆窗 + 折扇（折扇切牌阵会重建卡片，需定期补种） */
  function seedHome() {
    var moon = document.querySelector(".rh-moon-art");
    if (moon && !moon.__aw) { moon.__aw = 1; schedule(moon, 1200 + Math.random() * 2200); }
    var arts = document.querySelectorAll(".rh-fancard .fc-art");
    for (var i = 0; i < arts.length; i++) {
      if (arts[i].__aw) continue;
      arts[i].__aw = 1;
      schedule(arts[i], 900 + i * 430 + Math.random() * 1600);
    }
  }

  /* ======================= ⑥ 通用：给"外边的精灵"挂活态 + 💬 ======================= */
  var SPOTS = ".codex-card,.spirit-mini,.rh-ava,.spirit-hero,.sp-hero,.mini";
  var SPARK = ["-14px", "10px", "-22px", "16px", "0px", "-8px"];

  function idOf(host) {
    if (!host) return "";
    var d = host.getAttribute("data-aw-id");
    if (d) return d;
    var oc = host.getAttribute("onclick") || "";
    var m = oc.match(/spirit\/([^'"\s)]+)/);
    if (m) return m[1];
    var a = host.closest ? host.closest('a[href*="#/spirit/"]') : null;
    if (a) {
      var m2 = String(a.getAttribute("href") || "").match(/spirit\/([^/?#]+)/);
      if (m2) return m2[1];
    }
    var im = host.querySelector("img");
    if (im) {
      var m3 = String(im.getAttribute("src") || "").match(/([^\/\\]+)\.webp/i);
      if (m3) return m3[1];
    }
    return "";
  }

  function markLive(host) {
    var im = host.querySelector("img");
    if (!im) return null;
    if (host.closest(".rh-seals") || host.closest(".rh-fancard") || host.closest(".rh-moon")) return im;
    if (!im.classList.contains("aw-live-img")) {
      im.classList.add("aw-live-img");
      if (!im.__aw) { im.__aw = 1; schedule(im, 900 + Math.random() * 3600); }
    }
    return im;
  }

  function addChip(host, id) {
    if (host.__awsay === id) return;
    host.__awsay = id;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.classList.add("aw-host");
    var b = document.createElement("i");
    b.className = "aw-say";
    b.textContent = "💬";
    b.title = "点它，听它亲口讲自己的故事";
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      openChat(id);
    });
    host.appendChild(b);
  }

  var nRefresh = 0;
  function refresh() {
    nRefresh++;
    var stale = document.querySelectorAll(".rh-seals .aw-say");   // 印章行一律不保留💬
    for (var k = 0; k < stale.length; k++) stale[k].remove();
    seedHome();
    var hosts = document.querySelectorAll(SPOTS);
    for (var i = 0; i < hosts.length; i++) {
      var h = hosts[i];
      var id = idOf(h);
      if (!id || !S(id)) continue;              // 属性图标 / 城市头像 / 传说：跳过
      if (h.closest(".aw-page")) continue;      // 活态专页自带入口，不重复挂钮
      markLive(h);
      if (h.closest(".rh-seals")) continue;     // 「我的精灵」印章行不挂💬，对话走圆窗点击
      addChip(h, id);
    }
    ensureTip();
  }

  /* 圆窗下方的"点我聊聊"提示（折扇切换会重渲染，定期补挂） */
  function ensureTip() {
    if (document.querySelector(".aw-tip")) return;
    var moon = document.querySelector(".rh-moon");
    if (!moon) return;
    var t = document.createElement("i");
    t.className = "aw-tip";
    t.textContent = "💬 点我，听它讲自己的故事";
    moon.appendChild(t);
  }

  /* ======================= ⑦ 路由 #/alive 活态苏醒专页 ======================= */
  var AWP = { find: "", filt: "", live: true };

  function aliveHTML() {
    var A = ATTR();
    var keys = Object.keys(A.primary);
    return '<div class="aw-page">' +
      '<div class="aw-hero">' +
        '<span class="aw-eyebrow">AI AWAKEN · 活 态 苏 醒</span>' +
        '<h2>文物活了，还会跟你说话</h2>' +
        '<p>每一只 Q 版精灵都在呼吸、漂浮、眨眼——点任意一只，它就用<b>自己朝代的身份、脾气和记忆</b>跟你聊天：讲来历、说工艺、答问题、出考题。</p>' +
        '<span class="aw-stat">共 <b id="awpCnt">0</b> 只精灵已苏醒 · 云端 <span id="awpState">待探测</span></span>' +
      '</div>' +
      '<div class="aw-bar">' +
        '<input class="aw-find" id="awpFind" placeholder="搜名字 / 朝代 / 材质…">' +
        '<div class="aw-filt" id="awpFilt">' +
          '<button type="button" class="aw-chip on" data-k="">全部</button>' +
          '<button type="button" class="aw-chip" data-k="__got">已唤醒</button>' +
          keys.map(function (k) {
            return '<button type="button" class="aw-chip" data-k="' + esc(k) + '">' + esc(A.primary[k].name) + "</button>";
          }).join("") +
        '</div>' +
        '<span class="aw-state"><i class="aw-dot" id="awpDot"></i><span id="awpState2">待测试</span></span>' +
        '<button type="button" class="aw-chip" id="awpTest">测试云端</button>' +
        '<button type="button" class="aw-chip on" id="awpLive">活态（开）</button>' +
      '</div>' +
      '<div class="aw-grid" id="awpGrid"></div>' +
      '<div class="aw-empty" id="awpEmpty" hidden>没有匹配的精灵，换个词试试</div>' +
    '</div>';
  }

  function alivePaint() {
    var grid = $("awpGrid");
    if (!grid) return;
    var A = ATTR();
    var q = AWP.find.toLowerCase();
    var ids = Object.keys(typeof SPIRITS !== "undefined" ? SPIRITS : {}).filter(function (id) {
      var s = SPIRITS[id];
      if (!s) return false;
      if (AWP.filt === "__got") { try { if (typeof isCaptured === "function" && !isCaptured(id)) return false; } catch (e) {} }
      else if (AWP.filt && s.primary !== AWP.filt) return false;
      if (!q) return true;
      var hay = (s.name + " " + (s.alias || "") + " " + (s.era || "") + " " + (s.relicName || "") + " " +
                 (A.primary[s.primary] ? A.primary[s.primary].name : "")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var cnt = $("awpCnt"); if (cnt) cnt.textContent = ids.length;
    var em = $("awpEmpty"); if (em) em.hidden = ids.length > 0;
    grid.innerHTML = ids.map(function (id) {
      var s = SPIRITS[id];
      var mat = A.primary[s.primary] ? A.primary[s.primary].name : "文物";
      return '<div class="aw-card' + (AWP.live ? " live" : " off") + '" data-id="' + esc(id) + '">' +
        '<div class="aw-stage">' +
          '<i class="aw-halo"></i>' +
          '<span class="aw-float"><img src="精灵/透明/' + esc(id) + '.webp" alt="' + esc(s.name) + '" loading="lazy"></span>' +
        '</div>' +
        '<div class="aw-nm">' + esc(s.name) + "</div>" +
        '<div class="aw-er">' + esc(String(s.era || "").slice(0, 22)) + "</div>" +
        '<span class="aw-tg">' + esc(mat) + "</span>" +
        '<div class="aw-hi">💬 点我聊聊</div>' +
      '</div>';
    }).join("");

    var cards = grid.querySelectorAll(".aw-card");
    for (var i = 0; i < cards.length; i++) (function (card, i) {
      var im = card.querySelector("img");
      if (im) {
        im.style.animationDelay = (-i * 0.29).toFixed(2) + "s";
        im.style.animationDuration = (3.0 + (i % 4) * 0.22).toFixed(2) + "s";
        if (!im.__aw) { im.__aw = 1; schedule(im, 800 + i * 90 + Math.random() * 2200); }
      }
      var fl = card.querySelector(".aw-float");
      if (fl) {
        fl.style.animationDelay = (-i * 0.41).toFixed(2) + "s";
        fl.style.animationDuration = (4.4 + (i % 5) * 0.35).toFixed(2) + "s";
      }
      for (var k = 0; k < 3; k++) {
        var sp = document.createElement("i");
        sp.className = "aw-spark";
        sp.style.setProperty("--dx", SPARK[Math.floor(Math.random() * SPARK.length)]);
        sp.style.left = (30 + Math.random() * 40).toFixed(0) + "%";
        sp.style.top = (58 + Math.random() * 16).toFixed(0) + "%";
        sp.style.animationDelay = (Math.random() * 4).toFixed(2) + "s";
        card.appendChild(sp);
      }
      card.addEventListener("click", function () {
        for (var j = 0; j < cards.length; j++) cards[j].classList.remove("act");
        card.classList.add("act");
        openChat(card.getAttribute("data-id"));
      });
    })(cards[i], i);
  }

  function aliveState(txt, cls) {
    var d = $("awpDot"), s1 = $("awpState"), s2 = $("awpState2");
    if (d) d.className = "aw-dot " + (cls || "");
    if (s1) s1.textContent = txt;
    if (s2) s2.textContent = txt;
  }

  function aliveBind() {
    var f = $("awpFind");
    if (f) f.addEventListener("input", function () { AWP.find = f.value.trim(); alivePaint(); });
    var filt = $("awpFilt");
    if (filt) filt.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".aw-chip") : null;
      if (!b) return;
      var all = filt.querySelectorAll(".aw-chip");
      for (var i = 0; i < all.length; i++) all[i].classList.remove("on");
      b.classList.add("on");
      AWP.filt = b.getAttribute("data-k") || "";
      alivePaint();
    });
    var lv = $("awpLive");
    if (lv) lv.addEventListener("click", function () {
      AWP.live = !AWP.live;
      lv.classList.toggle("on", AWP.live);
      lv.textContent = AWP.live ? "活态（开）" : "活态（关）";
      alivePaint();
    });
    var ts = $("awpTest");
    if (ts) ts.addEventListener("click", function () {
      aliveState("测试中…", "warn");
      var t0 = Date.now();
      chat([{ role: "user", content: "说两个字：正常" }])
        .then(function (r) {
          aliveState(r.via + " · " + ((Date.now() - t0) / 1000).toFixed(1) + "s", "ok");
        })
        .catch(function () { aliveState("未接通 · 本机兜底", "err"); });
    });
  }

  function aliveMount() {
    var app = document.getElementById("app");
    if (!app) return;
    if (app.querySelector(".aw-page")) { alivePaint(); return; }
    app.innerHTML = aliveHTML();
    try { document.body.dataset.page = "alive"; } catch (e) {}
    var navs = document.querySelectorAll(".topnav .nav-item");
    for (var i = 0; i < navs.length; i++) navs[i].classList.toggle("active", navs[i].getAttribute("data-nav") === "poster");
    aliveBind();
    alivePaint();
    setTimeout(alivePaint, 60);
  }

  function isAlive() {
    return String(location.hash || "").replace(/^#\/?/, "").split("/")[0] === "alive";
  }
  function onHash() { if (isAlive()) setTimeout(aliveMount, 0); }

  window.addEventListener("hashchange", onHash);   // 注册在 app.js 之后 → 覆盖其默认渲染

  /* 圆窗点击 → 直接和当前精灵对话（捕获阶段读点击前的状态，30ms 后开聊，不抢原交互） */
  function moonId() {
    var go = document.getElementById("rhGo");
    var m = go ? String(go.getAttribute("href") || "").match(/spirit\/([^/?#]+)/) : null;
    if (m) return m[1];
    var art = document.getElementById("rhArt");
    var m2 = art ? String(art.getAttribute("src") || "").match(/([^\/\\]+)\.webp/i) : null;
    return m2 ? m2[1] : "";
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (!t.closest(".rh-moon-art")) return;
    var id = moonId();
    if (id && S(id)) setTimeout(function () { openChat(id); }, 30);
  }, true);

  /* ======================= ⑧ 启动 ======================= */
  refresh();
  setInterval(refresh, 1500);
  onHash();
  window.addEventListener("load", function () { refresh(); onHash(); });

  /* 对外：供其它页面 / 控制台调用 */
  window.AWLive = {
    open: openChat,
    chat: chat,
    persona: persona,
    localAnswer: localAnswer,
    refresh: refresh,
    goto: function () { location.hash = "#/alive"; }
  };
})();
