# -*- coding: utf-8 -*-
"""文物精灵 · AI 云端小桥(本机运行,密钥不出本机)

页面「AI 文物识别」上传照片后,会把照片提交到这个小桥;
小桥再转交给云端视觉大模型(智谱 GLM-4V · 免费 / 火山方舟 · 豆包视觉,按钥匙格式自动分流),
拿回「名字 / 年代 / 材质 / 出处 / 来历 / 看点」,送回页面最上方显示。
页面「AI 精灵茶话会」的云端真聊也走这个小桥(POST /api/chat,同一把密钥),
由云端大模型现场为精灵们写每一幕对话;云端连不上时,页面会自动退回本机台词库,不影响演示。
页面「打卡拍照」的 AI 幻化走 /api/imagine(智谱免费链:GLM-4V 看图写词 → CogView-3-Flash 出图,
小桥替页面把成品图下载成 base64 回传,便于离线存档;失败时页面自动回退本机国风艺术化)。
页面顶栏「👤 登录 / 注册」走 /api/login 与 /api/reg:账号文件存在当前用户目录(~/.wwjl_accounts.json),
密码只存 PBKDF2 加盐哈希(不落明文);演示账号内置在代码里的也只是一个哈希。
登录成功后 AI 仍用本桥配置的钥匙 —— 访客登录即可用,无需自己申请 API。

配置(两种方式,随便哪种;推荐环境变量 —— 密钥不落盘、不进仓库):
  ① 环境变量(比赛提交要求的方式):
       setx ARK_API_KEY "ark-..."   (Win 一次性,重开终端生效;或 set 当前窗口临时)
       智谱 Key 用 ZHIPU_API_KEY;两者通用别名 IDENT_API_KEY;选填 IDENT_MODEL 指定模型
  ② 本文件同目录的 ident_key.txt(已是模板,直接粘 Key 即可;优先级低于环境变量):
       第 1 个非注释行:API Key(必填;智谱形如 id.secret,方舟形如 ark-…)
       第 2 个非注释行:模型(选填;留空时自动挑一个免费/已开通的模型,
                        方舟也可填接入点 ep-xxxxxxxx;只有 1 个点号的 Key 按智谱处理)

运行:
  python tools/ident_cloud.py          (默认端口 8898)
  python tools/ident_cloud.py 9000     (自定义端口;页面默认连 8898)
  局域网聚会:小桥监听所有网卡,同一 WiFi 的手机 / 平板也能用它(首次弹窗请点「允许访问」);
             配套双击 tools\start_lan.bat 可一键同时开「小桥 + 网页服务」,并打印可分享的局域网网址

提示:智谱免费模型(glm-4.6v-flash / glm-4.7-flash / cogview-3-flash)无需充值;
方舟账号没开通视觉模型时会回 404 InvalidEndpointOrModel,去控制台「开通管理」开通后重试即可。
"""
import base64, hashlib, json, os, re, secrets, socket, sys, time, urllib.error, urllib.request
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(ROOT, "ident_key.txt")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8898

# 开机自启用的是 pythonw(无窗口),没有控制台:print 会直接崩。
# 这时把日志写进 tools/bridge.log —— 也给「怎么又掉线」留下排查证据。
if sys.stdout is None or sys.stderr is None:
    try:
        _log = open(os.path.join(ROOT, "bridge.log"), "a", encoding="utf-8", buffering=1)
        if sys.stdout is None: sys.stdout = _log
        if sys.stderr is None: sys.stderr = _log
    except Exception:
        class _Nul:
            def write(self, *a): return 0
            def flush(self): pass
        if sys.stdout is None: sys.stdout = _Nul()
        if sys.stderr is None: sys.stderr = _Nul()

# 出站一律直连,不走系统代理 —— 电脑上的代理软件(VPN/加速器)关掉或抽风时,小桥照样能连智谱
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# ---- 登录 / 注册:账号文件在用户目录(不进项目、不进提交包),密码只存 PBKDF2 加盐哈希 ----
ACCOUNTS_FILE = os.path.join(os.path.expanduser("~"), ".wwjl_accounts.json")
DEMO_EMAIL = "2502887269@qq.com"
DEMO_SALT = "ae5b5677f6b6cfeebaca5f46"
DEMO_PWD_HASH = "a05922fe399c61d205fd5e046ed2d947a826bfe172c53680fa58e316c638a1e1"   # 演示账号:代码里只有哈希,没有明文口令
TOKENS = {}
ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
ZHIPU_IMG_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations"

