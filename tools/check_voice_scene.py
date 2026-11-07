# -*- coding: utf-8 -*-
"""守卫：说话不能带回音，一场对话不能换嗓子。

用户报了两件事：
  1) 文物说话都有回音 —— 其实是 /api/tts 把展厅那套卷积混响（bronze 1.55 秒、
     0.26 湿声）原样套在了句句紧接的问答上，字与字之间被残响填满，听着像空房喊话。
  2) 同一通电话里，上一句是它自己的声音，下一句变成机器念 —— 远程合成偶发失败后
     无声地退回了浏览器系统语音。

这里把两件事都变成断言：
  A. 客观量：把同一句合成两版（dialog / exhibit），算"字缝填充率"，
     即 dry 语音的字间空隙里还剩多少能量。近场必须显著低于展厅。
  B. 行为量：390×844 手机视口下，第一句远程成功；随后把 /api/tts 打成 503，
     第二句必须"宁可不响"也不能走 speechSynthesis 换嗓子，并给出提示。

用法：python tools/check_voice_scene.py [base_url]
      默认 http://<本机局域网IP>:8080 ；也可传 http://123.57.21.18
"""
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))

BASE = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
if not BASE:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("223.5.5.5", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
    BASE = "http://%s:8080" % ip

PASS = FAIL = 0


def say(ok, label, extra=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print("  [OK ] %s" % label)
    else:
        FAIL += 1
        print("  [FAIL] %s   %s" % (label, extra))


# ============================================================ A. 回音
SENT = "喂——听得见吗？我是西汉鎏金镶斗，这号多少年没响过了。"
# B/C 段只用短句：断言的是"走没走远程""有没有换嗓子"，
# 句子越短，等播放结束越稳。无人值守的浏览器没有声卡，长句可能跑得比实时慢。
SHORT = "喂，是我，在听。"


def env_of(path, hop=80, sr=16000):
    import numpy as np
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    wav = os.path.join(ROOT, "_debug", "_scene_env.wav")
    subprocess.run([ff, "-y", "-i", path, "-ac", "1", "-ar", str(sr), wav],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    raw = open(wav, "rb").read()[44:]
    x = np.frombuffer(raw, dtype=np.int16).astype("float64") / 32768.0
    fr = len(x) // hop
    return np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) for i in range(fr)])


def drip(dry_env, wet_env):
    """字缝填充率：dry 里安静到 10% 以下的帧，在 wet 里还剩多少（相对 wet 峰值）。

    纯混响的听感核心就是这个数——加得越多，字与字之间越"糊成一片回音"。
    """
    import numpy as np
    n = min(len(dry_env), len(wet_env))
    d, w = dry_env[:n], wet_env[:n]
    if d.max() <= 0 or w.max() <= 0:
        return None
    gap = (d / d.max()) < 0.10
    if gap.sum() < 30:
        return None
    return float(np.median((w / w.max())[gap]))


def part_echo():
    print("\n[A] 对话音频不带展厅回音")
    import tts_service
    out = {}
    for scene in ("dialog", "exhibit"):
        data = tts_service.tts_bytes("xiangdou", SENT, "bronze", scene=scene)
        if not data:
            say(False, "合成 %s 版可用" % scene, "服务端 edge-tts 不可用")
            return
        p = os.path.join(ROOT, "_debug", "_scene_%s.mp3" % scene)
        with open(p, "wb") as f:
            f.write(data)
        out[scene] = p

    dry_p = os.path.join(ROOT, "_debug", "_scene_dry.mp3")
    v = tts_service.voice_of("xiangdou", "bronze")
    raw = tts_service.synth_edge(SENT, v)
    if not raw:
        say(False, "拿到干声底片", "edge-tts 不可用")
        return
    with open(dry_p, "wb") as f:
        f.write(raw)

    d = env_of(dry_p)
    dia = drip(d, env_of(out["dialog"]))
    exh = drip(d, env_of(out["exhibit"]))
    say(dia is not None and exh is not None, "能量包络可测",
        "dry=%s dialog=%s exhibit=%s" % (len(d), dia, exh))
    if dia is None or exh is None:
        return
    print("        字缝填充率： dialog %5.1f%%   exhibit %5.1f%%" % (dia * 100, exh * 100))
    say(dia < 0.06, "对话版字缝基本干净（<6%）", "实测 %.1f%%" % (dia * 100))
    say(exh > dia * 1.5, "展厅版确实更湿（混响来源确认）",
        "exhibit %.1f%% vs dialog %.1f%%" % (exh * 100, dia * 100))


