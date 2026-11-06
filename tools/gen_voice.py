# -*- coding: utf-8 -*-
"""为每件文物生成"自述"语音（v2：专属音色 + 展陈空间后期）。

相比 v1 改了两件事：
  1. 音色不再"一种材质一个嗓子"。每种材质给 2~3 个候选音色，再按 id
     派生独立的音高/语速签名，74 件文物得到 74 个可分辨的声线。
  2. 合成后过一遍 tools/voice_dsp.py：按材质套不同"展陈空间"的卷积混响，
     补低频、压齿音、统一响度。v1 直接输出的是 24k 单声道干声，听感像
     "贴着麦克风念稿"，这是"太干"的根源。

输入：%TEMP%/relic_voice/spirits.json（由 data.js 的 SPIRITS 导出）
输出：audio/{id}/seg{n}.mp3 + audio/index.json

用法：
  python tools/gen_voice.py --preview 6   # 只做 6 件，产出试听包
  python tools/gen_voice.py               # 全量，已存在的跳过
  python tools/gen_voice.py --force       # 全部重生成
"""
import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
import tempfile

import edge_tts

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice_dsp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(os.environ.get("TEMP", "/tmp"), "relic_voice", "spirits.json")
OUT = os.path.join(ROOT, "audio")

# 材质 → 候选声线。同材质内按 id 稳定挑选，避免 32 件青铜器共用一个嗓子。
#   voice  : edge-tts 音色
#   rate   : 基础语速（相对），负数更慢更稳
#   pitch  : 基础音高偏置（Hz），负数更沉
#   note   : 给人看的说明
PALETTE = {
    "bronze": [
        ("zh-CN-YunjianNeural", "-9%",  "-6Hz", "浑厚男声，纪录片旁白感"),
        ("zh-CN-YunyangNeural", "-6%",  "-2Hz", "播音男声，字正腔圆"),
        ("zh-CN-YunxiNeural",   "-4%",  "-10Hz","年轻男声压低，沉而不老"),
    ],
    "stone": [
        ("zh-CN-YunjianNeural", "-15%", "-9Hz", "更慢更沉，石窟回响"),
        ("zh-CN-YunyangNeural", "-12%", "-5Hz", "沉稳播音，庄重"),
    ],
    "ceramic": [
        ("zh-CN-XiaoxiaoNeural", "-2%", "+2Hz", "温暖女声，清亮"),
        ("zh-CN-XiaoyiNeural",   "+1%", "+5Hz", "明亮女声，轻快"),
    ],
    "jade": [
        ("zh-CN-XiaoyiNeural",   "-5%", "-2Hz", "柔和女声，温润"),
        ("zh-CN-XiaoxiaoNeural", "-7%", "-4Hz", "低语感女声，克制"),
    ],
    "gold": [
        ("zh-CN-YunxiNeural",   "+3%", "+4Hz", "年轻男声，明快"),
        ("zh-CN-YunxiaNeural",  "+2%", "+8Hz", "少年音，跳脱"),
    ],
    "painting": [
        ("zh-CN-YunyangNeural", "-9%", "+1Hz", "雅致播音，书卷气"),
        ("zh-CN-XiaoxiaoNeural", "-6%", "-1Hz", "舒缓女声，讲画"),
    ],
    "wood": [
        ("zh-CN-YunjianNeural", "-7%", "-3Hz", "敦厚男声"),
        ("zh-CN-YunxiNeural",   "-3%", "+1Hz", "清朗男声"),
    ],
}
DEFAULT_PALETTE = PALETTE["ceramic"]


def clean(t):
    """把半角标点换成全角，TTS 才会给出自然停顿。"""
    t = t.replace(",", "，").replace(";", "；").replace(":", "：")
    t = t.replace("?", "？").replace("!", "！")
    t = re.sub(r"\s+", "", t)
    return t.strip()


def _h(rid, salt=""):
    return int(hashlib.md5((rid + salt).encode("utf-8")).hexdigest()[:6], 16)


def voice_for(item):
    """给一件文物定声线：候选里稳定挑一个，再叠加它自己的音高/语速签名。"""
    rid = item["id"]
    mat = voice_dsp.material_of(item.get("primary"))
    pool = PALETTE.get(mat, DEFAULT_PALETTE)
    voice, rate, pitch, note = pool[_h(rid, "v") % len(pool)]

    # 音高签名：±7 Hz，让同音色的文物也能一耳朵分开
    p = int(pitch.rstrip("Hz")) + (_h(rid, "p") % 15) - 7
    # 语速签名：±3%，只在慢的基础上微调，不打断叙述节奏
    r = int(rate.rstrip("%")) + (_h(rid, "r") % 7) - 3

    return {
        "voice": voice,
        "rate": "%+d%%" % r,
        "pitch": "%+dHz" % p,
        "material": mat,
        "note": note,
    }