# 智谱免费模型三件套(与 js/app.js 直连模式清单一致;新的打头,限流时自动换下一个)
ZHIPU_VIS_MODELS = ["glm-4.6v-flash", "glm-4v-flash"]
ZHIPU_CHAT_MODELS = ["glm-4.7-flash", "glm-4-flash"]
ZHIPU_IMG_MODEL = "cogview-3-flash"

# 挨个尝试,用第一个「已开通、能调通」的模型(与 js/app.js 直连模式的清单保持一致)
ARK_MODELS = [
    "doubao-seed-2-1-lite-260915",
    "doubao-seed-2-1-pro-260915",
    "doubao-seed-evolving",
    "doubao-seed-1-8-251228",
    "doubao-seed-1-8",
    "doubao-seed-2-1-lite",
    "doubao-seed-2-0-lite-260428",
    "doubao-seed-2-0-lite",
    "doubao-seed-2-0-pro-260428",
    "doubao-seed-2-0-flash-260428",
    "doubao-seed-2-0-260428",
    "doubao-seed-1-6-vision-250815",
    "doubao-seed-1-6-250615",
    "doubao-seed-1-6-flash-250615",
    "doubao-1-5-vision-pro-32k-250115",
    "doubao-1-5-vision-pro-250328",
    "doubao-1-5-vision-lite-32k-250315",
    "doubao-vision-pro-32k-241028",
    "doubao-1-5-thinking-vision-pro-250428",
]
GOOD_VIS = {"model": ""}    # 识别链调通过一次的模型记在这里,下次优先用
GOOD_CHAT = {"model": ""}   # 茶话会链单独记(免得聊天模型被拿去识别)
RUNTIME = {"key": "", "model": ""}   # 页面「粘贴密钥」推来的临时钥匙(只存内存,重启小桥即忘)

PROMPT = (
    "你是「文物精灵」App 里的中国文物鉴定助手。请根据这张照片识别文物(只认中国文物),"
    "只输出一个 JSON 对象(不要代码块、不要多余文字):"
    '{"name":"名称(常见别名放括号里)","era":"年代(朝代+大致公元;拿不准用「约」)","material":"材质类别(如 青铜器 / 白瓷 / 玉器 / 石刻 / 书画 / 陶器)","origin":"出土或收藏出处(不确定写「待考」,不编造)","history":"来历与历史 90~160 字:它是什么、哪个朝代、为什么重要、有什么故事","feature":"一眼看点:教参观者该看什么(一句话)","confidence":"高/中/低"}'
    "。若照片里明显不是文物,name 写「未识别到文物」,并在 history 里说明看到了什么。"
)

def load_cfg():
    """密钥优先级:环境变量 > ident_key.txt(比赛提交要求:密钥用环境变量配置,不进仓库)。

    环境变量(小桥和 CI / 无文件部署都适用):
      ARK_API_KEY    火山方舟 Key(ark- 开头)      ZHIPU_API_KEY  智谱 Key(id.secret)
      IDENT_API_KEY  上面两个的通用别名            IDENT_MODEL    选填:指定模型名 / ep- 接入点
    """
    key, model = "", ""
    # ① 环境变量优先(密钥不落盘)
    for name in ("ARK_API_KEY", "ZHIPU_API_KEY", "IDENT_API_KEY"):
        k = (os.environ.get(name) or "").strip()
        if k:
            key = k
            break
    m2 = (os.environ.get("IDENT_MODEL") or "").strip()
    if m2:
        model = m2
    # ② 再读本机文件(没配环境变量时)
    if not key or not model:
        lines = []
        if os.path.exists(KEY_FILE):
            try:
                lines = open(KEY_FILE, encoding="utf-8-sig").read().splitlines()
            except Exception:
                lines = []
        lines = [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]
        if not key and lines:
            key = lines[0]
        if not model and len(lines) > 1:
            model = lines[1]
    # ③ 页面刚推来的临时钥匙(粘贴即生效;重启小桥后回到环境变量 / 文件)
    if RUNTIME["key"]:
        key = RUNTIME["key"]
        model = RUNTIME["model"] or model
    provider = ("zhipu" if key.count(".") == 1 else "ark") if key else ""
    return key, model, provider

