/* =========================================================
   文物精灵 · 应用逻辑
   流程:打卡/选文物 → 精灵详情 → 选择出战精灵(带主属性特性)
        → 回忆漫画 → 2D 对战舞台(从卡片弹出) → AI 出题(一半考它自己/一半通识,四选一)
        → 答对:我方精灵掷骰攻击 / 答错:被对方直接反击
        → 野生精灵残血可捕捉 / 血归零自动捕捉 → 收入图鉴
   ========================================================= */

/* ---------------- 小工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const d6 = () => Math.floor(Math.random() * (BATTLE.diceMax - BATTLE.diceMin + 1)) + BATTLE.diceMin;

/* ---------------- 顶部导航:锚点滚动 + 下拉菜单 ---------------- */
let pendingScroll = null;
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function navGo(id) {
  const page = location.hash.replace(/^#\/?/, "").split("/")[0];
  if (page === "") scrollToSection(id);                 // 已在首页:直接滚到栏目
  else { pendingScroll = id; location.hash = "#/"; }    // 先回首页,渲染完再滚
  return false;                                         // 阻止 <a> 默认跳转
}
function toggleDD(e, btn) {
  if (e) e.stopPropagation();
  const item = btn.closest(".nav-dd");
  const was = item.classList.contains("open");
  $$(".nav-dd.open").forEach(n => n.classList.remove("open"));
  if (!was) item.classList.add("open");
}
document.addEventListener("click", () => $$(".nav-dd.open").forEach(n => n.classList.remove("open")));

/* 图片 */
function imgTag(src, cls = "", alt = "") {
  return `<img class="${cls}" alt="${alt}" src="${src}">`;
}
/* 立绘路径:分站的精灵放在 精灵\<站点>\ ,通用精灵直接放 精灵\ ;拍照唤醒的自定义精灵用存档里的图片 */
function spritePath(id) {
  const c = customById(id);
  if (c && c.img) return c.img;
  const s = SPIRITS[id];
  if (s && s.img) return s.img;   /* 「第零站 · 华夏」的精灵直接引用 精灵/朝代/ 的图画 */
  return `精灵/${s && s.dir ? s.dir + "/" : ""}${id}.webp`;
}
const spiritImg = (id, cls, alt) => imgTag(spritePath(id), cls, alt || SPIRITS[id].name);
/* 对战舞台上用抠好背景的透明立绘,精灵才能“站”在故宫里 */
const battleImg = (id, alt) => imgTag(`精灵/透明/${id}.webp`, "sprite", alt || SPIRITS[id].name);
/* 属性图标:主属性在「属性图标/主属性/」,副属性在「属性图标/副属性/」 */
function attrIcon(kind, key) {
  return `属性图标/${kind === "primary" ? "主属性" : "副属性"}/${ATTRIBUTES[kind][key].icon}.webp`;
}
function attrBadge(kind, key) {
  const a = ATTRIBUTES[kind][key];
  return `<span class="badge ${kind === "secondary" ? "sec" : ""}">
      <img class="ico" alt="${a.name}" src="${attrIcon(kind, key)}"><b>${a.name}</b></span>`;
}

/* ---------------- 中国纹样边框:主属性 → 纹样 ---------------- */
/* 青铜→饕餮纹专用 · 陶瓷→缠枝莲 · 玉石→如意纹 · 石刻→回纹(通用首选) · 魏晋南北朝隋唐→忍冬纹 */
const FRAME_MAP = { bronze: "饕餮框", ceramic: "缠枝莲框", jade: "如意框", stone: "回纹框" };
const FRAME_KEY = { "回纹框": "hui", "缠枝莲框": "chanzhi", "忍冬框": "rendong", "饕餮框": "taotie", "如意框": "ruyi", "冰裂框": "binglie" };
function decorFrame(s) {
  const txt = (s.name || "") + (s.relicName || "");
  if (/青瓷|青釉|汝窑|哥窑/.test(txt)) return "冰裂框";                    // 青瓷专属 → 冰裂纹
  if (/隋|唐|魏晋|北魏|南北朝/.test(s.era || "")) return "忍冬框";         // 魏晋南北朝隋唐 → 忍冬纹
  return FRAME_MAP[s.primary] || "回纹框";
}
function decorCls(s) { return ` decor-card fr-${FRAME_KEY[decorFrame(s)]}`; }

/* ---------------- 状态(本地存档) ---------------- */
/* 存档键带命名空间:正式版 / 测试版进度各自独立(见 js/save-id.js;缺省时沿用旧键) */
const SAVE_KEY = (typeof SAVE_ID !== "undefined" && SAVE_ID) ? "wwjl_captured_v1::" + SAVE_ID : "wwjl_captured_v1";
/* 测试版页签标记(可选,见 js/save-id.js) */
if (typeof PAGE_TAG !== "undefined" && PAGE_TAG) document.title += " · " + PAGE_TAG;

/* ---------------- 拍照唤醒 · 自定义文物精灵(本地存档) ---------------- */
/* 「打卡拍照」幻化出的新文物:有自己的图鉴编码(在全部静态精灵编号之后顺延),
   出现在 我的精灵 / 文物图鉴 / AI打卡海报;正式版与测试版各存各的 */
const CUSTOM_KEY = (typeof SAVE_ID !== "undefined" && SAVE_ID) ? "wwjl_custom_v1::" + SAVE_ID : "wwjl_custom_v1";
let CUSTOMS = [];
function loadCustoms() { try { CUSTOMS = JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; } catch (e) { CUSTOMS = []; } }
function saveCustoms() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(CUSTOMS)); } catch (e) {} }
function customById(id) { return CUSTOMS.find(c => c.id === id) || null; }
function isCustom(id) { return !!customById(id); }
/* 把存档里的自定义精灵注册进 SPIRITS,全站(图鉴/精灵栏/海报)自动认得它们 */
function registerCustoms() {
  CUSTOMS.forEach(c => {
    if (!c || !c.id || SPIRITS[c.id]) return;
    SPIRITS[c.id] = {
      id: c.id, name: c.name, alias: "新唤醒", era: c.era || "我的新发现",
      primary: c.primary || "ceramic", secondary: c.secondary || "household",
      starter: false, custom: true, dir: null,
      intro: c.intro || "", relicName: "我的私人发现", history: c.history || ""
    };
  });
}
/* 下一个可用图鉴编码:HB-054 之后顺延 */
function nextCustomNo() {
  let mx = 0;
  const take = no => { const n = parseInt(String(no || "").replace(/\D/g, ""), 10); if (n > mx) mx = n; };
  if (typeof POSTER_META !== "undefined") Object.values(POSTER_META).forEach(m => take(m.no));
  CUSTOMS.forEach(c => take(c.no));
  return "HB-" + String(mx + 1).padStart(3, "0");
}
loadCustoms();
registerCustoms();

function loadCaptured() {
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch (e) { ids = []; }
  // 初始三精灵默认拥有
  Object.values(SPIRITS).forEach(s => { if (s.starter && !ids.includes(s.id)) ids.push(s.id); });
  return [...new Set(ids)];
}
let captured = loadCaptured();
const isCaptured = id => captured.includes(id);
/* 「第零站 · 华夏」:隐藏站点,集齐其余站点全部精灵后才开启捕捉 */
function huaxiaStation() { return STATIONS.find(s => s.id === "huaxia"); }
function stationDone(st) { return st.spiritIds.every(isCaptured); }
function huaxiaProgress() { return STATIONS.filter(s => s.id !== "huaxia" && stationDone(s)).length; }
function huaxiaUnlocked() { return huaxiaProgress() >= STATIONS.length - 1; }
function spiritLocked(id) { const hx = huaxiaStation(); return !!hx && !huaxiaUnlocked() && hx.spiritIds.includes(id); }
function addCaptured(id) {
  if (!isCaptured(id)) { captured.push(id); saveCaptured(); }
}
function saveCaptured() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(captured)); } catch (e) {} }
/* 清空进度(图鉴页底部按钮):回到只有初始精灵的状态,方便比赛演示前复位 */
function resetProgress() {
  if (!confirm("确定要清空捕捉进度、回到初始状态吗?\n\n已捕捉的精灵、以及「拍照唤醒」的新文物都会消失,此操作不可撤销。")) return;
  captured = Object.values(SPIRITS).filter(s => s.starter).map(s => s.id);
  saveCaptured();
  CUSTOMS.forEach(c => { delete SPIRITS[c.id]; });
  CUSTOMS = [];
  saveCustoms();
  render();
}

/* ---------------- 路由 ---------------- */
function render() {
  const app = $("#app");
  const hash = location.hash.replace(/^#\/?/, "");
  const [page, param] = hash.split("/");
  document.body.dataset.page = page || "home";   // 供背景/样式按页面微调(如首页背景更透亮)
  // 高亮顶部栏目(首页→我的精灵 / 图鉴 / 其他 / AI 栏目)
  const navKey = page === "" ? "mine" : (page === "codex" ? "codex" : (page === "poster" || page === "restore" || page === "tea" || page === "dye" || page === "ident" ? page : (page === "museums" || page === "creative" ? "more" : "")));
  $$(".topnav .nav-item").forEach(a => a.classList.toggle("active", a.dataset.nav === navKey));
  if (page === "station") app.innerHTML = viewStation(param);
  else if (page === "spirit") app.innerHTML = viewSpirit(param);
  else if (page === "codex") app.innerHTML = viewCodex();
  else if (page === "museums") app.innerHTML = viewMuseums();
  else if (page === "creative") app.innerHTML = viewCreative();
  else if (page === "poster") app.innerHTML = viewPoster();
  else if (page === "restore") app.innerHTML = viewRestore();
  else if (page === "tea") app.innerHTML = viewTea();
  else if (page === "dye") app.innerHTML = viewDye();
  else if (page === "ident") app.innerHTML = viewIdent();
  else app.innerHTML = viewHome();
  if (page === "restore") { setTimeout(rsHydrate, 30); setTimeout(rsPaintOutputs, 40); }  // 先给拼图盘铺图,再绘「AI 裁切输出台」图纸
  if (page === "dye") setTimeout(dyeInit, 40);              // 渲染后铺好黑白画纸(等图片解码完再允许上色)
  if (page === "ident") setTimeout(identInit, 40);          // 渲染后绑好对比滑块,接续上一次的修复与识别结果
  if (page === "tea") setTimeout(teaInitView, 40);          // 渲染后点亮茶话会云端状态条,顺手探一次小桥
  window.scrollTo({ top: 0 });
  initHomeFx();
  // 从别的页面点「地图/图鉴」里的首页栏目:等首页渲染完再滚到锚点
  if (pendingScroll) { const id = pendingScroll; pendingScroll = null; setTimeout(() => scrollToSection(id), 30); }
}
window.addEventListener("hashchange", render);

/* ---------------- 进场动效(滚动渐显,安全降级) ---------------- */
function initHomeFx() {
  if (typeof IntersectionObserver === "undefined") return;
  const els = $$(".hero-cn,.home-cats,.sec-head,.spirit-row,.attr-card,.station-card,.museum-card,.creative-card");
  if (!els.length) return;
  els.forEach(el => el.classList.add("rv"));
  const io = new IntersectionObserver(list => list.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { threshold: .08, rootMargin: "0px 0px -5% 0px" });
  els.forEach(el => io.observe(el));
}

/* 蓝金山水背景:生成缓缓上浮的金尘粒子(背景层本体在 index.html 的 .bg-art) */
function initBgArt() {
  const box = document.getElementById("bgDust");
  if (!box) return;
  let html = "";
  for (let i = 0; i < 34; i++) {
    const s = 2 + Math.random() * 4;
    const x = Math.random() * 100;
    const dur = 9.5 + Math.random() * 8;
    const delay = -Math.random() * 20;
    const bottom = 2 + Math.random() * 46;
    const op = (0.4 + Math.random() * 0.45).toFixed(2);
    html += `<i style="left:${x.toFixed(1)}%;bottom:${bottom.toFixed(0)}vh;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;--d:${dur.toFixed(1)}s;--dl:${delay.toFixed(1)}s;--o:${op}"></i>`;
  }
  box.innerHTML = html;
}

/* ---------------- 首页 ---------------- */
function viewHome() {
  const all = Object.values(SPIRITS).filter(s => !s.custom);   /* 「我点亮的文物」不占我的精灵收集体系 */
  const starters = all.filter(s => s.starter);
  const others = all.filter(s => !s.starter && isCaptured(s.id));
  const mine = [...starters, ...others];
  const doneStations = STATIONS.filter(st => st.spiritIds.every(isCaptured)).length;
  const avatars = mine.slice(0, 4).map(s => spiritImg(s.id, "", s.name)).join("");
  const orbit = mine.slice(0, 7).map((s, i) => `<div class="orbit-chip chip${i}">${spiritImg(s.id, "", s.name)}<span>${s.name}</span></div>`).join("");
  return `
    <section class="hero hero-cn">
      <img class="hero-sun" src="装饰/红日.webp" alt="">
      <img class="hero-mtn" src="装饰/远山带.webp" alt="">
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="eyebrow">HEBEI · MUSEUM SPIRITS</span>
          <h1 class="hero-title"><span>讲好中国故事<span class="comma">，</span></span><span>让文物活起来</span></h1>
          <p class="hero-sub">走进博物馆,拍下文物的照片,它就会化作一只精灵苏醒。<br>
             听它讲完回忆、答对 AI 出的题,就能把它收进你的图鉴。</p>
          <div class="hero-actions">
            <button class="btn gold" onclick="openPhoto()">📷 打卡拍照 · 唤醒文物</button>
            <button class="btn ghost" onclick="location.hash='#/codex'">📖 翻一翻文物图鉴</button>
          </div>
          <ul class="hero-facts">
            <li title="${all.length} 只可捕捉 + ${LEGENDS.length} 只燕赵名片"><b>${all.length + LEGENDS.length}</b><span>文物精灵</span></li>
            <li><b>${STATIONS.length}</b><span>打卡站点</span></li>
            <li><b>${Object.keys(ATTRIBUTES.primary).length + Object.keys(ATTRIBUTES.secondary).length}</b><span>材质 · 用途属性</span></li>
          </ul>
        </div>
        <div class="hero-vis">
          <span class="hero-seal">${imgTag("装饰/印章.webp", "", "文物精灵")}</span>
          <div class="hero-orbit">${orbit}</div>
        </div>
      </div>
    </section>

    <div class="sec-head">
      <div>
        <span class="eyebrow">01 — EXPLORE</span>
        <h2>一眼逛完文物精灵</h2>
        <p class="sec-sub">我的精灵是已经醒来的伙伴 · 文物图鉴收着全部 ${all.length + LEGENDS.length} 只 · 博物馆与文创里,还有更多河北的故事;AI 茶话会、AI 赋彩,让文物陪你玩起来。</p>
      </div>
    </div>
    <div class="home-cats">
      <div class="cat-card" onclick="scrollToMine()">
        <img class="cat-corner" src="装饰/夔龙角.webp" alt="">
        <div class="cat-t">我的精灵</div>
        <div class="cat-d">已唤醒 <b>${mine.length}</b> / ${all.length} 只</div>
        <div class="cat-avatars">${avatars}${mine.length > 4 ? `<span class="more">+${mine.length - 4}</span>` : ""}</div>
      </div>
      <div class="cat-card" onclick="location.hash='#/codex'">
        <img class="cat-corner" src="装饰/夔龙角.webp" alt="">
        <div class="cat-t">文物图鉴</div>
        <div class="cat-d">收藏进度 <b>${all.filter(s => isCaptured(s.id)).length}</b> / ${all.length} 只 · 全站 ${all.length + LEGENDS.length} 只</div>
        <div class="cat-avatars"><span class="more">编号 HB-001 ~ HB-074(含 2 只燕赵名片)</span></div>
      </div>
      <div class="cat-card cat-tea${mine.length >= 3 ? "" : " lock"}" onclick="location.hash='${mine.length >= 3 ? "#/tea" : "#/codex"}'">
        <img class="cat-corner" src="装饰/夔龙角.webp" alt="">
        <div class="cat-t">🍵 AI 精灵茶话会</div>
        ${mine.length >= 3 ? `
        <div class="cat-d">挑 <b>3~6</b> 只已捕获精灵,你来当主持,跨时空聊一场</div>
        <div class="cat-avatars"><span class="more">目前可上桌 ${mine.length} 只 · 每步选一张牌</span></div>` : `
        <div class="cat-d">🔒 图鉴收集满 <b>3</b> 只解锁(当前 ${mine.length} / 3 只)</div>
        <div class="cat-avatars"><span class="more">点击先去图鉴唤醒精灵</span></div>`}
      </div>
      <div class="cat-card cat-dye" onclick="location.hash='#/dye'">
        <img class="cat-corner" src="装饰/夔龙角.webp" alt="">
        <div class="cat-t">🎨 AI赋彩</div>
        <div class="cat-d"><b>36</b> 幅 Q 版文物褪成了黑白稿,等你把颜色还给它</div>
        <div class="cat-avatars"><span class="more">点按填色 · 拖笔涂抹 · 可保存作品</span></div>
      </div>
      <div class="cat-card cat-ident" onclick="location.hash='#/ident'">
        <img class="cat-corner" src="装饰/夔龙角.webp" alt="">
        <div class="cat-t">🔍 AI 文物识别</div>
        <div class="cat-d">拍一张文物照片:<b>修复对比</b>一滑便知,报出名字与来历,器型 / 纹样 / 年代 / 材质逐项识别</div>
        <div class="cat-avatars"><span class="more">去划痕 · 补缺口 · 恢复原色 · 超分放大</span></div>
      </div>
      <div class="cat-card">
        <img class="cat-corner" src="装饰/夔龙角.webp" alt="">
        <img class="cat-orn orn-ding2" src="装饰/青铜鼎.webp" alt="">
        <div class="cat-t">博物馆与文创</div>
        <div class="cat-d">河北各地博物馆介绍 · 文物元素的小文创</div>
        <div class="cat-links">
          <button class="cat-link" onclick="location.hash='#/museums'">🏛 河北的博物馆</button>
          <button class="cat-link" onclick="location.hash='#/creative'">🎁 文创灵感</button>
        </div>
      </div>
    </div>

    <div class="sec-head" id="home-map">
      <div>
        <span class="eyebrow">02 — HEBEI MAP</span>
        <h2>河北地图 · 点亮打卡站</h2>
        <p class="sec-sub">已点亮 <b class="sec-b">${doneStations}</b> / ${STATIONS.length} 站 · 点地图上的城市,去唤醒那里的文物精灵。</p>
      </div>
      <span class="sec-aside">点击站点标记直达 →</span>
    </div>
    <div class="cat-card cat-map">
      <div class="map-wrap">
        ${imgTag("装饰/河北地图.webp", "map-img", "河北省地图")}
        <div class="map-layer">
          ${MAP_MARKS.cities.map(c => `<span class="map-city" style="left:${c.x}%;top:${c.y}%">${c.name}</span>`).join("")}
          ${MAP_MARKS.stations.map(m => {
            const st = STATIONS.find(x => x.id === m.id);
            const got = st.spiritIds.filter(isCaptured).length;
            const short = (st.name.split("·")[1] || st.name).trim();
            return `<div class="map-mark${got >= st.spiritIds.length ? " done" : ""}" style="left:${m.x}%;top:${m.y}%"
                      onclick="event.stopPropagation();location.hash='#/station/${st.id}'" title="${st.name}">
              <i></i><span>${short} ${got}/${st.spiritIds.length}</span>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <div class="sec-head" id="home-mine">
      <div>
        <span class="eyebrow">03 — MY SPIRITS</span>
        <h2>我的精灵 <i>(${mine.length} / ${all.length})</i></h2>
        <p class="sec-sub">从左到右是你的伙伴;去博物馆拍照打卡,能唤醒更多。</p>
      </div>
      <span class="sec-aside">已唤醒的伙伴都在这里</span>
    </div>
    <div class="spirit-row">
      ${mine.map(s => `
        <div class="mini spirit-mini" onclick="location.hash='#/spirit/${s.id}'">
          ${spiritImg(s.id, "", s.name)}
          <div class="nm">${s.name}</div>
          <div class="badges">
            ${attrBadge("primary", s.primary)}
            ${attrBadge("secondary", s.secondary)}
          </div>
        </div>`).join("")}
      <div class="spirit-mini" onclick="location.hash='#/codex'" style="display:grid;place-items:center;border-style:dashed">
        <div><div style="font-size:30px">＋</div><div class="sub">去图鉴</div></div>
      </div>
    </div>

    <div class="sec-head">
      <div>
        <span class="eyebrow">04 — ATTRIBUTES</span>
        <h2>属性图鉴</h2>
        <p class="sec-sub">主属性 = 材质 · 副属性 = 用途,20 个属性图标一次看全。</p>
      </div>
    </div>
    <div class="card attr-card" id="home-attr">
      <div class="attr-group-h">◈ 主属性 · 材质</div>
      <div class="attr-grid">
        ${Object.entries(ATTRIBUTES.primary).map(([k, a]) => `
          <div class="attr-cell" title="${a.desc}">
            <img src="属性图标/主属性/${a.icon}.webp" alt="${a.name}">
            <span>${a.name}</span>
          </div>`).join("")}
      </div>
      <div class="attr-group-h" style="margin-top:20px">◇ 副属性 · 用途</div>
      <div class="attr-grid">
        ${Object.entries(ATTRIBUTES.secondary).map(([k, a]) => `
          <div class="attr-cell sec" title="${a.desc}">
            <img src="属性图标/副属性/${a.icon}.webp" alt="${a.name}">
            <span>${a.name}</span>
          </div>`).join("")}
      </div>
    </div>

    <div class="sec-head" id="home-stations">
      <div>
        <span class="eyebrow">05 — STATIONS</span>
        <h2>打卡站点 <i>(按年代走一遍河北)</i></h2>
        <p class="sec-sub">已点亮 <b class="sec-b">${doneStations}</b> / ${STATIONS.length} 站,每一站都有精灵在等你。</p>
      </div>
    </div>
    <div class="station-grid">
      ${STATIONS.map(st => {
        if (st.secret) {
          const open = huaxiaUnlocked();
          const got = st.spiritIds.filter(isCaptured).length;
          const total = st.spiritIds.length, all = STATIONS.length - 1;
          const av = (typeof CITY_AVATARS !== "undefined" && CITY_AVATARS[st.id]) ? CITY_AVATARS[st.id] : null;
          return `
        <div class="card station-card secret${open ? " opened" : " locked"}" onclick="location.hash='#/station/${st.id}'">
          ${av ? `<img class="city-avatar" src="${av}" alt="${st.name}">` : `<div class="no">零</div>`}
          <div>
            <h3>${st.name} <span class="secret-tag">隐藏款</span></h3>
            <p>${open ? `${st.subtitle} · 已收集 ${got}/${total}` : `🔒 集齐全部 ${all} 站后开启 · 已集齐 ${huaxiaProgress()}/${all} 站`}</p>
          </div>
        </div>`;
        }
        return `
        <div class="card station-card" onclick="location.hash='#/station/${st.id}'">
          ${(typeof CITY_AVATARS !== "undefined" && CITY_AVATARS[st.id])
            ? `<img class="city-avatar" src="${CITY_AVATARS[st.id]}" alt="${st.name}">`
            : `<div class="no">${st.order}</div>`}
          <div>
            <h3>${st.name}</h3>
            <p>${st.subtitle} · 已收集 ${st.spiritIds.filter(isCaptured).length}/${st.spiritIds.length}</p>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}
function scrollToMine() { navGo("home-mine"); }

/* ---------------- 博物馆页(其他 · 之一) ---------------- */
const FRAME_ORDER = ["fr-hui", "fr-chanzhi", "fr-rendong", "fr-taotie", "fr-ruyi", "fr-binglie"];
function viewMuseums() {
  return `
    <div class="page-head">
      <h2>🏛 河北的博物馆</h2>
      <p>沿着十二站打卡的足迹,认识这些收藏燕赵故事的地方。资料以各馆官方公开信息为准。</p>
    </div>
    <div class="museum-list">
      ${MUSEUMS.map((m, i) => `
        <div class="card museum-card decor-card ${FRAME_ORDER[i % FRAME_ORDER.length]}">
          <div class="museum-head">
            <h3>${m.name}</h3>
            <div class="museum-tags">
              <span class="m-tag">📍 ${m.city}</span>
              ${m.level ? `<span class="m-tag gold">${m.level}</span>` : ""}
            </div>
          </div>
          <p class="museum-intro">${m.intro}</p>
          <div class="museum-highlights">
            ${m.highlights.map(h => `<span class="hl">${h}</span>`).join("")}
          </div>
          ${m.station ? `<button class="btn ghost" onclick="location.hash='#/station/${m.station}'">去这站打卡 ▶</button>` : ""}
        </div>`).join("")}
    </div>`;
}

/* ---------------- 文创页(其他 · 之二) ---------------- */
function viewCreative() {
  return `
    <div class="page-head">
      <h2>🎁 文物文创灵感</h2>
      <p>从馆藏文物出发的小创意,让文物走进日常。</p>
    </div>
    <div class="creative-note">💡 ${CREATIVE_NOTE}</div>
    <div class="creative-grid">
      ${CREATIVE.map((c, i) => `
        <div class="card creative-card decor-card ${FRAME_ORDER[i % FRAME_ORDER.length]}">
          <div class="cr-tag">${c.tag}</div>
          <h3>${c.name}</h3>
          <div class="cr-from">取材:${c.from}</div>
          <p>${c.idea}</p>
        </div>`).join("")}
    </div>
    <div class="creative-note">✨ 想把喜欢的文物也变成一张卡?先到地图上把它收进图鉴吧。</div>`;
}

/* ---------------- AI 打卡海报(其他 · 之三) ----------------
   现场合影 → 一键合成国风打卡海报(写实 / Q版 两种风格)。
   合成完全在本机浏览器完成:照片不上传、不联网;二维码指向「当前网址 + #/codex」,扫码直达图鉴页。 */
const POSTER_W = 1080, POSTER_H = 1920;
const PST = { photo: null, style: "realistic", spirit: null };
const POSTER_STYLES = {
  realistic: {
    name: "写实", paper: "#f8f3e3", paper2: "#efe7cf", ink: "#41493e", sub: "#77816f",
    title: "#2f6b4c", line: "#5c6b55", photoF: "saturate(.96) contrast(1.05) brightness(1.02)",
    glow: "rgba(222,190,110,.55)", cloudA: .10, sparkle: false
  },
  chibi: {
    name: "Q版", paper: "#eaf4e6", paper2: "#dcecd8", ink: "#3d4a3f", sub: "#6f7f6b",
    title: "#348258", line: "#4f7a5c", photoF: "saturate(1.22) brightness(1.06)",
    glow: "rgba(230,200,120,.60)", cloudA: .16, sparkle: true
  }
};

function posterDefaultSpirit() {
  const mine = Object.values(SPIRITS).filter(s => !s.starter && !s.custom && isCaptured(s.id));
  return (mine[0] || SPIRITS.tielion).id;
}
function posterSpiritId() {
  if (PST.spirit && SPIRITS[PST.spirit]) return PST.spirit;
  PST.spirit = posterDefaultSpirit();
  return PST.spirit;
}
function posterMeta(id) {
  const c = customById(id);
  if (c) return { no: c.no, trivia: c.trivia || "" };
  return (typeof POSTER_META !== "undefined" && POSTER_META[id]) || {};
}
function stationOfSpirit(id) { const st = STATIONS.find(s => s.spiritIds.includes(id)); return st ? st.id : null; }
function posterHall(id) {
  if (typeof POSTER_HALL_EX !== "undefined" && Object.prototype.hasOwnProperty.call(POSTER_HALL_EX, id)) return POSTER_HALL_EX[id];
  const st = stationOfSpirit(id);
  return (st && typeof POSTER_HALLS !== "undefined" && POSTER_HALLS[st]) || null;
}
/* 二维码内容:当前网址 + #/codex(部署到哪就指到哪,扫码直达图鉴页) */
function codexUrl() {
  let base = "";
  try { base = (location.origin && location.origin !== "null") ? location.origin + location.pathname : location.href.split("#")[0]; }
  catch (e) { base = String(location.href || "").split("#")[0]; }
  return base + "#/codex";
}
function posterFromSpirit(id) { PST.spirit = id; location.hash = "#/poster"; }

function posterSpiritOptions(sel) {
  const opt = k => {
    const m = posterMeta(k);
    return `<option value="${k}"${k === sel ? " selected" : ""}>${SPIRITS[k].name}(${m.no || "—"})${(isCaptured(k) || isCustom(k)) ? " ✓" : ""}</option>`;
  };
  const starters = Object.values(SPIRITS).filter(s => s.starter).map(s => opt(s.id)).join("");
  const stations = STATIONS.filter(st => !st.secret || huaxiaUnlocked()).map(st => `<optgroup label="${st.name}">` + st.spiritIds.map(opt).join("") + `</optgroup>`).join("");
  const customs = CUSTOMS.length ? `<optgroup label="我的新唤醒(拍照)">` + CUSTOMS.map(c => opt(c.id)).join("") + `</optgroup>` : "";
  return customs + `<optgroup label="初始精灵">${starters}</optgroup>${stations}`;
}
function posterSpiritInfoHTML(id) {
  const s = SPIRITS[id], m = posterMeta(id), hall = posterHall(id);
  return `
    ${spiritImg(id, "poster-mini", s.name)}
    <div class="poster-mini-txt">
      <b>${s.name}</b><span class="p-no">图鉴编号:${m.no || "—"}</span>
      <span>年代:${s.era || "—"}${hall ? " · 馆藏:" + hall.hall : ""}</span>
      <i>${m.trivia || ""}</i>
    </div>`;
}
/* ================================================================
   AI 文物修复(拼图修复小游戏 · 顶栏「AI文物修复」栏目)
   玩法:AI 随机抽选一件 Q 版精灵 → AI 破损模拟打乱成拼图碎块 →
        点选/拖拽交换碎片,AI 复原度实时检测 → 复原完成出「AI 修复报告」;
   输出:可导出「完整参考图」+「可裁切拼图块」图纸(16 / 32 / 64 三档)。
   ================================================================ */
const RS_MODES = { "16": { cols: 4, rows: 4 }, "32": { cols: 8, rows: 4 }, "64": { cols: 8, rows: 8 } };
const RS = { spirit: null, mode: "16", slots: [], sel: -1, steps: 0, hints: 0, t0: 0, t1: 0, solved: false, auto: false, autoUsed: false, autoTimer: null, tick: null, rebuild: false, imgReady: false };
const rsImgCache = {};
const RS_FONT = '"Noto Serif SC","STSong","SimSun",serif';

/* AI 随机抽选(尽量避开刚抽过的同一件;随机源退化时也能确定性换位) */
function rsPick(first) {
  const pool = Object.values(SPIRITS).filter(s => !isCustom(s.id) && !spiritLocked(s.id));
  const i = Math.floor(Math.random() * pool.length) % pool.length;
  let s = pool[i];
  if (!first && RS.spirit && s.id === RS.spirit.id && pool.length > 1) s = pool[(i + 1) % pool.length];
  RS.spirit = s;
}
function rsNo(id) { const m = typeof POSTER_META !== "undefined" && POSTER_META[id]; return m && m.no ? m.no : ""; }
function rsStationName(id) { const st = STATIONS.find(s => s.spiritIds.includes(id)); return st ? st.name : ""; }
/* 「空白碎片」= 原图那块区域几乎全是无内容的底色。
   它放在哪儿看不出区别,玩家无从判断,所以不计入修复进度(分子分母都排除)。 */
function rsIsBlank(v) { return !!(RS.blank && RS.blank[v]); }
function rsBlankN() { const n = RS.blank ? RS.blank.length : 0; let c = 0; for (let i = 0; i < n; i++) if (RS.blank[i]) c++; return c; }
function rsTotal() {
  const m = RS_MODES[RS.mode], N = RS.slots.length || m.cols * m.rows;
  return Math.max(1, N - rsBlankN());
}
function rsCorrect(slots) {
  const s = slots || RS.slots;
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === i && !rsIsBlank(s[i])) c++;
  return c;
}

/* AI 破损模拟:重建布局并打乱(保证足够乱,不会“开局即完成”) */
function rsBuild(rescramble) {
  const m = RS_MODES[RS.mode], N = m.cols * m.rows;
  /* 空白格标记严格按「当前精灵 + 当前难度」取，避免沿用上一件的分布 */
  let bk = "";
  try { bk = rsBlankKey(); } catch (e) {}
  RS.blank = (bk && RS_BLANK[bk]) || [];
  let idx = [...Array(N).keys()];
  if (rescramble) {
    const tt = rsTotal();
    const need = Math.min(6, Math.max(1, tt - 2));
    let tries = 0;
    do { idx = shuffle(idx); tries++; } while (rsCorrect(idx) > tt - need && tries < 40);
    if (rsCorrect(idx) > tt - need) idx = idx.map((_, i) => (i + 1) % N);   // 兜底:循环错位,保证乱度
    RS.steps = 0; RS.hints = 0; RS.solved = false; RS.sel = -1;
    RS.auto = false; RS.autoUsed = false;
    RS.imgReady = !!(RS.spirit && RS_FLAT[RS.spirit.id]);
    RS.t0 = RS.imgReady ? Date.now() : 0; RS.t1 = 0;
    if (RS.autoTimer) { clearInterval(RS.autoTimer); RS.autoTimer = null; }
    if (!RS.tick) RS.tick = setInterval(rsTick, 1000);
  }
  RS.slots = idx;
}
function rsTick() { if (!document.getElementById("rs-status")) return; rsUpdateStatus(); }
function rsTime() {
  if (!RS.t0) return "0:00";
  const s = Math.max(0, Math.floor(((RS.t1 || Date.now()) - RS.t0) / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function rsStatusText(okN, N) {
  if (RS.solved) return "✅ AI 复原检测:100% · 修复完成";
  if (RS.auto) return "⚡ AI 自动修复中…";
  if (!RS.imgReady) return "🧩 AI 破损模拟:正在铺开 " + N + " 块碎片…";
  const pct = Math.round(okN / N * 100);
  const bn = rsBlankN();
  return "AI 复原检测:" + pct + "%(" + okN + "/" + N + ")· 步数 " + RS.steps + " · 用时 " + rsTime() + (RS.hints ? " · AI 提示 ×" + RS.hints : "") + (bn ? " · 空白格 " + bn + " 块不计" : "");
}
function rsUpdateStatus() {
  const N = rsTotal(), okN = rsCorrect(RS.slots);
  const bar = document.getElementById("rs-bar");
  if (bar) bar.style.width = (RS.imgReady ? Math.round(okN / N * 100) : 0) + "%";
  const st = document.getElementById("rs-status");
  if (st) st.textContent = rsStatusText(okN, N);
}
function rsPieceEl(i) { try { return document.querySelector('.rs-piece[data-slot="' + i + '"]'); } catch (e) { return null; } }
function rsPaintPiece(i) {
  const m = RS_MODES[RS.mode], el = rsPieceEl(i);
  if (!el) return;
  const v = RS.slots[i], c0 = v % m.cols, r0 = Math.floor(v / m.cols);
  el.style.backgroundPosition = (m.cols > 1 ? c0 / (m.cols - 1) * 100 : 0) + "% " + (m.rows > 1 ? r0 / (m.rows - 1) * 100 : 0) + "%";
  if (el.classList) {
    el.classList.toggle("ok", v === i);
    el.classList.toggle("blank", rsIsBlank(v));   // 空白碎片:看得出来它不计分
  }
}
function rsClick(i) {
  if (RS.auto || RS.solved) return;
  const el = rsPieceEl(i);
  if (RS.sel === -1) { RS.sel = i; if (el && el.classList) el.classList.add("sel"); return; }
  if (RS.sel === i) { RS.sel = -1; if (el && el.classList) el.classList.remove("sel"); return; }
  const prev = RS.sel; RS.sel = -1;
  const pe = rsPieceEl(prev); if (pe && pe.classList) pe.classList.remove("sel");
  rsSwap(prev, i);
}
function rsDragStart(e, i) {
  if (RS.auto || RS.solved) return;
  try { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; } catch (err) {}
}
function rsDrop(e, j) {
  e.preventDefault();
  if (RS.auto || RS.solved) return;
  let i = -1;
  try { i = parseInt(e.dataTransfer.getData("text/plain"), 10); } catch (err) {}
  if (isNaN(i) || i === j) return;
  rsSwap(i, j);
}
function rsSwap(a, b) {
  if (RS.solved || a === b) return;
  const t = RS.slots[a]; RS.slots[a] = RS.slots[b]; RS.slots[b] = t;
  RS.steps++;
  rsPaintPiece(a); rsPaintPiece(b);
  if (rsCorrect(RS.slots) === rsTotal()) rsFinish();
  rsUpdateStatus();
}
function rsFinish() {
  RS.solved = true; RS.t1 = Date.now(); RS.auto = false;
  if (RS.autoTimer) { clearInterval(RS.autoTimer); RS.autoTimer = null; }
  const bd = document.getElementById("rs-board"); if (bd && bd.classList) bd.classList.add("done");
  const rep = document.getElementById("rs-report"); if (rep) rep.innerHTML = rsReportHTML();
  rsUpdateStatus();
}
/* AI 提示:点亮“该交换的一对”(交换它俩可一次归位两块) */
function rsHint() {
  if (RS.auto || RS.solved) return;
  const N = RS.slots.length;
  let p = -1;
  for (let i = 0; i < N; i++) if (RS.slots[i] !== i && !rsIsBlank(RS.slots[i])) { p = i; break; }
  if (p === -1) for (let i = 0; i < N; i++) if (RS.slots[i] !== i) { p = i; break; }   // 只剩空白格没归位时兜底
  if (p === -1) return;
  const q = RS.slots[p];
  RS.hints++;
  [p, q].forEach(idx => {
    const el = rsPieceEl(idx);
    if (el && el.classList) { el.classList.add("hint"); setTimeout(() => el.classList.remove("hint"), 2400); }
  });
  rsUpdateStatus();
}
/* AI 一键修复:自动把碎片逐对归位(比赛演示用) */
function rsAuto() {
  if (RS.auto || RS.solved) return;
  RS.auto = true; RS.autoUsed = true; rsUpdateStatus();
  const stop = () => { RS.auto = false; if (RS.autoTimer) { clearInterval(RS.autoTimer); RS.autoTimer = null; } };
  const step = () => {
    if (!RS.slots.length || RS.solved) { stop(); return; }
    let p = -1;
    for (let i = 0; i < RS.slots.length; i++) if (RS.slots[i] !== i && !rsIsBlank(RS.slots[i])) { p = i; break; }
    if (p === -1) {
      /* 有内容的都归位了:剩下的空白格随便一换也能落定,兜着走完 */
      for (let i = 0; i < RS.slots.length; i++) if (RS.slots[i] !== i) { p = i; break; }
    }
    if (p === -1) { stop(); return; }
    rsSwap(p, RS.slots[p]);
  };
  step();
  if (!RS.solved) RS.autoTimer = setInterval(step, 130);
}
/* 换一件 / 切难度 / 重新打乱 */
function rsNew() { rsPick(false); RS.rebuild = true; render(); }
function rsMode(k) { if (!RS_MODES[k] || RS.mode === k) return; RS.mode = k; RS.rebuild = true; render(); }
function rsReshuffle() { rsBuild(true); render(); }

/* 拼图盘(布局由 RS.slots 决定;每块用 background-position 显示自己的原图切片)
   图源走 --rs-img 变量(由 rsHydrate 补上),避免 64 块各存一份 dataURL */
function rsBoardHTML() {
  const m = RS_MODES[RS.mode], N = m.cols * m.rows;
  let h = "";
  for (let i = 0; i < N; i++) {
    const v = RS.slots[i], c0 = v % m.cols, r0 = Math.floor(v / m.cols);
    const px = m.cols > 1 ? c0 / (m.cols - 1) * 100 : 0;
    const py = m.rows > 1 ? r0 / (m.rows - 1) * 100 : 0;
    h += `<div class="rs-piece${v === i ? " ok" : ""}${rsIsBlank(v) ? " blank" : ""}" data-slot="${i}"`
      + ` style="background-size:${m.cols * 100}% ${m.rows * 100}%;background-position:${px}% ${py}%"`
      + ` draggable="true" onclick="rsClick(${i})" ondragstart="rsDragStart(event,${i})" ondragover="event.preventDefault()" ondrop="rsDrop(event,${i})"></div>`;
  }
  return h;
}
function rsReportHTML() {
  const s = RS.spirit;
  if (!s) return "";
  const m = RS_MODES[RS.mode], N = m.cols * m.rows;
  const bn = rsBlankN();
  if (!RS.solved) return `
    <h3>🤖 AI 修复报告</h3>
    <p class="rs-note">修复进度实时同步:完成后这里会生成一份「AI 修复报告」——文物、编号、难度、用时、步数与 AI 辅助次数。拼图块由 AI 破损模拟引擎打乱,复原度由 AI 实时检测;盘面上带斜纹的<b>空白格</b>不计入进度(${N} 块中${bn ? " 有 <b>" + bn + "</b> 块" : "暂无"})。</p>`;
  return `
    <h3>🎉 修复完成 · AI 修复报告</h3>
    <ul class="rs-rep-list">
      <li><span>修复文物</span><b>${s.name}</b></li>
      <li><span>图鉴编号</span><b>${rsNo(s.id) || "—"}</b></li>
      <li><span>难度</span><b>${N} 块(${m.cols}×${m.rows})${bn ? " · 空白 " + bn + " 块不计" : ""}</b></li>
      <li><span>用时</span><b>${rsTime()}</b></li>
      <li><span>步数</span><b>${RS.steps} 步${RS.autoUsed ? "(含 AI 一键修复)" : ""}</b></li>
      <li><span>AI 提示</span><b>${RS.hints} 次</b></li>
    </ul>
    <p class="rs-note">AI 复原检测:100% · 文物重光 ✨</p>
    <button type="button" class="btn gold rs-dl" onclick="rsNew()">🎲 再修一件</button>`;
}
function viewRestore() {
  if (!RS.spirit) rsPick(true);
  const m0 = RS_MODES[RS.mode];
  if (RS.rebuild || RS.slots.length !== m0.cols * m0.rows) { RS.rebuild = false; rsBuild(true); }
  const m = RS_MODES[RS.mode], N = m.cols * m.rows, s = RS.spirit;
  const flat = RS_FLAT[s.id];
  const no = rsNo(s.id), st = rsStationName(s.id);
  const tt = rsTotal(), okN = rsCorrect(RS.slots), pct = Math.round(okN / tt * 100);
  return `
    <div class="page-head">
      <h2>🧩 AI 文物修复</h2>
      <p>AI 随机抽选一件 Q 版文物精灵,自动「破损模拟」成拼图碎块——点选或拖拽,把碎片换回原位、让文物重光。三档难度(16 / 32 / 64 块),可一键导出「完整参考图」与「可裁切拼图块」图纸,打印剪下即可线下拼玩。</p>
    </div>
    <div class="rs-ai-strip">
      <span class="rs-chip"><b>AI</b> 随机抽选</span>
      <span class="rs-chip"><b>AI</b> 破损模拟 · 已打乱</span>
      <span class="rs-chip"><b>AI</b> 复原度实时检测</span>
      <span class="rs-chip"><b>AI</b> 辅助修复(提示 / 一键)</span>
      <span class="rs-chip"><b>AI</b> 裁切导出 · 可打印</span>
    </div>
    <div class="card rs-bar">
      <div class="rs-spirit">
        ${spiritImg(s.id, "rs-ava", s.name)}
        <div><b>${s.name}</b><small>${no ? "编号 " + no + " · " : ""}${st ? st + " · " : ""}${ATTRIBUTES.primary[s.primary].name} / ${ATTRIBUTES.secondary[s.secondary].name}</small></div>
      </div>
      <div class="rs-modes">
        ${Object.keys(RS_MODES).map(k => `<button type="button" class="rs-mode${RS.mode === k ? " on" : ""}" onclick="rsMode('${k}')">${k} 块<small>${RS_MODES[k].cols}×${RS_MODES[k].rows}</small></button>`).join("")}
      </div>
      <div class="rs-acts">
        <button type="button" class="btn ghost" onclick="rsNew()">🎲 AI 换一件</button>
        <button type="button" class="btn ghost" onclick="rsReshuffle()">🧩 重新打乱</button>
        <button type="button" class="btn gold" onclick="rsHint()">💡 AI 提示</button>
        <button type="button" class="btn jade" onclick="rsAuto()">⚡ AI 一键修复</button>
      </div>
    </div>
    <div class="rs-statusline">
      <div class="rs-progress"><i id="rs-bar" style="width:${pct}%"></i></div>
      <span class="rs-status" id="rs-status">${rsStatusText(okN, N)}</span>
    </div>
    <div class="rs-wrap">
      <div class="card rs-boardwrap">
        <div class="rs-board${RS.solved ? " done" : ""}${flat && flat.url ? "" : " loading"}" id="rs-board" style="grid-template-columns:repeat(${m.cols},1fr);grid-template-rows:repeat(${m.rows},1fr)${flat && flat.url ? ";--rs-img:url('" + flat.url + "');aspect-ratio:" + (flat.ratio || 1) + " / 1" : ""}">
          ${rsBoardHTML()}
          <div class="rs-loading"><b>🧩 AI 破损模拟中</b><span>正在铺开碎片…</span></div>
        </div>
        <p class="rs-tip">玩法:点选两块交换位置,或直接拖拽碎片;「AI 提示」会点亮该交换的一对,「AI 一键修复」自动复原(比赛演示用)。<br>带斜纹的<b>空白格</b>是原图里本来就没画面的一块,放哪儿都看不出区别,因此<b>不计入修复进度</b>,也不用特意去拼它。</p>
      </div>
      <div class="rs-side">
        <div class="card rs-panel">
          <h3>🖼 完整参考图 <small>修复目标 · 拼图对照</small></h3>
          <img class="rs-refimg" src="精灵/透明/${s.id}.webp" alt="${s.name}">
          <p class="rs-note">${s.name}${no ? " · " + no : ""}${st ? " · " + st : ""}</p>
          <button type="button" class="btn ghost rs-dl" onclick="rsDownload('ref')">⬇ 下载完整参考图</button>
        </div>
        <div class="card rs-panel">
          <h3>✂️ AI 裁切输出台 <small>可打印 · 沿虚线裁切</small></h3>
          <canvas id="rs-cv-sheet" class="rs-sheet"></canvas>
          <p class="rs-note" id="rs-sheet-note">正在生成图纸…</p>
          <button type="button" class="btn ghost rs-dl" onclick="rsDownload('sheet')">⬇ 下载拼图块(可裁切)</button>
        </div>
        <div class="card rs-panel rs-rep" id="rs-report">${rsReportHTML()}</div>
      </div>
    </div>`;
}

/* ---- 图像与画布:参考图海报 + 可裁切拼图块图纸 ---- */
function rsLoadImg(id) {
  id = id || (RS.spirit && RS.spirit.id);
  return new Promise(res => {
    if (!id) return res(null);
    if (rsImgCache[id]) return res(rsImgCache[id]);
    const im = new Image();
    im.onload = () => { rsImgCache[id] = im; res(im); };
    im.onerror = () => res(null);
    im.src = "精灵/透明/" + id + ".webp";
  });
}
/* 透明立绘四周留白很大:直接切块会有大量「全透明空白碎片」。
   先扫描 alpha 找内容包围盒 → 裁掉透明边 → 按内容比例铺满画布(不拉伸、不留边),
   拼图板的 aspect-ratio 也跟着这个比例走,于是每块碎片都是真实画面。 */
const RS_FLAT = {};
function rsFlatCanvas(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  let x0 = 0, y0 = 0, w0 = iw, h0 = ih;
  try {
    const k = Math.min(1, 480 / Math.max(iw, ih));
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(iw * k));
    t.height = Math.max(1, Math.round(ih * k));
    const tc = t.getContext("2d");
    tc.drawImage(img, 0, 0, t.width, t.height);
    const d = tc.getImageData(0, 0, t.width, t.height).data;
    let ax = t.width, ay = t.height, bx = -1, by = -1;
    for (let y = 0; y < t.height; y++) {
      const base = y * t.width;
      for (let x = 0; x < t.width; x++) {
        if (d[(base + x) * 4 + 3] > 24) {
          if (x < ax) ax = x;
          if (x > bx) bx = x;
          if (y < ay) ay = y;
          if (y > by) by = y;
        }
      }
    }
    if (bx > ax && by > ay) {
      x0 = ax / k; y0 = ay / k;
      w0 = (bx - ax + 1) / k; h0 = (by - ay + 1) / k;
    }
  } catch (e) {}
  const LONG = 760;
  const r = w0 / h0;
  let W = Math.round(r >= 1 ? LONG : LONG * r);
  let H = Math.round(r >= 1 ? LONG / r : LONG);
  W = Math.max(160, W); H = Math.max(160, H);
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f7f1e4"; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, x0, y0, w0, h0, 0, 0, W, H);
  cv.__ratio = W / H;
  return cv;
}
function rsFlatImg(id) {
  id = id || (RS.spirit && RS.spirit.id);
  return rsLoadImg(id).then(img => (img ? rsFlatCanvas(img) : null));
}
function rsBoardURL(id, cb) {
  id = id || (RS.spirit && RS.spirit.id);
  if (!id) { cb && cb(null); return Promise.resolve(null); }
  if (RS_FLAT[id] !== undefined) { cb && cb(RS_FLAT[id]); return Promise.resolve(RS_FLAT[id]); }
  return rsFlatImg(id).then(cv => {
    let item = null;
    try {
      item = cv ? { url: cv.toDataURL("image/png"), ratio: cv.__ratio || 1 } : null;
    } catch (e) { item = null; }
    RS_FLAT[id] = item;
    cb && cb(item);
    return item;
  });
}
/* 扫描哪些碎片是「空白格」(原图那块几乎全是底色,看不出该放哪儿)。
   结果按 精灵+难度 缓存;这些格子不计入修复进度,盘面上也标成斜纹。 */
const RS_BLANK = {};
function rsBlankKey(id) { return (id || (RS.spirit && RS.spirit.id) || "") + "@" + RS.mode; }
function rsBlankScan(cv) {
  const m = RS_MODES[RS.mode], N = m.cols * m.rows;
  const arr = new Array(N).fill(0);
  try {
    const W = cv.width, H = cv.height;
    const d = cv.getContext("2d").getImageData(0, 0, W, H).data;
    const cw = W / m.cols, ch = H / m.rows;
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const x0 = Math.max(0, Math.floor(c * cw)), x1 = Math.min(W, Math.ceil((c + 1) * cw));
        const y0 = Math.max(0, Math.floor(r * ch)), y1 = Math.min(H, Math.ceil((r + 1) * ch));
        let bg = 0, n = 0;
        for (let y = y0; y < y1; y += 2) {
          const base = y * W;
          for (let x = x0; x < x1; x += 2) {
            const p = (base + x) * 4;
            if (Math.abs(d[p] - 247) < 10 && Math.abs(d[p + 1] - 241) < 10 && Math.abs(d[p + 2] - 228) < 12) bg++;
            n++;
          }
        }
        if (n && bg / n > 0.9) arr[r * m.cols + c] = 1;
      }
    }
  } catch (e) {}
  return arr;
}
function rsScanBlank(id, done) {
  const key = rsBlankKey(id);
  if (RS_BLANK[key]) { RS.blank = RS_BLANK[key]; done && done(); return; }
  const m = RS_MODES[RS.mode], N = m.cols * m.rows;
  const arr = new Array(N).fill(0);
  const item = RS_FLAT[id || (RS.spirit && RS.spirit.id)];
  if (!item || !item.url) { RS_BLANK[key] = arr; RS.blank = arr; done && done(); return; }
  const im = new Image();
  im.onload = () => {
    try {
      const cv = document.createElement("canvas");
      cv.width = im.naturalWidth || 1; cv.height = im.naturalHeight || 1;
      cv.getContext("2d").drawImage(im, 0, 0);
      const got = rsBlankScan(cv);
      for (let i = 0; i < arr.length; i++) arr[i] = got[i] || 0;
    } catch (e) {}
    RS_BLANK[key] = arr; RS.blank = arr; done && done();
  };
  im.onerror = () => { RS_BLANK[key] = arr; RS.blank = arr; done && done(); };
  im.src = item.url;
}
/* 扫描出结果后刷新盘面标记与进度(避免开局进度里混进空白格) */
function rsRepaintBlank() {
  for (let i = 0; i < RS.slots.length; i++) rsPaintPiece(i);
  rsUpdateStatus();
}
/* 拼图盘铺图:缓存命中就同步上,没命中先显示「正在铺开碎片」再补上 */
function rsApplyFlat(el, item) {
  if (!el || !item || !item.url) return;
  el.style.setProperty("--rs-img", "url('" + item.url + "')");
  el.style.aspectRatio = String(item.ratio || 1) + " / 1";
}
function rsHydrate() {
  const bd = document.getElementById("rs-board");
  if (!bd || !RS.spirit) return;
  const id = RS.spirit.id;
  const after = () => { rsImgReady(); rsScanBlank(id, rsRepaintBlank); };
  if (RS_FLAT[id]) { rsApplyFlat(bd, RS_FLAT[id]); after(); return; }
  rsBoardURL(id, item => {
    const el = document.getElementById("rs-board");
    if (!el || !RS.spirit || RS.spirit.id !== id) return;
    rsApplyFlat(el, item);
    after();
  });
}
function rsImgReady() {
  RS.imgReady = true;
  const bd = document.getElementById("rs-board");
  if (bd && bd.classList) bd.classList.remove("loading");
  if (!RS.t0) RS.t0 = Date.now();
  rsUpdateStatus();
}
function rsDrawSheet(cv, img) {
  const m = RS_MODES[RS.mode], N = m.cols * m.rows, s = RS.spirit;
  const W = 1200, head = 150, foot = 90;
  const pw = W / m.cols, ph = pw * (img.height / img.width) * (m.cols / m.rows);
  const gh = ph * m.rows;
  cv.width = W; cv.height = Math.round(head + gh + foot);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f8f3e8"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#5c3317";
  ctx.font = "700 44px " + RS_FONT;
  ctx.fillText("文物精灵 · AI 文物修复 — 拼图素材", 46, 66);
  ctx.font = "400 26px " + RS_FONT;
  ctx.fillStyle = "#8a5a2b";
  ctx.fillText(s.name + (rsNo(s.id) ? " · " + rsNo(s.id) : "") + (rsStationName(s.id) ? " · " + rsStationName(s.id) : "") + " · " + N + " 块(" + m.cols + "×" + m.rows + ")· 沿虚线裁切", 46, 110);
  const sw = img.width / m.cols, sh = img.height / m.rows;
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    ctx.drawImage(img, c * sw, r * sh, sw, sh, c * pw, head + r * ph, pw, ph);
  }
  ctx.strokeStyle = "rgba(150,110,60,.8)"; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
  for (let c = 0; c <= m.cols; c++) { ctx.beginPath(); ctx.moveTo(c * pw, head); ctx.lineTo(c * pw, head + gh); ctx.stroke(); }
  for (let r = 0; r <= m.rows; r++) { ctx.beginPath(); ctx.moveTo(0, head + r * ph); ctx.lineTo(W, head + r * ph); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(120,80,40,.9)"; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3);
  ctx.fillStyle = "#8a5a2b"; ctx.font = "400 24px " + RS_FONT;
  ctx.fillText("由「文物精灵」AI 裁切引擎自动切分 · 立绘为 AI 幻化生成 · 打印后沿虚线剪下即可拼玩", 46, cv.height - 38);
  ctx.textAlign = "right"; ctx.fillText(new Date().toLocaleDateString("zh-CN"), W - 46, cv.height - 38); ctx.textAlign = "start";
  return cv;
}
function rsDrawRef(cv, img) {
  const s = RS.spirit, no = rsNo(s.id), st = rsStationName(s.id);
  const W = 1080, H = 1440;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f8f3e8"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(181,67,47,.55)"; ctx.lineWidth = 3; ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = "rgba(150,110,60,.5)"; ctx.lineWidth = 1.5; ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.fillStyle = "#7c1511"; ctx.textAlign = "center";
  ctx.font = "700 58px " + RS_FONT;
  ctx.fillText("AI 文物修复 · 完整参考图", W / 2, 158);
  ctx.fillStyle = "#8a5a2b"; ctx.font = "400 30px " + RS_FONT;
  ctx.fillText("修复目标 —— 照着这张图,把碎片换回原位", W / 2, 214);
  const boxW = 780, boxH = 820, cy = 660;                 // 展示区中心(竖版海报)
  const r = (img.width || 1) / (img.height || 1);          // 参考图按内容比例居中,不拉伸
  let dw = boxW, dh = boxW / r;
  if (dh > boxH) { dh = boxH; dw = boxH * r; }
  ctx.drawImage(img, W / 2 - dw / 2, cy - dh / 2, dw, dh);
  ctx.fillStyle = "#3d2313"; ctx.font = "700 64px " + RS_FONT;
  ctx.fillText(s.name, W / 2, 1148);
  ctx.fillStyle = "#8a5a2b"; ctx.font = "400 32px " + RS_FONT;
  ctx.fillText((no ? no + " · " : "") + (st ? st + " · " : "") + ATTRIBUTES.primary[s.primary].name + " / " + ATTRIBUTES.secondary[s.secondary].name, W / 2, 1208);
  ctx.font = "400 26px " + RS_FONT; ctx.fillStyle = "#a5885e";
  ctx.fillText("由「文物精灵」AI 随机抽选 · 立绘为 AI 幻化生成 · 用于拼图修复比对", W / 2, 1320);
  ctx.fillText("文物精灵 · AI 应用演示 · " + new Date().toLocaleDateString("zh-CN"), W / 2, 1366);
  ctx.textAlign = "start";
  return cv;
}
async function rsPaintOutputs() {
  try {
    const cv = document.getElementById("rs-cv-sheet");
    if (!cv || !cv.getContext || !RS.spirit) return;   // 自检 / 静态预览环境直接跳过
    const img = await rsFlatImg();
    if (!img) return;
    rsDrawSheet(cv, img);
    const note = document.getElementById("rs-sheet-note");
    const m = RS_MODES[RS.mode], N = m.cols * m.rows;
    if (note) note.textContent = "本次图纸:" + RS.spirit.name + " · " + N + " 块(" + m.cols + "×" + m.rows + ")· 沿虚线裁切 —— 打印后剪下即可拼玩";
  } catch (e) {}
}
async function rsDownload(kind) {
  try {
    if (!RS.spirit) return;
    const img = await rsFlatImg();
    if (!img) { rsToast("图片还没加载好,请稍后再试"); return; }
    const cv = document.createElement("canvas");
    if (kind === "ref") rsDrawRef(cv, img); else rsDrawSheet(cv, img);
    const name = "文物精灵_AI文物修复_" + (kind === "ref" ? "完整参考图" : "拼图块" + RS.mode + "块") + "_" + RS.spirit.name + ".webp";
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    rsToast("已导出:" + name);
  } catch (e) { rsToast("导出失败:" + (e && e.message ? e.message : e)); }
}
function rsToast(msg) {
  let t = document.getElementById("rs-toast");
  if (!t) { t = document.createElement("div"); t.id = "rs-toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(rsToast._h);
  rsToast._h = setTimeout(() => t.classList.remove("show"), 2200);
}

/* =========================================================
   AI 精灵茶话会(跨文物对话)
   选 3~6 只已捕获精灵 → 读年代 / 出土地 / 知识库 → 本地串讲一场跨时空小故事
   解锁:图鉴收集 ≥ 3(含初始精灵);只展不捉的「燕赵名片」不参与
   ========================================================= */
const TEA = { picks: [], story: null, busy: false, cloudFail: false, cloudDone: 0, lastSrc: "", lastModel: "" };
/* 年代 → 朝代序(对齐 开场画卷的 夏→清 十六朝;新石器等史前为 -1) */
const TEA_ERA_RULES = [
  ["新石器", -1], ["红山", -1],
  ["夏", 0], ["商", 1], ["西周", 2], ["战国", 3], ["春秋", 3], ["东周", 3],
  ["秦", 4], ["西汉", 5], ["东汉", 5], ["汉代", 5], ["汉", 5],
  ["三国", 6], ["两晋", 7], ["晋", 7],
  ["北魏", 8], ["北齐", 8], ["南北朝", 8], ["隋", 9],
  ["唐代", 10], ["唐", 10],
  ["后周", 11], ["五代", 11],
  ["宋代", 12], ["宋", 12], ["辽", 12], ["金代", 12],
  ["元代", 13], ["元", 13],
  ["明代", 14], ["明", 14],
  ["清代", 15], ["清", 15]
];
const TEA_ERA_PRETTY = { "新石器": "新石器时代", "夏": "夏代", "商": "商代", "西周": "西周", "东周": "东周", "秦": "秦代", "汉": "汉代", "三国": "三国", "晋": "两晋", "南北朝": "南北朝", "隋": "隋代", "唐": "唐代", "五代": "五代", "宋": "宋代", "辽": "辽代", "元": "元代", "明": "明代", "清": "清代" };
function teaDyn(era) {
  let best = null;
  TEA_ERA_RULES.forEach(r => {
    const ix = era.indexOf(r[0]);
    if (ix < 0) return;
    if (!best || ix < best.ix || (ix === best.ix && r[0].length > best.t.length)) best = { ix: ix, rank: r[1], t: r[0] };
  });
  if (!best) return { rank: 99, short: String(era).split(/[ ·(]/)[0] || "岁月深处" };
  return { rank: best.rank, short: TEA_ERA_PRETTY[best.t] || best.t };
}
function teaMeta(s) {
  const st = STATIONS.find(t => t.spiritIds.includes(s.id));
  const d = teaDyn(s.era);
  return {
    s: s, rank: d.rank, eraShort: d.short,
    city: (st && !st.secret) ? (st.place.split("·")[1] || "").trim() : "",
    mat: ATTRIBUTES.primary[s.primary].name
  };
}
/* 可上桌的精灵:已捕获的 74 只正传精灵(不含「我点亮的文物」与只展不捉的名片) */
function teaPool() {
  return Object.values(SPIRITS).filter(s => !s.custom && isCaptured(s.id)).sort((a, b) => teaDyn(a.era).rank - teaDyn(b.era).rank);
}
function teaCountHTML() {
  const n = TEA.picks.length;
  if (n === 0) return "还没选精灵——下面都是你已捕获的老朋友,点一点就选中";
  if (n < 3) return `已选 <b>${n}</b> 只 · 还差 <b>${3 - n}</b> 只就能开场`;
  return `已选 <b>${n}</b> 只 · 满 3 只即可开场,最多 6 只 🍵`;
}
function teaGridHTML() {
  return teaPool().map(s => {
    const m = teaMeta(s);
    const on = TEA.picks.includes(s.id);
    return `<button type="button" class="tea-pick${on ? " on" : ""}" onclick="teaToggle('${s.id}')">
      ${spiritImg(s.id, "", s.name)}
      <span class="tp-nm">${s.name}</span>
      <span class="tp-era">${m.eraShort}${m.city ? " · " + m.city : ""}</span>
      <i class="tp-ck">✓</i>
    </button>`;
  }).join("");
}
function teaPaint(note) {
  const grid = $("#tea-grid"); if (grid) grid.innerHTML = teaGridHTML();
  const cnt = $("#tea-count"); if (cnt) cnt.innerHTML = teaCountHTML();
  const go = $("#tea-go"); if (go) go.disabled = TEA.picks.length < 3;
  const cl = $("#tea-clear"); if (cl) cl.style.display = TEA.picks.length ? "" : "none";
  const nt = $("#tea-note"); if (nt) nt.textContent = note || "至少选 3 只、最多 6 只;年代和地域越杂,聊得越热闹";
  teaChipPaint();
}
function teaPanelRefresh() { const pn = $("#tea-panel"); if (pn) pn.innerHTML = teaPanelHTML(); teaChipPaint(); }
function teaToggle(id) {
  const i = TEA.picks.indexOf(id);
  if (i >= 0) TEA.picks.splice(i, 1);
  else if (TEA.picks.length >= 6) { teaPaint("最多选 6 只哦,先取消一只再选~"); return; }
  else TEA.picks.push(id);
  teaPaint();
}
function teaRandom() {
  const pool = teaPool().map(s => s.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  const n = Math.min(pool.length, 3 + Math.floor(Math.random() * 4));   /* 3~6 只 */
  TEA.picks = pool.slice(0, n);
  teaPaint("🎲 帮你挑了 " + n + " 只,想换谁点一下就好");
}
function teaClear() { TEA.picks = []; teaPaint(); }
function teaStart() {
  if (TEA.picks.length < 3) return;
  teaStopPlay();
  TEA.busy = false; TEA.cloudFail = false; TEA.cloudDone = 0; TEA.lastSrc = ""; TEA.lastModel = "";
  TEA.story = teaInit();
  render();
  if (TEA.story) {
    teaPlay(TEA.story, TEA.story.lines.slice(0));
    setTimeout(() => { const el = $("#tea-stage"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: "smooth" }); }, 60);
  }
}
function teaAgain() {
  if (TEA.picks.length < 3) return;
  teaStopPlay();
  TEA.busy = false; TEA.cloudFail = false; TEA.cloudDone = 0; TEA.lastSrc = ""; TEA.lastModel = "";
  TEA.story = teaInit();
  render();
  if (TEA.story) {
    teaPlay(TEA.story, TEA.story.lines.slice(0));
    setTimeout(() => { const el = $("#tea-stage"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: "smooth" }); }, 60);
  }
}
function teaReset() { TEA.busy = false; teaStopPlay(); TEA.story = null; render(); }

/* ---- 茶话会·云端真聊:每一幕由云端大模型现场创作(小桥优先 → 网页直连),连不上自动回退本机台词库 ---- */
const TEA_CLOUD_SYS = "你是国风游戏「文物精灵」的金牌编剧:几位中国文物幻化的精灵,闭馆后围坐喝茶。按资料替它们写一段「活」的中文对话——要像老友闲聊,不是念展签。硬规矩:①只用资料里出现的人物;事实以资料为准,不编造具体史实、人名与数字;时代常识性的风俗可以写;②要有来有往:有人起话头、有人追问、有人打趣或抬杠、有人圆场,不许每个人都只顾自我介绍、背资料;③把资料揉碎了当谈资:用比喻、回忆、惊叹和俏皮话讲出来,让人听出性格——长者稳重、小辈机灵、贵气的端一端、民间的接地气;④口语化,有古意但不文言;不许出现现代词汇与外来词;语气词和笑声少而精(哎哟 / 哈哈 / 哦?);⑤每句 15~90 字;整段配 1~2 句旁白(茶烟、烛火、窗外月色这样的场景或神态),收尾要自然;⑥标点跟站内风格一致:逗号 / 冒号 / 分号用半角(, : ;),句末用全角 。,引语用「」;⑦who 只能填人物 id,旁白填 narr;只输出 JSON,不要代码块、不要多余文字:{\"lines\":[{\"who\":\"id 或 narr\",\"x\":\"一句话\"}]}";
function teaCloudReady() {
  if (TEA.cloudFail) return false;
  if (typeof fetch !== "function") return false;   // 自检/无网络环境:保持本机台词库路径
  if (IDENT.cloud === "on" && !(IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false)) return true;
  return !!identDirectKey();
}
function teaCloudMessages(st, phase, i) {
  const lore = (typeof TEA_LORE !== "undefined" && TEA_LORE) || {};
  const ppl = st.metas.map(m => {
    const pool = lore[String(m.rank)] || [];
    return {
      id: m.s.id, name: m.s.name, alias: m.s.alias || "", era: m.eraShort,
      from: m.city || "待考", kind: m.mat, about: String(m.s.intro || "").slice(0, 60),
      facts: (m.s.knowledge || []).slice(0, 3).map(k => String(k.a || "").slice(0, 80)),
      eraLore: pool.slice(0, 2).map(t => String(t).slice(0, 60))
    };
  });
  const prev = st.lines.slice(-10).map(l => l.t === "narr" ? ("旁白:" + String(l.x).slice(0, 60)) : ((SPIRITS[l.id] ? SPIRITS[l.id].name : "") + ":" + String(l.x).slice(0, 60)));
  const per = st.metas.length <= 4 ? "每人至少发言 2 次" : "每人至少说一句,主打 2~3 位";
  let task = "";
  if (phase === "topic") {
    const o = teaTopicOpts()[i] || teaTopicOpts()[0];
    task = "本幕话题:「" + o.t + "」(" + o.d + ")。先一句旁白开局,大家围绕话题聊开——至少一次追问、一次打趣或抬杠;" + per + ";共 10~14 句,结尾留个话头给下一幕。可用「人物.eraLore」里的年代趣闻添彩(那是草稿口吻,要化用,别照抄)。";
  } else if (phase === "star") {
    const sid = st.opts[i] && st.opts[i].sid;
    const m = st.metas.find(mm => mm.s.id === sid) || st.metas[0];
    task = "本幕请「" + m.s.name + "」压轴开讲:旁人先起哄、追问,它把自己的绝活或一段亲历讲出画面感(资料里的点,讲成小故事),其他人插话接住、惊叹或再追问;共 9~13 句。";
  } else {
    task = "本幕收尾(" + (["以茶代酒敬这场相遇", "合影留念", "拱手道别"][i] || "以茶代酒") + "):先一句旁白,最年长的带头开口,其余人接话,最年轻的说最后一句,再用一句旁白轻轻合上;共 6~9 句。";
  }
  return [
    { role: "system", content: TEA_CLOUD_SYS },
    { role: "user", content: JSON.stringify({ 场景: "文物精灵茶话会", 本幕: task, 人物: ppl, 前情: prev }) }
  ];
}
/* 把模型返回的 JSON 解析成可上屏的对话行;who 认不出或行数太少就返回 null(调用方回退本机) */
function teaCloudParse(text, metas) {
  let j = null;
  try { const m = String(text || "").match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch (e) { j = null; }
  if (!j || !Array.isArray(j.lines)) return null;
  const byKey = {};
  metas.forEach(m => { byKey[m.s.id] = m.s.id; byKey[m.s.name] = m.s.id; if (m.s.alias) byKey[m.s.alias] = m.s.id; });
  const out = [];
  j.lines.slice(0, 18).forEach(l => {
    if (!l) return;
    let x = String(l.x == null ? "" : l.x).replace(/\s+/g, " ").trim();
    if (!x) return;
    if (x.length > 140) x = x.slice(0, 140);
    const w = String(l.who == null ? "narr" : l.who).trim();
    if (!w || w === "narr" || w === "旁白") { out.push({ t: "narr", x: x }); return; }
    let id = byKey[w] || "";
    if (!id) { const k = Object.keys(byKey).find(kk => kk && (w.indexOf(kk) >= 0 || kk.indexOf(w) >= 0)); id = k ? byKey[k] : ""; }
    if (id) out.push({ t: "say", id: id, x: x });
  });
  return (out.length >= 4 && out.some(l => l.t === "say")) ? out : null;
}
/* 直连模式(没有小桥时网页直连云端:智谱免费 / 火山方舟):成功后返回 {text, model} */
async function teaDirectPost(model, messages, ms, key, thinking) {
  const body = { model: model, messages: messages, temperature: 0.9, max_tokens: 2000 };
  if (thinking) body.thinking = { type: "disabled" };   // 茶话会要即兴对白:关掉思维链,几秒出稿
  return await identFetchCloud(IDENT_ARK_URL, body, ms, key);
}
async function teaCloudDirect(messages, ms) {
  const key = identDirectKey();
  if (!key) throw new Error("还没有钥匙");
  if (identKeyKind(key) === "zhipu") return await teaCloudDirectZhipu(messages, ms, key);
  let lastErr = "";
  for (const model of identArkModels()) {
    let j;
    try { j = await teaDirectPost(model, messages, ms, key, true); }
    catch (e) { throw new Error("直连云端没连上"); }
    if (j && j.error && /thinking/i.test(String(j.error.message || ""))) {   // 这个模型不认思维开关:去掉再试一次
      try { j = await teaDirectPost(model, messages, ms, key, false); }
      catch (e) { throw new Error("直连云端没连上"); }
    }
    if (j && j.error) {
      const msg = String((j.error.code || "") + " " + (j.error.message || "")).trim();
      lastErr = msg;
      if (/InvalidEndpointOrModel|NotFound|does not exist|do not have access/i.test(msg)) continue;   // 这个模型没开通:换下一个
      throw new Error("云端接口报错:" + msg);
    }
    const md = j && j.choices && j.choices[0] ? j.choices[0].message : null;
    let text = md ? (md.content || md.reasoning_content || "") : "";
    if (Array.isArray(text)) text = text.map(p => (p && p.text) || "").join("");
    if (String(text || "").trim()) return { text: text, model: model };
    lastErr = "空回复";
  }
  throw new Error("没有可用的对话模型(" + lastErr.slice(0, 80) + ")");
}
/* 智谱直连(免费):glm-4.7-flash → glm-4-flash 逐个尝试 */
async function teaCloudDirectZhipu(messages, ms, key) {
  let lastErr = "";
  for (const model of IDENT_ZHIPU_TXT) {
    let j;
    try {
      j = await identZhipuChat({ model: model, messages: messages, temperature: 0.9, max_tokens: 1000 }, ms, key);
    } catch (e) { throw new Error("直连云端没连上"); }
    if (j && j.error) {
      const msg = String((j.error.code || "") + " " + (j.error.message || "")).trim();
      lastErr = msg;
      if (/429|400|1210|1305|1220|访问量|无权|参数非法/i.test(msg)) continue;   // 免费模型挤爆 / 参数兼容差异:换下一个
      throw new Error("云端接口报错:" + msg);
    }
    const md = j && j.choices && j.choices[0] ? j.choices[0].message : null;
    let text = md ? (md.content || md.reasoning_content || "") : "";
    if (Array.isArray(text)) text = text.map(p => (p && p.text) || "").join("");
    if (String(text || "").trim()) return { text: text, model: model };
    lastErr = "空回复";
  }
  throw new Error("没有可用的对话模型(" + lastErr.slice(0, 80) + ")");
}
/* 一幕云端创作:小桥优先,断了改直连;任何一步失败都返回 null(调用方回退本机台词库) */
async function teaCloudAct(st, phase, i) {
  try {
    const msgs = teaCloudMessages(st, phase, i);
    let text = "", used = "";
    const bridgeOk = IDENT.cloud === "on" && !(IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false);
    if (bridgeOk) {
      try {
        const r = await identFetchCloud(IDENT_CLOUD_API + "/api/chat", { messages: msgs, temperature: 0.9, max_tokens: 2000 }, 80000);
        if (r && r.ok && r.text) { text = r.text; used = r.model || "小桥"; }
      } catch (e) {}
    }
    if (!text && identDirectKey()) {
      const d = await teaCloudDirect(msgs, 70000);
      text = d.text; used = d.model;
    }
    if (!text) return null;
    const lines = teaCloudParse(text, st.metas);
    if (!lines) return null;
    TEA.lastModel = used;
    return lines;
  } catch (e) { return null; }
}
/* 页头状态条:已就绪 / 起草中 / 本机兜底(没钥匙时给「粘贴密钥」) */
function teaChipState() {
  if (TEA.busy) return { cls: " busy", html: "☁️ 云端 AI 正在起草这一段……(约 5~20 秒,先喝口茶)" };
  if (TEA.cloudFail) return { cls: " local", html: "📜 本段已切回本机台词库(云端这次没接上,「🔁 换一场」会自动重试)" };
  if (TEA.lastSrc === "cloud") return { cls: " on", html: "☁️ 本段对话由云端 AI 现场创作" + (TEA.lastModel ? "(" + TEA.lastModel + ")" : "") + (TEA.cloudDone > 1 ? " · 本场已 " + TEA.cloudDone + " 段" : "") };
  if (teaCloudReady()) return { cls: " on", html: "☁️ 云端真聊:已就绪 · 第 2 步起每段对话由大模型现场创作,连不上自动回退本机台词库" };
  const canPaste = !identDirectKey();
  return { cls: " off", html: "☁️ 云端真聊:正在连接云端…(可先点「▶ 开始」,连上就由 AI 写词,连不上自动用本机台词库)" };
}
function teaChipPaint() {
  const el = $("#tea-cloud-chip");
  if (!el) return;
  const s = teaChipState();
  el.className = "tea-cloudchip" + s.cls;
  el.innerHTML = s.html;
}
function teaCloudKeyPaste() {
  const k = window.prompt("把「AI 钥匙」整条粘贴到这里(智谱 id.secret 或 火山方舟 ark- 开头都行;只保存在这台电脑的浏览器里,确定后茶话会启用云端真聊):", "");
  if (k === null) return;
  const kk = k.trim();
  if (kk.length < 16) { alert("看起来不完整:请把整条 Key 一次性粘进来。"); return; }
  try { localStorage.setItem(IDENT_ARK_KEY_ITEM, kk); } catch (e) {}
  IDENT_DIRECT_CACHE = kk;
  try { aiImagineOff = false; } catch (e) {}
  TEA.cloudFail = false;
  teaChipPaint();
}
/* 进入茶话会页:点亮状态条,并顺手探一次小桥(有网才探) */
function teaInitView() {
  teaChipPaint();
  if (typeof fetch !== "function") return;
  if (IDENT.cloud !== "on") { try { identCloudPing().then(teaChipPaint); } catch (e) {} }
}
/* 随机取一项 / 填充模板占位符 */
function teaR(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function teaF(tpl, map) { return tpl.replace(/\{(\w+)\}/g, (m, k) => map[k] != null ? map[k] : m); }
/* 同一场里不重复用同一个问句(词穷了才允许复用) */
function teaQ(st, cat, aName) {
  const arr = TEA_TALK.q[cat] || TEA_TALK.q.any;
  st.qUsed = st.qUsed || {};
  const free = arr.filter(t => !st.qUsed[t]);
  const pool = free.length ? free : arr;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  st.qUsed[tpl] = 1;
  return teaF(tpl, { a: aName });
}
/* 第一幕:开场 + 自我介绍(之后交给玩家选话题) */
function teaInit() {
  const list = TEA.picks.map(id => SPIRITS[id]).filter(s => s && !s.custom);
  if (list.length < 3) return null;
  const metas = list.map(teaMeta).sort((a, b) => a.rank - b.rank);
  const st = { metas: metas, used: {}, qUsed: {}, loreUsed: {}, lines: [], say: 0, shown: 0, phase: "topic", opts: teaTopicOpts(), title: "", sub: "" };
  const names = metas.map(m => m.s.name);
  const namesJ = names.length <= 2 ? names.join("和") : names.slice(0, -1).join("、") + " 和 " + names[names.length - 1];
  const namesT = names.slice(0, 3).join("、") + (names.length > 3 ? " 等 " + names.length + " 位" : "");
  st.title = teaF(teaR(TEA_TALK.title), { names: namesT });
  st.sub = metas.length + " 位 · 从" + metas[0].eraShort + "聊到" + metas[metas.length - 1].eraShort + " · 你当主持人";
  st.lines.push({ t: "narr", x: teaF(teaR(TEA_TALK.open), { names: namesJ }) });
  st.lines.push({ t: "narr", x: teaF(teaR(TEA_TALK.seat), { eraMin: metas[0].eraShort, eraMax: metas[metas.length - 1].eraShort }) });
  metas.forEach((m, i) => st.lines.push({ t: "say", id: m.s.id, x: teaF(TEA_TALK.intro[i % TEA_TALK.intro.length], { name: m.s.name, alias: m.s.alias, intro: m.s.intro }) }));
  st.say = metas.length;
  return st;
}
/* 推进到下一幕:本地与云端两条路径共用一个出口(漏调就会卡在旧选项卡) */
function teaAdvance(st, phase, i) {
  if (phase === "topic") { st.phase = "star"; st.opts = teaStarOpts(st); }
  else if (phase === "star") { st.phase = "end"; st.opts = teaEndOpts(); }
  else { st.phase = "done"; st.opts = null; }
}
/* 本机台词库:按阶段生成下一幕(云端不可用或失败时的兜底,原逻辑原样) */
function teaActLocal(st, phase, i, out) {
  if (phase === "topic") teaSceneTopic(st, i, out);
  else if (phase === "star") teaSceneStar(st, st.opts[i].sid, out);
  else teaSceneEnd(st, i, out);
  teaAdvance(st, phase, i);
}
/* 玩家出牌:按阶段把下一幕追加进故事,再一句一句放出来;云端就绪时这一幕改由大模型现场创作 */
function teaChoose(i) {
  const st = TEA.story;
  if (!st || TEA.busy || !st.opts || !st.opts[i] || st.phase === "done") return;
  teaStopPlay();
  const phase = st.phase;
  if (teaCloudReady()) {
    TEA.busy = true;
    teaPanelRefresh();
    teaCloudAct(st, phase, i).then(function (lines) {
      TEA.busy = false;
      if (TEA.story !== st) return;   // 起草期间换了一场:旧内容丢弃
      const out = [];
      if (lines && lines.length) { TEA.lastSrc = "cloud"; TEA.cloudDone++; lines.forEach(l => out.push(l)); teaAdvance(st, phase, i); }
      else { TEA.cloudFail = true; teaActLocal(st, phase, i, out); }
      out.forEach(l => st.lines.push(l));
      teaPlay(st, out);
      teaChipPaint();
    });
    return;
  }
  const out = [];
  teaActLocal(st, phase, i, out);
  out.forEach(l => st.lines.push(l));
  teaPlay(st, out);
  teaChipPaint();
}
/* 一句一句放(像真在聊天):长短句自动调速,可暂停、可一口气显示 */
function teaDelayFor(l) { return Math.min(6500, Math.max(1300, 900 + (l.x || "").length * 55)); }
function teaStopPlay() {
  if (TEA.play) { if (typeof clearTimeout === "function") clearTimeout(TEA.play.timer); TEA.play = null; }
}
function teaLineToDOM(box, l, st) {
  const h = teaLineHTML(l, 0, st.say);
  if (l.t === "say") st.say++;
  st.shown++;
  if (!box) return;
  if (box.insertAdjacentHTML) box.insertAdjacentHTML("beforeend", h);
  else box.innerHTML += h;
  const last = box.lastElementChild;
  if (last && last.scrollIntoView) last.scrollIntoView({ block: "nearest" });
}
function teaTypingHTML() {
  const p = TEA.play, paused = p && p.paused;
  return `<div class="tea-typing">🍵 它们${paused ? "先歇口气,等你" : "正在你一言我一语"}……
    <button type="button" class="btn ghost" onclick="teaPauseToggle()">${paused ? "▶ 继续" : "⏸ 暂停"}</button>
    <button type="button" class="btn ghost" onclick="teaFlush()">⏩ 全部显示</button></div>`;
}
function teaFinish() {
  const p = TEA.play;
  if (!p) return;
  p.st.shown = p.st.lines.length;
  TEA.play = null;
  const pn = $("#tea-panel");
  if (pn) { pn.innerHTML = teaPanelHTML(); if (pn.scrollIntoView) pn.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
}
function teaNext() {
  const p = TEA.play;
  if (!p || p.paused) return;
  const box = $("#tea-lines");
  if (!box) { teaStopPlay(); return; }
  if (p.k >= p.lines.length) { teaFinish(); return; }
  const l = p.lines[p.k];
  teaLineToDOM(box, l, p.st);
  p.k++;
  p.timer = setTimeout(p.k >= p.lines.length ? teaFinish : teaNext, teaDelayFor(l));
}
function teaPlay(st, lines) {
  const box = $("#tea-lines"), panel = $("#tea-panel");
  if (!lines || !lines.length) { if (panel) panel.innerHTML = teaPanelHTML(); return; }
  if (!box || !box.insertAdjacentHTML || typeof setTimeout !== "function") {
    lines.forEach(l => teaLineToDOM(box, l, st));
    st.shown = st.lines.length;
    if (panel) panel.innerHTML = teaPanelHTML();
    return;
  }
  TEA.play = { timer: 0, lines: lines, k: 0, st: st, paused: false };
  if (panel) panel.innerHTML = teaTypingHTML();
  TEA.play.timer = setTimeout(teaNext, 600);
}
/* 暂停 / 继续 */
function teaPauseToggle() {
  const p = TEA.play;
  if (!p) return;
  p.paused = !p.paused;
  if (typeof clearTimeout === "function") clearTimeout(p.timer);
  const panel = $("#tea-panel");
  if (panel) panel.innerHTML = teaTypingHTML();
  if (!p.paused) teaNext();
}
/* 全部显示:跳过逐句播放 */
function teaFlush() {
  const p = TEA.play;
  if (!p) return;
  const box = $("#tea-lines");
  while (p.k < p.lines.length) { teaLineToDOM(box, p.lines[p.k], p.st); p.k++; }
  p.st.shown = p.st.lines.length;
  teaStopPlay();
  const panel = $("#tea-panel");
  if (panel) panel.innerHTML = teaPanelHTML();
}
/* 第二幕:按玩家选的话题聊开(掌故 / 风俗 / 手艺 / 来历 四条支线) */
const TEA_TOPIC_PREFERS = [
  [["哪年", "什么时候", "朝代", "年代", "历史", "始铸"]],
  [["用途", "干什么", "做什么", "怎么用", "作用", "盛", "装"]],
  [["工艺", "怎么做", "怎么造", "铸造", "鎏金", "错金", "黑花", "彩绘", "烧", "雕"], ["材质", "什么做", "材料"]],
  [["来历", "出土", "发现", "考古", "哪里", "名字", "为什么叫"]]
];
/* 取一段该年代的掌故(同一场里不重复用) */
function teaLore(st, rank) {
  const pool = (typeof TEA_LORE !== "undefined" && TEA_LORE[String(rank)]) || null;
  if (!pool) return null;
  const free = [];
  for (let i = 0; i < pool.length; i++) { if (!st.loreUsed[rank + "#" + i]) free.push({ i: i, t: pool[i] }); }
  if (!free.length) return null;
  const p = free[Math.floor(Math.random() * free.length)];
  st.loreUsed[rank + "#" + p.i] = 1;
  return p.t;
}
/* 一问一答(问句自动匹配答复分类、同场不重复) */
function teaAsk(st, out, asker, target, prefers) {
  const kk = teaKnowledge(target.s, st.used, prefers);
  if (!kk) return false;
  out.push({ t: "say", id: asker.s.id, x: teaQ(st, kk.cat, target.s.name) });
  out.push({ t: "say", id: target.s.id, x: kk.k.a });
  return true;
}
function teaSceneTopic(st, i, out) {
  out.push({ t: "narr", x: teaR(TEA_TALK.topicLead[i] || TEA_TALK.topicLead[0]) });
  if (i === 0) teaTopicEra(st, out);
  else if (i === 1) teaTopicLife(st, out);
  else if (i === 2) teaTopicCraft(st, out);
  else teaTopicOrigin(st, out);
  /* 还没轮到的精灵,每人补一段自家掌故 */
  const spoken = {};
  out.forEach(l => { if (l.t === "say") spoken[l.id] = 1; });
  const rest = st.metas.filter(m => !spoken[m.s.id]);
  const order = (rest.length ? rest : st.metas).slice();
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = order[k]; order[k] = order[j]; order[j] = t; }
  let extra = 0;
  for (let k = 0; k < order.length && extra < 2; k++) {
    const l = teaLore(st, order[k].rank);
    if (l) {
      out.push({ t: "say", id: order[k].s.id, x: teaR(TEA_TALK.extraLead) });
      out.push({ t: "say", id: order[k].s.id, x: l });
      extra++;
    }
  }
}
/* ① 年头与掌故:后辈先叹年代,长辈回敬,再各说一段自家朝代的新鲜事 */
function teaTopicEra(st, out) {
  const metas = st.metas, n = metas.length;
  const a = metas[0], b = metas[n - 1];
  const gap = Math.max(0, b.rank - a.rank);
  const pool = gap === 0 ? TEA_TALK.gapSame : (gap <= 2 ? TEA_TALK.gapNear : (gap <= 5 ? TEA_TALK.gapMid : TEA_TALK.gapFar));
  out.push({ t: "say", id: b.s.id, x: teaF(teaR(pool), { a: a.s.name, eraA: a.eraShort, eraB: b.eraShort, n: gap }) });
  out.push({ t: "say", id: a.s.id, x: teaF(teaR(TEA_TALK.gapBack), { b: b.s.name }) });
  const la = teaLore(st, a.rank);
  if (la) out.push({ t: "say", id: a.s.id, x: la });
  out.push({ t: "say", id: b.s.id, x: teaF(teaR(TEA_TALK.bridge), { x: a.s.name, eraM: b.eraShort }) });
  const lb = teaLore(st, b.rank);
  if (lb) out.push({ t: "say", id: b.s.id, x: lb });
  if (teaAsk(st, out, metas[1], a, TEA_TOPIC_PREFERS[0])) out.push({ t: "say", id: b.s.id, x: teaF(teaR(TEA_TALK.praise), { a: a.s.name }) });
  if (teaAsk(st, out, a, metas[1], TEA_TOPIC_PREFERS[0])) out.push({ t: "say", id: b.s.id, x: teaF(teaR(TEA_TALK.praise), { a: metas[1].s.name }) });
}
/* ② 风俗吃喝:三位各说自家朝代的日子,再挑一位问用途 */
function teaTopicLife(st, out) {
  const metas = st.metas, n = metas.length;
  const spread = [];
  [0, Math.floor(n / 2), n - 1].forEach(function (ix) { if (spread.indexOf(metas[ix]) < 0) spread.push(metas[ix]); });
  let prev = null;
  spread.forEach(function (m) {
    if (prev) out.push({ t: "say", id: m.s.id, x: teaF(teaR(TEA_TALK.bridge), { x: prev.s.name, eraM: m.eraShort }) });
    else out.push({ t: "say", id: m.s.id, x: teaF(teaR(TEA_TALK.openUp), { eraM: m.eraShort }) });
    const l = teaLore(st, m.rank);
    if (l) out.push({ t: "say", id: m.s.id, x: l });
    prev = m;
  });
  const last = spread[spread.length - 1];
  if (teaAsk(st, out, metas[1], last, TEA_TOPIC_PREFERS[1])) {
    out.push({ t: "say", id: spread[0].s.id, x: teaF(teaR(TEA_TALK.praise), { a: last.s.name }) });
  }
}
/* ③ 手艺门道:连问两轮,第三人叫好,主角再补自家掌故 */
function teaTopicCraft(st, out) {
  const metas = st.metas;
  const t = metas[1], asker = metas[0], third = metas[2];
  if (teaAsk(st, out, asker, t, TEA_TOPIC_PREFERS[2])) {
    out.push({ t: "say", id: asker.s.id, x: teaF(teaR(TEA_TALK.follow), { b: t.s.name }) });
    teaAsk(st, out, asker, t, TEA_TOPIC_PREFERS[2]);
    out.push({ t: "say", id: third.s.id, x: teaF(teaR(TEA_TALK.praise), { a: t.s.name }) });
  }
  out.push({ t: "say", id: t.s.id, x: teaF(teaR(TEA_TALK.bridge), { x: asker.s.name, eraM: t.eraShort }) });
  const l = teaLore(st, t.rank);
  if (l) out.push({ t: "say", id: t.s.id, x: l });
  if (teaAsk(st, out, third, metas[0], TEA_TOPIC_PREFERS[2])) {
    out.push({ t: "say", id: t.s.id, x: teaF(teaR(TEA_TALK.praise), { a: metas[0].s.name }) });
  }
}
/* ④ 出土来历:主角讲两段来历,再来客讲一段 */
function teaTopicOrigin(st, out) {
  const metas = st.metas, n = metas.length;
  const t = metas[n - 1], asker = metas[0], third = metas[1];
  if (teaAsk(st, out, asker, t, TEA_TOPIC_PREFERS[3])) {
    out.push({ t: "say", id: asker.s.id, x: teaF(teaR(TEA_TALK.follow), { b: t.s.name }) });
    teaAsk(st, out, asker, t, TEA_TOPIC_PREFERS[3]);
    out.push({ t: "say", id: third.s.id, x: teaF(teaR(TEA_TALK.praise), { a: t.s.name }) });
  }
  out.push({ t: "say", id: t.s.id, x: teaF(teaR(TEA_TALK.bridge), { x: asker.s.name, eraM: t.eraShort }) });
  const l = teaLore(st, t.rank);
  if (l) out.push({ t: "say", id: t.s.id, x: l });
  if (teaAsk(st, out, third, metas[0], TEA_TOPIC_PREFERS[3])) {
    out.push({ t: "say", id: t.s.id, x: teaF(teaR(TEA_TALK.praise), { a: metas[0].s.name }) });
  }
}
/* 第三幕:玩家点名的精灵压轴开讲(两问一答 + 回敬一段掌故 + 老乡/同门彩蛋) */
function teaSceneStar(st, sid, out) {
  const metas = st.metas, n = metas.length;
  const star = metas.find(m => m.s.id === sid) || metas[0];
  const si = metas.indexOf(star);
  const a1 = metas[(si + 1) % n], a2 = metas[(si + 2) % n];
  out.push({ t: "narr", x: teaF(teaR(TEA_TALK.starLead), { a: star.s.name }) });
  let last = a2;
  if (teaAsk(st, out, a1, star, [["名字", "为什么叫"], ["工艺", "怎么做"], ["用途", "干什么"], ["什么做", "材质"], ["造型", "样子"], ["来历", "出土"]])) {
    out.push({ t: "say", id: a2.s.id, x: teaF(teaR(TEA_TALK.follow), { b: star.s.name }) });
    teaAsk(st, out, a2, star, [["工艺", "怎么做"], ["故事", "来历"], ["用途", "干什么"], ["造型", "样子"], ["材质", "什么做"]]);
  }
  const sp = teaFindSpecial(metas);
  if (sp) {
    out.push({ t: "say", id: sp.a.s.id, x: teaF(teaR(TEA_TALK[sp.k]), { b: sp.b.s.name, city: sp.v, mat: sp.v }) });
    out.push({ t: "say", id: sp.b.s.id, x: teaR(TEA_TALK[sp.k === "town" ? "townBack" : "mateBack"]) });
    last = sp.b;
  } else {
    out.push({ t: "say", id: a1.s.id, x: teaF(teaR(TEA_TALK.praise), { a: star.s.name }) });
  }
  if (last !== star) out.push({ t: "say", id: star.s.id, x: teaF(teaR(TEA_TALK.bridge), { x: last.s.name, eraM: star.eraShort }) });
  const l = teaLore(st, star.rank);
  if (l) out.push({ t: "say", id: star.s.id, x: l });
}
/* 终幕:最年长的领敬、最年轻的接话,再按玩家选的方式散场 */
function teaSceneEnd(st, i, out) {
  const key = ["toast", "photo", "bye"][i] || "toast";
  const e = TEA_TALK.end[key];
  const metas = st.metas;
  const map = { eraMin: metas[0].eraShort, eraMax: metas[metas.length - 1].eraShort };
  out.push({ t: "narr", x: teaR(e.lead) });
  out.push({ t: "say", id: metas[0].s.id, x: teaF(teaR(e.say), map) });
  out.push({ t: "say", id: metas[metas.length - 1].s.id, x: teaF(teaR(e.back), map) });
  out.push({ t: "narr", x: teaR(TEA_TALK.closeNarr) });
}
function teaTopicOpts() {
  return [
    { em: "☕", t: "年头与朝代掌故", d: "比岁数,聊各朝的新鲜事" },
    { em: "🏮", t: "风俗·吃喝·穿戴", d: "吃啥穿啥、怎么过日子" },
    { em: "🛠️", t: "背后的手艺", d: "材质、工艺、门道" },
    { em: "🧭", t: "出土地与来历", d: "怎么来的、怎么被找到" }
  ];
}
function teaStarOpts(st) {
  const arr = st.metas.slice();
  for (let k = arr.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = arr[k]; arr[k] = arr[j]; arr[j] = t; }
  return arr.slice(0, Math.min(3, arr.length)).map(m => ({ sid: m.s.id, t: "点「" + m.s.name + "」", d: m.eraShort + (m.city ? " · " + m.city : "") }));
}
function teaEndOpts() {
  return [
    { em: "🍵", t: "举杯,说句心里话", d: "以茶代酒,敬这场相遇" },
    { em: "📸", t: "合个影,留个念", d: "给这一桌留张无形的照片" },
    { em: "🌙", t: "敬个礼,各回展柜", d: "像几百年前道别那样" }
  ];
}
/* 主持人面板:每步三张牌;走完全程后换成重玩按钮 */
function teaPanelHTML() {
  const st = TEA.story;
  if (!st) return "";
  if (TEA.busy) return `<div class="tea-typing">☁️ 云端 AI 正在为这一段想词……(约 5~20 秒,连不上会自动切回本机台词库)</div>`;
  if (st.phase === "done") return `<div class="tea-foot">
      <button class="btn gold" onclick="teaAgain()">🔁 换一场</button>
      <button class="btn ghost" onclick="teaReset()">↺ 重选精灵</button>
    </div>`;
  const titles = { topic: "轮到你当主持人 · 第 1 步(共 3 步):让他们聊什么?", star: "第 2 步:请谁压轴开讲?", end: "第 3 步:给今晚收个尾——" };
  const opts = (st.opts || []).map((o, i) => `<button type="button" class="tea-opt${o.sid ? " with-ava" : ""}" onclick="teaChoose(${i})">
      ${o.sid ? spiritImg(o.sid, "", "") : `<i class="op-em">${o.em || "🎴"}</i>`}
      <span class="op-t">${o.t}</span>
      ${o.d ? `<span class="op-d">${o.d}</span>` : ""}
    </button>`).join("");
  return `<div class="tea-panel-in">
      <b>🎤 ${titles[st.phase] || ""}</b>
      <div class="tea-opts">${opts}</div>
      <div class="tea-mini">
        <button class="btn ghost" onclick="teaAgain()">🔁 换一场</button>
        <button class="btn ghost" onclick="teaReset()">↺ 重选精灵</button>
      </div>
    </div>`;
}

/* 知识库 → 问句分类(问题与答复永远对得上) */
function teaCatOf(keys) {
  const K = keys.join("|");
  const has = arr => arr.some(w => K.indexOf(w) >= 0);
  if (has(["哪年", "什么时候", "朝代", "年代", "历史", "哪一年", "多久"])) return "time";
  if (has(["名字", "为什么叫", "叫什么", "意思"])) return "name";
  if (has(["多大", "多高", "尺寸", "多重", "重量", "多长", "多少片", "厘米", "高度", "多厚", "公斤"])) return "size";
  if (has(["材质", "什么做", "材料", "什么玉", "什么釉", "石头", "汉白玉"])) return "mat";
  if (has(["工艺", "怎么做", "怎么造", "铸造", "鎏金", "错金", "黑花", "彩绘", "模印", "烧", "雕"])) return "craft";
  if (has(["用途", "干什么", "做什么", "怎么用", "作用", "盛", "装", "照", "睡"])) return "use";
  if (has(["哪里", "在哪", "出土", "发现", "考古", "来历", "哪里来", "产地", "发现地", "怎么来"])) return "origin";
  if (has(["造型", "样子", "像什么", "模样", "姿态", "姿势"])) return "look";
  return "any";
}
function teaKnowledge(s, used, prefers) {
  const ks = s.knowledge || [];
  const cands = ks.map((k, i) => ({ k: k, i: i, cat: teaCatOf(k.keys || []) })).filter(c => !used[s.id + "#" + c.i]);
  if (!cands.length) return null;
  let hit = null;
  for (const arr of (prefers || [])) {
    hit = cands.find(c => c.k && c.k.keys.some(x => arr.some(w => x.indexOf(w) >= 0)));
    if (hit) break;
  }
  if (!hit) hit = cands[Math.floor(Math.random() * cands.length)];
  used[s.id + "#" + hit.i] = 1;
  return hit;
}
/* 老乡 / 同门彩蛋:先找同城,再找同材质,没有就返回空 */
function teaFindSpecial(metas) {
  let sp = null;
  for (let i = 0; i < metas.length && !sp; i++) {
    for (let j = i + 1; j < metas.length && !sp; j++) {
      if (metas[i].city && metas[i].city === metas[j].city) sp = { k: "town", v: metas[i].city, a: metas[i], b: metas[j] };
    }
  }
  if (!sp) {
    for (let i = 0; i < metas.length && !sp; i++) {
      for (let j = i + 1; j < metas.length && !sp; j++) {
        if (metas[i].mat === metas[j].mat) sp = { k: "mate", v: metas[i].mat, a: metas[i], b: metas[j] };
      }
    }
  }
  return sp;
}
/* 对话气泡:旁白居中;发言左右交错,边框取自主属性色(di=入场错峰、si=第几句发言) */
function teaLineHTML(l, di, si) {
  const st = "animation-delay:" + Math.min(Math.max(di, 0) * 0.16, 3.2).toFixed(2) + "s";
  if (l.t === "narr") return `<p class="tea-narr tea-line" style="${st}"><span>${l.x}</span></p>`;
  const s = SPIRITS[l.id]; if (!s) return "";
  const m = teaMeta(s);
  const c = ATTRIBUTES.primary[s.primary].color;
  return `<div class="tea-say tea-line${si % 2 ? " r" : ""}" style="${st};--c:${c}">
    <span class="tea-ava">${spiritImg(s.id, "", s.name)}</span>
    <div class="tea-body">
      <div class="tea-who"><b>${s.name}</b><i>${m.eraShort}${m.city ? " · " + m.city : ""}</i></div>
      <div class="tea-bub">${l.x}</div>
    </div>
  </div>`;
}
/* 批量渲染(基址用于新一幕的错峰入场;返回更新后的发言计数) */
function teaLinesHTML(lines, base, sayStart) {
  let si = sayStart;
  const html = lines.map(function (l, i) { const h = teaLineHTML(l, i - base, si); if (l.t === "say") si++; return h; }).join("");
  return { html: html, say: si };
}
/* ---------------- 茶话会页 ---------------- */
function viewTea() {
  const pool = teaPool();
  const open = pool.length >= 3;
  const story = TEA.story;
  return `
    <div class="page-head">
      <h2>🍵 AI 精灵茶话会</h2>
      <p>闭馆之后,把几只文物精灵请到一桌:读它们的年代、出土地和知识库,生成一段跨时空的对话小故事——看看后周的铁狮子,和战国中山国的小伙伴,隔着千年聊些什么。联网登录后,每一幕由云端 AI 现场写词;断网自动切回本机台词库,怎么都不会冷场。</p>
    </div>
    <div class="tea-cloudchip${teaChipState().cls}" id="tea-cloud-chip">${teaChipState().html}</div>
    <div class="tea-howto">
      <b>🍵 怎么玩(三步 · 你来当主持 · 云端真聊)</b>
      <ol>
        <li><b>选精灵</b>:在下面点选 <b>3~6 只</b>已捕获精灵——年代、地域差得越远,聊得越热闹。</li>
        <li><b>开场当主持</b>:点「🍵 开场」,它们按年纪排排坐、先自我介绍;对话<b>一句一句慢慢来</b>——按句子长短自动调速,可「⏸ 暂停」细品、「⏩ 全部显示」一口气看完;之后<b>轮到你当主持人</b>——每步选一张牌:聊什么(年头掌故 / 风俗吃喝 / 手艺 / 来历 四选一)、请谁压轴、怎么收尾;云端就绪时,你选的<b>每一幕都由大模型现场写词</b>(约 5~20 秒),连不上自动切回本机。</li>
        <li><b>多玩几次</b>:对话是一问一答、相互接话的;点「🔁 换一场」重新随机,或「↺ 重选精灵」换一批组合,每场都不一样。</li>
      </ol>
      <p>对话优先由云端 AI 现场创作(用精灵的名字、年代、出土地和知识库做设定);云端接不上时,由本机台词库用年代、出土地、知识库加各朝掌故串讲兜底——你的选择决定话题与主角,只图一乐,不影响对战、捕捉和图鉴收集进度。</p>
    </div>
    ${!open ? `
    <div class="card tea-lock">
      <div class="lk-ico">🔒</div>
      <b>还差一点点就解锁</b>
      <p class="muted">「精灵茶话会」需要图鉴收集满 3 只精灵(当前 ${pool.length} / 3)。去唤醒几只小伙伴吧!</p>
      <div class="lk-bar"><i style="width:${Math.min(100, pool.length / 3 * 100)}%"></i></div>
      <button class="btn gold" onclick="location.hash='#/codex'">📖 去图鉴看看</button>
    </div>` : story ? `
    <div class="tea-stage" id="tea-stage">
      <div class="tea-title"><b>${story.title}</b><span>${story.sub}</span></div>
      <div class="tea-lines" id="tea-lines">${teaLinesHTML(story.lines.slice(0, story.shown == null ? story.lines.length : story.shown), 0, 0).html}</div>
      <div id="tea-panel">${teaPanelHTML()}</div>
    </div>` : `
    <div class="tea-picks-head">
      <h3>第 1 步 · 点选精灵 <small class="muted">(3~6 只)</small></h3>
      <span class="tea-count" id="tea-count">${teaCountHTML()}</span>
    </div>
    <div class="tea-grid" id="tea-grid">${teaGridHTML()}</div>
    <div class="tea-acts">
      <button class="btn gold" id="tea-go" onclick="teaStart()" ${TEA.picks.length < 3 ? "disabled" : ""}>🍵 开场</button>
      <button class="btn ghost" onclick="teaRandom()">🎲 帮我挑一组</button>
      <button class="btn ghost" id="tea-clear" style="${TEA.picks.length ? "" : "display:none"}" onclick="teaClear()">↺ 清空重选</button>
      <span class="tea-note" id="tea-note">至少选 3 只、最多 6 只;年代和地域越杂,聊得越热闹</span>
    </div>`}
  `;
}

function viewPoster() {
  const id = posterSpiritId();
  const hasPhoto = !!PST.photo;
  return `
    <div class="page-head">
      <h2>🤳 AI 打卡海报</h2>
      <p>在博物馆现场拍下你与文物的合影,一键合成国风 Q 版主题打卡海报:文物名称与图鉴编号、精灵立绘、一句冷知识、年代与馆藏博物馆,再落上项目二维码——扫码直达图鉴页,继续打卡探索燕赵文物精灵。</p>
    </div>
    <div class="poster-note">🔒 演示版在本机浏览器完成合成:照片不上传、不联网;上线后可接入云端 AI,得到更「写实 / Q版」的融合效果。</div>

    <h3 class="section-title">第一步 · 选择合成风格(点例图切换)</h3>
    <div class="poster-demo-grid">
      ${["realistic", "chibi"].map(k => {
        const cfg = POSTER_STYLES[k];
        return `
        <figure class="poster-ex${PST.style === k ? " on" : ""}" onclick="posterSetStyle('${k}')">
          <img src="打卡海报/例图_${cfg.name}.webp" alt="${cfg.name}风格打卡海报例图">
          <figcaption><b>${cfg.name}风格</b><span>${k === "realistic" ? "保留真人合影质感 · 低饱和古风配色" : "合影柔和提色 · Q 版卡通装饰"}</span></figcaption>
        </figure>`;
      }).join("")}
    </div>

    <h3 class="section-title">第二步 · 上传合影 · 选文物 · 生成</h3>
    <div class="card poster-workshop">
      <label class="poster-drop${hasPhoto ? " has-photo" : ""}" for="posterPhoto">
        <input type="file" id="posterPhoto" accept="image/*" onchange="posterPickPhoto(this)">
        ${hasPhoto
          ? `<img class="poster-picked" src="${PST.photo}" alt="已选合影"><span class="poster-repick">📷 换一张(点击此处重新选择)</span>`
          : `<span class="poster-drop-ico">📷</span><b>点击选择 / 拍摄「你与文物」的合影</b><span>手机端可直接调起相机;照片只在本机合成,不会上传</span>`}
      </label>

      <div class="poster-row">
        <span class="poster-lab">选择文物精灵</span>
        <select id="posterSpiritSel" class="poster-select" onchange="posterPickSpirit(this.value)">
          ${posterSpiritOptions(id)}
        </select>
      </div>
      <div class="poster-spirit-info" id="posterSpiritInfo">${posterSpiritInfoHTML(id)}</div>

      <div class="poster-row">
        <span class="poster-lab">合成风格</span>
        <div class="poster-pills">
          ${["realistic", "chibi"].map(k => `<button type="button" class="poster-pill${PST.style === k ? " on" : ""}" onclick="posterSetStyle('${k}')">${k === "realistic" ? "🎞 写实" : "🎨 Q版"}</button>`).join("")}
        </div>
      </div>

      <div class="poster-actions">
        <button type="button" class="btn jade" id="posterGoBtn" onclick="posterGenerate()">✨ 一键生成海报</button>
        <span class="poster-status" id="posterStatus"></span>
      </div>
    </div>

    <h3 class="section-title">第三步 · 预览与保存</h3>
    <div class="poster-stage" id="posterStage">
      <div class="poster-placeholder" id="posterPlaceholder">🖼 生成后的海报会显示在这里<br><small>1080 × 1920 · 适合发朋友圈</small></div>
      <canvas id="posterCanvas" width="${POSTER_W}" height="${POSTER_H}" class="hidden"></canvas>
      <div class="poster-down">
        <button type="button" class="btn gold hidden" id="posterDownloadBtn" onclick="posterDownload()">⬇ 保存海报</button>
        <span class="muted">保存到本地;手机上也可直接长按图片保存</span>
      </div>
    </div>`;
}

function posterSetStyle(k) {
  PST.style = k;
  $$(".poster-ex").forEach((el, i) => el.classList.toggle("on", (i === 0 ? "realistic" : "chibi") === k));
  $$(".poster-pill").forEach((el, i) => el.classList.toggle("on", (i === 0 ? "realistic" : "chibi") === k));
  posterMarkDirty();
}
function posterPickSpirit(id) {
  PST.spirit = id;
  const box = $("#posterSpiritInfo");
  if (box) box.innerHTML = posterSpiritInfoHTML(id);
  posterMarkDirty();
}
function posterMarkDirty() {
  const st = $("#posterStatus"), c = $("#posterCanvas");
  if (st && c && !c.classList.contains("hidden")) st.textContent = "🔄 已调整,点「一键生成海报」重新合成";
}
function posterPickPhoto(input) {
  const f = input && input.files && input.files[0];
  if (!f) return;
  if (!/^image\//.test(f.type || "")) { alert("请选择图片文件"); return; }
  try { if (PST.photo) URL.revokeObjectURL(PST.photo); } catch (e) {}
  PST.photo = URL.createObjectURL(f);
  const drop = $(".poster-drop");
  if (drop) {
    drop.classList.add("has-photo");
    drop.innerHTML = `<input type="file" id="posterPhoto" accept="image/*" onchange="posterPickPhoto(this)">
      <img class="poster-picked" src="${PST.photo}" alt="已选合影"><span class="poster-repick">📷 换一张(点击此处重新选择)</span>`;
  }
  const st = $("#posterStatus");
  if (st) st.textContent = "✅ 照片已就位,选好文物和风格后点「一键生成海报」";
}
function posterGenerate() {
  const status = $("#posterStatus"), btn = $("#posterGoBtn");
  if (!PST.photo) {
    if (status) status.textContent = "📷 先选择一张你与文物的合影吧";
    const drop = $(".poster-drop");
    if (drop) { drop.classList.remove("shake"); void drop.offsetWidth; drop.classList.add("shake"); }
    return;
  }
  if (status) status.textContent = "🎨 AI 正在合成…(照片不出本机)";
  if (btn) { btn.disabled = true; btn.textContent = "合成中…"; }
  const id = posterSpiritId();
  setTimeout(() => {
    posterCompose(id).then(() => {
      const c = $("#posterCanvas"), ph = $("#posterPlaceholder"), dl = $("#posterDownloadBtn");
      if (c) c.classList.remove("hidden");
      if (ph) ph.classList.add("hidden");
      if (dl) dl.classList.remove("hidden");
      if (status) status.textContent = "✅ 合成完成!长按图片或点「保存海报」收藏";
      if (btn) { btn.disabled = false; btn.textContent = "✨ 一键生成海报"; }
    }).catch(err => {
      if (status) status.textContent = "合成失败:" + ((err && err.message) || err);
      if (btn) { btn.disabled = false; btn.textContent = "✨ 一键生成海报"; }
    });
  }, 1100);
}
function posterDownload() {
  const c = $("#posterCanvas");
  if (!c || c.classList.contains("hidden")) return;
  try {
    const url = c.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = url; a.download = "文物精灵打卡_" + SPIRITS[posterSpiritId()].name + ".webp";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch (e) {
    alert("海报已生成(见上方预览),但当前打开方式不允许直接下载。\n请通过 http 方式(本地服务器或部署网址)打开本页再保存,或直接对预览截图。");
  }
}

/* ---- 海报 Canvas 合成引擎 ---- */
function posterLoadImg(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("图片加载失败:" + src));
    im.src = src;
  });
}
function posterRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function posterCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function posterFont(size, weight) {
  return (weight ? weight + " " : "") + size + 'px "KaiTi","STKaiti","Kaiti SC","Noto Serif SC","SimSun",serif';
}
function posterWrap(ctx, text, maxW) {
  const out = []; let line = "";
  const NO_START = "」』】》〉、。,.:;!?)…—～";
  for (const ch of String(text)) {
    if (line && ctx.measureText(line + ch).width > maxW && !NO_START.includes(ch)) { out.push(line); line = ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}
function posterDrawQr(ctx, url, x, y, size) {
  posterRoundRect(ctx, x, y, size, size, 20);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.strokeStyle = "rgba(90,105,85,.45)"; ctx.lineWidth = 2; ctx.stroke();
  if (typeof qrcode !== "function") return false;
  try { qrcode.stringToBytes = (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["UTF-8"]) || qrcode.stringToBytes; } catch (e) {}
  let qr = null;
  try { qr = qrcode(0, "M"); qr.addData(url); qr.make(); } catch (e) { qr = null; }
  if (!qr) return false;
  const n = qr.getModuleCount(), quiet = 4, cell = Math.floor((size - 24) / (n + quiet * 2));
  const total = cell * (n + quiet * 2);
  const ox = x + (size - total) / 2, oy = y + (size - total) / 2;
  ctx.fillStyle = "#23281f";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (qr.isDark(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
  return true;
}
function posterSparkle(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * .12, -s * .12, s, 0);
  ctx.quadraticCurveTo(s * .12, s * .12, 0, s);
  ctx.quadraticCurveTo(-s * .12, s * .12, -s, 0);
  ctx.quadraticCurveTo(-s * .12, -s * .12, 0, -s);
  ctx.fill(); ctx.restore();
}

function posterCompose(spiritId) {
  const s = SPIRITS[spiritId], m = posterMeta(spiritId), hall = posterHall(spiritId);
  const cfg = POSTER_STYLES[PST.style] || POSTER_STYLES.realistic;
  return Promise.all([
    posterLoadImg(PST.photo),
    posterLoadImg(isCustom(spiritId) ? customById(spiritId).img : "精灵/透明/" + spiritId + ".webp"),
    posterLoadImg("装饰/宣纸纹.webp"),
    posterLoadImg("装饰/流云.webp"),
    posterLoadImg("装饰/印章.webp")
  ]).then(imgs => {
    const photo = imgs[0], sprite = imgs[1], paperT = imgs[2], cloud = imgs[3], seal = imgs[4];
    const c = $("#posterCanvas");
    if (!c) throw new Error("海报画布缺失");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, POSTER_W, POSTER_H);

    // 1) 宣纸底:渐变 + 纸纹平铺
    const g = ctx.createLinearGradient(0, 0, 0, POSTER_H);
    g.addColorStop(0, cfg.paper); g.addColorStop(1, cfg.paper2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, POSTER_W, POSTER_H);
    ctx.globalAlpha = .5;
    for (let y = 0; y < POSTER_H; y += 256) for (let x = 0; x < POSTER_W; x += 256) ctx.drawImage(paperT, x, y);
    ctx.globalAlpha = 1;

    // 2) 装饰:飘云、印章、细边框
    ctx.globalAlpha = cfg.cloudA;
    ctx.drawImage(cloud, 44, 96, 320, 107);
    ctx.drawImage(cloud, 648, 74, 260, 87);
    ctx.drawImage(cloud, 84, 1424, 280, 93);
    ctx.globalAlpha = .78; ctx.drawImage(seal, 944, 56, 84, 84); ctx.globalAlpha = 1;
    ctx.strokeStyle = cfg.line; ctx.globalAlpha = .55; ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, POSTER_W - 60, POSTER_H - 60);
    ctx.globalAlpha = .3; ctx.lineWidth = 1.5;
    ctx.strokeRect(46, 46, POSTER_W - 92, POSTER_H - 92);
    ctx.globalAlpha = 1;

    // 3) 精灵立绘(透明版)+ 光晕
    ctx.save();
    ctx.globalAlpha = .85; ctx.fillStyle = cfg.glow;
    ctx.beginPath(); ctx.ellipse(810, 898, 300, 56, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (isCustom(spiritId)) {
      // 拍照唤醒的精灵:方形幻化卡图,加一层描金圆角相框
      ctx.save();
      posterRoundRect(ctx, 486, 296, 648, 648, 42);
      ctx.fillStyle = "#fffdf6"; ctx.fill();
      ctx.strokeStyle = "rgba(201,162,39,.9)"; ctx.lineWidth = 6; ctx.stroke();
      posterRoundRect(ctx, 500, 310, 620, 620, 30);
      ctx.clip();
      ctx.drawImage(sprite, 500, 310, 620, 620);
      ctx.restore();
    } else {
      ctx.save();
      if (cfg.sparkle) ctx.shadowColor = "rgba(255,255,255,.9)";
      else ctx.shadowColor = "rgba(70,80,60,.28)";
      ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
      ctx.drawImage(sprite, 500, 310, 620, 620);
      ctx.restore();
    }
    if (cfg.sparkle) {
      posterSparkle(ctx, 555, 420, 20, "rgba(215,180,90,.9)");
      posterSparkle(ctx, 1030, 520, 15, "rgba(215,180,90,.75)");
      posterSparkle(ctx, 585, 850, 14, "rgba(215,180,90,.7)");
    }

    // 4) 合影照片(圆角白卡)
    const px = 92, py = 200, pw = 470, ph = 566, pr = 30;
    ctx.save();
    posterRoundRect(ctx, px - 14, py - 14, pw + 28, ph + 28, pr + 10);
    ctx.fillStyle = "#fffdf6"; ctx.fill();
    ctx.strokeStyle = cfg.line; ctx.globalAlpha = .8; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1;
    posterRoundRect(ctx, px, py, pw, ph, pr);
    ctx.clip();
    try { ctx.filter = cfg.photoF; } catch (e) {}
    posterCover(ctx, photo, px, py, pw, ph);
    try { ctx.filter = "none"; } catch (e) {}
    ctx.restore();

    // 5) 标题:文物名称 + 文物精灵打卡
    const tx = 92;
    ctx.textAlign = "left";
    ctx.fillStyle = cfg.title;
    const nameSize = Math.min(96, Math.floor(900 / Math.max(s.name.length, 4)));
    ctx.font = posterFont(nameSize, "bold");
    ctx.fillText(s.name, tx, 1046);
    ctx.font = posterFont(88, "bold");
    ctx.fillText("文物精灵打卡", tx, 1162);

    // 6) 图鉴编号 / 年代 · 馆藏 / 冷知识
    ctx.fillStyle = cfg.sub;
    ctx.font = posterFont(38, "bold");
    ctx.fillText("图鉴编号:" + (m.no || "—"), tx, 1234);
    ctx.font = posterFont(31);
    ctx.fillText("年代:" + (s.era || "—") + (hall ? "   |   馆藏:" + hall.hall : ""), tx, 1290);

    ctx.fillStyle = cfg.ink;
    ctx.font = posterFont(38);
    posterWrap(ctx, m.trivia || s.intro || "", 640).slice(0, 4)
      .forEach((ln, i) => ctx.fillText(ln, tx, 1352 + i * 66));

    // 7) 打卡地点(底部小字;无确证馆藏信息的精灵省略)
    if (hall) {
      ctx.fillStyle = cfg.ink;
      ctx.font = posterFont(37, "bold");
      let txt = "打卡地点:" + hall.hall + " ｜ " + hall.city;
      if (ctx.measureText(txt).width > 690) ctx.font = posterFont(33, "bold");
      ctx.fillText(txt, tx, 1810);
    }

    // 8) 二维码(右下角)+ 说明
    posterDrawQr(ctx, codexUrl(), 774, 1548, 236);
    ctx.fillStyle = cfg.sub; ctx.font = posterFont(24);
    ctx.textAlign = "right";
    ctx.fillText("扫码继续探索燕赵文物精灵", POSTER_W - 78, 1846);
    ctx.textAlign = "left";
  });
}

/* ---------------- AI 赋彩页(Q 版黑白稿 · 点按填色 / 拖笔涂抹) ---------------- */
const DYE = {
  idx: 0, tok: 0, ready: false,
  color: null, gray: null, tmpCv: null, tmpCtx: null, tmpImg: null,
  data: null, mask: null, buf: null, visited: null, stack: null,
  cvW: 0, cvH: 0, cnt: 0, total: 0,
  brush: 24, done: false, autoTimer: null,
  painting: false, moved: false, lastX: 0, lastY: 0, downX: 0, downY: 0
};
function dyeSrc(i) { return "AI 赋彩/" + DYE_IMAGES[i].f; }
/* 图稿「内嵌数据」:AI 赋彩\_data\<文件名>.js 里存着同一张图的 data: 形式。
   双击 index.html(file://)打开时,浏览器不允许读本机图片的像素(画布会被判为"污染"),
   上色就会显示「这一幅没打开成功」;改用内嵌数据当图源即可绕开。生成/更新用 tools\gen_dye_embed.py。 */
const DYE_EMBED = { wait: {} };
function dyeResolveSrc(i, cb) {
  const f = DYE_IMAGES[i] && DYE_IMAGES[i].f;
  if (!f) { cb(null); return; }
  if (window.__DYE_DATA && window.__DYE_DATA[f]) { cb(window.__DYE_DATA[f]); return; }
  /* http(s) 下同源图片可以直接读像素,不需要内嵌数据,直接走原图,少一次 404 */
  if (/^https?:$/.test(location.protocol) && !document.documentElement.hasAttribute("data-dye-embed")) { cb(null); return; }
  if (DYE_EMBED.bad && DYE_EMBED.bad[f]) { cb(null); return; }
  if (DYE_EMBED.wait[f]) { DYE_EMBED.wait[f].push(cb); return; }
  DYE_EMBED.wait[f] = [cb];
  const fire = () => {
    const list = DYE_EMBED.wait[f];
    delete DYE_EMBED.wait[f];
    const v = (window.__DYE_DATA && window.__DYE_DATA[f]) || null;
    if (!v) { DYE_EMBED.bad = DYE_EMBED.bad || {}; DYE_EMBED.bad[f] = 1; }
    list.forEach(fn => fn(v));   // 没读到内嵌数据就退回原图路径(http 下照常可用)
  };
  const s = document.createElement("script");
  s.src = "AI 赋彩/_data/" + f + ".js";
  s.onload = fire;
  s.onerror = fire;
  document.head.appendChild(s);
}
function viewDye() {
  const n = DYE_IMAGES.length;
  const thumbs = DYE_IMAGES.map((m, i) => {
    const cw = m.c[2] - m.c[0], ch = m.c[3] - m.c[1];
    const s = Math.min(64 / cw, 84 / ch);
    const left = ((64 - cw * s) / 2 - m.c[0] * s).toFixed(1);
    const top = ((84 - ch * s) / 2 - m.c[1] * s).toFixed(1);
    return `<button type="button" class="dye-thumb" onclick="dyePick(${i})" title="第 ${i + 1} 幅">
      <img loading="lazy" src="AI 赋彩/${m.f}" alt="第 ${i + 1} 幅 Q 版文物黑白稿" style="width:${(m.w * s).toFixed(1)}px;height:${(m.h * s).toFixed(1)}px;left:${left}px;top:${top}px">
    </button>`;
  }).join("");
  return `
    <div class="page-head">
      <h2>🎨 AI赋彩</h2>
      <p>闭馆后的神秘画室:${n} 幅 Q 版文物都褪成了黑白稿。轻点填色、按住涂抹,亲手把颜色还给它们——完成度攒满,作品还能保存带回家。</p>
    </div>
    <div class="tea-howto">
      <b>🖌 怎么玩(三种手法 · 随你挑)</b>
      <ol>
        <li><b>点一下 · 填一块</b>:在黑白稿上轻点,一整片同色的区域就会染回它本来的颜色。</li>
        <li><b>按住拖 · 涂一笔</b>:像握画笔一样按住涂抹,笔到之处色彩慢慢浮出来;笔刷有 小 / 中 / 大 三档。</li>
        <li><b>偷看答案 / 交给 AI</b>:「👁 按住看原图」对照彩色、「✨ 一键赋彩」看它上满色完整的样子,满意就点「💾 保存作品」把彩色收进相册。</li>
      </ol>
      <p>上色只在本机浏览器里完成,不联网、不上传;图稿来自「AI 赋彩」画册,共 ${n} 幅,点下面的缩略图随便挑。</p>
    </div>
    <div class="dye-stage" id="dye-stage">
      <div class="dye-cv-wrap">
        <canvas id="dye-cv" oncontextmenu="return false"></canvas>
        <canvas id="dye-cv-peek"></canvas>
        <div class="dye-done-tip" id="dye-done">✨ 赋彩完成!可以「保存作品」啦</div>
      </div>
      <div class="dye-side">
        <div class="dye-prog"><i id="dye-bar"></i></div>
        <div class="dye-pct-line"><b id="dye-pct">0%</b><span id="dye-label">正在铺开画纸…</span></div>
        <div class="dye-tools">
          <button type="button" class="btn ghost" onpointerdown="dyePeek(true)" onpointerup="dyePeek(false)" onpointerleave="dyePeek(false)" onpointercancel="dyePeek(false)" oncontextmenu="return false">👁 按住看原图</button>
          <button type="button" class="btn gold" onclick="dyeAuto()">✨ 一键赋彩</button>
          <button type="button" class="btn ghost" onclick="dyeReset()">↺ 重新上色</button>
          <button type="button" class="btn" onclick="dyeSave()">💾 保存作品</button>
        </div>
        <div class="dye-tools">
          <span class="dye-brushset">笔刷
            <button type="button" data-b="14" onclick="dyeBrushSize(14)">小</button>
            <button type="button" data-b="24" class="cur" onclick="dyeBrushSize(24)">中</button>
            <button type="button" data-b="38" onclick="dyeBrushSize(38)">大</button>
          </span>
          <button type="button" class="btn ghost" onclick="dyeStep(-1)">← 上一幅</button>
          <button type="button" class="btn ghost" onclick="dyeStep(1)">下一幅 →</button>
          <button type="button" class="btn ghost" onclick="dyeRand()">🎲 随机一幅</button>
        </div>
      </div>
    </div>
    <div class="section-title">🗂 挑一幅来赋彩(共 ${n} 幅 · 点缩略图切换)</div>
    <div class="dye-strip">${thumbs}</div>
  `;
}
function dyeInit() {
  DYE.ready = false;
  const cv = document.getElementById("dye-cv");
  if (!cv) return;
  const stage = document.getElementById("dye-stage");
  if (stage) stage.classList.add("busy");
  dyeBind(cv);
  dyeLoad(DYE.idx);
}
function dyeLoad(i) {
  const n = DYE_IMAGES.length;
  DYE.idx = ((i % n) + n) % n;
  dyeStopAuto();
  DYE.ready = false;
  const stage = document.getElementById("dye-stage");
  if (stage) { stage.classList.add("busy"); stage.classList.remove("done"); }
  const tip = document.getElementById("dye-done");
  if (tip) tip.classList.remove("show");
  const lab = document.getElementById("dye-label");
  if (lab) lab.textContent = `正在铺第 ${DYE.idx + 1} / ${n} 幅画纸…`;
  const tok = DYE.tok = (DYE.tok || 0) + 1;
  const idx = DYE.idx;
  dyeResolveSrc(idx, uri => {
    if (tok !== DYE.tok) return;
    const img = new Image();
    img.onload = () => { if (tok !== DYE.tok) return; try { dyeBuild(img, DYE_IMAGES[idx]); } catch (err) { dyeFail(); } };
    img.onerror = () => { if (tok === DYE.tok) dyeFail(); };
    img.src = uri || dyeSrc(idx);
  });
}
function dyeFail() {
  const stage = document.getElementById("dye-stage");
  if (stage) stage.classList.remove("busy");
  const lab = document.getElementById("dye-label");
  if (lab) lab.textContent = "这一幅没打开成功,点「下一幅」换一幅试试~";
}
function dyeBuild(img, m) {
  /* 裁切框一律夹到图片实际范围内:图稿被替换/压缩过也不会画成半张空白 */
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const x0 = cl(m.c[0], 0, iw - 1), y0 = cl(m.c[1], 0, ih - 1);
  const x1 = cl(m.c[2], x0 + 1, iw), y1 = cl(m.c[3], y0 + 1, ih);
  const cw = x1 - x0, ch = y1 - y0;
  const s = Math.min(1, 880 / cw, 1360 / ch);
  const W = Math.max(2, Math.round(cw * s)), H = Math.max(2, Math.round(ch * s));
  const color = document.createElement("canvas");
  color.width = W; color.height = H;
  const cctx = color.getContext("2d");
  cctx.drawImage(img, x0, y0, cw, ch, 0, 0, W, H);
  const src = cctx.getImageData(0, 0, W, H).data;
  const gray = document.createElement("canvas");
  gray.width = W; gray.height = H;
  const gctx = gray.getContext("2d");
  const gimg = gctx.createImageData(W, H);
  const gd = gimg.data;
  for (let p = 0; p < src.length; p += 4) {
    const v = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) | 0;
    gd[p] = gd[p + 1] = gd[p + 2] = v;
    gd[p + 3] = 255;
  }
  gctx.putImageData(gimg, 0, 0);
  const vis = document.getElementById("dye-cv");
  const peek = document.getElementById("dye-cv-peek");
  if (!vis || !peek) return;
  vis.width = W; vis.height = H;
  peek.width = W; peek.height = H;
  vis.getContext("2d").drawImage(gray, 0, 0);
  peek.getContext("2d").drawImage(color, 0, 0);
  const tmpCv = document.createElement("canvas");
  tmpCv.width = W; tmpCv.height = H;
  DYE.tmpCv = tmpCv;
  DYE.tmpCtx = tmpCv.getContext("2d");
  DYE.tmpImg = gctx.createImageData(W, H);
  DYE.buf = DYE.tmpImg.data;
  DYE.color = color; DYE.gray = gray; DYE.data = src; DYE.vis = vis; DYE.peek = peek;
  DYE.mask = new Uint8Array(W * H);
  DYE.visited = new Uint8Array(W * H);
  DYE.stack = new Int32Array(W * H);
  DYE.cvW = W; DYE.cvH = H;
  DYE.cnt = 0; DYE.total = W * H; DYE.done = false; DYE.ready = true;
  DYE.painting = false; DYE.moved = false;
  const stage = document.getElementById("dye-stage");
  if (stage) stage.classList.remove("busy", "done");
  const tip = document.getElementById("dye-done");
  if (tip) tip.classList.remove("show");
  dyePeek(false);
  const lab = document.getElementById("dye-label");
  if (lab) lab.textContent = `第 ${DYE.idx + 1} / ${DYE_IMAGES.length} 幅 · 点按填色 · 按住拖笔`;
  dyeProgress();
  dyeThumbActive();
}
function dyePos(e, cv) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)];
}
function dyeBind(cv) {
  cv.addEventListener("pointerdown", e => {
    if (!DYE.ready) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    const p = dyePos(e, cv);
    DYE.painting = true; DYE.moved = false;
    DYE.downX = DYE.lastX = p[0]; DYE.downY = DYE.lastY = p[1];
  });
  cv.addEventListener("pointermove", e => {
    if (!DYE.painting || !DYE.ready) return;
    e.preventDefault();
    const p = dyePos(e, cv);
    if (!DYE.moved) {
      const dx = p[0] - DYE.downX, dy = p[1] - DYE.downY;
      if (dx * dx + dy * dy < 49) return;   // 7px 内仍按「点按」处理
      DYE.moved = true;
    }
    dyeStroke(DYE.lastX, DYE.lastY, p[0], p[1]);
    DYE.lastX = p[0]; DYE.lastY = p[1];
    dyeProgress();
  });
  const stop = () => {
    if (!DYE.painting) return;
    DYE.painting = false;
    if (!DYE.moved && DYE.ready) dyeFillAt(DYE.downX, DYE.downY);
  };
  cv.addEventListener("pointerup", stop);
  cv.addEventListener("pointercancel", () => { DYE.painting = false; });
}
function dyeStroke(x0, y0, x1, y1) {
  const r = DYE.brush;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    dyeBrush(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}
function dyeBrush(x, y, r0) {
  if (!DYE.ready) return;
  const W = DYE.cvW, H = DYE.cvH;
  const r = r0 || DYE.brush;
  if (x < -r * 2 || y < -r * 2 || x > W + r * 2 || y > H + r * 2) return;
  const ctx = DYE.vis.getContext("2d");
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(DYE.color, 0, 0);
  ctx.restore();
  const mask = DYE.mask;
  const xa = Math.max(0, Math.floor(x - r)), xb = Math.min(W - 1, Math.ceil(x + r));
  const ya = Math.max(0, Math.floor(y - r)), yb = Math.min(H - 1, Math.ceil(y + r));
  const rr = r * r;
  for (let yy = ya; yy <= yb; yy++) {
    const dy = yy - y;
    for (let xx = xa; xx <= xb; xx++) {
      const dx = xx - x;
      if (dx * dx + dy * dy > rr) continue;
      const i = yy * W + xx;
      if (!mask[i]) { mask[i] = 1; DYE.cnt++; }
    }
  }
}
function dyeFillAt(x, y) {
  if (!DYE.ready) return;
  const W = DYE.cvW, H = DYE.cvH;
  const px = Math.floor(x), py = Math.floor(y);
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const data = DYE.data, mask = DYE.mask;
  const i0 = py * W + px, k0 = i0 * 4;
  const r0 = data[k0], g0 = data[k0 + 1], b0 = data[k0 + 2];
  const TOL = 72;   // 颜色容差(相邻像素 RGB 差之和),越大越容易连成一片
  const visited = DYE.visited, stack = DYE.stack, buf = DYE.buf;
  visited.fill(0);
  buf.fill(0);
  let top = 0, newly = 0;
  const paint = i => {
    const k = i * 4;
    buf[k] = data[k]; buf[k + 1] = data[k + 1]; buf[k + 2] = data[k + 2]; buf[k + 3] = 255;
    if (!mask[i]) { mask[i] = 1; newly++; }
  };
  stack[top++] = i0;
  visited[i0] = 1;
  paint(i0);
  while (top > 0) {
    const i = stack[--top];
    const x2 = i % W, y2 = (i / W) | 0;
    for (let t = 0; t < 4; t++) {
      const j = t === 0 ? (x2 > 0 ? i - 1 : -1) : t === 1 ? (x2 < W - 1 ? i + 1 : -1) : t === 2 ? (y2 > 0 ? i - W : -1) : (y2 < H - 1 ? i + W : -1);
      if (j < 0 || visited[j]) continue;
      visited[j] = 1;
      const k = j * 4;
      if (Math.abs(data[k] - r0) + Math.abs(data[k + 1] - g0) + Math.abs(data[k + 2] - b0) <= TOL) {
        stack[top++] = j;
        paint(j);
      }
    }
  }
  if (newly) {
    DYE.tmpCtx.putImageData(DYE.tmpImg, 0, 0);
    DYE.vis.getContext("2d").drawImage(DYE.tmpCv, 0, 0);
    DYE.cnt += newly;
  }
  dyeProgress();
}
function dyeProgress() {
  const pct = DYE.total ? DYE.cnt / DYE.total : 0;
  const bar = document.getElementById("dye-bar");
  if (bar) bar.style.width = (pct * 100).toFixed(1) + "%";
  const t = document.getElementById("dye-pct");
  if (t) t.textContent = Math.floor(pct * 100) + "%";
  if (!DYE.done && pct >= 0.95) {
    DYE.done = true;
    const stage = document.getElementById("dye-stage");
    if (stage) stage.classList.add("done");
    const tip = document.getElementById("dye-done");
    if (tip) tip.classList.add("show");
  }
}
function dyePeek(on) {
  const stage = document.getElementById("dye-stage");
  if (!stage) return;
  if (!on || !DYE.ready) stage.classList.remove("peeking");
  else stage.classList.add("peeking");
}
function dyeBrushSize(b) {
  DYE.brush = b;
  document.querySelectorAll(".dye-brushset button").forEach(x => x.classList.toggle("cur", Number(x.dataset.b) === b));
}
function dyeReset() {
  if (!DYE.ready) return;
  dyeStopAuto();
  DYE.vis.getContext("2d").drawImage(DYE.gray, 0, 0);
  DYE.mask.fill(0);
  DYE.cnt = 0; DYE.done = false;
  const stage = document.getElementById("dye-stage");
  if (stage) stage.classList.remove("done");
  const tip = document.getElementById("dye-done");
  if (tip) tip.classList.remove("show");
  dyeProgress();
}
function dyeStopAuto() {
  if (DYE.autoTimer) { clearInterval(DYE.autoTimer); DYE.autoTimer = null; }
}
function dyeAuto() {
  if (!DYE.ready || DYE.autoTimer) return;
  let step = 0;
  DYE.autoTimer = setInterval(() => {
    if (!DYE.ready) { dyeStopAuto(); return; }
    step++;
    for (let k = 0; k < 6; k++) dyeBrush(Math.random() * DYE.cvW, Math.random() * DYE.cvH, 26 + Math.random() * 46);
    dyeProgress();
    if (step >= 46) {
      dyeStopAuto();
      DYE.vis.getContext("2d").drawImage(DYE.color, 0, 0);
      DYE.mask.fill(1);
      DYE.cnt = DYE.total;
      dyeProgress();
    }
  }, 40);
}
function dyeSave() {
  if (!DYE.ready) return;
  const a = document.createElement("a");
  a.href = DYE.vis.toDataURL("image/png");
  a.download = "文物精灵_AI赋彩_第" + (DYE.idx + 1) + "幅.webp";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function dyePick(i) {
  if (!DYE_IMAGES[i]) return;
  if (i === DYE.idx && DYE.ready) return;
  dyeLoad(i);
  const stage = document.getElementById("dye-stage");
  if (stage && stage.scrollIntoView) stage.scrollIntoView({ behavior: "smooth", block: "center" });
}
function dyeStep(d) { dyeLoad(DYE.idx + d); }
function dyeRand() {
  const n = DYE_IMAGES.length;
  if (n < 2) return;
  let i = DYE.idx;
  while (i === DYE.idx) i = Math.floor(Math.random() * n);
  dyeLoad(i);
}
function dyeThumbActive() {
  document.querySelectorAll(".dye-thumb").forEach((b, i) => b.classList.toggle("cur", i === DYE.idx));
}

/* ---------------- AI 文物识别页(照片复原对比 · 器型 / 纹样 / 年代 / 材质识别) ---------------- */
const IDENT = { ready: false, busy: false, wk: null, up: null, resultHTML: "", matches: [],
  cloud: "unknown", cloudInfo: null, cloudIMG: null, cloudBusy: false, cloudData: null, cloudErr: "",
  wakeBusy: false, wakeDone: "" };
/* 小桥地址:本机打开就是 127.0.0.1;别人连你 WiFi 用「局域网 IP」打开网页时,自动跟随换成同一 IP 的 8898 端口 */
const IDENT_CLOUD_API = (function () {
  try {
    const h = location.hostname;
    if (h && h !== "127.0.0.1" && h !== "localhost" && h !== "::1" && h !== "[::1]") return location.protocol + "//" + h + ":8898";
  } catch (e) {}
  return "http://127.0.0.1:8898";
})();
const IDENT_ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";   // 直连模式:没有小桥时,网页自己把照片交给云端 AI(换任意能上网的电脑都能用)
const IDENT_ARK_MODELS = ["doubao-seed-2-1-lite-260915", "doubao-seed-2-1-pro-260915", "doubao-seed-evolving", "doubao-seed-1-8-251228", "doubao-seed-1-8", "doubao-seed-2-1-lite", "doubao-seed-2-0-lite-260428", "doubao-seed-2-0-lite", "doubao-seed-2-0-pro-260428", "doubao-seed-2-0-flash-260428", "doubao-seed-2-0-260428", "doubao-seed-1-6-vision-250815", "doubao-seed-1-6-250615", "doubao-seed-1-6-flash-250615", "doubao-1-5-vision-pro-32k-250115", "doubao-1-5-vision-pro-250328", "doubao-1-5-vision-lite-32k-250315", "doubao-vision-pro-32k-241028", "doubao-1-5-thinking-vision-pro-250428"];
const IDENT_ARK_PROMPT = `你是「文物精灵」App 里的中国文物鉴定助手。请根据这张照片识别文物(只认中国文物),只输出一个 JSON 对象(不要代码块、不要多余文字):{"name":"名称(常见别名放括号里)","era":"年代(朝代+大致公元;拿不准用「约」)","material":"材质类别(如 青铜器 / 白瓷 / 玉器 / 石刻 / 书画 / 陶器)","origin":"出土或收藏出处(不确定写「待考」,不编造)","history":"来历与历史 90~160 字:它是什么、哪个朝代、为什么重要、有什么故事","feature":"一眼看点:教参观者该看什么(一句话)","confidence":"高/中/低"}。若照片里明显不是文物,name 写「未识别到文物」,并在 history 里说明看到了什么。`;
/* 智谱开放平台:免费模型三件套(识别 glm-4.6v-flash / 茶话会 glm-4.7-flash / 幻化 cogview-3-flash),
   钥匙形如 id.secret(一个点号);与火山方舟(ark- 开头)共用同一把钥匙位,按格式自动分流 */
const IDENT_ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const IDENT_ZHIPU_IMG = "https://open.bigmodel.cn/api/paas/v4/images/generations";
const IDENT_ZHIPU_VIS = ["glm-4.6v-flash", "glm-4v-flash"];   // 免费视觉:新的打头,挤爆时自动换下一个
const IDENT_ZHIPU_TXT = ["glm-4.7-flash", "glm-4-flash"];     // 免费文本:同上
function identKeyKind(k) {
  k = String(k || "").trim();
  if (/^ark-/.test(k)) return "ark";
  if ((k.match(/\./g) || []).length === 1) return "zhipu";
  return "ark";
}
const IDENT_FORMS = ["鼎", "尊", "簋", "壶", "罐", "瓶", "杯", "碗", "盘", "炉", "灯", "俑", "枕", "印", "玺", "佩", "璧", "砚", "钟", "磬", "狮", "塔", "楼", "桥", "像", "戈", "剑", "镜", "爵", "豆", "舟", "车"];
const IDENT_HUES = ["朱红", "橘金", "蜜黄", "草绿", "青绿", "碧翠", "天青", "靛蓝", "蓝紫", "紫棠", "绛紫", "朱殷"];
/* 各属性的补充参考色(铜锈 / 瓷白 / 绢底等),让"照片式"的颜色也能就近命中 */
const IDENT_HINT = {
  bronze: ["#6e8f6a", "#4a5d4e"], gold: ["#f2dfa0", "#c98f2e"], ceramic: ["#e9eef2", "#7fa8c9", "#f6ead2"],
  jade: ["#cfe4d4", "#8dbfa0"], stone: ["#cfd0ce", "#8f9296"], lacquer: ["#6d1a1f", "#b5432f"],
  textile: ["#d43a2e", "#e8b4c8"], wood: ["#c8a165", "#8a6a45"], painting: ["#e3d8bd", "#6b6f93"],
  glass: ["#cde9f5", "#8fc6de"], household: ["#c98f6a"], mingqi: ["#a89f92"],
  ritual: ["#8f74ad"], document: ["#d9cfb6", "#4a5a6a"], seal: ["#c2503a"],
  instrument: ["#c98a3a"], tool: ["#8a9a62"], religion: ["#e8c56a"], weapon: ["#6b7a8a"], currency: ["#d9b53a"]
};

function viewIdent() {
  return `
    <div class="page-head">
      <h2>🔍 AI 文物识别</h2>
      <p>对着一件中国文物拍照上传:先「修」——去划痕裂纹、补细碎缺口、恢复原色、超分放大,按住中间滑块对比修复前后;再「认」——把照片交给云端 AI,报出它的名字、年代、材质、出处与来历,同时给四项本机判断:器型 / 纹样 / 年代 / 材质。</p>
    </div>
    <div class="tea-howto">
      <b>🧭 怎么玩(拍一张 · 两件事)</b>
      <ol>
        <li><b>① 上传照片</b>:对准展柜里的中国文物拍一张,或从相册挑一张;修复全程在本机完成,云端识别开启时照片会提交给 AI 辨认(云端状态见下方)。</li>
        <li><b>② 看修复对比</b>:引擎依次去划痕裂纹 → 恢复原始色彩 → 补全细碎缺口 → 超分放大 2×;按住中间的滑块左右拖动,「修复前 / 修复后」一滑便知,满意就「💾 保存修复图」。</li>
        <li><b>③ 等 AI「认」它</b>:云端 AI 把<b>名字、年代、材质、出处与来历</b>送回页面最上方;随后是本机引擎的四项判断与站内相近展品(点开候选可直接看档案)。没联网时,自动用本机结果兜底。</li>
        <li><b>④ 唤醒成精灵</b>:云端认出的文物若对得上图鉴精灵,结果卡里直接亮出它的 <b>Q 版立绘</b>——点「⚡ 唤醒它」当场收进图鉴;没对上的,可以拿这张照片一键走「📷 打卡拍照」幻化成私人文物精灵。</li>
      </ol>
      <p>修复由本机引擎完成;识别优先走云端 AI,网络不稳时会自动退回本机引擎。识别为参考,参观时请以馆内展签为准。</p>
      <p id="ident-cloud-state" class="ident-cloud-state">☁️ 云端识别:检测中…</p>
    </div>
    <label class="photo-drop ident-drop" id="ident-drop">
      <input type="file" accept="image/*" style="display:none" onchange="identPick(this)">
      <div>📷 点这里拍照 / 选择文物照片</div>
      <div class="muted" style="margin-top:6px">(手机可直接调起相机;修复在本机完成,云端识别开启时照片会提交给 AI 辨认)</div>
    </label>
    <div class="ident-stage" id="ident-stage" hidden>
      <div class="ident-grid">
        <div class="ident-slider busy" id="ident-slider">
          <canvas id="ident-cv-a"></canvas>
          <canvas id="ident-cv-b"></canvas>
          <span class="ident-tag tag-a">修复前</span>
          <span class="ident-tag tag-b">修复后</span>
          <i class="ident-div" id="ident-div"></i>
          <span class="ident-knob" id="ident-knob">⇄</span>
        </div>
        <aside class="ident-side">
          <div class="ident-steps" id="ident-steps">
            <div class="ist" data-k="0"><i></i>去划痕 · 补裂纹</div>
            <div class="ist" data-k="1"><i></i>恢复原始色彩</div>
            <div class="ist" data-k="2"><i></i>补全细碎缺口</div>
            <div class="ist" data-k="3"><i></i>超分放大 2×</div>
          </div>
          <div class="ident-tools">
            <button type="button" class="btn gold" onclick="identSave()">💾 保存修复图</button>
            <button type="button" class="btn ghost" onclick="identReset()">🔄 换一张照片</button>
          </div>
          <div class="ident-note">✦ 修复在本机引擎完成;「认」优先走云端 AI(智谱 GLM-4V · 免费,火山方舟可选),未连接时退回本机识别引擎。</div>
        </aside>
      </div>
      <div class="ident-result" id="ident-result"></div>
    </div>
  `;
}
function identInit() {
  identBindSlider();
  if (IDENT.ready && IDENT.wk) identShow(IDENT.resultHTML);
  identCloudPing();   // 探测本机小桥,更新页面上的云端状态提示
}
function identPick(input) {
  const file = input.files && input.files[0];
  if (file) {
    if (!/^image\//.test(file.type || "")) { alert("请选择图片文件"); input.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => identFlow(reader.result);
    reader.readAsDataURL(file);
  }
  input.value = "";
}
async function identFlow(dataURL) {
  if (IDENT.busy) return;
  IDENT.busy = true; IDENT.ready = false;
  IDENT.wakeBusy = false; IDENT.wakeDone = "";
  const drop = $("#ident-drop"), stage = $("#ident-stage");
  if (drop) drop.hidden = true;
  if (stage) stage.hidden = false;
  const sl = $("#ident-slider");
  if (sl) { sl.classList.add("busy"); sl.style.aspectRatio = "4 / 3"; }
  identSteps(-1);
  const res = $("#ident-result");
  if (res) res.innerHTML = `<div class="ident-wait"><span class="spin"></span>正在读取照片…</div>`;
  let im = null;
  try { im = await loadImgUrl(dataURL); } catch (e) {}
  if (!im) { alert("照片读取失败了,换一张再试试~"); IDENT.busy = false; identReset(); return; }
  /* 云端识别用图:未修复原图缩到最长边 1024 的 JPEG(只发给本机小桥) */
  const cs2 = Math.min(1, 1024 / Math.max(im.width, im.height));
  const cv2 = document.createElement("canvas");
  cv2.width = Math.max(2, Math.round(im.width * cs2));
  cv2.height = Math.max(2, Math.round(im.height * cs2));
  cv2.getContext("2d").drawImage(im, 0, 0, cv2.width, cv2.height);
  try { IDENT.cloudIMG = cv2.toDataURL("image/jpeg", .84); } catch (e) { IDENT.cloudIMG = null; }
  /* 工作画布:最长边不超过 900,处理完再超分 2× */
  const S = 900, sc = Math.min(1, S / Math.max(im.width, im.height));
  const w0 = Math.max(2, Math.round(im.width * sc)), h0 = Math.max(2, Math.round(im.height * sc));
  const wk = document.createElement("canvas"); wk.width = w0; wk.height = h0;
  const wc = wk.getContext("2d");
  wc.drawImage(im, 0, 0, w0, h0);
  const im0 = wc.getImageData(0, 0, w0, h0);
  const orig = new Uint8ClampedArray(im0.data);   // 识别用原图数据(修复前)
  if (res) res.innerHTML = `<div class="ident-wait"><span class="spin"></span>AI 正在扫描与识别…</div>`;
  await sleepMs(260);
  identSteps(0, "on");
  identHeal(im0.data, w0, h0, 62);   // ① 去划痕 / 裂纹:与邻域差异过大的像元,用邻域均值修补
  wc.putImageData(im0, 0, 0);
  await sleepMs(320); identSteps(0, "ok"); identSteps(1, "on");
  identRecolor(im0.data, w0, h0);    // ② 灰世界白平衡 + 按褪色程度回升饱和度 + 轻对比
  wc.putImageData(im0, 0, 0);
  await sleepMs(320); identSteps(1, "ok"); identSteps(2, "on");
  identHeal(im0.data, w0, h0, 88);   // ③ 补全细碎缺口:再扫一遍更重的缺损像元
  wc.putImageData(im0, 0, 0);
  await sleepMs(320); identSteps(2, "ok"); identSteps(3, "on");
  const up = document.createElement("canvas");   // ④ 超分放大 2×(双线性 + 轻锐化对比)
  up.width = Math.min(2400, w0 * 2); up.height = Math.min(2400, h0 * 2);
  const uc = up.getContext("2d");
  uc.imageSmoothingEnabled = true; uc.imageSmoothingQuality = "high";
  try { uc.filter = "contrast(1.08) saturate(1.06)"; } catch (e) {}
  uc.drawImage(wk, 0, 0, up.width, up.height);
  try { uc.filter = "none"; } catch (e) {}
  await sleepMs(340); identSteps(3, "ok");
  /* —— 识别:色相分布 + 轮廓比例 + 纹理密度 → 材质 / 器型 / 纹样 / 年代 —— */
  const feats = identFeats(orig, w0, h0);
  const pRank = identRank(feats, "primary");
  const sRank = identRank(feats, "secondary");
  const matches = identMatchSpirits(feats);
  const form = identForm(feats, matches);
  const pat = identPattern(feats.edge);
  const html = identResultHTML(feats, pRank, sRank, matches, form, pat);
  IDENT.wk = wk; IDENT.up = up; IDENT.matches = matches;
  IDENT.ready = true; IDENT.busy = false;
  identShow(html);
  identCloudStart();   // 云端识别:把原照片提交给小桥辨认(未连接就退回本机结果)
}
function identShow(html) {
  const a = $("#ident-cv-a"), b = $("#ident-cv-b"), sl = $("#ident-slider"), res = $("#ident-result");
  if (!a || !b || !IDENT.wk || !IDENT.up) return;
  a.width = IDENT.wk.width; a.height = IDENT.wk.height;
  a.getContext("2d").drawImage(IDENT.wk, 0, 0);
  b.width = IDENT.up.width; b.height = IDENT.up.height;
  b.getContext("2d").drawImage(IDENT.up, 0, 0);
  if (sl) { sl.classList.remove("busy"); sl.style.aspectRatio = IDENT.wk.width + " / " + IDENT.wk.height; }
  identSetPos(50);
  if (res && html) {
    res.innerHTML = `<div class="ident-cloud" id="ident-cloud-slot">${identCloudSlotHTML()}</div><div id="ident-local-block"${IDENT.cloudData ? ' class="ident-local-dim"' : ""}>${html}</div>`;
    IDENT.resultHTML = html;
  }
  identStepsDone();
  const drop = $("#ident-drop"); if (drop) drop.hidden = true;
  const stage = $("#ident-stage"); if (stage) stage.hidden = false;
}
function identSetPos(p) {
  p = Math.max(4, Math.min(96, p));
  const b = $("#ident-cv-b"), d = $("#ident-div"), k = $("#ident-knob");
  if (b) b.style.clipPath = "inset(0 0 0 " + p + "%)";
  if (d) d.style.left = p + "%";
  if (k) k.style.left = p + "%";
}
function identBindSlider() {
  const s = $("#ident-slider");
  if (!s || s.dataset.bound) return;
  s.dataset.bound = "1";
  const at = x => { const r = s.getBoundingClientRect(); if (r.width) identSetPos((x - r.left) / r.width * 100); };
  s.addEventListener("pointerdown", e => { try { s.setPointerCapture(e.pointerId); } catch (err) {} s.dataset.drag = "1"; at(e.clientX); });
  s.addEventListener("pointermove", e => { if (s.dataset.drag) at(e.clientX); });
  const off = () => { delete s.dataset.drag; };
  s.addEventListener("pointerup", off);
  s.addEventListener("pointercancel", off);
}
function identSteps(k, cls) {
  const box = $("#ident-steps"); if (!box) return;
  const nodes = $$(".ist", box);
  if (k === -1) { nodes.forEach(n => { n.className = "ist"; const i = n.querySelector("i"); if (i) i.textContent = ""; }); return; }
  const n = nodes[k]; if (!n) return;
  const i = n.querySelector("i");
  if (cls === "ok") { n.classList.remove("on"); n.classList.add("ok"); if (i) i.textContent = "✓"; }
  else { n.classList.add("on"); if (i) i.textContent = ""; }
}
function identStepsDone() {
  const box = $("#ident-steps"); if (!box) return;
  $$(".ist", box).forEach(n => { n.classList.remove("on"); n.classList.add("ok"); const i = n.querySelector("i"); if (i) i.textContent = "✓"; });
}
function identReset() {
  IDENT.ready = false; IDENT.wk = null; IDENT.up = null; IDENT.resultHTML = "";
  IDENT.cloudIMG = null; IDENT.cloudData = null; IDENT.cloudErr = ""; IDENT.cloudBusy = false;
  const stage = $("#ident-stage"); if (stage) stage.hidden = true;
  const drop = $("#ident-drop"); if (drop) drop.hidden = false;
}
/* ---------------- 云端识别(本机小桥 → 智谱 GLM-4V · 免费;火山方舟可选) ---------------- */
function identFetchCloud(url, body, ms, authKey) {
  return new Promise((resolve, reject) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const opt = { signal: ctl.signal, method: body ? "POST" : "GET" };
    if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(body); }
    if (authKey) opt.headers = Object.assign({}, opt.headers || {}, { "Authorization": "Bearer " + authKey });
    fetch(url, opt).then(r => r.json()).then(j => { clearTimeout(t); resolve(j); }).catch(e => { clearTimeout(t); reject(e); });
  });
}
/* 智谱对话请求(直连):默认带上「关掉思维链」(出正文快、不会把分析当答复);
   个别模型不认这个开关时,自动去掉字段再试一次 */
async function identZhipuChat(body, ms, key) {
  const j1 = await identFetchCloud(IDENT_ZHIPU_URL, Object.assign({}, body, { thinking: { type: "disabled" } }), ms, key);
  if (j1 && j1.error && /thinking/i.test(String(j1.error.message || j1.error.code || ""))) {
    return await identFetchCloud(IDENT_ZHIPU_URL, body, ms, key);
  }
  return j1;
}
/* ---- 直连模式:没有本机小桥时,网页自己把照片交给云端 AI(钥匙:js/ident-direct.js,或本机粘贴一次记住;智谱免费 / 方舟都行) ---- */
const IDENT_ARK_KEY_ITEM = "wj_ident_ark_key";
let IDENT_DIRECT_CACHE = "";
function identDirectKey() {
  if (IDENT_DIRECT_CACHE) return IDENT_DIRECT_CACHE;
  let k = "";
  try {
    k = (typeof window.__IDENT_DIRECT_KEY === "string" && window.__IDENT_DIRECT_KEY) || localStorage.getItem(IDENT_ARK_KEY_ITEM) || "";
  } catch (e) { k = (typeof window.__IDENT_DIRECT_KEY === "string" && window.__IDENT_DIRECT_KEY) || ""; }
  IDENT_DIRECT_CACHE = String(k).trim();
  return IDENT_DIRECT_CACHE;
}
function identDirectSave() {
  const k = window.prompt("把「AI 钥匙」整条粘贴到这里(智谱 id.secret 或 火山方舟 ark- 开头都行;只保存在这台电脑的浏览器里,点「确定」后自动重试):", "");
  if (k === null) return;
  const kk = k.trim();
  if (kk.length < 16) { alert("看起来不完整:请把整条 Key 一次性粘进来(智谱约 45 字符,方舟 100 多个字符)。"); return; }
  try { localStorage.setItem(IDENT_ARK_KEY_ITEM, kk); } catch (e) {}
  IDENT_DIRECT_CACHE = kk;
  try { aiImagineOff = false; } catch (e) {}
  IDENT.cloudErr = ""; IDENT.cloudData = null;
  IDENT.keyPushed = false;
  identKeyPush(kk).then(() => identCloudRetry());   /* 顺手推给小桥(开着桥就全通;没开桥也不碍事) */
}
function identArkModels() {
  let m = "";
  try { m = String(window.__IDENT_DIRECT_MODEL || "").trim(); } catch (e) {}
  return m ? [m].concat(IDENT_ARK_MODELS) : IDENT_ARK_MODELS;
}
async function identDirectRun(image) {
  const key = identDirectKey();
  if (!key) throw new Error("还没有钥匙:点「🔑 粘贴密钥」把 AI 钥匙粘一次即可(智谱 或 火山方舟)。");
  if (identKeyKind(key) === "zhipu") return await identDirectRunZhipu(image, key);
  let lastErr = "";
  for (const model of identArkModels()) {
    const body = {
      model: model,
      messages: [{ role: "user", content: [
        { type: "text", text: IDENT_ARK_PROMPT },
        { type: "image_url", image_url: { url: image } }
      ] }],
      temperature: 0.2,
      max_tokens: 1600
    };
    let j;
    try { j = await identFetchCloud(IDENT_ARK_URL, body, 70000, key); }
    catch (e) { throw new Error("直连没连上(网络不通,或浏览器被云端安全策略拦住)。最稳:双击 tools/start_ident_cloud.bat 开小桥,网页会自动改走小桥。"); }
    if (j && j.error) {
      const msg = String((j.error.code || "") + " " + (j.error.message || "")).trim();
      lastErr = msg;
      if (/InvalidEndpointOrModel|NotFound|does not exist|do not have access/i.test(msg)) continue;   // 这个模型没开通:换下一个
      if (/Authentication|api.?key|format/i.test(msg)) throw new Error("钥匙没被接受:" + msg + "(点「🔑 重新粘贴密钥」再粘一次完整 Key)");
      throw new Error("云端接口报错:" + msg);
    }
    const md = j && j.choices && j.choices[0] ? j.choices[0].message : null;
    let text = md ? (md.content || md.reasoning_content || "") : "";
    if (Array.isArray(text)) text = text.map(p => (p && p.text) || "").join("");
    const m = String(text || "").match(/\{[\s\S]*\}/);
    if (!m) throw new Error("云端返回了结果但读不出来:" + String(text).slice(0, 80));
    return JSON.parse(m[0]);
  }
  throw new Error("账号里还没有开通视觉模型 —— 打开 console.volcengine.com/ark →「开通管理」,开通任一豆包视觉模型(有免费额度),开通后直接点重试即可。(" + lastErr.slice(0, 120) + ")");
}
/* 智谱直连(免费):glm-4.6v-flash → glm-4v-flash 逐个尝试 */
async function identDirectRunZhipu(image, key) {
  let lastErr = "";
  for (const model of IDENT_ZHIPU_VIS) {
    const body = {
      model: model,
      messages: [{ role: "user", content: [
        { type: "text", text: IDENT_ARK_PROMPT },
        { type: "image_url", image_url: { url: image } }
      ] }],
      temperature: 0.2,
      max_tokens: 1000   // 智谱免费款上限 1024
    };
    let j;
    try { j = await identZhipuChat(body, 70000, key); }
    catch (e) { throw new Error("直连没连上(网络不通,或浏览器被云端安全策略拦住)。最稳:双击 tools/start_ident_cloud.bat 开小桥,网页会自动改走小桥。"); }
    if (j && j.error) {
      const msg = String((j.error.code || "") + " " + (j.error.message || "")).trim();
      lastErr = msg;
      if (/429|400|1210|1305|1220|访问量|无权|参数非法/i.test(msg)) continue;   // 免费模型挤爆 / 参数兼容差异:换下一个
      if (/401|1000|1001|1002|api.?key|token|验证/i.test(msg)) throw new Error("钥匙没被接受:" + msg + "(点「🔑 重新粘贴密钥」再粘一次完整 Key)");
      throw new Error("云端接口报错:" + msg);
    }
    const md = j && j.choices && j.choices[0] ? j.choices[0].message : null;
    let text = md ? (md.content || md.reasoning_content || "") : "";
    if (Array.isArray(text)) text = text.map(p => (p && p.text) || "").join("");
    const m = String(text || "").match(/\{[\s\S]*\}/);
    if (!m) throw new Error("云端返回了结果但读不出来:" + String(text).slice(0, 80));
    return JSON.parse(m[0]);
  }
  throw new Error("智谱免费视觉模型暂时没调通(高峰限流):过几秒点「再试一次」即可;也可以先用下方本机结果。(" + lastErr.slice(0, 100) + ")");
}
async function identKeyPush(kk, model) {   /* 把手头这把钥匙推给小桥(只存内存,不进文件):粘贴一次,小桥 / 直连都好用 */
  try { await identFetchCloud(IDENT_CLOUD_API + "/api/setkey", { key: kk, model: (model || window.__IDENT_DIRECT_MODEL || "") }, 3000); } catch (e) {}
}
async function identCloudPing() {
  /* 弱网下第一次探测常常超时：再补一次，别让用户以为「没配好」 */
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await identFetchCloud(IDENT_CLOUD_API + "/api/ping", null, 4000);
      IDENT.cloud = r && r.ok ? "on" : "off";
      IDENT.cloudInfo = r && r.ok ? r : null;
      if (IDENT.cloud === "on") break;
    } catch (e) { IDENT.cloud = "off"; IDENT.cloudInfo = null; }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 500));
  }
  /* 小桥在、但没配钥匙:把本机存过的钥匙(粘贴过)顺手推给桥,当场生效 */
  if (IDENT.cloud === "on" && IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false && identDirectKey() && !IDENT.keyPushed) {
    IDENT.keyPushed = true;
    try {
      const j = await identFetchCloud(IDENT_CLOUD_API + "/api/setkey", { key: identDirectKey(), model: (window.__IDENT_DIRECT_MODEL || "") }, 3000);
      if (j && j.ok) {
        const r2 = await identFetchCloud(IDENT_CLOUD_API + "/api/ping", null, 2600);
        if (r2 && r2.ok) IDENT.cloudInfo = r2;
      }
    } catch (e) {}
  }
  identCloudChip();
  return IDENT.cloud;
}
function identCloudChip() {
  const el = $("#ident-cloud-state");
  if (!el) return;
  if (IDENT.cloud === "on") {
    const hasKey = IDENT.cloudInfo && IDENT.cloudInfo.hasKey;
    el.className = "ident-cloud-state on";
    el.textContent = hasKey ? "☁️ 云端识别:已就绪(" + (IDENT.cloudInfo.model || "豆包视觉") + ")" : "☁️ 云端识别:小桥已连接,还差密钥(点「🔑 粘贴密钥」会同步给小桥;或写进 tools/ident_key.txt)";
  } else if (identDirectKey()) {
    el.className = "ident-cloud-state on";
    el.textContent = "☁️ 云端识别:直连模式(" + (identKeyKind(identDirectKey()) === "zhipu" ? "智谱免费" : "火山方舟") + ")· 上传照片即可辨认";
  } else if (IDENT.cloud === "unknown") {
    el.className = "ident-cloud-state";
    el.textContent = "☁️ 云端识别:正在连接云端…(一两秒就好)";
  } else {
    el.className = "ident-cloud-state off";
    el.innerHTML = "☁️ 云端识别:这次没连上 —— <button type=\"button\" class=\"btn ghost\" onclick=\"identCloudRetry()\">🔄 重试</button>";
  }
}
function identCloudMode() {   // bridge=本机小桥 / direct=网页直连 / nokey=小桥在但缺密钥 / off=都没配好
  if (IDENT.cloud === "on" && !(IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false)) return "bridge";
  if (identDirectKey()) return "direct";
  return IDENT.cloud === "on" ? "nokey" : "off";
}
/* ---------------- 接入 AI 大模型(设置面板:服务商 / Base URL / 钥匙 / 模型 ID;存本机,钥匙随手同步小桥) ---------------- */
const AI_CFG_ITEM = "wj_ai_cfg_v1";
const AI_CFG_ACCOUNT = "2502887269@qq.com";   /* 默认账号:只作本机备注,用于区分配置(不保存密码) */
const AI_CFG_PROVIDERS = [
  { id: "zhipu",  name: "智谱(OpenAI 兼容)",  base: "https://open.bigmodel.cn/api/paas/v4",     model: "glm-4-flash" },
  { id: "ark",    name: "火山方舟(豆包)",     base: "https://ark.cn-beijing.volces.com/api/v3", model: "" },
  { id: "custom", name: "自定义 OpenAI 兼容", base: "",                                          model: "" }
];
function aiCfgEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function aiCfgDefaults() {
  const d = AI_CFG_PROVIDERS[0];
  const me = authWho();
  return { account: (me && me.email) || AI_CFG_ACCOUNT, provider: d.id, base: d.base, model: d.model };
}
function aiCfgGet() {   /* 面板配置(钥匙沿用「粘贴密钥」存的那一份,不另存) */
  let o = {};
  try { o = JSON.parse(localStorage.getItem(AI_CFG_ITEM) || "{}") || {}; } catch (e) { o = {}; }
  const cfg = Object.assign(aiCfgDefaults(), o);
  cfg.key = identDirectKey();
  return cfg;
}
function aiCfgStore(cfg) {
  try { localStorage.setItem(AI_CFG_ITEM, JSON.stringify({ account: cfg.account, provider: cfg.provider, base: cfg.base, model: cfg.model })); } catch (e) {}
}
function aiCfgProviderOf(id) { return AI_CFG_PROVIDERS.find(p => p.id === id) || AI_CFG_PROVIDERS[0]; }
function aiCfgStateHTML() {
  const key = identDirectKey();
  const kind = !key ? "" : (identKeyKind(key) === "zhipu" ? "智谱" : "火山方舟");
  const bridge = IDENT.cloud === "on"
    ? ((IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false) ? "已连接(还差钥匙,保存后自动同步)" : "已连接,钥匙在手(" + aiCfgEsc((IDENT.cloudInfo && IDENT.cloudInfo.model) || "自动挑模型") + ")")
    : "未连接(本机跑 tools/ident_cloud.py 最稳;不跑也能用直连,但可能被云端跨域策略拦住)";
  return "<b>当前状态</b> · 小桥:" + bridge + " · 本机钥匙:" + (key ? "已保存(" + kind + ")" : "未填");
}
function aiCfgOpen() {
  $$(".nav-dd.open").forEach(n => n.classList.remove("open"));
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>☁️ 云端大模型</h3>
    <p class="aicfg-tip">本站已经统一接好云端大模型,「云端识别 / AI 精灵茶话会 / AI 幻化 / 小答答疑」开箱即用。<b>不用填任何 API Key,也不用开小桥。</b>密钥全在站长侧,访客拿不到,也不需要知道。</p>
    <div class="aicfg-state" id="aicfg-state">正在检测云端……</div>
    <div class="aicfg-btns">
      <button type="button" class="btn" onclick="closeOverlay()">✔ 好了,关闭</button>
      <button type="button" class="btn ghost" onclick="aiCfgTest()">⚡ 重新测试</button>
    </div>
    <p class="aicfg-foot">登录后即可使用全部 AI。有什么不对,先点「重新测试」看一眼云端状态。</p>
  `);
  aiCfgTest();
  return false;
}
function aiCfgProviderPick() {
  const id = $("#aicfg-provider") ? String($("#aicfg-provider").value || "zhipu") : "zhipu";
  const p = aiCfgProviderOf(id), b = $("#aicfg-base"), m = $("#aicfg-model");
  if (b && (!b.value || AI_CFG_PROVIDERS.some(x => x.base && x.base === b.value))) b.value = p.base;
  if (m && (!m.value || AI_CFG_PROVIDERS.some(x => x.model && x.model === m.value))) m.value = p.model;
}
function aiCfgReadUI() {
  const st = $("#aicfg-state");
  const g = s => { const el = $(s); return el ? String(el.value || "").trim() : ""; };
  const cfg = { account: g("#aicfg-account") || AI_CFG_ACCOUNT, provider: g("#aicfg-provider") || "zhipu", base: g("#aicfg-base"), key: g("#aicfg-key"), model: g("#aicfg-model") };
  if (cfg.key && cfg.key.length < 16) { if (st) st.textContent = "钥匙看起来不完整:请把整条 Key 一次性粘进来(智谱约 45 字符,方舟 100 多个字符)。"; return null; }
  if (cfg.provider === "custom" && !cfg.base) { if (st) st.textContent = "自定义服务商需要填 API Base URL(形如 https://…/v1)。"; return null; }
  return cfg;
}
/* 已经没有需要保存的配置了:云端地址和密钥都在服务端,这里只负责关掉面板 */
function aiCfgApply() { closeOverlay(); return false; }
async function aiCfgTest() {
  /* 只做一件事:告诉用户云端现在行不行。没有需要填的东西。 */
  const st = $("#aicfg-state");
  if (st) st.textContent = "正在检测云端……";
  let ping = null;
  try { ping = await identFetchCloud(IDENT_CLOUD_API + "/api/ping", null, 6000); } catch (e) {}
  if (!ping || !ping.ok) {
    if (st) st.innerHTML = "⚠ 云端暂时没连上。先确认网络(手机流量也试一下),再点「重新测试」。";
    return false;
  }
  const m0 = (ping.model || ping.provider || "云端大模型");
  if (st) st.innerHTML = "✅ 云端在线 · <b>" + aiCfgEsc(m0) + "</b><br>正在试一句对话……";
  try {
    const r = await identFetchCloud(IDENT_CLOUD_API + "/api/chat", { messages: [{ role: "user", content: "你好,请用一句话介绍你自己" }], temperature: 0.6 }, 30000);
    if (r && r.ok && String(r.text || "").trim()) {
      if (st) st.innerHTML = "✅ 云端在线 · <b>" + aiCfgEsc(r.model || m0) + "</b><br>测试回复:「" + aiCfgEsc(String(r.text).slice(0, 90)) + "」";
      return false;
    }
    if (st) st.innerHTML = "✅ 云端在线 · <b>" + aiCfgEsc(m0) + "</b><br>这次没答上来:" + aiCfgEsc(String((r && r.error) || "稍后重试即可").slice(0, 100));
  } catch (e) {
    if (st) st.innerHTML = "✅ 云端在线 · <b>" + aiCfgEsc(m0) + "</b><br>对话测试超时:" + aiCfgEsc(e.message);
  }
  return false;
}
function aiCfgClear() {
  try { localStorage.removeItem(AI_CFG_ITEM); localStorage.removeItem(IDENT_ARK_KEY_ITEM); } catch (e) {}
  IDENT_DIRECT_CACHE = ""; IDENT.keyPushed = false;
  const st = $("#aicfg-state");
  if (st) st.innerHTML = "已清除本机保存的配置与小桥钥匙缓存(小桥内存里的钥匙重启后即忘)。<br>" + aiCfgStateHTML();
  identCloudChip();
  return false;
}
/* ---------------- 登录 / 注册(形式对齐参考站:顶栏入口 + 邮箱密码;登录后 AI 直接用本站配置的钥匙) ---------------- */
const AUTH_KEY = "wj_auth_v1";
const AUTH_LAST = "wj_auth_last";
/* 站点内置账号（演示用；代码里只有加盐哈希，不保存明文口令）
   默认账号见 .env.example 的 DEMO_EMAIL，口令由部署方自行设定（修改下方 hashes 即可），
   兼容旧口令与少一位的邮箱写法。切勿把明文口令写进源码或提交到仓库。 */
const AUTH_DEMOS = [
  { email: "2502887269@qq.com", salt: "wwjl", hashes: ["b6f0ed74", "cf143c42"] },
  { email: "2502887259@qq.com", salt: "wwjl", hashes: ["b6f0ed74", "cf143c42"] }
];
const AUTH_DEMO = AUTH_DEMOS[0];
let AUTH = { mode: "login", busy: false };
function authHash(pwd, salt) {   /* 本机演示用的轻量加盐哈希(非加密用途;小桥侧账号用 PBKDF2 校验) */
  let h = 0x811c9dc5 >>> 0;
  const s = String(salt || "") + "|" + String(pwd || "");
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}
function authWho() {
  try { const s = JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); return s && s.email ? s : null; } catch (e) { return null; }
}
function authSave(email, mode, token) {
  const s = { email: String(email || "").toLowerCase(), mode: mode || "bridge", token: token || "", ts: Date.now() };
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); localStorage.setItem(AUTH_LAST, s.email); } catch (e) {}
  /* 登录完成就立刻把云端通路捂热：探测一次 + 预取模型清单，
     状态条马上变「已就绪」，用户输入完账号密码就能直接点 AI 功能。 */
  setTimeout(function () {
    try { if (typeof identCloudPing === "function") identCloudPing(); } catch (e) {}
    try { if (window.wjCloudWarm) window.wjCloudWarm(); } catch (e) {}
    try {
      if (window.wjToast) window.wjToast("✅ 已登录，云端 AI 已就绪 —— 点「AI 工坊」里任一功能即可直接使用", 4200);
    } catch (e) {}
  }, 80);
  return s;
}
function authPaint() {
  const b = $("#authBtn");
  if (!b) return;
  const s = authWho();
  b.innerHTML = s ? "👤 " + aiCfgEsc(String(s.email).split("@")[0]) : "👤 登录 / 注册";
  b.classList.toggle("on", !!s);
  b.title = s ? "已登录:" + s.email + "(点开看账号 / 退出)" : "登录 / 注册:登录后直接用本站 AI(识别 / 茶话会 / 幻化),不用自己配钥匙";
}
function authOpen() {
  $$(".nav-dd.open").forEach(n => n.classList.remove("open"));
  AUTH.mode = "login"; AUTH.busy = false;
  authPaintOverlay();
  return false;
}
function authPaintOverlay() {
  const s = authWho();
  if (s) {   /* 已登录:账号卡 */
    const kind = (s.mode === "bridge" || s.mode === "cloud") ? "云端账号" : "本机演示登录";
    overlay(`
      <button class="close" onclick="closeOverlay()">✕</button>
      <h3>👤 我的账号</h3>
      <p class="aicfg-tip">已登录:<b>${aiCfgEsc(s.email)}</b>(${kind})。本站在线 AI ——「云端识别 / 茶话会 / AI 幻化 / 小答答疑」由站长配置的 API 直供,登录后直接可用,不需要自己申请钥匙。</p>
      <div class="aicfg-btns">
        <button type="button" class="btn" onclick="aiCfgOpen()">☁️ 云端 AI</button>
        <button type="button" class="btn ghost" onclick="authLogout()">↩ 退出登录</button>
      </div>
      <p class="aicfg-foot">捕捉进度与拍照唤醒的文物存在这台设备的浏览器里,和账号无关,换设备不会同步。</p>
    `);
    return;
  }
  const last = (function () { try { return localStorage.getItem(AUTH_LAST) || ""; } catch (e) { return ""; } })();
  const reg = AUTH.mode === "reg";
  overlay(`
    <button class="close" onclick="closeOverlay()" aria-label="关闭">✕</button>
    <div class="auth-figure">
      <img src="装饰/登录合照.webp" alt="文物精灵合影" draggable="false">
    </div>
    <div class="auth-panel">
      <h3>${reg ? "注册账号" : "账号登录"}</h3>
      <p class="auth-sub">登录后即可使用本站的在线 AI：识别、茶话会、幻化、小答，由站长配置的接口直供。</p>
      <div class="auth-tabs">
        <button type="button" class="${reg ? "" : "on"}" onclick="authTab('login')">登录</button>
        <button type="button" class="${reg ? "on" : ""}" onclick="authTab('reg')">注册</button>
      </div>
      <div class="aicfg-form">
        <label class="aicfg-row"><span>邮箱</span>
          <input id="auth-email" type="text" value="${aiCfgEsc(last)}" placeholder="you@example.com">
        </label>
        <label class="aicfg-row"><span>密码</span>
          <input id="auth-pwd" type="password" placeholder="${reg ? "至少 8 位" : "输入密码"}">
        </label>
        ${reg ? `<label class="aicfg-row"><span>确认密码</span><input id="auth-pwd2" type="password" placeholder="再输一次"></label>` : ""}
      </div>
      <button type="button" class="auth-submit" onclick="authSubmit()">${reg ? "注册并登录" : "立即登录"}</button>
      <div class="aicfg-state" id="auth-state">${reg ? "注册暂未开放；用站长给的账号直接登录即可。" : "用站长给的账号登录，即可使用识别 / 茶话会 / 幻化全部 AI。"}</div>
    </div>
  `, false, "auth-sheet");
}
function authTab(m) { AUTH.mode = (m === "reg") ? "reg" : "login"; authPaintOverlay(); }
function authErr(msg) { const el = $("#auth-state"); if (el) el.textContent = msg; }
async function authBridge(path, body) {
  try { return await identFetchCloud(IDENT_CLOUD_API + path, body, 5000); } catch (e) { return null; }
}
async function authSubmit() {
  if (AUTH.busy) return false;
  const g = s => { const el = $(s); return el ? String(el.value || "").trim() : ""; };
  const email = g("#auth-email").toLowerCase(), pwd = g("#auth-pwd"), reg = AUTH.mode === "reg";
  if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,10}$/.test(email)) { authErr("邮箱格式好像不对,检查一下。"); return false; }
  if (!pwd) { authErr("密码还没填。"); return false; }
  if (reg) {
    if (pwd.length < 8) { authErr("为了安全,注册密码至少 8 位。"); return false; }
    if (pwd !== g("#auth-pwd2")) { authErr("两次输入的密码不一样。"); return false; }
  }
  AUTH.busy = true;
  authErr(reg ? "正在注册……" : "正在登录……");
  const r = await authBridge(reg ? "/api/reg" : "/api/login", { email: email, password: pwd });
  AUTH.busy = false;
  if (r && r.ok) { authSave(r.email || email, "bridge", r.token); authPaint(); closeOverlay(); return false; }
  if (r && r.error) { authErr("❌ " + r.error); return false; }
  /* 小桥不在:演示账号仍可登录(只比对加盐哈希);注册必须等小桥 */
  if (reg) { authErr("注册暂未开放:直接用站长给的账号登录即可。"); return false; }
  if (AUTH_DEMOS.some(function (d) {
    return email === d.email && d.hashes.indexOf(authHash(pwd, d.salt)) >= 0;
  })) {
    authSave(email, "local", "");
    authPaint(); closeOverlay();
    return false;
  }
  authErr("账号或密码不对,再试一次;忘了就用站长给的演示账号。");
  return false;
}
function authLogout() {
  try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  authPaint();
  AUTH.mode = "login";
  authPaintOverlay();
  return false;
}
async function identCloudStart() {
  IDENT.cloudData = null; IDENT.cloudErr = "";
  identCloudRender();
  if (!IDENT.cloudIMG) return;
  if (IDENT.cloud !== "on") await identCloudPing();
  const mode = identCloudMode();
  if (mode === "bridge" || mode === "direct") return identCloudRun();
  identCloudRender();
}
async function identCloudRetry() {
  IDENT.cloudErr = ""; IDENT.cloudData = null;
  identCloudRender();
  await identCloudPing();
  const mode = identCloudMode();
  if (mode === "bridge" || mode === "direct") identCloudRun(); else identCloudRender();
}
async function identCloudRun() {
  const mine = IDENT.cloudIMG;
  if (!mine) return;
  IDENT.cloudBusy = true; IDENT.cloudErr = ""; IDENT.cloudData = null;
  identCloudRender();
  try {
    if (identCloudMode() === "bridge") {
      let bridged = false;
      try {
        const r = await identFetchCloud(IDENT_CLOUD_API + "/api/identify", { image: mine }, 90000);
        if (IDENT.cloudIMG !== mine) return;   // 等待期间又换了照片:旧结果丢弃
        if (r && r.ok && r.data) { IDENT.cloudData = r.data; bridged = true; }
        else IDENT.cloudErr = (r && r.error) || "云端没有返回结果";
      } catch (e) {
        if (!identDirectKey()) IDENT.cloudErr = "云端这次没接上(多半是网络抖了一下),点「🔄 再试一次云端识别」即可";
      }
      if (!bridged && !IDENT.cloudErr && identDirectKey()) {   // 小桥断开:自动改走直连
        const d = await identDirectRun(mine);
        if (IDENT.cloudIMG !== mine) return;
        IDENT.cloudData = d;
      }
    } else {
      const d = await identDirectRun(mine);
      if (IDENT.cloudIMG !== mine) return;
      IDENT.cloudData = d;
    }
  } catch (e) {
    if (IDENT.cloudIMG !== mine) return;
    IDENT.cloudErr = String((e && e.message) || e);
  }
  IDENT.cloudBusy = false;
  identCloudRender();
}
function identCloudRender() {
  const slot = $("#ident-cloud-slot"), loc = $("#ident-local-block");
  if (!slot) return;
  slot.innerHTML = identCloudSlotHTML();
  if (loc) loc.classList.toggle("ident-local-dim", !!IDENT.cloudData);
}
function identCloudSlotHTML() {
  if (IDENT.cloudData) {
    const d = IDENT.cloudData;
    return `<div class="icloud-card">
      <div class="icloud-head"><span>☁️ 云端识别结果</span><em>${(IDENT.cloudInfo && IDENT.cloudInfo.model) ? IDENT.cloudInfo.model : (identKeyKind(identDirectKey()) === "zhipu" ? "智谱 GLM-4V · 免费" : "云端大模型")}</em></div>
      <b class="icloud-name">《${d.name || "未识别到文物"}》</b>
      <span class="icloud-sub">${d.era || "年代待考"} · ${d.material || "材质待考"}${d.confidence ? ` · 置信${d.confidence}` : ""}</span>
      <p><b>📍 出处</b>${d.origin || "待考"}</p>
      <p><b>📜 来历与历史</b>${d.history || ""}</p>
      ${d.feature ? `<p><b>🔍 一眼看点</b>${d.feature}</p>` : ""}
      ${d.name ? identWakeHTML(d.name) : ""}
      <p class="icloud-note">由云端 AI 当场辨认,可能有误,参观时以馆内展签为准;下方是本机引擎的快速比对,仅供参考。</p>
    </div>`;
  }
  if (IDENT.cloudBusy) return `<div class="icloud-card busy"><span class="spin"></span>照片已提交给云端 AI,正在辨认名字与来历…(约 5~15 秒)</div>`;
  if (IDENT.cloudErr) return `<div class="icloud-card err"><b>☁️ 云端识别没成功</b><span>${IDENT.cloudErr}</span><button type="button" class="btn ghost" onclick="identCloudRetry()">🔄 再试一次云端识别</button>${identCloudMode() === "bridge" ? "" : ` <button type="button" class="btn ghost" onclick="identDirectSave()">🔑 重新粘贴密钥</button>`}</div>`;
  if (IDENT.cloud === "on") {
    if (IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false) return `<div class="icloud-card off"><b>☁️ 小桥已连接,还差密钥</b><span>点「🔑 粘贴密钥」把 AI 钥匙(智谱 id.secret 或 方舟 ark-)粘一次:会自动同步给小桥(只存内存,当场生效);或写进 tools/ident_key.txt。现在先用下方的本机结果。</span><button type="button" class="btn ghost" onclick="identCloudRetry()">🔄 重试云端识别</button> <button type="button" class="btn ghost" onclick="identDirectSave()">🔑 粘贴密钥</button></div>`;
    return `<div class="icloud-card off"><b>☁️ 云端已就绪</b><span>上传照片后会自动提交辨认;这张还没有云端结果。<button type="button" class="btn ghost" onclick="identCloudRetry()">🔄 补一次云端识别</button></span></div>`;
  }
  return `<div class="icloud-card off"><b>☁️ 云识别待开启</b><span>两种方式任选:① 本机运行 tools/ident_cloud.py(密钥放 tools/ident_key.txt,智谱免费钥匙即可);② 点「粘贴密钥」把 AI 钥匙整条粘一次 —— 开着本机小桥时会自动同步给桥(推荐,最稳)。不开启也不影响:下方本机引擎照常出结果。</span><button type="button" class="btn ghost" onclick="identDirectSave()">🔑 粘贴密钥</button> <button type="button" class="btn ghost" onclick="identCloudRetry()">🔄 重试云端识别</button></div>`;
}
/* ---- 识别 → 唤醒闭环:云端辨认出的名字对上图鉴精灵,当场就能唤醒收服 ---- */
/* 名字归一:去掉书名号 / 引号 / 标点 / 空白,便于比对 */
function identNormName(t) {
  return String(t || "").replace(/[《》〈〉「」“”"'‘’·、,;:。!?—\-()()〔〕\[\]【】\s]/g, "").trim();
}
/* 云端结果名 → 站内精灵:先全等(名字 / 别名),再互相包含取最长命中;认不出返回 null */
function identWakeFind(name) {
  const q = identNormName(name);
  if (q.length < 2) return null;
  const cands = Object.values(SPIRITS).filter(s => !s.custom);
  let hit = null;
  cands.forEach(s => { if (!hit && (identNormName(s.name) === q || (s.alias && identNormName(s.alias) === q))) hit = s; });
  if (hit) return hit;
  let best = null, bl = 0;
  cands.forEach(s => {
    [s.name, s.alias || ""].forEach(k => {
      const kk = identNormName(k);
      if (kk.length >= 2 && kk.length > bl && (q.indexOf(kk) >= 0 || kk.indexOf(q) >= 0)) { best = s; bl = kk.length; }
    });
  });
  return best;
}
/* 唤醒卡:云端结果下方的「认出来 → 唤醒成精灵」面板(未收录 / 可唤醒 / 已在图鉴 三态) */
function identWakeHTML(dname) {
  const w = identWakeFind(dname);
  if (!w) return `<div class="iwake miss">
      <b>🧭 暂未收录进图鉴</b>
      <span>它还没对上站内的 74 只文物精灵——可以拿这张照片走「📷 打卡拍照」,交给 AI 幻化成你的私人 Q 版精灵(带专属图鉴编码)。</span>
      <button type="button" class="btn ghost" onclick="identWakeCraft()">✨ 就用这张照片幻化它</button>
    </div>`;
  const pa = ATTRIBUTES.primary[w.primary], sa = ATTRIBUTES.secondary[w.secondary];
  if (IDENT.wakeBusy) return `<div class="iwake busy" id="ident-wake">
      <img src="${spritePath(w.id)}" alt="${w.name}">
      <div class="iw-info"><b>⚡ 正在唤醒《${w.name}》…</b><span>它穿过展柜,正朝你走来</span>
      <div class="wake-progress"><i id="wakeBar" style="width:14%"></i></div></div>
    </div>`;
  const got = isCaptured(w.id);
  return `<div class="iwake${got ? " got" : ""}" id="ident-wake">
      <img src="${spritePath(w.id)}" alt="${w.name}">
      <div class="iw-info">
        <b>${IDENT.wakeDone === w.id ? "🎉 唤醒成功,已住进图鉴!" : (got ? "✅ 它早已在你身边" : "⚡ 认出来了——唤醒成精灵!")}</b>
        <span><b class="iw-name">${w.name}</b>${w.alias ? " · 又称「" + w.alias + "」" : ""}${w.era ? " · " + w.era : ""}${pa ? " · " + pa.name + " / " + sa.name : ""}</span>
      </div>
      ${got
        ? `<button type="button" class="btn ghost" onclick="location.hash='#/codex'">📖 去图鉴看看</button>`
        : `<button type="button" class="btn gold" onclick="identWakeGo()">⚡ 唤醒它</button>`}
    </div>`;
}
/* 一键唤醒:照片里认出的文物直接登记进图鉴 */
function identWakeGo() {
  if (!IDENT.cloudData || IDENT.wakeBusy) return;
  const w = identWakeFind(IDENT.cloudData.name);
  if (!w || isCaptured(w.id)) return;
  IDENT.wakeBusy = true;
  identCloudRender();
  setTimeout(() => { const b = $("#wakeBar"); if (b) b.style.width = "96%"; }, 80);
  setTimeout(() => {
    addCaptured(w.id);
    IDENT.wakeBusy = false;
    IDENT.wakeDone = w.id;
    identCloudRender();
  }, 1500);
}
/* 未收录的文物:用同一张照片走「打卡拍照」做精灵卡,领专属图鉴编码 */
function identWakeCraft() {
  if (IDENT.cloudIMG) {
    const d = IDENT.cloudData || {};
    const desc = [d.name ? "名称:" + d.name : "", d.era ? "年代:" + d.era : "", d.material ? "材质:" + d.material : "", d.feature ? "看点:" + d.feature : ""].filter(Boolean).join(";");
    photoFlow(IDENT.cloudIMG, desc);
  } else openPhoto();
}
function identSave() {
  if (!IDENT.ready || !IDENT.up) return;
  const a = document.createElement("a");
  a.href = IDENT.up.toDataURL("image/png");
  a.download = "文物精灵_AI文物识别_复原图.webp";
  document.body.appendChild(a); a.click(); a.remove();
}
/* ①+③ 修补:像元与 3×3 邻域均值差得太多(划痕 / 裂纹 / 缺口),就用邻域均值把它补上 */
function identHeal(d, w, h, th) {
  const src = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = (y * w + x) * 4;
      let ra = 0, ga = 0, ba = 0;
      for (let j = -1; j <= 1; j++) {
        const q = p + j * w * 4;
        ra += src[q - 4] + src[q] + src[q + 4];
        ga += src[q - 3] + src[q + 1] + src[q + 5];
        ba += src[q - 2] + src[q + 2] + src[q + 6];
      }
      const df = Math.abs(src[p] - ra / 9) + Math.abs(src[p + 1] - ga / 9) + Math.abs(src[p + 2] - ba / 9);
      if (df > th) {
        d[p] = (ra - src[p]) / 8;
        d[p + 1] = (ga - src[p + 1]) / 8;
        d[p + 2] = (ba - src[p + 2]) / 8;
      }
    }
  }
}
/* ② 恢复色彩:灰世界白平衡 + 按褪色程度回升饱和度 + 轻对比 */
function identRecolor(d, w, h) {
  const n = w * h;
  let rs = 0, gs = 0, bs = 0, ss = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    rs += r; gs += g; bs += b;
    const mx = Math.max(r, g, b);
    ss += mx ? (mx - Math.min(r, g, b)) / mx : 0;
  }
  let kr = (rs / n) || 1, kg = (gs / n) || 1, kb = (bs / n) || 1;
  const tm = (kr + kg + kb) / 3;
  kr = Math.max(.9, Math.min(1.1, tm / kr));
  kg = Math.max(.9, Math.min(1.1, tm / kg));
  kb = Math.max(.9, Math.min(1.1, tm / kb));
  const ms = ss / n;
  const kk = ms < .16 ? 1.6 : (ms < .3 ? 1.32 : 1.12);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] * kr, g = d[i + 1] * kg, b = d[i + 2] * kb;
    const gy = .299 * r + .587 * g + .114 * b;
    d[i] = (gy + (r - gy) * kk - 128) * 1.07 + 132;
    d[i + 1] = (gy + (g - gy) * kk - 128) * 1.07 + 131;
    d[i + 2] = (gy + (b - gy) * kk - 128) * 1.07 + 130;
  }
}
/* 识别特征:先剔掉与背景相近的像元(展柜 / 衬布),再统计 12 档色相直方图 + 均色 + 边缘密度 + 高宽比 */
function identFeats(d, w, h) {
  const step = Math.max(1, Math.round(Math.sqrt(w * h / 24000)));
  /* 背景色:取外圈 12% 带的均值(照片四边的展柜 / 衬布 / 墙面通常都在这儿) */
  const bd = Math.max(2, Math.round(Math.min(w, h) * .12));
  let bgr = 0, bgg = 0, bgb = 0, bn = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    if (x > bd && x < w - bd && y > bd && y < h - bd) continue;
    const i = (y * w + x) * 4;
    bgr += d[i]; bgg += d[i + 1]; bgb += d[i + 2]; bn++;
  }
  if (bn) { bgr /= bn; bgg /= bn; bgb /= bn; }
  const pass = minBg => {
    const NB = 12;
    const bw = new Array(NB).fill(0), br = new Array(NB).fill(0), bgc = new Array(NB).fill(0), bb = new Array(NB).fill(0);
    let rs = 0, gs = 0, bs = 0, n = 0, ss = 0;
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      if (minBg > 0) {
        const db = (r - bgr) * (r - bgr) + (g - bgg) * (g - bgg) + (b - bgb) * (b - bgb);
        if (db < minBg * minBg) continue;
      }
      rs += r; gs += g; bs += b; n++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / 255;
      ss += sat;
      if (mx - mn > 8 && mx > 30) {
        const dd = mx - mn;
        const hu = mx === r ? ((g - b) / dd + 6) % 6 : (mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4);
        const bk = Math.floor(hu * 2) % NB;
        const wgt = Math.sqrt(sat);   // 开方:小而艳的装饰不至于压过大面积本色
        bw[bk] += wgt; br[bk] += r * wgt; bgc[bk] += g * wgt; bb[bk] += b * wgt;
      }
    }
    return { n, bw, br, bgc, bb, rs, gs, bs, ss };
  };
  const total = Math.ceil(w / step) * Math.ceil(h / step);
  let st = pass(85);
  if (st.n < Math.max(64, total * .12)) st = pass(0);   // 器物占满画面 / 背景判不明 → 退回全量统计
  const n = st.n || 1;
  const meanSat = st.ss / n;
  const tops = st.bw.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3)
    .filter(p => p[0] > 0)
    .map(p => ({ w: p[0], hue: IDENT_HUES[p[1]], rgb: [st.br[p[1]] / p[0], st.bgc[p[1]] / p[0], st.bb[p[1]] / p[0]] }));
  const lum = new Float32Array(w * h);
  for (let p = 0, i = 0; i < d.length; i += 4, p++) lum[p] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
  let edge = 0, tot = 0;
  const es = Math.max(1, step);
  for (let y = 2; y < h - 2; y += es) for (let x = 2; x < w - 2; x += es) {
    const p = y * w + x;
    const gx = -lum[p - w - 1] - 2 * lum[p - 1] - lum[p + w - 1] + lum[p - w + 1] + 2 * lum[p + 1] + lum[p + w + 1];
    const gy = -lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1] + lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1];
    if (Math.abs(gx) + Math.abs(gy) > 90) edge++;
    tot++;
  }
  return { mean: [st.rs / n, st.gs / n, st.bs / n], meanSat, tops, edge: tot ? edge / tot : 0, ratio: h / w };
}
function identHex(hx) { const v = parseInt(String(hx || "#888888").replace("#", ""), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function identNormRgb(c) { const mx = Math.max(c[0], c[1], c[2]) || 1; return [c[0] * 255 / mx, c[1] * 255 / mx, c[2] * 255 / mx]; }   // 按最亮通道归一:只看色相倾向,不受曝光明暗影响
function identColorScore(f, hx, norm) {
  const c0 = identHex(hx);
  const c = norm ? identNormRgb(c0) : c0;
  const mean = norm ? identNormRgb(f.mean) : f.mean;
  let wsum = .35, sc = .35 * Math.exp(-((mean[0] - c[0]) * (mean[0] - c[0]) + (mean[1] - c[1]) * (mean[1] - c[1]) + (mean[2] - c[2]) * (mean[2] - c[2])) / 8192);
  f.tops.forEach(t => {
    const rgb = norm ? identNormRgb(t.rgb) : t.rgb;
    const d2 = (rgb[0] - c[0]) * (rgb[0] - c[0]) + (rgb[1] - c[1]) * (rgb[1] - c[1]) + (rgb[2] - c[2]) * (rgb[2] - c[2]);
    wsum += t.w;
    sc += t.w * Math.exp(-d2 / 6728);
  });
  return sc / wsum;
}
function identAttrScore(f, kind, key) {
  const pale = f.meanSat < .14;   // 浅色 / 素色器物:照片暗一点亮一点差别极大,改用归一色相比对
  let s = identColorScore(f, ATTRIBUTES[kind][key].color, pale);
  (IDENT_HINT[key] || []).forEach(hx => { const v = identColorScore(f, hx, pale); if (v > s) s = v; });
  if (pale && key === "painting") s *= .92;   // 浅色下纸绢米色与白瓷 / 白玉难分,轻微降权,让白瓷胜出
  return s;
}
function identRank(f, kind) {
  return Object.entries(ATTRIBUTES[kind])
    .map(([k, a]) => [k, a, identAttrScore(f, kind, k)])
    .sort((x, y) => y[2] - x[2]);
}
function identFormBonus(f, name) {
  if (f.ratio > 1.3) return /[灯尊壶瓶塔楼俑剑戈]/.test(name) ? .05 : 0;
  if (f.ratio < .82) return /[鼎盘碗枕案镜砚印玺簋]/.test(name) ? .05 : 0;
  return 0;
}
function identMatchSpirits(f) {
  const out = [];
  Object.values(SPIRITS).forEach(s => {
    const pa = ATTRIBUTES.primary[s.primary], sa = ATTRIBUTES.secondary[s.secondary];
    if (!pa || !sa) return;
    const sc = identAttrScore(f, "primary", s.primary) * .7 + identAttrScore(f, "secondary", s.secondary) * .25 + identFormBonus(f, s.name || "");
    out.push({ id: s.id, s, sc });
  });
  out.sort((a, b) => b.sc - a.sc);
  const top = out.slice(0, 3), mx = (top.length && top[0].sc) || 1;
  top.forEach(m => { m.pct = Math.round(Math.max(58, Math.min(97, 58 + 40 * (m.sc / mx)))); });
  return top;
}
function identForm(f, matches) {
  const cnt = {};
  matches.forEach((m, i) => {
    const nm = (m.s && m.s.name) || "";
    IDENT_FORMS.forEach(ch => { if (nm.indexOf(ch) >= 0) cnt[ch] = (cnt[ch] || 0) + (3 - i); });
  });
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  const shape = f.ratio > 1.55 ? "高挑修长" : (f.ratio > 1.15 ? "端正竖立" : (f.ratio > .9 ? "近方敦正" : (f.ratio > .68 ? "横宽沉稳" : "横向舒展")));
  const hint = f.ratio > 1.55 ? "瓶 / 尊" : (f.ratio > 1.15 ? "壶 / 罐" : (f.ratio > .9 ? "罐 / 鼎" : (f.ratio > .68 ? "盘 / 碗" : "案 / 盘")));
  return { shape, guess: best ? "似「" + best[0] + "」类" : "似「" + hint + "」类", hits: best ? best[1] : 0 };
}
function identPattern(edge) {
  if (edge < .035) return { level: "素面简淡", note: "表面光素,少有纹饰" };
  if (edge < .09) return { level: "细密纹样", note: "中等密度纹饰,线条规整" };
  return { level: "繁缛华丽", note: "纹饰高密繁复,层次多" };
}
function identResultHTML(f, pRank, sRank, matches, form, pat) {
  const rel = rk => { const t = rk.slice(0, 3), sum = t.reduce((a, x) => a + x[2], 0) || 1; return Math.round(Math.max(55, Math.min(93, 52 + 90 * (t[0][2] / sum)))); };
  const pc = rel(pRank);
  const p1 = pRank[0];
  const t0 = f.tops[0];
  const eraShort = ((matches[0].s.era || "").split(/[·(]/)[0] || "").trim() || "年代待考";
  const mCards = matches.map(m => {
    const s = m.s, pa = ATTRIBUTES.primary[s.primary], sa = ATTRIBUTES.secondary[s.secondary];
    return `<div class="im-item" onclick="location.hash='#/spirit/${s.id}'">
      <img src="${spritePath(s.id)}" alt="${s.name}">
      <div class="im-info"><b>${s.name}</b><span>${s.era || ""}</span><span class="im-attrs">${pa.name} / ${sa.name}</span></div>
      <em>${m.pct}%</em>
    </div>`;
  }).join("");
  const m0 = matches[0], s0 = m0.s, pa0 = ATTRIBUTES.primary[s0.primary], sa0 = ATTRIBUTES.secondary[s0.secondary];
  return `
    <div class="ident-verdict">
      <img src="${spritePath(s0.id)}" alt="${s0.name}">
      <div class="iv-info">
        <span class="iv-tag">✨ 识别结果</span><b>《${s0.name}》</b>${s0.alias ? `<i>又称「${s0.alias}」</i>` : ""}<span class="iv-pct">候选接近度 ${m0.pct}%</span>
        <span class="iv-sub">${s0.era || "年代待考"} · ${pa0.name} / ${sa0.name}</span>
        <p class="iv-intro">${s0.intro || ""}</p>
      </div>
    </div>
    <div class="ident-lore">
      <b>📜 来历</b>
      <p>${s0.history || s0.intro || "暂无档案记载。"}</p>
    </div>
    <div class="ident-cards">
      <div class="ic"><span>材质(主属性)</span><b>${p1[1].name}</b><i><s style="width:${pc}%"></s></i><em>置信 ${pc}% · 用途倾向「${sa0.name}」${m0.pct}%(随最像候选)</em></div>
      <div class="ic"><span>器型(轮廓 + 候选比对)</span><b>${form.guess}</b><i><s style="width:${Math.max(56, Math.min(92, 56 + form.hits * 9))}%"></s></i><em>${form.shape} · 高宽比 ${f.ratio.toFixed(2)}</em></div>
      <div class="ic"><span>纹样(纹理密度)</span><b>${pat.level}</b><i><s style="width:${Math.max(18, Math.min(96, Math.round(f.edge * 620)))}%"></s></i><em>密度 ${(f.edge * 100).toFixed(1)}% · ${pat.note}</em></div>
      <div class="ic"><span>年代(据识别结果)</span><b>${eraShort}</b><i><s style="width:${m0.pct}%"></s></i><em>候选接近度 ${m0.pct}%</em></div>
    </div>
    <div class="ident-talk">
      <b>🧠 识别依据</b>
      <p>色相分布偏「${t0 ? t0.hue : "素净"}」,与「${p1[1].name}」的色系最接近;轮廓${form.shape},${form.guess};纹理密度约 ${(f.edge * 100).toFixed(1)}%,${pat.note}。综合排序后,它与上面的《${s0.name}》最为接近。</p>
      <p class="muted">这是本机引擎的快速比对(名字与「来历」摘自站内对应文物档案);云端 AI 的正式辨认在上面。参观时以馆内展签为准——识别不对,就点下面的候选换一件看档案。</p>
    </div>
    <div class="ident-match">
      <b>🎯 相近候选与档案(共 ${matches.length} 个 · 点开进精灵档案)</b>
      <div class="im-list">${mCards}</div>
    </div>
  `;
}

/* ---------------- 站点页 ---------------- */
function viewStation(id) {
  const st = STATIONS.find(s => s.id === id);
  if (!st) return `<div class="empty">找不到这个站点</div>`;
  if (st.secret && !huaxiaUnlocked()) {
    const all = STATIONS.length - 1, done = huaxiaProgress();
    return `
    <div class="page-head">
      <h2>${st.name}</h2>
      <p>📍 ${st.place} · ${st.subtitle}</p>
    </div>
    <div class="card hx-lock">
      <div class="hx-lock-icon">🔒</div>
      <h3>「第零站 · 华夏」还在沉睡</h3>
      <p>它藏着从夏到清、十六朝各一件的镇馆之宝。<br>把其余 <b>${all}</b> 个站点的精灵全部收齐,这条五千年长河才会开启。</p>
      <p class="hx-prog">当前进度:已集齐 <b>${done}</b> / ${all} 站</p>
      <div class="hx-slots">${(st.slots || []).map(t => `<span class="hx-chip">${t}<i>🔒</i></span>`).join("")}</div>
      <p class="muted">夏 → 清,一朝一精灵——先回前面的站点,把还在沉睡的它们唤醒吧。</p>
      <button class="btn" onclick="location.hash='#/'">回首页继续打卡</button>
    </div>`;
  }
  return `
    <div class="page-head">
      <h2>${st.name}</h2>
      <p>📍 ${st.place} · ${st.subtitle}<br>${st.intro}</p>
    </div>
    ${st.secret ? `<div class="card hx-open">🏮 隐藏款已开启!夏 → 清十六朝精灵,都在这里等你一一唤醒。</div>` : ""}
    <div class="grid">
      ${st.spiritIds.map(sid => {
        const s = SPIRITS[sid], got = isCaptured(sid);
        return `<div class="relic-card${decorCls(s)}" onclick="location.hash='#/spirit/${sid}'">
          <span class="tag ${got ? "" : "lock"}">${got ? "已收集" : "未唤醒"}</span>
          ${spiritImg(sid, "", s.name)}
          <div class="nm">${s.name}</div>
          <div class="era">${s.era}</div>
          <div class="badges">
            ${attrBadge("primary", s.primary)}
            ${attrBadge("secondary", s.secondary)}
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ---------------- 精灵详情页 ---------------- */
function viewSpirit(id) {
  const s = SPIRITS[id];
  if (!s) return `<div class="empty">找不到这只精灵</div>`;
  if (spiritLocked(id)) {
    const all = STATIONS.length - 1;
    return `
    <div class="page-head"><h2>🔒 未开启的精灵</h2><p>它沉睡在「第零站 · 华夏」里,等你集齐其余站点。</p></div>
    <div class="card hx-lock">
      <div class="hx-lock-icon">🔒</div>
      <h3>还没有到相见的时候</h3>
      <p>「第零站 · 华夏」是隐藏站点:把其余 <b>${all}</b> 个站点的精灵全部收齐,它才会开启。</p>
      <p class="hx-prog">当前进度:已集齐 <b>${huaxiaProgress()}</b> / ${all} 站</p>
      <button class="btn" onclick="location.hash='#/station/huaxia'">去看看第零站</button>
    </div>`;
  }
  const got = isCaptured(id);
  if (s.custom) return viewSpiritCustom(s);
  return `
    <div class="card decor-card fr-${FRAME_KEY[decorFrame(s)]}">
      <div class="spirit-hero">
        ${spiritImg(id, "big", s.name)}
        <div class="info">
          <h2>${s.name} <span class="alias">${s.alias}</span></h2>
          <div class="muted" style="margin-top:6px">🕰 ${s.era} · 🔖 图鉴编号:${posterMeta(id).no || "—"}</div>
          <div class="lineage">
            ${attrBadge("primary", s.primary)}
            ${attrBadge("secondary", s.secondary)}
          </div>
          <p style="font-size:13.5px;line-height:1.8;color:#4a423a">${s.intro}</p>
          <div class="trait-line">出战特性【${TRAITS[s.primary].name}】${TRAITS[s.primary].desc}</div>
          ${got ? `<div class="muted">✅ 已收入图鉴</div>` : `<div class="muted">🔒 尚未捕捉</div>`}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" onclick="openComic('${id}')">📖 回忆</button>
        <button class="btn jade" onclick="openChat('${id}')">💬 与它对话</button>
        <button class="btn" onclick="openBattle('${id}')">🎲 ${got ? "带它再战一场" : "挑战捕捉"}</button>
        <button class="btn gold" onclick="posterFromSpirit('${id}')">📸 做张打卡海报</button>
      </div>
    </div>

    <div class="section-title">出身介绍</div>
    <div class="card">
      <div class="kb-item"><b>文物原型:${s.relicName}</b><p>${s.history}</p></div>
      <div class="kb-item"><b>主属性 · ${ATTRIBUTES.primary[s.primary].name}</b><p>${ATTRIBUTES.primary[s.primary].desc}</p></div>
      <div class="kb-item"><b>副属性 · ${ATTRIBUTES.secondary[s.secondary].name}</b><p>${ATTRIBUTES.secondary[s.secondary].desc}</p></div>
    </div>
  `;
}

/* 拍照唤醒的精灵:简化档案页(没有回忆/对话/对战,重在展示与做海报) */
function viewSpiritCustom(s) {
  const m = posterMeta(s.id);
  return `
    <div class="card decor-card fr-${FRAME_KEY[decorFrame(s)]}">
      <div class="spirit-hero">
        ${spiritImg(s.id, "big", s.name)}
        <div class="info">
          <h2>${s.name} <span class="alias">${s.alias}</span></h2>
          <div class="muted" style="margin-top:6px">🕰 ${s.era} · 🔖 图鉴编号:${m.no || "—"}</div>
          <div class="lineage">
            ${attrBadge("primary", s.primary)}
            ${attrBadge("secondary", s.secondary)}
          </div>
          <p style="font-size:13.5px;line-height:1.8;color:#4a423a">${s.intro}</p>
          <div class="trait-line">出战特性【${TRAITS[s.primary].name}】${TRAITS[s.primary].desc}</div>
          <div class="muted">📷 拍照唤醒的自定义文物精灵(保存在本机)</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn gold" onclick="posterFromSpirit('${s.id}')">📸 做张打卡海报</button>
        <button class="btn ghost" onclick="openPhoto()">📷 再拍一只</button>
        <button class="btn ghost" onclick="removeCustom('${s.id}')">🗑 删除</button>
      </div>
    </div>
    <div class="section-title">唤醒记录</div>
    <div class="card">
      <div class="kb-item"><b>它的来历</b><p>${s.history}</p></div>
      <div class="kb-item"><b>主属性 · ${ATTRIBUTES.primary[s.primary].name}</b><p>${ATTRIBUTES.primary[s.primary].desc}</p></div>
      <div class="kb-item"><b>副属性 · ${ATTRIBUTES.secondary[s.secondary].name}</b><p>${ATTRIBUTES.secondary[s.secondary].desc}</p></div>
    </div>`;
}
function removeCustom(id) {
  if (!confirm("删除这只新唤醒的文物精灵吗?\n\n它的图鉴编码会一并消失(不影响其他收集进度)。")) return;
  CUSTOMS = CUSTOMS.filter(c => c.id !== id);
  delete SPIRITS[id];
  captured = captured.filter(x => x !== id);
  saveCaptured(); saveCustoms();
  location.hash = "#/codex";
  render();
}

/* ---------------- 图鉴页 ---------------- */
function viewCodex() {
  const std = Object.values(SPIRITS).filter(s => !s.custom);
  const list = std.filter(s => isCaptured(s.id));
  const wakes = CUSTOMS.map(c => SPIRITS[c.id]).filter(Boolean);
  const hasProgress = list.some(s => !s.starter) || wakes.length > 0;
  return `
    <div class="page-head">
      <h2>我的文物图鉴</h2>
      <p>共收集 ${list.length} / ${std.length} 只文物精灵(全站共 ${std.length + LEGENDS.length} 只)。${wakes.length ? `另有 ${wakes.length} 只「我点亮的文物」在下方栏目。` : ""}另有 ${LEGENDS.length} 只「燕赵名片」只展不捉,但同样记在全站 ${std.length + LEGENDS.length} 只的名册里。</p>
    </div>
    ${list.length === 0 ? `<div class="empty">还没有收集到精灵,去首页打卡吧 📷</div>` : `
    <div class="codex-grid">
      ${list.map(s => `
        <div class="codex-card${decorCls(s)}">
          ${spiritImg(s.id, "", s.name)}
          <div class="nm">${s.name} <span class="muted" style="font-weight:400">${s.alias}</span></div>
          <div class="badges" style="justify-content:flex-start">
            ${attrBadge("primary", s.primary)}${attrBadge("secondary", s.secondary)}
          </div>
          <div class="hist">${s.history}</div>
        </div>`).join("")}
    </div>`}
    <div class="sec-head">
      <div>
        <span class="eyebrow">HEBEI LEGENDS</span>
        <h2>燕赵名片</h2>
        <p class="sec-sub">🔒 河北的红舞狮与镇馆神兽也在图鉴里安了家:可以围观、可以看故事,但<b>不可捕捉、不计入</b>上面的收集进度;它们同样记在全站 <b>${std.length + LEGENDS.length}</b> 只的名册里</p>
      </div>
    </div>
    <div class="codex-grid">
      ${LEGENDS.map(L => `
        <div class="codex-card legend" onclick="openLegend('${L.id}')" style="cursor:pointer">
          <span class="lg-ribbon">${L.corner}</span>
          ${imgTag(L.img, "", L.name)}
          <div class="nm">${L.name} <span class="muted" style="font-weight:400">${L.alias}</span></div>
          <div class="badges" style="justify-content:flex-start">
            <span class="tag-pill lock">🔒 不可捕捉</span><span class="tag-pill">${L.corner}</span>
          </div>
          <div class="hist">${L.history}</div>
        </div>`).join("")}
    </div>
    ${wakes.length ? `
    <div class="sec-head">
      <div>
        <span class="eyebrow">MY SPARKS</span>
        <h2>我点亮的文物</h2>
        <p class="sec-sub">🔦 用「打卡拍照」亲手点亮的 Q 版精灵 · 不占上面 ${std.length} 只的收集进度,做 AI 打卡海报时可以直接选它们</p>
      </div>
    </div>
    <div class="codex-grid">
      ${wakes.map(s => `
        <div class="codex-card${decorCls(s)}" onclick="location.hash='#/spirit/${s.id}'" style="cursor:pointer">
          ${spiritImg(s.id, "", s.name)}
          <div class="nm">${s.name} <span class="muted" style="font-weight:400">${posterMeta(s.id).no || ""}</span></div>
          <div class="badges" style="justify-content:flex-start">
            ${attrBadge("primary", s.primary)}${attrBadge("secondary", s.secondary)}
          </div>
          <div class="hist">${s.history}</div>
        </div>`).join("")}
    </div>` : ""}
    ${hasProgress ? `
    <div class="codex-foot">
      <button class="btn ghost" onclick="resetProgress()">清空进度 · 回到初始状态</button>
      <p class="muted">比赛演示前可在这里复位:只清空本版本的进度(含「我点亮的文物」),另一份(正式版 / 测试版)不受影响。</p>
    </div>` : ""}
  `;
}

/* 燕赵名片 · 详情弹层(只展不捉:看大图和故事,不能捕捉/出战) */
function openLegend(id) {
  const L = LEGENDS.filter(l => l.id === id)[0];
  if (!L) return;
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>${L.name} <span class="muted" style="font-size:15px;font-weight:400">${L.alias}</span></h3>
    <div class="lg-hero">${imgTag(L.img, "", L.name)}</div>
    <p class="muted" style="margin:10px 0 2px">🕰 ${L.era}<br>🏛 ${L.hall}</p>
    <p style="line-height:1.95;margin:10px 0 0">${L.history}</p>
    <div class="lg-note">🔒 它是「燕赵名片」成员:可以在图鉴里随时来看它、听它的故事,但<b>不可捕捉、不能出战、不计入收集进度</b>。</div>
    <div style="text-align:center;margin-top:16px"><button class="btn" onclick="closeOverlay()">好嘞,知道啦</button></div>
  `);
}

/* =========================================================
   弹层通用
   ========================================================= */
function overlay(html, big = false, cls = "") {
  const o = $("#overlay");
  o.innerHTML = `<div class="sheet ${big ? "battle" : ""} ${cls}">${html}</div>`;
  o.classList.remove("hidden");
}
function closeOverlay() { $("#overlay").classList.add("hidden"); $("#overlay").innerHTML = ""; }
$("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeOverlay(); });

/* ---------------- 回忆漫画 ---------------- */
let comicState = null;
function openComic(id) {
  comicState = { id, i: 0 };
  paintComic();
}
function paintComic() {
  const s = SPIRITS[comicState.id], i = comicState.i, n = s.comic.length;
  const scenes = ["🏛️", "🖌️", "🔥", "⛵", "🌊", "📜"];
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>📖 ${s.name} 的回忆</h3>
    <div class="comic-dots">${s.comic.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
    <div class="comic-panel">
      <div class="comic-scene">${scenes[i % scenes.length]}</div>
      <div class="comic-text">${s.comic[i]}</div>
    </div>
    <div class="actions" style="margin-top:14px">
      <button class="btn ghost" ${i === 0 ? "disabled" : ""} onclick="comicStep(-1)">上一幕</button>
      <button class="btn" onclick="comicStep(1)">${i === n - 1 ? "回忆结束 · 去捕捉" : "下一幕"}</button>
    </div>
  `);
}
function comicStep(d) {
  const s = SPIRITS[comicState.id];
  const ni = comicState.i + d;
  if (ni >= s.comic.length) { closeOverlay(); startBattle(comicState.id); return; }
  comicState.i = Math.max(0, ni);
  paintComic();
}

/* ---------------- 与精灵对话(云端 AI · 智谱) ---------------- */
/* 由「与它对话」进入：把该文物的来历、要点塞进系统提示，让模型扮成它本人回答。
   优先小桥 /api/chat，不行再走直连；都接不上才回退本地 knowledge 匹配。 */
let chatState = null, chatSeq = 0;

function chatSys(s) {
  const kn = (s.knowledge || []).map(k => "· " + k.a).join("\n");
  return "你就是「" + s.name + "」" + (s.era ? "（" + s.era + "）" : "") +
    "——一件中国文物的拟人精灵，正被一位来访的年轻人捧在手里聊天。\n" +
    "用第一人称「我」说话，语气亲切、有点俏皮，像见过千年世面的老朋友；不要自称 AI、模型或助手。\n" +
    "以下是你的已知资料，只依据这些与公认史实回答，资料里没有的就说记不清，绝不编造：\n" +
    (s.intro ? "【简介】" + s.intro + "\n" : "") +
    (s.history ? "【来历】" + s.history + "\n" : "") +
    (kn ? "【要点】\n" + kn + "\n" : "") +
    "回答要求：1) 只用中文口语，2~4 句、40~160 字，直接给答案，别客套、别反问；" +
    "2) 重量、尺寸、年代、价格这类数字只报资料里有把握的，没把握就说「这个我记不太准」；" +
    "3) 可以偶尔说「我当年…」带一点亲历感，但不要编造具体事件与人物；" +
    "4) 与文物、历史、文化无关的问题，礼貌地把话头拉回自己；" +
    "5) 不要用 Markdown 符号，最多一两个小表情。";
}

function chatMsgs(s, hist, q) {
  return [{ role: "system", content: chatSys(s) }]
    .concat((hist || []).slice(-6), [{ role: "user", content: q }]);
}

async function chatCloudAsk(msgs, done) {
  let text = "", used = "";
  try {   /* ① 云端小桥（钥匙留服务端，响应带模型名） */
    const r = await identFetchCloud(IDENT_CLOUD_API + "/api/chat", { messages: msgs, temperature: 0.8, max_tokens: 600 }, 22000);
    if (r && r.ok && r.text) { text = r.text; used = r.model || "智谱"; }
  } catch (e) {}
  if (!text && typeof identDirectKey === "function" && identDirectKey()) {   /* ② 网页直连兜底 */
    try { const d = await teaCloudDirect(msgs, 22000); text = d.text; used = d.model; } catch (e) {}
  }
  done(text ? { text: text, model: used } : null);
}

function openChat(id) {
  const s = SPIRITS[id];
  if (!s) return;
  chatSeq = 0;
  chatState = {
    id: id, hist: [],
    log: [{ who: "ai", t: aqEsc(s.intro || "") + "<br>我是 <b>" + aqEsc(s.name) + "</b>。想问什么尽管说——几千年前的事，我还记得几分。" }]
  };
  paintChat();
}

function closeChat() {
  chatState = null;
  closeOverlay();   /* 底下就是它自己的档案页，关掉对话自然回去 */
}

function paintChat() {
  if (!chatState) return;
  const s = SPIRITS[chatState.id];
  const qs = (s.knowledge || []).slice(0, 4).map(knowledgeQuestion).filter(Boolean);
  overlay(`
    <button class="close" onclick="closeChat()">✕</button>
    <h3>💬 与 ${s.name} 对话 <span class="chat-ai">☁️ AI 在线</span></h3>
    <div class="chat" id="chatBox">
      ${chatState.log.map(m => `<div class="msg ${m.who}">${m.t}</div>`).join("")}
    </div>
    <div class="quick">${qs.map(q => `<button onclick="askSpirit('${q.replace(/'/g, "")}')">${q}</button>`).join("")}</div>
    <div class="chat-input">
      <input id="chatIn" placeholder="问点关于它的事…" onkeydown="if(event.key==='Enter'){event.preventDefault();askSpirit(this.value)}">
      <button class="btn" onclick="askSpirit(document.getElementById('chatIn').value)">发送</button>
    </div>
  `);
  const box = $("#chatBox"); if (box) box.scrollTop = box.scrollHeight;
}
function knowledgeQuestion(k) { return (k.keys && k.keys[0]) ? k.keys[0] : ""; }
function spiritAnswer(s, q) {
  q = (q || "").trim();
  if (!q) return "嗯?你想问什么呀?";
  let best = null, bestHit = 0;
  (s.knowledge || []).forEach(k => {
    const hit = k.keys.filter(kw => q.includes(kw)).length;
    if (hit > bestHit) { bestHit = hit; best = k; }
  });
  if (best) return best.a;
  return `这个问题我还不熟~ 你可以问我:${(s.knowledge || []).map(k => k.keys[0]).slice(0, 4).join("、")}。`;
}
function askSpirit(q) {
  q = String(q == null ? "" : q).trim();
  if (!q || !chatState) return false;
  const st = chatState, s = SPIRITS[st.id];
  const tid = "c" + (++chatSeq);
  st.log.push({ who: "me", t: aqEsc(q) });
  st.log.push({ who: "ai", t: '<span class="ch-wait"><i></i><i></i><i></i> 它想了想…</span>', id: tid });
  paintChat();
  chatCloudAsk(chatMsgs(s, st.hist, q), (res) => {
    const it = st.log.find(m => m.id === tid);
    if (!it) return;
    if (res && res.text) {
      it.t = aqCloudFmt(res.text) + '<small class="ch-by">☁️ 云端 AI 现场作答（' + aqEsc(res.model || "智谱") + "）</small>";
      st.hist.push({ role: "user", content: q }, { role: "assistant", content: String(res.text).slice(0, 600) });
      if (st.hist.length > 8) st.hist.splice(0, st.hist.length - 8);
    } else {
      it.t = aqEsc(spiritAnswer(s, q)) + '<small class="ch-by">本地资料回答 · 云端暂时没接上</small>';
    }
    if (chatState === st) paintChat();   /* 已经切走就别再重绘别人的对话 */
  });
  return false;
}

/* ---------------- 打卡拍照 · AI 幻化唤醒新文物 ---------------- */
/* 可选云端 AI:填好下面接口后,「打卡拍照」会先把照片交给云端 AI 幻化;留空或调用失败时自动改用本机幻化引擎 */
const AI_PHOTO_API = {
  url: "",          // 例:"https://你的服务/幻化接口"(POST,JSON:{image:照片dataURL,prompt})
  key: "",          // 需要鉴权时填(Authorization: Bearer ...)
  prompt: "把照片里的文物画成 Q 版中国风游戏精灵:保留文物造型特征,卡通描线,描金配色,奶白纸底。"
};
let photoState = null;
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, sleepMs(ms).then(() => null)]);
const loadImgUrl = src => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error("图片加载失败:" + src));
  im.src = src;
});

function openPhoto() {
  photoState = null;
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>📷 打卡拍照 · 唤醒新文物</h3>
    <p class="muted">拍下/选择一张文物照片,交给 AI 幻化成 Q 版精灵(连不上云端时自动改用本机国风卡),再领取一个属于你的文物图鉴编码——它会住进「文物图鉴」下面的「我点亮的文物」栏目(不占我的精灵收集数),做打卡海报时可以直接选到它。</p>
    <label class="photo-drop" id="drop">
      <input type="file" accept="image/*" style="display:none" onchange="onPhoto(this)">
      <div>点这里拍摄 / 选择文物照片</div>
      <div class="muted" style="margin-top:6px">(手机可直接调起相机;AI 幻化时照片会提交云端图像模型一次,失败则完全本机处理)</div>
    </label>
    <div class="photo-steps"><span>① 拍照</span><span>② AI 幻化 Q 版</span><span>③ 领图鉴编码</span><span>④ 海报可选</span></div>
    <div class="poster-note" style="margin-top:12px">✦ AI 幻化:照片交给云端 AI 画成 Q 版立绘(智谱 CogView · 全场免费;开着小桥更快更稳),约 10~20 秒;未联网 / 未配置时自动改用本机国风艺术化(约 1 秒,不上传)。</div>
  `, true);
}
function onPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type || "")) { alert("请选择图片文件"); return; }
  const reader = new FileReader();
  reader.onload = () => photoFlow(reader.result);
  reader.readAsDataURL(file);
}
async function photoFlow(dataURL, desc) {
  photoState = { photo: dataURL };
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>🎨 正在幻化精灵…</h3>
    <img src="${dataURL}" alt="文物照片" style="width:150px;border-radius:14px;display:block;margin:10px auto;border:1px solid #e6d8b8">
    <div class="wake-progress"><i id="wakeBar"></i></div>
    <p class="muted" id="wakeTip" style="text-align:center">✦ AI 手绘 Q 版立绘约 10~20 秒;连不上云端会自动改用本机国风卡(约 1 秒)</p>
  `, true);
  let pct = 6;
  const timer = setInterval(() => {
    pct = Math.min(90, pct + 0.9 + Math.random() * 1.7);
    const b = $("#wakeBar"); if (b) b.style.width = pct + "%";
  }, 200);
  let art = null;
  try { art = await withTimeout(aiImagine(dataURL, desc), 45000); } catch (e) { art = null; }
  if (!art) { try { art = await withTimeout(aiStylize(dataURL), 20000); } catch (e) { art = null; } }
  if (!art) { try { art = await localStylize(dataURL); } catch (e) { art = null; } }
  await sleepMs(500);
  clearInterval(timer);
  const bar = $("#wakeBar"); if (bar) bar.style.width = "100%";
  await sleepMs(240);
  if (!art) { alert("生成失败了,换一张照片再试试~"); openPhoto(); return; }
  photoState.art = art.art || art.img;
  photoState.preview = art.img || art.art;
  photoState.src = art.src || "local";
  photoState.engine = art.engine || "";
  photoState.temp = !!art.temp;
  photoState.no = art.no || nextCustomNo();
  wakeFormStep();
}
/* 云端 AI(可选):配了 AI_PHOTO_API.url 才调用;任何失败都返回 null,由本机幻化兜底 */
async function aiStylize(dataURL) {
  const api = AI_PHOTO_API || {};
  if (!api.url) return null;
  try {
    const res = await fetch(api.url, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, api.key ? { "Authorization": "Bearer " + api.key } : {}),
      body: JSON.stringify({ image: dataURL, prompt: api.prompt || "" })
    });
    if (!res.ok) return null;
    const j = await res.json();
    const img = j && (j.image || j.dataURL || j.data_url || j.url);
    if (!img || typeof img !== "string") return null;
    if (!/^data:image\//.test(img)) await loadImgUrl(img);
    return { img, src: "ai", no: nextCustomNo() };
  } catch (e) { return null; }
}
/* 本机国风艺术化引擎:照片 → 宣纸设色 + 淡墨描线 + 金线方卡(免联网,清晰不糊)
   注:本机只做「艺术化纪念卡」;真 Q 版手绘立绘走云端图像模型(见 aiImagine) */
function inkWashPixels(idt, w, h) {
  const d = idt.data, n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const gy = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gy + (r - gy) * 1.10;
    g = gy + (g - gy) * 1.06;
    b = gy + (b - gy) * 0.93;
    r = 18 + r * 0.90 + 8;
    g = 17 + g * 0.89 + 4;
    b = 15 + b * 0.88 - 5;
    r = r < 0 ? 0 : r > 255 ? 255 : r;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    b = b < 0 ? 0 : b > 255 ? 255 : b;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
    lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const th = 30;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    const gx = -lum[p - w - 1] - 2 * lum[p - 1] - lum[p + w - 1] + lum[p - w + 1] + 2 * lum[p + 1] + lum[p + w + 1];
    const gyy = -lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1] + lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1];
    const m = Math.abs(gx) + Math.abs(gyy);
    if (m > th) {
      const a = Math.min(.34, .08 + (m - th) / 340 * .30), i4 = p * 4;
      d[i4] = d[i4] * (1 - a) + 66 * a;
      d[i4 + 1] = d[i4 + 1] * (1 - a) + 50 * a;
      d[i4 + 2] = d[i4 + 2] * (1 - a) + 35 * a;
    }
  }
}
/* 云端 AI 幻化(双后端,按钥匙自动分流):
   ① 本机小桥 /api/imagine(智谱免费 CogView:看图写词 → 出图 → 回传 base64)—— 成品图能直接离线存档,首选;
   ② 网页直连:智谱钥匙(id.secret)走免费 CogView;方舟钥匙(ark-)走 Seedream 5.0-flash 图生图;
   没钥匙 / 断网 / 失败时返回 null,由本机国风艺术化兜底 */
const IDENT_ARK_IMG = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const IDENT_IMG_MODEL = "doubao-seedream-5-0-flash-260915";
const IDENT_IMG_PROMPT = "第一张是用户拍摄的文物照片,第二张是本游戏已有精灵的画风参考。请把第一张照片里的文物,画成第二张那种 Q 版卡通精灵立绘:圆润夸张的卡通比例,大眼睛与拟人小表情,厚涂国风插画质感,米白纸底,柔和光影,居中全身,只画文物本身,无人物、无文字、无水印";
let aiImagineOff = false;   /* 本轮已确认 AI 幻化不可用(无钥匙 / 未开通)→ 不再重复探测 */
let aiStyleRefP = null;     /* 画风参考立绘(现有精灵)懒加载缓存 */
function dataUrlShrink(src, maxPx, q) {   /* 等比缩到 maxPx 内并转 JPEG dataURL,控制请求与存储体积 */
  return loadImgUrl(src).then(im => {
    const r = Math.min(1, maxPx / Math.max(im.width, im.height));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(im.width * r));
    cv.height = Math.max(1, Math.round(im.height * r));
    const c = cv.getContext("2d");
    c.fillStyle = "#fdf8ec"; c.fillRect(0, 0, cv.width, cv.height);
    c.imageSmoothingQuality = "high";
    c.drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", q || .9);
  });
}
/* CogView 成品图右下角带「AI生成」小角标:裁掉底部 8% 再压成 JPEG(底色补米白,避免黑边) */
function zhipuTrimWatermark(src) {
  return loadImgUrl(src).then(im => {
    const cut = Math.max(24, Math.round(im.height * 0.08));
    const h2 = Math.max(1, im.height - cut);
    const cv = document.createElement("canvas");
    cv.width = im.width; cv.height = h2;
    const c = cv.getContext("2d");
    c.fillStyle = "#fdf8ec"; c.fillRect(0, 0, cv.width, h2);
    c.imageSmoothingQuality = "high";
    c.drawImage(im, 0, 0, im.width, h2, 0, 0, cv.width, h2);
    return cv.toDataURL("image/jpeg", .92);
  });
}
/* ① 本机小桥出图(智谱免费链):回传就是 base64,能直接进存档 */
async function aiImagineBridge(dataURL, desc) {
  try {
    if (IDENT.cloud !== "on") await identCloudPing();
    if (IDENT.cloud !== "on" || (IDENT.cloudInfo && IDENT.cloudInfo.hasKey === false)) return null;
    const photo = await dataUrlShrink(dataURL, 1024, .85);
    const r = await identFetchCloud(IDENT_CLOUD_API + "/api/imagine", { image: photo, desc: String(desc || "").slice(0, 200) }, 70000);
    if (!r || !r.ok || !r.image) return null;
    let img = r.image;
    try { img = await zhipuTrimWatermark(img); }
    catch (e) { try { img = await dataUrlShrink(r.image, 1024, .92); } catch (e2) { img = r.image; } }
    return { img: img, src: "ai", engine: r.engine || "cloud" };
  } catch (e) { return null; }
}
/* ② 网页直连智谱(免费):视觉写词(只看文物本身)→ CogView 出图 → 尽量抓成 base64(抓不动用临时链接) */
async function aiImagineZhipu(dataURL, desc, key) {
  let photo = "";
  try { photo = await dataUrlShrink(dataURL, 1024, .85); } catch (e) { photo = dataURL || ""; }
  let subject = "";
  if (photo) {
    const ask = "照片里是一件中国文物。忽略照片中的人物、版式、背景、文字与水印,只看文物本身:用 30~60 个字描述它的造型、颜色、材质和最醒目的特征,作为一句「Q版游戏立绘主角」提示词的素材;只输出这一句,不要解释。";
    for (const vm of IDENT_ZHIPU_VIS) {
      try {
        const j = await identFetchCloud(IDENT_ZHIPU_URL, {
          model: vm,
          messages: [{ role: "user", content: [
            { type: "text", text: ask },
            { type: "image_url", image_url: { url: photo } }
          ] }],
          temperature: 0.5,
          max_tokens: 220
        }, 40000, key);
        const md = j && j.choices && j.choices[0] ? j.choices[0].message : null;
        let t = md ? (md.content || "") : "";   // 只看正文:思考链里的草稿不能拿来写词
        if (Array.isArray(t)) t = t.map(p => (p && p.text) || "").join("");
        if (!(j && j.error) && typeof t === "string" && t.trim()) { subject = t.trim().split("\n")[0].slice(0, 140); break; }
      } catch (e) {}
    }
  }
  const base = subject || String(desc || "").slice(0, 140);
  if (!base) return null;
  const prompt = base + "。画成 Q 版游戏精灵立绘:圆润夸张的大头可爱比例,大眼睛与拟人小表情,厚涂国风插画质感,清晰描边,米白纯色背景,居中全身,画面里只有它一个角色,没有人物、没有文字、没有水印";
  let bad = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(IDENT_ZHIPU_IMG, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: "cogview-3-flash", prompt: prompt, size: "1024x1024" })
      });
      if (!res.ok) { if (res.status === 401 || res.status === 403) { bad = true; break; } continue; }
      const j = await res.json();
      const url = (j && j.data && j.data[0] && j.data[0].url) || "";
      if (!url) continue;
      try {   /* 抓成 base64 存档最稳;抓不动就用临时链接(能显示,约 7 天有效) */
        const b = await fetch(url);
        const blob = await b.blob();
        const raw = await new Promise(rs => { const rd = new FileReader(); rd.onload = () => rs(rd.result); rd.readAsDataURL(blob); });
        const img = await zhipuTrimWatermark(raw);
        return { img: img, src: "ai", engine: "zhipu" };
      } catch (e2) {
        return { img: url, src: "ai", engine: "zhipu", temp: true };
      }
    } catch (e) {}
  }
  if (bad) aiImagineOff = true;
  return null;
}
/* ③ 网页直连方舟 Seedream 图生图(照片 + 现有精灵立绘当画风参考,配了 ark- 钥匙才走这里) */
async function aiImagineArk(dataURL, desc, key) {
  let photo = "";
  try { photo = await dataUrlShrink(dataURL, 1024, .85); } catch (e) { photo = dataURL || ""; }
  if (!aiStyleRefP) aiStyleRefP = dataUrlShrink("精灵/tielion.webp", 640, .85).catch(() => "");
  const ref = await aiStyleRefP;
  let bad = false;   /* 明确不可用(401/403/404)才停用;纯网络抖动下次还可再试 */
  const tryOne = async (prompt, image) => {
    const body = { model: IDENT_IMG_MODEL, prompt: prompt, response_format: "b64_json", watermark: false };
    if (image) body.image = image;
    const res = await fetch(IDENT_ARK_IMG, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify(body)
    });
    if (!res.ok) { if (res.status === 401 || res.status === 403 || res.status === 404) bad = true; return null; }
    const j = await res.json();
    const it = (j && j.data && j.data[0]) || {};
    let raw = it.b64_json ? "data:image/png;base64," + it.b64_json : "";
    if (!raw && it.url) {
      try {
        const b = await fetch(it.url);
        const blob = await b.blob();
        raw = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(blob); });
      } catch (e) {}
    }
    if (!raw) return null;
    try { return await dataUrlShrink(raw, 1024, .92); } catch (e) { return raw; }
  };
  const prompt = IDENT_IMG_PROMPT + (desc ? "。文物资料:" + desc : "");
  const plans = [];
  if (photo && ref) plans.push([prompt, [photo, ref]]);
  if (photo) plans.push([prompt, photo]);
  if (desc) plans.push(["按以下文物资料画一只 Q 版卡通精灵立绘:圆润夸张的卡通比例,大眼睛与拟人小表情,厚涂国风插画质感,米白纸底,居中全身,无文字无水印。文物资料:" + desc, null]);
  for (let i = 0; i < plans.length; i++) {
    try { const img = await tryOne(plans[i][0], plans[i][1]); if (img) return { img: img, src: "ai", engine: "ark" }; } catch (e) {}
    if (bad) break;
  }
  if (bad) aiImagineOff = true;
  return null;
}
/* 总入口:小桥优先(存档最稳)→ 直连(智谱免费 / 方舟 Seedream)→ 返回 null 交给本机兜底 */
async function aiImagine(dataURL, desc) {
  if (aiImagineOff) return null;
  const viaBridge = await aiImagineBridge(dataURL, desc);
  if (viaBridge) return viaBridge;
  const key = (typeof identDirectKey === "function") ? identDirectKey() : "";
  if (!key) { aiImagineOff = true; return null; }
  try {
    if (identKeyKind(key) === "zhipu") return await aiImagineZhipu(dataURL, desc, key);
    return await aiImagineArk(dataURL, desc, key);
  } catch (e) { return null; }
}
async function localStylize(photoSrc) {
  const im = await loadImgUrl(photoSrc);
  const S = 900, PX = 90, PY = 112, PW = 720, PH = 664;
  const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fbf4e3"; ctx.fillRect(0, 0, S, S);
  let paper = null;
  try { paper = await loadImgUrl("装饰/宣纸纹.webp"); } catch (e) {}
  if (paper) { ctx.globalAlpha = .55; for (let y = 0; y < S; y += 256) for (let x = 0; x < S; x += 256) ctx.drawImage(paper, x, y); ctx.globalAlpha = 1; }
  const tw = PW, th = PH;
  const tmp = document.createElement("canvas"); tmp.width = tw; tmp.height = th;
  const tc = tmp.getContext("2d");
  const ir = im.width / im.height, tr = tw / th;
  let sw = im.width, sh = im.height, sx = 0, sy = 0;
  if (ir > tr) { sw = im.height * tr; sx = (im.width - sw) / 2; } else { sh = im.width / tr; sy = (im.height - sh) / 2; }
  tc.imageSmoothingQuality = "high";
  tc.drawImage(im, sx, sy, sw, sh, 0, 0, tw, th);
  try { const idt = tc.getImageData(0, 0, tw, th); inkWashPixels(idt, tw, th); tc.putImageData(idt, 0, 0); } catch (e) {}
  ctx.save(); posterRoundRect(ctx, PX, PY, PW, PH, 30); ctx.clip();
  ctx.drawImage(tmp, 0, 0, tw, th, PX, PY, PW, PH);
  if (paper) {
    ctx.globalAlpha = .16; ctx.globalCompositeOperation = "multiply";
    for (let y = PY; y < PY + PH; y += 256) for (let x = PX; x < PX + PW; x += 256) ctx.drawImage(paper, x, y);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }
  const vg = ctx.createRadialGradient(S / 2, S / 2, S * .22, S / 2, S / 2, S * .62);
  vg.addColorStop(0, "rgba(255,244,220,0)");
  vg.addColorStop(1, "rgba(94,64,28,.16)");
  ctx.fillStyle = vg; ctx.fillRect(PX, PY, PW, PH);
  ctx.restore();
  posterRoundRect(ctx, PX - 10, PY - 10, PW + 20, PH + 20, 40);
  ctx.strokeStyle = "rgba(201,162,39,.9)"; ctx.lineWidth = 6; ctx.stroke();
  posterRoundRect(ctx, PX - 22, PY - 22, PW + 44, PH + 44, 48);
  ctx.strokeStyle = "rgba(142,50,32,.35)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = "#8e3220"; ctx.font = posterFont(40, "bold");
  ctx.fillText("文物精灵 · 打卡唤醒", PX - 8, 78);
  const no = nextCustomNo();
  ctx.fillStyle = "#a8391f"; ctx.font = posterFont(34, "bold");
  ctx.fillText("图鉴编号 " + no, PX - 6, 846);
  ctx.textAlign = "right"; ctx.fillStyle = "#8a6d3b"; ctx.font = posterFont(24);
  ctx.fillText("本机国风艺术化", S - PX, 846);
  ctx.textAlign = "left";
  try { const seal = await loadImgUrl("装饰/印章.webp"); ctx.globalAlpha = .92; ctx.drawImage(seal, S - 160, 22, 100, 100); ctx.globalAlpha = 1; } catch (e) {}
  /* 干净方图:做图鉴立绘 / 头像(无文字无外框) */
  const art = document.createElement("canvas"); art.width = 720; art.height = 720;
  const ac = art.getContext("2d");
  ac.fillStyle = "#fbf4e3"; ac.fillRect(0, 0, 720, 720);
  if (paper) { ac.globalAlpha = .5; for (let y = 0; y < 720; y += 256) for (let x = 0; x < 720; x += 256) ac.drawImage(paper, x, y); ac.globalAlpha = 1; }
  ac.save(); posterRoundRect(ac, 16, 40, 688, 640, 24); ac.clip();
  ac.drawImage(tmp, 0, 0, tw, th, 16, 40, 688, 640);
  if (paper) {
    ac.globalAlpha = .16; ac.globalCompositeOperation = "multiply";
    for (let y = 40; y < 680; y += 256) for (let x = 16; x < 704; x += 256) ac.drawImage(paper, x, y);
    ac.globalCompositeOperation = "source-over"; ac.globalAlpha = 1;
  }
  ac.restore();
  ac.lineWidth = 3; ac.strokeStyle = "rgba(201,162,39,.7)";
  posterRoundRect(ac, 16, 40, 688, 640, 24); ac.stroke();
  return { img: cv.toDataURL("image/jpeg", .93), art: art.toDataURL("image/jpeg", .9), src: "local", no: no };
}
function wakeFormStep() {
  const st = photoState;
  if (!st || !st.art) { openPhoto(); return; }
  const no = st.no || nextCustomNo();
  const pOpts = Object.entries(ATTRIBUTES.primary).map(([k, a]) => `<option value="${k}">${a.name}</option>`).join("");
  const sOpts = Object.entries(ATTRIBUTES.secondary).map(([k, a]) => `<option value="${k}">${a.name}</option>`).join("");
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>🎨 幻化完成 · 领取图鉴编码</h3>
    <div class="wake-preview">
      <img src="${st.preview || st.art}" alt="Q 版立绘预览">
      <div class="wake-side">
        <div class="muted" style="margin-bottom:4px">${st.src === "ai" ? ("✦ AI 手绘 Q 版立绘(" + (st.engine === "zhipu" ? "智谱 CogView · 免费" : st.engine === "ark" ? "方舟 Seedream" : "云端") + (st.temp ? " · 临时链接" : "") + ")") : "✦ 本机国风艺术化(离线兜底)"}</div>
        <div class="wake-no">🔖 图鉴编码:<b>${no}</b><br><span class="muted">领取后永久保留,做海报时直接可选</span></div>
        <label>给它起个名字
          <input id="wakeName" maxlength="12" placeholder="例:青铜小神兽">
        </label>
        <label>主属性(材质)
          <select id="wakeP">${pOpts}</select>
        </label>
        <label>副属性(用途)
          <select id="wakeS">${sOpts}</select>
        </label>
        <label>想在海报上印的一句话(可选)
          <textarea id="wakeWords" rows="2" maxlength="60" placeholder="例:我在河北博物院亲手唤醒的第一只精灵"></textarea>
        </label>
      </div>
    </div>
    <div class="actions">
      <button class="btn gold" onclick="wakeConfirm()">🔖 领取图鉴编码,唤醒它!</button>
      <button class="btn ghost" onclick="openPhoto()">📷 重拍一张</button>
    </div>
  `, true);
  const pSel = $("#wakeP"), sSel = $("#wakeS");
  if (pSel) pSel.value = "ceramic";
  if (sSel) sSel.value = "household";
}
function wakeConfirm() {
  if (!photoState || !photoState.art) { openPhoto(); return; }
  const st = photoState;
  const name = (($("#wakeName") && $("#wakeName").value) || "").trim() || "神秘文物";
  const p = ($("#wakeP") && $("#wakeP").value) || "ceramic";
  const s2 = ($("#wakeS") && $("#wakeS").value) || "household";
  const words = (($("#wakeWords") && $("#wakeWords").value) || "").trim();
  const now = new Date();
  const dateStr = now.getFullYear() + "年" + (now.getMonth() + 1) + "月" + now.getDate() + "日";
  const no = st.no || nextCustomNo();
  const id = "my" + now.getTime().toString(36);
  const c = {
    id, no, name, primary: p, secondary: s2, img: st.art, src: st.src || "local", born: now.getTime(),
    era: "拍照唤醒 · " + dateStr,
    intro: words || ("我在博物馆拍下它,「文物精灵」把它唤醒成一只新精灵——编号 " + no + "," + name + "。"),
    history: words || ("它由一张打卡照片唤醒," + dateStr + " 来到「文物精灵」,住进图鉴页的「我点亮的文物」栏目(不占我的精灵收集数)。"),
    trivia: words || ("它是被你拍下、幻化唤醒的新文物精灵,编号 " + no + ";扫二维码,还能在图鉴里找到它。")
  };
  CUSTOMS.push(c);
  registerCustoms();
  saveCustoms();
  photoState = null;
  render();
  wakeDoneStep(id);
}
function wakeDoneStep(id) {
  const c = customById(id);
  if (!c) return;
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>🎉 ${c.name} 已唤醒!</h3>
    <div class="wake-preview">
      <img src="${c.img}" alt="新唤醒的文物精灵">
      <div class="wake-side">
        <div class="wake-no">🔖 图鉴编码:<b>${c.no}</b></div>
        <p class="muted" style="margin:0;line-height:1.9">它住进了「文物图鉴」下面的「我点亮的文物」栏目(不占我的精灵收集数);<br>打开 AI 打卡海报,精灵列表里就能直接选到 <b>${c.no}</b>。</p>
      </div>
    </div>
    <div class="actions">
      <button class="btn gold" onclick="closeOverlay();posterFromSpirit('${id}')">🤳 去做它的打卡海报</button>
      <button class="btn" onclick="closeOverlay();location.hash='#/spirit/${id}'">看看它的档案</button>
      <button class="btn ghost" onclick="closeOverlay()">留着,待会儿再说</button>
    </div>
  `, true);
}

/* =========================================================
   对战:选出战精灵 → 回忆 → 双方登场 → AI 出题 → 骰子 → 捕捉
   2D 舞台:精灵从卡牌中弹出(赛尔号式)
   ========================================================= */
let B = null;

/* ---------------- 选择出战精灵 ---------------- */
function openBattle(id) {
  const foe = SPIRITS[id];
  if (!foe) return;
  if (spiritLocked(id)) {
    overlay(`<button class="close" onclick="closeOverlay()">✕</button>
      <h3>🔒 「第零站 · 华夏」还没开启</h3>
      <p class="muted">集齐其余 ${STATIONS.length - 1} 个站点的全部精灵后,才能向这里的精灵发起挑战。当前进度:已集齐 <b>${huaxiaProgress()}</b> / ${STATIONS.length - 1} 站。</p>
      <button class="btn" onclick="closeOverlay();location.hash='#/station/huaxia'">去看看第零站</button>`);
    return;
  }
  const mine = Object.values(SPIRITS).filter(s => isCaptured(s.id) && !s.custom);
  if (!mine.length) { alert("你还没有可出战的精灵,先去打卡唤醒一只吧!"); return; }
  overlay(`
    <button class="close" onclick="closeOverlay()">✕</button>
    <h3>选择出战精灵</h3>
    <p class="muted">迎战「${foe.name}」·${ATTRIBUTES.primary[foe.primary].name}。每只精灵都有由<b>主属性</b>决定的独门特性,挑一只合适的上场吧。</p>
    <div class="pick-grid">
      ${mine.map(s => {
        const t = TRAITS[s.primary];
        return `<div class="pick-card${decorCls(s)}" onclick="startBattle('${id}','${s.id}')">
          ${spiritImg(s.id, "", s.name)}
          <div class="nm">${s.name}</div>
          <div class="badges">${attrBadge("primary", s.primary)}</div>
          <div class="trait"><b>【${t.name}】</b>${t.desc}</div>
        </div>`;
      }).join("")}
    </div>
  `);
}

/* ---------------- 开战 ---------------- */

/* 对战题库:精灵自己的题与通识题交替排列,保证约一半题目考它自己(出土、尺寸……) */
function buildBattlePool(s) {
  const own = shuffle(s.quiz.map(q => Object.assign({}, q, { self: true })));
  const com = shuffle(COMMON_QUIZ.slice());
  const out = [];
  for (let i = 0; i < Math.max(own.length, com.length); i++) {
    if (i < own.length) out.push(own[i]);
    if (i < com.length) out.push(com[i]);
  }
  return out;
}

function startBattle(id, myId) {
  const s = SPIRITS[id];
  if (!s) return;
  if (!myId) { openBattle(id); return; }
  const my = SPIRITS[myId], t = TRAITS[my.primary];
  const bonus = my.primary === "bronze" ? 2 : 0;
  B = {
    id, s, myId, my, trait: t, tkey: my.primary,
    spiritHp: BATTLE.spiritHp, spiritMax: BATTLE.spiritHp,
    myHp: BATTLE.playerHp + bonus, myMax: BATTLE.playerHp + bonus,
    phase: "comic", comicI: 0,
    pool: buildBattlePool(s), qIndex: 0,
    cur: null, chosen: -1,
    dice: null, diceWho: null,
    correctCount: 0, revived: false, hintUsed: false, hintIdx: -1,
    win: false, shell: false, logs: []
  };
  paintBattle();
}

function nextQuestion() {
  if (B.qIndex >= B.pool.length) { B.pool = buildBattlePool(B.s); B.qIndex = 0; }
  B.cur = B.pool[B.qIndex++];
  // 书画 · 文心雕龙:每场一次,自动划掉一个错误选项
  B.hintIdx = -1;
  if (B.tkey === "painting" && !B.hintUsed) {
    const wrongs = [0, 1, 2, 3].filter(i => i !== B.cur.answer);
    B.hintIdx = wrongs[Math.floor(Math.random() * wrongs.length)];
    B.hintUsed = true;
  }
}

/* 我把骰子滚两次、取大、保底、加成,都塞在这里 */
function rollAttack() {
  const nat = d6();
  let v = nat;
  if (B.tkey === "wood") v = Math.max(v, d6());        // 灵巧上身
  if (B.tkey === "textile") v = Math.max(v, 2);        // 柔韧轻盈
  if (B.tkey === "gold") v += 1;                       // 锋芒毕露
  if (B.tkey === "ceramic" && v >= 5) v += 2;          // 釉色生辉
  if (B.tkey === "glass" && nat === 6) v *= 2;         // 晶莹剔透
  B.lastNat = nat;
  return v;
}

/* 残血捕捉线:血量降到 30% 以内即可直接捕捉 */
const catchLine = () => Math.ceil(BATTLE.spiritHp * BATTLE.captureThreshold);
const isWeak = () => B.spiritHp > 0 && B.spiritHp <= catchLine();

/* ---------------- 2D 舞台 ---------------- */
function stageHTML() {
  const s = B.s, my = B.my;
  return `
    <div class="stage">
      <div class="unit foe" id="unitFoe">
        <div class="nametag">${s.name}</div>
        <div class="hpbar foe"><i id="hpFoe"></i><span id="hpFoeTxt"></span></div>
        <div class="body"><span class="card"></span><span class="flip">${battleImg(s.id, s.name)}</span></div>
        <div class="shadow"></div>
      </div>
      <div class="unit mine" id="unitMine">
        <div class="nametag">${my.name} <em>${B.trait.name}</em></div>
        <div class="hpbar"><i id="hpMine"></i><span id="hpMineTxt"></span></div>
        <div class="body"><span class="card"></span><span class="flip">${battleImg(my.id, my.name)}</span></div>
        <div class="shadow"></div>
      </div>
    </div>`;
}

/* 只更新舞台:血条、残血抖动,不重建 DOM(否则动画会重播) */
function updateStage() {
  const w = (id, pct) => { const e = document.getElementById(id); if (e) e.style.width = Math.max(0, pct) + "%"; };
  const tx = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  w("hpMine", B.myHp / B.myMax * 100);
  w("hpFoe", B.spiritHp / B.spiritMax * 100);
  tx("hpMineTxt", Math.max(0, B.myHp) + "/" + B.myMax);
  tx("hpFoeTxt", Math.max(0, B.spiritHp) + "/" + B.spiritMax);
  const foe = document.getElementById("unitFoe");
  if (foe && foe.classList && foe.classList.toggle) foe.classList.toggle("weak", isWeak());
}

/* 给精灵挂一个一次性动画 class */
const ANIM_CLS = ["enter", "attack-mine", "attack-foe", "hurt", "heal"];
function animUnit(elId, cls, ms = 640) {
  const el = document.getElementById(elId);
  if (!el || !el.classList) return;
  ANIM_CLS.forEach(c => { if (c !== cls) el.classList.remove(c); });
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function paintBattle() {
  const s = B.s, my = B.my;

  if (B.phase === "comic") {
    const scenes = ["🏛️", "🖌️", "🔥", "⛵", "🌊", "📜"];
    overlay(`
      <button class="close" onclick="closeOverlay()">✕</button>
      <h3>📖 ${s.name} 的回忆</h3>
      <div class="comic-dots">${s.comic.map((_, k) => `<i class="${k === B.comicI ? "on" : ""}"></i>`).join("")}</div>
      <div class="comic-panel">
        <div class="comic-scene">${scenes[B.comicI % scenes.length]}</div>
        <div class="comic-text">${s.comic[B.comicI]}</div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn ghost" ${B.comicI === 0 ? "disabled" : ""} onclick="battleComic(-1)">上一幕</button>
        <button class="btn" onclick="battleComic(1)">${B.comicI === s.comic.length - 1 ? "回忆结束 · 出战" : "下一幕"}</button>
      </div>`);
    return;
  }

  // 舞台只建一次,后续只换下半部分的内容
  if (!B.shell) {
    overlay(`
      <button class="close" onclick="closeOverlay()">✕</button>
      ${stageHTML()}
      <div id="battleBody"></div>
      <div class="log" id="battleLog"></div>
    `, true);
    B.shell = true;
    animUnit("unitMine", "enter", 820);
    animUnit("unitFoe", "enter", 820);
  }
  $("#battleBody").innerHTML = battleBodyHTML();
  $("#battleLog").innerHTML = B.logs.slice(-6).map(t => "· " + t).join("<br>")
    || `<span class="muted">你的 ${my.name} 已经登场 · 特性【${B.trait.name}】</span>`;
  updateStage();
}

function battleBodyHTML() {
  const s = B.s, my = B.my;
  const myTag = `<b>${my.name}</b>`;

  if (B.phase === "intro") {
    return `
      <p class="vs-line">「我上!」${myTag} 从精灵球里蹦了出来。</p>
      <p class="vs-line">「哼,我是 <b>${s.name}</b>。${s.intro}」</p>
      <button class="btn" style="width:100%;margin-top:12px" onclick="battleToExaminer()">继续 ▶</button>`;
  }

  if (B.phase === "examiner") {
    return `
      <div class="examiner">
        <div class="av">AI</div>
        <div><b>${AI_EXAMINER.title}</b><div class="tt">${AI_EXAMINER.greet}</div></div>
      </div>
      <div class="muted" style="line-height:1.9">
        · ${s.name} 有 <b>${BATTLE.spiritHp}</b> 血,${myTag} 有 <b>${B.myMax}</b> 血<br>
        · 答对:${myTag} 掷骰子攻击,点数就是伤害<br>
        · 答错:${s.name} 直接反击,你扣 <b>1</b> 血<br>
        · 打到 <b>残血(≤${catchLine()} 血)</b> 就能捕捉;血量归零也照抓<br>
        · ${myTag} 的特性【${B.trait.name}】:${B.trait.desc}
      </div>
      <button class="btn" style="width:100%;margin-top:12px" onclick="battleAsk()">开始答题 ▶</button>`;
  }

  if (B.phase === "asking") {
    return `
      <div class="examiner">
        <div class="av">AI</div>
        <div><b>${AI_EXAMINER.title}</b><div class="tt typing">正在随机出题<i></i><i></i><i></i></div></div>
      </div>`;
  }

  if (B.phase === "question" || B.phase === "rolling") {
    const q = B.cur;
    let diceBlock = "";
    if (B.chosen >= 0) {
      diceBlock = B.diceWho === "mine"
        ? `<div class="dice-wrap">
             <div class="dice ${B.phase === "rolling" ? "roll" : ""}" id="dice">${B.dice ?? "🎲"}</div>
             ${B.dice && B.phase !== "rolling"
               ? `<div class="dice-result hit">${my.name} 掷出 ${B.dice} 点,对 ${s.name} 造成 ${B.dice} 点伤害!</div>` : ""}
           </div>`
        : `<div class="dice-result hurt" style="text-align:center;padding:8px 0">${s.name} 直接反击,你 ${B.myHp <= 0 ? "被打倒了" : "-1 血"}</div>`;
    }
    return `
      <div class="examiner">
        <div class="av">AI</div>
        <div><b>${AI_EXAMINER.title}</b><div class="tt">第 ${B.qIndex} 题 · ${B.cur && B.cur.self ? "它自己的知识" : "通识题"}${B.hintIdx >= 0 && B.chosen < 0 ? " · 文心雕龙已划掉 1 项" : ""}</div></div>
      </div>
      <div class="q">${q.q}</div>
      ${isWeak() && B.chosen < 0 ? `
        <div class="catch-tip">💫 ${s.name} 已经残血,可以捕捉了!</div>
        <button class="btn gold" style="width:100%;margin-bottom:12px" onclick="captureNow()">🎯 捕捉 ${s.name}</button>` : ""}
      <div class="opts">
        ${q.options.map((o, i) => {
          let cls = "";
          const gone = i === B.hintIdx && B.chosen < 0;
          if (B.chosen >= 0) {
            if (i === q.answer) cls = "right";
            else if (i === B.chosen) cls = "wrong";
          }
          if (gone) cls = "gone";
          return `<button class="opt ${cls}" ${B.chosen >= 0 || gone ? "disabled" : ""} onclick="answer(${i})">
            <span class="k">${"ABCD"[i]}</span><span>${o}</span>
          </button>`;
        }).join("")}
      </div>
      ${B.chosen >= 0 ? diceBlock : ""}
      ${B.chosen >= 0 && B.phase !== "rolling" ? `<button class="btn" style="width:100%;margin-top:12px" onclick="battleNext()">继续下一题 ▶</button>` : ""}`;
  }

  if (B.phase === "over") {
    return B.win ? `
      <div class="result-big">
        <div class="em">🏆</div>
        <h3>捕捉成功!</h3>
        <p>${my.name} 把 ${s.name} 打到了残血,它认可了你。<br>已收入你的文物图鉴。</p>
        <div class="actions" style="justify-content:center">
          <button class="btn" onclick="closeOverlay();location.hash='#/codex'">查看图鉴</button>
          <button class="btn ghost" onclick="closeOverlay()">关闭</button>
        </div>
      </div>` : `
      <div class="result-big">
        <div class="em">💥</div>
        <h3>捕捉失败</h3>
        <p>${my.name} 被 ${s.name} 打倒了,再接再厉!<br>换一只特性更合适的精灵试试?</p>
        <div class="actions" style="justify-content:center">
          <button class="btn" onclick="startBattle('${s.id}')">再挑战一次</button>
          <button class="btn ghost" onclick="closeOverlay()">先退出</button>
        </div>
      </div>`;
  }
  return "";
}

function battleComic(d) {
  const s = B.s;
  const ni = B.comicI + d;
  if (ni >= s.comic.length) { B.phase = "intro"; paintBattle(); return; }
  B.comicI = Math.max(0, ni);
  paintBattle();
}
function battleToExaminer() { B.phase = "examiner"; paintBattle(); }

function battleAsk() {
  B.chosen = -1; B.dice = null; B.diceWho = null;
  B.phase = "asking";
  paintBattle();
  setTimeout(() => { nextQuestion(); B.phase = "question"; paintBattle(); }, 900);
}

function answer(i) {
  if (B.chosen >= 0) return;
  if (i === B.hintIdx) return;   // 被划掉的选项点不了
  B.chosen = i;
  if (i === B.cur.answer) {
    // 答对:我的精灵冲上去,掷骰子,点数 = 对精灵的伤害
    B.diceWho = "mine";
    B.phase = "rolling";
    B.logs.push(`答对!「${B.cur.q}」`);
    animUnit("unitMine", "attack-mine");
    setTimeout(() => animUnit("unitFoe", "hurt"), 280);
    paintBattle();
    animateDice(() => {
      const v = rollAttack();
      B.dice = v;
      B.spiritHp -= v;
      let note = "";
      if (B.tkey === "glass" && B.lastNat === 6) note = "(晶莹剔透·伤害翻倍!)";
      else if (B.tkey === "gold") note = "(锋芒毕露 +1)";
      else if (B.tkey === "ceramic" && v >= 5) note = "(釉色生辉 +2)";
      else if (B.tkey === "wood") note = "(灵巧上身·取大)";
      else if (B.tkey === "textile" && B.lastNat < 2) note = "(柔韧轻盈·保底)";
      B.logs.push(`${B.my.name} 掷出 ${v} 点${note},${B.s.name} -${v} 血`);
      // 玉器 · 温润养德
      B.correctCount++;
      if (B.tkey === "jade" && B.correctCount % 2 === 0 && B.myHp < B.myMax) {
        B.myHp++;
        animUnit("unitMine", "heal");
        B.logs.push("温润养德:回复 1 点血");
      }
      B.phase = "question";
      paintBattle();
    });
  } else {
    // 答错:精灵直接反击,我方扣 1 血(特性可能免疫 / 保命)
    B.diceWho = "foe";
    B.dice = null;
    let dmg = BATTLE.wrongPenalty, note = "";
    if (B.tkey === "stone" && Math.random() < 0.3) { dmg = 0; note = "(磐石之躯·完全免疫)"; }
    if (dmg > 0) {
      B.myHp -= dmg;
      animUnit("unitFoe", "attack-foe");
      setTimeout(() => animUnit("unitMine", "hurt"), 240);
      if (B.myHp <= 0 && B.tkey === "lacquer" && !B.revived) {
        B.myHp = 1; B.revived = true;
        if (note) note += " ";
        note += "(髹漆坚韧·保留 1 血)";
      }
    }
    B.logs.push(`答错。「${B.cur.q}」${B.s.name} 直接反击,你 -${dmg} 血${note}`);
    B.phase = "question";
    paintBattle();
  }
}

function animateDice(done) {
  const el = () => document.getElementById("dice");
  let n = 0;
  const t = setInterval(() => {
    const d = el(); if (d) d.textContent = d6();
    if (++n > 9) { clearInterval(t); done(); }
  }, 80);
}

function battleNext() {
  if (B.spiritHp <= 0) { win(); return; }
  if (B.myHp <= 0) { lose(); return; }
  battleAsk();
}
function win() {
  B.win = true; B.phase = "over"; addCaptured(B.id); paintBattle();
}
/* 残血直接捕捉 */
function captureNow() {
  B.logs.push(`你在 ${B.s.name} 残血时成功捕捉了它!`);
  B.win = true; B.phase = "over"; addCaptured(B.id); paintBattle();
}
function lose() { B.win = false; B.phase = "over"; paintBattle(); }

/* ================================================================
   AI 红舞狮「小答」· 全站悬浮窗(答疑 + 带路 + 出题考官 三合一)
   原「AI 精灵考官」已并入本窗:说「考考我」或点小胶囊,狮子现场出题判卷;
   踩梅花桩来回跳为纯 CSS 动效;可拖拽换位、点按开合;成绩本地留档。
   ================================================================ */
const AQ_KEY = (typeof SAVE_ID !== "undefined" && SAVE_ID) ? "wwjl_ask_v1::" + SAVE_ID : "wwjl_ask_v1";
const QZ_KEY = (typeof SAVE_ID !== "undefined" && SAVE_ID) ? "wwjl_quiz_v1::" + SAVE_ID : "wwjl_quiz_v1";
const AQ = { open: false, x: null, y: null, drag: null, n: 0 };
const QZ = { spirit: null, pool: [], cur: null, chosen: -1, phase: "idle", busy: false,
             qElId: "", qNo: 0, streak: 0, best: 0, total: 0, correct: 0, gen: 0 };
const AQ_LET = ["A", "B", "C", "D"];
const AQ_CHIPS = ["考考我!", "怎么打卡唤醒文物?", "带我去看沧州铁狮子", "铁狮子有什么来历?", "长信宫灯是什么?", "一共有多少精灵?", "怎么捕捉精灵?", "去沧州站看看", "第零站怎么开启?", "AI赋彩怎么玩?", "AI文物识别怎么玩?"];

function aqEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function aqNorm(s) { return String(s || "").replace(/\s+/g, "").toLowerCase(); }
function aqSave() { try { localStorage.setItem(AQ_KEY, JSON.stringify({ x: AQ.x, y: AQ.y })); } catch (e) {} }
function aqLoad() { try { return JSON.parse(localStorage.getItem(AQ_KEY)) || {}; } catch (e) { return {}; } }
function aqQuizSave() { try { localStorage.setItem(QZ_KEY, JSON.stringify({ best: QZ.best, total: QZ.total, correct: QZ.correct })); } catch (e) {} }
function aqQuizLoad() { try { return JSON.parse(localStorage.getItem(QZ_KEY)) || {}; } catch (e) { return {}; } }

function aqPush(role, html, id) {
  const box = document.getElementById("aqBody");
  if (!box) return;
  box.innerHTML += '<div class="aq-msg ' + role + '"' + (id ? ' id="' + id + '"' : "") + '><div class="aq-bub">' + html + '</div></div>';
  box.scrollTop = box.scrollHeight;
}
function aqFillin(id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<div class="aq-bub">' + html + '</div>';
  const box = document.getElementById("aqBody");
  if (box) box.scrollTop = box.scrollHeight;
}
function aqScorePaint() {
  const sc = document.getElementById("aqScore");
  if (sc) sc.textContent = "连对 " + QZ.streak + " · 最佳 " + QZ.best;
}

/* ---------------- 问答引擎(纯本地,免联网) ---------------- */
function aqFindSpirit(q) {
  const n = aqNorm(q);
  if (!n) return null;
  const all = Object.values(SPIRITS);
  let hit = null;
  all.forEach(s => { if (!hit && n.includes(aqNorm(s.name))) hit = s; });
  if (hit) return hit;
  let best = null, bestLen = 0;
  all.forEach(s => {
    const nm = aqNorm(s.name);
    for (let L = Math.min(nm.length, 5); L >= 3; L--) {
      if (n.includes(nm.slice(-L))) { if (L > bestLen) { best = s; bestLen = L; } break; }
    }
  });
  return best;
}
function aqFindStation(q) {
  const n = aqNorm(q);
  if (!n) return null;
  let hit = null;
  STATIONS.forEach(st => {
    if (hit) return;
    const short = (st.name.split("·").pop() || "").trim();
    if (n.includes(aqNorm(st.name)) || (short && n.includes(short + "站"))) { hit = st; return; }
    if (short && n.includes(short) && /去|逛|看看|有什么|有啥|哪些|什么文物|带我看|站/.test(n)) hit = st;
  });
  return hit;
}
const AQ_PAGES = [
  { k: ["图鉴", "文物图鉴", "我的精灵"], h: "#/codex", n: "文物图鉴" },
  { k: ["海报"], h: "#/poster", n: "AI 打卡海报" },
  { k: ["修复", "拼图"], h: "#/restore", n: "AI 文物修复" },
  { k: ["赋彩", "上色", "涂色", "填色"], h: "#/dye", n: "AI赋彩" },
  { k: ["识别", "识图", "鉴定", "扫描", "文物识别", "照片修复", "照片复原"], h: "#/ident", n: "AI 文物识别" },
  { k: ["博物馆"], h: "#/museums", n: "河北的博物馆" },
  { k: ["文创", "灵感"], h: "#/creative", n: "文创灵感" },
  { k: ["首页", "主页", "地图"], h: "#/", n: "首页 · 打卡地图" }
];
function aqFindPage(q) {
  const n = aqNorm(q);
  for (const p of AQ_PAGES) for (const k of p.k) if (n.includes(k)) return p;
  return null;
}
const AQ_HELP = [
  { k: ["怎么玩", "玩法", "攻略", "入门", "怎么开始", "怎么逛"], a: "这趟河北文物之旅的路线是:<b>首页 → 点开一个站点 → 「📷 打卡拍照 · 唤醒文物」→ 收进图鉴 → 挑战对战、捕捉收藏</b>。走累了回来找我,我还能出题考你,「考考我」就行!" },
  { k: ["打卡", "拍照", "唤醒", "幻化", "新文物"], a: "首页或任意站点页都有「<b>📷 打卡拍照 · 唤醒文物</b>」。拍下或选一张文物照片,AI 会把它幻化成 Q 版精灵,再发你一个专属图鉴编码。AI 幻化时照片会提交给云端图像模型(仅这一张,只用于生成立绘);<b>连不上云端时自动改用本机国风卡</b>,那时照片完全不出本机。" },
  { k: ["捕捉", "捉", "收服", "抓"], a: "对战里把野生精灵打到<b>残血</b>,就会出现「收下它」按钮;血打空也会自动把它收下。<b>答对题目</b>才能掷骰子出手,答错要挨一下反击——想练题感?说「考考我」,我陪你刷题!" },
  { k: ["对战", "挑战", "掷骰", "骰子", "答题", "打", "血"], a: "挑战流程:一段「回忆」动画 → AI 出题 → 答对掷骰子攻击(1~6 点,出战精灵的主属性还有特性加成)、答错被反击掉血。对面 30 血、你的精灵 6 血(青铜出战 +2);打到残血就能收下它!" },
  { k: ["修复"], a: "顶栏「AI 文物修复」:随机抽一件文物精灵,<b>16 / 32 / 64 块</b> 三档拼图,还能下载参考图和可裁剪拼图块,打印出来线下拼。拼完点「检查」,还会夸你!" },
  { k: ["赋彩", "上色", "涂色", "填色", "黑白"], a: "顶栏「AI赋彩」:36 幅 Q 版文物图稿都褪成了黑白——<b>点一下填一整块色、按住拖笔慢慢涂抹</b>,把颜色还给文物;「👁 按住看原图」能偷看答案,画完「💾 保存作品」收进相册,全程只在本机完成。" },
  { k: ["识别", "识图", "鉴定", "扫描", "照片修复", "照片复原"], a: "顶栏「AI 文物识别」:上传 / 拍一张文物照片,先<b>修</b>——去划痕裂纹、补细碎缺口、恢复原色、超分放大 2×,按住中间的滑块就能对比修复前后,可保存修复图;再<b>认</b>——云端 AI 报出它的<b>名字 / 年代 / 材质 / 出处 / 来历</b>,显示在页面最上方;本机引擎再给器型 / 纹样 / 年代 / 材质四项判断和「相近候选」,点开直接看档案讲解。云端没连上时,自动退回本机识别。" },
  { k: ["海报"], a: "顶栏「AI 打卡海报」:选一张照片 + 你点亮的文物,一键合成写实 / Q 版打卡海报,下载下来就能发朋友圈~" },
  { k: ["ai", "人工智能", "有什么功能", "功能", "亮点"], a: "站内的 AI 玩法有:<b>AI 幻化唤醒</b>(拍照变精灵)、<b>AI 打卡海报</b>、<b>AI 文物修复</b>拼图、<b>AI 赋彩</b>(给 Q 版文物上色)、<b>AI 文物识别</b>(照片修复对比 + 报名字来历、器型 / 年代识别),还有我——<b>答疑 + 带路 + 出题</b>一把抓的红舞狮小答 🦁" },
  { k: ["存档", "保存", "进度", "清空", "重置"], a: "进度都保存在本机浏览器里,正式版和测试版各存各的。想从头再来:打开「文物图鉴」拉到最底,点「清空进度」。" },
  { k: ["解锁", "隐藏", "秘密", "彩蛋"], a: "站里藏着一个「<b>第零站 · 华夏</b>」:把其余 12 个站点的精灵全部收齐,它就会自动开启——夏 → 清、十六朝各一件,都睡在那儿等你。" },
  { k: ["手机", "运行", "打开", "怎么用", "部署"], a: "手机浏览器直接打开就能玩,打卡拍照会调起相机;电脑上想更顺滑,用本地静态服务器(比如 8899 端口)打开效果最好。" },
  { k: ["编号", "勋章", "成就", "等级"], a: "每收下一只精灵,都会记进「文物图鉴」,按 <b>HB-编号</b> 编好档(第零站 · 华夏 是 HB-055 ~ HB-070,新增的金器、银器、宣纸、象棋是 HB-071 ~ HB-074);打卡拍照唤醒的新文物会从 HB-075 起往后排。" }
];
function aqAnswer(raw) {
  const q = String(raw || "").trim();
  const n = aqNorm(q);
  if (!n) return { text: "嗯?想问我什么都行呀~ 也可以点下面的小胶囊试试!" };

  if (/^(你好|您好|嗨|哈喽|hello|hi|早上好|下午好|晚上好)/.test(n)) return { text: "你好呀!我是<b>红舞狮小答</b>——踩着梅花桩给你答疑的小精灵 🦁 玩法、文物、站点尽管问;想练练手就说「<b>考考我</b>」!" };
  if (/你是谁|你叫什么|自我介绍|介绍一下你|你是干嘛|你会什么|能做什么/.test(n)) return { text: "我是<b>红舞狮小答</b>,以河北舞狮为原型、踩着梅花桩的 AI 小精灵。我<b>会答疑</b>(玩法 / 文物 / 站点)、<b>会带路</b>(说「带我去看××」直接跳页)、<b>会出题</b>(说「考考我」当场考你)!", };
  if (/^(谢谢|感谢|辛苦|棒|厉害|真好)/.test(n)) return { text: "嘿嘿,不客气!常来聊天呀~ 我就在右下角踩着桩等你 🧧" };

  const sp = aqFindSpirit(q);
  const st = aqFindStation(q);
  const shortName = st ? (st.name.split("·").pop() || "").trim() : "";
  const stStrong = !!st && n.includes("站") && (n.includes(aqNorm(st.name)) || (!!shortName && n.includes(shortName + "站")));
  const wantsGo = /带我去|带我看|看看|导航|打开|跳转|我想看|我要看|转转|逛逛|去这站|带路/.test(n);

  if (/第零站|隐藏站|隐藏款/.test(n)) {
    const all = STATIONS.length - 1, done = huaxiaProgress(), open = huaxiaUnlocked();
    return {
      text: open ? "🏮 「<b>第零站 · 华夏</b>」已经开启啦!夏 → 清、十六朝各一件的镇馆之宝都在里面,去一一唤醒吧~"
                  : "🏮 「<b>第零站 · 华夏</b>」是隐藏站点:把其余 <b>" + all + "</b> 个站点的精灵全部收齐,它就会自动开启。<br>当前已集齐 <b>" + done + " / " + all + "</b> 站。",
      go: { h: "#/station/huaxia", n: "去看看第零站" },
      nav: wantsGo ? "#/station/huaxia" : undefined
    };
  }

  if (st && st.secret && !huaxiaUnlocked() && (stStrong || !sp)) {
    const all = STATIONS.length - 1, done = huaxiaProgress();
    return {
      text: "🔒 「<b>" + st.name + "</b>」还在沉睡——把其余 <b>" + all + "</b> 个站点的精灵全部收齐,它才会开启。<br>当前已集齐 <b>" + done + " / " + all + "</b> 站。",
      go: { h: "#/station/huaxia", n: "去看看第零站" },
      nav: wantsGo ? "#/station/huaxia" : undefined
    };
  }
  if (st && (stStrong || !sp)) {
    const names = st.spiritIds.map(id => (SPIRITS[id] ? SPIRITS[id].name : "")).filter(Boolean);
    const got = st.spiritIds.filter(id => captured.indexOf(id) >= 0).length;
    return {
      text: "📍 <b>" + st.name + "</b>" + (st.place ? " · " + st.place : "") + "<br>" + (st.subtitle ? st.subtitle + "<br>" : "") +
            "这一站有 <b>" + names.length + "</b> 件宝物:" + names.join("、") + "。<br>你已经收下了 <b>" + got + "/" + names.length + "</b> 只——我这就带你去把它拍醒?",
      go: { h: "#/station/" + st.id, n: "带我去 " + (shortName || st.name) + " 站" },
      nav: wantsGo ? "#/station/" + st.id : undefined
    };
  }
  if (sp && spiritLocked(sp.id)) {
    const all = STATIONS.length - 1, done = huaxiaProgress();
    return {
      text: "🔒 「<b>" + sp.name + "</b>」还沉睡在第零站 · 华夏里。<br>把其余 <b>" + all + "</b> 个站点的精灵全部收齐,五千年长河才会开启(当前已集齐 <b>" + done + " / " + all + "</b> 站)。",
      go: { h: "#/station/huaxia", n: "去看看第零站" },
      nav: wantsGo ? "#/station/huaxia" : undefined
    };
  }
  if (sp) {
    const stn = rsStationName(sp.id);
    const no = rsNo(sp.id);
    const intro = String(sp.intro || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    const shot = intro.length > 64 ? intro.slice(0, 64) + "…" : (intro || "它是河北历史里的一件珍宝。");
    const know = /为什么|什么|啥|多少|多高|多重|多长|多大|哪(儿|里|个)|谁|何时|来历|由来|典故|故事|传说|历史|背景|用途|作用|价值|意义|特点/.test(n);
    return {
      text: "🔍 <b>" + sp.name + "</b>" + (no ? " · " + no : "") + (stn ? " · " + stn : "") + (sp.era ? " · " + sp.era : "") + "<br>" + shot +
            "要不要我现在带你去看看它?",
      go: { h: "#/spirit/" + sp.id, n: "带我去看它" },
      nav: wantsGo ? "#/spirit/" + sp.id : undefined,
      tryCloud: know || undefined   /* 问的是知识点(多重 / 什么来历…):先请云端讲透,这条简介当兜底 */
    };
  }
  if (/怎么玩|玩法|怎么用|攻略|入门/.test(n)) { for (const h of AQ_HELP.slice(1)) if (h.k.some(k => n.indexOf(k) >= 0)) return { text: h.a }; }
  if (aqFindPage(q)) {
    const pg = aqFindPage(q);
    return {
      text: "好的!「<b>" + pg.n + "</b>」就在顶栏里,点下面的按钮我直接给你带路~",
      go: { h: pg.h, n: "带我去「" + pg.n + "」" },
      nav: wantsGo ? pg.h : undefined
    };
  }
  if (/多少|几只|几个|一共|统计|共有|总数|全站/.test(n)) {
    const spirits = Object.keys(SPIRITS).filter(id => !isCustom(id)).length;
    const total = spirits + LEGENDS.length;
    const attrs = Object.keys(ATTRIBUTES.primary).length + Object.keys(ATTRIBUTES.secondary).length;
    const got = captured.filter(id => !isCustom(id)).length;
    return { text: "📊 小答的账本:全站共有 <b>" + total + "</b> 件文物精灵——<b>" + spirits + "</b> 只可捕捉,另有 " + LEGENDS.length + " 只「燕赵名片」只展不捉;打卡站点 <b>" + STATIONS.length + "</b> 个(含隐藏的第零站 · 华夏),属性 <b>" + attrs + "</b> 种。你现在已经收下了 <b>" + got + "</b> 只,继续加油!" };
  }
  for (const h of AQ_HELP) if (h.k.some(k => n.indexOf(k) >= 0)) return { text: h.a };
  return { text: "这个问题我暂时答不上来~🥲 换个问法试试;也可以问我:「怎么打卡唤醒文物」「带我去看铁狮子」「一共有多少精灵」;想练手就说「<b>考考我</b>」!", chips: true, miss: true };
}

/* ---------------- 云端大脑(智谱免费):本地答不上来时现场作答 ---------------- */
const AQ_CLOUD_SYS = "你是「文物精灵」(一款河北文物科普互动应用)里的 AI 小向导「红舞狮小答」,原型是河北舞狮的红色小狮子,踩着梅花桩,性格热情、俏皮又靠谱。用户会问你文物、博物馆、历史、文化的问题,也会问应用玩法。回答时请遵守:1) 只用中文,口语化、亲近,直接给答案,别客套、别反问;2) 篇幅 40~140 字,分 2~3 句;3) 只依据公认的史实和常识,不确定就坦率说「这个我还真不确定」,绝不编造;尤其是重量、尺寸、年代这类具体数字,只报有把握的,没把握就说记不准,别报错数;4) 与文物、历史、文化、本应用无关的问题,礼貌地把话题拉回文物;5) 不要用 Markdown 符号(如 #、*),最多带一两个小表情(如 🦁、🏮);6) 你就是小答,不要说自己是人工智能或语言模型。";
const AQ_HIST = [];   /* 最近几轮云端问答:让「它是谁发现的?」这类追问接得上上下文 */
function aqCloudFmt(text) {
  let s = String(text || "").replace(/\r/g, "").trim();
  if (s.length > 600) s = s.slice(0, 600) + "…";
  s = aqEsc(s);
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/^#{1,6}\s*/gm, "").replace(/^[\-\*\u2022]\s+/gm, "· ").replace(/^\s*>\s?/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
  return s.replace(/\n{3,}/g, "\n\n").replace(/\n/g, "<br>").trim();
}
async function aqCloudAsk(q, done) {
  const msgs = [{ role: "system", content: AQ_CLOUD_SYS }].concat(AQ_HIST.slice(-6), [{ role: "user", content: q }]);
  let text = "", used = "";
  try {   /* ① 本机小桥(最稳:钥匙留本机,响应带模型名) */
    const r = await identFetchCloud(IDENT_CLOUD_API + "/api/chat", { messages: msgs, temperature: 0.75, max_tokens: 700 }, 16000);
    if (r && r.ok && r.text) { text = r.text; used = r.model || "小桥"; }
  } catch (e) {}
  if (!text && identDirectKey()) {   /* ② 网页直连兜底(部分网络会被云端预检拦下,拦了就静默回退) */
    try { const d = await teaCloudDirect(msgs, 16000); text = d.text; used = d.model; } catch (e) {}
  }
  if (text) {
    AQ_HIST.push({ role: "user", content: q }, { role: "assistant", content: String(text).slice(0, 500) });
    if (AQ_HIST.length > 8) AQ_HIST.splice(0, AQ_HIST.length - 8);
  }
  done(text ? { text: text, model: used } : null);
}

/* ---------------- 出题考官(并入小答) ---------------- */
function aqQuizPick() {
  const pool = Object.values(SPIRITS).filter(s => !isCustom(s.id) && !spiritLocked(s.id));
  if (!pool.length) return;
  const i = Math.floor(Math.random() * pool.length) % pool.length;
  let s = pool[i];
  if (QZ.spirit && s.id === QZ.spirit.id && pool.length > 1) s = pool[(i + 1) % pool.length];
  QZ.spirit = s;
  QZ.pool = [];
}
function aqQuizGreet() {
  aqQuizPick();
  if (!QZ.spirit) return;
  const s = QZ.spirit, no = rsNo(s.id);
  QZ.phase = "idle"; QZ.cur = null; QZ.chosen = -1; QZ.pool = []; QZ.busy = false; QZ.gen++;
  const tally = (QZ.total > 0) ? "<br>你目前的战绩:累计答对 " + QZ.correct + "/" + QZ.total + " · 最佳连对 " + QZ.best + "。加油,刷新它!" : "";
  aqPush("ai", "🎓 好嘞!本场考官精灵是「<b>" + s.name + "</b>」" + (no ? "(" + no + ")" : "") + "。<br>它的自述题 + 文物通识题交替出,看看你能连对几题?" + tally +
    "<div class=\"aq-acts\"><button type=\"button\" class=\"aq-go\" onclick=\"aqQuizStart()\">▶ 开始答题</button><button type=\"button\" class=\"aq-go ghost\" onclick=\"aqQuizGreet()\">🎲 换一只考官</button></div>");
}
function aqQuizQuestionHTML(q, locked) {
  const opts = q.options.map((o, i) => {
    let cls = "aq-opt", dis = "";
    if (locked) {
      dis = " disabled";
      if (i === q.answer) cls += " right";
      else if (i === QZ.chosen) cls += " wrong";
      else cls += " dim";
    }
    return "<button type=\"button\" class=\"" + cls + "\"" + dis + " onclick=\"aqQuizAnswer(" + i + ")\"><b>" + AQ_LET[i] + "</b><span>" + o + "</span></button>";
  }).join("");
  return "<span class=\"aq-qn\">" + (q.self ? "🎋 考考这位考官自己" : "📜 文物通识") + " · 第 " + QZ.qNo + " 题</span><div class=\"aq-qtext\">" + q.q + "</div><div class=\"aq-opts\">" + opts + "</div>";
}
function aqQuizStart() {
  if (QZ.busy || !QZ.spirit) return;
  QZ.busy = true; QZ.phase = "waiting"; QZ.chosen = -1;
  const g = QZ.gen;
  const tid = "aqQ" + (++AQ.n);
  aqPush("ai", "<span class=\"aq-dots\"><i></i><i></i><i></i></span> AI 正在出题…", tid);
  setTimeout(() => {
    if (QZ.gen !== g) { aqFillin(tid, "考官换好啦,点「开始答题」继续~"); return; }
    if (!QZ.pool.length) QZ.pool = buildBattlePool(QZ.spirit).map(q => Object.assign({}, q));
    QZ.cur = QZ.pool.shift();
    QZ.qNo = QZ.total + 1;
    QZ.qElId = tid;
    QZ.busy = false; QZ.phase = "asking";
    aqFillin(tid, aqQuizQuestionHTML(QZ.cur, false));
  }, 520);
}
function aqQuizAnswer(i) {
  if (QZ.busy || QZ.phase !== "asking" || !QZ.cur) return;
  const q = QZ.cur, ok = (i === q.answer);
  QZ.chosen = i; QZ.busy = true; QZ.phase = "judging";
  QZ.total++;
  if (ok) { QZ.correct++; QZ.streak++; if (QZ.streak > QZ.best) QZ.best = QZ.streak; } else QZ.streak = 0;
  aqQuizSave(); aqScorePaint();
  aqPush("me", "我选:" + AQ_LET[i] + ". " + aqEsc(q.options[i]));
  aqFillin(QZ.qElId, aqQuizQuestionHTML(q, true));
  const tid = "aqQ" + (++AQ.n);
  aqPush("ai", "<span class=\"aq-dots\"><i></i><i></i><i></i></span> AI 正在判卷…", tid);
  setTimeout(() => {
    const tally = "累计答对 " + QZ.correct + "/" + QZ.total + (QZ.streak > 1 ? " · 连对 " + QZ.streak : "");
    aqFillin(tid,
      "<span class=\"aq-verdict " + (ok ? "ok" : "bad") + "\">" + (ok ? "✅ 答对啦!" : "❌ 答错了") + "</span>" +
      (ok ? "" : "正确答案是 <b>" + AQ_LET[q.answer] + ". " + q.options[q.answer] + "</b>。") +
      (q.tip ? "<br>📖 " + q.tip : "") +
      "<br><small class=\"aq-tally\">" + tally + "</small>");
    QZ.busy = false; QZ.phase = "verdict";
    aqScorePaint();
    aqPush("ai", "<div class=\"aq-acts\"><button type=\"button\" class=\"aq-go\" onclick=\"aqQuizStart()\">▶ 再来一题</button><button type=\"button\" class=\"aq-go ghost\" onclick=\"aqQuizGreet()\">🎲 换一只考官</button></div>");
  }, 430);
}

/* ---------------- 面板开关 / 拖拽 / 聊天 ---------------- */
function aqToggle() { AQ.open ? aqClose() : aqOpen(); }
function aqOpen() {
  const p = document.getElementById("aqPanel"), w = document.getElementById("aq");
  if (!p) return;
  p.hidden = false; p.style.display = ""; AQ.open = true;
  const tip = document.getElementById("aqTip");
  if (tip) { tip.classList.remove("show"); tip.classList.add("hide"); }
  try {
    const r = w.getBoundingClientRect();
    w.classList.toggle("flip", r.top < 470);   // 贴近顶部 → 面板向下展开
    w.classList.toggle("ql", r.left < 360);    // 贴近左侧 → 面板向右展开
  } catch (e) {}
  const body = document.getElementById("aqBody");
  if (body && !body.innerHTML) {
    aqPush("ai", "你好呀!我是 <b>红舞狮小答</b> 🦁——踩着梅花桩陪你逛河北文物的答疑小精灵。<br>问玩法、问文物、问站点都可以;文物知识也随便考我——答不上来的,我当场请教云端 AI!说「<b>带我去看铁狮子</b>」我直接带路,想练手就说「<b>考考我</b>」,我出题考你!");
    aqChipsPaint();
  }
}
function aqClose() {
  const p = document.getElementById("aqPanel");
  if (p) { p.hidden = true; p.style.display = "none"; }
  AQ.open = false;
}
function aqGo(h) {
  if (!h) return;
  try { location.hash = h; } catch (e) {}
  aqClose();
  setTimeout(() => {
    const t = document.getElementById("aqTip");
    if (t) {
      t.textContent = "已经带你到啦!再点我继续聊~";
      t.classList.remove("hide"); t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 3200);
    }
  }, 500);
}
function aqChipsPaint() {
  const c = document.getElementById("aqChips");
  if (!c) return;
  c.innerHTML = AQ_CHIPS.map(t => "<button type=\"button\" onclick=\"aqSend('" + t.replace(/'/g, "\\'") + "')\">" + t + "</button>").join("");
}
function aqSend(text) {
  text = String(text == null ? "" : text).trim();
  const inp = document.getElementById("aqIn");
  if (inp && typeof inp.value === "string") inp.value = "";
  if (!text) return;
  const n = aqNorm(text);
  aqPush("me", aqEsc(text));
  if (/考考我|考我|出题|做题|答题|测验|测试我|考试|quiz/.test(n)) { aqQuizGreet(); return; }
  let r = { text: "" };
  try { r = aqAnswer(text); } catch (e) { r = { text: "诶呀,脑袋打了个结…换个问法再试试?" }; }
  const tid = "aqQ" + (++AQ.n);
  /* 本地答不上来 / 问题带知识点:请云端 AI 现场作答(小桥优先);连不上再回退本机话术 */
  if (r.miss || r.tryCloud) {
    aqPush("ai", "<span class=\"aq-dots\"><i></i><i></i><i></i></span> 小答去云端翻书…", tid);
    aqCloudAsk(text, (cloud) => {
      let html;
      if (cloud && cloud.text) {
        html = aqCloudFmt(cloud.text) + "<br><small class=\"aq-tally\">☁️ 云端 AI 现场作答(" + aqEsc(cloud.model || "智谱") + " · 免费)</small>";
      } else {
        html = r.text || "诶呀,这个问题我暂时答不上来…换个问法再试试?";
        if (r.miss) html += "<br><small class=\"aq-tally\">☁️ 云端这次没接上:本机开着 tools/ident_cloud.py 小桥、或粘一次 AI 钥匙,我就能现场查资料啦~</small>";
      }
      if (r.go) html += "<div class=\"aq-acts\"><button type=\"button\" class=\"aq-go\" onclick=\"aqGo('" + r.go.h + "')\">" + r.go.n + " ▶</button></div>";
      aqFillin(tid, html);
      if (r.nav && !r.tryCloud) setTimeout(() => aqGo(r.nav), 900);
    });
    return;
  }
  aqPush("ai", "<span class=\"aq-dots\"><i></i><i></i><i></i></span> 小答想一想…", tid);
  setTimeout(() => {
    let html = r.text || "";
    if (r.go) html += "<div class=\"aq-acts\"><button type=\"button\" class=\"aq-go\" onclick=\"aqGo('" + r.go.h + "')\">" + r.go.n + " ▶</button></div>";
    aqFillin(tid, html);
    if (r.nav) setTimeout(() => aqGo(r.nav), 900);
  }, 480);
}
/* 视觉盒 = 元素盒 × transform。手机端 .aq 带 scale(.52) 且原点在右下角，
   以前按 168×184 直接算边界，视觉上会飞出屏幕外(刷新一次就跑到看不见的地方)。
   这里统一换算：视觉左上角 → 元素 left/top。 */
function aqViewBox(w) {
  const r = w.getBoundingClientRect();
  const W = w.offsetWidth || r.width || 168, H = w.offsetHeight || r.height || 184;
  let s = 1, ox = 0, oy = 0;
  try {
    const cs = getComputedStyle(w);
    const tf = String(cs.transform || "none");
    if (tf && tf !== "none") {
      const m = new DOMMatrixReadOnly(tf);
      s = m.a || 1;
    }
    const tp = String(cs.transformOrigin || "0px 0px").split(/\s+/).map(parseFloat);
    ox = isFinite(tp[0]) ? tp[0] : 0;
    oy = isFinite(tp[1]) ? tp[1] : 0;
  } catch (e) {}
  return {
    vw: r.width || W * s, vh: r.height || H * s,
    offX: ox * (1 - s), offY: oy * (1 - s)   // 视觉左上角 相对 元素 left/top 的偏移
  };
}
/* 把视觉左上角夹进视口(留 8px 边距),回写元素的 left/top */
function aqPlace(vLeft, vTop) {
  const w = document.getElementById("aq");
  if (!w) return null;
  const b = aqViewBox(w);
  const vw = window.innerWidth || document.documentElement.clientWidth || 360;
  const vh = window.innerHeight || document.documentElement.clientHeight || 640;
  const pad = 8;
  /* 约束的是「视觉盒」：视觉左 = left + offX，所以上下限也要减掉同一份偏移 */
  const cl = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const x = cl(vLeft - b.offX, pad - b.offX, vw - b.vw - pad - b.offX);
  const y = cl(vTop - b.offY, pad - b.offY, vh - b.vh - pad - b.offY);
  w.style.left = x + "px"; w.style.top = y + "px";
  w.style.right = "auto"; w.style.bottom = "auto";
  AQ.x = x; AQ.y = y;
  return { x: x, y: y };
}
/* 拖拽移动(点按不拖 = 开 / 关面板) */
function aqDragStart(e) {
  const w = document.getElementById("aq"); if (!w) return;
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  try {
    const r = w.getBoundingClientRect();
    AQ.drag = { sx: e.clientX, sy: e.clientY, moved: false, vLeft: r.left, vTop: r.top };
  } catch (err) { AQ.drag = { sx: e.clientX, sy: e.clientY, moved: false, vLeft: 0, vTop: 0 }; }
  if (e.preventDefault) e.preventDefault();
}
function aqDragMove(e) {
  if (!AQ.drag) return;
  const dx = e.clientX - AQ.drag.sx, dy = e.clientY - AQ.drag.sy;
  if (!AQ.drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
  AQ.drag.moved = true;
  if (!document.getElementById("aq")) return;
  aqPlace(AQ.drag.vLeft + dx, AQ.drag.vTop + dy);
}
function aqDragEnd() {
  if (!AQ.drag) return;
  const moved = AQ.drag.moved;
  AQ.drag = null;
  if (moved) aqSave(); else aqToggle();
}
/* 视口变化 / 转屏：把已存的位置重新夹回屏幕内 */
function aqRefit() {
  const w = document.getElementById("aq");
  if (!w || AQ.x == null || AQ.y == null) return;
  const b = aqViewBox(w);
  aqPlace(AQ.x + b.offX, AQ.y + b.offY);
}
window.addEventListener("resize", aqRefit);
window.addEventListener("orientationchange", () => setTimeout(aqRefit, 260));
/* 启动:读档 + 计分 + 招呼气泡(自检 / 静态预览环境同样安全) */
function initAq() {
  const d = aqLoad();
  AQ.x = typeof d.x === "number" ? d.x : null;
  AQ.y = typeof d.y === "number" ? d.y : null;
  const qd = aqQuizLoad();
  QZ.best = qd.best | 0; QZ.total = qd.total | 0; QZ.correct = qd.correct | 0;
  const w = document.getElementById("aq");
  if (w && AQ.x != null && AQ.y != null && window.innerWidth) {
    /* 先按存下来的 left/top 落位，再统一夹回屏幕内
       (修复前存在 localStorage 里的位置可能已经飞出屏幕) */
    w.style.left = AQ.x + "px"; w.style.top = AQ.y + "px";
    w.style.right = "auto"; w.style.bottom = "auto";
    const b = aqViewBox(w);
    aqPlace(AQ.x + b.offX, AQ.y + b.offY);
    aqSave();
  }
  aqScorePaint();
  setTimeout(() => {
    const t = document.getElementById("aqTip");
    if (t && !AQ.open) t.classList.add("show");
  }, 1100);
  setTimeout(() => {
    const t = document.getElementById("aqTip");
    if (t) t.classList.remove("show");
  }, 12000);
}

/* ================================================================
   开卷 · 卷轴互动（移植 xiwan/qingming-scroll 的「木轴 + 纸窗 + 长卷横移」）
   上下滑动（滚轮 / 触控板 / 触屏 / 拖动画面 / 方向键）→ 画卷左右展开：
   引首题签先露头，随后十六朝文物沿「历史长河」一件件入卷；底部铨条是整卷的缩略，
   朱点是十六件文物，白框是当前取景窗。旁白照旧按进度点亮题字、读完自动收卷；
   不含任何背景音乐与环境音（本站开卷只留人声旁白）。
   ================================================================ */
const INTRO_DYNASTIES = [
  ["夏", "夏朝铜嵌绿松石兽面纹牌.webp"],
  ["商", "商朝妇好鸮尊.webp"],
  ["西周", "西周邓仲牺尊.webp"],
  ["东周", "东周青铜双羊尊.webp"],
  ["秦", "秦朝兵马俑.webp"],
  ["汉", "汉代透雕双龙白玉璧.webp"],
  ["三国", "三国“偏将军印章”金印.webp"],
  ["西晋", "西晋晋候鸟尊.webp"],
  ["南北朝", "南北朝玉龙凤形佩.webp"],
  ["隋", "隋朝独孤信多面印.webp"],
  ["唐", "唐赤金走龙.webp"],
  ["五代", "五代耀州窑青釉刻花提梁倒流壶.webp"],
  ["宋", "宋代云龙佩.webp"],
  ["元", "双螭耳玉杯 元代.webp"],
  ["明", "明，青花龙凤纹三足炉.webp"],
  ["清", "清代碧玉凤鸟形砚滴.webp"]
];

let SC_ART_W = 3.4;                   // 长卷宽度 = 纸窗宽度的倍数（窄竖屏自动调小，免得放大太狠只剩一小块）
const SC_VIS_OF = () => 1 / SC_ART_W;  // 纸窗占长卷的比例
const SC_U0 = 0.26, SC_U1 = 0.84;     // 十六件文物在长卷上的起止位置（引首题签之后）
const SC_SILENT = 60.37;                 // 整卷匀速展开时长（秒）；配乐 58s，正好收在同一下
/* 旁白四句各自的起点（秒）：字幕就按这个时刻换句，念到哪句显哪句 */
/* 字幕四句的显现时刻（秒）：旁白轨已排成与画卷等长（60s），语音分别从 2 / 18 / 32 / 46 秒开口。
   字幕比语音早 0.2 秒亮（3~4 帧的常规提前量，先看到字再听到声，不会觉得慢半拍），
   第一句从 0 秒就在，卷一摊开就有字 —— 「画卷时间轴 == 旁白时间轴」，字、声、画共用一根尺子 */
const SC_LINE_AT = [0.40, 3.06, 5.78, 11.24, 16.62, 19.95, 24.31, 27.56, 30.99, 33.97, 37.17, 40.87, 46.24, 49.88, 53.73];
const SC_VT_END = 0.92;               /* 原片末尾淡出到素纸，按 92% 收住 */

const INTRO = {
  done: false, timer: null, audio: null, playing: false, seg: -1, syncId: null,
  p: 0, maxX: 1, len: 900, prog: -1, elapsed: 0, music: null, mTimer: null,
  auto: false, raf: 0, tween: 0, lastTs: 0,
  aw: 0, ah: 0, idx: -1, bound: false, built: false,
  video: null, vReady: false, vPlaying: false, vSeek: 0, vFix: 0, progTs: 0
};

function scQ(id) { return document.getElementById(id); }
function scClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
/* 河心线：一条缓流的曲线（u = 0→1 走完长卷），右端略低，像水往远处去 */
function scRiverY(u) { return 0.55 + 0.055 * Math.sin(u * Math.PI * 2.35 - 0.6) + 0.022 * Math.sin(u * Math.PI * 7.1 + 1.2) - 0.03 * u; }
const scNodeU = (i) => SC_U0 + (SC_U1 - SC_U0) * (i / (INTRO_DYNASTIES.length - 1));
const scPOfU = (u) => { const hv = SC_VIS_OF(); return scClamp((u - hv / 2) / (1 - hv), 0, 1); };

/* 器物名：去掉文件名里的朝代前缀与后缀，只留器物本身 */
function scName(fn) {
  let s = String(fn).replace(/\.(jpe?g|png|webp|gif)$/i, "");
  s = s.replace(/^(夏|商|西周|东周|秦|汉|三国|西晋|东晋|南北朝|隋|唐|五代|宋|元|明|清)(朝|代)?[，,、·]?\s*/, "");
  s = s.replace(/\s*(元代|明代|清代|宋代|唐代|汉代|秦代)$/, "");
  return s || String(fn);
}

/* ---------------- 卷面：引首之后铺历史长河 + 十六件文物 + 两叶小舟 ---------------- */
const SC_BOAT = '<svg viewBox="0 0 48 44" aria-hidden="true">' +
  '<path d="M23.4 3.4 C15.6 9 11.4 14.8 10.2 21.4 L23.4 21.4 Z" fill="#8a5a30" opacity=".88"/>' +
  '<path d="M25 6.6 C30.8 11 33.8 16 34.8 21.4 L25 21.4 Z" fill="#a3703a" opacity=".8"/>' +
  '<path d="M24 2.2 L30.6 4.2 L24 6.2 Z" fill="#b0432a" opacity=".85"/>' +
  '<path d="M23.4 2 L23.4 21.4" stroke="#5c3b24" stroke-width="1.5"/>' +
  '<path d="M4.4 21.4 C12.4 30.4 35.6 30.4 43.6 21.4 C35.6 26.6 12.4 26.6 4.4 21.4 Z" fill="#5c3b24" opacity=".92"/></svg>';

function introBuildArt() {
  /* 卷面只留清明上河原片本身：不再挂文物精灵圆片，留白即是画 */
  const art = scQ("scArt");
  if (!art || INTRO.built) return;
  INTRO.built = true;
  const old = art.querySelectorAll(".sc-node");
  for (let i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
}

/* 远山剪影：三个倍频的正弦叠成山脊（确定性计算，不引随机） */
function introRidge(W, H, base, amp, lam, ph) {
  const yAt = (u) => {
    const q = (f) => 0.5 + 0.5 * Math.cos(2 * Math.PI * u / f + ph);
    const h = Math.pow(q(lam), 1.55) + 0.45 * Math.pow(q(lam * 0.43), 1.9) + 0.2 * Math.pow(q(lam * 0.19), 2.2);
    return (base - amp * h / 1.65) * H;
  };
  let d = "M-20 " + yAt(-20 / W).toFixed(1);
  for (let px = 0; px <= W + 20; px += 10) d += " L" + px.toFixed(0) + " " + yAt(px / W).toFixed(1);
  d += " L" + (W + 20).toFixed(0) + " " + (H + 40).toFixed(0) + " L-20 " + (H + 40).toFixed(0) + " Z";
  return d;
}

/* 历史长河：底片已是清明上河图原片，这里不再叠假河道，只把旧的水带层清掉；
   十六件文物（introBuildArt 里生成）直接沿水岸一上一下挂上去 */
function introBuildRiver(art) {
  const old = art.querySelector(".sc-river");
  if (old && old.parentNode) old.parentNode.removeChild(old);
}

/* ---------------- 底部铨条：整卷缩略 + 朱点 ---------------- */
function scPanoSVG() {
  const W = 1200, H = 46, N = INTRO_DYNASTIES.length;
  let d = "M0 " + (scRiverY(0) * H).toFixed(1);
  for (let x = 6; x <= W; x += 6) d += " L" + x + " " + (scRiverY(x / W) * H).toFixed(1);
  let s = '<svg class="sc-pano" viewBox="0 0 1200 46" preserveAspectRatio="none" aria-hidden="true">' +
    '<rect x="0" y="0" width="1200" height="46" fill="#eee2c8"/>' +
    '<path d="' + d + '" fill="none" stroke="rgba(150,186,192,.85)" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="' + d + '" fill="none" stroke="rgba(96,146,164,.55)" stroke-width="2" stroke-linecap="round"/>';
  for (let i = 0; i < N; i++) {
    const u = scNodeU(i);
    s += '<circle cx="' + (u * W).toFixed(0) + '" cy="' + (scRiverY(u) * H).toFixed(1) + '" r="2.6" fill="rgba(181,56,42,.85)"/>';
  }
  return s + "</svg>";
}

function introBuildRail() {
  const labels = scQ("scLabels"), marks = scQ("scMarks"), thumb = scQ("scThumb");
  if (!labels || labels.getAttribute("data-built") === "1") return;
  labels.setAttribute("data-built", "1");
  const N = INTRO_DYNASTIES.length;
  for (let i = 0; i < N; i++) {
    const left = (scPOfU(scNodeU(i)) * 100).toFixed(2) + "%";
    const a = document.createElement("button");
    a.type = "button"; a.className = "sc-lab"; a.dataset.i = i;
    a.style.left = left; a.textContent = INTRO_DYNASTIES[i][0];
    a.title = INTRO_DYNASTIES[i][0] + " · " + scName(INTRO_DYNASTIES[i][1]);
    a.addEventListener("click", function () { introGoNode(i); });
    labels.appendChild(a);
    const b = document.createElement("button");
    b.type = "button"; b.className = "sc-mark"; b.dataset.i = i;
    b.style.left = left; b.title = INTRO_DYNASTIES[i][0];
    b.addEventListener("click", function () { introGoNode(i); });
    if (marks) marks.appendChild(b);
  }
  if (thumb && !thumb.querySelector(".sc-pano")) thumb.insertAdjacentHTML("afterbegin", scPanoSVG());
}

/* ---------------- 排布 / 渲染 ---------------- */
function introLayout() {
  const stage = scQ("scStage"), paper = scQ("scPaper"), art = scQ("scArt"), spacer = scQ("scSpacer");
  if (!stage || !paper || !art || !spacer) return false;
  const cs = getComputedStyle(stage);
  const aw = stage.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const ah = stage.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
  const pw = Math.max(260, Math.round(aw - 32));
  /* 卷面按 3.4 倍铺开：整卷刚好铺满一屏窗口的 3.4 倍，横向平移就能把原片整幅走完 */
  const want = 3.4;
  const changed = want !== SC_ART_W;
  SC_ART_W = want;
  art.style.width = (SC_ART_W * 100).toFixed(2) + "%";
  paper.style.width = pw + "px";
  paper.style.height = "";
  /* 纸窗高度交给 CSS 的 aspect-ratio（画卷原生 1500:832）：横屏是宽卷，竖屏也是宽卷，
     不会再被撑成一条竖缝。实际宽度以量到的为准（被 max-height 收窄时也准） */
  const rect = paper.getBoundingClientRect();
  const pwid = Math.round(rect.width || pw);
  const ph = Math.round(rect.height || (pw * 832 / 1500));
  INTRO.maxX = Math.round(pwid * (SC_ART_W - 1));
  INTRO.len = Math.round(scClamp(pwid * 2.6, 760, 5200));
  /* 木轴跟纸窗等高（竖屏纸窗收窄后，轴不该还撑着满屏） */
  const rl = scQ("scRodL"), rr = scQ("scRodR");
  if (rl) rl.style.height = (ph + 6) + "px";
  if (rr) rr.style.height = (ph + 6) + "px";
  spacer.style.height = INTRO.len + "px";
  const cw = Math.round(pw * SC_ART_W);
  if (INTRO.aw !== cw || INTRO.ah !== ph) {
    INTRO.aw = cw; INTRO.ah = ph;
    introBuildRiver(art, cw, ph);
  }
  if (changed && INTRO.built) introRebuildRail();
  introApply(INTRO.p);
  return true;
}

/* 倍率变了（横竖屏切换）：铨条上的点位按新比例重排 */
function introRebuildRail() {
  const labels = scQ("scLabels"), marks = scQ("scMarks");
  if (labels) { labels.innerHTML = ""; labels.removeAttribute("data-built"); }
  if (marks) marks.innerHTML = "";
  introBuildRail();
}

function introApply(p) {
  p = scClamp(p, 0, 1);
  INTRO.p = p;
  const art = scQ("scArt");
  if (art) art.style.transform = "translate3d(" + (-p * INTRO.maxX).toFixed(2) + "px,0,0)";
  /* 卷面底子就是原片。自动展卷时视频自己在播（不再逐帧 seek，否则必卡）；
     只有手动拖拽/跳段时才按进度定点 seek，而且做节流，避免 seek 排队把画面卡死 */
  const v = INTRO.video;
  if (v && INTRO.vReady && !INTRO.vPlaying && v.duration && isFinite(v.duration)) {
    const vt = p * v.duration * SC_VT_END;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (Math.abs(v.currentTime - vt) > 0.08 && now - (INTRO.vSeek || 0) > 90) {
      INTRO.vSeek = now;
      try { v.currentTime = vt; } catch (e) {}
    }
  }
  const rl = scQ("scRodL"), rr = scQ("scRodR");
  if (rl) rl.style.setProperty("--d", Math.round(12 + 12 * p) + "px");
  if (rr) rr.style.setProperty("--d", Math.round(24 - 12 * p) + "px");
  const win = scQ("scWin");
  if (win) {
    const w = SC_VIS_OF() * 100;
    win.style.width = w.toFixed(2) + "%";
    win.style.left = (p * (100 - w)).toFixed(2) + "%";
  }
  introNow(p);
  /* 字幕以旁白为准；旁白没出声（被自动播放策略拦下）时按画卷时间轴顶替——两者同一根尺子 */
  if (!introSubByVoice()) introSubAt(p * SC_SILENT);
}

/* 按时间轴换句：t 秒落在哪一段就显哪一句（开场还没开口时 0 = 全隐） */
function introSubAt(t) {
  let seg = 0;
  for (let k = 0; k < SC_LINE_AT.length; k++) { if (t >= SC_LINE_AT[k]) seg = k + 1; }
  introSubSet(seg);
}
/* 字幕跟着旁白走：旁白念到第几句就显第几句；旁白没出声则返回 false，由画卷时间轴顶上 */
function introSubByVoice() {
  const au = INTRO.audio;
  if (!au || !INTRO.playing || au.paused) return false;
  introSubAt(au.currentTime || 0);
  return true;
}

/* 字幕落位：seg = 1..4 对应四句，同一时刻只留一句，换句时旧句先退净再出新句 */
function introSubSet(seg) {
  if (INTRO.subSeg === seg) return;
  INTRO.subSeg = seg;
  const lines = document.querySelectorAll("#intro .sc-line");
  for (let i = 0; i < lines.length; i++) lines[i].classList.toggle("show", seg > 0 && i === seg - 1);
}

/* 当前走到哪件：卷上高亮 + 顶栏题名 + 铨条朱点 */
function introNow(p) {
  const N = INTRO_DYNASTIES.length;
  const i = scClamp(Math.round(p * (N - 1)), 0, N - 1);
  if (i === INTRO.idx) return;
  INTRO.idx = i;
  const nodes = document.querySelectorAll("#scArt .sc-node");
  for (let k = 0; k < nodes.length; k++) nodes[k].classList.toggle("lit", k === i);
  const labs = document.querySelectorAll("#scLabels .sc-lab");
  for (let k = 0; k < labs.length; k++) labs[k].classList.toggle("on", k === i);
  const mks = document.querySelectorAll("#scMarks .sc-mark");
  for (let k = 0; k < mks.length; k++) mks[k].classList.toggle("on", k === i);
  const dd = INTRO_DYNASTIES[i];
  const no = scQ("scNo"), nm = scQ("scName"), ds = scQ("scDesc"), now = scQ("scNow");
  if (no) no.textContent = "NO." + (i < 9 ? "0" : "") + (i + 1) + " / " + N;
  if (nm) nm.textContent = dd[0];
  if (ds) ds.textContent = scName(dd[1]);
  if (now) { now.classList.remove("in"); void now.offsetWidth; now.classList.add("in"); }
}

function introSeek(p) {
  p = scClamp(p, 0, 1);
  INTRO.prog = Math.round(p * INTRO.len);
  const wrap = scQ("scWrap");
  if (wrap) {
    wrap.scrollTop = INTRO.prog;
    INTRO.progTs = (typeof performance !== "undefined" ? performance.now() : Date.now());
  }
  introVoiceHold();
  introApply(p);
}

/* 用户自己翻卷时，旁白先歇住并拨到卷面此刻所在的秒数：
   免得「卷被拖到别处、旁白还在念刚才那句」。再点自动展卷时从新位置接着念 */
function introVoiceHold() {
  const au = INTRO.audio;
  if (!au || !INTRO.playing || au.paused) return;
  try { au.pause(); } catch (e) {}
  try { au.currentTime = scClamp(INTRO.p, 0, 1) * SC_SILENT; } catch (e) {}
}

function introTween(to, ms) {
  if (INTRO.auto) introAutoStop();
  if (INTRO.tween) cancelAnimationFrame(INTRO.tween);
  const from = INTRO.p, t0 = (window.performance && performance.now) ? performance.now() : Date.now();
  if (!ms) { introSeek(to); return; }
  const run = (ts) => {
    const now = ts || ((window.performance && performance.now) ? performance.now() : Date.now());
    const k = scClamp((now - t0) / ms, 0, 1);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    introSeek(from + (to - from) * e);
    INTRO.tween = k < 1 ? requestAnimationFrame(run) : 0;
  };
  INTRO.tween = requestAnimationFrame(run);
}

function introGoNode(i) {
  introAutoStop();
  introHintOff();
  i = scClamp(i, 0, INTRO_DYNASTIES.length - 1);
  introTween(scPOfU(scNodeU(i)), 520);
}
function introStep(d) {
  const N = INTRO_DYNASTIES.length;
  const cur = scClamp(Math.round(INTRO.p * (N - 1)), 0, N - 1);
  introGoNode(cur + d);
}

/* ---------------- 自动展卷：让原片自己播，画面靠解码器走，主线程只轻轻推一下位移 ---------------- */
function scAutoBtn(on) {
  const b = scQ("scAuto");
  if (!b) return;
  b.classList.toggle("on", !!on);
  b.textContent = on ? "暂停展卷" : "自动展卷";
}
/* 原片用原生播放（不逐帧 seek，这是之前卡顿的根因）；倍速让整卷正好 SC_SILENT 秒走完 */
function introVideoPlay() {
  const v = INTRO.video;
  if (!v || !INTRO.vReady) return;
  if (INTRO.vPlaying) return;
  try {
    v.playbackRate = scClamp((v.duration * SC_VT_END) / SC_SILENT, 0.5, 4);
    /* 起播点必须对到旁白此刻所在的秒数：先 seek、等 seeked 回调出帧了再播，
       否则浏览器会从旧位置起跑，画面就比字幕快出小半秒 */
    const sec = (INTRO.audio && INTRO.playing) ? (INTRO.audio.currentTime || 0) : INTRO.p * SC_SILENT;
    const target = scClamp(sec / SC_SILENT, 0, 1) * v.duration * SC_VT_END;
    const kick = function () {
      if (INTRO.vPlaying) return;
      try { const pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
      INTRO.vPlaying = true;
    };
    if (Math.abs(v.currentTime - target) > 0.12) {
      const onSeeked = function () {
        v.removeEventListener("seeked", onSeeked);
        kick();
      };
      v.addEventListener("seeked", onSeeked);
      try { v.currentTime = target; } catch (e) { v.removeEventListener("seeked", onSeeked); kick(); }
      /* 万一 seeked 没来（低端机/首帧未解出），400ms 后照样开播 */
      setTimeout(function () { v.removeEventListener("seeked", onSeeked); kick(); }, 400);
    } else {
      kick();
    }
  } catch (e) { INTRO.vPlaying = false; }
}
function introVideoStop() {
  const v = INTRO.video;
  INTRO.vPlaying = false;
  if (!v) return;
  try { v.pause(); } catch (e) {}
}
function introAutoStop() {
  INTRO.auto = false;
  if (INTRO.raf) { cancelAnimationFrame(INTRO.raf); INTRO.raf = 0; }
  introVideoStop();
  scAutoBtn(false);
}
function introAutoStart() {
  if (INTRO.done || INTRO.auto) return;
  INTRO.auto = true; INTRO.lastTs = 0;
  scAutoBtn(true);
  /* 手动翻卷时歇下的旁白：从卷面当前所在的秒数接着念，而不是从头 */
  const au = INTRO.audio;
  if (au && INTRO.playing && au.paused) {
    try { au.currentTime = scClamp(INTRO.p, 0, 1) * SC_SILENT; } catch (e) {}
    const pr = au.play(); if (pr && pr.catch) pr.catch(function () {});
  }
  introVideoPlay();
  const step = (ts) => {
    if (INTRO.done || !INTRO.auto) return;
    if (!INTRO.lastTs) INTRO.lastTs = ts;
    const dt = Math.min(0.08, (ts - INTRO.lastTs) / 1000);
    INTRO.lastTs = ts;
    const v = INTRO.video, au = INTRO.audio;
    let p;
    if (au && INTRO.playing && !au.paused && !au.ended) {
      /* 旁白在念：卷面就按旁白的秒数走 —— 字、声、画共用一根秒表，差不了 */
      p = scClamp(au.currentTime / SC_SILENT, 0, 1);
      INTRO.elapsed = p * SC_SILENT;
      /* 视频是跟随者：偏出半秒以上才轻推一次（偶尔一次 seek，不是逐帧） */
      if (v && INTRO.vPlaying && v.duration && isFinite(v.duration)) {
        const want = p * v.duration * SC_VT_END;
        if (Math.abs(v.currentTime - want) > 0.5 && ts - (INTRO.vFix || 0) > 1500) {
          INTRO.vFix = ts;
          try { v.currentTime = want; } catch (e) {}
        }
      }
    } else if (INTRO.vPlaying && v && v.duration && isFinite(v.duration) && !v.paused) {
      /* 没有旁白(被浏览器拦下)：退回由视频时刻推算 */
      p = scClamp(v.currentTime / (v.duration * SC_VT_END), 0, 1);
      INTRO.elapsed = p * SC_SILENT;
    } else {
      INTRO.elapsed += dt;
      p = scClamp(INTRO.elapsed / SC_SILENT, 0, 1);
    }
    /* 滚动条位置一起跟上：用户随时接手，不会跳回卷首 */
    INTRO.prog = Math.round(p * INTRO.len);
    const wrap = scQ("scWrap");
    if (wrap && Math.abs(wrap.scrollTop - INTRO.prog) > 1) {
      wrap.scrollTop = INTRO.prog;
      INTRO.progTs = (typeof performance !== "undefined" ? performance.now() : Date.now());
    }
    introApply(p);
    if (p >= 0.999) {
      introAutoStop();
      setTimeout(function () { introFinish(false); }, 900);
      return;
    }
    INTRO.raf = requestAnimationFrame(step);
  };
  INTRO.raf = requestAnimationFrame(step);
}
function introAutoToggle() {
  if (INTRO.done) return;
  if (INTRO.auto) introAutoStop();
  else { INTRO.lastTs = 0; introAutoStart(); }
}

function introHintOff() {
  const h = scQ("scHint");
  if (h) h.classList.add("gone");
}

/* 卷面底片：一个暂停的 video，只按进度 seek */
function introBindVideo() {
  const v = scQ("scVideo");
  if (!v) return;
  INTRO.video = v;
  const ready = function () {
    INTRO.vReady = v.readyState >= 2;
    introApply(INTRO.p);
    /* 视频比自动展卷晚就绪（首帧解码慢）时，补上原生播放 */
    if (INTRO.vReady && INTRO.auto && !INTRO.vPlaying) introVideoPlay();
  };
  v.addEventListener("loadeddata", ready);
  v.addEventListener("canplay", ready);
  v.addEventListener("error", function () { INTRO.vReady = false; });
  try { v.pause(); } catch (e) {}
  try { v.load(); } catch (e) {}
  if (v.readyState >= 2) ready();
}

/* ---------------- 交互绑定：滚动 / 拖动 / 键盘 / 铨条 ---------------- */
function introBind() {
  if (INTRO.bound) return;
  INTRO.bound = true;
  const wrap = scQ("scWrap");
  if (wrap) {
    wrap.addEventListener("scroll", function () {
      const top = wrap.scrollTop;
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      /* 自动展卷每帧自己写 scrollTop，它引起的 scroll 事件带 260ms 宽限，不算用户操作 */
      if (INTRO.auto && now - (INTRO.progTs || 0) < 260) return;
      if (Math.abs(top - INTRO.prog) > 2) {       // 用户自己滑的 → 停掉自动展卷
        INTRO.prog = -1;
        if (INTRO.auto) introAutoStop();
        introHintOff();
        introVoiceHold();
      }
      const p = INTRO.len ? scClamp(top / INTRO.len, 0, 1) : 0;
      introApply(p);
    }, { passive: true });
    wrap.addEventListener("wheel", introHintOff, { passive: true });
    wrap.addEventListener("touchstart", introHintOff, { passive: true });
  }
  /* 按住画面左右拖动才接管；单纯点一下 / 轻触不算，自动展卷照走 */
  const paper = scQ("scPaper");
  if (paper) {
    let drag = null;
    paper.addEventListener("pointerdown", function (e) {
      if (INTRO.done || (e.button !== undefined && e.button > 0)) return;
      /* 这里只记起点，不停自动展卷：等真的拖出 10px 宽度才交接 */
      drag = { x: e.clientX, y: e.clientY, p: INTRO.p, on: false };
      introHintOff();
      try { paper.setPointerCapture(e.pointerId); } catch (err) {}
    });
    paper.addEventListener("pointermove", function (e) {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.on) {
        /* 横向拖动超过 10px 才认作翻卷；否则是单击/竖滑，当没发生 */
        if (Math.abs(dx) < 10) return;
        drag.on = true;
        paper.classList.add("grabbing");
        introAutoStop();
      }
      introSeek(drag.p - dx / Math.max(1, INTRO.maxX));
    });
    const relax = function () {
      if (!drag) return;
      drag = null;
      paper.classList.remove("grabbing");
    };
    paper.addEventListener("pointerup", relax);
    paper.addEventListener("pointercancel", relax);
  }
  /* 铨条：点击跳转 / 按住横拖快速翻卷 */
  const bar = scQ("scBar");
  if (bar) {
    let hold = false;
    const at = (e) => {
      const r = bar.getBoundingClientRect();
      const w = SC_VIS_OF() * 100;
      return scClamp(((e.clientX - r.left) / r.width * 100 - w / 2) / (100 - w), 0, 1);
    };
    bar.addEventListener("pointerdown", function (e) {
      if (INTRO.done) return;
      hold = true;
      introAutoStop();
      introHintOff();
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      introSeek(at(e));
    });
    bar.addEventListener("pointermove", function (e) { if (hold) introSeek(at(e)); });
    const stop = function () { hold = false; };
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
  }
  document.addEventListener("keydown", introKey, false);
  window.addEventListener("resize", introOnResize);
  window.addEventListener("orientationchange", introOnResize);
}
function introKey(e) {
  if (INTRO.done) return;
  const k = e.key;
  if (k === "Escape") { introSkip(); return; }
  if (k === " " || k === "Spacebar") { e.preventDefault(); introAutoToggle(); return; }
  if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === "d") { e.preventDefault(); introStep(1); return; }
  if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "a") { e.preventDefault(); introStep(-1); return; }
  if (k === "Home") { e.preventDefault(); introGoNode(0); return; }
  if (k === "End") { e.preventDefault(); introGoNode(INTRO_DYNASTIES.length - 1); return; }
}
let scRz = 0;
function introOnResize() {
  if (INTRO.done) return;
  clearTimeout(scRz);
  scRz = setTimeout(function () { try { introLayout(); } catch (e) {} }, 160);
}

/* ---------------- 旁白 / 收卷 ---------------- */
function introSkip() {
  if (INTRO.done) return;
  if (INTRO.timer) { clearTimeout(INTRO.timer); INTRO.timer = null; }
  introFinish(true);
}
function introFinish(skipped) {
  if (INTRO.done) return;
  INTRO.done = true;
  introAutoStop();
  if (INTRO.tween) { cancelAnimationFrame(INTRO.tween); INTRO.tween = 0; }
  if (INTRO.syncId) { clearInterval(INTRO.syncId); INTRO.syncId = null; }
  if (INTRO.timer) { clearTimeout(INTRO.timer); INTRO.timer = null; }
  introVideoStop();
  document.removeEventListener("keydown", introKey, false);
  window.removeEventListener("resize", introOnResize);
  window.removeEventListener("orientationchange", introOnResize);
  try { document.body.classList.remove("intro-on"); } catch (e) {}
  if (skipped && INTRO.audio) {
    try { INTRO.audio.pause(); INTRO.audio.currentTime = 0; } catch (e) {}
  }
  if (skipped) introMusicStop(); else introMusicFade();
  /* 这里原本会 bgmBoot() 自动接上主页背景乐 —— 已取消:背景音乐只由用户自己点开 */
  const el = scQ("intro");
  if (!el) return;
  el.classList.add("fade");
  if (skipped) el.classList.add("fast");
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, skipped ? 420 : 950);
}
/* 旁白被自动播放策略拦下时:亮出「开启旁白」小按钮,点一下补开旁白并改按读完收场 */
function introShowVoiceBtn() {
  const b = scQ("introVoice");
  if (b) { b.hidden = false; b.style.display = ""; }
}
function introVoiceOn() {
  if (INTRO.done || INTRO.playing) return;
  const au = INTRO.audio;
  if (!au) return;
  const b = scQ("introVoice");
  if (b) b.hidden = true;
  introMusicStart();
  /* 中途才补开声：先把旁白拨到画卷当前所在的那一秒，字声从这一刻起对齐 */
  try { au.currentTime = scClamp(INTRO.p, 0, 1) * SC_SILENT; } catch (e) {}
  const p = au.play();
  if (p && p.then) {
    p.then(function () {
      INTRO.playing = true; introStartSync(); introArmEndByDuration();
      if (!INTRO.auto) introAutoStart();
    }).catch(function () { if (b) b.hidden = false; });
  } else {
    INTRO.playing = true; introStartSync(); introArmEndByDuration();
    if (!INTRO.auto) introAutoStart();
  }
}
function introReadDone() {
  if (INTRO.done) return;
  if (INTRO.timer) { clearTimeout(INTRO.timer); INTRO.timer = null; }
  /* 旁白读完 → 让画卷收在自己的末段再落幕 */
  introTween(1, 900);
  setTimeout(function () { introFinish(false); }, 1000);
}
function introArmEndByDuration() {
  if (INTRO.done) return;
  /* 收场时间跟着画卷走（整卷匀速展开 SC_SILENT 秒），不再被 20 秒的旁白提前带走 */
  if (INTRO.timer) clearTimeout(INTRO.timer);
  INTRO.timer = setTimeout(function () { INTRO.timer = null; introFinish(false); }, (SC_SILENT + 2) * 1000);
}
function introArmEndSilent() {
  if (INTRO.done) return;
  if (INTRO.timer) clearTimeout(INTRO.timer);
  INTRO.timer = setTimeout(function () { INTRO.timer = null; introFinish(false); }, (SC_SILENT + 1.2) * 1000);
}
/* 字幕值守：旁白一开口就按它的进度换句（260ms 一次，顺便兜住 timeupdate 的稀疏） */
function introSync() {
  if (INTRO.done) return;
  introSubByVoice();
}
function introStartSync() {
  if (INTRO.syncId || INTRO.done) return;
  /* 旁白刚出声时立刻对一次字幕（防止中途才点开声，字和声错位） */
  introSubByVoice();
  INTRO.syncId = setInterval(introSync, 120);
}

/* 开卷配乐：借用清明长卷那首「汴河画卷」，音量压到很低只作垫底，收卷时淡出 */
function introMusicStart() {
  if (INTRO.music) return;
  try {
    const mu = new Audio("音频/开卷配乐.mp3");
    mu.loop = true;
    mu.volume = 0.13;
    INTRO.music = mu;
    const mp = mu.play();
    if (mp && mp.catch) mp.catch(function () {});
  } catch (e) {}
}
function introMusicStop() {
  if (INTRO.mTimer) { clearInterval(INTRO.mTimer); INTRO.mTimer = null; }
  const mu = INTRO.music;
  if (!mu) return;
  try { mu.pause(); } catch (e) {}
}
function introMusicFade() {
  const mu = INTRO.music;
  if (!mu || mu.paused || INTRO.mTimer) return;
  INTRO.mTimer = setInterval(function () {
    try {
      mu.volume = Math.max(0, mu.volume - 0.012);
      if (mu.volume <= 0.001) { mu.pause(); clearInterval(INTRO.mTimer); INTRO.mTimer = null; }
    } catch (e) { clearInterval(INTRO.mTimer); INTRO.mTimer = null; }
  }, 60);
}

/* 启动:铺好长卷 → 自动展卷 + 开口念旁白 → 读完收卷(自检 / 静态预览环境同样安全) */
function initIntro() {
  const el = scQ("intro");
  if (!el) { try { document.body.classList.remove("intro-on"); } catch (e) {} return; }
  try { introLayout(); introBuildArt(); introBuildRail(); introLayout(); introBindVideo(); } catch (e) {}
  introBind();
  /* 首屏那行提示:动一下就退,不动 7 秒自己退 */
  setTimeout(function () { if (INTRO.p < 0.05) introHintOff(); }, 7000);

  const rm = (typeof window !== "undefined" && window.matchMedia)
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  if (rm) { /* 减少动态:不播旁白,快速收场 */
    introSeek(1);
    INTRO.timer = setTimeout(function () { INTRO.timer = null; introFinish(false); }, 1600);
    return;
  }
  if (typeof Audio === "undefined") { introAutoStart(); introArmEndSilent(); return; }
  try {
    const au = new Audio("音频/开卷旁白.mp3?v=5");
    INTRO.audio = au;
    au.volume = 0.9;
    const p = au.play();
    if (p && p.then) {
      p.then(function () {
        INTRO.playing = true;
        /* 起播那一瞬可能已经在解码/缓冲里耗掉几百毫秒：把旁白拨到画卷此刻所在的秒数 */
        try {
          const now = scClamp(INTRO.p, 0, 1) * SC_SILENT;
          if (Math.abs(au.currentTime - now) > 0.25) au.currentTime = now;
        } catch (e) {}
        introStartSync(); introArmEndByDuration();
        /* 旁白真正开口的这一刻，画卷同时起跑 —— 两者共用同一个 0 秒，不会差半拍 */
        introAutoStart();
      })
        .catch(function () { introArmEndSilent(); introShowVoiceBtn(); introAutoStart(); });
    } else {
      INTRO.playing = true; introStartSync(); introArmEndByDuration(); introAutoStart();
    }
    au.addEventListener("ended", function () { introSubSet(SC_LINE_AT.length); });
    introMusicStart();
    /* 迟到检测:1.8 秒仍未开腔(自动播放被拦)→ 改用静默展卷 */
    setTimeout(function () {
      if (INTRO.done || INTRO.playing) return;
      if (!au.paused) { INTRO.playing = true; introStartSync(); introArmEndByDuration(); }
      else { introArmEndSilent(); introShowVoiceBtn(); }
    }, 1800);
  } catch (e) { introAutoStart(); introArmEndSilent(); introShowVoiceBtn(); }
}



/* ---------------- 主页背景音乐(顶栏右上角 ♪:五首切换 / 关闭;选择记在本机) ----------------
   原则:任何情况下都不自动播放。只有用户自己在面板里点某一首,才出声。 */
const BGM_TRACKS = [
  ["玉月巡游", "背景音乐1 玉月巡游.mp3"],
  ["王朝终章", "背景音乐2 王朝终章.mp3"],
  ["华夏之美", "背景音乐3 华夏之美.mp3"],
  ["琴语晨思", "背景音乐4 琴语晨思.mp3"],
  ["睡莲", "背景音乐5 睡莲.mp3"]
];
const BGM_DEFAULT = 2;           // 默认第 3 首 · 华夏之美
const BGM_KEY = "relic.bgm.pick";
const BGM = { au: null, i: -1, on: false };

function bgmSaved() {
  try {
    const v = localStorage.getItem(BGM_KEY);
    if (v === "off") return -1;
    const n = parseInt(v, 10);
    return (n >= 0 && n < BGM_TRACKS.length) ? n : -2;   // -2 = 没选过
  } catch (e) { return -2; }
}
function bgmSave(v) { try { localStorage.setItem(BGM_KEY, String(v)); } catch (e) {} }
/* 画一遍面板:哪首在播、按钮亮不亮 */
function bgmPaint() {
  const btn = document.getElementById("bgmBtn");
  const rows = document.querySelectorAll("#bgmPanel .bgm-row");
  if (btn) {
    btn.classList.toggle("on", !!BGM.on);
    btn.classList.toggle("off", !BGM.on);
  }
  for (let i = 0; i < rows.length; i++) rows[i].classList.toggle("cur", BGM.on && i === BGM.i);
}
function bgmPlay(i) {
  i = Math.max(0, Math.min(BGM_TRACKS.length - 1, i | 0));
  const name = BGM_TRACKS[i][1];
  if (BGM.au) { try { BGM.au.pause(); } catch (e) {} }
  if (!BGM.au || BGM.au.dataset.track !== name) {
    const au = new Audio("音频/" + name);
    au.loop = true;
    au.volume = 0.55;
    au.dataset.track = name;
    BGM.au = au;
  }
  BGM.i = i;
  const p = BGM.au.play();
  if (p && p.catch) p.catch(function () { BGM.on = false; bgmPaint(); });
  BGM.on = true;
  bgmSave(i);
  bgmPaint();
}
function bgmStop() {
  if (BGM.au) { try { BGM.au.pause(); } catch (e) {} }
  BGM.on = false;
  bgmPaint();
}
/* ♪ 开合面板 */
function bgmToggle() {
  const panel = document.getElementById("bgmPanel");
  if (!panel) return;
  panel.hidden = !panel.hidden;
}
/* 点某一首 */
function bgmPick(i) {
  const panel = document.getElementById("bgmPanel");
  if (panel) panel.hidden = true;
  if (BGM.on && BGM.i === i) { bgmStop(); bgmSave("off"); return; }
  bgmPlay(i);
}
/* ✕ 关闭音乐 */
function bgmOff() {
  const panel = document.getElementById("bgmPanel");
  if (panel) panel.hidden = true;
  bgmStop();
  bgmSave("off");
}
/* 进页面时只恢复状态,绝不出声 */
function bgmBoot() {
  const s = bgmSaved();
  BGM.i = s >= 0 ? s : BGM_DEFAULT;
  BGM.on = false;
  bgmPaint();
  document.addEventListener("click", function (e) {
    const box = document.getElementById("bgm");
    const panel = document.getElementById("bgmPanel");
    if (!box || !panel || panel.hidden) return;
    if (!box.contains(e.target)) panel.hidden = true;
  }, true);
}
try { if (document.readyState !== "loading") bgmBoot(); else document.addEventListener("DOMContentLoaded", bgmBoot); } catch (e) {}

/* 首屏:按当前路由先渲染一次(扉页/开卷盖在上面,不影响观感) */
try { render(); } catch (e) {}

/* 扉页存在时先不演开场画卷:进入正式版后撤掉 flyleaf-on 再调用 initIntro() */
if (String((document.body && document.body.className) || "").indexOf("flyleaf-on") < 0) initIntro();
