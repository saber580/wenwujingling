/* =============================================================================
 * js/aw-mystery.js · 燕赵史事推演局（史实解谜推理 · 与茶话会互补）
 * -----------------------------------------------------------------------------
 *  · 和「AI 精灵茶话会」并列：一个自由闲谈，一个带推理任务的史料探究。
 *  · 无凶案。全部是真实存在的文史争议（镇水还是礼佛？实用还是辟邪？猪龙还是龙？）。
 *  · 每局 4 位精灵各持一份线索（正史文献 / 器物纹样 / 地方志后人猜想 / 考古发掘报告），
 *    部分线索互相矛盾——不是谁是坏人，而是史料本身就有不同说法。
 *  · 玩家盘问精灵（精灵只依据自己手里的资料答，不直接给答案）→ 整合 → 提交推演结论
 *    → AI 不判对错，只告诉你：贴近哪一派观点、证据何在、反证几何、延伸到哪里。
 *  · 云端链路沿用本机小桥(127.0.0.1:8898) → 浏览器直连智谱 → 本机研判兜底，
 *    与 aw-live.js 同一套能力，本次独立实现以便单独控制判定所需的更长输出。
 *  · 约定：不改动任何既有 css / js；新路由 #/mystery 经 hashchange 监听挂载
 *    （注册在 app.js 之后，覆盖其默认渲染，与 #/alive 同模式）。
 * =========================================================================== */
