# -*- coding: utf-8 -*-
"""量化"AI 味"：把几段同文本音频摊成可比指标。

"念稿感"在声学上不是玄学，主要看三件事：
  1. 音高起伏（F0 变异系数）——平直 = 播音腔，起伏大 = 有人味
  2. 能量包络起伏——真人一句话里轻重变化明显，TTS 往往一条水平线
  3. 停顿时长分布——真人有犹豫、有换气，TTS 的停顿时长高度一致

用法：py -3.11 tools/voice_analyze.py a.mp3 b.mp3 ...
"""
import os
import subprocess
import sys
import wave

import imageio_ffmpeg
import numpy as np

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 16000
FRAME = int(SR * 0.025)   # 25 ms
HOP = int(SR * 0.010)     # 10 ms


def decode(path):
    tmp = os.path.join(os.environ.get("TEMP", "/tmp"), "_va_%d.wav" % os.getpid())
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(SR), tmp],
        check=True,
    )
    with wave.open(tmp) as w:
        raw = w.readframes(w.getnframes())
    os.remove(tmp)
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def f0_track(x):
    """自相关法估基频，只在有声帧上给值。"""
    frames = 1 + max(0, (len(x) - FRAME) // HOP)
    lo, hi = int(SR / 400), int(SR / 70)   # 70–400 Hz
    out = []
    for i in range(frames):
        seg = x[i * HOP:i * HOP + FRAME]
        if len(seg) < hi + 2:
            break
        e = float(np.sqrt(np.mean(seg * seg)))
        if e < 0.012:                      # 静音帧
            out.append((e, 0.0))
            continue
        seg = seg - seg.mean()
        ac = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
        if ac[0] <= 0:
            out.append((e, 0.0))
            continue
        ac = ac / ac[0]
        w = ac[lo:hi]
        k = int(np.argmax(w))
        peak = float(w[k])
        out.append((e, SR / (lo + k) if peak > 0.32 else 0.0))
    return out


def stats(path):
    x = decode(path)
    dur = len(x) / SR
    tr = f0_track(x)
    voiced = [f for _, f in tr if f > 0]
    energy = np.array([e for e, _ in tr], dtype=np.float32)
    # 能量包络起伏：只看有声段的能量离散度
    if len(energy) > 8:
        idx = np.arange(len(energy))
        act = energy > np.percentile(energy, 40)
        e_act = energy[act]
        e_cv = float(e_act.std() / (e_act.mean() + 1e-9))
    else:
        e_cv = 0.0
    # 停顿：能量低于阈值并持续 >120ms 的片段
    pauses, run = [], 0
    thr = max(0.006, float(np.percentile(energy, 12)) if len(energy) else 0.006)
    for e in energy:
        if e < thr:
            run += 1
        else:
            if run * 0.01 >= 0.12:
                pauses.append(run * 0.01)
            run = 0
    if run * 0.01 >= 0.12:
        pauses.append(run * 0.01)
    f0 = np.array(voiced)
    return {
        "file": os.path.basename(path),
        "dur": dur,
        "f0_mean": float(f0.mean()) if len(f0) else 0.0,
        "f0_cv": float(f0.std() / f0.mean()) if len(f0) else 0.0,   # 音高起伏
        "f0_range": float(np.percentile(f0, 95) - np.percentile(f0, 5)) if len(f0) > 4 else 0.0,
        "e_cv": e_cv,                                              # 能量起伏
        "pauses": len(pauses),
        "pause_cv": float(np.std(pauses) / (np.mean(pauses) + 1e-9)) if len(pauses) > 1 else 0.0,
        "voiced_ratio": len(voiced) / max(1, len(tr)),
    }


def main():
    rows = [stats(p) for p in sys.argv[1:]]
    print("%-22s %6s %7s %7s %7s %7s %6s %7s" %
          ("文件", "时长", "F0均值", "F0起伏", "音域", "能量起伏", "停顿", "停顿差异"))
    for r in rows:
        print("%-22s %6.2fs %6.1fHz %7.3f %6.1fHz %7.3f %6d %7.3f" % (
            r["file"][:20], r["dur"], r["f0_mean"], r["f0_cv"],
            r["f0_range"], r["e_cv"], r["pauses"], r["pause_cv"]))
    # 相对基线：F0 起伏越大越不像念稿
    if len(rows) > 1:
        base = rows[0]
        print("\n相对「%s」的音高起伏倍数：" % base["file"][:20])
        for r in rows[1:]:
            mult = r["f0_cv"] / (base["f0_cv"] + 1e-9)
            print("  %-20s %+.0f%%" % (r["file"][:20], (mult - 1) * 100))


if __name__ == "__main__":
    main()