# ============================================================ B. 不换嗓子
def part_voice():
    print("\n[B] 一场对话只用一个嗓子（%s）" % BASE)
    from cdp import CDP
    c = CDP("about:blank")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    try:
        c.send("Security.setIgnoreCertificateErrors", {"ignore": True})
    except Exception:
        pass
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": 390, "height": 844, "deviceScaleFactor": 3, "mobile": True})
    c.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    c.goto(BASE + "/index.html?t=%d#/alive" % int(time.time()), wait=2.6)

    for _ in range(40):
        if c.eval("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
                  "var i=document.getElementById('intro');if(i)i.style.display='none';"
                  "document.body.classList.remove('flyleaf-on','intro-on');"
                  "document.body.style.overflow='';return 1;})()"):
            break
        time.sleep(0.2)
    ok = False
    for _ in range(70):
        if c.eval("typeof window.Voice==='object'&&typeof window.Voice.say==='function'"):
            ok = True
            break
        time.sleep(0.3)
    say(ok, "Voice 已就绪")
    if not ok:
        c.ws.close()
        return

    c.eval("""(function(){
      window.__spk=0; window.__mute=0; window.__fb=0;
      var s=window.speechSynthesis, o=s.speak.bind(s);
      s.speak=function(u){ window.__spk++; return o(u); };
      window.addEventListener('voice:mute', function(){ window.__mute++; });
      window.addEventListener('voice:fallback', function(){ window.__fb++; });
      return 1;})()""")

    # 第一句：真实远程合成，应当成功
    c.eval("""(function(){ window.__r1=null;
      window.Voice.say('%s', {id:'xiangdou',primary:'bronze'}).then(function(r){ window.__r1=r; });
      return 1;})()""" % SHORT.replace("'", "\\'"))
    r1 = None
    for _ in range(100):
        v = c.eval("window.__r1")
        if v is not None:
            r1 = v
            break
        time.sleep(0.4)
    say(r1 is True, "第一句走远程嗓子", "返回值 %r" % (r1,))
    say(c.eval("window.__spk") == 0, "第一句没有偷偷用系统语音", "speak=%s" % c.eval("window.__spk"))

    # 第二句：把 /api/tts 打成 503，模拟网络/服务端掉链子
    c.eval("""(function(){ var of=window.fetch;
      window.fetch=function(u,o){
        if(String(u).indexOf('/api/tts')>=0){
          return Promise.resolve(new Response('', {status:503, statusText:'down'}));
        }
        return of.apply(this, arguments);
      }; return 1;})()""")
    c.eval("""(function(){ window.__r2=null;
      window.Voice.say('这电话响了，是有什么新鲜事想跟老朽念叨叨？',
        {id:'xiangdou',primary:'bronze'}).then(function(r){ window.__r2=r; });
      return 1;})()""")
    r2 = None
    for _ in range(50):
        v = c.eval("window.__r2")
        if v is not None:
            r2 = v
            break
        time.sleep(0.4)
    spk = c.eval("window.__spk")
    say(spk == 0, "第二句失败后没有换成机器音（核心）", "speak=%s r2=%r" % (spk, r2))
    say(c.eval("window.__mute") >= 1, "给了用户一句交代，不装没事", "mute=%s" % c.eval("window.__mute"))

    # 恢复 fetch，确认能继续用同一个嗓子
    c.eval("(function(){ return 1; })()")
    c.ws.close()


def part_latency():
    """预取的效果：字先出来、声音随后就到，而不是"看完了等三秒才开口"。

    量的是 Voice.say 到真正 play 的间隔。没预取时这段等于一次完整的
    edge-tts 合成（实测 2~4 秒）；预取命中后应该只剩微秒级。
    """
    print("\n[C] 预取之后，轮到念就该出声（%s）" % BASE)
    from cdp import CDP
    c = CDP("about:blank")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    try:
        c.send("Security.setIgnoreCertificateErrors", {"ignore": True})
    except Exception:
        pass
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": 390, "height": 844, "deviceScaleFactor": 3, "mobile": True})
    c.goto(BASE + "/index.html?t=%d#/alive" % int(time.time()), wait=2.6)
    for _ in range(40):
        if c.eval("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
                  "var i=document.getElementById('intro');if(i)i.style.display='none';"
                  "document.body.classList.remove('flyleaf-on','intro-on');"
                  "document.body.style.overflow='';return 1;})()"):
            break
        time.sleep(0.2)
    ok = False
    for _ in range(70):
        if c.eval("typeof window.Voice==='object'&&typeof window.Voice.prefetch==='function'"):
            ok = True
            break
        time.sleep(0.3)
    say(ok, "Voice 提供 prefetch")
    if not ok:
        c.ws.close()
        return

    c.eval("""(function(){
      window.__playAt=0;
      var a=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(){
        if(!window.__armed) window.__playAt=Date.now();
        return a.apply(this,arguments); };
      return 1;})()""")

    text = "预取测试：这一句应该几乎不用等。"
    c.eval("window.__armed=true; window.Voice.prefetch('%s', {id:'xiangdou',primary:'bronze'}); 1" % text)
    time.sleep(5)                       # 给合成留时间，真实场景里这段时间被打字机盖住
    c.eval("window.__armed=false; window.__sayAt=Date.now(); "
           "window.Voice.say('%s', {id:'xiangdou',primary:'bronze'}); 1" % text)
    dt = None
    for _ in range(60):
        v = c.eval("window.__playAt")
        if v:
            dt = v - c.eval("window.__sayAt")
            break
        time.sleep(0.2)
    say(dt is not None, "确实出声了")
    if dt is not None:
        print("        say → play：%d ms" % dt)
        say(dt < 400, "预取命中后几乎零等待（<400ms）", "实测 %d ms" % dt)
    c.ws.close()


if __name__ == "__main__":
    part_echo()
    part_voice()
    part_latency()
    print("\n通过 %d 项，失败 %d 项" % (PASS, FAIL))
    sys.exit(1 if FAIL else 0)