def _key_ok(k):
    """钥匙格式粗校验:智谱 id.secret(一个点号)或方舟 ark- 开头,都要求够长"""
    k = (k or "").strip()
    return (k.startswith("ark-") and len(k) >= 30) or (k.count(".") == 1 and len(k) >= 30)

# ---- 登录 / 注册:演示级账号体系(账号落小桥电脑;密码 PBKDF2 加盐;令牌只在内存) ----
def _pwd_hash(pwd, salt_hex):
    return hashlib.pbkdf2_hmac("sha256", (pwd or "").encode("utf-8"), bytes.fromhex(salt_hex or ""), 80000).hex()

def _accounts_load():
    try:
        with open(ACCOUNTS_FILE, "r", encoding="utf-8") as fh:
            d = json.load(fh)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

def _accounts_save(d):
    try:
        with open(ACCOUNTS_FILE, "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, indent=1)
    except Exception:
        pass

def _email_ok(s):
    return bool(re.match(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[A-Za-z]{2,10}$", s or ""))

def _auth_token(email):
    t = secrets.token_hex(16)
    TOKENS[t] = email
    return t

def _auth_login(email, pwd):
    email = (email or "").strip().lower()
    rec = _accounts_load().get(email)
    if not rec and email == DEMO_EMAIL:
        rec = {"salt": DEMO_SALT, "hash": DEMO_PWD_HASH}
    if not rec or _pwd_hash(pwd, rec.get("salt", "")) != rec.get("hash"):
        return {"ok": False, "error": "邮箱或密码不对"}
    return {"ok": True, "email": email, "token": _auth_token(email)}

def _auth_reg(email, pwd):
    email = (email or "").strip().lower()
    if not _email_ok(email):
        return {"ok": False, "error": "邮箱格式不对"}
    if len(pwd or "") < 8:
        return {"ok": False, "error": "密码至少 8 位"}
    d = _accounts_load()
    if email in d or email == DEMO_EMAIL:
        return {"ok": False, "error": "这个邮箱已经注册过了,直接登录即可"}
    salt = secrets.token_hex(12)
    d[email] = {"salt": salt, "hash": _pwd_hash(pwd, salt), "ts": int(time.time())}
    _accounts_save(d)
    return {"ok": True, "email": email, "token": _auth_token(email)}

def _try_once(image, key, model, provider):
    url = ZHIPU_URL if provider == "zhipu" else ARK_URL

    def send(thinking_off):
        body = {
            "model": model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url", "image_url": {"url": image}},
            ]}],
            "temperature": 0.2,
            "max_tokens": 1000,   # 智谱免费款上限 1024:统一压到 1000 保险
        }
        if thinking_off and provider == "zhipu":
            body["thinking"] = {"type": "disabled"}   # 关掉思维链:直接给正文,识别又快又稳
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
        )
        with _OPENER.open(req, timeout=75) as r:
            return json.loads(r.read().decode("utf-8"))

    try:
        payload = send(True)
    except urllib.error.HTTPError as e:
        if provider != "zhipu" or e.code != 400:
            raise   # 原样交给 call_cloud(不读 body,保住 404 等细节)
        detail = ""
        try:
            detail = e.read().decode("utf-8")[:300]
        except Exception:
            pass
        if "thinking" in detail.lower():
            payload = send(False)   # 该模型不认思维开关:去掉重试一次
        else:
            raise RuntimeError("云端接口报错 %s:%s" % (e.code, detail))
    msg = payload["choices"][0]["message"]
    text = msg.get("content") or msg.get("reasoning_content") or ""
    if isinstance(text, list):   # 兼容 content 为数组的返回格式
        text = "".join(part.get("text", "") for part in text)
    m = re.search(r"\{[\s\S]*\}", text or "")
    if not m:
        raise ValueError("模型没返回 JSON:" + (text or "")[:100])
    return json.loads(m.group(0))

