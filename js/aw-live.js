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

    "/* ---- 文物来电：3D 悬浮手机（机身取 uiverse 那款，浮动取 hover.dev，配色换成本站红金） ---- */",
    ".aw-hero{display:grid;grid-template-columns:minmax(0,1fr) 208px;gap:20px;align-items:center}",
    ".aw-hero-txt{min-width:0;position:relative;z-index:1}",
    ".aw-call{position:relative;display:flex;flex-direction:column;align-items:center;gap:9px;perspective:760px}",
    ".aw-phone{position:relative;width:168px;height:322px;transform-style:preserve-3d}",
    /* 背后那层错位金板：对应参考图里紫色那圈立体厚度 */
    /* 厚度用阴影叠出来，不要另起一层 3D 平面 —— 那层不跟着机身转，会整块盖到屏幕上 */
    ".aw-phone-body{position:absolute;inset:0;border-radius:26px;padding:7px;box-sizing:border-box;",
    "  background:linear-gradient(160deg,#2E1B14,#120A08);",
    "  box-shadow:9px 10px 0 -2px #D9B571,12px 14px 0 -2px #8E6A32,",
    "    0 20px 40px rgba(20,4,2,.46),inset 0 0 0 1px rgba(255,214,150,.22);",
    "  transform:rotateY(-11deg) rotateX(4deg) rotateZ(-1.2deg);animation:awPhoneFloat 6.4s ease-in-out infinite}",
    "@keyframes awPhoneFloat{",
    "  0%,100%{transform:rotateY(-11deg) rotateX(4deg) rotateZ(-1.2deg) translateY(0)}",
    "  50%{transform:rotateY(-11deg) rotateX(4deg) rotateZ(-1.2deg) translateY(-9px)}}",
    ".aw-phone-screen{position:relative;width:100%;height:100%;border-radius:20px;overflow:hidden;",
    "  background:linear-gradient(180deg,#FFFCF3,#FAF0D9);display:flex;flex-direction:column}",
    ".aw-phone-notch{position:absolute;left:50%;top:7px;transform:translateX(-50%);width:46px;height:8px;",
    "  border-radius:0 0 6px 6px;background:#120A08;z-index:3}",
    ".aw-phone-side{position:absolute;right:-2px;width:2px;border-radius:2px;background:#1C110C}",
    ".aw-phone-side.up{top:64px;height:26px}.aw-phone-side.dn{bottom:66px;height:34px}",
    ".aw-ps-bar{display:flex;align-items:center;justify-content:space-between;gap:6px;flex:none;",
    "  padding:9px 9px 3px;font-size:8px;letter-spacing:.08em;color:#8A6A44}",
    ".aw-ps-ic{font-size:7.5px;letter-spacing:.06em;color:#8A6A44}",
    /* 屏幕上方那块「空白地」：随时换一位精灵 */
    ".aw-ps-stage{flex:1;position:relative;display:flex;flex-direction:column;align-items:center;",
    "  justify-content:center;gap:6px;padding:0 8px 4px}",
    ".aw-ps-spirit{width:92px;height:92px;object-fit:contain;",
    "  filter:drop-shadow(0 8px 14px rgba(120,60,10,.22));animation:awPsBreath 3.6s ease-in-out infinite}",
    "@keyframes awPsBreath{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-5px) scale(1.03)}}",
    ".aw-ps-spirit.swap{animation:awPsSwap .36s ease}",
    "@keyframes awPsSwap{from{opacity:0;transform:translateY(12px) scale(.9)}to{opacity:1;transform:none}}",
    ".aw-ps-name{font-size:12.5px;letter-spacing:.1em;color:#7C2A12}",
    ".aw-ps-sub{font-size:9px;letter-spacing:.08em;color:#A9885E;margin-top:-3px}",
    ".aw-ps-hang{position:absolute;right:6px;top:2px;z-index:2;display:none;cursor:pointer;",
    "  font-family:inherit;font-size:8.5px;letter-spacing:.06em;color:#7C2A12;background:rgba(255,248,236,.9);",
    "  border:1px solid rgba(176,124,62,.55);border-radius:999px;padding:2px 7px}",
    ".aw-call.ringing .aw-ps-hang{display:block}",
    /* 底部弧面 + 开始键：参考图里那圈紫色改成红金 */
    ".aw-ps-dock{flex:none;height:84px;display:flex;align-items:flex-end;justify-content:center;",
    "  padding:0 12px 12px;border-radius:100% 100% 0 0 / 44px 44px 0 0;",
    "  background:linear-gradient(180deg,#C0392F,#7C0F13);box-shadow:inset 0 1px 0 rgba(255,214,150,.4)}",
    ".aw-ps-go{width:100%;font-family:inherit;font-size:12px;letter-spacing:.26em;padding:8px 0 8px 4px;",
    "  border-radius:8px;border:1px solid rgba(255,214,150,.72);cursor:pointer;transition:.2s;",
    "  background:linear-gradient(180deg,#FFFBEF,#F6E6C6);color:#A5181C}",
    ".aw-ps-go:hover{background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.22)}",
    /* 来电态：机身抖动 + 圈圈扩散 + 键变红 */
    ".aw-call.ringing .aw-phone-body{animation:awPhoneRing .46s ease-in-out infinite}",
    "@keyframes awPhoneRing{",
    "  0%,100%{transform:rotateY(-11deg) rotateX(4deg) rotateZ(-1.2deg) translateX(0)}",
    "  25%{transform:rotateY(-11deg) rotateX(4deg) rotateZ(-2.6deg) translateX(-3px)}",
    "  75%{transform:rotateY(-11deg) rotateX(4deg) rotateZ(.2deg) translateX(3px)}}",
    ".aw-call.ringing .aw-ps-stage::before,.aw-call.ringing .aw-ps-stage::after{content:\"\";",
    "  position:absolute;left:50%;top:38%;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:50%;",
    "  border:1px solid rgba(193,57,47,.55);animation:awPsRing 1.7s ease-out infinite;pointer-events:none}",
    ".aw-call.ringing .aw-ps-stage::after{animation-delay:.85s}",
    "@keyframes awPsRing{0%{transform:scale(.62);opacity:.85}100%{transform:scale(1.55);opacity:0}}",
    ".aw-call.ringing .aw-ps-go{background:linear-gradient(180deg,#C0392F,#8E1418);color:#FFF3D6;",
    "  border-color:rgba(255,214,150,.85);animation:awPsGoPulse 1.5s ease-in-out infinite}",
    "@keyframes awPsGoPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,214,150,.55)}50%{box-shadow:0 0 0 7px rgba(255,214,150,0)}}",
    ".aw-call-hint{margin:0;max-width:210px;text-align:center;font-size:10.5px;line-height:1.7;",
    "  letter-spacing:.02em;color:rgba(255,233,184,.84)}",
    /* ---- 通话中：键变麦克风，屏底给一行"听着…/你说…" ---- */
    ".aw-call.talking .aw-ps-hang{display:block}",
    ".aw-call.talking .aw-ps-go{background:linear-gradient(180deg,#B33A2E,#7C0F13);color:#FFF3D6;",
    "  border-color:rgba(255,214,150,.9);letter-spacing:.14em}",
    ".aw-ps-heard{position:absolute;left:6px;right:6px;bottom:0;max-height:27px;overflow:hidden;",
    "  text-align:center;font-size:9px;line-height:1.5;color:#8A5A2E;opacity:0;transition:opacity .2s;",
    "  pointer-events:none;word-break:break-all}",
    ".aw-call.talking .aw-ps-heard{opacity:1}",
    /* 听着的时候：屏顶三根跳动的音量条 */
    ".aw-ps-live{position:absolute;left:0;right:0;top:5px;display:none;align-items:center;",
    "  justify-content:center;gap:3px;pointer-events:none}",
    ".aw-call.listening .aw-ps-live{display:flex}",
    ".aw-ps-live i{width:2px;height:10px;border-radius:2px;background:#C0392F;",
    "  animation:awPsBar .9s ease-in-out infinite}",
    ".aw-ps-live i:nth-child(2){height:15px;animation-delay:.16s}",
    ".aw-ps-live i:nth-child(3){animation-delay:.32s}",
    "@keyframes awPsBar{0%,100%{transform:scaleY(.42);opacity:.55}50%{transform:scaleY(1.15);opacity:1}}",
    ".aw-call.listening .aw-phone-screen{box-shadow:inset 0 0 0 2px rgba(192,57,47,.5)}",
    ".aw-call.listening .aw-ps-go{background:linear-gradient(180deg,#C0392F,#8E1418);color:#FFF3D6}",
    "@media (max-width:900px){.aw-hero{grid-template-columns:1fr;gap:14px}",
    "  .aw-call{margin:0 auto}.aw-phone{width:140px;height:268px}.aw-ps-spirit{width:74px;height:74px}",
    "  .aw-ps-dock{height:82px}.aw-call-hint{max-width:240px}}",
    "@media (prefers-reduced-motion:reduce){.aw-phone-body,.aw-ps-spirit,.aw-call.ringing .aw-phone-body,",
    "  .aw-call.ringing .aw-ps-go{animation:none}.aw-call.ringing .aw-ps-stage::before,",
    "  .aw-call.ringing .aw-ps-stage::after{animation:none;opacity:.3}}",

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
    ".aw-typing{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;color:#8a6a44;font-size:12px;",
    "  padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.72);border:1px dashed rgba(200,154,82,.45)}",
    ".aw-typing .aw-dots{display:inline-flex;gap:3px;align-items:center}",
    ".aw-typing .aw-dots i{width:4px;height:4px;border-radius:50%;background:#A5181C;opacity:.3;animation:awDot 1.1s ease-in-out infinite}",
    ".aw-typing .aw-dots i:nth-child(2){animation-delay:.16s}",
    ".aw-typing .aw-dots i:nth-child(3){animation-delay:.32s}",
    "@keyframes awDot{0%,100%{opacity:.25;transform:translateY(0)}45%{opacity:1;transform:translateY(-2px)}}",
    ".aw-m.them.aw-live::after{content:\"\";display:inline-block;width:2px;height:1em;margin-left:2px;",
    "  vertical-align:-.12em;background:#A5181C;animation:awCaret 1s steps(2,start) infinite}",
    "@keyframes awCaret{0%,62%{opacity:1}63%,100%{opacity:.18}}",
    "@media (prefers-reduced-motion:reduce){.aw-typing .aw-dots i{animation:none;opacity:.6}",
    "  .aw-m.them.aw-live::after{animation:none;opacity:.65}}",
    "/* ---- 文物之声：让它开口 ---- */",
    ".aw-voice{display:flex;align-items:center;gap:7px;padding:9px 12px 0;flex:none}",
    ".aw-voice button{font-family:inherit;font-size:11.5px;letter-spacing:.04em;padding:5px 11px;border-radius:6px;",
    "  cursor:pointer;background:linear-gradient(180deg,#FFF8EC,#F3E3C6);color:#7C2A12;",
    "  border:1px solid rgba(200,154,82,.7);display:inline-flex;align-items:center;gap:5px}",
    ".aw-voice button:hover{background:#A5181C;color:#FFF3D6;border-color:#A5181C}",
    ".aw-voice button[disabled]{opacity:.45;cursor:not-allowed}",
    ".aw-voice .aw-spk{margin-left:auto;font-size:11px}",
    ".aw-voice .aw-spk[aria-pressed=\"false\"]{color:#9a8262;background:#F6EEDA;border-style:dashed}",
    /* 抽屉里的「听它讲讲自己」：和精灵图上那枚 💬 红圈同一套视觉，
       点一下开讲、再点停下；讲完自动复位，可反复重播。 */
    ".aw-voice .aw-orb{width:40px;height:40px;padding:0;flex:none;justify-content:center;position:relative;",
    "  border-radius:50%;border:1px solid rgba(255,214,150,.85);",
    "  background:linear-gradient(180deg,#C0392F,#A5181C);color:#FFE9B8;",
    "  box-shadow:0 3px 10px rgba(60,14,6,.35);font-size:19px;line-height:1;",
    "  transition:transform .2s,box-shadow .2s}",
    ".aw-voice .aw-orb:hover{transform:scale(1.08);",
    "  background:linear-gradient(180deg,#C0392F,#A5181C);color:#FFE9B8;border-color:rgba(255,214,150,.85)}",
    ".aw-voice .aw-orb .aw-orb-face{font-size:19px;line-height:1;filter:drop-shadow(0 1px 1px rgba(60,14,6,.35))}",
    ".aw-voice .aw-orb.playing{background:linear-gradient(180deg,#8E1418,#6B0D10);",
    "  box-shadow:0 0 0 4px rgba(193,57,47,.18),0 3px 10px rgba(60,14,6,.35)}",
    ".aw-voice .aw-orb.playing::after{content:\"\";position:absolute;inset:-6px;border-radius:50%;",
    "  border:1px solid rgba(193,57,47,.45);animation:awOrbPulse 1.4s ease-out infinite}",
    "@keyframes awOrbPulse{0%{transform:scale(.9);opacity:.8}100%{transform:scale(1.35);opacity:0}}",
    ".aw-orb-label{font-size:11.5px;color:#8a6a44;letter-spacing:.04em;white-space:nowrap}",
    ".aw-orb-label.playing{color:#A5181C}",
    "@media (max-width:760px){.aw-voice .aw-orb{width:34px;height:34px}",
    "  .aw-voice .aw-orb .aw-orb-face{font-size:16px}}",
    "@media (prefers-reduced-motion:reduce){.aw-voice .aw-orb.playing::after{animation:none}}",
    ".aw-top img.aw-talking{animation:awTalk .62s ease-in-out infinite;box-shadow:0 0 0 3px rgba(255,214,150,.55)}",
    "@keyframes awTalk{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}",
    "@media (prefers-reduced-motion:reduce){.aw-top img.aw-talking{animation:none}}",
    ".aw-m.them.aw-now{border-color:#A5181C;background:#FFF6E2}",
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
    /* ---- 通话条（来电接通后才有）---- */
    ".aw-callbar{display:none;gap:8px;padding:9px 10px 0;flex:none}",
    ".aw-chat.call .aw-callbar{display:flex}",
    ".aw-mic{flex:1;font-family:inherit;font-size:13px;letter-spacing:.04em;padding:9px 10px;",
    "  border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;",
    "  transition:.18s;background:linear-gradient(180deg,#FFF8EC,#F3E3C6);color:#7C2A12;",
    "  border:1px solid rgba(200,154,82,.7)}",
    ".aw-mic:hover{background:#fff}",
    ".aw-mic-ic{font-size:14px;line-height:1}",
    ".aw-chat.listening .aw-mic{background:linear-gradient(180deg,#C0392F,#8E1418);",
    "  color:#FFF3D6;border-color:#8E1418;box-shadow:0 0 0 3px rgba(192,57,47,.16)}",
    ".aw-chat.listening .aw-mic-ic{animation:awMicPulse 1s ease-in-out infinite}",
    "@keyframes awMicPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:.72}}",
    ".aw-end{font-family:inherit;font-size:12.5px;padding:9px 15px;border-radius:8px;cursor:pointer;",
    "  background:#fff;color:#A5181C;border:1px solid rgba(165,24,28,.55);flex:none}",
    ".aw-end:hover{background:#A5181C;color:#fff}",
    "@media (prefers-reduced-motion:reduce){.aw-chat.listening .aw-mic-ic{animation:none}}",
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
  function chat(msgs, onDelta) {
    if (cloudReady()) {
      /* 有订阅就走流式：它讲的时候字是一个一个出来的，而不是憋完一屏再"啪"地出现 */
      if (typeof onDelta === "function" && typeof window.cloudChatStream === "function") {
        return window.cloudChatStream(msgs, { onDelta: onDelta }).then(function (j) {
          if (j && j.ok && String(j.text || "").trim())
            return { via: "云端 · " + (j.model || "大模型"), text: String(j.text).trim() };
          throw new Error((j && j.error) || "云端没有返回内容");
        });
      }
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
    '<div class="aw-voice">' +
      '<button type="button" class="aw-orb" id="awPlay" aria-label="听它讲讲自己" title="听它讲讲自己">' +
        '<span class="aw-orb-face">💬</span>' +
      '</button>' +
      '<span class="aw-orb-label" id="awPlayLabel">听它讲讲自己</span>' +
      '<button type="button" class="aw-spk" id="awSpk" aria-pressed="true">有声</button>' +
    '</div>' +
    '<div class="aw-chips" id="awChips"></div>' +
    /* 通话条：只在来电接通后出现。手机上下半屏被抽屉占着，
       手机上的「说话」键够不到，所以真正的操作入口放这儿。 */
    '<div class="aw-callbar" id="awCallBar">' +
      '<button type="button" class="aw-mic" id="awMic" aria-pressed="false">' +
        '<span class="aw-mic-ic">🎙</span><span id="awMicTxt">点一下说话</span>' +
      '</button>' +
      '<button type="button" class="aw-end" id="awEnd">挂断</button>' +
    '</div>' +
    '<div class="aw-in"><input id="awInp" placeholder="和它说点什么…"><button id="awGo">发送</button></div>';
  document.body.appendChild(box);

  var $ = function (id) { return document.getElementById(id); };
  var logEl = $("awLog"), CUR = null, HIST = [], BUSY = false;

  /* 关抽屉必须真的闭嘴：停预生成音频 / 浏览器合成，并作废还在路上的
     /api/tts 结果。只隐藏面板的话，声音会一直播到段落结束。 */
  function closeChat() {
    if (window.Voice) window.Voice.stop();
    resetVoiceUI(); syncSpk();
    box.classList.remove("show");
    vrHangup();                 /* 关抽屉等于挂断：别让麦克风还在偷偷开着 */
  }
  $("awX").onclick = closeChat;
  $("awGo").onclick = send;
  /* 通话条：麦克风与挂断。手机屏被抽屉盖住时，这里才是够得着的入口 */
  $("awMic").onclick = function () { if (VR.on) vrStop(); else vrStart(); };
  $("awEnd").onclick = function () { callReset("已挂断 · 按「开始」再随机一位"); };
  $("awInp").onkeydown = function (e) { if (e.key === "Enter") send(); };

  /* ---- 文物之声：让它开口讲自己的故事 ----
     音频由 tools/gen_voice.py 预生成到 audio/{id}/seg{n}.mp3，
     按材质配音色；拿不到音频时 js/voice.js 会退到浏览器合成。 */
  var STORY = false;

  function syncSpk() {
    var b = $("awSpk");
    if (!b) return;
    var on = !(window.Voice && !window.Voice.enabled());
    b.textContent = on ? "有声" : "静音";
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }

  /* 把红圈复位成「可播放」状态：💬 图标 + 说明文字，讲完/被打断/换人都会走到这里 */
  function resetVoiceUI() {
    STORY = false;
    var b = $("awPlay");
    if (b) {
      b.classList.remove("playing");
      b.disabled = false;
      b.setAttribute("aria-label", "听它讲讲自己");
      b.title = "听它讲讲自己（再点一次可重播）";
      var face = b.querySelector(".aw-orb-face");
      if (face) face.textContent = "💬";
    }
    var lab = $("awPlayLabel");
    if (lab) { lab.textContent = "听它讲讲自己"; lab.classList.remove("playing"); }
    var img = $("awImg");
    if (img) img.classList.remove("aw-talking");
    var cur = logEl.querySelector(".aw-m.aw-now");
    if (cur) cur.classList.remove("aw-now");
  }

  function playStory() {
    if (!CUR || !window.Voice) return;
    if (!window.Voice.enabled()) { sys("声音关着，点右侧「静音」打开再试"); return; }
    if (STORY) { window.Voice.stop(); return; }    /* stop 会走事件复位界面 */
    window.Voice.stop();                           /* 先把别处正在播的清掉 */
    STORY = true;
    var btn = $("awPlay"), lab = $("awPlayLabel"), img = $("awImg");
    if (btn) {
      btn.classList.add("playing");
      btn.setAttribute("aria-label", "停下");
      btn.title = "停下";
      var face = btn.querySelector(".aw-orb-face");
      if (face) face.textContent = "■";
    }
    if (lab) { lab.textContent = "正在讲自己的故事…"; lab.classList.add("playing"); }
    if (img) img.classList.add("aw-talking");
    if (!(CUR.comic && CUR.comic.length) && !CUR.intro) {
      sys("这只精灵还没留下自述，先问它点别的吧");
      resetVoiceUI();
      return;
    }
    window.Voice.tell(CUR, {
      onSeg: function (i, t) {
        var old = logEl.querySelector(".aw-m.aw-now");
        if (old) old.classList.remove("aw-now");
        var d = put("them", t, true);
        if (d) d.classList.add("aw-now");
      },
      onEnd: resetVoiceUI
    });
  }

  $("awPlay").onclick = playStory;
  $("awSpk").onclick = function () {
    if (!window.Voice) return;
    var on = !window.Voice.enabled();
    window.Voice.setEnabled(on);
    syncSpk();
    if (!on) resetVoiceUI();
  };
  window.addEventListener("voice:stop", function () {
    var img = $("awImg");
    if (img) img.classList.remove("aw-talking");
    if (STORY) resetVoiceUI();
  });
  window.addEventListener("voice:change", syncSpk);

  /* 嗓子出岔子得有个交代：静默会让人以为坏了，但每句都提示又吵。
     十二秒内只报一次，说清"是网络，不是它换人了"。 */
  var VNOTE = { at: 0 };
  function vnote(txt) {
    if (!box.classList.contains("show")) return;
    var now = Date.now();
    if (now - VNOTE.at < 12000) return;
    VNOTE.at = now;
    sys(txt);
  }
  window.addEventListener("voice:mute", function () {
    vnote("网络有点卡，这句没能念出来（字在上面），下一句再听");
  });
  window.addEventListener("voice:fallback", function () {
    vnote("网络不稳，这句先用备用嗓子念了 —— 不是它变了个人");
  });

  function put(who, txt, quiet) {
    var d = document.createElement("div");
    d.className = "aw-m " + who; d.textContent = txt;
    logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
    /* 它说的话，顺带用嗓子讲出来。quiet 用于"讲自己的故事"——
       那种情况文字是按段铺开的，边讲边高亮，不该再读一遍 */
    if (who === "them" && !quiet) speakThem(txt);
    return d;
  }
  /* 单独拎出来：逐字铺开时正文是自己写的，不能走 put()，但最后一样要念 */
  function speakThem(txt, o) {
    if (!(box.classList.contains("show") && CUR && window.Voice && window.Voice.enabled())) return;
    var opts = o || { primary: CUR.primary, id: CUR.id };
    /* 分句念：首句先出声，后面顺着接，段落再长也不用等整段合成 */
    if (window.Voice.saySegments && window.Voice.splitSentences) {
      var segs = window.Voice.splitSentences(txt);
      if (segs && segs.length) { window.Voice.saySegments(segs, opts); return; }
    }
    window.Voice.say(txt, opts);
  }

  /* 一边流式吐字，一边把"已经写完的那几句"送去合成。
     整段到齐时头一句的音频往往已经在手上，开口几乎没有等待。 */
  function voiceStream(opts) {
    var buf = "";
    var re = /[。！？!?；;…\n]/;
    return {
      push: function (t) {
        if (!window.Voice || !window.Voice.enabled || !window.Voice.enabled()) return;
        buf += String(t || "");
        var cut = -1;
        for (var i = 0; i < buf.length; i++) if (re.test(buf[i])) cut = i;
        if (cut < 4) return;                 /* 太短的还不值得单独送一次合成 */
        var head = buf.slice(0, cut + 1);
        buf = buf.slice(cut + 1);
        if (window.Voice.prefetchSegmentList) window.Voice.prefetchSegmentList(head, opts);
        else if (window.Voice.prefetch) window.Voice.prefetch(head, opts);
      }
    };
  }

  /* 文字一到就两步走：① 逐句并行送合成 ② 立刻开口（不等打字机铺完）。
     以前是"铺完再念"，一段话光等就打掉两三秒——线上反馈"字都出来半天了还不说话"。 */
  function speakNow(txt, opts) {
    if (!window.Voice) return;
    if (window.Voice.prefetchSegmentList) window.Voice.prefetchSegmentList(txt, opts);
    else if (window.Voice.prefetch) window.Voice.prefetch(txt, opts);
    speakThem(txt, opts);
  }

  /* ---- 逐字铺开 + 思考态 ----
     模型按片吐字，直接用会一卡一卡；这里交给共用打字机匀速写，
     首字未到时先显示"正在回想…"，并轮换提示它在做什么。 */
  var LIVE_STEPS = ["正在回想…", "翻检典册…", "斟酌措辞…"];

  function liveBubble(wake) {
    var bubble = null, tw = null, stage = 0;
    var steps = wake ? ["正在苏醒…", "抖落尘土…", "睁开眼睛…"] : LIVE_STEPS;
    var tp = document.createElement("div");
    tp.className = "aw-typing";
    tp.innerHTML = '<span class="aw-stage">' + steps[0] + '</span>' +
                   '<span class="aw-dots"><i></i><i></i><i></i></span>';
    logEl.appendChild(tp); logEl.scrollTop = logEl.scrollHeight;
    var timer = setInterval(function () {
      if (tw) return;
      var s = tp.querySelector(".aw-stage");
      if (!s) return;
      stage = (stage + 1) % steps.length;
      s.textContent = steps[stage];
    }, 1200);
    function stopTp() {
      if (timer) { clearInterval(timer); timer = 0; }
      if (tp.parentNode) tp.remove();
    }
    return {
      push: function (t) {
        if (!tw) {
          stopTp();
          bubble = document.createElement("div");
          bubble.className = "aw-m them";
          logEl.appendChild(bubble);
          tw = (typeof window.wjTypewriter === "function")
            ? window.wjTypewriter(bubble, { cps: 36, maxCps: 240, liveClass: "aw-live" })
            : null;
        }
        if (tw) tw.push(t);
        else if (bubble) { bubble.textContent = String(t || ""); logEl.scrollTop = logEl.scrollHeight; }
      },
      finish: function (text, cb) {
        stopTp();
        var done = function () {
          if (bubble) bubble.textContent = String(text || "");
          logEl.scrollTop = logEl.scrollHeight;
          if (cb) cb();
        };
        if (tw) tw.finish(done); else done();
      },
      fail: stopTp
    };
  }
  function sys(txt) { put("sys", txt); }
  function setVia(v) {
    var el = $("awVia");
    if (!v) { el.hidden = true; return; }
    el.hidden = false; el.textContent = v;
  }

  function openChat(id, opt) {
    var s = S(id);
    if (!s) return;
    CUR = s; HIST = []; BUSY = false;
    if (window.Voice) window.Voice.stop();       /* 换了一只会说话的，先让上一只闭嘴 */
    resetVoiceUI(); syncSpk();
    $("awImg").src = "精灵/透明/" + id + ".webp";
    $("awName").textContent = s.name;
    $("awEra").textContent = s.era || "";
    logEl.innerHTML = ""; setVia("");
    box.classList.add("show");
    var ks = (s.knowledge || []).slice(0, 5).map(function (x) { return x.keys[0]; });
    $("awChips").innerHTML = ks.map(function (k) {
      return '<button type="button" data-q="' + esc(k) + '">' + esc(k) + "</button>";
    }).join("");
    if (opt && opt.call) {
      sys("☎ 已接通 ·「" + s.name + "」在电话那头");
      callGreet(s);
    } else {
      box.classList.remove("call", "listening");   /* 普通聊天不挂通话条 */
      sys("已唤醒「" + s.name + "」。它会以自己的身份、朝代和脾气与你聊天。");
      greet(s);
    }
  }

  /* ---- 接通就开口：本地先念一句，云端再补一句 ----
     只靠云端 greet 的话，网络一慢电话那头就是一段死寂，看着像"人机"。
     这里先用本地文案立刻出声（不依赖网络），再让云端接着问一句想聊什么。 */
  /* 开场白要短、要立刻能念出来。别把 era 拼进去 —— 那是"西汉 · 汉武帝元狩五年…"的长串，
     拼上就跟名字重复，念起来像台词本。朝代细节留给云端那句。 */
  var CALL_LINES = [
    function (s) { return "喂？我是" + s.name + "。你说，我听着。"; },
    function (s) { return "喂——听得见吗？我是" + s.name + "，这号多少年没响过了。"; },
    function (s) { return "喂，是你在找我？我是" + s.name + "，在。"; }
  ];
  var CALL_SILENCE = "……信号有点远，你大点声。我先听着。";

  function callGreet(s) {
    BUSY = true;
    /* 优先用转屏时就已经定好、并且已经送去合成的那句 */
    var line = callLine(s.id) || CALL_LINES[0](s);
    put("them", line, true);                     // quiet：嗓子由下面统一排队，避免被云端那句顶掉
    var spoken = (window.Voice && window.Voice.enabled() && CUR)
      ? window.Voice.say(line, { primary: s.primary, id: s.id })
      : Promise.resolve(false);

    var lb = liveBubble(false), done = false;
    var vs = voiceStream({ primary: s.primary, id: s.id });
    var tm = setTimeout(function () {
      if (done) return;
      done = true; lb.fail();
      put("them", CALL_SILENCE, true);
      BUSY = false;
    }, 9000);

    chat([
      { role: "system", content: persona(s) },
      { role: "user", content: "（电话刚接通，你已经说过：" + line + "）请用一句话接着问他打这个电话想聊什么，别重复自我介绍，三十字以内。" }
    ], function (t) { vs.push(t); if (!done) lb.push(t); })
      .then(function (r) {
        if (done) return;
        done = true; clearTimeout(tm);
        /* 文字一到就先逐句合成：开场白还在念，这段正好把合成时间盖住 */
        if (window.Voice && window.Voice.prefetchSegmentList) {
          window.Voice.prefetchSegmentList(r.text, { primary: s.primary, id: s.id });
        } else if (window.Voice && window.Voice.prefetch) {
          window.Voice.prefetch(r.text, { primary: s.primary, id: s.id });
        }
        lb.finish(r.text, function () {
          HIST.push({ role: "assistant", content: r.text });
          setVia(r.via);
          /* 等本地那句念完再接云端那句，别把开场白截断；此时音频已经备好，接得上来 */
          Promise.resolve(spoken).catch(function () {}).then(function () {
            speakThem(r.text, { primary: s.primary, id: s.id });
          });
        });
        BUSY = false;
      })
      .catch(function () {
        if (done) return;
        done = true; clearTimeout(tm); lb.fail();
        put("them", CALL_SILENCE, true);
        BUSY = false;
      });
  }

  /* ---- 拨号音 / 接通音：WebAudio 合成，不占素材，跟着「有声」开关走 ---- */
  var AC = null;
  function beep(freq, dur, delay, vol) {
    if (window.Voice && !window.Voice.enabled()) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
      var t0 = AC.currentTime + (delay || 0);
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol || 0.06, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  function ringBack() { beep(450, 0.32, 0, 0.05); beep(450, 0.32, 0.44, 0.05); }
  function pickUp() { beep(760, 0.1, 0, 0.06); beep(1040, 0.12, 0.11, 0.06); }

  /* ================= 真语音通话（A 档：浏览器识别 + 现有 TTS） =================
     之前接通只会念稿，用户没有一个"说话"的入口，所以听着像人机。
     这一版只做三件事：把你说的话变成文字 → 走原有问答链 → 用原有嗓子念出来。

     它靠浏览器的 SpeechRecognition，有两个绕不过去的前提：
       1) 必须在安全上下文里（https 或 localhost），否则这个 API 连构造函数都没有；
          线上现在是 http://IP，手机上一律拿不到 —— 只能退回打字。
       2) Chrome 的识别服务在 Google，国内网络常连不上，会报 network；
          Edge 走微软的服务，通常可用。失败原因如实说清楚，别装作在听。
     要做到"稳定、可打断、可离线"，得换服务端 ASR（B 档），这一版不碰。 */
  var VR = { rec: null, on: false, sent: false };

  function vrSR() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  /* 返回不能用语音的原因；空字符串表示可用 */
  function vrBlockReason() {
    if (!window.isSecureContext) return "insecure";
    if (!vrSR()) return "unsupported";
    return "";
  }

  function vrNote(txt, warn) {
    var el = $("awPsHeard");
    if (!el) return;
    el.textContent = txt || "";
    el.style.color = warn ? "#A5181C" : "";
  }

  /* 状态一变就重画所有相关控件：手机屏上的键、抽屉底部的通话条、屏底那行提示。
     两处按钮共用一份状态，避免出现"手机说在听、抽屉说没在听"。 */
  function vrPaint() {
    var on = !!VR.on;
    var host = $("awCall");
    var talking = !!(host && host.classList.contains("talking"));
    if (host) host.classList.toggle("listening", on);
    box.classList.toggle("call", talking);
    box.classList.toggle("listening", on);
    var go = $("awPsGo"), hint = $("awCallHint"), t = $("awMicTxt"), mic = $("awMic");
    if (go && talking) go.textContent = on ? "● 听着…" : "🎙 说话";
    if (hint && talking) {
      /* 不能开麦的原因要一直挂在提示上，别让它看起来像"按了没反应" */
      var why = vrBlockReason();
      hint.textContent = on ? "正在听你说话 —— 说完会自动发出去"
        : why === "insecure" ? "http 下浏览器禁麦 · 用 https 打开才能说话（也可以打字）"
        : why === "unsupported" ? "这个浏览器不支持语音识别 · 直接打字一样的"
        : "点「说话」直接讲，说完自动发出去";
    }
    if (t) t.textContent = on ? "正在听…（点一下停）" : "点一下说话";
    if (mic) mic.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function vrListening(on) {
    VR.on = !!on;
    vrPaint();
  }

  function vrStop() {
    if (!VR.rec) return;
    try { VR.rec.stop(); } catch (e) {}
  }

  function vrStart() {
    var why = vrBlockReason();
    if (why) {
      /* 线上 http 会被 nginx 直接 302 到 https（同一地址、同一路径，地址栏只变协议），
         所以走到这里基本只剩两种情况：浏览器本身不给，或者本机局域网用 http 打开。
         不再让用户去「换一个地址」—— 那等于当面告诉他这站有两套门，还容易敲错。 */
      var msg = why === "insecure"
        ? "这会儿浏览器把麦克风锁住了 —— 直接打字也一样，精灵照听不误。"
        : "这个浏览器不给用语音识别（Chrome / Edge 才有），直接打字一样的。";
      sys(msg);
      vrNote(why === "insecure" ? "麦克风不可用 · 直接打字也行" : "此浏览器不支持语音", true);
      return;
    }
    if (VR.on) return;
    /* 它还在念，就先别念了 —— 用户开口等于打断，这也算最朴素的一条 barge-in */
    if (window.Voice) window.Voice.stop();
    VR.sent = false;

    var SR = vrSR(), r;
    try { r = new SR(); } catch (e) { vrNote("麦克风没起来", true); return; }
    r.lang = "zh-CN";
    r.interimResults = true;      /* 边说边出字，屏幕上能看见"它在听" */
    r.continuous = false;         /* 说完一句自动结束，手机端不用按两次 */
    r.maxAlternatives = 1;
    VR.rec = r;

    r.onstart = function () { vrListening(true); vrNote("听着…"); };

    r.onresult = function (e) {
      var fin = "", mid = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var one = e.results[i][0];
        var seg = one ? one.transcript : "";
        if (e.results[i].isFinal) fin += seg; else mid += seg;
      }
      if (mid) vrNote(mid);
      if (fin && !VR.sent) {          /* 只发一次：onend 之后还可能补一条 result */
        VR.sent = true;
        vrFinish(fin);
      }
    };

    r.onerror = function (e) {
      var c = (e && e.error) || "";
      VR.rec = null;
      vrListening(false);
      if (c === "aborted") return;    /* 自己 stop 的，不算错 */
      var map = {
        "no-speech": "没听清，再说一次？",
        "audio-capture": "找不到麦克风，看看系统权限或有没有插上",
        "not-allowed": "麦克风权限被拒了，点地址栏那个锁图标放开",
        "service-not-allowed": "浏览器的语音服务被禁用",
        "network": "识别服务连不上（Chrome 走 Google 的服务，国内常被拦）—— 换 Edge 打开，或者直接打字"
      };
      vrNote(map[c] || ("识别失败：" + c), true);
      if (map[c]) sys(map[c]);
    };

    r.onend = function () {
      VR.rec = null;
      vrListening(false);
    };

    try { r.start(); } catch (e2) { VR.rec = null; vrNote("麦克风没起来", true); }
  }

  function vrFinish(txt) {
    txt = String(txt || "").trim();
    if (!txt) return;
    vrNote("你说：" + txt);        /* 屏上留个凭据，别让用户怀疑"到底听进去了没有" */
    /* 接通头几秒它正在说开场白，链路是锁着的。这句不能丢 —— 排队等它说完再送，
       最多等 8 秒，超时就明说没送出去，别装作听到了。 */
    if (BUSY) {
      sys("（它还在说，这句我先记着）");
      var tries = 0;
      var timer = setInterval(function () {
        if (BUSY && ++tries < 40) return;
        clearInterval(timer);
        if (BUSY) sys("这句没送出去，再说一次？");
        else ask(txt);
      }, 200);
      return;
    }
    ask(txt);
  }

  /* 挂断 / 关抽屉时收尾：停识别、退出通话态、把手机键和通话条复原 */
  function vrHangup() {
    vrStop();
    VR.rec = null;
    VR.on = false;
    var host = $("awCall");
    if (host) host.classList.remove("talking");
    box.classList.remove("call", "listening");
    vrNote("");
    if (host && !(typeof CALL === "object" && CALL && CALL.on)) {
      var go = $("awPsGo");
      if (go) go.textContent = "开始";
    }
  }

  /* 挂断：手机、抽屉、识别、朗读一起收干净。
     抽屉里的「挂断」和手机上的「挂断」都走这里，只有一份收尾逻辑。 */
  function callReset(txt) {
    CALL.on = false;
    CALL.talking = false;
    CALL.line = "";                    /* 下一通换句新的，别总说同一句 */
    CALL.lineId = "";
    var host = $("awCall");
    if (host) host.classList.remove("ringing");
    vrHangup();
    if (window.Voice) window.Voice.stop();
    if (box.classList.contains("show")) closeChat();
    var sub = $("awPsSub");
    if (sub) sub.textContent = "随时换一位精灵";
    var go = $("awPsGo");
    if (go) go.textContent = "开始";
    var hint = $("awCallHint");
    if (hint) hint.textContent = txt || "按「开始」，随机一位精灵打电话给你";
  }

  function greet(s) {
    BUSY = true;
    var lb = liveBubble(true);
    var vs = voiceStream({ primary: s.primary, id: s.id });
    chat([{ role: "system", content: persona(s) },
          { role: "user", content: "用一句话自报家门，说清你是谁、什么朝代的。" }],
          function (t) { vs.push(t); lb.push(t); })
      .then(function (r) {
        HIST.push({ role: "assistant", content: r.text });
        setVia(r.via);
        speakNow(r.text, { primary: s.primary, id: s.id });
        lb.finish(r.text);
      })
      .catch(function (e) {
        lb.fail();
        put("them", localAnswer(s, "你是谁") || ("我是" + s.name + "。" + (s.intro || "")));
        sys(bridgeHint(e) || "云端未接通，已落回本机台词库（离线也能聊）");
      })
      .then(function () { BUSY = false; });
  }
  function send() {
    var el = $("awInp"), q = String(el.value || "").trim();
    if (!q || BUSY || !CUR) return;
    el.value = "";
    ask(q);
  }
  /* 提问的统一入口：键盘输入和语音识别都从这里进来，两条路共用同一套问答与朗读 */
  function ask(q) {
    q = String(q || "").trim();
    if (!q || BUSY || !CUR) return;
    put("me", q); HIST.push({ role: "user", content: q });
    var la = localAnswer(CUR, q);
    BUSY = true;
    var lb = liveBubble(false);
    var vs = voiceStream({ primary: CUR.primary, id: CUR.id });
    chat([{ role: "system", content: persona(CUR) }].concat(HIST.slice(-7)),
         function (t) { vs.push(t); lb.push(t); })
      .then(function (r) {
        HIST.push({ role: "assistant", content: r.text });
        setVia(r.via);
        speakNow(r.text, { primary: CUR.primary, id: CUR.id });
        lb.finish(r.text);
      })
      .catch(function (e) {
        lb.fail();
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
        '<div class="aw-hero-txt">' +
          '<span class="aw-eyebrow">AI AWAKEN · 活 态 苏 醒</span>' +
          '<h2>文物活了，还会跟你说话</h2>' +
          '<p>每一只 Q 版精灵都在呼吸、漂浮、眨眼——点任意一只，它就用<b>自己朝代的身份、脾气和记忆</b>跟你聊天：讲来历、说工艺、答问题、出考题。</p>' +
          '<span class="aw-stat">共 <b id="awpCnt">0</b> 只精灵已苏醒 · 云端 <span id="awpState">待探测</span></span>' +
        '</div>' +
        /* 文物来电：手机上半屏空着，精灵一位一位轮换；按「开始」随机一位打过来 */
        '<div class="aw-call" id="awCall">' +
          '<div class="aw-phone">' +
            '<div class="aw-phone-body">' +
              '<span class="aw-phone-notch"></span>' +
              '<i class="aw-phone-side up"></i><i class="aw-phone-side dn"></i>' +
              '<div class="aw-phone-screen">' +
                '<div class="aw-ps-bar"><span>燕赵 · 遗珍</span><span class="aw-ps-ic">▂▄▆ ⌁ ▮</span></div>' +
                '<div class="aw-ps-stage">' +
                  '<button type="button" class="aw-ps-hang" id="awPsHang">挂断</button>' +
                  '<div class="aw-ps-live"><i></i><i></i><i></i></div>' +
                  '<img class="aw-ps-spirit" id="awPsImg" alt="" decoding="async">' +
                  '<div class="aw-ps-name" id="awPsName">—</div>' +
                  '<div class="aw-ps-sub" id="awPsSub">随时换一位精灵</div>' +
                  '<div class="aw-ps-heard" id="awPsHeard"></div>' +
                '</div>' +
                '<div class="aw-ps-dock">' +
                  '<button type="button" class="aw-ps-go" id="awPsGo">开始</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<p class="aw-call-hint" id="awCallHint">按「开始」，随机一位精灵打电话给你</p>' +
        '</div>' +
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

  /* ---- 文物来电：屏幕空处自动轮换精灵，按「开始」随机一位打过来 ---- */
  var CALL = { on: false, talking: false, id: "", timer: 0, pool: [], line: "", lineId: "" };

  function callPool() {
    if (CALL.pool.length) return CALL.pool;
    var all = (typeof SPIRITS !== "undefined") ? SPIRITS : {};
    CALL.pool = Object.keys(all).filter(function (id) { return all[id] && all[id].name; });
    return CALL.pool;
  }

  function callPick(not) {
    var p = callPool();
    if (!p.length) return "";
    for (var k = 0; k < 10; k++) {
      var id = p[Math.floor(Math.random() * p.length)];
      if (id !== not) return id;
    }
    return p[0];
  }

  function callShow(id, anim) {
    var s = S(id), img = $("awPsImg"), nm = $("awPsName");
    if (!s || !img) return;
    img.src = "精灵/透明/" + id + ".webp";
    img.alt = s.name;
    if (nm) nm.textContent = s.name;
    if (anim) {
      img.classList.remove("swap");
      void img.offsetWidth;              /* 强制回流，动画才能重放 */
      img.classList.add("swap");
    }
    if (!img.__awSwapEnd) {              /* swap 会顶掉「呼吸」，动画一结束就摘掉 */
      img.__awSwapEnd = 1;
      img.addEventListener("animationend", function () { img.classList.remove("swap"); });
    }
  }

  /* 这通电话的开场白：在人物刚转到屏幕上的时候就定下来并送去合成。
     接听那一刻才开会合成的话，用户要干等两三秒才有声——"字都出来了声音还没来"。
     提前三秒开始，等真接通时音频基本已经在手上。 */
  function callLine(id) {
    var s = S(id);
    if (!s) return "";
    if (CALL.lineId !== id || !CALL.line) {
      CALL.lineId = id;
      CALL.line = CALL_LINES[Math.floor(Math.random() * CALL_LINES.length)](s);
    }
    if (window.Voice && window.Voice.prefetch) {
      window.Voice.prefetch(CALL.line, { primary: s.primary, id: s.id });
    }
    return CALL.line;
  }

  function callTick() {
    /* 来电中、或正跟某位通话时都不换人，别让对面那位在通话里被替换掉 */
    if (CALL.on || CALL.talking) return;
    var id = callPick(CALL.id);
    if (!id) return;
    CALL.id = id;
    callShow(id, true);
    callLine(id);
  }

  /* 只在专页可见时轮换：切走或页面进后台都停掉，不白烧定时器 */
  function callRotate(on) {
    if (CALL.timer) { clearInterval(CALL.timer); CALL.timer = 0; }
    if (!on) return;
    CALL.timer = setInterval(function () {
      if (document.hidden || !isAlive() || !document.getElementById("awCall")) return;
      callTick();
    }, 3000);
  }

  function callBind() {
    var host = $("awCall"), go = $("awPsGo"), hang = $("awPsHang"), hint = $("awCallHint");
    if (!host || !go || go.__awBound) return;
    go.__awBound = 1;

    if (!CALL.id) {
      var first = callPick("");
      if (first) { CALL.id = first; callShow(first, false); callLine(first); }
    }
    callRotate(true);

    function reset(txt) { callReset(txt); }

    go.addEventListener("click", function () {
      if (CALL.on) { answer(); return; }
      /* 已接通：这个键变成麦克风，点一下开始听、再点一下收 */
      if (host.classList.contains("talking")) {
        if (VR.on) vrStop(); else vrStart();
        return;
      }
      /* 就呼屏幕上正显示的这一位：他的开场白早在转屏时就送去合成了，
         接通基本能立刻出声。再随机换一个的话，那句音频就白合了。 */
      var id = CALL.id || callPick("");
      var s = S(id);
      if (!s) return;
      CALL.id = id;
      CALL.on = true;
      callShow(id, true);
      callLine(id);
      host.classList.add("ringing");
      ringBack();
      var sub = $("awPsSub");
      if (sub) sub.textContent = "正在呼叫你…";
      go.textContent = "接听";
      if (hint) hint.textContent = "「" + s.name + "」正在呼叫你…";
    });

    function answer() {
      var id = CALL.id, s = S(id);
      pickUp();
      host.classList.remove("ringing");
      host.classList.add("talking");     /* 接通：手机进通话态，键变麦克风 */
      CALL.on = false;
      CALL.talking = true;
      var sub = $("awPsSub");
      if (sub) sub.textContent = "通话中";
      go.textContent = "🎙 说话";
      openChat(id, { call: true });
      vrPaint();                          /* 让抽屉底部的通话条出现，提示文案也在这里定 */
    }

    if (hang) hang.addEventListener("click", function (e) {
      e.stopPropagation();
      reset("已挂断 · 按「开始」再随机一位");
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
    callBind();
    alivePaint();
    setTimeout(alivePaint, 60);
  }

  function isAlive() {
    return String(location.hash || "").replace(/^#\/?/, "").split("/")[0] === "alive";
  }
  function onHash() {
    if (isAlive()) setTimeout(aliveMount, 0);
    else callRotate(false);        /* 离开专页就停掉轮换，回来再启动 */
  }

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
