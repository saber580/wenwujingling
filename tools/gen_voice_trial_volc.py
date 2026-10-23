# -*- coding: utf-8 -*-
"""豆包声线试听 · 火山引擎「豆包语音合成2.0」角色音色候选(12 款,热血/少年向)+ 试听页。

依赖:无,只用 Python 标准库(无需 requests)
凭据:在 tools 目录下新建 volc_key.txt,以下两种任选其一(# 开头为注释):
      新版控制台(推荐):  api_key=你的APIKey
      旧版控制台:        app_id=123456789
                         access_token=你的AccessToken
获取:火山引擎控制台 console.volcengine.com -> 豆包语音 -> 开通「豆包语音合成大模型2.0」
     (新用户一般有免费试用额度)-> 在 API Key 管理 / API服务中心 复制密钥。

用法:
    python tools/gen_voice_trial_volc.py            生成整套试听(联网)
    python tools/gen_voice_trial_volc.py --check    只合成一小句,验证密钥与语气指令
产物:配音试听-豆包/*.mp3 + index.html(生成后本地播放,不联网)
"""
import base64, json, os, sys, urllib.error, urllib.request, uuid

try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYFILE = os.path.join(ROOT, u"tools", u"volc_key.txt")
OUT = os.path.join(ROOT, u"配音试听-豆包")
URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse"

# 与微软那版试听同一句台词,方便横向对比
TEXT = (u"我先来!我叫玉坠,一块温润的美石,在土里睡了两千年。"
        u"你们知道吗?汉代人过年可有讲究——天不亮就喝屠苏酒,先敬祖先,再分给儿孙。")

# 热血系语气指令(仅 2.0 音色支持;不额外计费)
STYLE_HOT = u"你可以用动漫热血主角那种燃的语气来说吗?"

# (编号, 文件名, 屏显名, 说明, speaker, resource, 语气指令)
CANDIDATES = [
    (1,  u"01 爽朗少年",  u"爽朗少年(Saturn)",  u"动漫热血少年,首选",                u"saturn_zh_male_shuanglangshaonian_tob",        u"seed-tts-2.0", STYLE_HOT),
    (2,  u"02 少年梓辛",  u"少年梓辛 2.0",      u"少年主角,亮而脆",                  u"zh_male_shaonianzixin_uranus_bigtts",          u"seed-tts-2.0", STYLE_HOT),
    (3,  u"03 天才同桌",  u"天才同桌(Saturn)",  u"清爽少年,校园主角感",               u"saturn_zh_male_tiancaitongzhuo_tob",           u"seed-tts-2.0", STYLE_HOT),
    (4,  u"04 小天",      u"小天 2.0",          u"青年男声,有活力",                   u"zh_male_taocheng_uranus_bigtts",               u"seed-tts-2.0", STYLE_HOT),
    (5,  u"05 刘飞",      u"刘飞 2.0",          u"情绪表现力强,燃得起来",              u"zh_male_liufei_uranus_bigtts",                 u"seed-tts-2.0", STYLE_HOT),
    (6,  u"06 阳光青年",  u"阳光青年",          u"阳光热血(1.0,需另开通)",            u"zh_male_yangguangqingnian_emo_v2_mars_bigtts", u"seed-tts-1.0", None),
    (7,  u"07 擎苍",      u"擎苍",              u"燃向厚嗓,有声书腔(1.0,需另开通)",    u"BV701_streaming",                              u"seed-tts-1.0", None),
    (8,  u"08 云舟",      u"云舟 2.0",          u"沉稳青年,大哥/旁白(对比组)",         u"zh_male_m191_uranus_bigtts",                   u"seed-tts-2.0", None),
    (9,  u"09 儒雅逸辰",  u"儒雅逸辰 2.0",      u"文雅青年,文戏(对比组)",              u"zh_male_ruyayichen_uranus_bigtts",             u"seed-tts-2.0", None),
    (10, u"10 爽快思思",  u"爽快思思 2.0",      u"爽快女声(女角基准)",                u"zh_female_shuangkuaisisi_uranus_bigtts",       u"seed-tts-2.0", None),
    (11, u"11 撒娇学妹",  u"撒娇学妹 2.0",      u"娇俏少女(女角)",                    u"zh_female_sajiaoxuemei_uranus_bigtts",         u"seed-tts-2.0", None),
    (12, u"12 调皮公主",  u"调皮公主(Saturn)",  u"古灵精怪(女角)",                    u"saturn_zh_female_tiaopigongzhu_tob",           u"seed-tts-2.0", None),
]

