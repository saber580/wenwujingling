/* 语音模块回归测试。
   重点不是"能不能播"，而是"会不会两个声音一起响"——
   历史上踩过的坑：play() 被 AbortError 打断后误判成文件损坏，
   于是降级到浏览器 TTS，而 mp3 同时也在播，同一段被念了两遍。 */
const fs = require('fs'), vm = require('vm');
const realSetTimeout = setTimeout;

function makeEnv(opts) {
  const o = opts || {};
  const played = [];      // 依次加载过的音频地址
  const spoken = [];      // 交给浏览器合成的文本
  const pauses = [];      // pause 调用记录
  const events = [];
  let cur = null;         // 当前 Audio 实例，供断言检查
  let resolveFetch = null;

  function AudioMock() {
    const self = this;
    this.preload = '';
    this._src = '';
    this.error = null;
    this.paused = true;
    this._started = false;
    cur = self;

    Object.defineProperty(this, 'src', {
      get() { return self._src; },
      set(v) {
        /* 真实浏览器换源会打断上一次，这里可选地复现那次 abort */
        if (o.abortOnSwitch && self._src && self._started) {
          self._started = false;
          self.error = { code: 1, message: 'MEDIA_ERR_ABORTED' };
          if (self.onerror) self.onerror();
          self.error = null;
        }
        self._src = v;
        self.paused = true;
        played.push(v);
        realSetTimeout(() => {
          if (self._src !== v) return;              // 已被换掉，别再回调
          if (o.failAll || (o.failOn && o.failOn.test(v))) {
            self.error = { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
            if (self.onerror) self.onerror();
            self.error = null;
          } else {
            self.paused = false;
            self._started = true;
            if (self.onplaying) self.onplaying();
            realSetTimeout(() => {
              if (self._src !== v || self.paused) return;
              self._started = false;
              if (self.onended) self.onended();
            }, 5);
          }
        }, 1);
      }
    });

    this.play = function () {
      if (o.autoplayBlocked) {
        const e = new Error('blocked');
        e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      if (o.abortOnPlay) {
        const e = new Error('aborted');
        e.name = 'AbortError';
        return Promise.reject(e);
      }
      return Promise.resolve();
    };
    this.pause = function () { self.paused = true; pauses.push(self._src); };
    this.load = function () {};
    this.removeAttribute = function (n) { if (n === 'src') self._src = ''; };
  }

  const ctx = vm.createContext({
    console, Promise, JSON, Math, Object, Array, String, Number, RegExp, Date, Error,
    setTimeout: (f, ms) => realSetTimeout(f, ms || 0),
    clearTimeout: () => {},
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } },
    CustomEvent: function (n, d) { this.type = n; this.detail = d && d.detail; },
    dispatchEvent: function (e) { events.push(e.type); return true; },
    addEventListener: () => {},
    Audio: AudioMock,
    // 服务端合成模拟：ok=立刻返回音频，pending=由测试手动放行（模拟"关抽屉后才回来"）
    fetch: !o.mockFetch ? undefined : function () {
      const reply = { ok: true, blob: () => Promise.resolve({ size: 100 }) };
      if (o.mockFetch === 'ok') return Promise.resolve(reply);
      return new Promise((res) => { resolveFetch = res; });
    },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    AbortController: function () { this.signal = {}; this.abort = () => {}; },
    speechSynthesis: o.noSynth ? undefined : {
      speak(u) { spoken.push(u.text); realSetTimeout(() => u.onend && u.onend(), 2); },
      cancel() {},
      getVoices() { return [{ name: 'Microsoft Huihui', lang: 'zh-CN' }]; }
    },
    SpeechSynthesisUtterance: function (t) { this.text = t; }
  });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync('js/voice.js', 'utf8'), ctx, { filename: 'voice.js' });
  return {
    ctx, played, spoken, pauses, events,
    audio: () => cur,
    releaseFetch: () => resolveFetch && resolveFetch({ ok: true, blob: () => Promise.resolve({ size: 100 }) })
  };
}

const spirit = { id: 'wuzhuqian', primary: 'bronze', comic: ['第一段', '第二段', '第三段'] };

