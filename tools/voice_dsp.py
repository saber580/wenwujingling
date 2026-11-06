# -*- coding: utf-8 -*-
"""文物自述语音的后期处理（去"干"）。

为什么需要它：edge-tts 直接产出的是 24 kHz / 48 kbps 单声道干声——
高频被砍到 12 kHz 以上、没有空间反射、低频薄、齿音硬。听感上就是
"贴着麦克风念稿"，不像一件器物在展厅里跟你说话。

这里做四件事：
  1. 频响修正：补 160 Hz 附近的胸腔厚度，压 3.2 kHz 附近的硬齿音
  2. 空间卷积：按材质给不同"展陈空间"的脉冲响应做卷积混响
       bronze  大殿   长尾、低频足        → 编钟礼器的空间
       stone   石窟   最长尾、明显反射    → 石刻原址感
       jade    展柜   短尾、干净          → 玉器独立柜
       ceramic 展柜   短尾、略暖
       gold    展柜   短尾、亮
       painting/wood  书房   中等尾、温润
  3. 轻度饱和：tanh 软限幅，把弱音托起来，听感更"近"
  4. 响度归一：统一到 -20 dBFS RMS，峰值 -1.5 dBFS，避免忽大忽小

只依赖 numpy + ffmpeg（pip 的 imageio-ffmpeg 自带），不引入 scipy。
"""
import os
import subprocess
import sys

import numpy as np

SR = 48000                 # 统一在 48 kHz 处理，混响尾部才有空气感
TARGET_RMS = 10 ** (-20 / 20.0)
PEAK_CEIL = 10 ** (-1.5 / 20.0)

# 材质 → 空间参数
#   decay  : 混响尾巴的衰减时长（秒）
#   wet    : 湿声比例，越大越"远"
#   predelay: 干声到第一次反射的间隔（毫秒），太小会糊
#   damp   : 高频吸收系数，越大越暗（石头的空间更"吸"高频）
SPACE = {
    "bronze":   dict(decay=1.55, wet=0.26, predelay=24, damp=1.10, taps=14),
    "stone":    dict(decay=2.10, wet=0.32, predelay=34, damp=1.35, taps=18),
    "jade":     dict(decay=0.62, wet=0.17, predelay=14, damp=0.85, taps=8),
    "ceramic":  dict(decay=0.78, wet=0.19, predelay=16, damp=0.95, taps=9),
    "gold":     dict(decay=0.70, wet=0.18, predelay=15, damp=0.80, taps=8),
    "painting": dict(decay=0.95, wet=0.21, predelay=20, damp=1.00, taps=10),
    "wood":     dict(decay=0.88, wet=0.20, predelay=18, damp=1.05, taps=9),
}
DEFAULT_SPACE = dict(decay=0.85, wet=0.20, predelay=18, damp=1.00, taps=9)