HELP = u"""[!] 还没找到 tools/volc_key.txt —— 批量生成需要你火山引擎账号的密钥
    (生成会走你账号的试用额度/计费,所以我没法代劳注册)。三步就好:
    1) 打开 https://console.volcengine.com/ 注册/登录(支持抖音扫码),按提示完成实名认证
    2) 进入「豆包语音」控制台,开通「豆包语音合成大模型2.0」(新用户一般有免费试用额度)
    3) 在「API Key 管理」处创建并复制 API Key,然后新建 tools/volc_key.txt 写入:
         api_key=你的APIKey
        (若你用的是旧版控制台,则写 app_id= 和 access_token= 两行)
    写好后重新运行本脚本即可;也可以直接把 Key 发我,我来填。
"""


def load_conf():
    if not os.path.isfile(KEYFILE):
        return None
    conf, bare = {}, []
    with open(KEYFILE, "r", encoding="utf-8-sig") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith(u"#"):
                continue
            if u"=" not in line:
                bare.append(line)
                continue
            k, v = line.split(u"=", 1)
            conf[k.strip().lower()] = v.strip().strip(u'"').strip(u"'")
    # 兼容:直接贴了一整行密钥、没有 api_key= 前缀
    if not conf and len(bare) == 1 and len(bare[0]) >= 16:
        conf["api_key"] = bare[0]
    if conf.get("api_key") or (conf.get("app_id") and conf.get("access_token")):
        return conf
    return {}


def build_headers(conf):
    h = {
        "Content-Type": "application/json",
        "X-Api-Request-Id": str(uuid.uuid4()),
        "X-Api-Resource-Id": u"seed-tts-2.0",
    }
    if conf.get("api_key"):
        h["X-Api-Key"] = conf["api_key"]
    else:
        h["X-Api-App-Id"] = conf["app_id"]
        h["X-Api-Access-Key"] = conf["access_token"]
        h["X-Api-App-Key"] = conf["app_id"]  # 兼容部分旧文档的头部写法
    return h


def synthesize(text, speaker, resource, conf, style=None, style_as_string=True):
    """走 SSE 单向流式接口,返回 mp3 字节(纯标准库实现)。"""
    headers = build_headers(conf)
    headers["X-Api-Resource-Id"] = resource
    req_params = {
        "text": text,
        "speaker": speaker,
        "audio_params": {"format": "mp3", "sample_rate": 24000},
    }
    if style:
        additions = {"context_texts": [style]}
        req_params["additions"] = json.dumps(additions, ensure_ascii=False) if style_as_string else additions
    payload = {"user": {"uid": "wenwu-jingling-demo"}, "req_params": req_params}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        detail = e.read(400).decode("utf-8", "replace")
        raise RuntimeError(u"HTTP %s: %s" % (e.code, detail))
    chunks = []
    event = None
    with resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8", "replace").strip()
            if not line:
                continue
            if line.startswith("event:"):
                event = line[6:].strip()
                continue
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            try:
                obj = json.loads(raw)
            except Exception:
                continue
            code = obj.get("code")
            data = obj.get("data")
            if isinstance(data, str) and data and event in (None, u"352"):
                try:
                    chunks.append(base64.b64decode(data))
                except Exception:
                    pass
            if code == 20000000:
                break
            if code not in (0, None) and code != 20000000:
                raise RuntimeError(u"code=%s msg=%s" % (code, obj.get("message")))
    audio = b"".join(chunks)
    if len(audio) < 512:
        raise RuntimeError(u"没收到有效音频(仅 %d 字节)" % len(audio))
    return audio


def build_page(results, styled):
    rows = []
    for no, fn, label, desc, speaker, resource, style in CANDIDATES:
        if results.get(no):
            extra = u""
            if style and styled.get(no):
                extra = u" · 已加燃向语气"
            elif style:
                extra = u" · 原声(语气指令未生效)"
            rows.append(
                u'<div class="row"><div class="no">%d</div>'
                u'<div class="mid"><b>%s</b><small>%s · %s%s</small></div>'
                u'<audio controls preload="metadata" src="%s.mp3"></audio></div>' % (no, label, desc, speaker, extra, fn))
        else:
            rows.append(
                u'<div class="row"><div class="no">%d</div>'
                u'<div class="mid"><b>%s</b><small>%s · 未生成(该音色可能未授权或未开通)</small></div></div>' % (no, label, desc))
    page = u"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配音试听 · 豆包声线候选</title>