(async () => {
  let pass = 0, total = 0;
  function chk(name, cond, extra) {
    total++; if (cond) pass++;
    console.log((cond ? '  OK   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  }

  // 1. 正常逐段播放
  let env = makeEnv();
  let segs = [], ended = 0;
  let r = await env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i), onEnd: () => ended++ });
  chk('三段全部播放', segs.length === 3, JSON.stringify(segs));
  chk('段序正确', segs.join() === '0,1,2');
  chk('路径按 id 拼', env.played[0] === 'audio/wuzhuqian/seg0.mp3', env.played[0]);
  chk('onEnd 触发一次', ended === 1);
  chk('返回 true', r === true);
  chk('> 全程未触发 TTS（无重叠）', env.spoken.length === 0, JSON.stringify(env.spoken));

  // 2. 某段 404 → 退到浏览器合成，且只念这一遍
  env = makeEnv({ failOn: /seg1\.mp3$/ });
  segs = [];
  await env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  chk('404 后仍走完三段', segs.length === 3, 'seg=' + segs.join());
  chk('404 只补念坏掉的那一段', env.spoken.length === 1, JSON.stringify(env.spoken));

  // 3. 自动播放被拒 → 全部退到合成
  env = makeEnv({ autoplayBlocked: true });
  segs = [];
  await env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  chk('自动播放被拒仍完成', segs.length === 3, 'seg=' + segs.join());
  chk('合成被调用三次', env.spoken.length === 3, JSON.stringify(env.spoken));

  // 4. 换源时的 abort 不是故障，不该插一段 TTS
  env = makeEnv({ abortOnSwitch: true });
  segs = [];
  await env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  chk('换源 abort 不降级', env.spoken.length === 0, JSON.stringify(env.spoken));
  chk('换源 abort 后仍走完', segs.length === 3, 'seg=' + segs.join());

  // 5. play() 抛 AbortError（被后一次顶掉）也不该降级
  env = makeEnv({ abortOnPlay: true });
  segs = [];
  await env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  chk('AbortError 不触发 TTS', env.spoken.length === 0, JSON.stringify(env.spoken));

  // 6. 关闭声音后不播
  env = makeEnv();
  env.ctx.Voice.setEnabled(false);
  segs = [];
  r = await env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  chk('静音时不播放', segs.length === 0 && r === false);

  // 7. stop 打断后不再推进，且音频被真正掐掉
  env = makeEnv();
  segs = [];
  const p = env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  await new Promise((res) => realSetTimeout(res, 2));
  env.ctx.Voice.stop();
  await p;
  chk('stop 后不再推进', segs.length < 3, 'seg=' + segs.join());
  chk('stop 后音频已暂停', env.audio().paused === true);

  // 8. 讲故事途中插入一句闲聊：必须掐掉 mp3，不能两路一起响
  env = makeEnv();
  segs = [];
  const story = env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  await new Promise((res) => realSetTimeout(res, 2));
  const before = env.pauses.length;
  env.ctx.Voice.say('突然插一句话');
  await new Promise((res) => realSetTimeout(res, 2));
  chk('插话时掐掉了音频', env.pauses.length > before, 'pauses ' + before + '->' + env.pauses.length);
  chk('插话后只剩一路声音', env.spoken.length === 1 && env.audio().paused === true,
    'spoken=' + env.spoken.length + ' paused=' + env.audio().paused);
  env.ctx.Voice.stop();
  await story;

  // 9. 无 speechSynthesis 环境不崩
  env = makeEnv({ noSynth: true });
  segs = [];
  await env.ctx.Voice.tell(spirit, { onSeg: (i) => segs.push(i) });
  chk('无合成能力时不崩', segs.length === 3, 'seg=' + segs.join());

  // 10. 服务端合成正常时，AI 现说的话走同一条嗓子（不回落系统语音）
  env = makeEnv({ mockFetch: 'ok' });
  r = await env.ctx.Voice.say('这句走服务端合成');
  chk('服务端合成被播放', r === true && env.played.length === 1, 'played=' + env.played.length);
  chk('服务端合成时不重叠', env.spoken.length === 0, JSON.stringify(env.spoken));

  // 11. 点 × 退出后，在途合成结果回来也不许再开口
  env = makeEnv({ mockFetch: 'pending' });
  const late = env.ctx.Voice.say('关闭后才回来的这句话');
  await new Promise((res) => realSetTimeout(res, 2));
  env.ctx.Voice.stop();                 // 模拟 closeChat() 里的清场
  env.releaseFetch();
  r = await late;
  await new Promise((res) => realSetTimeout(res, 5));
  chk('退出后迟到的合成不发声', env.played.length === 0 && r === false,
    'played=' + env.played.length + ' ret=' + r);
  chk('退出后不回落到系统语音', env.spoken.length === 0, JSON.stringify(env.spoken));

  console.log('\n结果 ' + pass + '/' + total);
  process.exit(pass === total ? 0 : 1);
})();