# ----------------------------------------------------------------- ffmpeg
def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def decode(path):
    """mp3 → 48 kHz 单声道 float32"""
    cmd = [ffmpeg_exe(), "-v", "error", "-i", path,
           "-f", "f32le", "-acodec", "pcm_f32le", "-ar", str(SR), "-ac", "1", "pipe:1"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    if not raw:
        return None
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def encode(sig, path, bitrate="72k"):
    """双声道 float32 → mp3"""
    inter = np.empty((sig.shape[1], 2), dtype=np.float32)
    inter[:, 0] = sig[0]
    inter[:, 1] = sig[1]
    cmd = [ffmpeg_exe(), "-v", "error", "-y",
           "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0",
           "-codec:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), path]
    p = subprocess.run(cmd, input=inter.tobytes(), capture_output=True)
    return p.returncode == 0


# ------------------------------------------------------------- 脉冲响应
def make_ir(space, seed, side=0):
    """合成一条立体声脉冲响应。

    结构 = 直达 + 早期反射（离散抽头）+ 扩散尾（噪声按指数衰减 + 频谱变暗）。
    两侧用不同随机种子，去相关后才有宽度。
    """
    rng = np.random.default_rng(seed * 7919 + side)
    n = int(space["decay"] * SR)
    ir = np.zeros(n)

    # 直达声：轻微延迟，避免与干声完全同相
    ir[0] = 0.62

    # 早期反射：扩散尾之前的一串离散抽头
    pre = int(space["predelay"] / 1000.0 * SR)
    for i in range(space["taps"]):
        t = pre + int(rng.uniform(0.004, 0.075) * SR) + i * int(0.0037 * SR)
        if t < n:
            ir[t] += float(rng.uniform(0.35, 0.85)) * (0.93 ** i) * (1 if i % 2 == 0 else -1)

    # 扩散尾：白噪声 → 频谱变暗（1/f^damp，并做 6 kHz 以上滚降）→ 指数包络
    tail = rng.standard_normal(n).astype(np.float64)
    spec = np.fft.rfft(tail)
    freqs = np.fft.rfftfreq(n, 1.0 / SR) + 1.0
    shape = 1.0 / (freqs ** (0.55 * space["damp"]))
    shape *= 1.0 / (1.0 + (freqs / 6200.0) ** 2)
    tail = np.fft.irfft(spec * shape, n=n)

    env = np.exp(-np.arange(n) / (space["decay"] * SR / 3.2))
    env[:pre] = 0.0
    tail = tail * env
    # 尾巴整体压到直达声以下，避免把语音泡进糊里
    peak = np.max(np.abs(tail)) or 1.0
    ir += tail / peak * 0.42
    ir[:int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))

    # 能量归一，湿声比例才可控
    ir /= np.sqrt(np.sum(ir ** 2)) or 1.0
    return ir


# ----------------------------------------------------------------- 频响
def _shelf_and_peaks(sig, sr):
    """频域整体塑形：低频加厚 + 齿音收敛 + 极低频切除。

    一次性在频域乘上合成响应，比串多个 biquad 快，且相位一致性好。
    """
    n = len(sig)
    if n < 64:
        return sig
    spec = np.fft.rfft(sig)
    f = np.fft.rfftfreq(n, 1.0 / sr) + 1e-9

    # 70 Hz 以下切掉（去闷响与直流）
    hp = 1.0 / (1.0 + (72.0 / f) ** 4)
    # 160 Hz 附近 +2.6 dB：胸腔厚度，去掉"薄"
    peak_low = 1.0 + 0.34 * np.exp(-((np.log(f / 165.0)) ** 2) / (2 * 0.42 ** 2))
    # 3.2 kHz 附近 −2.4 dB：齿音与塑料感
    peak_hi = 1.0 - 0.26 * np.exp(-((np.log(f / 3250.0)) ** 2) / (2 * 0.30 ** 2))
    # 9 kHz 以上 +1.5 dB：补一点空气感（靠 48 k 混响尾巴托起来）
    air = 1.0 + 0.18 * (1.0 / (1.0 + (9000.0 / f) ** 4))

    return np.fft.irfft(spec * hp * peak_low * peak_hi * air, n=n)


def _soft_saturate(x, drive=1.25):
    """极轻的 tanh 饱和：把弱音托起来，听感更近，但不脏。"""
    return np.tanh(x * drive) / np.tanh(drive)


def _normalize(stereo):
    rms = np.sqrt(np.mean(stereo ** 2)) or 1.0
    stereo = stereo * (TARGET_RMS / rms)
    peak = np.max(np.abs(stereo))
    if peak > PEAK_CEIL:
        stereo = stereo * (PEAK_CEIL / peak)
    return stereo


# --------------------------------------------------------------- 主入口
def process_file(src, dst, material, seed):
    dry = decode(src)
    if dry is None or len(dry) < 512:
        return False
    space = SPACE.get(material, DEFAULT_SPACE)
    seed = abs(int(seed)) % 100000

    dry = _shelf_and_peaks(dry, SR)
    dry = dry / (np.max(np.abs(dry)) or 1.0)

    # 卷积混响：左右用不同 IR，得到自然的宽度
    outs = []
    for side in (0, 1):
        ir = make_ir(space, seed, side)
        n = len(dry) + len(ir) - 1
        nfft = 1 << (n - 1).bit_length()
        wet = np.fft.irfft(np.fft.rfft(dry, nfft) * np.fft.rfft(ir, nfft), n=nfft)[:len(dry)]
        w = space["wet"]
        outs.append((1.0 - w * 0.45) * dry + w * wet * 2.2)

    stereo = np.vstack(outs)
    # 尾巴自然收掉，避免结尾被硬切
    fade = int(0.12 * SR)
    if len(stereo[0]) > fade * 2:
        ramp = np.linspace(1, 0, fade)
        stereo[:, -fade:] *= ramp
    stereo = np.vstack([_soft_saturate(c) for c in stereo])
    stereo = _normalize(stereo)
    return encode(stereo, dst)


def material_of(primary):
    """data.js 里的 primary 可能带后缀，做一次宽松映射。"""
    p = str(primary or "").lower()
    for k in SPACE:
        if k in p:
            return k
    if "瓷" in str(primary or ""):
        return "ceramic"
    if "玉" in str(primary or ""):
        return "jade"
    if "金" in str(primary or "") or "银" in str(primary or ""):
        return "gold"
    if "石" in str(primary or ""):
        return "stone"
    if "画" in str(primary or "") or "书" in str(primary or ""):
        return "painting"
    if "木" in str(primary or ""):
        return "wood"
    if "铜" in str(primary or ""):
        return "bronze"
    return ""


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("用法: python tools/voice_dsp.py <src.mp3> <dst.mp3> <material> [seed]")
        sys.exit(1)
    ok = process_file(sys.argv[1], sys.argv[2], sys.argv[3],
                      int(sys.argv[4]) if len(sys.argv) > 4 else 1)
    print("ok" if ok else "fail")