def call_cloud(image, key, model, provider):
    cands = []
    for m in ([model] if model else []) + ([GOOD_VIS["model"]] if GOOD_VIS["model"] else []) + (
            (ZHIPU_VIS_MODELS if provider == "zhipu" else ARK_MODELS)):
        m = (m or "").strip()
        if m and m not in cands:
            cands.append(m)
    last = ""
    for m in cands:
        try:
            data = _try_once(image, key, m, provider)
            GOOD_VIS["model"] = m
            return data, m
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:300]
            except Exception:
                pass
            last = "%s:%s" % (e.code, detail)
            if provider == "zhipu" and e.code in (400, 403, 404, 429):
                continue    # 参数兼容差异 / 免费模型挤爆 / 该模型没开放:换下一个
            if e.code == 404 and ("InvalidEndpointOrModel" in detail or "not found" in detail.lower()):
                continue    # 这个模型没开通:换下一个
            raise RuntimeError("云端接口报错 %s:%s" % (e.code, detail))
        except Exception as e:
            last = str(e)[:200]
            continue        # 模型抽风(没给 JSON / 被截断):换下一个再试
    if provider == "zhipu":
        raise RuntimeError("智谱接口没调通(检查 Key 与模型名)。最后一条:%s" % last)
    raise RuntimeError(
        "账号里还没有可用的视觉模型 —— 去火山方舟控制台「开通管理」开通任一豆包视觉模型(有免费额度),"
        "开通后直接点重试,不用改任何配置。最后一条:%s" % last)

def _chat_post(msgs, key, model, provider, temperature, max_tokens, thinking):
    url = ZHIPU_URL if provider == "zhipu" else ARK_URL
    body = {
        "model": model,
        "messages": msgs,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if thinking:
        body["thinking"] = {"type": "disabled"}   # 茶话会要的是即兴对白:关掉思维链,几秒出稿
    req = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    with _OPENER.open(req, timeout=75) as r:
        payload = json.loads(r.read().decode("utf-8"))
    msg = payload["choices"][0]["message"]
    text = msg.get("content") or msg.get("reasoning_content") or ""
    if isinstance(text, list):   # 兼容 content 为数组的返回格式
        text = "".join(part.get("text", "") for part in text)
    text = str(text or "").strip()
    if not text:
        raise ValueError("模型没返回内容")
    return text

# ---- 抗掉线:① 内存缓存(同样的话不再重复打 API,从根上减少限流) ----
_CHAT_CACHE = {}
_CACHE_TTL = 900.0          # 15 分钟内同样的问题直接复用
_CACHE_MAX = 240

def _cache_key(msgs, temperature, max_tokens):
    raw = json.dumps([msgs, round(float(temperature or 0), 2), int(max_tokens or 0)],
                     ensure_ascii=False, sort_keys=True)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()

def _cache_get(k):
    hit = _CHAT_CACHE.get(k)
    if not hit: return None
    if time.time() - hit[0] > _CACHE_TTL:
        try: del _CHAT_CACHE[k]
        except Exception: pass
        return None
    return hit

def _cache_put(k, text, model):
    if len(_CHAT_CACHE) > _CACHE_MAX:
        try: _CHAT_CACHE.clear()
        except Exception: pass
    _CHAT_CACHE[k] = (time.time(), text, model)

# ---- 抗掉线:② 失败退避重试(429 限流 / 5xx / 网络抖动先等一下再来) ----
def _retry_post(msgs, key, model, provider, temperature, max_tokens, tries=3):
    last = ""
    for i in range(tries):
        try:
            return _chat_post(msgs, key, model, provider, temperature, max_tokens, True)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "ignore")[:300]
            except Exception:
                pass
            last = "%s:%s" % (e.code, detail)
            if e.code == 400 and "thinking" in detail.lower():
                return _chat_post(msgs, key, model, provider, temperature, max_tokens, False)
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(1.6 * (i + 1))
                continue
            raise RuntimeError("云端接口报错 %s:%s" % (e.code, detail))
        except Exception as e:
            last = str(e)[:200]
            if i < tries - 1:
                time.sleep(1.4 * (i + 1))
                continue
            raise RuntimeError("云端连接失败:%s" % last)
    raise RuntimeError("云端连接失败:%s" % last)

def _chat_once(msgs, key, model, provider, temperature, max_tokens):
    return _retry_post(msgs, key, model, provider, temperature, max_tokens)