<style>
body{margin:0;padding:34px 16px 46px;background:#f6efe2;color:#3a3128;font:15px/1.8 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
h1{text-align:center;font-size:22px;letter-spacing:2px;color:#8a1f10;margin:0 0 8px}
.sub{text-align:center;color:#8a6a45;font-size:13px;margin:0 0 20px}
.poem{max-width:660px;margin:0 auto 18px;background:#fffdf6;border:1px dashed rgba(160,110,60,.45);border-radius:12px;padding:12px 18px;color:#6b5a44;font-size:13.5px}
.poem b{color:#8a1f10;font-weight:600}
.row{max-width:660px;margin:0 auto 12px;background:#fffdf6;border:1px solid rgba(160,110,60,.3);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:14px;box-shadow:0 4px 14px rgba(96,54,22,.08)}
.no{flex:none;width:34px;height:34px;border-radius:50%;background:#8a1f10;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
.mid{flex:1 1 auto;min-width:0}
.mid b{display:block;font-size:14.5px;color:#8a1f10}
.mid small{display:block;color:#8a6a45;font-size:12px;line-height:1.6}
audio{flex:none;width:250px;height:38px}
.tip{max-width:660px;margin:22px auto 0;color:#8a6a45;font-size:12.5px;text-align:center;line-height:1.9}
@media(max-width:560px){.row{flex-wrap:wrap}audio{width:100%}}
</style></head><body>
<h1>配音试听 · 豆包声线候选</h1>
<div class="sub">火山引擎「豆包语音合成2.0」音色,主攻 动漫热血/少年 方向;同一句台词,可与上一版(微软试听)横向对比</div>
<div class="poem">试听台词:<b>__POEM__</b></div>
__ROWS__
<div class="tip">挑好后回一句话「用 X 号」即可;<br>标「1.0,需另开通」的两条如果没生成,是 1.0 服务没开通;别的没生成多半是音色未授权,回我一声我来调。</div>
</body></html>
"""
    return page.replace(u"__POEM__", TEXT).replace(u"__ROWS__", u"\n".join(rows))


def main():
    conf = load_conf()
    if conf is None:
        print(HELP)
        return 0
    if not conf:
        print(u"[!] volc_key.txt 内容不完整,需要 api_key= 一行,或 app_id= / access_token= 两行")
        return 0

    if u"--check" in sys.argv[1:]:
        no, fn, label, desc, speaker, resource, style = CANDIDATES[0]
        probe_text = u"我先来!我叫玉坠,一块温润的美石,在土里睡了两千年。"
        print(u"[check] 用第 1 款音色(%s)合成一小句,验证密钥与语气指令..." % label)
        attempts = []
        if style:
            attempts.append((u"语气指令=字符串式", style, True))
            attempts.append((u"语气指令=对象式", style, False))
        attempts.append((u"不带语气指令", None, True))
        done = False
        for tag, st, as_str in attempts:
            try:
                audio = synthesize(probe_text, speaker, resource, conf, st, style_as_string=as_str)
            except Exception as e:
                print(u"[check] %s 失败: %s" % (tag, e))
                continue
            print(u"[check] 成功(成功方式:%s),拿到 %d 字节音频,密钥可用!" % (tag, len(audio)))
            done = True
            break
        if not done:
            print(u"[check] 全都失败,请检查密钥/开通状态")
        return 0

    os.makedirs(OUT, exist_ok=True)
    ok_map, styled_map, fails = {}, {}, []
    for no, fn, label, desc, speaker, resource, style in CANDIDATES:
        out = os.path.join(OUT, fn + u".mp3")
        if os.path.isfile(out) and os.path.getsize(out) > 1024:
            print(u"[skip] %s" % fn)
            ok_map[no] = True
            if style:
                styled_map[no] = True
            continue
        audio, err, used_style = None, None, False
        for attempt in (1, 2):
            try:
                audio = synthesize(TEXT, speaker, resource, conf, style)
                used_style = bool(style)
                break
            except Exception as e:
                err = e
        if audio is None and style:
            # 个别音色可能拒绝语气指令,退回原声再试
            try:
                audio = synthesize(TEXT, speaker, resource, conf, None)
                err = None
                print(u"[warn] %s 语气指令未生效,已用原声生成" % fn)
            except Exception as e:
                err = e
        if audio:
            with open(out, "wb") as f:
                f.write(audio)
            ok_map[no] = True
            if used_style:
                styled_map[no] = True
            print(u"[ok] %s  %.0f KB" % (fn, len(audio) / 1024.0))
        else:
            fails.append((fn, err))
            print(u"[fail] %s -> %s" % (fn, err))

    with open(os.path.join(OUT, u"index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(build_page(ok_map, styled_map))
    print(u"[page] %s" % os.path.join(OUT, u"index.html"))
    print(u"[done] 成功 %d / %d" % (len(ok_map), len(CANDIDATES)))
    if fails:
        print(u"[hint] 失败常见原因:该音色未授权(控制台开通/试用对应服务)、密钥或资源版本不匹配")
    return 0


if __name__ == "__main__":
    sys.exit(main())