async def synth(text, v, dst):
    """合成一段，失败重试三次。"""
    for attempt in range(3):
        try:
            await edge_tts.Communicate(text, v["voice"], rate=v["rate"], pitch=v["pitch"]).save(dst)
            if os.path.exists(dst) and os.path.getsize(dst) > 800:
                return True
        except Exception as e:
            if attempt == 2:
                print("      ! %s: %s" % (type(e).__name__, str(e)[:70]))
        await asyncio.sleep(0.8 * (attempt + 1))
    return False


async def one(sem, item, force, tmpdir):
    rid = item["id"]
    segs = [clean(t) for t in item.get("comic", []) if clean(t)]
    if not segs:
        return 0, 0
    v = voice_for(item)
    d = os.path.join(OUT, rid)
    os.makedirs(d, exist_ok=True)
    made = skipped = 0

    for i, t in enumerate(segs):
        final = os.path.join(d, "seg%d.mp3" % i)
        if os.path.exists(final) and os.path.getsize(final) > 1000 and not force:
            skipped += 1
            continue
        async with sem:
            raw = os.path.join(tmpdir, "%s_%d.mp3" % (rid, i))
            if not await synth(t, v, raw):
                continue
            # 后期：素材空间 + 音色修正
            ok = voice_dsp.process_file(raw, final, v["material"], seed=_h(rid, "s") + i)
            if not ok:
                # 后期失败就退回原声，宁可"干"也不能没声音
                os.replace(raw, final)
            else:
                try:
                    os.remove(raw)
                except OSError:
                    pass
            made += 1
    return made, skipped


async def run(limit=None, force=False, only=None):
    with open(DATA, encoding="utf-8") as f:
        spirits = json.load(f)
    if only:
        spirits = [s for s in spirits if s["id"] in only]
    if limit:
        # 每个材质各取若干，保证试听覆盖全部声线
        bymat, picked = {}, []
        for s in spirits:
            m = voice_dsp.material_of(s.get("primary"))
            if len(bymat.setdefault(m, [])) < max(1, limit // 6):
                bymat[m].append(s)
        for m in bymat:
            picked.extend(bymat[m])
        spirits = picked[:limit] if limit else picked

    total_seg = sum(len([t for t in s.get("comic", []) if clean(t)]) for s in spirits)
    print("准备生成 %d 件 / %d 段" % (len(spirits), total_seg))

    sem = asyncio.Semaphore(6)
    tmpdir = tempfile.mkdtemp(prefix="relic_tts_")
    made = skipped = 0
    index = {}

    async def worker(item):
        nonlocal made, skipped
        m, s = await one(sem, item, force, tmpdir)
        made += m
        skipped += s
        v = voice_for(item)
        n = len([t for t in item.get("comic", []) if clean(t)])
        size = sum(os.path.getsize(os.path.join(OUT, item["id"], "seg%d.mp3" % i))
                   for i in range(n)
                   if os.path.exists(os.path.join(OUT, item["id"], "seg%d.mp3" % i)))
        index[item["id"]] = {
            "n": n, "bytes": size, "material": v["material"],
            "voice": v["voice"].replace("zh-CN-", "").replace("Neural", ""),
            "rate": v["rate"], "pitch": v["pitch"],
        }
        print("  %-16s %-12s %-2d 段  %s %s %s" % (
            item["id"], item["name"][:10], n, v["voice"].replace("zh-CN-", "").replace("Neural", ""),
            v["rate"], v["pitch"]))

    await asyncio.gather(*(worker(s) for s in spirits))

    # 索引：全量模式下把已有条目也读回来，避免只写本次的子集
    idx_path = os.path.join(OUT, "index.json")
    if not force and os.path.exists(idx_path) and (limit or only):
        try:
            with open(idx_path, encoding="utf-8") as f:
                old = json.load(f)
            old.update(index)
            index = old
        except Exception:
            pass
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1, sort_keys=True)

    print("\n新生成 %d 段，跳过 %d 段，索引 %d 件" % (made, skipped, len(index)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", type=int, default=0)
    a = ap.parse_args()
    only = set(x for x in a.only.split(",") if x) or None
    limit = a.preview or a.limit or None
    asyncio.run(run(limit=limit, force=a.force, only=only))


if __name__ == "__main__":
    main()
