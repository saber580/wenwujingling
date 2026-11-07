/* ================= 文物档案包加载器 =================
   data.js 现在只装「轻量索引」：名称、别名、年代、简介、所属站点。
   四个重字段(自述 comic / 问答 knowledge / 考点 quiz / 来历 history)搬到
   js/data-deep.js，约 300 KB，首屏不再等它。

   时机：首屏渲染完，浏览器一空闲就拉；用户点进图鉴 / 精灵详情时若还没到，
   app.js 的 render() 会等它一下（见 render 里的 NEED_DEEP 判断）。

   合并：data-deep.js 自己在末尾把字段合并回 SPIRITS，并调 window.KB.rebuild()
   重建本地检索索引。所以站内其他脚本一律不用改写法。 */
(function (W, D) {
  var STATE = 0;         /* 0 未开始 / 1 加载中 / 2 就绪 / 3 合并失败 */
  var WAITERS = [];
  var SRC = "js/data-deep.js?v=dd1";

  function flush(err) {
    var q = WAITERS;
    WAITERS = [];
    q.forEach(function (fn) { try { fn(err); } catch (e) {} });
  }

  /* 档案是否已就绪：图鉴之类的页面据此决定要不要等一下 */
  W.deepReady = function () { return STATE === 2; };

  W.loadDeep = function () {
    if (STATE === 2) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      WAITERS.push(function (e) { e ? reject(e) : resolve(); });
      if (STATE === 1) return;          /* 已经在下了，排队等同一批 */

      STATE = 1;
      var s = D.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = function () {
        STATE = (W.__deepMerged > 0) ? 2 : 3;
        flush(STATE === 3 ? new Error("档案包未合并") : null);
      };
      s.onerror = function () {
        STATE = 0;                      /* 允许下次再试 */
        flush(new Error("档案包加载失败"));
      };
      (D.head || D.documentElement).appendChild(s);
    });
  };

  /* 首屏渲染完再预取：抢在用户点进图鉴之前把档案铺好，又不拖慢首页。
     两个门槛：① 浏览器真正空闲；② 手指没在划。300KB 脚本的解析加上字段合并
     是实打实的主线程活，撞上惯性滑动就是「滑两下停一下」。滑动中先让开，
     下一次空闲窗口再来；真等不到也不要紧，app.js 会在需要时 loadDeep() 现等。 */
  function prefetch() {
    if (!W.requestIdleCallback) {
      setTimeout(function () { W.loadDeep().catch(function () {}); }, 1200);
      return;
    }
    function idle() {
      /* 只在 MQ 命中时才有 is-scrolling；桌面上这个类永远不存在，不会挡路 */
      if (D.body && D.body.classList.contains("is-scrolling")) {
        W.requestIdleCallback(idle, { timeout: 4000 });
        return;
      }
      W.loadDeep().catch(function () {});
    }
    W.requestIdleCallback(idle, { timeout: 6000 });
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", prefetch, { once: true });
  else prefetch();
})(window, document);
