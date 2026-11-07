/* =========================================================
   文物之声：让文物用第一人称开口说话
   ---------------------------------------------------------
   两条路：
   1) 预生成音频 audio/{id}/seg{n}.mp3 —— 与 tools/gen_voice.py 对应，
      按材质分配音色，不依赖访问者电脑里装了什么语音包；
   2) 浏览器 speechSynthesis —— 问答的即时回复没法预生成，用它兜底。
   音频 404 或播放被拒时，自动退到 2)，不会出现"张嘴没声"。
   ========================================================= */
(function () {
  var W = window;
  if (W.Voice && W.Voice.version) return;      /* 幂等 */
  var VERSION = "v1";

  var BASE = "audio/";
  var LS = "wj.voice";

  /* 材质 → 嗓音。和 gen_voice.py 的 VOICE 表一一对应，
     保证"预生成"与"实时合成"听起来是同一个人。 */
  var TONE = {
    bronze:   { rate: 0.86, pitch: 0.80, prefer: /yunjian|kangkang|yunxi/i },
    ceramic:  { rate: 0.98, pitch: 1.15, prefer: /xiaoxiao|huihui|yaoyao/i },
    jade:     { rate: 0.92, pitch: 1.05, prefer: /xiaoyi|tingting|huihui/i },
    gold:     { rate: 1.04, pitch: 1.12, prefer: /yunxi|xiaoxiao|yaoyao/i },
    painting: { rate: 0.90, pitch: 1.00, prefer: /yunyang|tingting/i },
    wood:     { rate: 0.92, pitch: 0.95, prefer: /yunjian|kangkang/i },
    stone:    { rate: 0.82, pitch: 0.75, prefer: /yunjian|kangkang/i }
  };
  var DEFAULT_TONE = { rate: 0.94, pitch: 1.00, prefer: /xiaoxiao|huihui|zh/i };

  var audio = null;          /* 复用一个 Audio，避免每次 new */
  var cur = null;            /* 当前播放会话，stop() 时置 halted */
  var voicesReady = false;
  var saySeq = 0;            /* 每说一句 +1；stop() 也 +1，作废所有在途合成 */

  /* 同一场对话里不许换嗓子。
     远程合成偶发失败（网络抖、服务端排队超时）时若当场退回系统语音，
     就成了"上一句是它自己的声音，下一句变成机器念"——用户听得出来，人设也塌了。
     所以只要这轮对话已经出过远程声音，后面就锁死：重试几次，仍不行就宁可不念
     （文字还在屏幕上），也不换人。锁在 stop() 时解，即下一次打开对话重新判断。 */
  var LOCK = { on: false, at: 0 };
  var LOCK_MS = 120000;      /* 两分钟没再成功过，承认网真不行，允许降级并告知 */

  function toneFor(primary) { return TONE[primary] || DEFAULT_TONE; }

  function synthOK() {
    try { return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined"; }
    catch (e) { return false; }
  }

  /* 把 markdown / 括号注音之类的符号去掉，TTS 读起来才顺 */
  function clean(t) {
    return String(t || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[*_#>`~]/g, "")
      .replace(/\[(\d+)\]/g, "")
      .replace(/\([^)]{0,20}\)|（[^）]{0,20}）/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function enabled() {
    try { return localStorage.getItem(LS) !== "0"; } catch (e) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(LS, on ? "1" : "0"); } catch (e) {}
    if (!on) stop();
    fire(on);
  }

  /* 让界面上的喇叭图标跟着状态走 */
  function fire(on) {
    try {
      W.dispatchEvent(new CustomEvent("voice:change", { detail: { on: !!on } }));
    } catch (e) {}
  }

  /* ---------- 浏览器音色挑选 ---------- */
  function allVoices() {
    try { return speechSynthesis.getVoices() || []; } catch (e) { return []; }
  }
  function pickVoice(prefer) {
    var vs = allVoices();
    if (!vs.length) return null;
    var zh = vs.filter(function (v) { return /^zh/i.test(v.lang || ""); });
    if (!zh.length) return null;
    for (var i = 0; i < zh.length; i++) {
      if (prefer && prefer.test(zh[i].name || "")) return zh[i];
    }
    /* 优先 zh-CN，其次任意中文 */
    for (var j = 0; j < zh.length; j++) if (/zh[-_]CN/i.test(zh[j].lang || "")) return zh[j];
    return zh[0];
  }
  function warmVoices() {
    if (voicesReady || !synthOK()) return;
    voicesReady = true;
    try { speechSynthesis.getVoices(); } catch (e) {}
    try {
      speechSynthesis.onvoiceschanged = function () { voicesReady = true; };
    } catch (e) {}
  }

  /* ---------- 播放预生成音频 ---------- */
  function getAudio() {
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
    }
    return audio;
  }

  /* 让音频彻底闭嘴：解绑 → 暂停 → 卸载源。
     只 pause 不卸载的话，被打断的 play() 会一直挂在那儿，
     下一次换源时抛 AbortError，调用方误以为"文件坏了"去走 TTS 兜底，
     于是 mp3 和浏览器合成两个声音叠在一起——这就是"重叠"的根。 */
  function killAudio() {
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.onplaying = null;
    try { audio.pause(); } catch (e) {}
    try { audio.removeAttribute("src"); audio.load(); } catch (e) {}
  }

  /* 让当前会话收尾。只把 halted 置真是不够的——它可能正卡在某段的
     加载/播放回调上，那个回调被 pause 掐掉后再也不会回来，Promise 就
     永远不 resolve，调用方的按钮一直停在"停下"。
     withEvent=false 表示"这次清场别惊动界面"（换人、插话、重播的场合）。 */
  function halt(withEvent) {
    var c = cur;
    cur = null;
    if (!c) return false;
    c.halted = true;
    if (!withEvent) c.silentEnd = true;
    if (c.done) { try { c.done(false); } catch (e) {} }
    return true;
  }

  /* quiet=true 时不广播 voice:stop。
     tell() 自己开头要清场，但那次清场不该让界面误以为"用户按了停止"。 */
  function stop(quiet) {
    halt(!quiet);
    saySeq++;                      /* 关闭抽屉时，正在合成的那一句不能再开口 */
    killAudio();
    LOCK.on = false;               /* 换一场对话，重新判断能不能用远程嗓子 */
    LOCK.at = 0;
    if (synthOK()) { try { speechSynthesis.cancel(); } catch (e) {} }
    if (quiet) return;
    try {
      W.dispatchEvent(new CustomEvent("voice:stop"));
    } catch (e) {}
  }

  /* ---------- 现场合成：AI 现说的话也要用故事那条嗓子 ----------
     浏览器自带的中文语音只有一两个系统音，一开口就和预生成的 mp3 判若两人。
     所以先请服务端用同一套 edge-tts 声线合成（桥的 /api/tts），
     拿不到再回落系统语音——宁可音色差点，也不能哑。 */
  function ttsURL() {
    try {
      /* 双击 html（file://）时相对路径会解析成 file:///api/tts，
         必须显式指到本机桥；localhost 开发态同理。 */
      if (location.protocol === "file:" ||
          /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname || "")) {
        return "http://127.0.0.1:8898/api/tts";
      }
    } catch (e) {}
    return "/api/tts";                            /* 线上：同域，nginx 转给桥 */
  }

  /* ---------- 合成结果缓存 ----------
     现场合成要 2~4 秒（edge-tts 建连 + 出声），而字是流式一个个蹦出来的。
     只要提前把这段文字送去合成，等轮到播的时候音频已经在手上，
     用户就不会经历"字都看完了，声音半天不来"。
     一场对话里复用同一批句子，缓存 24 条（约 700KB），够用又不撑内存。 */
  var TCACHE = {};
  var TORDER = [];
  var TMAX = 24;

  function tkey(opts, body) {
    return (opts.id || "") + "|" + (opts.primary || "") + "|" +
           (opts.scene || "dialog") + "|" + body;
  }
  function tget(k) { return TCACHE[k] || null; }
  function tput(k, blob) {
    if (!blob || !blob.size) return;
    if (!TCACHE[k]) {
      TORDER.push(k);
      while (TORDER.length > TMAX) {
        var old = TORDER.shift();
        if (old !== k) delete TCACHE[old];
      }
    }
    TCACHE[k] = blob;
  }

  /* 只负责把音频拿回来，不播。say 和 prefetch 共用这一条。 */
  function fetchBlob(body, opts, timeout) {
    if (typeof fetch !== "function" || typeof URL === "undefined") return Promise.resolve(null);
    var ctl = null;
    try { ctl = new AbortController(); } catch (e) {}
    var timer = setTimeout(function () {
      if (ctl) { try { ctl.abort(); } catch (e) {} }
    }, timeout || 9000);
    return fetch(ttsURL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: opts.id || "",
        primary: opts.primary || "",
        scene: opts.scene || "dialog",    /* dialog=贴话筒说话，不带展厅回音 */
        text: body
      }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      return r.ok ? r.blob() : null;
    }, function (e) {
      clearTimeout(timer);
      return null;
    });
  }

  /* 提前合成，不播。界面负责在文字刚出现时调它，把 2~4 秒藏在打字机后面。 */
  function prefetch(text, opts) {
    opts = opts || {};
    if (!enabled()) return;
    var body = clean(text);
    if (!body) return;
    var k = tkey(opts, body);
    if (tget(k)) return;
    fetchBlob(body, opts, 8000).then(function (b) { tput(k, b); }, function () {});
  }

  function sayRemote(body, opts, seq, timeout) {
    if (typeof fetch !== "function" || typeof URL === "undefined") return Promise.resolve(false);
    var k = tkey(opts, body);
    var hit = tget(k);
    var got = hit ? Promise.resolve(hit)
                  : fetchBlob(body, opts, timeout).then(function (b) { tput(k, b); return b; });
    return got.then(function (blob) {
      if (!blob || !blob.size) return false;
      if (seq !== saySeq) return false;           /* 已经换了一句，这条作废 */
      var url = URL.createObjectURL(blob);
      var a = getAudio();
      return new Promise(function (res) {
        var done = false;
        function fin(ok) {
          if (done) return;
          done = true;
          try { URL.revokeObjectURL(url); } catch (e) {}
          res(ok);
        }
        a.onplaying = null;
        a.onended = function () { fin(true); };
        a.onerror = function () { fin(false); };
        try {
          a.src = url;
          var p = a.play();
          if (p && p.catch) p.catch(function () { fin(false); });
        } catch (e) { fin(false); }
      });
    });
  }

  /* 系统语音兜底：服务端不可用（桥没起 / 没装 edge-tts / 断网）时用 */
  function sayLocal(body, opts) {
    var t = toneFor(opts.primary);
    var u = new SpeechSynthesisUtterance(body);
    u.lang = "zh-CN";
    u.rate = opts.rate || t.rate;
    u.pitch = opts.pitch || t.pitch;
    u.volume = 1;
    var v = pickVoice(t.prefer);
    if (v) u.voice = v;
    return new Promise(function (res) {
      var done = false;
      function fin(ok) { if (done) return; done = true; res(ok); }
      u.onend = function () { fin(true); };
      u.onerror = function () { fin(false); };
      /* 新的这句顶掉上一句：对话场景里排队朗读听起来像卡带 */
      try { speechSynthesis.cancel(); } catch (e) {}
      try { speechSynthesis.speak(u); } catch (e) { fin(false); }
      /* 个别浏览器既不触发 end 也不触发 error，兜一次底 */
      setTimeout(function () { fin(true); }, Math.max(4000, body.length * 400));
    });
  }

  /* 远程合成带重试：网络抖一下就换嗓子，代价太大，先自己补一次。
     服务端 edge-tts 正常 2~4 秒，8 秒足够；重试给短一点，别让人干等。 */
  function sayRetry(body, opts, seq, left) {
    return sayRemote(body, opts, seq, left > 0 ? 8000 : 6000).then(function (ok) {
      if (ok) { LOCK.on = true; LOCK.at = Date.now(); return true; }
      if (seq !== saySeq) return false;          /* 已被后一句顶掉，别补念 */
      if (left > 0) return sayRetry(body, opts, seq, left - 1);
      return false;
    });
  }

  /* 朗读一段文字，返回 Promise<boolean> */
  function say(text, opts) {
    opts = opts || {};
    if (!enabled()) return Promise.resolve(false);
    var body = clean(text);
    if (!body) return Promise.resolve(false);
    /* 说新的一句就独占发声。opts.keepStory 供 tell() 内部降级使用——
       那种情况属于同一段故事换了个嗓子，不能把自己的会话掐掉。 */
    if (!opts.keepStory) {
      halt(true);                       /* 让正在讲的故事收尾并复位界面 */
      killAudio();
    }
    warmVoices();
    var seq = ++saySeq;
    return sayRetry(body, opts, seq, 1).then(function (ok) {
      if (ok) return true;
      if (seq !== saySeq) return false;  /* 已被后一句顶掉，别再补念一遍 */
      if (!synthOK()) return false;
      /* 这轮对话里已经出过它自己的嗓子 → 绝不换人。
         宁可这一句不念（字还在屏幕上），也不能上一句是它、下一句变机器。
         只有从没成功过，或者锁已过期（网确实不行了），才允许回落并告知界面。 */
      if (!opts.keepStory && LOCK.on && (Date.now() - LOCK.at) < LOCK_MS) {
        try { W.dispatchEvent(new CustomEvent("voice:mute")); } catch (e) {}
        return false;
      }
      try { W.dispatchEvent(new CustomEvent("voice:fallback")); } catch (e) {}
      return sayLocal(body, opts);
    });
  }

  /* 让某件文物从头讲自己的故事。
     opts.onSeg(i, text) 每段开始回调，供界面高亮字幕
     opts.onEnd() 全部讲完
     返回 Promise：true 表示正常讲完，false 表示被打断 */
  function tell(spirit, opts) {
    opts = opts || {};
    /* 静音或没数据时也要回调 onEnd，否则调用方的按钮会一直停在"停下" */
    if (!enabled() || !spirit) {
      if (opts.onEnd) opts.onEnd();
      return Promise.resolve(false);
    }
    var segs = (spirit.comic && spirit.comic.length) ? spirit.comic.slice()
             : (spirit.intro ? [spirit.intro] : []);
    if (!segs.length) {
      if (opts.onEnd) opts.onEnd();
      return Promise.resolve(false);
    }

    stop(true);                              /* 清场，但不惊动界面 */
    var self = { halted: false, silentEnd: false, done: null, finished: false };
    cur = self;
    var i = 0;

    return new Promise(function (resolve) {
      function fin(ok) {
        if (self.finished) return;           /* stop 与自然结束可能同时到 */
        self.finished = true;
        if (self.done === fin) self.done = null;
        if (cur === self) cur = null;
        /* 被静音或换人的清场不该让界面误判成"用户按了停止" */
        if (!self.silentEnd) {
          try { W.dispatchEvent(new CustomEvent("voice:stop")); } catch (e) {}
        }
        if (opts.onEnd) opts.onEnd();
        resolve(ok);
      }
      self.done = fin;                       /* 供 stop() 立刻收尾 */
      function next() {
        if (self.halted) { fin(false); return; }
        if (i >= segs.length) { fin(true); return; }
        var idx = i++;
        var text = segs[idx];
        if (opts.onSeg) opts.onSeg(idx, text);

        var a = getAudio();
        var settled = false;
        var sounding = false;              /* 这一段是否真的出过声 */
        function advance(ok) {
          if (settled) return;
          settled = true;
          if (self.halted) { fin(false); return; }
          next();
        }
        /* 预生成音频不可用 → 用浏览器合成读这一段，保证不断档。
           先 killAudio：mp3 若已经出声，两路就会叠成两个嗓子。 */
        function fallback() {
          if (settled) return;
          settled = true;
          killAudio();
          if (self.halted) { fin(false); return; }
          say(text, { primary: spirit.primary, id: spirit.id, keepStory: true }).then(next, next);
        }

        a.onplaying = function () { sounding = true; };
        a.onended = function () { advance(true); };
        a.onerror = function () {
          /* 只有"确实读不出来"才算故障。被下一次播放打断产生的 abort
             （MEDIA_ERR_ABORTED = 1）不算，否则会白白插进一段 TTS 和音频抢声音。 */
          var e = a.error;
          if (e && e.code === 1) return;
          fallback();
        };
        try {
          a.src = BASE + spirit.id + "/seg" + idx + ".mp3";
          var p = a.play();
          if (p && p.catch) {
            p.catch(function (err) {
              /* AbortError = 被后一次播放顶掉，属于正常打断 */
              if (err && err.name === "AbortError") return;
              /* 已经响过的不再补念，避免重复 */
              if (sounding) return;
              fallback();
            });
          }
        } catch (e) { fallback(); }
      }
      next();
    });
  }

  /* 只读诊断，方便自检脚本核对 */
  function probe() {
    return {
      version: VERSION,
      enabled: enabled(),
      synth: synthOK(),
      voices: allVoices().filter(function (v) { return /^zh/i.test(v.lang || ""); })
        .map(function (v) { return v.name + " (" + v.lang + ")"; })
    };
  }

  W.Voice = {
    version: VERSION,
    tell: tell,
    say: say,
    prefetch: prefetch,
    stop: stop,
    enabled: enabled,
    setEnabled: setEnabled,
    toneFor: toneFor,
    probe: probe
  };
})();