def call_chat(msgs, temperature, max_tokens, key, model, provider):
    """茶话会真聊:把页面带来的对话消息转交云端大模型,拿回一段文字。
    抗掉线三件套:内存缓存 → 多模型依次尝试 → 每个模型内部退避重试。"""
    ck = _cache_key(msgs, temperature, max_tokens)
    hit = _cache_get(ck)
    if hit:
        return hit[1], hit[2] + "·缓存"
    cands = []
    for m in ([model] if model else []) + ([GOOD_CHAT["model"]] if GOOD_CHAT["model"] else []) + (
            (ZHIPU_CHAT_MODELS if provider == "zhipu" else ARK_MODELS)):
        m = (m or "").strip()
        if m and m not in cands:
            cands.append(m)
    last = ""
    for m in cands:
        try:
            text = _chat_once(msgs, key, m, provider, temperature, max_tokens)
            GOOD_CHAT["model"] = m
            _cache_put(ck, text, m)
            return text, m
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:300]
            except Exception:
                pass
            last = "%s:%s" % (e.code, detail)
            if provider == "zhipu" and e.code in (400, 403, 404, 429):
                continue    # 参数兼容差异 / 免费模型挤爆 / 该模型没开放:换下一个
            if e.code == 404 and ("InvalidEndpointOrModel" in detail or "not found" in detail.lower()):
                continue    # 这个模型没开通:换下一个
            raise RuntimeError("云端接口报错 %s:%s" % (e.code, detail))
        except Exception as e:
            last = str(e)[:200]
            continue        # 模型抽风(空回复 / 被截断):换下一个再试
    if provider == "zhipu":
        raise RuntimeError("智谱接口没调通(检查 Key 与模型名)。最后一条:%s" % last)
    raise RuntimeError(
        "账号里还没有可用的对话模型 —— 去火山方舟控制台「开通管理」开通任一豆包模型(有免费额度),"
        "开通后直接重试,不用改任何配置。最后一条:%s" % last)

IMAGINE_ASK = ("照片里是一件中国文物。忽略照片中的人物、版式、背景、文字与水印,只看文物本身:"
               "用 30~60 个字描述它的造型、颜色、材质和最醒目的特征,作为一句「Q版游戏立绘主角」提示词的素材;"
               "只输出这一句,不要解释。")
IMAGINE_TAIL = ("。画成 Q 版游戏精灵立绘:圆润夸张的大头可爱比例,大眼睛与拟人小表情,厚涂国风插画质感,"
                "清晰描边,米白纯色背景,居中全身,画面里只有它一个角色,没有人物、没有文字、没有水印")

def imagine_cloud(image, desc, key, provider):
    """拍照幻化(智谱免费链):GLM-4V 看图写词 → CogView-3-Flash 出图 → 下载转 base64。
    返回 (dataURL, 模型名);页面负责裁掉右下角「AI生成」角标并压缩。"""
    if provider != "zhipu":
        raise RuntimeError("小桥的 AI 幻化走智谱免费出图;方舟钥匙请在页面上直连 Seedream(或换一把智谱钥匙)")
    subject = ""
    last = ""
    for m in ZHIPU_VIS_MODELS:
        try:
            subject = _chat_post(
                [{"role": "user", "content": [
                    {"type": "text", "text": IMAGINE_ASK},
                    {"type": "image_url", "image_url": {"url": image}},
                ]}],
                key, m, "zhipu", 0.5, 220, False)
            if subject:
                break
        except Exception as e:
            last = "%s" % str(e)[:80]
            continue
    if not subject:
        subject = (desc or "").strip()[:140]
    if not subject:
        raise RuntimeError("没能读出照片里的文物特征(云端视觉空结果);最后一条:%s" % last)
    subject = subject.strip().splitlines()[0][:160]
    body = {"model": ZHIPU_IMG_MODEL, "prompt": subject + IMAGINE_TAIL, "size": "1024x1024"}
    req = urllib.request.Request(
        ZHIPU_IMG_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
    )
    with _OPENER.open(req, timeout=150) as r:
        j = json.loads(r.read().decode("utf-8"))
    url = (((j.get("data") or [{}])[0]) or {}).get("url") or ""
    if not url:
        raise RuntimeError("出图接口没返回图片")
    with _OPENER.open(url, timeout=60) as r2:
        raw = r2.read()
    if not raw:
        raise RuntimeError("成品图下载失败")
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii"), ZHIPU_IMG_MODEL

def _local_ips():
    """本机所有 IPv4 地址（用于判断请求来源是不是同一台机器）"""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    ips.add("127.0.0.1")
    return ips