(function () {
  "use strict";
  if (window.__AW_MYSTERY__) return;
  window.__AW_MYSTERY__ = 1;

  var REDUCED = false;
  try { REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function S(id) { return (typeof SPIRITS !== "undefined" && SPIRITS[id]) ? SPIRITS[id] : null; }
  function $(id) { return document.getElementById(id); }
  function nameOf(id) { var s = S(id); return s ? s.name : id; }

  /* ============================ ① 样式（自注入） ============================ */
  var CSS = [
    "/* ---- 燕赵史事推演局 #/mystery ---- */",
    ".mys-page{max-width:1180px;margin:0 auto;padding:6px 0 40px;font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;color:#3B2418}",
    ".mys-hero{position:relative;overflow:hidden;border-radius:14px;padding:24px 26px 20px;color:#FFE9B8;",
    "  background:linear-gradient(135deg,#7C0F13 0%,#A5181C 52%,#5A0A0D 100%);",
    "  border:1px solid rgba(255,214,150,.38);box-shadow:0 16px 40px rgba(70,10,6,.34)}",
    ".mys-hero::after{content:\"\";position:absolute;right:-60px;top:-80px;width:280px;height:280px;border-radius:50%;",
    "  background:radial-gradient(circle,rgba(255,214,150,.26) 0%,rgba(255,214,150,0) 66%);pointer-events:none}",
    ".mys-eyebrow{font-size:11.5px;letter-spacing:.24em;opacity:.82;display:block;margin-bottom:6px}",
    ".mys-hero h2{margin:0 0 8px;font-size:25px;letter-spacing:.05em;color:#FFD98A;text-shadow:0 2px 10px rgba(0,0,0,.35)}",
    ".mys-hero p{margin:0;font-size:13.5px;line-height:1.95;opacity:.93;max-width:840px;position:relative;z-index:1}",
    ".mys-stat{display:inline-block;margin-top:12px;font-size:12px;padding:5px 13px;border-radius:999px;",
    "  background:rgba(255,233,184,.14);border:1px solid rgba(255,233,184,.35);position:relative;z-index:1}",
    ".mys-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 14px}",
    ".mys-tab{font-family:inherit;font-size:13.5px;padding:9px 16px;border-radius:10px;cursor:pointer;transition:.18s;",
    "  background:linear-gradient(180deg,#FFFCF3,#F6EAD2);color:#7C2A12;border:1px solid rgba(196,150,74,.6)}",
    ".mys-tab:hover{background:#F3E2C4}",
    ".mys-tab.on{background:linear-gradient(180deg,#C0392F,#A5181C);color:#fff;border-color:#A5181C;box-shadow:0 6px 16px rgba(120,20,10,.3)}",
    ".mys-tab b{display:block;font-size:11px;opacity:.78;font-weight:400;margin-top:2px}",
    ".mys-body{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;align-items:start}",
    "@media (max-width:880px){.mys-body{grid-template-columns:1fr}}",
    ".mys-bg{position:relative;border-radius:12px;padding:16px 18px 16px;background:linear-gradient(180deg,#FFFDF6,#F5E7CB);",
    "  border:1px solid rgba(196,150,74,.6);box-shadow:0 8px 22px rgba(70,40,16,.14)}",
    ".mys-bgk{display:inline-block;font-size:11px;letter-spacing:.18em;color:#fff;background:#A5181C;border-radius:4px;padding:2px 9px;margin-bottom:7px}",
    ".mys-bg h3{margin:0 0 8px;font-size:18px;color:#7C0A0D;letter-spacing:.03em}",
    ".mys-bg p{margin:0;font-size:13.5px;line-height:1.95;color:#4a2f1c}",
    ".mys-prog{margin:12px 2px 8px;font-size:13px;color:#7C2A12}",
    ".mys-prog b{color:#A5181C;font-size:16px}",
    ".mys-spirits{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
    "@media (max-width:480px){.mys-spirits{grid-template-columns:1fr}}",
    ".mys-sp{position:relative;display:flex;align-items:center;gap:10px;padding:10px;background:linear-gradient(180deg,#FFFDF6,#F7EAD0);",
    "  border:1px solid rgba(196,150,74,.6);border-radius:11px;box-shadow:0 6px 16px rgba(70,40,16,.12);transition:.2s}",
    ".mys-sp:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(70,40,16,.2)}",
    ".mys-sp img{width:54px;height:54px;object-fit:contain;flex:none;filter:drop-shadow(0 4px 6px rgba(60,20,8,.24))}",
    ".mys-sp-meta{flex:1;min-width:0}",
    ".mys-role{display:inline-block;font-size:10px;color:#fff;background:#B5732A;border-radius:3px;padding:1px 6px}",
    ".mys-sp-meta b{display:block;font-size:14.5px;color:#7C2A12;margin-top:3px}",
    ".mys-ask{font-family:inherit;font-size:12.5px;padding:6px 13px;border-radius:7px;cursor:pointer;flex:none;",
    "  background:#A5181C;color:#fff;border:1px solid #A5181C}",
    ".mys-ask:hover{background:#7C0F13}",
    ".mys-done{position:absolute;top:8px;right:10px;font-size:10.5px;color:#2e8b57;font-style:normal}",
    ".mys-sp.talked{outline:2px solid rgba(165,24,28,.4)}",
    ".mys-conc{background:linear-gradient(180deg,#FFFCF3,#F6EAD2);border:1px solid rgba(200,154,82,.7);border-radius:12px;padding:16px 18px}",
    ".mys-conc-h{font-size:14.5px;color:#7C0A0D;margin-bottom:9px;font-weight:700}",
    ".mys-ta{width:100%;min-height:120px;resize:vertical;font-family:inherit;font-size:13.5px;line-height:1.8;padding:10px 12px;",
    "  border-radius:9px;border:1px solid rgba(200,154,82,.7);background:#fff;color:#3B2418;box-sizing:border-box}",
    ".mys-ta:focus{outline:none;border-color:#A5181C}",
    ".mys-sub{margin-top:11px;font-family:inherit;font-size:14px;padding:10px 20px;border-radius:9px;cursor:pointer;",
    "  background:linear-gradient(180deg,#C0392F,#A5181C);color:#fff;border:1px solid #A5181C;box-shadow:0 6px 16px rgba(120,20,10,.26)}",
    ".mys-sub:hover{background:#7C0F13}.mys-sub:disabled{opacity:.6;cursor:default}",
    ".mys-verdict{margin-top:16px;border-radius:12px;padding:16px 18px;white-space:pre-wrap;line-height:1.95;font-size:13.5px;",
    "  background:linear-gradient(180deg,#FFF7E8,#FBEACB);border:1px solid rgba(176,124,62,.6);color:#3B2418;display:none}",
    ".mys-verdict.show{display:block;animation:mysIn .3s ease}",
    "@keyframes mysIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
    ".mys-verdict h4{margin:0 0 8px;font-size:15px;color:#7C0A0D}",
    ".mys-via{font-size:10.5px;opacity:.7;margin-top:10px;display:block}",
    ".mys-hint{margin-top:10px;font-size:12px;color:#8a6a44;line-height:1.7}",

    "/* ---- 盘问抽屉（独立于 aw-live 的抽屉，避免 id 冲突） ---- */",
    ".mys-drawer{position:fixed;right:20px;bottom:20px;width:min(396px,94vw);height:min(566px,74vh);z-index:130;",
    "  display:none;flex-direction:column;overflow:hidden;font-family:\"STKaiti\",\"KaiTi\",\"楷体\",serif;",
    "  background:linear-gradient(180deg,#FFFCF3,#F6EAD2);border:1px solid rgba(200,154,82,.75);border-radius:12px;",
    "  box-shadow:0 24px 60px rgba(50,14,6,.5),inset 0 0 0 1px rgba(255,252,240,.6)}",
    ".mys-drawer.show{display:flex;animation:awIn .32s ease}",
    ".mys-d-top{background:linear-gradient(180deg,#A5181C,#6E0B0E);color:#FFE9B8;padding:10px 12px;",
    "  display:flex;align-items:center;gap:10px;flex:none;border-bottom:1px solid rgba(255,214,150,.35)}",
    ".mys-d-top img{width:36px;height:36px;border-radius:50%;background:#FFF8EC;border:1px solid rgba(255,214,150,.8);object-fit:contain}",
    ".mys-d-top b{font-size:15.5px;letter-spacing:.04em;display:block}",
    ".mys-d-top span{font-size:10.5px;opacity:.85;display:block;margin-top:1px}",
    ".mys-d-x{margin-left:auto;cursor:pointer;font-size:18px;opacity:.85;padding:0 4px;line-height:1}",
    ".mys-d-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px}",
    ".mys-d-m{max-width:85%;font-size:13.5px;line-height:1.75;padding:8px 11px;border-radius:9px;word-break:break-word;animation:awPop .26s ease}",
    ".mys-d-m.them{align-self:flex-start;background:#fff;border:1px solid rgba(200,154,82,.4);color:#3B2418}",
    ".mys-d-m.me{align-self:flex-end;background:#A5181C;color:#fff}",
    ".mys-d-m.sys{align-self:center;font-size:11px;color:#8a6a44;background:rgba(200,154,82,.14);border-radius:6px;padding:4px 9px;text-align:center;max-width:90%}",
    ".mys-d-typing{align-self:flex-start;color:#8a6a44;font-size:12px;padding:4px 8px}",
    ".mys-d-chips{padding:0 12px 8px;display:flex;gap:6px;flex-wrap:wrap;flex:none}",
    ".mys-d-chips button{font-family:inherit;font-size:11px;padding:4px 9px;border-radius:5px;cursor:pointer;",
    "  background:#FFF8EC;color:#7C2A12;border:1px solid rgba(200,154,82,.6)}",
    ".mys-d-chips button:hover{background:#A5181C;color:#fff;border-color:#A5181C}",
    ".mys-d-in{display:flex;gap:7px;padding:10px;border-top:1px solid rgba(200,154,82,.4);background:rgba(255,252,244,.7);flex:none}",
    ".mys-d-in input{flex:1;font-family:inherit;font-size:13px;padding:8px 10px;border-radius:7px;",
    "  border:1px solid rgba(200,154,82,.6);background:#fff;color:#3B2418;min-width:0}",
    ".mys-d-in input:focus{outline:none;border-color:#A5181C}",
    ".mys-d-in button{font-family:inherit;background:#A5181C;border:1px solid #A5181C;color:#fff;",
    "  padding:8px 15px;border-radius:7px;cursor:pointer;font-size:13px;flex:none}",
    ".mys-d-in button:hover{background:#7C0F13}",
    "@media (max-width:760px){.mys-drawer{right:0;left:0;bottom:0;width:100%;height:86vh;border-radius:14px 14px 0 0}}"
  ].join("\n");
  (function inject() {
    var st = document.createElement("style");
    st.id = "aw-mystery-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ======================= ② 云端三级链路（独立实现，可控 max_tokens） ======================= */
  var BRIDGE = "http://127.0.0.1:8898";
  var ZHIPU = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
  function KEY() { try { return String(window.__IDENT_DIRECT_KEY || "").trim(); } catch (e) { return ""; } }
  function viaBridge(msgs, mt) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 60000);
    return fetch(BRIDGE + "/api/chat", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, temperature: 0.85, max_tokens: mt || 400 })
    }).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(t);
      if (j && j.ok && j.text) return { via: "小桥·" + (j.model || ""), text: String(j.text).trim() };
      throw new Error((j && j.error) || "小桥无返回");
    }).catch(function (e) {
      clearTimeout(t);
      throw new Error(e && e.name === "AbortError" ? "小桥超时" : (e.message || "小桥未启动"));
    });
  }
  function viaDirect(msgs, mt) {
    var k = KEY();
    if (!k) return Promise.reject(new Error("无钥匙"));
    var models = ["glm-4-flash", "glm-4.7-flash"];
    function go(n, last) {
      if (n >= models.length) return Promise.reject(new Error(last || "云端不可用"));
      var m = models[n];
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 30000);
      return fetch(ZHIPU, {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + k },
        body: JSON.stringify({
          model: m, messages: msgs, temperature: 0.85, max_tokens: mt || 400,
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
  /* 站点上线后：/api/chat 由 cloud-ai.js 接管，走服务器转发到云端大模型。
     本地双击 html 或访问本机时，才回落到小桥 / 直连。 */
  function cloudReady() {
    try {
      return typeof window.identFetchCloud === "function" && /^https?:$/.test(location.protocol);
    } catch (e) { return false; }
  }
  function viaCloud(msgs, mt) {
    return Promise.resolve(window.identFetchCloud("/api/chat", { messages: msgs }, 55000))
      .then(function (j) {
        if (j && j.ok && String(j.text || "").trim())
          return { via: "云端 · " + (j.model || "大模型"), text: String(j.text).trim() };
        throw new Error((j && j.error) || "云端没有返回内容");
      });
  }
  function chat(msgs, mt) {
    if (cloudReady()) {
      return viaCloud(msgs, mt).catch(function (e0) {
        var err = new Error("云端(" + ((e0 && e0.message) || "未接通") + ")");
        err.cloud = true; throw err;
      });
    }
    return viaBridge(msgs, mt).catch(function (e1) {
      return viaDirect(msgs, mt).catch(function (e2) {
        var msg = "小桥(" + e1.message + ")；直连(" + e2.message + ")";
        var err = new Error(msg); err.cloud = true; throw err;
      });
    });
  }

  /* ======================= ③ 三个本子（线索 + 学界观点） ======================= */
  var SCRIPTS = [
    {
      id: "tielion", relic: "沧州铁狮子", era: "后周 · 广顺三年（公元953年）",
      tag: "它为何而铸：镇海？礼佛？地标？",
      bg: "后周广顺三年，沧州铸成一尊巨狮，高约5.6米、重约40吨，昂首怒吼，背负莲座。千年来它究竟为何而铸，史料众说纷纭。四位精灵各持一份线索——部分彼此矛盾。请你盘问、比对，推演出最贴合史实的猜想。",
      spirits: [
        { id: "yinqi", role: "正史文献官", clue: "据《沧州志》等方志与历代金石著录，铁狮额间阳文「镇海吼」三字，腹内原铸《金刚经》残文。古人常于河海要冲铸铁兽以「镇」水患，「镇海吼」之名直指镇海啸、防水涝之愿。地方志多记其为镇水之兽。" },
        { id: "cuojinhu", role: "器物纹样考据", clue: "看它造型：昂首、张口、蹴足，是典型「狮吼」姿态；关键在背负莲座而非马鞍——这与佛教「狮为文殊菩萨坐骑」的图像传统吻合。若只为镇水，何须费巨工铸莲座？莲座分明指向礼佛供养。" },
        { id: "baiyulion", role: "地方志传人", clue: "咱们河北民间代代传说，铁狮子是「镇河神兽」：沧州近海多涝，铸狮以安定风波；也有说它原是开元寺前之物，寺毁狮存。老百姓更信「镇水」这一说，香火不断，还传它夜半吼声能退潮。" },
        { id: "tielion", role: "考古发掘报告", clue: "我即此狮。铸造用「分节叠铸」法，周身可见范块痕迹；背负莲座确为原铸，非后配。铭文「镇海吼」是我的名字，腹内《金刚经》残文尚存。如此国家工程级的体量，非寻常镇物可比。" }
      ],
      schools: [
        { name: "镇海防洪说", keys: ["镇海", "防洪", "水患", "涝", "镇水", "退潮", "海啸"], support: "铭文「镇海吼」、沧州近海多涝的地理、民间镇水传说", against: "背负莲座更似礼佛、方志无直接「防涝工程」记载" },
        { name: "礼佛供养说", keys: ["礼佛", "莲座", "文殊", "佛", "金刚经", "开元寺"], support: "背负莲座、腹内《金刚经》、与开元寺的背景相合", against: "名号叫「镇海」而非佛号、体量更像地标巨制" },
        { name: "复合 / 地标说", keys: ["复合", "地标", "兼具", "既是", "又是", "两者", "折中"], support: "国家工程级铸造、镇水之名与礼佛之象并存", against: "动机略显折中、缺乏单一明确动因的直证" }
      ],
      verdictIntro: "学界至今无定论：镇水、礼佛、地标三说各有依据，也可能本为寺前礼佛巨像、后人因近海多涝而附会出镇水之意——这恰恰说明，历史常是层累叠加的。"
    },
    {
      id: "baozhen", relic: "错金豹镇", era: "西汉 · 中山靖王刘胜墓（满城陵山）",
      tag: "它是做什么用的：实用席镇？辟邪瑞兽？升仙之寄？",
      bg: "西汉中山靖王刘胜墓出土一枚通体错金的豹形小兽，蜷腿伏卧、昂首张口，云气纹与豹斑交错生辉。它本是何用？是压席角的实用小物，还是辟邪的瑞兽，抑或寄寓升仙之念？四份线索，请你辨析。",
      spirits: [
        { id: "wuzhuqian", role: "正史文献官", clue: "汉世「事死如生」，王侯葬具极尽奢华。席镇之制：古人席地而坐，以镇压席四角免其卷翘，此为常制。然诸侯王所用，必不止实用，更彰身份、寓祥瑞——文献与典制皆重此等礼数。" },
        { id: "cuojinhu", role: "器物纹样考据", clue: "看它错金云气纹与豹身斑纹：云气是汉代「升仙」母题，祥瑞之气缭绕；豹为猛兽，古人视能「辟邪驱恶」。错金工艺极奢，显然不只为压席，更含镇邪、显贵之意。" },
        { id: "jinyuyi", role: "地方志传人", clue: "我与豹镇同出刘胜墓。满城汉墓极尽厚葬，玉衣、错金器皆寓「不朽」「升仙」。民间附会：豹镇或助墓主驱邪、护其魂魄升天。后人多信它通灵辟邪，是镇墓之宝。" },
        { id: "baozhen", role: "考古发掘报告", clue: "我出自满城一号墓，与玉衣、博山炉等同出，置于棺椁附近。同墓共出豹镇若干、形制一致。出土位置与共存器物表明：我首先是实用席镇，但错金纹样与猛兽题材，确含辟邪、彰显等级之意。" }
      ],
      schools: [
        { name: "实用席镇说", keys: ["席镇", "实用", "压席", "镇席", "席角"], support: "同出多枚、置于棺椁附近、汉代席镇为常制", against: "错金极奢，不像纯实用物件" },
        { name: "辟邪瑞兽说", keys: ["辟邪", "瑞兽", "驱邪", "镇邪", "云气"], support: "云气纹（升仙母题）+ 豹（驱邪）的图像组合", against: "无文献明言「辟邪」，属图像推演" },
        { name: "厚葬升仙说", keys: ["升仙", "厚葬", "不朽", "魂魄", "通灵"], support: "同墓玉衣、博山炉构成的升仙体系", against: "直接证据弱，多为旁证" },
        { name: "复合说（实用 + 象征）", keys: ["复合", "兼具", "既是", "又是", "实用与", "双重"], support: "考古位置证实用、纹样证象征，二者可并存", against: "略折中，需分主次" }
      ],
      verdictIntro: "最稳妥的看法是「实用为本、象征为饰」：它首先是席镇，错金云气与猛兽题材则寄寓辟邪与等级。把它放进满城汉墓的厚葬体系里看，便能理解汉代人「事死如生」的生死观。"
    },
    {
      id: "yuzhulong", relic: "C形玉龙（红山玉龙）", era: "新石器时代 · 红山文化（约公元前4700—2900年）",
      tag: "它何用何义：祭祀重器？部落图腾？随身佩饰？",
      bg: "红山文化（辽西与冀北一带）出一截C形墨绿玉龙：猪首、龙身、飘举的鬣毛，颈背对钻一孔。它究竟是祭祀重器、部落图腾，还是随身佩饰？学界至今争论。四份线索，请你推演。",
      spirits: [
        { id: "xuanzhi", role: "正史文献官", clue: "红山无文字，正史几无直载。后世《山海经》载「珥蛇乘龙」之巫，近现代考据才把这类玉龙与「龙」挂钩。文献晚出数千年，只能作旁证，不可全信为原貌。" },
        { id: "yubi", role: "器物纹样考据", clue: "看它C形蜷曲、猪首、鬣毛——与红山玉璧、玉玦同属「通神礼玉」体系。猪首或示「猪龙」，古人以猪象征丰饶生育；蜷体似胚胎，寓生生不息。纹样整体指向祭祀、通神。" },
        { id: "tongzuolong", role: "地方志传人", clue: "民间世代崇龙，视龙为祥瑞、雨泽之主。冀北辽西多龙崇拜传说，这玉龙或被奉为部落图腾、族徽，护佑族人、司掌风雨。乡野间至今把它当「中华第一龙」来敬。" },
        { id: "yuzhulong", role: "考古发掘报告", clue: "我出自红山墓葬，多置于墓主胸部、手部等尊位，非随意弃置。C形、猪首、对钻系孔——孔可系挂。出土于尊位表明：我是身份与信仰的象征，极可能为祭祀重器或佩挂的礼玉，非普通玩物。" }
      ],
      schools: [
        { name: "祭祀礼器说", keys: ["祭祀", "礼器", "通神", "重器", "礼玉"], support: "与玉礼器体系同出、多置于墓主尊位", against: "有系孔，似可佩戴" },
        { name: "图腾 / 族徽说", keys: ["图腾", "族徽", "部落", "崇龙", "祥瑞"], support: "龙崇拜传统、独特造型标识性强", against: "缺乏族群文献佐证" },
        { name: "佩饰说", keys: ["佩饰", "佩戴", "系挂", "挂饰"], support: "对钻系孔可挂", against: "出土于尊位，非身边杂饰" },
        { name: "复合说（礼玉兼佩）", keys: ["复合", "兼具", "既是", "又是", "礼玉兼", "双重"], support: "既处尊位又带系孔，可祭可佩", against: "略折中" }
      ],
      verdictIntro: "红山玉龙是「龙的雏形」重要实证，连接了猪龙崇拜与后世中华龙形象。无论当作礼玉、图腾还是佩饰，它都说明：早在新石器时代，燕赵大地上的先民已有了成熟的信仰与审美。"
    }
  ];

  /* ======================= ④ 线索精灵「盘问」对话 ======================= */
  function spiritPersona(sc, sp) {
    return [
      "你是「" + nameOf(sp.id) + "」——一件文物精灵，在【燕赵史事推演局】中扮演「" + sp.role + "」线索持有者，本局推演的文物是「" + sc.relic + "」。",
      "",
      "【你手里唯一的资料】（必须严格依据它回答，绝不编造或超出）",
      sp.clue,
      "",
      "【规矩】",
      "1. 用第一人称「我」，以文物精灵口吻说话，带点你自己的脾气；",
      "2. 只依据上面这份资料答，不知道就说「这我可不敢乱讲，你得去问别的精灵」；",
      "3. 不要替玩家下结论，只提供线索、引导他自己推理；",
      "4. 每次 1~3 句、不超过 90 字；不承认自己是 AI、模型或程序。"
    ].join("\n");
  }
  function spiritGreeting(sc, sp) {
    return "用一句话报出你在本局里的身份（" + sp.role + "），并说清你手里这份线索大致讲什么，勾起玩家来盘问你。不超过 60 字。";
  }
  function localSpiritFallback(sp) {
    var first = String(sp.clue || "").split(/[。！？]/)[0];
    return "（本机离线）" + (first || nameOf(sp.id) + "正守着一份线索") + "……更细的，等联网我再同你细说。";
  }

  /* ======================= ⑤ 提交结论 · AI 判定 ======================= */
  function judgeSystem(sc) {
    var brief = "本案：" + sc.relic + "（" + sc.era + "）。" + sc.bg +
      "\n\n四方线索：\n" + sc.spirits.map(function (sp, i) {
        return "（" + (i + 1) + "）" + sp.role + "［" + nameOf(sp.id) + "］：" + sp.clue;
      }).join("\n");
    var schoolsTxt = sc.schools.map(function (s) {
      return "· " + s.name + "（支持：" + s.support + "；反证：" + s.against + "）";
    }).join("\n");
    return "你是「燕赵史事推演局」的史学裁判，风格像鼓励探究的导师。\n" +
      brief + "\n\n学界主要观点：\n" + schoolsTxt + "\n\n" +
      "玩家会提交他对本案的推演结论。请：①判断其结论最贴近哪一派（可指复合派）；②列出 2~3 条支持证据；③指出 1~2 条冲突的反证；④用一句话做延伸拓展。\n" +
      "用下面这个结构回答（不要代码块、不要 markdown 标题符号，纯中文换行列点）：\n" +
      "一、你的结论最贴近：{学派名}\n二、支持它的证据：\n三、与之冲突的反证：\n四、延伸知识：\n" +
      "语气平和、鼓励思辨，300 字以内。";
  }
  function localVerdict(sc, concl) {
    var best = null, bestN = 0;
    sc.schools.forEach(function (s) {
      var n = 0;
      s.keys.forEach(function (k) { if (concl.indexOf(k) >= 0) n++; });
      if (n > bestN) { bestN = n; best = s; }
    });
    if (!best) best = sc.schools[sc.schools.length - 1];
    return "【离线研判 · 本机史料库】\n一、你的结论最贴近：" + best.name +
      "\n二、支持它的证据：\n" + best.support +
      "\n三、与之冲突的反证：\n" + best.against +
      "\n四、延伸知识：\n" + sc.verdictIntro +
      "\n（云端未接通，已用本地史料库研判；联网后结论会更细致，并能结合你措辞里的新角度。）";
  }

  /* ======================= ⑥ 页面渲染 ======================= */
  var ST = { idx: 0, talked: {} };

  function mount() {
    var app = $("app");
    if (!app) return;
    if (app.querySelector(".mys-page")) { paint(); return; }
    app.innerHTML = pageHTML();
    try { document.body.dataset.page = "mystery"; } catch (e) {}
    var navs = document.querySelectorAll(".topnav .nav-item");
    for (var i = 0; i < navs.length; i++) {
      navs[i].classList.toggle("active", navs[i].getAttribute("data-nav") === "poster");
    }
    bind();
    paint();
    setTimeout(paint, 60);
  }
  function pageHTML() {
    return '<div class="mys-page">' +
      '<div class="mys-hero">' +
        '<span class="mys-eyebrow">燕赵史事推演局 · 史实解谜推理</span>' +
        '<h2>史料博弈，线索整合，独立思辨</h2>' +
        '<p>没有凶案，只有真实存在的文史争议。四位精灵各持一份线索——正史文献 / 器物纹样 / 地方志后人猜想 / 考古发掘报告，部分彼此矛盾。像考古研究者一样：盘问、比对、自己推导。提交结论后，AI 不判对错，只告诉你——你贴近哪一派观点、证据何在、反证几何、还能延伸到哪里。</p>' +
        '<span class="mys-stat">与「AI 精灵茶话会」互补：一个自由闲谈，一个史料推理</span>' +
      '</div>' +
      '<div class="mys-tabs" id="mysTabs"></div>' +
      '<div class="mys-body" id="mysBody"></div>' +
    '</div>';
  }
  function paint() {
    var tabs = $("mysTabs"); if (!tabs) return;
    tabs.innerHTML = SCRIPTS.map(function (sc, i) {
      return '<button type="button" class="mys-tab' + (i === ST.idx ? " on" : "") + '" data-i="' + i + '">' +
        esc(sc.relic) + '<b>' + esc(sc.tag) + '</b></button>';
    }).join("");
    var body = $("mysBody"); if (!body) return;
    var sc = SCRIPTS[ST.idx];
    var talked = ST.talked[sc.id] || {};
    body.innerHTML =
      '<div class="mys-left">' +
        '<div class="mys-bg"><span class="mys-bgk">本局谜题</span><h3>' + esc(sc.relic) + ' · ' + esc(sc.tag) + '</h3><p>' + esc(sc.bg) + '</p></div>' +
        '<div class="mys-prog">已盘问 <b id="mysPC">' + Object.keys(talked).length + '</b> / 4 位线索精灵</div>' +
        '<div class="mys-spirits" id="mysSpirits">' +
          sc.spirits.map(function (sp, i) {
            var done = talked[i] ? "" : "hidden";
            return '<div class="mys-sp' + (talked[i] ? " talked" : "") + '" data-i="' + i + '">' +
              '<img src="精灵/透明/' + esc(sp.id) + '.webp" alt="' + esc(nameOf(sp.id)) + '" loading="lazy">' +
              '<div class="mys-sp-meta"><span class="mys-role">' + esc(sp.role) + '</span><b>' + esc(nameOf(sp.id)) + '</b></div>' +
              '<button type="button" class="mys-ask" data-i="' + i + '">盘问</button>' +
              '<i class="mys-done" ' + done + '>✓ 已盘问</i>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="mys-right">' +
        '<div class="mys-conc">' +
          '<div class="mys-conc-h">整合线索，写下你的推演结论</div>' +
          '<textarea class="mys-ta" id="mysTa" placeholder="例：我认为铁狮子本为开元寺前礼佛巨像，莲座与《金刚经》为证；「镇海吼」之名是后人因近海多涝而附会的镇水之意……"></textarea>' +
          '<button type="button" class="mys-sub" id="mysSubmit">提交推演结论</button>' +
          '<div class="mys-hint">提示：先把四位精灵都盘问一遍，证据凑齐再下结论，判定会更准。</div>' +
        '</div>' +
        '<div class="mys-verdict" id="mysVerdict"></div>' +
      '</div>';
    bindBody();
  }
  function bind() {
    var tabs = $("mysTabs");
    if (tabs) tabs.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".mys-tab") : null;
      if (!b) return;
      ST.idx = parseInt(b.getAttribute("data-i"), 10) || 0;
      ST.talked = {};
      paint();
    });
  }
  function bindBody() {
    var sp = $("mysSpirits");
    if (sp) sp.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".mys-ask") : null;
      if (!b) return;
      openSpirit(parseInt(b.getAttribute("data-i"), 10) || 0);
    });
    var sub = $("mysSubmit");
    if (sub) sub.addEventListener("click", submitVerdict);
  }

  /* ---- 盘问抽屉 ---- */
  var drawer, dLog, dName, dRole, dImg, dChips, dInp, dGo, dX, CUR = null, DHIST = [], DBUSY = false;
  function ensureDrawer() {
    if (drawer) return;
    drawer = document.createElement("div");
    drawer.className = "mys-drawer";
    drawer.innerHTML =
      '<div class="mys-d-top"><img id="mysDImg" src="" alt=""><div><b id="mysDName">—</b><span id="mysDRole">—</span></div><span class="mys-d-x" id="mysDX">✕</span></div>' +
      '<div class="mys-d-log" id="mysDLog"></div>' +
      '<div class="mys-d-chips" id="mysDChips"></div>' +
      '<div class="mys-d-in"><input id="mysDInp" placeholder="盘问它手里的线索…"><button id="mysDGo">盘问</button></div>';
    document.body.appendChild(drawer);
    dLog = $("mysDLog"); dName = $("mysDName"); dRole = $("mysDRole"); dImg = $("mysDImg");
    dChips = $("mysDChips"); dInp = $("mysDInp"); dGo = $("mysDGo"); dX = $("mysDX");
    dX.onclick = function () { drawer.classList.remove("show"); };
    dGo.onclick = sendSpirit;
    dInp.onkeydown = function (e) { if (e.key === "Enter") sendSpirit(); };
    dChips.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      dInp.value = b.getAttribute("data-q") || b.textContent;
      sendSpirit();
    });
  }
  function dPut(who, txt) {
    var d = document.createElement("div");
    d.className = "mys-d-m " + who; d.textContent = txt;
    dLog.appendChild(d); dLog.scrollTop = dLog.scrollHeight;
  }
  function dSys(txt) { dPut("sys", txt); }
  function openSpirit(i) {
    ensureDrawer();
    var sc = SCRIPTS[ST.idx], sp = sc.spirits[i];
    CUR = { sc: sc, sp: sp, i: i }; DHIST = []; DBUSY = false;
    dImg.src = "精灵/透明/" + sp.id + ".webp";
    dName.textContent = nameOf(sp.id);
    dRole.textContent = sp.role;
    dLog.innerHTML = "";
    drawer.classList.add("show");
    dChips.innerHTML = ['你的线索是什么？', '你赞同别的精灵吗？', '给我点提示'].map(function (q) {
      return '<button type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>';
    }).join("");
    dSys("已请出「" + nameOf(sp.id) + "」（" + sp.role + "）。它只依据手里的资料答，不会直接给你答案——多盘问几句。");
    DBUSY = true;
    var tp = document.createElement("div"); tp.className = "mys-d-typing";
    tp.textContent = nameOf(sp.id) + " 正在整理手里的线索…"; dLog.appendChild(tp);
    chat([{ role: "system", content: spiritPersona(sc, sp) },
          { role: "user", content: spiritGreeting(sc, sp) }], 400)
      .then(function (r) {
        tp.remove(); dPut("them", r.text); DHIST.push({ role: "assistant", content: r.text });
      })
      .catch(function () {
        tp.remove(); dPut("them", localSpiritFallback(sp));
      })
      .then(function () { DBUSY = false; });
  }
  function sendSpirit() {
    if (!CUR || DBUSY) return;
    var q = String(dInp.value || "").trim();
    if (!q) return;
    dInp.value = ""; dPut("me", q); DHIST.push({ role: "user", content: q });
    DBUSY = true;
    var tp = document.createElement("div"); tp.className = "mys-d-typing";
    tp.textContent = CUR.sp.role + " 正在回想…"; dLog.appendChild(tp);
    chat([{ role: "system", content: spiritPersona(CUR.sc, CUR.sp) }].concat(DHIST.slice(-7)), 400)
      .then(function (r) {
        tp.remove(); dPut("them", r.text); DHIST.push({ role: "assistant", content: r.text });
      })
      .catch(function () {
        tp.remove(); dPut("them", "（云端这会儿没接上）" + localSpiritFallback(CUR.sp).replace("（本机离线）", ""));
      })
      .then(function () { DBUSY = false; });
  }

  /* ---- 提交结论判定 ---- */
  function submitVerdict() {
    var ta = $("mysTa"); if (!ta) return;
    var concl = String(ta.value || "").trim();
    var v = $("mysVerdict"); if (!v) return;
    if (concl.length < 12) {
      v.className = "mys-verdict show";
      v.textContent = "再多写几句吧～至少把你的推理过程和依据说清楚（12 字以上），AI 才好帮你研判贴向哪一派。";
      return;
    }
    var sc = SCRIPTS[ST.idx];
    v.className = "mys-verdict show";
    v.textContent = "AI 裁判正在比对四方线索、研判你的结论……";
    chat([{ role: "system", content: judgeSystem(sc) },
          { role: "user", content: "我的推演结论：" + concl }], 900)
      .then(function (r) {
        v.innerHTML = "";
        var h = document.createElement("h4"); h.textContent = "📜 史事推演 · 裁判意见";
        v.appendChild(h);
        var p = document.createElement("div"); p.textContent = r.text; v.appendChild(p);
        var via = document.createElement("span"); via.className = "mys-via";
        via.textContent = "判定来源：" + r.via + " · 本局「" + sc.relic + "」";
        v.appendChild(via);
      })
      .catch(function (e) {
        var txt = localVerdict(sc, concl);
        v.innerHTML = "";
        var h = document.createElement("h4"); h.textContent = "📜 史事推演 · 本机研判";
        v.appendChild(h);
        var p = document.createElement("div"); p.textContent = txt; v.appendChild(p);
        var via = document.createElement("span"); via.className = "mys-via";
        via.textContent = "云端未接通，已落回本机史料库研判";
        v.appendChild(via);
      });
  }

  /* 盘问后刷新「已盘问」状态（不重载整个页面，仅更新标记） */
  function markTalked(i) {
    var sc = SCRIPTS[ST.idx];
    ST.talked[sc.id] = ST.talked[sc.id] || {};
    ST.talked[sc.id][i] = true;
    var cards = document.querySelectorAll("#mysSpirits .mys-sp");
    if (cards[i]) {
      cards[i].classList.add("talked");
      var d = cards[i].querySelector(".mys-done");
      if (d) d.hidden = false;
    }
    var pc = $("mysPC");
    if (pc) pc.textContent = Object.keys(ST.talked[sc.id]).length;
  }
  /* 在 openSpirit 关闭时（或对话中）标记已盘问：简单做法——打开即记一笔 */
  var _origOpen = openSpirit;
  openSpirit = function (i) { _origOpen(i); markTalked(i); };

  /* ======================= ⑦ 路由 #/mystery ======================= */
  function isMine() {
    return String(location.hash || "").replace(/^#\/?/, "").split("/")[0] === "mystery";
  }
  function onHash() { if (isMine()) setTimeout(mount, 0); }
  window.addEventListener("hashchange", onHash);
  if (isMine()) setTimeout(mount, 0);
  window.addEventListener("load", function () { if (isMine()) mount(); });

  /* 对外（控制台 / 其它页面） */
  window.AWMystery = {
    open: function () { location.hash = "#/mystery"; },
    scripts: SCRIPTS
  };
})();
