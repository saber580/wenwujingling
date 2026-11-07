# -*- coding: utf-8 -*-
"""现场语音合成（服务端模块，被 server.py 的 /api/tts 调用）。

「听它讲讲自己」的 mp3 是离线批量生成的，audio/index.json 里记着每件文物
当时用的 voice / rate / pitch / material。AI 现场生成的句子没有对应音频，
这里按同一份记录现合成，再套同一套展陈空间后期（tools/voice_dsp.py），
保证「边听边聊」和「听它讲讲自己」是同一个嗓子、同一个空间。

依赖（服务器）：pip3 install edge-tts numpy imageio-ffmpeg
任一环节不可用时返回原始干声 / None，页面会自动回落浏览器语音，不会哑掉。
"""
import asyncio
import hashlib
import json
import os
import sys
import tempfile
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
# 后期脚本仍然放在 tools/ 下，和本地目录结构保持一致
sys.path.insert(0, os.path.join(ROOT, "tools"))

VOICE_FULL = {
    "Xiaoxiao": "zh-CN-XiaoxiaoNeural",
    "Xiaoyi":   "zh-CN-XiaoyiNeural",
    "Yunjian":  "zh-CN-YunjianNeural",
    "Yunyang":  "zh-CN-YunyangNeural",
    "Yunxi":    "zh-CN-YunxiNeural",
    "Yunxia":   "zh-CN-YunxiaNeural",
}
# 与 tools/gen_voice.py 的 PALETTE 首项对齐：index.json 缺失时的兜底
MAT_VOICE = {
    "bronze":   ("Yunjian",  "-9%",  "-6Hz"),
    "stone":    ("Yunjian",  "-15%", "-9Hz"),
    "ceramic":  ("Xiaoxiao", "-2%",  "+2Hz"),
    "jade":     ("Xiaoyi",   "-5%",  "-2Hz"),
    "gold":     ("Yunxi",    "+3%",  "+4Hz"),
    "painting": ("Yunyang",  "-9%",  "+1Hz"),
    "wood":     ("Yunjian",  "-7%",  "-3Hz"),
}

_catalog = None
_cache = {}
_order = []
_lock = threading.Lock()
_sem = threading.Semaphore(3)          # 并发上限，别把 edge-tts 打崩
MAX = 240


def catalog():
    global _catalog
    if _catalog is None:
        try:
            with open(os.path.join(ROOT, "audio", "index.json"), encoding="utf-8") as f:
                _catalog = json.load(f)
        except Exception:
            _catalog = {}
    return _catalog


def voice_of(rid, primary=""):
    """这件文物的声线：优先照抄离线生成时的记录，保证前后是同一个人。"""
    it = catalog().get(rid) or {}
    fb = MAT_VOICE.get(primary or "", MAT_VOICE["ceramic"])
    return {
        "voice": VOICE_FULL.get(it.get("voice") or fb[0], "zh-CN-XiaoxiaoNeural"),
        "rate": it.get("rate") or fb[1],
        "pitch": it.get("pitch") or fb[2],
        "material": it.get("material") or primary or "ceramic",
    }


def _h(rid, salt=""):
    """与 tools/gen_voice.py 的派生方式一致，混响空间才对得上。"""
    return int(hashlib.md5((rid + salt).encode("utf-8")).hexdigest()[:6], 16)


def synth_edge(text, v):
    try:
        import edge_tts
    except Exception:
        return None
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)

        async def go():
            await edge_tts.Communicate(text, v["voice"], rate=v["rate"], pitch=v["pitch"]).save(tmp)

        with _sem:
            asyncio.run(go())
        if os.path.getsize(tmp) < 600:
            return None
        with open(tmp, "rb") as f:
            return f.read()
    except Exception:
        return None
    finally:
        if tmp:
            try:
                os.remove(tmp)
            except OSError:
                pass


def polish(raw, v, rid, space=None):
    """套离线生成时那套卷积混响 / 频响塑形；缺依赖就退回干声。

    space=None 时按材质用展厅参数（和预生成 mp3 一致）；
    传 voice_dsp.DIALOG_SPACE 则是"贴着话筒说话"的近场处理。
    """
    try:
        import voice_dsp
    except Exception:
        return raw
    a = b = None
    try:
        fd, a = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        fd, b = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        with open(a, "wb") as f:
            f.write(raw)
        if space is None:
            space = voice_dsp.SPACE.get(voice_dsp.material_of(v["material"]),
                                        voice_dsp.DEFAULT_SPACE)
        ok = voice_dsp.process_file(a, b, voice_dsp.material_of(v["material"]),
                                    seed=_h(rid or "default", "s"), space=space)
        if ok and os.path.getsize(b) > 600:
            with open(b, "rb") as f:
                return f.read()
    except Exception:
        pass
    finally:
        for p in (a, b):
            if p:
                try:
                    os.remove(p)
                except OSError:
                    pass
    return raw


def tts_bytes(rid, text, primary="", scene="dialog"):
    """合成并缓存；同一件文物同一句话只合一次。

    scene="dialog"（默认）—— 问答里现说的话，近场、不带殿宇回音；
    scene="exhibit"       —— 与预生成 mp3 同一套展厅空间，留给将来可能的用途。
    """
    v = voice_of(rid, primary)
    key = hashlib.md5((v["voice"] + v["rate"] + v["pitch"] + scene + "|" + text).encode("utf-8")).hexdigest()
    with _lock:
        hit = _cache.get(key)
    if hit is not None:
        return hit
    raw = synth_edge(text, v)
    if not raw:
        return None
    space = None
    if scene == "dialog":
        try:
            import voice_dsp
            space = voice_dsp.DIALOG_SPACE
        except Exception:
            space = None
    data = polish(raw, v, rid, space=space)
    with _lock:
        _cache[key] = data
        _order.append(key)
        while len(_order) > MAX:
            _cache.pop(_order.pop(0), None)
    return data