class Handler(BaseHTTPRequestHandler):
    # ---- 同源策略：本机小桥只服务本机页面，不能让任意网站偷偷调用 ----
    # 允许：没有 Origin（curl / file:// 直连）、以及 localhost / 127.0.0.1 / 本机局域网 IP
    # 拒绝：其它任何带 Origin 的请求（外部网页借你的电脑去调大模型）
    LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]", "0.0.0.0"}

    def _origin_ok(self, origin):
        if not origin:
            return True                      # 无 Origin：命令行 / 本地直连，放行
        try:
            host = urlparse(origin).hostname or ""
        except Exception:
            return False
        host = host.lower()
        if host in self.LOCAL_HOSTS or host.startswith("192.168.") or host.startswith("10."):
            return True
        # 本机网卡上的其它 IP（同网调试用）
        try:
            if host in _local_ips():
                return True
        except Exception:
            pass
        return False

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if self._origin_ok(origin):
            self.send_header("Access-Control-Allow-Origin", origin or "*")
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _guard(self):
        """非本机来源直接 403，避免小桥被外部网页当免费大模型代理"""
        origin = self.headers.get("Origin", "")
        if origin and not self._origin_ok(origin):
            self._json({"ok": False, "error": "来源不被允许（小桥只服务本机页面）"}, 403)
            return False
        return True

    def _json(self, obj, code=200):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not self._guard():
            return
        if self.path.split("?")[0] == "/api/ping":
            key, model, provider = load_cfg()
            shown = GOOD_VIS["model"] or model or (
                ("自动候选 %d 个" % len(ARK_MODELS)) if provider == "ark" else ZHIPU_VIS_MODELS[0])
            self._json({"ok": True, "hasKey": bool(key), "provider": provider or "未配置", "model": shown})
        else:
            self._json({"ok": False, "error": "404"}, 404)

    def do_POST(self):
        if not self._guard():
            return
        path = self.path.split("?")[0]
        if path == "/api/login":
            self._auth(_auth_login)
            return
        if path == "/api/reg":
            self._auth(_auth_reg)
            return
        if path == "/api/chat":
            self._chat()
            return
        if path == "/api/imagine":
            self._imagine()
            return
        if path == "/api/setkey":
            self._setkey()
            return
        if path != "/api/identify":
            self._json({"ok": False, "error": "404"}, 404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8"))
            image = str(req.get("image") or "")
            if not image.startswith("data:image/") or len(image) > 8_000_000:
                self._json({"ok": False, "error": "照片数据不对劲"})
                return
            key, model, provider = load_cfg()
            if not key:
                self._json({"ok": False, "error": "还没配置密钥:把 AI 钥匙(智谱 id.secret 或 方舟 ark-)填进 tools/ident_key.txt,保存后重试即可(不用重启小桥)"})
                return
            data, used = call_cloud(image, key, model, provider)
            self._json({"ok": True, "data": data, "model": used})
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            self._json({"ok": False, "error": "云端接口报错 %s:%s" % (e.code, detail)})
        except Exception as e:
            self._json({"ok": False, "error": "%s" % e})

    def _setkey(self):
        """页面「粘贴密钥」推来的钥匙:只存内存(重启小桥即忘)、不进任何文件。
        这样拿到的是清过钥匙的提交包,现场点一次「粘贴密钥」,识别 / 茶话会 / 幻化立刻全通。"""
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8"))
            key = str(req.get("key") or "").strip()
            model = str(req.get("model") or "").strip()
            if not _key_ok(key):
                self._json({"ok": False, "error": "钥匙格式不对(智谱 id.secret / 方舟 ark- 都行)"})
                return
            if len(model) > 80 or "\n" in model:
                model = ""
            RUNTIME["key"] = key
            RUNTIME["model"] = model
            self._json({"ok": True, "hasKey": True, "provider": "zhipu" if key.count(".") == 1 else "ark"})
        except Exception:
            self._json({"ok": False, "error": "参数不对劲"})

    def _auth(self, fn):
        """登录 / 注册:页面交来 {email, password},成功返回 {ok, email, token}"""
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8"))
            self._json(fn(str(req.get("email") or ""), str(req.get("password") or "")))
        except Exception:
            self._json({"ok": False, "error": "参数不对劲"})

    def _chat(self):
        """茶话会真聊:页面把 {messages, temperature, max_tokens} 交过来,原样转给云端"""
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8"))
            msgs = req.get("messages")
            if not isinstance(msgs, list) or not msgs or len(msgs) > 8 or len(json.dumps(msgs, ensure_ascii=False)) > 30000:
                self._json({"ok": False, "error": "对话数据不对劲"})
                return
            try:
                temperature = max(0.0, min(1.2, float(req.get("temperature"))))
            except Exception:
                temperature = 0.85
            try:
                max_tokens = max(64, min(2000, int(req.get("max_tokens"))))
            except Exception:
                max_tokens = 1200
            key, model, provider = load_cfg()
            if provider == "zhipu":
                max_tokens = min(max_tokens, 1000)   # 智谱免费款上限 1024:留一点余量
            if not key:
                self._json({"ok": False, "error": "还没配置密钥:把 AI 钥匙(智谱 id.secret 或 方舟 ark-)填进 tools/ident_key.txt,保存后重试即可(不用重启小桥)"})
                return
            text, used = call_chat(msgs, temperature, max_tokens, key, model, provider)
            self._json({"ok": True, "text": text, "model": used})
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            self._json({"ok": False, "error": "云端接口报错 %s:%s" % (e.code, detail)})
        except Exception as e:
            self._json({"ok": False, "error": "%s" % e})

    def _imagine(self):
        """拍照幻化:页面把 {image, desc} 交过来,小桥用智谱免费链出图,回传 base64(页面负责裁角标与压缩)"""
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8"))
            image = str(req.get("image") or "")
            desc = str(req.get("desc") or "")[:300]
            if not image.startswith("data:image/") or len(image) > 8_000_000:
                self._json({"ok": False, "error": "照片数据不对劲"})
                return
            key, model, provider = load_cfg()
            if not key:
                self._json({"ok": False, "error": "还没配置密钥:把 Key 填进 tools/ident_key.txt(智谱 id.secret 即可),保存后重试"})
                return
            img, used = imagine_cloud(image, desc, key, provider)
            self._json({"ok": True, "image": img, "engine": "zhipu", "model": used})
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            self._json({"ok": False, "error": "出图接口报错 %s:%s" % (e.code, detail)})
        except Exception as e:
            self._json({"ok": False, "error": "%s" % e})

    def log_message(self, fmt, *args):
        sys.stdout.write("· " + (fmt % args) + "\n")

class Server(ThreadingHTTPServer):
    """守护线程 + 端口可复用:小桥崩了能立刻原地复活,重启也不会卡在「端口被占用」"""
    daemon_threads = True
    allow_reuse_address = True


def main():
    key, model, provider = load_cfg()
    src = ""
    if key:
        src = "环境变量" if any((os.environ.get(n) or "").strip() for n in ("ARK_API_KEY", "ZHIPU_API_KEY", "IDENT_API_KEY")) else "ident_key.txt"
    print("文物精灵 · AI 云端小桥(识别 /api/identify + 茶话会 /api/chat + 幻化 /api/imagine)")
    print("  端口:%d  模型:%s" % (PORT, model or ("自动候选 %d 个" % len(ARK_MODELS))))
    if key:
        print("  密钥:已从「%s」读取(平台:%s)" % (src, provider))
    else:
        print("  密钥:未配置 —— 可设环境变量 ARK_API_KEY,或把 API Key 写进 %s(保存即生效,不用重启)" % KEY_FILE)
    print("  页面会向 http://127.0.0.1:%d 提交照片 / 对话(同一 WiFi 的手机访问网页时,会自动换用你电脑的局域网 IP);Ctrl+C 退出" % PORT)
    print("  (小桥自带自动重启:万一卡死会自己爬起来,不用管它)")
    fail = 0
    while True:
        try:
            Server(("0.0.0.0", PORT), Handler).serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。")
            return
        except OSError as e:
            if getattr(e, "errno", None) in (10048, 98, 13):
                print("！端口 %d 起不来(%s)—— 说明已经有一个小桥在跑,无需重复启动。" % (PORT, e))
                return
            fail += 1
            print("！端口异常:%s,3 秒后重试…" % e)
        except Exception as e:
            fail += 1
            print("！小桥异常:%s —— 3 秒后自动重启…" % repr(e)[:160])
        if fail >= 12:
            print("连续失败太多,已停止自动重启。请检查网络 / 密钥配置。")
            return
        time.sleep(3)

if __name__ == "__main__":
    main()
